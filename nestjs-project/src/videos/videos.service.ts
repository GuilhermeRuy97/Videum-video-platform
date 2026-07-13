import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import {
  NotVideoOwnerException,
  UploadAlreadyFinalizedException,
  UploadObjectMissingException,
  UploadSizeMismatchException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import type { PresignedPart } from '../storage/storage.service';
import { StorageService } from '../storage/storage.service';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { CreateVideoDto } from './dto/create-video.dto';
import { Video } from './entities/video.entity';
import type { ProcessVideoJobData } from './videos.constants';
import { PROCESS_VIDEO_JOB, VIDEO_PROCESSING_QUEUE } from './videos.constants';

export interface CreateVideoResult {
  public_id: string;
  upload_id: string;
  storage_key: string;
  parts: PresignedPart[];
}

export interface CompleteUploadResult {
  public_id: string;
  status: string;
}

export interface VideoPlaybackResult {
  public_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  playback_url: string | null;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly processingQueue: Queue<ProcessVideoJobData>,
  ) {}

  /**
   * Pre-registers a draft video and initiates a presigned direct-to-storage
   * multipart upload (per phase-03-upload-processing/TD-04, TD-05,
   * upload-completion-signal/TD-01). The API never sees the file bytes.
   */
  async createDraft(
    ownerId: string,
    dto: CreateVideoDto,
  ): Promise<CreateVideoResult> {
    const publicId = uuidv7();
    const storageKey = `videos/${publicId}/original`;

    // Start the upload first so the draft is persisted with its upload id in a
    // single write; an orphaned multipart upload (if the save below fails) is
    // swept by the reconciliation job.
    const upload = await this.storageService.initiateMultipartUpload(
      storageKey,
      dto.content_type,
      dto.size_bytes,
    );

    const video = this.videoRepository.create({
      public_id: publicId,
      owner_id: ownerId,
      title: dto.title,
      original_filename: dto.filename,
      storage_key: storageKey,
      upload_id: upload.upload_id,
      size_bytes: dto.size_bytes,
      content_type: dto.content_type,
      status: 'uploading',
    });
    await this.videoRepository.save(video);

    return {
      public_id: publicId,
      upload_id: upload.upload_id,
      storage_key: storageKey,
      parts: upload.parts,
    };
  }

  /**
   * Finalizes a presigned multipart upload: verifies the object landed with the
   * declared size, transitions the draft `uploading → processing`, and enqueues
   * the processing job (per upload-completion-signal/TD-01, TD-02).
   */
  async completeUpload(
    ownerId: string,
    publicId: string,
    dto: CompleteUploadDto,
  ): Promise<CompleteUploadResult> {
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    if (video.owner_id !== ownerId) {
      throw new NotVideoOwnerException();
    }
    if (video.status !== 'uploading' || !video.upload_id) {
      throw new UploadAlreadyFinalizedException();
    }

    // Finalize the multipart upload from the client-reported part ETags. A
    // failure here means the parts were never uploaded or don't match — the
    // object cannot be assembled, so it is treated as missing.
    try {
      await this.storageService.completeMultipartUpload(
        video.storage_key,
        video.upload_id,
        dto.parts,
      );
    } catch {
      throw new UploadObjectMissingException();
    }

    // Server-side verification guards against a client that lies about completion.
    const head = await this.storageService.headObject(video.storage_key);
    if (!head) {
      throw new UploadObjectMissingException();
    }
    if (head.size !== video.size_bytes) {
      throw new UploadSizeMismatchException();
    }

    video.status = 'processing';
    video.upload_id = null;
    await this.videoRepository.save(video);

    await this.processingQueue.add(PROCESS_VIDEO_JOB, {
      video_id: video.id,
      storage_key: video.storage_key,
    });

    return { public_id: video.public_id, status: video.status };
  }

  /**
   * Resolves a video for playback by its public id and builds presigned,
   * Range-native GET URLs for the object + thumbnail (per
   * phase-03-upload-processing/TD-06). Visibility: a non-`ready` video is only
   * visible to its owner; anyone else (anonymous or another user) gets a 404 so
   * the video's existence is not leaked. The owner of a not-yet-`ready` video
   * gets its metadata with `playback_url: null` (for polling processing state).
   */
  async getForPlayback(
    publicId: string,
    requesterId?: string,
  ): Promise<VideoPlaybackResult> {
    const video = await this.findVisibleVideo(publicId, requesterId);

    const playbackUrl =
      video.status === 'ready'
        ? await this.storageService.getPresignedGetUrl(video.storage_key)
        : null;
    const thumbnailUrl = video.thumbnail_key
      ? await this.storageService.getPresignedGetUrl(video.thumbnail_key)
      : null;

    return {
      public_id: video.public_id,
      title: video.title,
      status: video.status,
      duration_seconds: video.duration_seconds,
      thumbnail_url: thumbnailUrl,
      playback_url: playbackUrl,
    };
  }

  /**
   * Builds a presigned GET URL carrying an attachment content-disposition for a
   * native browser download (per phase-03-upload-processing/TD-06). Only a
   * `ready` video is downloadable: the owner of a non-`ready` one gets
   * `VIDEO_NOT_READY`; anyone else gets `VIDEO_NOT_FOUND`.
   */
  async getDownloadUrl(
    publicId: string,
    requesterId?: string,
  ): Promise<string> {
    const video = await this.findVisibleVideo(publicId, requesterId);
    if (video.status !== 'ready') {
      throw new VideoNotReadyException();
    }
    return this.storageService.getPresignedGetUrl(video.storage_key, {
      downloadFilename: video.original_filename,
    });
  }

  /**
   * Loads a video by public id and enforces the shared visibility rule: a
   * non-`ready` video is visible only to its owner. Non-owners (including
   * anonymous requesters) get `VIDEO_NOT_FOUND` whether the video is missing or
   * simply not theirs to see yet.
   */
  private async findVisibleVideo(
    publicId: string,
    requesterId?: string,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    const isOwner = requesterId !== undefined && video.owner_id === requesterId;
    if (video.status !== 'ready' && !isOwner) {
      throw new VideoNotFoundException();
    }
    return video;
  }
}
