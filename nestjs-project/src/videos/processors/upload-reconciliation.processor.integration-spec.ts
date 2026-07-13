import type { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import queueConfig from '../../config/queue.config';
import storageConfig from '../../config/storage.config';
import { StorageService } from '../../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from '../entities/video.entity';
import type { ProcessVideoJobData } from '../videos.constants';
import { PROCESS_VIDEO_JOB } from '../videos.constants';
import { UploadReconciliationProcessor } from './upload-reconciliation.processor';

jest.setTimeout(30000);

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];
const TIMEOUT_MS = 60_000;

const TEST_STORAGE = {
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  publicEndpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'minioadmin',
  bucket: 'videos-reconciliation-it',
  partSizeBytes: 5 * 1024 * 1024,
  presignExpirySeconds: 3600,
} satisfies ConfigType<typeof storageConfig>;

const TEST_QUEUE = {
  host: 'redis',
  port: 6379,
  reconciliationIntervalMs: 300_000,
  abandonedUploadTimeoutMs: TIMEOUT_MS,
} satisfies ConfigType<typeof queueConfig>;

describe('UploadReconciliationProcessor (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let videoRepository: Repository<Video>;
  let storage: StorageService;
  let processor: UploadReconciliationProcessor;
  const queueMock = { add: jest.fn() };

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    videoRepository = dataSource.getRepository(Video);
    storage = new StorageService(TEST_STORAGE);
    await storage.ensureBucket();
    processor = new UploadReconciliationProcessor(
      videoRepository,
      storage,
      queueMock as unknown as Queue<ProcessVideoJobData>,
      TEST_QUEUE,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    queueMock.add.mockReset();
    queueMock.add.mockResolvedValue({} as never);
  });

  let counter = 0;
  async function seedUploadingVideo(
    storageKey: string,
    ageMs: number,
  ): Promise<Video> {
    const user = await userRepository.save(
      userRepository.create({
        email: `recon_${++counter}@example.com`,
        password: 'hashed',
      }),
    );
    const video = await videoRepository.save(
      videoRepository.create({
        owner_id: user.id,
        title: 'V',
        original_filename: 'v.mp4',
        storage_key: storageKey,
        upload_id: 'up-x',
        size_bytes: 1,
        content_type: 'video/mp4',
        status: 'uploading',
      }),
    );
    // Back-date created_at directly — @CreateDateColumn is set to now() on insert.
    await dataSource.query('UPDATE videos SET created_at = $1 WHERE id = $2', [
      new Date(Date.now() - ageMs),
      video.id,
    ]);
    return video;
  }

  it('rescues a stale draft whose object exists → processing + enqueued', async () => {
    const key = `videos-reconciliation-it/${Date.now()}-present/original`;
    const video = await seedUploadingVideo(key, TIMEOUT_MS * 2);
    await storage.putObject(key, Buffer.from('landed'), 'video/mp4');

    await processor.process();

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('processing');
    expect(updated.upload_id).toBeNull();
    expect(queueMock.add).toHaveBeenCalledWith(PROCESS_VIDEO_JOB, {
      video_id: video.id,
      storage_key: key,
    });
  });

  it('fails a stale draft whose object is absent', async () => {
    const key = `videos-reconciliation-it/${Date.now()}-absent/original`;
    const video = await seedUploadingVideo(key, TIMEOUT_MS * 2);

    await processor.process();

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('failed');
    expect(queueMock.add).not.toHaveBeenCalled();
  });

  it('leaves a recent draft within the timeout untouched', async () => {
    const key = `videos-reconciliation-it/${Date.now()}-recent/original`;
    const video = await seedUploadingVideo(key, 0);
    // Object exists, but the draft is fresh — the sweep must not touch it.
    await storage.putObject(key, Buffer.from('landed'), 'video/mp4');

    await processor.process();

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('uploading');
    expect(queueMock.add).not.toHaveBeenCalled();
  });
});
