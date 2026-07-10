import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import { Video } from '../src/videos/entities/video.entity';
import type { VideoStatus } from '../src/videos/entities/video.entity';

// supertest types `res.body` as `any`; these shapes make the assertions type-safe.
interface VideoResponse {
  public_id: string;
  title: string;
  status: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  playback_url: string | null;
}
interface ErrorResponse {
  error: string;
}

describe('videos-delivery (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let userRepository: Repository<User>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    videoRepository = dataSource.getRepository(Video);
    userRepository = dataSource.getRepository(User);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
  });

  async function registerConfirmAndLogin(
    email: string,
    password = 'password123',
  ): Promise<string> {
    const authService = app.get(AuthService);
    const mailService = (authService as unknown as { mailService: unknown })
      .mailService;
    let confirmationToken = '';
    jest
      .spyOn(
        mailService as { sendConfirmationEmail: () => Promise<void> },
        'sendConfirmationEmail',
      )
      .mockImplementationOnce((..._args: unknown[]) => {
        confirmationToken = _args[2] as string;
        return Promise.resolve();
      });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: confirmationToken });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return (res.body as { access_token: string }).access_token;
  }

  async function userId(email: string): Promise<string> {
    const user = await userRepository.findOneByOrFail({ email });
    return user.id;
  }

  async function seedVideo(
    ownerId: string,
    status: VideoStatus,
  ): Promise<Video> {
    const publicId = uuidv7();
    return videoRepository.save(
      videoRepository.create({
        public_id: publicId,
        owner_id: ownerId,
        title: 'My Clip',
        original_filename: 'my clip.mp4',
        storage_key: `videos/${publicId}/original`,
        size_bytes: 1024,
        content_type: 'video/mp4',
        status,
        duration_seconds: status === 'ready' ? 15 : null,
        thumbnail_key:
          status === 'ready' ? `videos/${publicId}/thumbnail.jpg` : null,
      }),
    );
  }

  it('returns metadata and a presigned playback URL for a ready video (anonymous)', async () => {
    const owner = await userId(await ownerEmailFrom('ready-owner@example.com'));
    const video = await seedVideo(owner, 'ready');

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .expect(200);

    const body = res.body as VideoResponse;
    expect(body.public_id).toBe(video.public_id);
    expect(body.status).toBe('ready');
    expect(body.duration_seconds).toBe(15);
    expect(body.playback_url).toContain('X-Amz-Signature');
    expect(body.playback_url).toContain(video.storage_key);
    expect(body.thumbnail_url).toContain('X-Amz-Signature');
  });

  it('hides a non-ready video from an anonymous requester with 404 VIDEO_NOT_FOUND', async () => {
    const owner = await userId(
      await ownerEmailFrom('processing-owner@example.com'),
    );
    const video = await seedVideo(owner, 'processing');

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .expect(404);

    expect((res.body as ErrorResponse).error).toBe('VIDEO_NOT_FOUND');
  });

  it('returns metadata with a null playback_url to the owner of a processing video', async () => {
    const email = 'owner-processing@example.com';
    const token = await registerConfirmAndLogin(email);
    const video = await seedVideo(await userId(email), 'processing');

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as VideoResponse;
    expect(body.status).toBe('processing');
    expect(body.playback_url).toBeNull();
    expect(body.thumbnail_url).toBeNull();
  });

  it('returns 404 for a video that does not exist', async () => {
    const res = await request(app.getHttpServer())
      .get(`/videos/${uuidv7()}`)
      .expect(404);

    expect((res.body as ErrorResponse).error).toBe('VIDEO_NOT_FOUND');
  });

  it('redirects a download of a ready video to a presigned attachment URL (302)', async () => {
    const owner = await userId(
      await ownerEmailFrom('download-owner@example.com'),
    );
    const video = await seedVideo(owner, 'ready');

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/download`)
      .expect(302);

    const location = decodeURIComponent(res.headers.location);
    expect(location).toContain('X-Amz-Signature');
    expect(location).toContain('response-content-disposition=attachment');
  });

  it('rejects a download of a non-ready video by its owner with 409 VIDEO_NOT_READY', async () => {
    const email = 'download-processing@example.com';
    const token = await registerConfirmAndLogin(email);
    const video = await seedVideo(await userId(email), 'processing');

    const res = await request(app.getHttpServer())
      .get(`/videos/${video.public_id}/download`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect((res.body as ErrorResponse).error).toBe('VIDEO_NOT_READY');
  });

  // Registers a user (needed to satisfy the videos.owner_id FK) and returns the
  // email so the caller can resolve the id — anonymous delivery tests still need
  // a real owner row behind the video.
  async function ownerEmailFrom(email: string): Promise<string> {
    await registerConfirmAndLogin(email);
    return email;
  }
});
