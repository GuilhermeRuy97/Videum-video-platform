---
subproject: backend
runner: jest+supertest
scope: phase-03-upload-processing
si: SI-03.8
target_file: nestjs-project/test/videos-delivery.e2e-spec.ts
---

# Video Delivery Endpoints Test Plan

## Application Overview

`GET /videos/:publicId` returns a video's metadata plus a presigned, Range-native `playback_url` the client streams directly from storage; `GET /videos/:publicId/download` issues a presigned GET URL with attachment disposition and redirects to it. `:publicId` resolves the `public_id` column. Anonymous users may watch/download `ready` videos; a non-`ready` video is visible only to its owner (who sees metadata with a null `playback_url`), and is hidden as `404` from everyone else.

## Test Scenarios

### 1. Streaming playback & download

**Setup:** `beforeEach` truncate the `videos` and `users` tables; bootstrap the Nest app with `main.ts` global config; register and confirm an owner user and obtain a token; seed a `ready` video (with `storage_key`, `thumbnail_key`, `duration_seconds`) and a `processing` video, both owned by that user; MinIO reachable so presigned URLs can be generated.

#### 1.1. get-ready-video-returns-playback-url

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. GET /videos/:publicId for the `ready` video, anonymously (no `Authorization` header).
    - expect: 200
    - expect: response body has `public_id`, `title`, `status = "ready"`, `duration_seconds`, `thumbnail_url`, and a non-empty `playback_url`

#### 1.2. get-non-ready-video-hidden-from-anonymous

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. GET /videos/:publicId for the `processing` video, anonymously.
    - expect: 404
    - expect: response body `error` is `"VIDEO_NOT_FOUND"`

#### 1.3. download-ready-video-redirects

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. GET /videos/:publicId/download for the `ready` video, anonymously (do not auto-follow the redirect).
    - expect: 302
    - expect: the `Location` header is a presigned URL carrying `response-content-disposition=attachment`

#### 1.4. owner-sees-processing-video-without-playback-url

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-07-09T18:54:13Z

**Steps:**
  1. GET /videos/:publicId for the owner's still-`processing` video, authenticated as the owner.
    - expect: 200
    - expect: response body `status` is `"processing"` and `playback_url` is `null`
