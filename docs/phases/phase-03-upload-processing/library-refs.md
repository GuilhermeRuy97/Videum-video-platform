---
libs:
  "@aws-sdk/client-s3":
    version: "^3.1084.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-07-13T12:30:00-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.1084.0"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-07-13T12:30:00-03:00"
  "@nestjs/bullmq":
    version: "^11.0.4"
    context7_id: "/nestjs/docs.nestjs.com"
    fetched_at: "2026-07-13T12:30:00-03:00"
  bullmq:
    version: "^5.79.3"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-07-13T12:30:00-03:00"
  uuid:
    version: "^11.1.1"
    context7_id: "/uuidjs/uuid"
    fetched_at: "2026-07-13T12:30:00-03:00"
  ffmpeg:
    version: "system binary (apt in Dockerfile.dev)"
    context7_id: null
    fetched_at: "2026-07-13T12:30:00-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-07-08T18:04:18.204062600-03:00"
  docs/decisions/technical-decisions-upload-completion-signal.md: "2026-07-08T17:30:52.053757500-03:00"
---

# phase-03-upload-processing — Library References

Distilled docs for libraries decided in this phase. Pulled via Context7. Re-fetch when the underlying TD changes (resolve refreshes this file when the lib set in the decisions index drifts from the cached set here).

Maps to: `phase-03-upload-processing/TD-01` (MinIO/S3), `TD-02` (worker + BullMQ), `TD-03` (raw FFmpeg), `TD-04` (`public_id` UUID v7), `TD-05` (presigned multipart), `TD-06` (presigned GET / Range), `upload-completion-signal/TD-01` (reconciliation scheduler).

## @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner

**Source:** `/aws/aws-sdk-js-v3` (Context7). Maps to `TD-01` / `TD-05` / `TD-06`. Installed: `@aws-sdk/client-s3@^3.1084.0`, `@aws-sdk/s3-request-presigner@^3.1084.0`.

### MinIO-compatible client (forcePathStyle + custom endpoint)

`StorageService` uses **two** `S3Client`s: an internal one (`minio:9000`) for server-side ops and a `presignS3` client signed against the public endpoint (`localhost:9000`) so browser URLs resolve. `forcePathStyle: true` is required for MinIO path-style addressing.

```typescript
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
  },
  forcePathStyle: true,
});
```

### Multipart upload lifecycle

Commands used by `StorageService`:

1. `CreateMultipartUploadCommand` → `UploadId`
2. Presign each part with `UploadPartCommand` + `getSignedUrl` (against `presignS3`)
3. `CompleteMultipartUploadCommand` with `{ Parts: [{ ETag, PartNumber }] }`
4. `HeadObjectCommand` to verify assembled size

```typescript
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const created = await s3.send(
  new CreateMultipartUploadCommand({
    Bucket: 'videos',
    Key: storageKey,
    ContentType: contentType,
  }),
);

const partUrl = await getSignedUrl(
  presignS3,
  new UploadPartCommand({
    Bucket: 'videos',
    Key: storageKey,
    UploadId: created.UploadId!,
    PartNumber: 1,
  }),
  { expiresIn: 3600 },
);

await s3.send(
  new CompleteMultipartUploadCommand({
    Bucket: 'videos',
    Key: storageKey,
    UploadId: created.UploadId!,
    MultipartUpload: {
      Parts: [{ ETag: etag, PartNumber: 1 }],
    },
  }),
);
```

### Presigned GET (playback / download)

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const url = await getSignedUrl(
  presignS3,
  new GetObjectCommand({
    Bucket: 'videos',
    Key: storageKey,
    // download only:
    // ResponseContentDisposition: `attachment; filename="${filename}"`,
  }),
  { expiresIn: 3600 },
);
```

Range requests are native on the signed GET URL — the API never proxies bytes (`TD-06`).

Also used: `PutObjectCommand` (thumbnail upload), `GetObjectCommand` + stream pipeline (`downloadToFile` for the worker), `HeadBucketCommand` / `CreateBucketCommand` (bucket ensure-on-boot).

## @nestjs/bullmq + bullmq

**Sources:** `/nestjs/docs.nestjs.com` (Nest queues chapter) + `/taskforcesh/bullmq` (Job Schedulers). Installed: `@nestjs/bullmq@^11.0.4`, `bullmq@^5.79.3`. Maps to `TD-02` + `upload-completion-signal/TD-01`.

### Root connection + queue registration

```typescript
import { BullModule } from '@nestjs/bullmq';

BullModule.forRootAsync({
  imports: [ConfigModule],
  inject: [queueConfig.KEY],
  useFactory: (qConfig) => ({
    connection: {
      host: qConfig.host, // Compose service name `redis`, never localhost
      port: qConfig.port,
    },
  }),
});

BullModule.registerQueue({ name: 'video-processing' });
BullModule.registerQueue({ name: 'upload-reconciliation' });
```

### Producer (API) and consumer (worker)

```typescript
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

// API — enqueue after complete
constructor(@InjectQueue('video-processing') private readonly queue: Queue) {}
await this.queue.add('process-video', { video_id, storage_key });

// Worker — consume
@Processor('video-processing')
export class VideoProcessingProcessor extends WorkerHost {
  async process(job: Job<{ video_id: string; storage_key: string }>): Promise<void> {
    // download → ffprobe/ffmpeg → put thumbnail → status ready|failed
  }
}
```

### Repeatable reconciliation via Job Scheduler (BullMQ v5)

Prefer `queue.upsertJobScheduler` over deprecated `add(..., { repeat })`. Idempotent on the scheduler id — worker restart updates the schedule instead of stacking duplicates.

```typescript
await reconciliationQueue.upsertJobScheduler(
  'sweep-abandoned-uploads-scheduler',
  { every: reconciliationIntervalMs }, // e.g. 300_000
  { name: 'sweep-abandoned-uploads', data: {} },
);
```

Worker boots via `NestFactory.createApplicationContext(WorkerModule)` (no HTTP listener) in `src/worker/main.worker.ts` (`TD-02` Option B).

## uuid (^11)

**Source:** `/uuidjs/uuid` (Context7). Installed: `uuid@^11.1.1`. Maps to `TD-04` (separate `public_id` UUID v7).

**Pin rationale:** v12+ drops CommonJS; Jest (ts-jest CJS) and the Nest CJS build cannot parse ESM-only uuid. v11 is dual CJS/ESM and exposes `v7()`.

```typescript
import { v7 as uuidv7 } from 'uuid';

uuidv7();
// ⇨ '01941f29-7c00-75f4-a310-744d2167fc5b'
```

Generated app-side in `Video.@BeforeInsert` (Postgres 17 has no native `uuidv7()`). Internal PK remains v4 via `uuid_generate_v4()` / uuid-ossp.

## FFmpeg / FFprobe (system binary — no npm pin)

**No npm package.** Maps to `TD-03` Option A (raw `child_process`). `fluent-ffmpeg` is archived (May 2025) and rejected. Binaries are installed in `Dockerfile.dev` via `apt install ffmpeg`.

Worker invocation (duration + thumbnail frame at 1s, or 0s for clips ≤2s):

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=noprint_wrappers=1:nokey=1',
  inputPath,
]);

await execFileAsync('ffmpeg', [
  '-y',
  '-ss', String(seek),
  '-i', inputPath,
  '-frames:v', '1',
  '-q:v', '2',
  outputPath,
]);
```
