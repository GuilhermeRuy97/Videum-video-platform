import type { ConfigType } from '@nestjs/config';
import type { Job } from 'bullmq';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import storageConfig from '../../config/storage.config';
import { StorageService } from '../../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from '../entities/video.entity';
import type { ProcessVideoJobData } from '../videos.constants';
import { VideoProcessingProcessor } from './video-processing.processor';

jest.setTimeout(30000);

const execFileAsync = promisify(execFile);
const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

const TEST_STORAGE = {
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  publicEndpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'minioadmin',
  bucket: 'videos-worker-it',
  partSizeBytes: 5 * 1024 * 1024,
  presignExpirySeconds: 3600,
} satisfies ConfigType<typeof storageConfig>;

describe('VideoProcessingProcessor (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let videoRepository: Repository<Video>;
  let storage: StorageService;
  let processor: VideoProcessingProcessor;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    videoRepository = dataSource.getRepository(Video);
    storage = new StorageService(TEST_STORAGE);
    await storage.ensureBucket();
    processor = new VideoProcessingProcessor(storage, videoRepository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function seedProcessingVideo(storageKey: string): Promise<Video> {
    const user = await userRepository.save(
      userRepository.create({
        email: `worker_${++counter}@example.com`,
        password: 'hashed',
      }),
    );
    return videoRepository.save(
      videoRepository.create({
        owner_id: user.id,
        title: 'V',
        original_filename: 'v.mp4',
        storage_key: storageKey,
        size_bytes: 1,
        content_type: 'video/mp4',
        status: 'processing',
      }),
    );
  }

  function jobFor(video: Video): Job<ProcessVideoJobData> {
    return {
      data: { video_id: video.id, storage_key: video.storage_key },
    } as Job<ProcessVideoJobData>;
  }

  async function makeTestVideo(): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'gen-'));
    const out = join(dir, 'test.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=128x72:rate=10',
      '-pix_fmt',
      'yuv420p',
      out,
    ]);
    const buffer = await readFile(out);
    await rm(dir, { recursive: true, force: true });
    return buffer;
  }

  it('extracts duration + thumbnail and marks the video ready', async () => {
    const key = `videos-worker-it/${Date.now()}/original`;
    const video = await seedProcessingVideo(key);
    await storage.putObject(key, await makeTestVideo(), 'video/mp4');

    await processor.process(jobFor(video));

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('ready');
    expect(updated.duration_seconds).toBeGreaterThanOrEqual(1);
    expect(updated.thumbnail_key).toBe(
      `videos-worker-it/${key.split('/')[1]}/thumbnail.jpg`,
    );

    const thumbHead = await storage.headObject(updated.thumbnail_key as string);
    expect(thumbHead).not.toBeNull();
    expect(thumbHead?.size).toBeGreaterThan(0);
  });

  it('marks the video failed when the source is not a valid video', async () => {
    const key = `videos-worker-it/${Date.now()}-bad/original`;
    const video = await seedProcessingVideo(key);
    await storage.putObject(key, Buffer.from('not a video'), 'video/mp4');

    await expect(processor.process(jobFor(video))).rejects.toThrow();

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('failed');
  });

  it('is a no-op for a video already marked ready', async () => {
    const key = `videos-worker-it/${Date.now()}-ready/original`;
    const video = await seedProcessingVideo(key);
    await videoRepository.update(
      { id: video.id },
      { status: 'ready', duration_seconds: 42 },
    );

    // No object was uploaded — if the processor tried to process it, it would
    // throw. Instead it should skip and resolve cleanly.
    await expect(processor.process(jobFor(video))).resolves.toBeUndefined();

    const updated = await videoRepository.findOneByOrFail({ id: video.id });
    expect(updated.status).toBe('ready');
    expect(updated.duration_seconds).toBe(42);
  });
});
