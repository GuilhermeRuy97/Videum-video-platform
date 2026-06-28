---
kind: task
name: task-next-frontend-msw-foundation
test_specs_aware: true
sources_mtime:
  docs/tasks/task-next-frontend-msw-foundation/context.md: "2026-05-13T20:07:54-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-05-13T20:06:42-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-05-13T19:51:13-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-05-13T15:23:15-03:00"
  docs/phases/phase-02-auth/context.md: "2026-05-12T14:01:10-03:00"
  .claude/skills/testing-guide-next-frontend/SKILL.md: "2026-05-13T10:59:26-03:00"
---

# next-frontend MSW Foundation

## Objective

MSW (Mock Service Worker) foundation for next-frontend: handler module organization across domains/phases, separation between Node test handlers (msw/node) and browser dev handlers (msw/browser Service Worker), response builder/factory strategy (with or without faker-js), and how each phase exposes its handler set to that phase's tests.

---

## Step Implementations

### SI-1 — Install MSW + Vitest and test dependencies

**Description:** Add Vitest, MSW v2, and RTL/jsdom libraries to `next-frontend/package.json` as `devDependencies`; activate the npm scripts (`test`, `test:watch`) that `next-frontend/CLAUDE.md` § Commands already documents as a contract. Pure infra — no test or mock file is created in this SI.

**Technical actions:**

1. Run `docker compose exec next-frontend npm install --save-dev msw vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/coverage-v8` — adds the runner (Vitest) and the Node interceptor (`msw/node`) required by `next-frontend-msw-foundation/TD-02` and `TD-04` (see `### Frontend Runtime → TD-02 / TD-04`).
2. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `next-frontend/package.json → scripts` — makes the commands documented in `CLAUDE.md § Commands` executable.
3. Run `docker compose exec next-frontend npx vitest --version` as a binary smoke test (persists no artifact; just validates that the install was clean).

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec next-frontend npm ls msw vitest @testing-library/react @testing-library/jest-dom jsdom` lists each dependency without `extraneous` / `invalid`.
- `next-frontend/package.json → scripts` contains `test` and `test:watch` exactly as `next-frontend/CLAUDE.md § Commands` documents.
- `docker compose exec next-frontend npx vitest --version` prints the installed version and exits 0.

---

### SI-2 — Create the `mocks/handlers/` tree + barrel + seed + `mocks/factories/` directory

**Description:** Materialize the per-domain skeleton decided in `next-frontend-msw-foundation/TD-01` (barrel + seed file) and the placeholder for factories decided in `TD-03`. Greenfield — no domain (auth/videos/...) is populated here; each future phase adds a `mocks/handlers/<domain>.ts` file and one line in the barrel.

**Technical actions:**

1. Create `next-frontend/mocks/handlers/_seed.ts` with `export const handlers: import("msw").RequestHandler[] = []` — keeps the barrel typecheck-valid until the first phase adds a real domain (per `next-frontend-msw-foundation/TD-01`, canonical shape in `### Frontend Runtime → TD-01`).
2. Create `next-frontend/mocks/handlers/index.ts` with `import { handlers as seedHandlers } from "./_seed"; export const handlers = [...seedHandlers];` — barrel that each future phase extends with `import { handlers as authHandlers } from "./auth"` + spread in the array (per `next-frontend-msw-foundation/TD-01`).
3. Create `next-frontend/mocks/factories/.gitkeep` (directory placeholder; the first real factory — `buildUser` — arrives with Phase 02 via `next-frontend-msw-foundation/TD-03`).

**Tests:** _(empty — Infra)_

**Dependencies:** SI-1

**Acceptance criteria:**

- `next-frontend/mocks/handlers/index.ts` and `next-frontend/mocks/handlers/_seed.ts` exist; the `handlers` array in the barrel is typed as `RequestHandler[]` (no `as` / cast).
- `next-frontend/mocks/factories/.gitkeep` exists (empty directory in git).
- `docker compose exec next-frontend npx tsc --noEmit` exits 0 — the new barrel + seed do not break the typecheck.

---

### SI-3 — Wire MSW into the Vitest lifecycle (`mocks/server.ts` + `mocks/setup.ts` + `vitest.config.ts`)

**Description:** Loads MSW's Node-only `setupServer` into Vitest's `setupFiles`. Applies TD-02 (test-only — no `setupWorker` in the browser) and TD-04 (universal handler set + `server.use(...)` overrides + `onUnhandledRequest: "error"` + `resetHandlers` in `afterEach`). Smoke-gated: Vitest must start cleanly loading the server and report "0 tests" because no specs exist yet.

**Technical actions:**

1. Create `next-frontend/mocks/server.ts` with `setupServer(...handlers)` importing from the SI-2 barrel (per `next-frontend-msw-foundation/TD-02`; canonical shape in `### Frontend Runtime → TD-02`).
2. Create `next-frontend/mocks/setup.ts` with `beforeAll(() => server.listen({ onUnhandledRequest: "error" }))`, `afterEach(() => server.resetHandlers())`, `afterAll(() => server.close())` (per `next-frontend-msw-foundation/TD-04`; canonical shape in `### Frontend Runtime → TD-04`).
3. Create `next-frontend/vitest.config.ts` with `environment: "node"` and `setupFiles: ["./mocks/setup.ts"]` (per `next-frontend-msw-foundation/TD-04`).
4. Run `docker compose exec next-frontend npm test` for the bootstrap smoke — expected exit 0 with "0 test files / 0 tests" (Vitest loads `setupFiles`, MSW initializes, nothing is intercepted because no test issued a `fetch`).

**Tests:** _(empty — Setup SI; smoke-gated by AC; behavior tests live in consumer phases starting at Phase 02)_

**Dependencies:** SI-2

**Acceptance criteria:**

- `next-frontend/mocks/server.ts`, `next-frontend/mocks/setup.ts`, `next-frontend/vitest.config.ts` exist with the shapes documented in `### Frontend Runtime`.
- `docker compose exec next-frontend npm test` exits 0; output contains "0 test files" and does NOT contain `onUnhandledRequest` warnings (because no `fetch` was issued).
- `docker compose exec next-frontend npx tsc --noEmit` exits 0 — all MSW v2 + Vitest + `paths` imports resolve; `handlers: RequestHandler[]` typechecks against the signature of `setupServer(...handlers)`.

---

### SI-4 — Update `.claude/rules/next-frontend-msw-mocks.md` to reflect the decided structure

**Description:** The current rule (`.claude/rules/next-frontend-msw-mocks.md`) shows `mocks/handlers.ts` as a single file (legacy example from the pre-decision contract). Update it to reflect what this task materialized: the per-domain `mocks/handlers/<domain>.ts` tree + barrel (TD-01), the `mocks/factories/` directory with the `buildX(overrides)` convention (TD-03), and the `listen({ onUnhandledRequest: "error" }) + resetHandlers + close` lifecycle (TD-04). The exception "`mocks/` may import `paths` directly" remains — it was already locked by `next-frontend-openapi-typing/TD-05`.

**Technical actions:**

1. Edit `.claude/rules/next-frontend-msw-mocks.md` § "Where MSW lives": replace the single reference to `mocks/handlers.ts` with a listing that includes `mocks/handlers/<domain>.ts`, `mocks/handlers/index.ts` (barrel), `mocks/factories/<domain>.ts`, `mocks/server.ts`, `mocks/setup.ts` — with a one-liner explaining each one's role (per `next-frontend-msw-foundation/TD-01` and `TD-02`).
2. Add a new subsection "Lifecycle (Vitest `setupFiles`)" documenting the cycle `listen({ onUnhandledRequest: "error" }) → resetHandlers (afterEach) → close (afterAll)`, with a short snippet and the rationale for `onUnhandledRequest: "error"` (per `next-frontend-msw-foundation/TD-04`).
3. Add a new subsection "Factories convention" describing `mocks/factories/<domain>.ts` exporting `buildX(overrides?: Partial<X>): X` with hand-written defaults, and the rule that `@faker-js/faker` is opt-in only for `buildXList` with a local `faker.seed(N)` before generation (per `next-frontend-msw-foundation/TD-03`).
4. Update the code example that shows a handler — swap `next-frontend/mocks/handlers.ts` for `next-frontend/mocks/handlers/auth.ts`, preserving the rest byte-verbatim (the typing via `paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"]` and the composition with `${env.API_URL}/...`).

**Tests:** _(empty — rule doc only)_

**Dependencies:** SI-3

**Acceptance criteria:**

- `.claude/rules/next-frontend-msw-mocks.md` cites `mocks/handlers/<domain>.ts` and `mocks/handlers/index.ts` explicitly; the isolated string `mocks/handlers.ts` was removed or swapped where it represented the old single file.
- The rule contains the subsections "Lifecycle (Vitest setupFiles)" and "Factories convention" with verbatim references to `next-frontend-msw-foundation/TD-04` and `TD-03` respectively.
- The handler example in the rule uses `next-frontend/mocks/handlers/auth.ts` (not `mocks/handlers.ts`); the `paths[...]` typing and the `${env.API_URL}/...` URL were preserved verbatim.
- The "Exception to the contracts-barrel rule" block remains present and unchanged (it was already correct pre-decision).

---

### SI-5 — Update `next-frontend/CLAUDE.md § Testing → Status` to reflect bootstrap completion

**Description:** The subsection `## Testing → ### Status — bootstrap pending` in `next-frontend/CLAUDE.md` lists all the artifacts that SI-1..SI-3 just materialized as "not installed yet". Replace it with a `### Status — bootstrap complete` subsection referencing this task as the foundation, and keep the "Already decided" block (TD-05 of openapi-typing) updated to reflect that it is now an executed convention, not a pending one.

**Technical actions:**

1. Edit `next-frontend/CLAUDE.md § Testing`: replace the `### Status — bootstrap pending` block with `### Status — bootstrap complete` listing the now-present artifacts (`next-frontend/vitest.config.ts`, `next-frontend/mocks/server.ts`, `next-frontend/mocks/setup.ts`, `next-frontend/mocks/handlers/index.ts`, `next-frontend/mocks/factories/`) and citing `docs/tasks/task-next-frontend-msw-foundation/` as the foundation that materialized everything.
2. Update the "Already decided" block to make explicit that `next-frontend-openapi-typing/TD-05` (handler typing via `paths`) is already executed in the per-domain handlers created (no longer "pending convention").

**Tests:** _(empty — doc only)_

**Dependencies:** SI-4

**Acceptance criteria:**

- `next-frontend/CLAUDE.md § Testing` no longer contains the literal string "bootstrap pending" nor "do not exist yet" referencing the files created in SI-3.
- The `### Status` subsection references this task by the path `docs/tasks/task-next-frontend-msw-foundation/` as the origin of the decisions.
- The "Already decided" block cites `next-frontend-openapi-typing/TD-05` as a convention in force (not pending).

---

## Technical Specifications

### Frontend Runtime

#### next-frontend-msw-foundation/TD-01 — Handler Module Organization & Phase Expansion Model

**Pattern:** Per-domain handler modules under `mocks/handlers/<domain>.ts` (`auth.ts`, `videos.ts`, `channels.ts`, …) composed via a barrel `mocks/handlers/index.ts`. Each phase contributes one new domain file plus one line in the barrel — append-only, minimal merge-conflict surface, matches MSW's official "Structuring handlers" recommendation. Inside a domain file, group handlers by **HTTP method + path** (one handler per `paths` entry), never by test scenario — per-test deviations layer via `server.use(...)`.

**Setup:** Canonical shape of the `mocks/handlers/` tree + barrel re-export.

```ts
// next-frontend/mocks/handlers/index.ts
import { handlers as authHandlers } from "./auth";
// import { handlers as videosHandlers } from "./videos";  // appended by Phase 03
export const handlers = [...authHandlers /* , ...videosHandlers */];
```

```ts
// next-frontend/mocks/handlers/auth.ts  (example shape; populated by Phase 02)
import { http, HttpResponse } from "msw";
import type { paths } from "@/lib/api/types.gen";
import { env } from "@/lib/env";

export const handlers = [
  // one handler per (method, path) — happy-path default; per-test edge cases via server.use(...)
];
```

**Application:** logic-only — applies to every domain handler file the project will author. Foundation creates `mocks/handlers/index.ts` plus a seed `mocks/handlers/_seed.ts` exporting `export const handlers = []` (keeps the barrel valid + TypeScript clean before the first real domain module lands). Future phases each contribute one `mocks/handlers/<domain>.ts` file plus one barrel line — Phase 02 (`auth.ts`), Phase 03 (`videos.ts`), Phase 04 (`channels.ts`), Phase 06 (`comments.ts`, `likes.ts`), Phase 07 (`search.ts`).

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current task._

**Verification:**

- **Unit:** N/A (barrel has no logic to unit-test).
- **Integration:** N/A at foundation — first real handler/test pair arrives with Phase 02 (auth signup integration test).
- **Regression guards:** `docker compose exec next-frontend npx tsc --noEmit` exits clean after the barrel + seed are created (the empty `handlers` array typechecks against MSW v2's `RequestHandler[]`).

#### next-frontend-msw-foundation/TD-02 — Node Test Handlers vs. Browser Dev Handlers

**Pattern:** Foundation wires test-only `setupServer` (from `msw/node`) at `mocks/server.ts`. The browser worker (`setupWorker` from `msw/browser`) is **deferred** — `public/mockServiceWorker.js` is NOT generated; `mocks/browser.ts` does NOT exist. Adding browser interception later is additive (non-breaking) once a real FE-offline-dev consumer appears (Storybook, design-system playground, FE-team sprint without backend).

**Setup:** Canonical `mocks/server.ts` shape — single source for the Vitest setupFile.

```ts
// next-frontend/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
export const server = setupServer(...handlers);
```

**Application:** logic-only — applies to every Vitest integration test under `next-frontend/app/api/**/__tests__/*.integration.test.ts` (BFF Route Handler test pattern from `next-frontend/CLAUDE.md` § Testing). The browser worker is intentionally absent — Client Components developed in foundation/Phase 02 do not have FE-offline mocking. A future phase that needs browser-side mocks supersedes this TD with the `mocks/browser.ts` + `public/mockServiceWorker.js` additive set.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current task._

**Verification:**

- **Unit:** N/A.
- **Integration:** the first integration test authored by Phase 02 exercises the wiring end-to-end — Vitest loads `mocks/setup.ts`, which calls `server.listen()`, which intercepts the `fetch` issued by the imported Route Handler when it calls `${env.API_URL}/auth/signup`.
- **Regression guards:** `next-frontend/public/` does NOT contain `mockServiceWorker.js` after this task completes — that file is the signal that browser mocking has been wired; its absence is the signal that Option A holds. Add a CI grep or pre-commit assertion if drift is a concern.

#### next-frontend-msw-foundation/TD-03 — Response Builders / Factory Pattern (with or without faker-js)

**Pattern:** Hand-written deterministic factories under `mocks/factories/<domain>.ts` are the default — every shape gets a `buildX(overrides?: Partial<X>): X` function that composes a hand-coded `baseX: X` literal with the caller's overrides. `@faker-js/faker` is **opt-in** and **scoped to bulk-collection builders only** (e.g., `buildVideoList(n, seed)`); when used, `faker.seed(N)` is called **immediately before** generating the collection so determinism is local to that builder and does not interact with the global cursor. Faker is NOT installed at foundation — first bulk builder triggers the install.

**Setup:** Canonical factory shape — hand-written deterministic default + scoped seeded faker pattern (commented; not active at foundation).

```ts
// next-frontend/mocks/factories/<domain>.ts  (example shape; first real factory authored by Phase 02)
import type { User } from "@/lib/api/contracts";

const baseUser: User = {
  id: "user-1",
  email: "alice@example.com",
  channelSlug: "alice",
  confirmedAt: "2026-05-01T00:00:00Z",
  createdAt: "2026-04-01T00:00:00Z",
  // mirror User from `@/lib/api/contracts` verbatim
};
export const buildUser = (overrides: Partial<User> = {}): User => ({
  ...baseUser,
  ...overrides,
});

// Opt-in seeded faker — only when bulk lists matter (NOT installed at foundation):
// import { faker } from "@faker-js/faker";
// export const buildUserList = (n: number, seed = 42): User[] => {
//   faker.seed(seed);  // local seed — does NOT affect any other factory's cursor
//   return Array.from({ length: n }, (_, i) =>
//     buildUser({ id: `user-${i + 1}`, email: faker.internet.email() }));
// };
```

**Application:** logic-only — applies to every shape that future-phase tests author overrides for. Foundation creates `mocks/factories/` as a directory with a `.gitkeep` placeholder (no `_seed.ts` here — factories are typed against `@/lib/api/contracts`, which itself is empty at foundation, so no fake-content file is needed). `@faker-js/faker` is NOT added to `next-frontend/package.json` `devDependencies` at this task — it is installed by the first phase whose tests author a `buildXList` bulk builder.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current task._

**Verification:**

- **Unit:** N/A at foundation (no factory exists yet).
- **Integration:** Phase 02's first auth test exercises the first factory (e.g., `buildUser({ confirmedAt: null })` for the unconfirmed-user case) and proves the shape — the override pattern works, the default has the right contract shape (typechecks against `@/lib/api/contracts → User`), and the test reads as intent.
- **Regression guards:** `next-frontend/package.json` `devDependencies` does NOT include `@faker-js/faker` after this task completes — confirms the opt-in deferral.

#### next-frontend-msw-foundation/TD-04 — How Each Phase's Tests Consume the Handler Set

**Pattern:** Universal handler set loaded into a single `setupServer(...handlers)` at suite startup via Vitest's `setupFiles`. Per-test deviation uses `server.use(...)` (MSW's canonical override recipe). `afterEach(() => server.resetHandlers())` keeps tests isolated. `server.listen({ onUnhandledRequest: "error" })` makes any unintercepted `fetch` throw — phase-only scoping is enforced by the **URLs each test actually fetches**, not by the loaded handler set. The phase boundary lives at the **authoring** layer (TD-01's per-domain files), not at the runtime layer.

**Setup:** Canonical Vitest setupFile + `vitest.config.ts` registration.

```ts
// next-frontend/mocks/setup.ts
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```ts
// next-frontend/vitest.config.ts (relevant excerpt — node environment for BFF integration tests; component tests opt into jsdom per file)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./mocks/setup.ts"],
  },
});
```

**Application:** logic-only — applies to every `*.integration.test.ts` under `next-frontend/app/api/**/__tests__/` (BFF Route Handler test pattern). Per-test overrides via `server.use(http.METHOD(...))` are the documented mechanism for happy-path/error-path scenario switching; `afterEach`'s `server.resetHandlers()` guarantees overrides do not leak. Unit `*.test.ts` files (component / hook / util tests) inherit the same global `setupFiles` registration; whether they exercise MSW depends on whether they `fetch` — unintercepted fetches fail loudly because of `onUnhandledRequest: "error"`.

**Migration:**

_No existing files require refactor — Setup SI is the only application of this pattern in the current task._

**Verification:**

- **Unit:** N/A at foundation.
- **Integration:** the first integration test authored by Phase 02 must (a) call the imported Route Handler, (b) observe that `server.listen({ onUnhandledRequest: "error" })` was applied — any accidentally-unhandled `fetch` fails the test loudly with `"request unhandled"`, (c) reset between tests — a `server.use(...)` override in test 1 does not leak into test 2 (provable by writing two tests where test 1 overrides and test 2 expects the default fixture).
- **E2E:** N/A — MSW does not run under Playwright in this project (per `next-frontend/CLAUDE.md` § Testing — Playwright drives the running app against whichever upstream the running environment is wired to).
- **Regression guards:** `docker compose exec next-frontend npm test` (once Phase 02 adds tests) exits clean with no `onUnhandledRequest` warnings logged by MSW.

---

<!-- phase-a-complete -->

## Dependency Map

```
SI-1 (root — install deps)
└── SI-2 — depends on SI-1 (msw types needed to type the handlers array)
    └── SI-3 — depends on SI-2 (server.ts imports `handlers` from the barrel created in SI-2)
        └── SI-4 — depends on SI-3 (rule documents the structure that now exists on disk — not a speculative spec)
            └── SI-5 — depends on SI-4 (CLAUDE.md points to the rule; rule must reflect post-bootstrap reality before CLAUDE.md cites it)
```

Strict linear chain — each SI builds on the previous. No parallel roots.

---

## Deliverables

- [ ] SI-1 — Install MSW + Vitest and test dependencies
- [ ] SI-2 — Create the `mocks/handlers/` tree + barrel + seed + `mocks/factories/` directory
- [ ] SI-3 — Wire MSW into the Vitest lifecycle (`mocks/server.ts` + `mocks/setup.ts` + `vitest.config.ts`)
- [ ] SI-4 — Update `.claude/rules/next-frontend-msw-mocks.md` to reflect the decided structure
- [ ] SI-5 — Update `next-frontend/CLAUDE.md § Testing → Status` to reflect bootstrap completion

**Full test suites:**

- [ ] Frontend tests pass (`docker compose exec next-frontend npm test`) — exit 0 with "0 test files / 0 tests" at the end of this task (first real tests arrive in Phase 02).
- [ ] Type/compilation checks pass (`docker compose exec next-frontend npx tsc --noEmit`) — exit 0 with the `mocks/` tree + `vitest.config.ts` on disk.
- [ ] Lint passes (`docker compose exec next-frontend npm run lint`) — exit 0 (the `mocks/` tree follows the already-wired ESLint configuration of `next-frontend`).
