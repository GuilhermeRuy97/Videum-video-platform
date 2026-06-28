---
kind: task
name: task-next-frontend-openapi-typing
test_specs_aware: true
sources_mtime:
  docs/tasks/task-next-frontend-openapi-typing/context.md: "2026-05-13T15:46:56-03:00"
  docs/tasks/task-next-frontend-openapi-typing/library-refs.md: "2026-05-13T15:46:29-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-05-13T15:43:57-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-05-12T16:17:52-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-05-13T15:23:15-03:00"
  docs/phases/phase-02-auth/context.md: "2026-05-12T14:01:10-03:00"
  .claude/skills/testing-guide-next-frontend/SKILL.md: "2026-05-13T10:59:26-03:00"
---

# Task — next-frontend OpenAPI Typing

## Objective

> How next-frontend consumes the openapi.json artifact produced by nestjs-project (openapi-docs-nestjs/TD-02, Option C): how the spec is brought into next-frontend's filesystem boundary under Docker bind-mount isolation, codegen tooling, when codegen runs and whether output is committed, how types are shared between the BFF Route Handlers (upstream → Nest) and the Components layer (browser → same-origin BFF), and how MSW handlers in the BFF integration tests reuse the same schema.

---

## Step Implementations

### SI-1 — Spec sourcing under Docker isolation (Setup)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-02 — Spec Sourcing Under Docker Bind-Mount Isolation`

**Description:** Materializes the local copy of `openapi.json` inside `next-frontend/` so codegen running in the container reads `./openapi.json` (resolved under `/home/node/app`). The sync script lives at the repo root and runs on the host — not inside any container, because the entire monorepo is only visible from the host (per `next-frontend-openapi-typing/TD-02`).

**Technical actions:**

1. Create `scripts/sync-openapi.sh` (executable: `chmod +x`) byte-verbatim from the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-02 → Setup` — copies `nestjs-project/openapi.json` to `next-frontend/openapi.json`.
2. Run the script once from the repo-root on the host: `bash scripts/sync-openapi.sh` to materialize the initial `next-frontend/openapi.json`.
3. Commit `scripts/sync-openapi.sh` + `next-frontend/openapi.json` in the same change (the parity between the two committed copies is load-bearing for TD-03 to work).

**Dependencies:** —

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- `scripts/sync-openapi.sh` exists at the repo root, is executable (`test -x scripts/sync-openapi.sh`), and its content matches byte-for-byte the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-02 → Setup`.
- Running `bash scripts/sync-openapi.sh` on the host produces `next-frontend/openapi.json` byte-identical to `nestjs-project/openapi.json` (verifiable via `diff -q nestjs-project/openapi.json next-frontend/openapi.json` → exit 0).
- Both `scripts/sync-openapi.sh` and `next-frontend/openapi.json` are committed in the repo in the same PR/commit as the bootstrap.

---

### SI-2 — Codegen pipeline: install openapi-typescript + npm script + first generation (Setup of TD-03 phase 1)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-03 — Codegen Execution Timing & Output Commit Policy`

**Description:** Establishes the complete codegen pipeline: installs `openapi-typescript` as a dev-dep, adds the canonical npm script, generates `lib/api/types.gen.ts` from `next-frontend/openapi.json` (from SI-1), and commits the artifact. CI freshness check is in a separate SI (SI-5) to not exceed the action cap.

**Technical actions:**

1. Inside the `next-frontend` container, run `npm install -D openapi-typescript` (per `**Libraries:**` in `next-frontend-openapi-typing/TD-01`; version pinned per `docs/tasks/task-next-frontend-openapi-typing/library-refs.md` — `^7.x`).
2. Add `"openapi:types": "openapi-typescript ./openapi.json -o ./lib/api/types.gen.ts"` to the `scripts` of `next-frontend/package.json` byte-verbatim from the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-03 → Setup`.
3. Run `docker compose exec next-frontend npm run openapi:types` to generate `next-frontend/lib/api/types.gen.ts` from the `openapi.json` committed in SI-1.
4. Commit `next-frontend/package.json`, `next-frontend/package-lock.json`, and `next-frontend/lib/api/types.gen.ts`. **`.gitignore` MUST NOT exclude `lib/api/types.gen.ts`** — the generated file is committed by design (per TD-03 Option C).

**Dependencies:** SI-1 (requires `next-frontend/openapi.json` committed)

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- `next-frontend/package.json` lists `openapi-typescript` in `devDependencies` with the version pinned per `library-refs.md` (`^7.x` or major-compatible).
- `next-frontend/package.json` `scripts` contains the `openapi:types` entry byte-verbatim from the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-03 → Setup`.
- `next-frontend/lib/api/types.gen.ts` exists and exports `paths` (verifiable via `grep -E '^export (interface|type) paths' next-frontend/lib/api/types.gen.ts` → match).
- Re-running `docker compose exec next-frontend npm run openapi:types` produces zero diff in `next-frontend/lib/api/types.gen.ts` (codegen idempotency).
- The three files (`package.json`, `package-lock.json`, `lib/api/types.gen.ts`) are committed.

---

### SI-3 — Typed upstream client (Setup of TD-01)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-01 — OpenAPI Codegen Tooling`

**Description:** Installs `openapi-fetch` (runtime-dep) and authors the server-only module `lib/api/upstream.ts` that instantiates the HTTP client typed against `paths` from `types.gen.ts`. Under the strict BFF of `next-frontend-config-base/TD-03`, this client can only be imported in server-side code; `import "server-only"` is the guard that fails the build if a Client Component tries to consume it.

**Technical actions:**

1. Inside the `next-frontend` container, run `npm install openapi-fetch` (per `**Libraries:**` in `next-frontend-openapi-typing/TD-01`; version pinned per `library-refs.md` — `^0.13.x`).
2. Author `next-frontend/lib/api/upstream.ts` byte-verbatim in the F2-load-bearing part of the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-01 — OpenAPI Codegen Tooling → Setup` (`import "server-only";`, `createClient<paths>({ baseUrl: env.API_URL })`, export `upstream`). Imports from `openapi-fetch`, `./types.gen`, and `@/lib/env` are derivable — the implementer adds them without F2 coverage.
3. Verify inside the container: `docker compose exec next-frontend npx tsc --noEmit` exits 0.
4. Commit `next-frontend/package.json`, `next-frontend/package-lock.json`, and `next-frontend/lib/api/upstream.ts`.

**Dependencies:** SI-2 (requires `next-frontend/lib/api/types.gen.ts` to typecheck the `createClient<paths>` instantiation)

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- `next-frontend/package.json` lists `openapi-fetch` in `dependencies` with the version pinned per `library-refs.md`.
- `next-frontend/lib/api/upstream.ts` starts with the line `import "server-only";` and exports an `upstream` symbol whose TypeScript type inference resolves to `Client<paths>` (verifiable via `tsc --noEmit` and by inspecting the hover-info in the IDE).
- The F2-load-bearing tokens of the snippet (`createClient<paths>`, `baseUrl: env.API_URL`, `import "server-only"`) appear byte-verbatim in `lib/api/upstream.ts`.
- `docker compose exec next-frontend npx tsc --noEmit` exits 0 with the module in the codebase.

---

### SI-4 — Contracts barrel (Setup of TD-04)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-04 — Type Sharing Between BFF Layer and Components Layer`

**Description:** Creates `next-frontend/lib/api/contracts.ts` as the **only** file authorized to import `paths` from `types.gen.ts`. The file is born without aliases — future feature SIs (in phases touching the BFF) append aliases as endpoints appear. The pass-through-by-default convention (`type Video = paths["/videos/{id}"]...`) and the reshape form (`type VideoCard = Pick<Video, ...>`) are documented in-file via a comment.

**Technical actions:**

1. Author `next-frontend/lib/api/contracts.ts` with: (a) `import type { paths } from "./types.gen";` at the top; (b) a multi-line comment block describing the convention (pass-through alias indexes `paths["/route"]["method"]["responses"][status]["content"]["application/json"]`; reshape alias uses `Pick`/`Omit`/composition); (c) zero `export type` yet — empty barrel ready to grow. The structure follows the F2-load-bearing part of the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-04 — Type Sharing Between BFF Layer and Components Layer → Setup`.
2. Verify inside the container: `docker compose exec next-frontend npx tsc --noEmit` exits 0.
3. Commit `next-frontend/lib/api/contracts.ts`.

**Dependencies:** SI-2 (requires `next-frontend/lib/api/types.gen.ts` existence so `import type { paths } from "./types.gen"` resolves)

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- `next-frontend/lib/api/contracts.ts` exists and starts (after the optional header comment) with `import type { paths } from "./types.gen";`.
- The file does NOT export any alias yet — `grep -c '^export type' next-frontend/lib/api/contracts.ts` returns `0` (the first future feature SI is what adds the first alias).
- The comment block describes the dual convention (pass-through alias keyed on `paths[...]` vs reshape alias via `Pick`/`Omit`).
- `docker compose exec next-frontend npx tsc --noEmit` exits 0.

---

### SI-5 — CI freshness check workflow (Setup of TD-03 phase 2)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-03 — Codegen Execution Timing & Output Commit Policy`

**Description:** Materializes the drift gate: a CI workflow that runs `bash scripts/sync-openapi.sh` + `npm run openapi:types` + `git diff --exit-code next-frontend/openapi.json next-frontend/lib/api/types.gen.ts`. It fails when either of the two committed artifacts is stale. The diff step's error message points the developer to the one-liner remediation. CI platform follows repo convention (GitHub Actions / GitLab CI / etc. — implementer resolves at execution time).

**Technical actions:**

1. Author the CI workflow file at the repo's canonical path (e.g., `.github/workflows/openapi-freshness.yml` when GitHub Actions is the platform; adjust according to existing infra). Content follows byte-verbatim the F2-load-bearing part of the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-03 — Codegen Execution Timing & Output Commit Policy → Setup` (3 steps: sync → gen → diff).
2. Add a clear remediation message in the final step (e.g., `Run: bash scripts/sync-openapi.sh && (cd next-frontend && npm run openapi:types) then commit`).
3. Commit the workflow file.

**Dependencies:** SI-1 (workflow calls `scripts/sync-openapi.sh`), SI-2 (workflow calls `npm run openapi:types` and the diff expects `lib/api/types.gen.ts` committed as baseline)

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- A workflow file exists at the repo's canonical CI path containing, in order, the three steps: `bash scripts/sync-openapi.sh`, `cd next-frontend && npm run openapi:types`, `git diff --exit-code next-frontend/openapi.json next-frontend/lib/api/types.gen.ts`.
- On a PR whose `nestjs-project/openapi.json` remains unchanged, the workflow exits 0 (no-drift baseline).
- On a PR that mutates `nestjs-project/openapi.json` without running sync + regen locally, the workflow exits non-zero on the diff step and the message points to the remediation one-liner `bash scripts/sync-openapi.sh && (cd next-frontend && npm run openapi:types)`.

---

### SI-6 — MSW handler typing pattern documentation (Setup of TD-05)

**Frontend Runtime spec:** see `## Technical Specifications` → `### Frontend Runtime` → `#### next-frontend-openapi-typing/TD-05 — MSW Handler Typing Against the Generated Schema`

**Description:** TD-05 decides the typing pattern but does NOT bootstrap MSW itself (Vitest + `mocks/handlers.ts` + `mocks/server.ts` live in the separate task `next-frontend-msw-foundation`). This SI documents the pattern in `next-frontend/CLAUDE.md § Testing` so that the bootstrap task, when it lands, adopts the `paths`-anchored convention byte-verbatim without having to re-derive the decision.

**Technical actions:**

1. Edit `next-frontend/CLAUDE.md § Testing` to include a sub-section "MSW Handler Typing Convention" explicitly referencing `next-frontend-openapi-typing/TD-05` as the source of the decision.
2. Add an example code-block in the new sub-section of CLAUDE.md, byte-verbatim in the F2-load-bearing part of the snippet in `### Frontend Runtime → #### next-frontend-openapi-typing/TD-05 — MSW Handler Typing Against the Generated Schema → Setup` (`import type { paths } from "@/lib/api/types.gen"`, `HttpResponse.json<paths[...]["responses"][200]["content"]["application/json"]>(...)`, URL composed from `env.API_URL`).
3. Update the "Status — bootstrap pending" sub-section in `next-frontend/CLAUDE.md` to record that the typing pattern is decided (cross-link to this task) and that the `next-frontend-msw-foundation` task inherits this convention when it runs.

**Dependencies:** SI-3 (references `next-frontend/lib/api/upstream.ts` indirectly — the documented snippet imports `paths` from `lib/api/types.gen` that SI-2 produced), SI-4 (references `lib/api/contracts.ts` in the convention)

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in Migration + Verification SIs)_

**Acceptance criteria:**

- `next-frontend/CLAUDE.md § Testing` contains a sub-section (H3-level heading or section bullet) with a title referencing "MSW Handler Typing Convention" and explicitly cites `next-frontend-openapi-typing/TD-05` as source-of-truth.
- The code-block in the sub-section contains the F2-load-bearing tokens of the snippet (`import type { paths }`, `HttpResponse.json<paths[...]>`, URL via `env.API_URL`) byte-verbatim from `### Frontend Runtime → #### next-frontend-openapi-typing/TD-05 → Setup`.
- The "Status — bootstrap pending" sub-section of CLAUDE.md mentions that the typing convention is decided and references the `next-frontend-msw-foundation` task as the bootstrap owner.

---

## Technical Specifications

### Frontend Runtime

#### next-frontend-openapi-typing/TD-01 — OpenAPI Codegen Tooling

**Pattern:** Types-first OpenAPI consumption. `openapi-typescript` (CLI) emits a single `.d.ts` exporting a `paths` interface — pure types, zero runtime. `openapi-fetch` (~6KB typed wrapper) sits on top of `paths` and is consumed **only server-side** inside Route Handlers (the strict-BFF model from `next-frontend-config-base/TD-03` means the SDK surface is valueless in the browser). MSW handler fixtures, Route Handler request/response typing, and the consumer barrel (`lib/api/contracts.ts`, TD-04) all read from the same `paths` symbol — one source of truth for the wire shape.

**Setup:**

```ts
// next-frontend/lib/api/upstream.ts
import "server-only";
import createClient from "openapi-fetch";
import type { paths } from "./types.gen";
import { env } from "@/lib/env";

export const upstream = createClient<paths>({ baseUrl: env.API_URL });
```

`import "server-only"` (Next.js primitive) turns any Client Component import of this module into a build error — defense-in-depth on top of the BFF model. `env.API_URL` is the server-only key validated by `@t3-oss/env-nextjs` (inherited from `next-frontend-config-base/TD-03`).

**Application:**

Logic-only phase — `## UI Inventory` is the `_Frontend-runtime only —` placeholder; no `### Server-connected Components` sub-block exists yet. The pattern applies to:

- Every Route Handler under `next-frontend/app/api/**/route.ts` that calls the upstream NestJS API — imports `upstream` from `@/lib/api/upstream` and calls `upstream.GET(...)` / `upstream.POST(...)` instead of raw `fetch(env.API_URL + ...)`.
- Every consumer of the generated `paths` type (the barrel `lib/api/contracts.ts`, the MSW handlers `mocks/handlers.ts`) — imports `type { paths } from "@/lib/api/types.gen"`.

Future UI surfaces inherit this constraint via `## Inherited Decisions Detail`; Components themselves do NOT import `openapi-fetch` (browser never calls the upstream).

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** `npx tsc --noEmit` succeeds on `lib/api/upstream.ts` and every consumer of `paths`. Type errors here surface contract drift before runtime.
- **Integration:** `*.integration.test.ts` under `next-frontend/app/api/**/__tests__/` instantiates Route Handlers as functions and asserts on the typed `Response`; `msw/node` intercepts the `upstream.GET/POST` calls. Tests fail if a handler's request shape diverges from the `paths`-derived type.
- **E2E:** out-of-scope at this task (no UI surface).
- **Regression guards:** none (greenfield — no prior fetch sites exist).

#### next-frontend-openapi-typing/TD-02 — Spec Sourcing Under Docker Bind-Mount Isolation

**Pattern:** Committed local copy of the spec at `next-frontend/openapi.json`, kept in sync with the canonical producer at `nestjs-project/openapi.json` via a host-only sync script (`scripts/sync-openapi.sh`). The next-frontend Docker container only bind-mounts its own subproject (per `next-frontend/CLAUDE.md` § Development Environment), so codegen inside the container reads `./openapi.json` — which resolves under `/home/node/app` and points at the local copy. Compose-stack independence is preserved (neither subproject's compose file references the other); drift is prevented structurally by TD-03's CI freshness check.

**Setup:**

```bash
#!/usr/bin/env bash
# scripts/sync-openapi.sh — repo-root, runs on HOST (not in any container)
set -euo pipefail
cp nestjs-project/openapi.json next-frontend/openapi.json
echo "synced: nestjs-project/openapi.json → next-frontend/openapi.json"
```

Both `next-frontend/openapi.json` and `nestjs-project/openapi.json` are committed; the sync script keeps them byte-identical. The script runs on the host — codegen INSIDE the container reads `./openapi.json` (i.e., `/home/node/app/openapi.json`, the mounted local copy).

**Application:**

Logic-only phase. The pattern applies to:

- Repo-root `scripts/sync-openapi.sh` (new file).
- `next-frontend/openapi.json` (new committed file — initially an exact copy of `nestjs-project/openapi.json`).
- Every developer workflow that touches the backend OpenAPI surface: edit a controller in `nestjs-project/` → regenerate `nestjs-project/openapi.json` via that subproject's existing script (`openapi-docs-nestjs/TD-02`) → run `bash scripts/sync-openapi.sh` from repo root → commit both files in the same PR.
- CI workflow (per TD-03) — runs the sync script as the first step of the freshness check.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** running `bash scripts/sync-openapi.sh` produces a `next-frontend/openapi.json` byte-identical to `nestjs-project/openapi.json` (verifiable via `diff -q`).
- **Integration:** TD-03's CI freshness check (see below) is the structural verifier — it asserts that any drift between the two files is caught.
- **E2E:** out-of-scope.
- **Regression guards:** none (greenfield).

#### next-frontend-openapi-typing/TD-03 — Codegen Execution Timing & Output Commit Policy

**Pattern:** Generated types (`next-frontend/lib/api/types.gen.ts`) are committed; an npm script `openapi:types` regenerates them on demand; a CI step runs the full sync+gen pipeline and `git diff --exit-code` over both `openapi.json` and `types.gen.ts`. Drift is impossible to merge: contract changes appear as PR diffs **and** are structurally prevented from going stale. Composes with TD-02 (the sync script is step 1 of the CI check).

**Setup:**

```json
// next-frontend/package.json (excerpt)
{
  "scripts": {
    "openapi:types": "openapi-typescript ./openapi.json -o ./lib/api/types.gen.ts"
  }
}
```

```yaml
# .github/workflows/ci.yml (excerpt — shape of the freshness check)
- name: Sync OpenAPI spec into next-frontend
  run: bash scripts/sync-openapi.sh
- name: Regenerate types from openapi.json
  working-directory: next-frontend
  run: npm run openapi:types
- name: Fail on drift
  run: git diff --exit-code next-frontend/openapi.json next-frontend/lib/api/types.gen.ts
```

The third step is the gate: any non-empty diff means the PR forgot to either sync (`openapi.json` stale) or regenerate (`types.gen.ts` stale). The error message MUST direct developers to `bash scripts/sync-openapi.sh && (cd next-frontend && npm run openapi:types)`.

**Application:**

Logic-only phase. The pattern applies to:

- `next-frontend/package.json` — adds the `openapi:types` script.
- `next-frontend/lib/api/types.gen.ts` — committed generated file. NOT in `.gitignore`.
- CI workflow file (project's CI config — exact path / platform per repo conventions; the workflow does not exist yet so the SI that introduces it must be authored fresh).
- (Optional) `.husky/pre-commit` — same three-step check locally; deferred unless husky/lefthook is already in use elsewhere in the repo.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** running `npm run openapi:types` from inside the `next-frontend` container regenerates `lib/api/types.gen.ts` deterministically (same input ⇒ identical output).
- **Integration:** the CI freshness check itself IS the integration verifier — it fails on any drift; passing means the committed pair is current.
- **E2E:** out-of-scope.
- **Regression guards:** any future PR that edits `nestjs-project/openapi.json` without re-running the sync + codegen will fail the freshness check, preventing the merge.

#### next-frontend-openapi-typing/TD-04 — Type Sharing Between BFF Layer and Components Layer

**Pattern:** A single barrel file `next-frontend/lib/api/contracts.ts` re-exports type aliases for every shape the BFF exposes to its consumers. Pass-through routes export aliases directly from `paths[...]`; reshape routes export named projections (`Pick<...>`, `Omit<...>`, hand-written interfaces). **Both layers — Route Handlers AND Components — import from `@/lib/api/contracts`, never directly from `@/lib/api/types.gen` or from each other's files.** This is the single grep target for "what shape does the BFF expose"; reshapes are visible because their alias name does NOT index `paths`.

**Setup:**

```ts
// next-frontend/lib/api/contracts.ts
import type { paths } from "./types.gen";

// pass-through aliases — BFF returns NestJS shape as-is
export type Video = paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
export type VideoList = paths["/videos"]["get"]["responses"][200]["content"]["application/json"];

// reshape aliases — BFF projects a subset (named ≠ paths[...])
export type VideoCard = Pick<Video, "id" | "title" | "thumbnailUrl">;
```

`lib/api/contracts.ts` is the **only** file in the project allowed to import `paths` from `lib/api/types.gen.ts`. Components and Route Handlers both import named aliases from `@/lib/api/contracts`.

**Application:**

Logic-only phase. The pattern applies to:

- `next-frontend/lib/api/contracts.ts` — the barrel, initially empty (no aliases until the first feature SI introduces an endpoint).
- Every future Route Handler (`next-frontend/app/api/**/route.ts`) that returns typed JSON: types its `NextResponse.json<AliasName>(...)` return off an alias from `@/lib/api/contracts`.
- Every future Server / Client Component that consumes a BFF endpoint: imports the alias from `@/lib/api/contracts`, never from Route Handler modules.
- Future ESLint custom rule (deferred — not part of this task's SI): restrict `from "./types.gen"` / `from "@/lib/api/types.gen"` imports to `lib/api/contracts.ts` only.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** `npx tsc --noEmit` succeeds on `lib/api/contracts.ts` (and every consumer). Adding an alias for a non-existent `paths` key fails compile.
- **Integration:** Route Handler integration tests assert on response shapes derived from the alias; spec changes that break a contract surface as compile failures in `contracts.ts` (load-bearing path) before runtime.
- **E2E:** out-of-scope.
- **Regression guards:** none (greenfield).

#### next-frontend-openapi-typing/TD-05 — MSW Handler Typing Against the Generated Schema

**Pattern:** Hand-written MSW handlers in `mocks/handlers.ts` (and per-test `server.use(...)` overrides) type their fixture bodies via the same `paths` symbol that types the BFF's `openapi-fetch` client. The contract chain spec → `types.gen.ts` → `paths` → handler fixture is end-to-end typed; a stale fixture fails compile after `types.gen.ts` regenerates. Fixtures stay deterministic (no `faker`-randomized auto-generated handlers) so BFF integration tests can assert on specific values.

**Setup:**

```ts
// next-frontend/mocks/handlers.ts
import { http, HttpResponse } from "msw";
import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";

type GetVideoOk = paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];

export const handlers = [
  http.get(`${env.API_URL}/videos/:id`, () =>
    HttpResponse.json<GetVideoOk>({ /* deterministic fixture body */ }),
  ),
];
```

```ts
// next-frontend/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
```

The MSW `setupServer` instance is wired into Vitest `setupFiles` (`server.listen()` / `server.resetHandlers()` / `server.close()` per the bootstrap task, which is out-of-scope here — see `next-frontend/CLAUDE.md` § "Status — bootstrap pending").

**Application:**

Logic-only phase. The pattern applies to:

- `next-frontend/mocks/handlers.ts` — bootstrap baseline (one handler per NestJS endpoint touched by the BFF; empty on day 1, grows feature-by-feature).
- `next-frontend/mocks/server.ts` — `setupServer` wiring (per MSW conventions).
- Every BFF integration test under `next-frontend/app/api/**/__tests__/*.integration.test.ts`: imports Route Handlers as functions, calls them with constructed `Request` objects, and asserts on the returned `Response`. Per-test overrides use `server.use(http.get(...))` typed off `paths[...]` (same anchor).
- URL composition in handlers: uses `${env.API_URL}/...` to match the value the BFF actually calls — the test runtime sets `API_URL` to whatever the test environment routes through.

**Migration:**

| File | Current behavior | Required change | Owning SI |
|------|-----------------|-----------------|-----------|
| (none) | MSW not yet wired; `mocks/handlers.ts` and `mocks/server.ts` do not exist | Author baseline `handlers.ts` (typed off `paths`) + `server.ts` (calls `setupServer(...handlers)`) | Owned by a separate bootstrap task — `next-frontend-msw-foundation` (identified during `/decide` triage 2026-05-13). |

The bootstrap of Vitest + MSW + the wiring of `setupFiles` is **out-of-scope** for this task; this task only locks the **typing pattern** (`paths`-anchored fixtures, no auto-generated handlers, no `faker`). The bootstrap task adopts the pattern when it lands.

**Verification:**

- **Unit:** `npx tsc --noEmit` succeeds on `mocks/handlers.ts`. A stale fixture (e.g., upstream renamed a field) fails compile.
- **Integration:** BFF integration tests assert on specific values returned by the handlers / per-test overrides — deterministic by construction.
- **E2E:** out-of-scope (E2E tests don't use MSW per `next-frontend/CLAUDE.md` § Testing).
- **Regression guards:** every endpoint added to the BFF's `paths` index must have a corresponding hand-written handler (or per-test override) before the integration test for that route can run; the discipline is enforced by the test failing on missing handler ("request unhandled" from `msw/node`).

---

## Dependency Map

```
SI-1 (root: repo-root sync script + next-frontend/openapi.json)
└── SI-2 — depends on SI-1 (codegen reads ./openapi.json — must be committed)
    ├── SI-3 — depends on SI-2 (upstream.ts needs lib/api/types.gen.ts to typecheck)
    ├── SI-4 — depends on SI-2 (contracts.ts imports paths from lib/api/types.gen.ts)
    └── SI-5 — depends on SI-1 + SI-2 (CI workflow chains sync + gen + diff)
SI-6 — depends on SI-3 + SI-4 (MSW typing docs reference both lib/api/upstream.ts and lib/api/contracts.ts as canonical anchors)
```

---

## Deliverables

- [ ] SI-1 — Spec sourcing under Docker isolation (Setup)
- [ ] SI-2 — Codegen pipeline: install openapi-typescript + npm script + first generation
- [ ] SI-3 — Typed upstream client (`lib/api/upstream.ts`)
- [ ] SI-4 — Contracts barrel (`lib/api/contracts.ts`)
- [ ] SI-5 — CI freshness check workflow
- [ ] SI-6 — MSW handler typing pattern documentation in CLAUDE.md

**Full test suites:**

- [ ] Type-check passes (`docker compose exec next-frontend npx tsc --noEmit`) — primary gate; verifies `lib/api/upstream.ts` + `lib/api/contracts.ts` resolve against generated `paths`.
- [ ] Lint passes (`docker compose exec next-frontend npm run lint`).
- [ ] Production build passes (`docker compose exec next-frontend npm run build`) — verifies the `import "server-only"` boundary doesn't leak into client bundles.
- [ ] CI freshness check baseline (SI-5 workflow) passes on the merge commit — i.e., `git diff --exit-code next-frontend/openapi.json next-frontend/lib/api/types.gen.ts` returns 0 against the committed pair.
- Frontend Vitest + MSW test suite: **out-of-scope** for this task. The test runner / MSW server / setup-files bootstrap is owned by the separate `next-frontend-msw-foundation` task (per `next-frontend/CLAUDE.md` § "Status — bootstrap pending"); once that task lands, the suite gates the typing pattern this task established.
