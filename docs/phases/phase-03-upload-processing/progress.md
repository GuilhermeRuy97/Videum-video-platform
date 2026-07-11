# phase-03-upload-processing — Progress

**Status:** completed
**SIs:** 8/8 completed

### Definition of Done — status
- **Unit + integration suite:** ✅ 31 suites / 186 tests green, jest exits cleanly (`npm test -- --runInBand`).
- **E2E suite:** ✅ 6 suites / 66 tests green (`npm run test:e2e`).
- **`npx tsc --noEmit`:** ✅ exit 0.
- **`npm run lint`:** ✅ **0 errors** (23 `no-unsafe-argument` warnings remain — that rule is config-downgraded to a warning and does not fail lint). Started at 193 errors, all **pre-existing and repo-wide** — broken at HEAD before Phase 03 (a typescript-eslint bump via the "Npm audit fixes" commit, reflected in the modified `package-lock.json`, turned `recommendedTypeChecked` rules — `no-unsafe-member-access` 111, `no-unsafe-assignment` 45, `require-await` 8 — into errors across `any`/mock-heavy test files, plus 6 in `channels.service.ts` error handling). Confirmed pre-existing by linting the committed, unmodified `auth.service.spec.ts` (45 errors). Fixed in two passes: (1) Phase-03 files + `channels.service.ts` (committed with the phase), then (2) the remaining 144 in phase-01/02 test files, fixed **manually** per the user's choice over relaxing the config — typed supertest `res.body` accesses, typed mock objects as their entities (`as unknown as User/VerificationToken/RefreshToken`), de-async'd no-await mock impls, typed the shared `mailpit`/`create-test-data-source` helpers, and sidestepped the jest `unbound-method` false positive via a local `asMocks()` helper (production rules unchanged). Full suite re-verified green (186 + 66) after the fixes.

**Test-infra fixes made while closing the DoD (pre-existing full-suite breakage the per-SI runs never exposed):**
- `worker.module.spec` hung/failed — worker `forFeature` needed `[Video, User, Channel]` (User↔Channel inverse). (SI-03.6)
- `videos.module.spec` — missing `BullModule.forRoot` (BullMQ → 127.0.0.1 retry storm, open handle) and missing `storageConfig` load (StorageService DI). Both leaked into and destabilized later suites.
- `migrations.integration-spec` — `Promise.all` DROP CASCADE on FK-interdependent tables deadlocked; leftover enum type broke `CREATE TYPE` on the persistent dev DB. Made DROPs sequential + drop the enum type.
- `storage.service.integration-spec` — `tsc` errors (Buffer→BodyInit, `never[]`) fixed.
- `package.json` jest config — added `testTimeout: 30000` (the auth register block's first `synchronize:true` `beforeAll` exceeds the 5000ms default now that the `videos` table enlarged the shared schema; mirrors the e2e config).

### SI-03.1 — Storage and Queue Infrastructure
- **Status:** completed
- **Tests:** 1 passing (AppModule compilation)
- **Observations:**
  - context7 was unavailable (monthly quota exceeded), so the `BullModule.forRootAsync({ connection })` shape was applied from stable `@nestjs/bullmq@^11.0.4` knowledge — re-verify against installed docs if any queue-wiring issue surfaces later.
  - `storage.config.ts` deliberately carries TWO endpoints: `endpoint` (`http://minio:9000`, server→MinIO over the Docker network) and `publicEndpoint` (`http://localhost:9000`, browser-reachable). Presigned URLs (SI-03.3) must be signed against `publicEndpoint` — the classic MinIO presigned-URL-in-Docker gotcha.
  - All storage/queue env keys use dev defaults matching `compose.yaml` (no `.env` changes required; mirrors the existing mailpit pattern).
  - `minio` service uses `service_started` (the image ships no curl/mc-alias for a clean healthcheck); `redis` uses a `redis-cli ping` healthcheck.

### SI-03.2 — Video Entity and Migration
- **Status:** completed
- **Tests:** 8 passing (7 entity integration + 1 module compilation)
- **Observations:**
  - **Pre-existing bug fixed (out of the SI's nominal scope, but blocking):** `src/test/create-test-data-source.ts` read `process.env.DB_DATABASE` (never set) and fell back to `streamtube`, while the app + `.env` use `DB_NAME=videum`. This was breaking **every** integration test in the repo (channel/user/auth all fail identically), evidently since the DB was renamed streamtube→videum. Changed the helper to read `DB_NAME`. Worth a follow-up review that the whole integration suite is green again.
  - `uuid` pinned to `^11` (not latest `^14`): v14 is ESM-only and Jest (CJS via ts-jest) can't parse it — it would also break the CJS runtime build. v11 is dual CJS/ESM and exposes `v7()`.
  - `public_id` UUID v7 is generated app-side via `@BeforeInsert` (Postgres 17 has no native `uuidv7()`); the internal PK stays v4 (`uuid_generate_v4()` via the existing uuid-ossp extension).
  - `size_bytes` stored as `bigint` with a transformer exposing a JS `number` (safe — the 10 GB cap is far below `Number.MAX_SAFE_INTEGER`).
  - `Video → User` is a **unidirectional** ManyToOne (no inverse property on `User`) to avoid modifying Phase 02 code; the FK lives on `videos.owner_id`.
  - Extended shared `cleanAllTables` to `DELETE FROM videos` first (videos FKs users).

### SI-03.3 — StorageService (MinIO S3 adapter)
- **Status:** completed
- **Tests:** 4 passing (integration vs real MinIO)
- **Observations:**
  - Implemented the two-client design from SI-03.1's note: an internal `s3` client (`minio:9000`) for direct ops (Create/Complete multipart, HeadObject, bucket create) and a `presignS3` client (`publicEndpoint`) so presigned URLs are browser-reachable.
  - context7 remained quota-blocked; AWS SDK v3 command names applied from stable knowledge (the decisions doc anticipated re-verifying at impl time — command set validated by the passing round-trip against real MinIO).
  - `forcePathStyle: true` is required for MinIO (path-style bucket addressing).
  - `StorageModule` wired into `AppModule` so `onModuleInit → ensureBucket` runs on boot (create-if-missing); the `videos` bucket is provisioned at startup. SI-03.4 will additionally import `StorageModule` into `VideosModule` to inject the service.
  - The integration test signs URLs against the internal host so the entire presigned PUT/GET round-trip is exercisable from inside the container.

### SI-03.4 — Endpoint POST /videos (draft creation + upload initiation)
- **Status:** completed
- **Tests:** 5 passing (2 unit `videos.service.spec` + 3 e2e `videos-upload.e2e-spec`)
- **Observations:**
  - **Shared e2e config fixed (affects all e2e suites):** the Phase 03 infra added to `AppModule` (StorageService's `onModuleInit → ensureBucket` network I/O + BullModule) pushed `app.init()` past the **5s default jest hook timeout**, breaking the beforeAll of *every* e2e suite (auth e2e went 45/45 failed). Added `"testTimeout": 30000` to `test/jest-e2e.json`.
  - **Serial e2e enforced:** `npm run test:e2e` parallelized files by default, so this new e2e (writes `users` + `videos`) contaminated auth e2e (writes `users`) via `cleanAllTables` — CLAUDE.md mandates e2e run serially against the shared DB but the config didn't enforce it. Added `"maxWorkers": 1` to `test/jest-e2e.json`. Both fixes restore + harden the pre-existing suites (auth e2e back to 47 passing).
  - POST /videos is protected by the **global** `JwtAuthGuard` (no `@Public()`) → automatic 401; owner is `user.sub` from `@CurrentUser()`.
  - Draft persisted with `upload_id` in a single write (upload initiated first; an orphaned multipart upload if the save fails is swept by SI-03.7).
  - DTO relies on the swagger CLI plugin (no manual `@ApiProperty`); 10 GiB cap via `@Max`.

### SI-03.5 — Endpoint POST /videos/:publicId/complete (verify + enqueue)
- **Status:** completed
- **Tests:** 14 passing (9 unit `videos.service.spec` + 5 e2e `videos-complete.e2e-spec`)
- **Observations:**
  - Added 5 domain exceptions (VIDEO_NOT_FOUND 404, NOT_VIDEO_OWNER 403, UPLOAD_ALREADY_FINALIZED 409, UPLOAD_OBJECT_MISSING 422, UPLOAD_SIZE_MISMATCH 422). The `DomainExceptionFilter` needed **no change** — it maps any `DomainException` from its own `errorCode`/`httpStatus`.
  - BullMQ queue registered via `BullModule.registerQueue({ name: 'video-processing' })`; `completeUpload` enqueues `process-video` `{ video_id, storage_key }`. This opens a Redis connection at `app.init()` for all e2e suites (covered by the SI-03.4 testTimeout bump).
  - A `completeMultipartUpload` failure is mapped to `UPLOAD_OBJECT_MISSING` (the object can't be assembled from missing/invalid parts).
  - E2E uploads real parts via a direct **internal**-endpoint S3 client (presigned part URLs point at the public host, unreachable from inside the container) and asserts the enqueue via a `queue.add` spy (no Redis pollution).

### SI-03.6 — Video Processing Worker (queue consumer + FFmpeg)
- **Status:** completed
- **Tests:** 4 passing (1 `worker.module.spec` compilation + 3 `video-processing.processor.integration-spec` against real MinIO + FFmpeg)
- **Observations:**
  - Second entrypoint `src/worker/main.worker.ts` boots a headless `ApplicationContext` (no HTTP server) via `WorkerModule`; the `video-worker` Compose service runs `npm run start:worker:dev`. FFmpeg is baked into `Dockerfile.dev` (`apt install ffmpeg`).
  - `VideoProcessingProcessor` (`@Processor('video-processing')`, `WorkerHost`) downloads the source via `StorageService.downloadToFile`, runs raw `child_process` FFprobe (duration) + FFmpeg (thumbnail frame at 1s, or 0s for clips ≤2s), uploads the thumbnail with `putObject`, and transitions `processing → ready`. On any failure it marks the video `failed` and rethrows (BullMQ retry). Idempotent: an already-`ready` video is skipped.
  - **Worker entity-graph fix:** the worker `TypeOrmModule.forFeature` initially registered only `[Video, User]` and failed at metadata build with `Entity metadata for User#channel was not found` — `User`'s `@OneToOne(() => Channel)` inverse requires `Channel` in the connection. Registered `[Video, User, Channel]` (the minimal connected graph; `RefreshToken`/`VerificationToken` have no inverse from these three). This was the true completion blocker — the compilation test hung/failed until fixed.
  - **Clean jest exit:** with the module failing to init, a half-open BullMQ Redis connection kept jest alive ("Jest did not exit…"). With the module compiling and `moduleRef.close()` tearing BullMQ down, both specs run in-band and exit with code 0 (verified via `--detectOpenHandles`: no lingering handles).
  - Added `StorageService.downloadToFile` (streams `GetObject` body to a local file via `stream/promises.pipeline`) and `putObject` (single-object upload for the thumbnail) in support of the worker.

### SI-03.7 — Upload Reconciliation Sweep (abandoned-upload safety-net)
- **Status:** completed
- **Tests:** 3 passing (`upload-reconciliation.processor.integration-spec` against real MinIO + DB; worker.module.spec re-verified with the new processor registered)
- **Observations:**
  - `UploadReconciliationProcessor` (`@Processor('upload-reconciliation')`) queries `Video` rows `status = uploading` AND `created_at < now − abandonedUploadTimeoutMs` (uses the SI-03.2 composite `(status, created_at)` index), `HeadObject`s each, and either rescues (`status → processing`, `upload_id → null`, enqueue `process-video`) or fails (`status → failed`) it. Per-draft errors are caught+logged so one bad draft can't abort the sweep (background-task error rule).
  - Repeatable job registered at worker bootstrap in `main.worker.ts` via **`queue.upsertJobScheduler(schedulerId, { every }, { name, data })`** — the modern BullMQ v5 Job Scheduler API (verified present on `Queue.prototype` in the installed `bullmq@5.79.3`; context7 remained quota-blocked). `upsertJobScheduler` is idempotent on the scheduler id, so a worker restart updates the schedule rather than stacking duplicate jobs (the deprecated `add(..., { repeat })` path is avoided).
  - New config keys `RECONCILIATION_INTERVAL_MS` (default 300000 / 5 min) and `ABANDONED_UPLOAD_TIMEOUT_MS` (default 3600000 / 1 h — matches the presign expiry; past it the upload URLs are dead) in `queue.config.ts` + Joi schema, both with dev defaults (no `.env` change needed).
  - **Pre-existing tsc debt fixed (SI-03.3 file, blocking the phase DoD):** `storage.service.integration-spec.ts` failed `npx tsc --noEmit` — a Node `Buffer` passed to `fetch` (not assignable to `BodyInit` under `@types/node` 22) and a `const completed = []` inferring `never[]`. ts-jest's per-file compile hid both, so the SI-03.3 suite passed while full `tsc` was red. Fixed with a `new Uint8Array(body)` view and a `CompletedPart[]` annotation. `npx tsc --noEmit` now exits 0.

### SI-03.8 — Video Delivery Endpoints (streaming + download)
- **Status:** completed
- **Tests:** 16 passing (10 unit added to `videos.service.spec` for `getForPlayback`/`getDownloadUrl` + 6 e2e `videos-delivery.e2e-spec`). Guard change covered by 3 new `jwt-auth.guard.spec` cases.
- **Observations:**
  - **Optional auth added to the global guard (not a local guard — the convention forbids that):** new `@OptionalAuth()` decorator + `IS_OPTIONAL_AUTH_KEY` branch in `JwtAuthGuard`. On an optional route a valid bearer token attaches `request.user`; a missing/invalid token falls through as anonymous (no 401). This is what lets `GET /videos/:publicId` be anonymous-watchable yet owner-aware. `@CurrentUser()` returns `undefined` for anonymous callers (controller params typed `JwtPayload | undefined`).
  - **Contract reconciliation (plan had an internal inconsistency):** the SI-03.8 acceptance criteria (authoritative) require the **metadata** endpoint to return `200` with `playback_url: null` to the owner of a non-`ready` video, while the Error Catalog listed `409 VIDEO_NOT_READY` on the same endpoint. Resolved by placing `409 VIDEO_NOT_READY` on **`GET /videos/:publicId/download`** only (owner downloading a non-`ready` video); the metadata endpoint never returns 409. Non-`ready` + non-owner/anonymous → `404 VIDEO_NOT_FOUND` on both endpoints (existence hidden). All four acceptance criteria pass.
  - `VideosService.getForPlayback` / `getDownloadUrl` share a `findVisibleVideo` helper enforcing the visibility rule. Playback/thumbnail/download URLs are presigned via `StorageService.getPresignedGetUrl` (signed against the public endpoint, Range-native GET; download carries `response-content-disposition: attachment` with the original filename).
  - Download uses NestJS `@Redirect()` returning `{ url, statusCode: 302 }` — a dynamic redirect, so no bytes pass through the API. Added `VIDEO_NOT_READY` (409) domain exception; `DomainExceptionFilter` needed no change.
  - Delivery e2e seeds `Video` rows directly (presigning needs no real object) behind a registered owner (satisfies the `owner_id` FK); anonymous requests send no `Authorization` header.
