---
subproject: backend
runner: jest+supertest
scope: phase-03-upload-processing
si: SI-03.4
target_file: nestjs-project/test/videos-upload.e2e-spec.ts
---

# Endpoint POST /videos Test Plan

## Application Overview

`POST /videos` pre-registers a draft `Video` for the authenticated user and initiates a presigned direct-to-storage multipart upload, returning the `upload_id` and presigned part URLs the client uploads bytes to. The API never receives the file itself. The draft is created in `uploading` status with a unique UUID v7 `public_id`, and the size is capped at 10 GB.

## Test Scenarios

### 1. Draft creation & upload initiation

**Setup:** `beforeEach` truncate the `videos` and `users` tables; bootstrap the Nest app reproducing `main.ts` global config (ValidationPipe + domain exception filter); register and confirm a user and obtain a JWT access token; MinIO reachable via the storage config.

#### 1.1. create-draft-returns-presigned-upload

**Covers AC:** #1, #4
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. POST /videos with `Authorization: Bearer <access_token>` and a valid body `{ title, filename, content_type, size_bytes }` within the 10 GB cap.
    - expect: 200-class status 201
    - expect: response body has `public_id` (uuid), `upload_id` (string), `storage_key` (string), and a non-empty `parts` array of `{ part_number, url }`
    - expect: a `Video` row now exists with `status = "uploading"` and the returned `public_id`
    - expect: the persisted `public_id` is unique (a second create yields a different `public_id`)

#### 1.2. create-draft-requires-authentication

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. POST /videos with no `Authorization` header and an otherwise valid body.
    - expect: 401
    - expect: no `Video` row is created

#### 1.3. create-draft-rejects-oversize

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. POST /videos with `Authorization: Bearer <access_token>` and `size_bytes` greater than 10 GB.
    - expect: 400
    - expect: response body `error` is `"VALIDATION_ERROR"`
    - expect: no `Video` row is created
