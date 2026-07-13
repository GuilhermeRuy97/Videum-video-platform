import { S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { Video } from '../src/videos/entities/video.entity';
import { VIDEO_PROCESSING_QUEUE } from '../src/videos/videos.constants';

// A direct S3 client (internal Docker host) to upload real parts to the same
// multipart upload the API initiated — the presigned part URLs point at the
// public host, which is unreachable from inside the container.
const s3 = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT ?? 'http://minio:9000',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true,
});
const BUCKET = process.env.STORAGE_BUCKET ?? 'videos';

// supertest types `res.body` as `any`; these shapes make the assertions type-safe.
interface DraftResponse {
  public_id: string;
  upload_id: string;
  storage_key: string;
}
interface CompleteResponse {
  status: string;
}
interface ErrorResponse {
  error: string;
}

describe('videos-complete (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;
  let processingQueue: Queue;

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
    processingQueue = moduleFixture.get<Queue>(
      getQueueToken(VIDEO_PROCESSING_QUEUE),
    );
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

  async function createDraft(
    token: string,
    sizeBytes: number,
  ): Promise<{ public_id: string; upload_id: string; storage_key: string }> {
    const res = await request(app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Clip',
        filename: 'clip.mp4',
        content_type: 'video/mp4',
        size_bytes: sizeBytes,
      })
      .expect(201);
    const body = res.body as DraftResponse;
    return {
      public_id: body.public_id,
      upload_id: body.upload_id,
      storage_key: body.storage_key,
    };
  }

  async function uploadSinglePart(
    storageKey: string,
    uploadId: string,
    body: Buffer,
  ): Promise<{ part_number: number; etag: string }> {
    const res = await s3.send(
      new UploadPartCommand({
        Bucket: BUCKET,
        Key: storageKey,
        UploadId: uploadId,
        PartNumber: 1,
        Body: body,
      }),
    );
    return { part_number: 1, etag: res.ETag as string };
  }

  it('finalizes the upload, transitions to processing and enqueues the job (1.1)', async () => {
    const token = await registerConfirmAndLogin('owner-c@example.com');
    const size = 1024;
    const draft = await createDraft(token, size);
    const part = await uploadSinglePart(
      draft.storage_key,
      draft.upload_id,
      Buffer.alloc(size, 7),
    );

    const addSpy = jest
      .spyOn(processingQueue, 'add')
      .mockResolvedValue({} as never);

    const res = await request(app.getHttpServer())
      .post(`/videos/${draft.public_id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parts: [part] })
      .expect(200);

    expect((res.body as CompleteResponse).status).toBe('processing');

    const stored = await videoRepository.findOneByOrFail({
      public_id: draft.public_id,
    });
    expect(stored.status).toBe('processing');
    expect(stored.upload_id).toBeNull();

    expect(addSpy).toHaveBeenCalledWith(
      'process-video',
      expect.objectContaining({ storage_key: draft.storage_key }),
    );
    addSpy.mockRestore();
  });

  it('rejects completion by a non-owner with 403 NOT_VIDEO_OWNER (1.2)', async () => {
    const ownerToken = await registerConfirmAndLogin('owner2-c@example.com');
    const otherToken = await registerConfirmAndLogin('other-c@example.com');
    const draft = await createDraft(ownerToken, 1024);

    const res = await request(app.getHttpServer())
      .post(`/videos/${draft.public_id}/complete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ parts: [{ part_number: 1, etag: '"x"' }] })
      .expect(403);

    expect((res.body as ErrorResponse).error).toBe('NOT_VIDEO_OWNER');
    const stored = await videoRepository.findOneByOrFail({
      public_id: draft.public_id,
    });
    expect(stored.status).toBe('uploading');
  });

  it('rejects completion when the object was never uploaded with 422 UPLOAD_OBJECT_MISSING (1.3)', async () => {
    const token = await registerConfirmAndLogin('missing-c@example.com');
    const draft = await createDraft(token, 1024);

    const res = await request(app.getHttpServer())
      .post(`/videos/${draft.public_id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        parts: [{ part_number: 1, etag: '"00000000000000000000000000000000"' }],
      })
      .expect(422);

    expect((res.body as ErrorResponse).error).toBe('UPLOAD_OBJECT_MISSING');
    const stored = await videoRepository.findOneByOrFail({
      public_id: draft.public_id,
    });
    expect(stored.status).toBe('uploading');
  });

  it('rejects completion when the stored size differs with 422 UPLOAD_SIZE_MISMATCH (1.4)', async () => {
    const token = await registerConfirmAndLogin('mismatch-c@example.com');
    const declared = 1024;
    const draft = await createDraft(token, declared);
    const part = await uploadSinglePart(
      draft.storage_key,
      draft.upload_id,
      Buffer.alloc(declared * 2, 3),
    );

    const res = await request(app.getHttpServer())
      .post(`/videos/${draft.public_id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parts: [part] })
      .expect(422);

    expect((res.body as ErrorResponse).error).toBe('UPLOAD_SIZE_MISMATCH');
    const stored = await videoRepository.findOneByOrFail({
      public_id: draft.public_id,
    });
    expect(stored.status).toBe('uploading');
  });

  it('rejects completion of an already-finalized video with 409 UPLOAD_ALREADY_FINALIZED (1.5)', async () => {
    const token = await registerConfirmAndLogin('finalized-c@example.com');
    const draft = await createDraft(token, 1024);
    await videoRepository.update(
      { public_id: draft.public_id },
      { status: 'processing', upload_id: null },
    );

    const res = await request(app.getHttpServer())
      .post(`/videos/${draft.public_id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parts: [{ part_number: 1, etag: '"x"' }] })
      .expect(409);

    expect((res.body as ErrorResponse).error).toBe('UPLOAD_ALREADY_FINALIZED');
  });
});
