---
kind: phase
name: phase-03-upload-processing
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-upload-processing/context.md: "2026-07-08T18:11:03.855589200-03:00"
  docs/project-plan.md: "2026-06-28T19:38:56.891944000-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-07-08T18:04:18.204062600-03:00"
  docs/decisions/technical-decisions-upload-completion-signal.md: "2026-07-08T17:30:52.053757500-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-06-28T17:41:07.229837100-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-06-28T17:41:07.227836700-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-06-28T17:41:07.227836700-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-06-28T17:41:07.228891500-03:00"
  docs/phases/phase-01-base-configuration/context.md: "2026-06-28T17:41:07.237843800-03:00"
  docs/phases/phase-02-auth/context.md: "2026-06-28T17:41:07.244835500-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-06-28T17:41:07.240836500-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-06-28T17:41:07.117300600-03:00"
---

# Phase 03 — Upload and Video Processing

## Objective

Deliver the backend upload-and-processing pipeline: MinIO object storage for videos and thumbnails, presigned direct-to-storage multipart upload of files up to 10GB (API out of the byte path), automatic draft pre-registration plus a verified upload-completion signal that enqueues background FFmpeg processing (duration/metadata extraction and thumbnail generation) on a separate worker container, a unique public URL per video, and presigned Range-native streaming/download delivery.

---

## Step Implementations

### SI-03.1 — Storage and Queue Infrastructure

**Description:** Provision MinIO object storage and the Redis-backed BullMQ queue, install the SDK/queue dependencies, and wire their config namespaces — the infrastructure every later SI builds on.

**Technical actions:**

1. Add `minio` and `redis` services to `compose.yaml`, using Compose service names as hosts (per `phase-03-upload-processing/TD-01`, `phase-03-upload-processing/TD-02`).
2. Install `@aws-sdk/client-s3`, `@nestjs/bullmq`, and `bullmq` in the `nestjs-api` container.
3. Create `src/config/storage.config.ts` and `src/config/queue.config.ts` as `registerAs` namespaces (MinIO endpoint/credentials/bucket/part size; Redis host/port) and extend the Joi env schema with their keys (per `## Inherited Conventions`).
4. Register `BullModule.forRootAsync` (Redis connection from `queueConfig`) in `AppModule` (per `phase-03-upload-processing/TD-02`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `AppModule` (queue + storage config) | Unit: compilation — config namespaces + `BullModule` DI resolve | `src/app.module.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose ps` shows `minio` and `redis` running and healthy.
- Booting the app with the storage/queue env keys present starts cleanly; a missing required key aborts startup via Joi validation.

---

### SI-03.2 — Video Entity and Migration

**Description:** Define the `Video` entity (draft lifecycle, `public_id`, storage/metadata fields) with its migration and module registration — the persistence backbone of the phase.

**Technical actions:**

1. Create `src/videos/entities/video.entity.ts` per `## Technical Specifications → ### Data Model → Video`, including the UUID v7 `public_id`, the `status` enum, and the declared indexes (per `phase-03-upload-processing/TD-04`).
2. Generate the migration for the `videos` table + unique/composite indexes (`migration:generate`, per `## Inherited Conventions`).
3. Create `src/videos/videos.module.ts` with `TypeOrmModule.forFeature([Video])` and register it in `AppModule`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: unique `public_id` + `storage_key`, default `status = uploading`, timestamp defaults, enum values | `src/videos/entities/video.entity.integration-spec.ts` |
| `VideosModule` | Unit: compilation | `src/videos/videos.module.spec.ts` |

**Dependencies:** none _(TypeORM + migration runner exist from Phase 01)_

**Acceptance criteria:**

- Inserting two videos with the same `public_id` or `storage_key` is rejected by a unique-constraint violation.
- A newly persisted `Video` defaults to `status = uploading` with populated `created_at`/`updated_at`.
- `public_id` is a UUID v7 distinct from the v4 primary key.
- Running the migration creates the `videos` table with the composite (`status`, `created_at`) index.

---

### SI-03.3 — StorageService (MinIO S3 adapter)

**Description:** Encapsulate all object-storage interactions (multipart initiate/complete, object verification, presigned URLs) behind a single `StorageService` so the rest of the phase stays storage-agnostic.

**Technical actions:**

1. Create `src/storage/storage.service.ts` — construct the S3 client from `storageConfig` and expose `initiateMultipartUpload`, `getPresignedPartUrls`, `completeMultipartUpload`, `headObject`, and `getPresignedGetUrl` (per `phase-03-upload-processing/TD-01`, `TD-05`, `TD-06`).
2. Create `src/storage/storage.module.ts` exporting `StorageService`; import it where needed (e.g., `VideosModule`).
3. Ensure the configured bucket exists on startup (create-if-missing) (per `phase-03-upload-processing/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageService` | Integration: real MinIO — multipart initiate→complete round-trip, `headObject` on present vs absent object, presigned GET serves bytes with a `Range` request | `src/storage/storage.service.integration-spec.ts` |

**Dependencies:** SI-03.1 (MinIO + storage config)

**Acceptance criteria:**

- A multipart upload initiated and completed via `StorageService` yields an object retrievable by its `storage_key`.
- `headObject` returns size/metadata for an existing object and signals absence for a missing key.
- A presigned GET URL streams the object and honors HTTP `Range` requests.

---

### SI-03.4 — Endpoint POST /videos (draft creation + upload initiation)

**Description:** Expose the authenticated endpoint that pre-registers a draft `Video` and returns presigned multipart part URLs, keeping the API out of the byte path.

**Route:** POST /videos
**Test Specs:** see `nestjs-project/specs/videos-upload.plan.md`
**Authorization:** Authenticated — the draft is owned by the creating user

**Technical actions:**

1. Create `src/videos/dto/create-video.dto.ts` with `title`, `filename`, `content_type`, `size_bytes` and the class-validator rules from `### API Contracts → Validation Rules — Video draft creation` (10 GB cap, per `phase-03-upload-processing/TD-05`).
2. Add `VideosService.createDraft(ownerId, dto)` — persist a `Video` (`status = uploading`, generated `public_id`, computed `storage_key`) and call `StorageService.initiateMultipartUpload` + `getPresignedPartUrls` (per `upload-completion-signal/TD-01`, `phase-03-upload-processing/TD-04`, `TD-05`).
3. Add `VideosController` `POST /videos` behind the inherited JWT access-token guard, returning `201` per `### API Contracts → POST /videos`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.createDraft` | Unit: branch logic (mock repo + `StorageService`) — draft persisted, part URLs returned, over-size rejected | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.2 (Video entity), SI-03.3 (StorageService)

**Acceptance criteria:**

- `POST /videos` with a valid body returns `201` with `public_id`, `upload_id`, and presigned `parts`.
- `POST /videos` without a valid access token returns `401`.
- `POST /videos` with `size_bytes` above 10 GB returns `400` with `error: "VALIDATION_ERROR"`.
- A `Video` row is persisted with `status = uploading` and a unique `public_id`.

---

### SI-03.5 — Endpoint POST /videos/:publicId/complete (verify + enqueue)

**Description:** Finalize the upload: verify the object landed in storage, transition the draft to `processing`, and enqueue the processing job — the reliable trigger for automatic processing.

**Route:** POST /videos/:publicId/complete
**Test Specs:** see `nestjs-project/specs/videos-complete.plan.md`
**Authorization:** Owner

**Technical actions:**

1. Create `src/videos/dto/complete-upload.dto.ts` validating `parts` as `{ part_number, etag }[]`.
2. Add `VideosService.completeUpload(ownerId, publicId, dto)` — ownership check, `StorageService.completeMultipartUpload` + `headObject` verification (size/parts), transition `uploading → processing`, enqueue the `process-video` job on the `video-processing` queue (per `upload-completion-signal/TD-01`, `phase-03-upload-processing/TD-02`).
3. Add `VideosController` `POST /videos/:publicId/complete` behind the JWT guard, returning `200` per `### API Contracts`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.completeUpload` | Unit: branch logic (mock repo/`StorageService`/queue) — ownership, verify-success, object-missing, size-mismatch, already-finalized | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.4 (draft exists), SI-03.3 (StorageService), SI-03.1 (queue)

**Acceptance criteria:**

- `POST …/complete` by the owner with matching parts returns `200` with `status: "processing"` and enqueues a `process-video` job.
- `POST …/complete` by a non-owner returns `403 NOT_VIDEO_OWNER`.
- `POST …/complete` with no finalized object in storage returns `422 UPLOAD_OBJECT_MISSING`.
- `POST …/complete` when the verified size differs from `size_bytes` returns `422 UPLOAD_SIZE_MISMATCH`.
- `POST …/complete` on a video not in `uploading` returns `409 UPLOAD_ALREADY_FINALIZED`.

---

### SI-03.6 — Video Processing Worker (queue consumer + FFmpeg)

**Description:** Run the separate worker process that consumes processing jobs and uses FFmpeg/FFprobe to extract duration/metadata and a thumbnail, then marks the video `ready`.

**Technical actions:**

1. Create `src/worker/main.worker.ts` — a second bootstrap entrypoint (application context, no HTTP server) for the worker process (per `phase-03-upload-processing/TD-02`).
2. Create `src/videos/processors/video-processing.processor.ts` — a BullMQ `@Processor('video-processing')` that fetches the object via `StorageService`, runs raw `child_process` FFprobe (duration/metadata) and FFmpeg (thumbnail frame), uploads the thumbnail, and transitions `processing → ready` (or `failed` on error) (per `phase-03-upload-processing/TD-03`, `TD-02`).
3. Add FFmpeg to the worker image (`Dockerfile`) and add the `video-worker` service running `main.worker` to `compose.yaml` (per `phase-03-upload-processing/TD-02`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoProcessingProcessor` | Integration: real MinIO + a small sample video — `duration_seconds` + `thumbnail_key` populated and status → `ready`; corrupt input → `failed` | `src/videos/processors/video-processing.processor.integration-spec.ts` |

**Dependencies:** SI-03.5 (jobs are enqueued), SI-03.3 (StorageService), SI-03.2 (Video entity), SI-03.1 (queue + FFmpeg infra)

**Acceptance criteria:**

- Processing a valid uploaded video populates `duration_seconds` and `thumbnail_key` and sets `status = ready`.
- Processing a corrupt/unreadable object sets `status = failed` without crashing the worker.
- Re-running the job for an already-`ready` video is a no-op (idempotent).

---

### SI-03.7 — Upload Reconciliation Sweep (abandoned-upload safety-net)

**Description:** Add the repeatable job that rescues or fails drafts whose client uploaded the parts but never called complete — the safety-net behind the primary trigger.

**Technical actions:**

1. Register the repeatable `sweep-abandoned-uploads` job on the `upload-reconciliation` queue at worker bootstrap, on a fixed interval (per `upload-completion-signal/TD-01`).
2. Create `src/videos/processors/upload-reconciliation.processor.ts` — scan `Video` rows in `uploading` past the timeout, `HeadObject` each, enqueue `process-video` when the object exists else transition to `failed` (per `upload-completion-signal/TD-01`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `UploadReconciliationProcessor` | Integration: seeded stale drafts + MinIO — present object → enqueued/`processing`, absent → `failed`; recent drafts untouched | `src/videos/processors/upload-reconciliation.processor.integration-spec.ts` |

**Dependencies:** SI-03.6 (worker bootstrap + `process-video` queue), SI-03.2 (Video entity), SI-03.3 (StorageService)

**Acceptance criteria:**

- A draft stuck in `uploading` past the timeout whose object exists is moved to `processing` and a `process-video` job is enqueued.
- A draft stuck in `uploading` past the timeout with no stored object is moved to `failed`.
- A recently-created draft within the timeout window is left untouched.

---

### SI-03.8 — Video Delivery Endpoints (streaming + download)

**Description:** Expose the public endpoints that return presigned, Range-native URLs for streaming playback and for attachment download — no bytes through the API.

**Route:** GET /videos/:publicId ; GET /videos/:publicId/download
**Test Specs:** see `nestjs-project/specs/videos-delivery.plan.md`
**Authorization:** Anonymous for `ready` videos; owner for any status

**Technical actions:**

1. Add `VideosService.getForPlayback(publicId, requester?)` — resolve by `public_id`, enforce visibility (anonymous/non-owner only when `ready`), and build presigned playback + thumbnail GET URLs via `StorageService` (per `phase-03-upload-processing/TD-06`, `TD-04`).
2. Add `VideosService.getDownloadUrl(publicId, requester?)` — presigned GET URL carrying `response-content-disposition: attachment` (per `phase-03-upload-processing/TD-06`).
3. Add `VideosController` `GET /videos/:publicId` (`200` metadata + `playback_url`) and `GET /videos/:publicId/download` (`302` redirect), anonymous-allowed per `### Authorization Matrix`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.getForPlayback` / `getDownloadUrl` | Unit: branch logic (mock repo/`StorageService`) — ready vs non-ready visibility, owner vs anonymous, URL shape | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.2 (Video entity), SI-03.3 (StorageService)

**Acceptance criteria:**

- `GET /videos/:publicId` for a `ready` video returns `200` with metadata and a `playback_url`.
- `GET /videos/:publicId` for a non-`ready` video by an anonymous requester returns `404 VIDEO_NOT_FOUND`.
- `GET /videos/:publicId/download` for a `ready` video returns `302` to a presigned attachment URL.
- `GET /videos/:publicId` by the owner of a still-`processing` video returns `200` with `playback_url: null`.

---

## Technical Specifications

### Data Model

#### Video

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK, generated (v4) |
| public_id | uuid | not null, unique, generated **UUID v7** — public-facing identifier used in every client URL, decoupled from the internal PK (per `phase-03-upload-processing/TD-04`) |
| owner_id | uuid | not null, FK → `User.id` — the uploading user; ownership anchor for authorization |
| title | varchar(255) | not null |
| original_filename | varchar(255) | not null |
| storage_key | varchar(512) | not null, unique — object key in the MinIO bucket (per `phase-03-upload-processing/TD-01`) |
| upload_id | varchar(255) | nullable — S3 multipart upload id; set at draft creation, cleared after completion (per `phase-03-upload-processing/TD-05`) |
| size_bytes | bigint | not null — client-declared upload size, verified on completion |
| content_type | varchar(127) | not null |
| status | enum: `uploading` \| `processing` \| `ready` \| `failed` | not null, default `uploading` |
| duration_seconds | integer | nullable — extracted by the worker via FFprobe (per `phase-03-upload-processing/TD-03`) |
| thumbnail_key | varchar(512) | nullable — object key of the generated thumbnail (per `phase-03-upload-processing/TD-03`) |
| created_at | timestamptz | not null, default now() |
| updated_at | timestamptz | not null, default now(), on update now() |

**Relations:** `Video` belongs to `User` (owner, many-to-one on `owner_id`).
**Indexes:** unique on `public_id`; unique on `storage_key`; composite index on (`status`, `created_at`) — supports the reconciliation sweep querying drafts stuck in `uploading` past a timeout (per `upload-completion-signal/TD-01`).
**Notes:** entity PKs use UUID **v4** (project convention); `public_id` deliberately uses UUID **v7** for chronological sortability — the codebase carries both versions by design (per `phase-03-upload-processing/TD-04`).

---

### API Contracts

_Authenticated endpoints use the inherited JWT access-token guard (`Authorization: Bearer <access_token>`, per phase-02-auth). The API never touches file bytes — uploads and delivery go directly to storage via presigned URLs (per `phase-03-upload-processing/TD-05`, `phase-03-upload-processing/TD-06`)._

#### POST /videos (SI-03.4)

Creates the draft `Video` and initiates the presigned direct-to-storage multipart upload (per `phase-03-upload-processing/TD-05`, `upload-completion-signal/TD-01`).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- title: string, required — max 255
- filename: string, required — original filename, max 255
- content_type: string, required — MIME type of the upload
- size_bytes: integer, required — total upload size in bytes; must be ≤ 10 GB (per `phase-03-upload-processing/TD-05`)

**Response 201:**
- public_id: string (uuid v7) — public identifier for all subsequent URLs
- upload_id: string — S3 multipart upload id
- storage_key: string — object key the parts are uploaded under
- parts: array of `{ part_number: integer, url: string }` — presigned PUT URLs, one per part (count = ceil(size_bytes / part_size))

**Error responses:**
- 401: when no valid access token is present
- 400 VALIDATION_ERROR: when the body fails schema validation (missing/invalid field, or size_bytes over the 10 GB cap)

---

#### POST /videos/:publicId/complete (SI-03.5)

Finalizes the multipart upload, verifies the object server-side, transitions the draft `uploading → processing`, and enqueues the processing job (per `upload-completion-signal/TD-01`). `:publicId` resolves the `public_id` column.

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer <access_token>

**Request body:**
- parts: array of `{ part_number: integer, etag: string }`, required — the ETags storage returned for each uploaded part, used for `CompleteMultipartUpload`

**Response 200:**
- public_id: string
- status: string — `processing`

**Error responses:**
- 401: when no valid access token is present
- 403 NOT_VIDEO_OWNER: when the authenticated user is not the draft's owner
- 404 VIDEO_NOT_FOUND: when no video matches `:publicId`
- 409 UPLOAD_ALREADY_FINALIZED: when the video is not in `uploading` state
- 422 UPLOAD_OBJECT_MISSING: when server-side `CompleteMultipartUpload`/`HeadObject` finds no finalized object (per `upload-completion-signal/TD-01`)
- 422 UPLOAD_SIZE_MISMATCH: when the verified stored size differs from `size_bytes`

---

#### GET /videos/:publicId (SI-03.8)

Returns video metadata plus a presigned, Range-native playback URL the client streams directly from storage (per `phase-03-upload-processing/TD-06`). Anonymous access is allowed for `ready` videos.

**Request headers:**
- Authorization: Bearer <access_token> _(optional — anonymous allowed for `ready` videos)_

**Response 200:**
- public_id: string
- title: string
- status: string
- duration_seconds: integer | null
- thumbnail_url: string | null — presigned GET URL for the thumbnail
- playback_url: string | null — presigned GET URL (Range-native) for the video object; null until `ready`

**Error responses:**
- 404 VIDEO_NOT_FOUND: when no video matches `:publicId`, or the video is not `ready` and the requester is not the owner
- 409 VIDEO_NOT_READY: when the owner requests playback of a video still `uploading`/`processing` (metadata is returned, `playback_url` is null)

---

#### GET /videos/:publicId/download (SI-03.8)

Issues a presigned GET URL with attachment disposition and redirects to it, for native browser download (per `phase-03-upload-processing/TD-06`). Anonymous access is allowed for `ready` videos.

**Request headers:**
- Authorization: Bearer <access_token> _(optional — anonymous allowed for `ready` videos)_

**Response 302:** Redirect (`Location`) to a presigned GET URL carrying `response-content-disposition: attachment`.

**Error responses:**
- 404 VIDEO_NOT_FOUND: when no video matches `:publicId`, or the video is not `ready` and the requester is not the owner
- 409 VIDEO_NOT_READY: when the video's processing has not completed

#### Validation Rules — Video draft creation

| Field | Rule | Error message |
|-------|------|---------------|
| title | Required, non-empty, max 255 | title should not be empty |
| filename | Required, non-empty, max 255 | filename should not be empty |
| content_type | Required, non-empty | content_type should not be empty |
| size_bytes | Required, integer > 0, ≤ 10 GB (10 × 1024³ bytes) | size_bytes must not exceed 10 GB |

---

### Authorization Matrix

| Endpoint | Anonymous | Authenticated (non-owner) | Owner | Notes |
|----------|-----------|---------------------------|-------|-------|
| POST /videos | ✗ | ✓ | ✓ | Any authenticated user creates their own draft |
| POST /videos/:publicId/complete | ✗ | ✗ | ✓ | Only the draft's owner may finalize |
| GET /videos/:publicId | ✓ | ✓ | ✓ | Anonymous/non-owner only when `ready`; owner sees any status |
| GET /videos/:publicId/download | ✓ | ✓ | ✓ | Anonymous/non-owner only when `ready`; owner sees any status |

_Anonymous watch/download is a platform rule (project overview: anonymous users watch freely). Mutations require authentication; completion additionally requires ownership. A non-`ready` video is visible only to its owner (for polling processing state)._

---

### Error Catalog

_Error response shape is inherited from `phase-02-auth` (`{ statusCode: number, error: string, message: string }`; the `error` field carries the domain code, `VALIDATION_ERROR` for schema failures — per phase-02-auth/TD-07, `## Inherited Conventions`). Phase 03 adds the following domain codes:_

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_NOT_FOUND | 404 | Video not found | GET/POST on a `public_id` with no match, or a non-`ready` video requested by a non-owner |
| NOT_VIDEO_OWNER | 403 | Not the video owner | POST /videos/:publicId/complete by an authenticated user who is not the draft's owner |
| UPLOAD_ALREADY_FINALIZED | 409 | Upload already finalized | POST /videos/:publicId/complete when the video is not in `uploading` state |
| UPLOAD_OBJECT_MISSING | 422 | Uploaded object not found in storage | Server-side `CompleteMultipartUpload`/`HeadObject` finds no finalized object (per `upload-completion-signal/TD-01`) |
| UPLOAD_SIZE_MISMATCH | 422 | Uploaded size does not match declared size | Verified stored object size differs from the declared `size_bytes` |
| VIDEO_NOT_READY | 409 | Video is not ready for playback | Playback/download requested for a video whose processing has not completed |

---

### Events/Messages

#### process-video (queue: `video-processing`)

**Payload:**

```json
{ "video_id": "uuid", "storage_key": "string" }
```

**Producer:** `VideosService` on upload completion (per `upload-completion-signal/TD-01`)
**Consumer:** video-processing worker — a separate container on the shared codebase consuming the queue (per `phase-03-upload-processing/TD-02`); runs raw `child_process` FFprobe (duration/metadata) + FFmpeg (thumbnail frame extraction) (per `phase-03-upload-processing/TD-03`)
**Trigger:** enqueued after `POST /videos/:publicId/complete` verifies the object and transitions the draft `uploading → processing`
**Delivery semantics:** at-least-once (BullMQ default; the processor must be idempotent — re-running on an already-`ready` video is a no-op) (per `phase-03-upload-processing/TD-02`)

#### sweep-abandoned-uploads (queue: `upload-reconciliation`, repeatable)

**Payload:**

```json
{}
```

**Producer:** a repeatable BullMQ job registered at worker bootstrap (per `upload-completion-signal/TD-01`)
**Consumer:** reconciliation processor in the worker container (per `phase-03-upload-processing/TD-02`)
**Trigger:** fires on a fixed repeat interval; scans `Video` rows stuck in `uploading` past a timeout, issues `HeadObject`, and either enqueues `process-video` (object present) or transitions the draft to `failed` (object absent)
**Delivery semantics:** best-effort, idempotent sweep — the safety-net for clients that upload every part then never call complete (per `upload-completion-signal/TD-01`)

---

## Dependency Map

```
SI-03.1 (root — MinIO + Redis/BullMQ infrastructure)
└── SI-03.3 — depends on SI-03.1 (StorageService needs storage config)

SI-03.2 (root — Video entity, independent)

SI-03.2 + SI-03.3
├── SI-03.4 — depends on SI-03.2, SI-03.3 (draft creation + upload initiation)
│   └── SI-03.5 — depends on SI-03.4, SI-03.3, SI-03.1 (upload completion + enqueue)
│       └── SI-03.6 — depends on SI-03.5, SI-03.3, SI-03.2, SI-03.1 (processing worker)
│           └── SI-03.7 — depends on SI-03.6, SI-03.2, SI-03.3 (reconciliation sweep)
└── SI-03.8 — depends on SI-03.2, SI-03.3 (delivery endpoints)
```

Linearized implementation order: SI-03.1, SI-03.2 (parallel roots) → SI-03.3 → SI-03.4 → SI-03.5 → SI-03.6 → SI-03.7. SI-03.8 depends only on SI-03.2 + SI-03.3, so it runs in parallel with the SI-03.4 → SI-03.7 chain once SI-03.3 lands.

---

## Deliverables

- [ ] SI-03.1 — Storage and Queue Infrastructure
- [ ] SI-03.2 — Video Entity and Migration
- [ ] SI-03.3 — StorageService (MinIO S3 adapter)
- [ ] SI-03.4 — Endpoint POST /videos (draft creation + upload initiation)
- [ ] SI-03.5 — Endpoint POST /videos/:publicId/complete (verify + enqueue)
- [ ] SI-03.6 — Video Processing Worker (queue consumer + FFmpeg)
- [ ] SI-03.7 — Upload Reconciliation Sweep (abandoned-upload safety-net)
- [ ] SI-03.8 — Video Delivery Endpoints (streaming + download)

**Capability outcomes:**

- [ ] Functional upload of files up to 10 GB via presigned direct-to-storage multipart (API out of the byte path)
- [ ] Draft pre-registration on upload start + verified completion signal that reliably triggers processing
- [ ] Automatic processing extracts duration/metadata and generates a thumbnail on a separate worker
- [ ] Abandoned uploads are reconciled (rescued or failed) without manual intervention
- [ ] Unique public URL per video (UUID v7 `public_id`)
- [ ] Streaming playback and download via presigned, Range-native URLs

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] Backend E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] TypeScript compiles cleanly (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Build succeeds (`docker compose exec nestjs-api npm run build`)
