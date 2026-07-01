---
scope_type: phase
related_phases: [3]
status: pending
date: 2026-07-01
scope_description: "Backend foundation for video upload and processing: object storage, background job queue and worker topology, FFmpeg-based metadata/thumbnail extraction, unique video URL generation, large-file upload protocol, and streaming/download delivery mechanism."
---

# Technical Decisions — Phase 03: Upload and Video Processing

_Subprojects in scope:_

- `nestjs-project/` — primary subproject. Owns the object storage integration, the background job queue and worker process, FFmpeg-based video/thumbnail processing, unique video URL generation, and the upload/streaming/download HTTP endpoints.
- `next-frontend/` — no dedicated screens in this phase (`docs/project-plan.md` names no upload-form or player capability for Phase 03 — the player is Phase 05's "Video player with controls"; no phase explicitly owns an upload form either). However, TD-05 (upload protocol) and TD-06 (delivery mechanism) are `Scope: Cross-layer` — they fix the wire contract (upload handshake, streaming/range behavior) that whichever future phase builds the upload widget and player will consume unchanged.

> Cross-doc anchors (already decided or resolved elsewhere — do NOT reopen):
> - **Entity primary keys:** every existing entity (`User`, `Channel`, `RefreshToken`, `VerificationToken`) uses `@PrimaryGeneratedColumn('uuid')` (`.claude/skills/typeorm/rules/entity-primary-key-strategy.md`, `.claude/rules/nestjs-entities.md`). The `Video` entity inherits this convention for its internal PK; only the *public URL identifier* is an open question (TD-04).
> - **Queue library:** `.claude/skills/nestjs-best-practices/rules/micro-use-queues.md` already prescribes `@nestjs/bullmq` unconditionally for background job processing in this project — this is a best-practices default, not a genuine alternative-bearing decision, so it is **not** re-litigated as a TD here (per the research skill's (d) test). It is treated as a given constraint feeding TD-02. Redis is therefore a new required infra piece regardless of which TD-02 option is chosen.
> - **Object storage testing strategy:** `.claude/skills/testing-guide-nestjs-project/references/external-systems.md` already fixes "local filesystem in dev/test, behind a `StorageService` abstraction" as the **testing** convention — this document does not reopen how storage is tested, only which backend the abstraction targets in staging/production (TD-01).
> - **Architecture diagram signal (`docs/diagrams/software-arch.mermaid`):** `Rel(api, storage, "Uploads")` and `Rel(frontend, storage, "Streams", "HTTPS")` — the diagram already sketches an asymmetry (uploads flow through the API; playback streams directly frontend↔storage). This is a C4-level sketch, not a formal TD, so it is treated as strong context/precedent in TD-05 and TD-06, not as a foreclosed decision.

---

## TD-01: Object Storage Backend

**Scope:** Backend

**Capability:** File storage service (videos and thumbnails)

**Context:** The architecture diagram marks Object Storage as "S3 or MinIO" — explicitly undecided. The backend needs a place to persist uploaded video files and generated thumbnails, reachable both from the API (writes during upload/processing) and from whatever mechanism TD-06 picks for playback/download. The testing convention (local filesystem behind a `StorageService` abstraction) is already fixed and is not reopened here; this TD picks what that abstraction targets outside of tests.

**Options:**

### Option A: MinIO (self-hosted, S3-compatible)
- A `minio/minio` container added to `nestjs-project/compose.yaml`, exposing an S3-compatible API. Accessed via `@aws-sdk/client-s3` (with `forcePathStyle: true` and a custom `endpoint`) or the native `minio` npm client.
- **Pros:** Fully self-hosted and Dockerized — matches the project's existing pattern of running every infra dependency in `compose.yaml` (`db`, `mailpit`); no cloud account or credentials needed for any contributor to run the project locally; free; S3-API-compatible, so the `StorageService` abstraction can be pointed at real AWS S3 later via config only, no code rewrite.
- **Cons:** One more container to run and operate; the project would own MinIO's durability/scaling/backup story if used in production. `@aws-sdk/client-s3` v3 presigned URLs against MinIO have documented edge cases (signature/port mismatches reported against MinIO — see Sources) — avoidable with correct `forcePathStyle`/endpoint config or by using the native `minio` client for presign operations, but a real integration detail to get right.

### Option B: AWS S3 (managed cloud)
- Real AWS S3 bucket, accessed via `@aws-sdk/client-s3`.
- **Pros:** Fully managed durability, scaling, and replication; the SDK combination with real S3 has no known presigned-URL quirks (the issues found in research are MinIO-specific); trivial to front with CloudFront later.
- **Cons:** Requires an AWS account and credentials even for local development — every contributor needs cloud access (or a LocalStack-style shim, which is another moving part) to run the project end-to-end, breaking the zero-external-dependency Docker convention already established for `db`/`mailpit`; ongoing cost once past the free tier; contradicts the project's current all-self-hosted-in-Docker posture for infra dependencies.

### Option C: Local filesystem only (all environments)
- No object storage service; files live on the API/worker container's disk (or a shared volume).
- **Pros:** Zero new infrastructure — nothing to add to `compose.yaml`.
- **Cons:** Does not scale past a single host without a shared volume hack; no native presigned-URL/Range-request delivery primitive, which forces every read (streaming, download) through the API process — undermining "without performance impact" (capability) and contradicting the diagram's `Rel(frontend, storage, "Streams")` relation; does not match the architecture diagram's explicit storage container at all.

**Recommendation:** **Option A (MinIO)** — it is the only option consistent with the project's established convention of running every infra dependency inside Docker Compose (mirroring `db` and `mailpit`), requires no cloud credentials for any contributor, and is S3-API-compatible so a later move to AWS S3 in production is a configuration change, not a rewrite, of the already-planned `StorageService` abstraction.

**Decision:** AWS S3 (managed cloud) - Option B

---

## TD-02: Video Processing Worker Deployment Topology

**Scope:** Backend

**Capability:** Transversal — covers: "Background processing service (queues)", "Automatic video processing after upload (duration and metadata extraction)", "Automatic thumbnail generation from a video frame"

**Context:** The queue library itself (`@nestjs/bullmq`) is already fixed by `nestjs-best-practices` (see anchor above). What is still open is deployment topology: the architecture diagram draws a distinct "Video Worker (FFmpeg)" container, separate from the "API" container, communicating only through the queue and the shared DB/storage. Whether to actually split the codebase into two deployables — and how much code they share — is a real decision with operational consequences (independent scaling/restart of CPU-heavy video processing vs. simplicity of a single deployable).

**Options:**

### Option A: Single process — queue consumer inside `nestjs-api`
- The `@Processor()` for video jobs is registered in the same `AppModule` that serves HTTP traffic; one container, one `compose.yaml` service.
- **Pros:** Simplest possible topology — one image, one deployable, no duplicated bootstrap/config. Matches the code shape shown directly in `nestjs-best-practices/rules/micro-use-queues.md`.
- **Cons:** Diverges from the architecture diagram's explicit separate "Video Worker" container. Video processing (spawning FFmpeg, per TD-03) and HTTP request handling share the same container's CPU/memory allocation and the same restart/deploy lifecycle — a burst of transcoding jobs can starve the container's resources for concurrent API requests, and a worker crash (e.g., an FFmpeg OOM) takes the API down with it. No independent scaling of "API replicas" vs. "worker concurrency."

### Option B: Separate worker container, shared codebase, second bootstrap entrypoint
- A second entrypoint (e.g., `worker.main.ts`) instantiates a Nest application context (`NestFactory.createApplicationContext()`, no HTTP listener) that registers only the modules the worker needs (queue consumer, storage service, video repository). Same `nestjs-project` codebase and `package.json`; a new Compose service (`video-worker`) runs the same image with a different `command`.
- **Pros:** Matches the architecture diagram's separation — the worker is its own container, independently restartable/scalable/resource-limited, without duplicating business logic, entities, or dependencies (single codebase, single `npm install`, single `Dockerfile`). Failure isolation: an FFmpeg crash or OOM in the worker does not take down API request handling.
- **Cons:** Two running processes to reason about locally (`docker compose ps` now shows an extra service); the shared codebase means a change to a shared module (e.g., the `Video` entity) touches both deployables' runtime behavior even though there's only one place to edit it — this is a minor mental-model cost, not a duplication cost.

### Option C: Fully separate application (own `package.json`, independent deploy unit)
- A distinct Node project (possibly even a different runtime/language optimized for media work) that only talks to the shared Postgres DB and the queue/storage — no shared TypeScript modules with `nestjs-project`.
- **Pros:** Maximum isolation; could pick a runtime better suited to heavy media orchestration if ever needed.
- **Cons:** Duplicates entity definitions, DB connection config, and dependency management across two independent codebases that must be kept in sync by hand; two build pipelines, two sets of dependency upgrades, two things to keep TypeScript-compatible with the shared DB schema. Substantial operational overhead not justified by the project's current single-team, single-repo scale.

**Recommendation:** **Option B (separate worker container, shared codebase)** — it is the only option that honors the architecture diagram's explicit process separation (independent scaling and failure isolation between API and video processing) without paying Option C's cost of maintaining two independent codebases. The "two processes locally" overhead of Option B is a one-line addition to `compose.yaml` and a second `main.ts`-style file, not a structural rewrite.

**Decision:** Separate worker container, shared codebase, second bootstrap entrypoint - Option B
---

## TD-03: Video/Thumbnail Processing Library (FFmpeg Invocation Strategy)

**Scope:** Backend

**Capability:** Transversal — covers: "Automatic video processing after upload (duration and metadata extraction)", "Automatic thumbnail generation from a video frame"

**Context:** Both remaining processing capabilities (duration/metadata extraction via `ffprobe`, thumbnail extraction via `ffmpeg` frame capture) need to invoke the FFmpeg toolchain from Node. The traditional choice here, `fluent-ffmpeg`, was found during research to be **archived as of May 22, 2025** — the repository is read-only, does not accept issues or PRs, and the maintainer cited architectural issues and FFmpeg CLI instability as the reason for phasing it out. This materially changes what "the safe default" is compared to older guidance.

**Options:**

### Option A: Raw `child_process` (spawn) wrapping system FFmpeg/FFprobe binaries
- No wrapper dependency. Call `ffprobe -print_format json -show_format -show_streams <file>` and parse the JSON stdout for metadata; call `ffmpeg -ss <time> -i <file> -vframes 1 <thumb.jpg>` for thumbnail capture. FFmpeg/FFprobe binaries installed in the worker's Docker image (e.g., via the distro package manager in `Dockerfile`).
- **Pros:** Zero dependency on an abandoned or unusual package — just Node's built-in `child_process` plus the FFmpeg binary itself, which the worker needs installed regardless of which wrapper (if any) is chosen. Full control over exact CLI flags and error handling; no wrapper API to work around when FFmpeg's CLI surface changes. No supply-chain risk from an unmaintained npm package.
- **Cons:** No convenience API — argument-array construction, stdout/stderr parsing, and progress reporting are hand-rolled (a thin internal helper, not a lot of code, but code that doesn't exist yet in any wrapper).

### Option B: `fluent-ffmpeg` (legacy fluent wrapper)
- Chainable API (`ffmpeg(input).screenshots(...)`, `.ffprobe(callback)`) wrapping the same underlying CLI calls.
- **Pros:** Familiar, well-documented chainable API; still ~400K weekly downloads as of the research date, so plenty of existing examples.
- **Cons:** **Archived and unmaintained since May 2025** — no fixes for breakage against newer FFmpeg CLI versions, no security patches, no path to report or fix bugs. Adopting an archived dependency for a new project in 2026 is a maintenance liability from day one, not a future risk.

### Option C: `@ffmpeg/ffmpeg` (WebAssembly build)
- Runs FFmpeg compiled to WASM, in-process, without a native binary dependency.
- **Pros:** No native binary/OS dependency to install in the Docker image; identical artifact could theoretically run in other JS runtimes.
- **Cons:** WASM FFmpeg is built and optimized for browser/edge use cases with small clips, not heavy server-side transcoding of files up to 10GB — throughput and memory behavior under sustained large-file load is a real risk for the stated 10GB requirement, and this combination has far less server-side production track record than invoking native FFmpeg directly.

**Recommendation:** **Option A (raw `child_process` wrapping system binaries)** — `fluent-ffmpeg` (Option B) is disqualified by its archived status: adopting an abandoned dependency contradicts the project's Definition of Done culture of not leaving known debt in place. Option C's WASM path is a poor fit for the stated 10GB file-size requirement. Option A requires the least code beyond what any option needs anyway (FFmpeg installed in the worker image) and has zero dependency-risk surface.

**Decision:** Raw `child_process` (spawn) wrapping system FFmpeg/FFprobe binaries - Option A

---

## TD-04: Unique Video URL / Public Identifier Strategy

**Scope:** Backend

**Capability:** Unique URL per video, without conflict with other videos

**Context:** Every existing entity uses `@PrimaryGeneratedColumn('uuid')` as its internal primary key (an inherited, non-reopened convention). The open question is what identifies a video in its **public URL**. A constraint specific to this phase: the draft video row is created automatically "when upload starts" (a separate phase-03 capability), before any title or other metadata exists — so, unlike the channel `nickname` (Phase 02, derived from the email prefix), a video's public identifier cannot be derived from a title, because no title exists yet at draft-creation time. This rules out title-derived slugs as the primary mechanism.

**Options:**

### Option A: Reuse the existing UUID v4 primary key directly as the public URL segment (`/videos/{id}`)
- No new column. The same `@PrimaryGeneratedColumn('uuid')` value used everywhere else in the entity also appears in the public URL.
- **Pros:** Zero extra generation logic — uniqueness is already guaranteed by the existing PK convention and DB constraint. No new column, no collision-retry logic to write.
- **Cons:** Long, less friendly URLs (36-character UUID). Exposes the internal PK in public URLs — fine for a video-sharing platform with no particular reason to hide sequence/identity information, but forecloses ever changing the internal PK strategy without also changing public URLs.

### Option B: Separate short `public_id` column generated with `nanoid` (~10-12 chars)
- A dedicated unique column, generated at draft-creation time, decoupled from the internal PK — mirrors the precedent set by `Channel.nickname` (a separate public-facing unique field distinct from `Channel.id`).
- **Pros:** Short, URL-friendly identifiers. Keeps the internal PK purely internal, free to change strategy later without touching public URLs. Directly follows the project's own precedent (`nestjs-entities.md`: "Use `{ unique: true }` for naturally unique fields (email, slug)").
- **Cons:** One more column, one more uniqueness constraint, and (in the rare collision case) a regenerate-and-retry loop to write — small but real extra code versus Option A's "reuse what's already there."

### Option C: Separate `public_id` column generated with UUID v7 (time-ordered)
- Same idea as Option B, but the generated value is a time-ordered UUID v7 instead of a random `nanoid`.
- **Pros:** Same decoupling benefits as Option B, plus the ID is naturally sortable by creation time — useful for future chronological listings (e.g., "recently uploaded") without a separate `created_at` sort, and still opaque/unguessable enough for a public identifier.
- **Cons:** Longer than `nanoid` (36 chars, same length as Option A's UUID). Introduces a second UUID *version* into the codebase alongside the v4 used for every PK, which is a small but real inconsistency to explain to future readers unless documented clearly.

**Recommendation:** **Option A (reuse the existing UUID PK)** — for a platform with no stated requirement for short/pretty URLs, and given the draft-before-metadata sequencing already rules out title-derived slugs, reusing the PK is the only option that adds zero new columns and zero new generation/collision logic while still fully satisfying "unique URL, no conflict." Option B or C are reasonable if the team later wants shorter public URLs; either is a small additive migration since the PK is untouched either way.

**Decision:** Separate `public_id` column generated with UUID v7 (time-ordered) - Option C

---

## TD-05: Large File Upload Protocol

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Video upload supporting files up to 10GB without performance impact", "Automatic pre-registration of the video as a draft when upload starts"

**Context:** This is the central decision of the phase: how does a file up to 10GB get from the client into object storage without degrading API performance, and at what point in that handshake does the draft `Video` row get created? The architecture diagram's `Rel(api, storage, "Uploads")` sketches the API as the party that uploads to storage — worth weighing, though it is a C4-level sketch, not a binding TD. Whichever option is chosen defines the request/response shape the future upload UI (owned by a later phase) must implement, which is why this is `Scope: Cross-layer` even though no frontend screen ships in Phase 03 itself.

**Options:**

### Option A: Backend-proxied streaming upload (`@aws-sdk/lib-storage` `Upload` fed by the request stream)
- The client sends the file as a request body/multipart part to a Nest endpoint; the API creates the draft `Video` row first (satisfying "pre-registration... when upload starts"), then pipes the incoming request stream directly into `@aws-sdk/lib-storage`'s `Upload` class, which handles S3/MinIO multipart upload internally (concurrency, retries, part-splitting) without buffering the whole file in memory.
- **Pros:** Matches the diagram's `api → storage "Uploads"` relation literally. The draft-registration moment is trivial and explicit — it happens in the same request handler, before the byte stream starts flowing to storage. All traffic (including auth, rate limiting via the existing `@nestjs/throttler` convention) passes through the API uniformly, same as every other endpoint in the project.
- **Cons:** Achieving genuinely "no performance impact" for 10GB requires care: NestJS's default `FileInterceptor`/Multer setup either buffers to memory (unacceptable for 10GB) or writes to a temp disk file before the handler runs — true zero-buffering pass-through to storage means working with the raw request stream directly rather than Nest's standard file-upload interceptor, which is more implementation nuance than the other options require. The API process is still in the byte path for the full upload duration (long-lived connections tie up API resources during multi-GB transfers, even if CPU/memory stay bounded).

### Option B: Presigned direct-to-storage multipart upload
- The client first calls a small API endpoint ("start upload") that creates the draft `Video` row (pre-registration) and requests a multipart-upload session from storage (`CreateMultipartUpload`), then returns a set of presigned part URLs. The client uploads file parts directly to MinIO/S3, bypassing the API entirely for the byte stream, then calls a "complete upload" API endpoint to finalize.
- **Pros:** The API is completely out of the byte path — genuinely zero performance impact on the API process regardless of file size, since only small JSON requests (start/complete, and periodic "which part next" calls) touch the API. Scales trivially with file size and concurrent uploads. This is the option AWS's own guidance recommends specifically for large client uploads (see Sources).
- **Cons:** Diverges from the diagram's literal `api → storage "Uploads"` sketch (the API only orchestrates; it never touches bytes). Requires more upload-side logic in whatever client eventually implements it (chunking the file, requesting/using multiple presigned URLs, retrying failed parts, tracking overall progress) — meaningfully more client complexity than Option A's single-request upload, which is a cost paid by the future upload-UI phase, not this one.

### Option C: `tus` resumable upload protocol
- A `tus`-compliant endpoint (via `@tus/server`, backed by its S3/MinIO store) accepts the upload in chunks (`PATCH` requests with `Upload-Offset`), supporting resume after network interruption. The draft `Video` row is created via the tus "Creation" extension's initial `POST` (which can carry custom metadata to trigger pre-registration).
- **Pros:** Purpose-built for exactly this problem (arbitrarily large, resumable uploads) — `@tus/server` is an actively maintained official implementation with a first-class S3-compatible store, so it composes directly with TD-01's MinIO choice. Resumability is a genuine UX win for 10GB uploads over flaky connections, which neither Option A nor B provides out of the box.
- **Cons:** Introduces a whole protocol (and its own request/response semantics — `Tus-Resumable` headers, offset tracking) that the future upload client must speak, on top of the project's existing plain-REST/OpenAPI-contract conventions (`next-frontend-openapi-typing`) — a `tus` endpoint doesn't fit the same `openapi-fetch`-typed-client pattern the rest of the API uses, so it becomes a documented exception to an established FE↔BE contract convention. Heavier to reason about for a first video-upload implementation than Options A or B.

**Recommendation:** **Option B (presigned direct-to-storage multipart upload)** — for a stated requirement of "up to 10GB without performance impact," keeping the API out of the byte path entirely is the most direct way to guarantee that outcome, and it is the pattern AWS's own documentation recommends for exactly this use case. The extra client-side complexity is real but is paid once, by whichever phase builds the upload widget, not repeatedly by the API. Option A remains a reasonable fallback if the team prefers every request to visibly pass through the API (simpler mental model, at the cost of long-lived API connections during upload). Option C's resumability is valuable but introduces a protocol inconsistent with the project's established typed-REST contract convention; worth reconsidering later specifically for resumability if dropped connections prove to be a real problem in practice.

**Decision:** Presigned direct-to-storage multipart upload - Option B

---

## TD-06: Video Delivery Mechanism (Streaming & Download)

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Streaming playback (no full download required)", "Video download by the user"

**Context:** Once a video is processed and stored, the client needs to (a) play it back progressively without downloading the whole file first, and (b) optionally download it in full. The architecture diagram's `Rel(frontend, storage, "Streams", "HTTPS")` already sketches direct frontend↔storage delivery, bypassing the API for playback — again, a C4-level sketch, treated as strong context rather than a binding decision. This TD is independent of TD-05 (upload path) but shares the same storage backend (TD-01).

**Options:**

### Option A: Direct-from-storage via short-lived presigned GET URLs (Range-request native)
- The API issues a time-limited presigned GET URL (for MinIO/S3) for the processed video object; the `<video>` element or download link points directly at storage. S3/MinIO natively support HTTP `Range` requests, so the browser's native progressive-download/seek behavior works without any custom server code.
- **Pros:** Matches the diagram's `frontend → storage "Streams"` relation exactly. Zero byte-serving code to write or maintain — Range support is a property of the storage backend, not something the API implements. The API is out of the byte path for playback the same way TD-05 Option B keeps it out of the byte path for upload, so both directions share one architectural principle. Trivially reused for "download" (the same presigned URL, or one with `response-content-disposition: attachment`, satisfies the download capability with no extra endpoint).
- **Cons:** The presigned URL's expiry must be tuned so long viewing sessions don't get cut off mid-playback (a parameter to get right, not a structural problem). Per-request authorization is coarser — access control happens once (when the presigned URL is minted), not on every byte range request, so revoking access mid-playback isn't possible (acceptable for a platform where anonymous/public video access is an explicit product goal per the project plan).

### Option B: Backend-proxied streaming (API forwards `Range` requests to storage)
- The client requests the video from an API endpoint; the API reads the `Range` header, fetches the corresponding byte range from storage, and streams it back with matching `Content-Range`/`206` semantics.
- **Pros:** Every playback/download request is visibly authenticated and logged by the API, consistent with how every other resource in the project is accessed. No presigned-URL expiry tuning to get right.
- **Cons:** Diverges from the diagram's direct frontend↔storage relation. Every second of video playback now flows through the API process — for a video-sharing platform, this is exactly the kind of sustained-throughput byte-serving work the API layer should not be doing (analogous to why TD-05 rejected keeping uploads inside the API for the same performance reasons). Re-implements Range/`206` handling that S3/MinIO already provide for free.

### Option C: HLS adaptive segmented streaming (transcode to multiple bitrates + `.m3u8` manifest)
- The worker (TD-02/TD-03) transcodes each upload into multiple bitrate renditions plus HLS segments and a manifest; playback uses an HLS-capable player (e.g., `hls.js`) fetching segments progressively, adapting bitrate to network conditions.
- **Pros:** Best playback experience under varying network conditions; industry-standard approach for large-scale video platforms.
- **Cons:** Significant scope increase beyond what Phase 03's capabilities ask for — the project plan's wording ("Streaming playback (no full download required)") describes progressive/seekable playback, not adaptive bitrate; nothing in Phase 03 (or Phase 05, which owns the actual player) mentions multiple quality renditions. Multiplies worker processing time and storage footprint per video (several renditions instead of one file) for a requirement not yet stated. A candidate for a future phase if/when adaptive bitrate becomes an actual product requirement, not a fit for this phase's stated scope.

**Recommendation:** **Option A (direct-from-storage presigned GET, Range-native)** — it is the option most aligned with the architecture diagram's own sketch, requires no custom byte-serving code (S3/MinIO already implement `Range` correctly), keeps the API out of the sustained-throughput path for the same reason TD-05 kept it out of the upload path, and the same mechanism naturally covers both "streaming" and "download" with one primitive. Option C (HLS) is explicitly scoped out as extrapolation beyond what Phase 03's capabilities state — worth raising as a separate future ad-hoc research if adaptive bitrate becomes a real requirement.

**Decision:** Direct-from-storage via short-lived presigned GET URLs (Range-request native) - Option A

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Object Storage Backend | A (MinIO, self-hosted) | Option B (AWS S3, managed cloud) |
| TD-02 | Backend | Video Processing Worker Deployment Topology | B (Separate worker container, shared codebase) | _[pending]_ |
| TD-03 | Backend | Video/Thumbnail Processing Library (FFmpeg Invocation) | A (Raw `child_process` wrapping system binaries) | Option A (Raw `child_process` (spawn) wrapping system FFmpeg/FFprobe binaries) |
| TD-04 | Backend | Unique Video URL / Public Identifier Strategy | A (Reuse existing UUID PK) | Option C (Separate `public_id` column generated with UUID v7 (time-ordered)) |
| TD-05 | Cross-layer | Large File Upload Protocol | B (Presigned direct-to-storage multipart upload) | Option B (Presigned direct-to-storage multipart upload) |
| TD-06 | Cross-layer | Video Delivery Mechanism (Streaming & Download) | A (Direct-from-storage presigned GET, Range-native) | Option A (Direct-from-storage via short-lived presigned GET URLs (Range-request native)) |

---

## Notes for downstream pipeline

- **TD-02 depends on the queue library already being fixed** (`@nestjs/bullmq`, per `nestjs-best-practices/rules/micro-use-queues.md`) — it decides deployment topology only, not the library.
- **TD-01 and TD-05/TD-06 compose:** whichever storage backend TD-01 picks, TD-05 Option B and TD-06 Option A both assume an S3-compatible presigned-URL API — true for both MinIO and AWS S3, so this dependency does not constrain TD-01's choice either way.
- **TD-04 must resolve before TD-05 is implemented:** the public identifier format (TD-04) is the value returned to the client when a draft is pre-registered (TD-05's "start upload" step) — sequencing note for `/plan-build`, not a research-level blocker.
- **TD-06 Option C (HLS) was scoped out** as exceeding Phase 03's stated capabilities. If adaptive bitrate streaming becomes a real requirement, it should be raised as a dedicated ad-hoc research (`/research adaptive bitrate streaming`) rather than folded back into this phase.
- Context7 (the project's mandated documentation-lookup MCP) returned "monthly quota exceeded" for every query attempted during this research; library research above was sourced via web search instead, with sources cited below. Per CLAUDE.md, this discrepancy is flagged here — re-run Context7 lookups for the chosen libraries (`@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `minio`, `@tus/server`) at `/plan-build` time once quota is available, to catch any version-specific API details this research could not verify against the installed version.

Sources consulted during research:

- [node-fluent-ffmpeg — GitHub](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) and ["Phasing out fluent-ffmpeg" — Issue #1324](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/issues/1324) — confirms the library was archived May 22, 2025.
- [fluent-ffmpeg vs @ffmpeg/ffmpeg vs node-video-lib — PkgPulse](https://www.pkgpulse.com/blog/fluent-ffmpeg-vs-ffmpeg-wasm-vs-node-video-lib-video-processing-nodejs-2026) — comparison of current FFmpeg wrapper alternatives for Node.js.
- [@aws-sdk/lib-storage — npm](https://www.npmjs.com/package/@aws-sdk/lib-storage) and [Upload large files to AWS S3 using Multipart upload and presigned URLs — DEV Community](https://dev.to/magpys/upload-large-files-to-aws-s3-using-multipart-upload-and-presigned-urls-4olo) — confirms `Upload` class stream/multipart behavior vs. manual presigned multipart flow.
- [Uploading objects with presigned URLs — AWS S3 docs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html) — AWS's own recommendation of presigned URLs for large client-side uploads.
- [tus-node-server — GitHub](https://github.com/tus/tus-node-server) and [tus.io](https://tus.io/) — confirms `@tus/server`'s maintained status, S3/disk/GCS store support, and protocol design (resumability, adoption by Cloudflare/Supabase/Vimeo).
- [minio/minio-js presigned URL issues — GitHub Discussions/Issues #14709, #19067](https://github.com/minio/minio/discussions/14709) — documents known `@aws-sdk/client-s3` v3 presigned-URL signature edge cases against MinIO.
- `docs/project-plan.md` (Phase 03 capabilities, neighboring phases), `docs/diagrams/software-arch.mermaid` (C4 container diagram), `nestjs-project/CLAUDE.md`, `.claude/skills/nestjs-best-practices/rules/micro-use-queues.md`, `.claude/skills/typeorm/rules/entity-primary-key-strategy.md`, `.claude/rules/nestjs-entities.md`, `.claude/skills/testing-guide-nestjs-project/references/external-systems.md` — internal conventions consumed as constraints throughout.
