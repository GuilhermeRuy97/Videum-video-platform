# CLAUDE.md

## Environment Startup Verification

**Default behavior:** starting the environment means starting **only infrastructure services** (database, mail, etc.) — **never** start the NestJS application server unless the user explicitly asks to run/serve the project (e.g., "rode o projeto", "suba o servidor", "run the app").

After starting infrastructure, always confirm the containers are up before proceeding:

```bash
docker compose ps   # all services must show status "running"
```

Then verify each infrastructure service is actually ready to accept connections — not just running:

- **PostgreSQL:** `docker compose exec db pg_isready -U videum` — expect `accepting connections`

Only start the NestJS dev server (`npm run start:dev`) when the user **explicitly** asks to run the application — never as part of "start the environment".

## Development Environment

This project runs inside Docker. Always use the container for development:

```bash
# Start containers
docker compose up -d

# Install dependencies (first time only)
docker compose exec nestjs-api npm install

# Run the dev server (watch mode)
docker compose exec nestjs-api npm run start:dev
```

Services:
- `nestjs-api` — NestJS API, port `3000`
- `db` — PostgreSQL 17, port `5432`, database `videum`, user/password `videum`
- `mailpit` — SMTP + web UI (ports `1025` / `8025`)
- `minio` — S3-compatible object storage, API `9000` / console `9001` (`minioadmin`/`minioadmin`), bucket `videos` _(Phase 03)_
- `redis` — Redis 7, port `6379`; backs the BullMQ queues _(Phase 03)_
- `video-worker` — separate worker process (`npm run start:worker:dev`, entry `worker/main.worker`) consuming the video-processing queue; FFmpeg is baked into the image _(Phase 03)_

All verification and teardown commands run on the **host machine**:

```bash
# Verify NestJS is running (expect 200 + "Hello World!")
curl http://localhost:3000

# Verify PostgreSQL is ready (runs inside the db container)
docker compose exec db pg_isready -U videum

# Check container logs
docker compose logs nestjs-api
docker compose logs db

# Tear down the entire environment
docker compose down
```

## Commands

**Strict rule:** every `npm`, `npx`, `node`, `tsc`, and test command runs **inside the container**, never on the host. Running on the host causes env-var divergence (`DB_HOST` resolves to `localhost` instead of the Compose service), uses a different Node version, and produces results that do not reflect what runs in CI/prod.

### Container-only commands (always prefix with `docker compose exec nestjs-api`)

```bash
npm run start:dev                        # Dev server with hot-reload
npm run build                            # Compile to dist/
npm run start:prod                       # Run compiled build

npm test                                 # Unit tests
npm run test:watch                       # Unit tests in watch mode
npm run test:cov                         # Coverage report
npm run test:e2e                         # End-to-end tests (always with --runInBand)

npx tsc --noEmit                         # Type-check (required before declaring a task done)
npm run lint                             # ESLint with auto-fix
npm run format                           # Prettier formatting
```

### Host-only commands (Docker / connectivity probes)

```bash
docker compose ps
docker compose logs nestjs-api
docker compose exec db pg_isready -U videum
curl http://localhost:3000
```

### Test execution

Integration and e2e suites share a single test database. They **must** be run with `--runInBand`:

```bash
docker compose exec nestjs-api npm test -- --runInBand
docker compose exec nestjs-api npm run test:e2e   # already configured
```

Parallel execution causes FK violations, deadlocks, and cross-suite contamination because suites truncate or seed shared tables concurrently.

During active development, run only the tests related to the file being changed (`npm test -- path/to/file.spec.ts`). Before declaring a task done, run the full suite — see the global `CLAUDE.md` → "Definition of Done (Technical)".

## Long-running Processes

Commands that never exit (dev server, watch modes) must be run in background in the Bash tool — otherwise the agent blocks indefinitely waiting for the process to return.

This applies to: `start:dev`, `start:prod`, `test:watch`, and any other persistent process.

## Test Type Selection

Choose the suffix by what the test really does, not by where the code under test lives. The suffix is a contract that drives Jest config (`testRegex`, parallelism), CI steps, and reader expectations.

| Suffix                  | Purpose                                                              | DB / external I/O | Location                     |
|-------------------------|----------------------------------------------------------------------|-------------------|------------------------------|
| `*.spec.ts`             | **Unit** — pure logic, all collaborators mocked                      | Forbidden         | Next to the source file      |
| `*.integration-spec.ts` | **Integration** — exercises real DB, real repositories, real modules | Required          | Next to the source file      |
| `*.e2e-spec.ts`         | **End-to-end** — full HTTP cycle via `supertest`                     | Required          | `nestjs-project/test/`       |

A test that constructs a `TypeOrmModule.forRoot`, opens a connection, or hits the `db` service **must** be `*.integration-spec.ts`, never `*.spec.ts`. A test that boots the full Nest application and makes HTTP calls **must** be `*.e2e-spec.ts`.

Conventions for **how to write** each kind of test (mocking patterns, AAA structure, override strategies for global guards, etc.) live in `.claude/rules/nestjs-testing.md` and load when you edit a test file.

## Jest Configuration

These settings are required in `package.json` (jest config) and `test/jest-e2e.json` for the project's tests to work correctly:

- `setupFiles: ["dotenv/config"]` — without this, `.env` is not loaded inside the Jest process. `DB_HOST`, `JWT_SECRET`, etc. fall back to undefined or to the host's `localhost`, breaking container-to-container DNS.
- `testRegex: '.*\\.(spec|integration-spec)\\.ts$'` — covers both unit (`*.spec.ts`) and integration (`*.integration-spec.ts`) suffixes.

Do not add new test-file suffixes; if a new test type is needed, update the regex deliberately.

## Environment File Conventions

`.env` is parsed by both Docker Compose and `dotenv` — values containing shell-special characters (`<`, `>`, `|`, `&`, spaces) **must be quoted** or rewritten:

```dotenv
# Wrong — the unquoted angle brackets are shell redirection syntax and break parsing
MAIL_FROM=StreamTube <noreply@streamtube.local>

# Right — quote the value
MAIL_FROM="StreamTube <noreply@streamtube.local>"
```

Whenever possible, prefer storing only the bare address in `.env` and composing display names in code (e.g., in `mail.config.ts`) so the file stays shell-safe.

## Build Assets

`tsc` (and therefore `nest build`) only emits compiled `.ts` files to `dist/`. Any non-TypeScript runtime asset — Handlebars templates (`.hbs`), JSON fixtures, static config files, etc. — must be declared in `nest-cli.json` under `compilerOptions.assets` (with `watchAssets: true` for dev). Without that, the file exists in `src/` but is missing in `dist/` and runtime fails only after build.

## Architecture

NestJS with standard module structure. Source lives in `src/`, compiled output in `dist/`.

- Each domain feature gets its own module (e.g., `UsersModule`, `VideosModule`) registered in `AppModule`
- Controllers handle HTTP routing; Services hold business logic; both are scoped to their module

## Videos, Storage & Processing (Phase 03)

The video upload-and-processing pipeline keeps the API out of the file byte path: clients upload directly to object storage via presigned multipart URLs and stream/download via presigned GET URLs.

**Module** `src/videos/` — `Video` entity (`videos` table; internal v4 PK + public **UUID v7** `public_id` used in all client URLs; `status`: `uploading → processing → ready | failed`; unique `storage_key`; composite `(status, created_at)` index for the reconciliation sweep). `VideosController` + `VideosService`.

**Endpoints** (`/videos`, all documented via `@nestjs/swagger`):
- `POST /videos` — auth required; creates a draft and initiates a presigned multipart upload. Returns `public_id`, `upload_id`, `storage_key`, presigned `parts`.
- `POST /videos/:publicId/complete` — owner only; finalizes the upload, verifies the object server-side (`CompleteMultipartUpload` + `HeadObject` size check), transitions `uploading → processing`, and enqueues `process-video`.
- `GET /videos/:publicId` — **optional auth** (`@OptionalAuth()`); returns metadata + presigned Range-native `playback_url` (+ `thumbnail_url`). Anonymous/non-owner see only `ready` videos (else `404`); the owner sees any status (`playback_url: null` until `ready`).
- `GET /videos/:publicId/download` — optional auth; `302` redirect to a presigned attachment URL. Non-`ready` → `404` for non-owners, `409 VIDEO_NOT_READY` for the owner.

**Storage** `src/storage/StorageService` — the sole S3 adapter (`@aws-sdk/client-s3`, MinIO). Uses **two clients**: an internal one (`minio:9000`) for server-side ops and a presign client signing against the public endpoint (`localhost:9000`) so browser URLs resolve. Creates the bucket on boot. Exposes multipart initiate/complete, `headObject`, `downloadToFile`, `putObject`, and `getPresignedGetUrl`.

**Queue & worker** (`@nestjs/bullmq` on Redis) — `AppModule` registers the connection and the `video-processing` producer. The **worker** (`src/worker/main.worker.ts`, a headless `ApplicationContext`, no HTTP) runs in the `video-worker` container and hosts:
- `VideoProcessingProcessor` (`video-processing`) — downloads the source, runs raw `child_process` FFprobe (duration) + FFmpeg (thumbnail), uploads the thumbnail, sets `ready` (or `failed`). Idempotent (already-`ready` is a no-op).
- `UploadReconciliationProcessor` (`upload-reconciliation`) — a repeatable `sweep-abandoned-uploads` job (registered at bootstrap via `queue.upsertJobScheduler`) rescues or fails drafts stuck in `uploading` past `ABANDONED_UPLOAD_TIMEOUT_MS`.

The worker's `TypeOrmModule.forFeature` must register `[Video, User, Channel]` — TypeORM builds metadata for the whole connected relation graph, so `User`'s `Channel` inverse is required even though the worker only queries `Video`.

**Config** namespaces `storage.config.ts` / `queue.config.ts` (Joi-validated, dev defaults match `compose.yaml`; no `.env` change needed). Storage/queue integration tests run against the real MinIO + Redis + DB — do not mock what Compose actually runs.

## Code Conventions

- **TypeScript:** `nodenext` module resolution, `ES2023` target, `strictNullChecks` on, `noImplicitAny` off
- **Decorators:** `emitDecoratorMetadata` + `experimentalDecorators` enabled — required for NestJS DI
- **Prettier:** single quotes, trailing commas everywhere
- **ESLint:** `no-explicit-any` allowed; `no-floating-promises` and `no-unsafe-argument` are warnings

## REST Conventions

This is a RESTful API. All endpoints must follow standard REST conventions — correct HTTP methods, proper status codes, plural resource nouns, and consistent URL structure. Details are enforced via rules on controller files.
