# Videum — Video Platform

Videum is a video-sharing platform (YouTube-like). Users can upload, manage, and
publish videos; anonymous visitors can watch freely, while social features
(comments, subscriptions, likes) require authentication.

The upload-and-processing pipeline keeps the API out of the file byte path:
clients upload directly to object storage via presigned multipart URLs, a
background worker extracts metadata and generates thumbnails, and playback and
download are served straight from storage through presigned, range-capable URLs.

> Full project overview and phase plan: [`docs/project-plan.md`](docs/project-plan.md).

## Repository structure

This is a monorepo:

- **`nestjs-project/`** — Backend API (NestJS 11, TypeScript, Express) plus the
  video worker. Modules: `auth`, `users`, `channels`, `mail`, `videos`,
  `storage`, and shared `common`/`config`/`database`.
- **`next-frontend/`** — Next.js frontend (Phases 01–02 auth/UI scaffold; the
  video player/upload UI are later phases).
- **`docs/`** — Architecture diagrams, technical decisions, and per-phase
  planning artifacts (`docs/phases/`, `docs/decisions/`).

## Architecture

| Container | Tech | Responsibility |
|---|---|---|
| **API** | NestJS 11 | Business rules, auth, DB access; initiates presigned direct-to-storage uploads (never the byte path); publishes processing jobs; sends emails. |
| **Video Worker** | Node + FFmpeg | Separate process on the shared codebase; consumes jobs from the queue, extracts duration/metadata, generates thumbnails, updates DB and storage. |
| **Database** | PostgreSQL 17 | Users, channels, videos. |
| **Object Storage** | MinIO (S3-compatible) | Video files and thumbnails; clients upload/stream directly via presigned URLs. |
| **Message Queue** | Redis 7 + BullMQ | `video-processing` job queue plus a repeatable `upload-reconciliation` sweep. |
| **Email** | SMTP (Mailpit in dev) | Account confirmation and password recovery. |

See [`docs/diagrams/software-arch.mermaid`](docs/diagrams/software-arch.mermaid)
for the full C4 container diagram.

## Getting started

Everything runs in Docker. Inside a container, always reference other services by
their Compose service name (e.g. `db`, `minio`, `redis`) — never `localhost`.

```bash
cd nestjs-project

# Start the full stack (API, Postgres, Mailpit, MinIO, Redis, video worker)
docker compose up -d

# Install dependencies (first run only)
docker compose exec nestjs-api npm install

# Apply database migrations
docker compose exec nestjs-api npm run migration:run

# (optional) Seed baseline data
docker compose exec nestjs-api npm run seed
```

### Services & ports

| Service | Purpose | Ports |
|---|---|---|
| `nestjs-api` | NestJS API | `3000` |
| `db` | PostgreSQL 17 (`videum`/`videum`, db `videum`) | `5432` |
| `mailpit` | SMTP + web inbox | `1025` / `8025` |
| `minio` | S3-compatible storage (`minioadmin`/`minioadmin`, bucket `videos`) | `9000` / `9001` |
| `redis` | BullMQ backing store | `6379` |
| `video-worker` | Headless FFmpeg worker (`npm run start:worker:dev`) | — |

API base URL: `http://localhost:3000`. Interactive OpenAPI docs at
`http://localhost:3000/api/docs` (when `SWAGGER_ENABLED=true`).

## API endpoints

Auth (`/auth`):

- `POST /auth/register` — create an account (a channel is created on sign-up)
- `GET  /auth/confirm-email` — confirm via emailed token
- `POST /auth/resend-confirmation`
- `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`
- `POST /auth/forgot-password` · `POST /auth/reset-password`
- `GET  /auth/me` — current user

Videos (`/videos`):

- `POST /videos` — auth required; creates a **draft** and initiates a presigned
  multipart upload (returns `public_id`, `upload_id`, `storage_key`, presigned `parts`)
- `POST /videos/:publicId/complete` — owner only; verifies the object
  server-side, transitions `uploading → processing`, and enqueues processing
- `GET  /videos/:publicId` — optional auth; metadata + presigned, range-native
  `playback_url` (anonymous/non-owners see only `ready` videos)
- `GET  /videos/:publicId/download` — optional auth; `302` redirect to a
  presigned attachment URL

Each video carries a unique public identifier (UUID v7) used in all client URLs,
and moves through the status cycle `uploading → processing → ready | failed`.

## Testing & quality

All commands run **inside the container**. Integration and e2e suites use the
real Docker `db`/`minio`/`redis` and must run serially.

```bash
docker compose exec nestjs-api npm test -- --runInBand   # unit + integration
docker compose exec nestjs-api npm run test:e2e          # end-to-end (supertest)
docker compose exec nestjs-api npx tsc --noEmit          # type-check
docker compose exec nestjs-api npm run lint              # ESLint
```

**Definition of Done:** the affected and full test suites pass, `tsc --noEmit`
exits 0, and lint passes.

Test file suffixes: `*.spec.ts` (unit, mocked), `*.integration-spec.ts`
(real DB/services), `*.e2e-spec.ts` (full HTTP cycle).

## Project status

| Phase | Scope | Status |
|---|---|---|
| 01 | Base configuration (Nest + TypeORM + Postgres, Docker, config, migrations) | ✅ |
| 02 | Authentication & users/channels (JWT, email confirmation, recovery) + frontend scaffold | ✅ |
| 03 | Upload & video processing (storage, queue, worker, streaming, download) | ✅ |

## Development workflow

Git Flow conventions: `feature/*`, `bugfix/*`, `hotfix/*`, and `docs/*` branches
start from `dev` and merge back into `dev`; `dev` merges into `main` when stable.
Never commit directly to `main`. See [`CLAUDE.md`](CLAUDE.md) for the full working
principles and Definition of Done.
