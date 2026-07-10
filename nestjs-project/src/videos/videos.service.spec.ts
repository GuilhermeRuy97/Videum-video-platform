import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import {
  NotVideoOwnerException,
  UploadAlreadyFinalizedException,
  UploadObjectMissingException,
  UploadSizeMismatchException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { CreateVideoDto } from './dto/create-video.dto';
import { Video } from './entities/video.entity';
import { VIDEO_PROCESSING_QUEUE } from './videos.constants';
import { VideosService } from './videos.service';

describe('VideosService', () => {
  let service: VideosService;
  const repoMock = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };
  const storageMock = {
    initiateMultipartUpload: jest.fn(),
    completeMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    getPresignedGetUrl: jest.fn(),
  };
  const queueMock = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repoMock.create.mockImplementation((v: Partial<Video>) => v);
    repoMock.save.mockImplementation((v: Video) => Promise.resolve(v));

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: repoMock },
        { provide: StorageService, useValue: storageMock },
        { provide: getQueueToken(VIDEO_PROCESSING_QUEUE), useValue: queueMock },
      ],
    }).compile();

    service = module.get(VideosService);
  });

  describe('createDraft', () => {
    const dto: CreateVideoDto = {
      title: 'Clip',
      filename: 'clip.mp4',
      content_type: 'video/mp4',
      size_bytes: 2048,
    };

    it('persists an uploading draft and returns the upload id + presigned parts', async () => {
      storageMock.initiateMultipartUpload.mockResolvedValue({
        upload_id: 'up-123',
        parts: [{ part_number: 1, url: 'https://minio/part-1' }],
      });

      const result = await service.createDraft('owner-1', dto);

      expect(result.upload_id).toBe('up-123');
      expect(result.parts).toHaveLength(1);
      expect(result.public_id).toEqual(expect.any(String));
      expect(result.storage_key).toContain(result.public_id);
      expect(storageMock.initiateMultipartUpload).toHaveBeenCalledWith(
        result.storage_key,
        'video/mp4',
        2048,
      );

      expect(repoMock.save).toHaveBeenCalledTimes(1);
      const saved = (repoMock.save.mock.calls as Video[][])[0][0];
      expect(saved.status).toBe('uploading');
      expect(saved.owner_id).toBe('owner-1');
      expect(saved.public_id).toBe(result.public_id);
      expect(saved.upload_id).toBe('up-123');
    });

    it('does not persist a draft when the upload cannot be initiated', async () => {
      storageMock.initiateMultipartUpload.mockRejectedValue(
        new Error('storage down'),
      );

      await expect(service.createDraft('owner-1', dto)).rejects.toThrow(
        'storage down',
      );
      expect(repoMock.save).not.toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    const dto: CompleteUploadDto = { parts: [{ part_number: 1, etag: '"e"' }] };

    function uploadingVideo(overrides: Partial<Video> = {}): Video {
      return {
        id: 'v-1',
        public_id: 'pub-1',
        owner_id: 'owner-1',
        storage_key: 'videos/pub-1/original',
        upload_id: 'up-1',
        size_bytes: 1024,
        status: 'uploading',
        ...overrides,
      } as Video;
    }

    it('verifies the object, transitions to processing and enqueues the job', async () => {
      const video = uploadingVideo();
      repoMock.findOne.mockResolvedValue(video);
      storageMock.completeMultipartUpload.mockResolvedValue(undefined);
      storageMock.headObject.mockResolvedValue({ size: 1024 });

      const result = await service.completeUpload('owner-1', 'pub-1', dto);

      expect(result).toEqual({ public_id: 'pub-1', status: 'processing' });
      expect(video.status).toBe('processing');
      expect(video.upload_id).toBeNull();
      expect(repoMock.save).toHaveBeenCalledWith(video);
      expect(queueMock.add).toHaveBeenCalledWith('process-video', {
        video_id: 'v-1',
        storage_key: 'videos/pub-1/original',
      });
    });

    it('throws VideoNotFound when no video matches the public_id', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(
        service.completeUpload('owner-1', 'missing', dto),
      ).rejects.toThrow(VideoNotFoundException);
      expect(queueMock.add).not.toHaveBeenCalled();
    });

    it('throws NotVideoOwner when the caller is not the owner', async () => {
      repoMock.findOne.mockResolvedValue(uploadingVideo({ owner_id: 'other' }));

      await expect(
        service.completeUpload('owner-1', 'pub-1', dto),
      ).rejects.toThrow(NotVideoOwnerException);
      expect(storageMock.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('throws UploadAlreadyFinalized when the video is not uploading', async () => {
      repoMock.findOne.mockResolvedValue(
        uploadingVideo({ status: 'processing', upload_id: null }),
      );

      await expect(
        service.completeUpload('owner-1', 'pub-1', dto),
      ).rejects.toThrow(UploadAlreadyFinalizedException);
    });

    it('throws UploadObjectMissing when finalize fails', async () => {
      repoMock.findOne.mockResolvedValue(uploadingVideo());
      storageMock.completeMultipartUpload.mockRejectedValue(
        new Error('InvalidPart'),
      );

      await expect(
        service.completeUpload('owner-1', 'pub-1', dto),
      ).rejects.toThrow(UploadObjectMissingException);
      expect(repoMock.save).not.toHaveBeenCalled();
    });

    it('throws UploadObjectMissing when the object is absent after finalize', async () => {
      repoMock.findOne.mockResolvedValue(uploadingVideo());
      storageMock.completeMultipartUpload.mockResolvedValue(undefined);
      storageMock.headObject.mockResolvedValue(null);

      await expect(
        service.completeUpload('owner-1', 'pub-1', dto),
      ).rejects.toThrow(UploadObjectMissingException);
    });

    it('throws UploadSizeMismatch when the stored size differs from the declared size', async () => {
      repoMock.findOne.mockResolvedValue(uploadingVideo({ size_bytes: 1024 }));
      storageMock.completeMultipartUpload.mockResolvedValue(undefined);
      storageMock.headObject.mockResolvedValue({ size: 2048 });

      await expect(
        service.completeUpload('owner-1', 'pub-1', dto),
      ).rejects.toThrow(UploadSizeMismatchException);
      expect(queueMock.add).not.toHaveBeenCalled();
    });
  });

  describe('getForPlayback', () => {
    function video(overrides: Partial<Video> = {}): Video {
      return {
        id: 'v-1',
        public_id: 'pub-1',
        owner_id: 'owner-1',
        title: 'Clip',
        storage_key: 'videos/pub-1/original',
        thumbnail_key: 'videos/pub-1/thumbnail.jpg',
        duration_seconds: 12,
        status: 'ready',
        ...overrides,
      } as Video;
    }

    it('returns metadata + presigned playback and thumbnail URLs for a ready video', async () => {
      repoMock.findOne.mockResolvedValue(video());
      storageMock.getPresignedGetUrl.mockImplementation(async (key: string) =>
        Promise.resolve(`signed:${key}`),
      );

      const result = await service.getForPlayback('pub-1');

      expect(result).toEqual({
        public_id: 'pub-1',
        title: 'Clip',
        status: 'ready',
        duration_seconds: 12,
        thumbnail_url: 'signed:videos/pub-1/thumbnail.jpg',
        playback_url: 'signed:videos/pub-1/original',
      });
    });

    it('returns a null thumbnail_url when the video has no thumbnail', async () => {
      repoMock.findOne.mockResolvedValue(video({ thumbnail_key: null }));
      storageMock.getPresignedGetUrl.mockResolvedValue('signed:playback');

      const result = await service.getForPlayback('pub-1');

      expect(result.thumbnail_url).toBeNull();
      expect(result.playback_url).toBe('signed:playback');
    });

    it('returns metadata with a null playback_url to the owner of a processing video', async () => {
      repoMock.findOne.mockResolvedValue(
        video({
          status: 'processing',
          thumbnail_key: null,
          duration_seconds: null,
        }),
      );

      const result = await service.getForPlayback('pub-1', 'owner-1');

      expect(result.status).toBe('processing');
      expect(result.playback_url).toBeNull();
      expect(result.thumbnail_url).toBeNull();
      expect(storageMock.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('hides a non-ready video from an anonymous requester (404)', async () => {
      repoMock.findOne.mockResolvedValue(video({ status: 'processing' }));

      await expect(service.getForPlayback('pub-1')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('hides a non-ready video from a non-owner (404)', async () => {
      repoMock.findOne.mockResolvedValue(video({ status: 'processing' }));

      await expect(
        service.getForPlayback('pub-1', 'someone-else'),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('throws VideoNotFound when no video matches', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(service.getForPlayback('missing')).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });

  describe('getDownloadUrl', () => {
    function video(overrides: Partial<Video> = {}): Video {
      return {
        id: 'v-1',
        public_id: 'pub-1',
        owner_id: 'owner-1',
        storage_key: 'videos/pub-1/original',
        original_filename: 'clip.mp4',
        status: 'ready',
        ...overrides,
      } as Video;
    }

    it('returns a presigned attachment URL for a ready video', async () => {
      repoMock.findOne.mockResolvedValue(video());
      storageMock.getPresignedGetUrl.mockResolvedValue('signed:download');

      const url = await service.getDownloadUrl('pub-1');

      expect(url).toBe('signed:download');
      expect(storageMock.getPresignedGetUrl).toHaveBeenCalledWith(
        'videos/pub-1/original',
        { downloadFilename: 'clip.mp4' },
      );
    });

    it('throws VideoNotReady to the owner of a non-ready video', async () => {
      repoMock.findOne.mockResolvedValue(video({ status: 'processing' }));

      await expect(service.getDownloadUrl('pub-1', 'owner-1')).rejects.toThrow(
        VideoNotReadyException,
      );
      expect(storageMock.getPresignedGetUrl).not.toHaveBeenCalled();
    });

    it('hides a non-ready video from a non-owner (404)', async () => {
      repoMock.findOne.mockResolvedValue(video({ status: 'processing' }));

      await expect(
        service.getDownloadUrl('pub-1', 'someone-else'),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('throws VideoNotFound when no video matches', async () => {
      repoMock.findOne.mockResolvedValue(null);

      await expect(service.getDownloadUrl('missing')).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });
});
