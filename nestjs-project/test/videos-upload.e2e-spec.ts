import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { Video } from '../src/videos/entities/video.entity';

const TEN_GB = 10 * 1024 ** 3;

const VALID_BODY = {
  title: 'My Clip',
  filename: 'clip.mp4',
  content_type: 'video/mp4',
  size_bytes: 5_000_000,
};

// supertest types `res.body` as `any`; these shapes make the assertions type-safe.
interface UploadResponse {
  public_id: string;
  upload_id: string;
  storage_key: string;
  parts: { part_number: number; url: string }[];
}
interface ErrorResponse {
  error: string;
}

describe('videos-upload (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
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

  it('creates a draft and returns presigned upload details (1.1)', async () => {
    const accessToken = await registerConfirmAndLogin('uploader@example.com');

    const res = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(VALID_BODY)
      .expect(201);

    const body = res.body as UploadResponse;
    expect(body.public_id).toEqual(expect.any(String));
    expect(body.upload_id).toEqual(expect.any(String));
    expect(body.storage_key).toEqual(expect.any(String));
    expect(Array.isArray(body.parts)).toBe(true);
    expect(body.parts.length).toBeGreaterThan(0);
    expect(body.parts[0]).toHaveProperty('part_number');
    expect(body.parts[0]).toHaveProperty('url');

    const stored = await videoRepository.findOneByOrFail({
      public_id: body.public_id,
    });
    expect(stored.status).toBe('uploading');

    // public_id is unique across drafts.
    const second = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(VALID_BODY)
      .expect(201);
    expect((second.body as UploadResponse).public_id).not.toBe(body.public_id);
  });

  it('rejects an unauthenticated request with 401 and creates no draft (1.2)', async () => {
    await request(app.getHttpServer())
      .post('/videos')
      .send(VALID_BODY)
      .expect(401);

    expect(await videoRepository.count()).toBe(0);
  });

  it('rejects an over-size upload with 400 VALIDATION_ERROR and creates no draft (1.3)', async () => {
    const accessToken = await registerConfirmAndLogin('oversize@example.com');

    const res = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...VALID_BODY, size_bytes: TEN_GB + 1 })
      .expect(400);

    expect((res.body as ErrorResponse).error).toBe('VALIDATION_ERROR');
    expect(await videoRepository.count()).toBe(0);
  });
});
