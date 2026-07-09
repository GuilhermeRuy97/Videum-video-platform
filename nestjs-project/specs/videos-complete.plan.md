---
subproject: backend
runner: jest+supertest
scope: phase-03-upload-processing
si: SI-03.5
target_file: nestjs-project/test/videos-complete.e2e-spec.ts
---

# Endpoint POST /videos/:publicId/complete Test Plan

## Application Overview

`POST /videos/:publicId/complete` finalizes a presigned multipart upload: it runs `CompleteMultipartUpload` and verifies via `HeadObject` that the object landed with the declared size, transitions the draft `uploading → processing`, and enqueues the `process-video` job on the `video-processing` queue. Only the draft's owner may call it; a client that lies about completion is rejected before any processing work is enqueued.

## Test Scenarios

### 1. Upload completion & processing trigger

**Setup:** `beforeEach` truncate the `videos` and `users` tables; bootstrap the Nest app with `main.ts` global config; register and confirm two users (owner + other) and obtain their access tokens; per-scenario, create a draft via `POST /videos` and arrange storage state (uploaded object / missing object / wrong-size object) as the scenario requires; MinIO reachable; the `video-processing` queue observable (assert enqueue via a queue spy or by inspecting the queue).

#### 1.1. complete-verifies-and-enqueues

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. Given the owner's draft whose object was fully uploaded to storage, POST /videos/:publicId/complete with the matching `parts` (`part_number` + `etag`) and the owner's bearer token.
    - expect: 200
    - expect: response body `status` is `"processing"`
    - expect: the `Video` row transitions to `status = "processing"`
    - expect: one `process-video` job is enqueued on the `video-processing` queue carrying the video's id / `storage_key`

#### 1.2. complete-rejects-non-owner

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. POST /videos/:publicId/complete for a draft owned by the owner, authenticated as the other user.
    - expect: 403
    - expect: response body `error` is `"NOT_VIDEO_OWNER"`
    - expect: the `Video` row remains in `status = "uploading"`
    - expect: no `process-video` job is enqueued

#### 1.3. complete-rejects-missing-object

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. Given the owner's draft whose object was never uploaded to storage, POST /videos/:publicId/complete as the owner.
    - expect: 422
    - expect: response body `error` is `"UPLOAD_OBJECT_MISSING"`
    - expect: the `Video` row remains in `status = "uploading"`

#### 1.4. complete-rejects-size-mismatch

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. Given the owner's draft whose stored object size differs from the declared `size_bytes`, POST /videos/:publicId/complete as the owner.
    - expect: 422
    - expect: response body `error` is `"UPLOAD_SIZE_MISMATCH"`
    - expect: the `Video` row remains in `status = "uploading"`

#### 1.5. complete-rejects-already-finalized

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. POST /videos/:publicId/complete for a video already advanced past `uploading` (e.g. `processing`), as the owner.
    - expect: 409
    - expect: response body `error` is `"UPLOAD_ALREADY_FINALIZED"`
