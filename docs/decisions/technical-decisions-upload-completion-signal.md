---
scope_type: ad-hoc
related_phases: [3]
status: decided
date: 2026-07-08
scope_description: "How the backend detects that a direct-to-storage (presigned) upload has finished and reliably triggers video processing, given TD-05 keeps the API out of the byte path."
---

# Technical Decisions — Upload Completion Signal & Processing Trigger

_Subprojects in scope:_

- `nestjs-project/` — primary subproject. Owns the "complete upload" endpoint, the object-existence verification, the draft `Video` state transition (`uploading → processing`), and the enqueue of the processing job.
- `next-frontend/` — no dedicated screen in this phase. However, the recommended option makes the completion signal a **client → backend call** that is part of the same upload handshake as `phase-03-upload-processing/TD-05` (also `Scope: Cross-layer`), so the wire contract fixed here is consumed unchanged by whatever future phase builds the upload widget. No open frontend TD.

> Cross-doc anchors (already decided elsewhere — do NOT reopen):
> - **Upload protocol:** `phase-03-upload-processing/TD-05` decided **presigned direct-to-storage multipart upload** — the client uploads parts directly to storage and then "calls a 'complete upload' API endpoint to finalize." This TD decides what that completion step actually does and how reliable it is; it does not reopen the upload protocol.
> - **Object storage backend:** `phase-03-upload-processing/TD-01` decided **MinIO (self-hosted, S3-compatible)**, explicitly chosen so a later move to AWS S3 is a config change, not a rewrite, of the `StorageService` abstraction. Any option here that diverges MinIO↔S3 behavior weakens that portability and must justify it.
> - **Worker & queue topology:** `phase-03-upload-processing/TD-02` decided a **separate worker container (shared codebase, 2nd entrypoint)** consuming the queue; the queue library is `@nestjs/bullmq` (fixed by `.claude/skills/nestjs-best-practices/rules/micro-use-queues.md`, with Redis as required infra). This TD decides only the **trigger** that puts a job on that queue, not the worker or queue library.
> - **Processing work itself:** `phase-03-upload-processing/TD-03` decided raw `child_process` FFmpeg/FFprobe for metadata + thumbnail extraction — the *content* of the enqueued job. Out of scope here.

> _Note on sourcing:_ Context7 documentation fetch was unavailable at authoring time (monthly quota exceeded). The option analysis below rests on stable, long-standing S3 API behavior (`CompleteMultipartUpload`, `HeadObject`, and `s3:ObjectCreated:CompleteMultipartUpload` bucket-notification events — all supported by MinIO and AWS S3) and on `@nestjs/bullmq` repeatable jobs. None of the recommendation hinges on a version-specific API detail; re-verify exact command/config names against the installed `@aws-sdk/client-s3` (or `minio`) client at implementation time.

---

## TD-01: Upload-Completion Detection & Processing Trigger

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Automatic pre-registration of the video as a draft when upload starts", "Automatic video processing after upload (duration and metadata extraction)"

**Context:** `phase-03-upload-processing/TD-05` chose presigned direct-to-storage multipart upload: the client uploads bytes straight to MinIO/S3, so the API never sees them. For the phase's "Automatic video processing after upload" capability to hold, something must tell the backend that the object has fully landed so it can (a) transition the draft `Video` from `uploading` to `processing` and (b) enqueue the FFmpeg processing job. TD-05 mentions the client "calls a 'complete upload' API endpoint to finalize," but it does not decide the **trigger's reliability model** — specifically, whether the client callback is the source of truth, how the backend verifies the object actually exists before doing work, and what happens when a client uploads every part and then crashes or closes the tab before calling complete (leaving a draft stranded in `uploading`). This is a genuine cross-component contract (client ↔ API ↔ storage) with materially different reliability/latency trade-offs per option, so it is a strategic decision rather than an implementation detail.

**Options:**

### Option A: Client "complete" call + server-side verification, then enqueue (reconciliation sweep as safety-net)
- After finishing all presigned part uploads, the client calls the `POST /videos/:id/complete` endpoint already implied by TD-05. The backend issues `CompleteMultipartUpload` to storage (or, if the client finalized it, verifies with `HeadObject` that the object exists and matches the expected size/part manifest), transitions the draft `uploading → processing`, and enqueues the BullMQ processing job. A lightweight **repeatable BullMQ reconciliation job** sweeps drafts stuck in `uploading` past a timeout, HEADs storage, and either enqueues (object present) or marks `failed` (absent) — covering clients that upload but never call complete.
- **Pros:** Builds directly on TD-05's already-chosen client-complete handshake and stays inside the project's typed-REST / OpenAPI-contract convention (`next-frontend-openapi-typing`) — the completion call is just another typed endpoint. Processing starts **immediately** when the client finishes (no poll latency — best UX for the phase's core flow). Server-side `CompleteMultipartUpload`/`HeadObject` verification stops a lying or buggy client from enqueuing work on a non-existent object. Identical code path for MinIO and AWS S3 (both speak the same S3 API), preserving TD-01's config-only portability. No new inbound-from-storage surface to secure.
- **Cons:** Depends on the client to call complete; a client that uploads all parts then crashes leaves the draft in `uploading` until the reconciliation sweep catches it — bounded extra latency plus one more moving part. (The reconciliation job is extra code, but it doubles as the abandoned-upload cleanup the phase needs regardless.)

### Option B: Storage bucket-notification webhook → enqueue
- Configure the bucket to emit `s3:ObjectCreated:CompleteMultipartUpload` notifications on object finalization to a backend target: MinIO can POST to a webhook endpoint or publish to a Redis/AMQP/NATS target the worker consumes; AWS S3 routes to SNS/SQS/Lambda/EventBridge. The backend maps the event's object key back to the draft `Video` (via a deterministic key convention) and enqueues processing. The client's "complete" call becomes optional (UX only).
- **Pros:** Robust against client disconnects — the trigger fires from storage's own view that the object exists, independent of client behavior; no reconciliation sweep needed as the primary path; storage is the single source of truth for completion.
- **Cons:** Leaks the MinIO↔S3 abstraction TD-01 kept clean via config-only — notification configuration and target types differ substantially between MinIO (webhook/Redis/AMQP/NATS) and AWS S3 (SNS/SQS/Lambda/EventBridge), so "swap MinIO for S3 by config" no longer holds for this path. Requires a secured, storage-reachable inbound endpoint (webhook auth, replay protection) or a standing Redis/AMQP consumer; needs a deterministic object-key→draft correlation convention; and multipart uploads must filter specifically to the final `CompleteMultipartUpload` event. Meaningfully more infra and coupling for a phase whose storage is MinIO-in-Docker.

### Option C: Polling / reconciliation sweep as the primary trigger
- A periodic BullMQ **repeatable** job scans draft `Video` rows in `uploading` state and issues `HeadObject` against storage; when the object appears, it transitions the draft to `processing` and enqueues the job. Neither a client "complete" call nor storage events are relied on for triggering.
- **Pros:** Fully decoupled from both client behavior and storage-backend event features; no new inbound surface; the same sweep naturally handles abandoned-upload cleanup; portable across MinIO/S3 unchanged (plain `HeadObject`).
- **Cons:** Adds latency — processing starts only on the next poll tick, so users wait an interval after their upload finishes before anything happens (poor UX for the phase's headline flow). Polls storage for objects that may not be done yet (wasted HEADs at scale) and needs interval tuning (responsiveness vs. storage load). Better suited as Option A's safety-net than as the primary trigger.

**Recommendation:** ****Option A (client "complete" call + server-side verification, reconciliation sweep as safety-net)**** — it builds directly on TD-05's already-decided client-complete handshake, keeps the completion path inside the project's typed-REST/OpenAPI contract convention, and delivers immediate (no-poll-latency) processing on upload finish while server-side `CompleteMultipartUpload`/`HeadObject` verification guards against a client that lies about completion. Its one real weakness — a client that uploads then crashes before calling complete — is covered by a small repeatable reconciliation sweep that the phase needs anyway for abandoned-upload cleanup, which is why Option C is an implementation refinement of A rather than the primary trigger. Option B is the most robust against client disconnects but pays for it by breaking TD-01's MinIO↔S3 config-only portability (notification config diverges sharply between backends) and by adding a secured storage→backend inbound surface; reconsider B only if, in production on real S3, client-callback reliability proves insufficient despite the reconciliation net. This TD depends on TD-05 (upload protocol), TD-02 (worker/queue topology), and TD-01 (storage backend).

**Decision:** **Option A (client "complete" call + server-side verification, reconciliation sweep as safety-net)**

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Cross-layer | Upload-Completion Detection & Processing Trigger | Option A (client complete + server verification, reconciliation safety-net) | client complete + server verification, reconciliation safety-net - Option A |
