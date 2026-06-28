---
kind: task
name: task-next-frontend-config-base
test_specs_aware: true
sources_mtime:
  docs/tasks/task-next-frontend-config-base/context.md: "2026-05-13T14:53:01-03:00"
  docs/tasks/task-next-frontend-config-base/library-refs.md: "2026-05-13T14:53:57-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-05-13T14:50:56-03:00"
  docs/decisions/technical-decisions-phase-01-base-configuration.md: "2026-05-12T14:01:33-03:00"
---

# next-frontend Config Base — Env Validation Foundation

## Objective

Foundation for environment variable configuration and validation in the next-frontend subproject: validation library, server/client boundary enforcement strategy, and the initial canonical env-key contract for the FE↔BE bridge.

---

## Step Implementations

### SI-1 — Install deps and create env loader

**Description:** Install `zod@^4.0.0` and `@t3-oss/env-nextjs@^0.13.0` as runtime dependencies of `next-frontend`; create `next-frontend/lib/env.ts` exporting the typed `env` object via `createEnv()`; create `next-frontend/.env.example` documenting the canonical set of keys (`API_URL` + `NODE_ENV`).

**Technical actions:**

1. Run `docker compose exec next-frontend npm install zod@^4.0.0 @t3-oss/env-nextjs@^0.13.0` (npm commands always inside the container per `next-frontend/CLAUDE.md` § "Commands")
2. Create `next-frontend/lib/env.ts` exporting `env` via `createEnv({ server: { API_URL: z.url() }, client: {}, shared: { NODE_ENV: z.enum([...]) }, experimental__runtimeEnv: { NODE_ENV: process.env.NODE_ENV }, emptyStringAsUndefined: true })` (per `next-frontend-config-base/TD-02` Setup + `next-frontend-config-base/TD-01` idioms Zod 4 + `next-frontend-config-base/TD-03` canonical keys)
3. Create `next-frontend/.env.example` documenting `API_URL` (server-only, URL format, commented Docker example) and `NODE_ENV` (per `next-frontend-config-base/TD-03` Setup)
4. Run `docker compose exec next-frontend npx tsc --noEmit` to confirm compilation OK

**Tests:** _(empty — Setup SI; smoke-gated by `npx tsc --noEmit` (action 4); validation behavior is built-in via the `@t3-oss/env-nextjs` runtime and has no project-level branching logic to assert.)_

**Dependencies:** none

**Acceptance criteria:**

- `next-frontend/package.json` declares `zod` and `@t3-oss/env-nextjs` in `dependencies`.
- `next-frontend/lib/env.ts` exists and exports `env` as a named export; the type is inferred by `createEnv` (no `as` casts in consumers).
- `next-frontend/lib/env.ts` declares `server: { API_URL: z.url() }`, `client: {}`, `shared: { NODE_ENV: z.enum(["development", "production", "test"]) }`, `experimental__runtimeEnv: { NODE_ENV: process.env.NODE_ENV }`, and `emptyStringAsUndefined: true`.
- `next-frontend/.env.example` exists and documents exactly `API_URL` and `NODE_ENV` (no mention of `NEXT_PUBLIC_API_URL`).
- `docker compose exec next-frontend npx tsc --noEmit` ends with exit code 0.

---

### SI-2 — Update next-frontend/CLAUDE.md for strict BFF

**Description:** Rewrite the "Talking to the NestJS API" section in `next-frontend/CLAUDE.md` to align with decision TD-03: remove the planned `NEXT_PUBLIC_API_URL` convention and document the strict BFF model — a single server-only `API_URL` key; the browser talks to the backend only via same-origin Route Handlers.

**Technical actions:**

1. Edit `next-frontend/CLAUDE.md` § "Talking to the NestJS API" — replace the planned dual-key paragraph with the single-key strict-BFF convention: only `API_URL` (server-only) exists; clients access the backend exclusively via Route Handlers (same-origin); remove the `NEXT_PUBLIC_API_URL` mention; reference `next-frontend/lib/env.ts` as the source-of-truth for env reads (per `next-frontend-config-base/TD-03` Migration)

**Tests:** _(empty — documentation update; correctness validated by grep in the ACs.)_

**Dependencies:** SI-1 _(the env layer in `lib/env.ts` must exist before CLAUDE.md references it as the canonical source-of-truth)_

**Acceptance criteria:**

- `grep -rn 'NEXT_PUBLIC_API_URL' next-frontend/` returns zero matches after the edit.
- `next-frontend/CLAUDE.md` § "Talking to the NestJS API" cites `API_URL` as the only environment key for the backend and references `next-frontend/lib/env.ts` as source-of-truth.
- The section explicitly mentions the strict BFF model (Client Components → same-origin Route Handlers → NestJS) and removes any reference to direct browser-to-backend calls.

---

## Technical Specifications

### Frontend Runtime

#### next-frontend-config-base/TD-01 — Validation Library for Env Schema

**Pattern:** Three converging reasons: (1) **Type-inference matches the FE's strict-TS culture** — `lib/env.ts` exports a typed `env` object with no `as` casts, satisfying the project's "Type Safety" working principle. (2) **Ecosystem gravity in Next.js / React 19** — Zod is the de-facto schema language for App Router (Server Actions inputs, form resolvers, future contract validation), so introducing it once at the env layer compounds value for forms in Phase 02+. (3) **Direct enablement of TD-02 Option A (`@t3-oss/env-nextjs`)** — t3-env's first-citizen validator. Backend parity with Joi is not load-bearing: env schemas are not shared FE↔BE (different runtimes, different key sets); two validators across two subprojects is a bounded cost.

**Setup:** Zod 4 schemas are consumed by `createEnv()` (see TD-02). The Zod 4 idioms locked by this TD — used for every env value validation in this phase:

```ts
// idiom set — applied inside createEnv() schemas (TD-02)
z.url()                                        // top-level URL validator (NOT z.string().url() — deprecated in v4)
z.coerce.number().default(3000)                // string→number with fallback for empty .env entries
z.stringbool()                                 // env-style boolean parsing: "true"|"1"|"yes"|"on" → true
z.enum(["development", "production", "test"])  // fixed-value sets (e.g., NODE_ENV)
z.string().min(1)                              // non-empty server-side secret
```

Zod 4 moved string-format methods to top-level functions; `z.string().url()` from older blog posts is deprecated and MUST NOT be used.

**Application:** logic-only — applies to the single `next-frontend/lib/env.ts` module (TD-02 instantiates `createEnv` with these schemas). Future phases reuse Zod 4 for `react-hook-form` resolvers, Server Action input validation, and any contract typing that lands later. No other module in this phase imports Zod directly.

**Migration:** _No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** `npx tsc --noEmit` exits 0 on `lib/env.ts` and any consumer files; consumers reference `env.X` without `as` casts (assertion via grep on consumer files: `as\s+[A-Z]` adjacent to `env\.` returns zero matches).
- **Integration:** N/A in this phase — Zod is exercised through TD-02's `createEnv` runtime; no isolated Zod test surface.
- **E2E:** N/A.
- **Regression guards:** none (greenfield — Zod has zero prior consumers in `next-frontend/`).

#### next-frontend-config-base/TD-02 — Server/Client Boundary Enforcement Strategy

**Pattern:** The only option that combines (i) **type-level NEXT_PUBLIC_ prefix enforcement**, (ii) **runtime Proxy-based leak detection**, and (iii) **single-file, single-import-path consumer ergonomics**. Option B reaches roughly the same _structural_ outcome at higher implementation and maintenance cost, with a weaker guarantee (no prefix enforcement, no proxy). Option C is unsafe at any non-trivial team size. The marginal cost over B is one ~3KB dep — well-spent for the strongest boundary among the three.

**Setup:** `next-frontend/lib/env.ts` exports a single typed `env` object via `createEnv({ server, client, shared, experimental__runtimeEnv, emptyStringAsUndefined })`. Next.js 16.2.6 is `>= 13.4.4`, so the `experimental__runtimeEnv` path applies (server vars auto-pulled from `process.env`; only client + shared listed in runtime).

```ts
// next-frontend/lib/env.ts
export const env = createEnv({
  server: { API_URL: z.url() },
  client: {},
  shared: { NODE_ENV: z.enum(["development", "production", "test"]) },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
  },
  emptyStringAsUndefined: true,
});
```

Boundary guarantees locked by this snippet:

- Keys added to `client` MUST be prefixed with `NEXT_PUBLIC_` (TS compile error otherwise; currently empty per TD-03 strict BFF).
- Any client-bundle access to `server.API_URL` throws `"Attempted to access a server-side environment variable on the client"` (runtime Proxy).
- `emptyStringAsUndefined: true` normalizes empty `.env` entries to `undefined` so Zod `.default()` fires.

**Application:** logic-only — `lib/env.ts` is the sole module that calls `createEnv`. Every consumer across the app imports the validated object via `import { env } from "@/lib/env"` regardless of context (RSC, Route Handler, Server Action, Client Component). Direct `process.env.X` reads in feature code are forbidden post-adoption — allowed only inside `lib/env.ts` itself and inside non-Next contexts that explicitly load env via `loadEnvConfig(process.cwd())` from `@next/env` (e.g., future Vitest setup files, codegen scripts).

**Migration:**

| File | Current behavior | Required change | Owning SI |
|------|-----------------|-----------------|-----------|
| _(none — `next-frontend/` has no current env consumers)_ | — | — | — |

_No existing files require refactor — Setup SI is the only application of this pattern in the current phase._

**Verification:**

- **Unit:** `npx tsc --noEmit` exits 0 across `next-frontend/`. Type surface assertion: importing `env` from a `"use client"` module narrows the type — `env.API_URL` is NOT in the autocomplete suggestions on client modules (t3-env's type-level narrowing).
- **Integration:** N/A in this phase (no Route Handler / RSC exists yet to consume `env`). The first downstream phase that introduces a Route Handler consuming `env.API_URL` validates the runtime Proxy boundary via an `*.integration.test.ts` that imports the route handler and asserts the fetched URL contains the env value.
- **E2E:** N/A.
- **Regression guards:** none (greenfield — no prior env reading in `next-frontend/`).

#### next-frontend-config-base/TD-03 — API URL Key Strategy for the FE↔BE Bridge

**Pattern:** Aligned with the BFF testing strategy and architectural commitment already documented in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller; BFF tests stub `fetch` via MSW). Eliminates CORS, eliminates public exposure of the backend URL, and produces the smallest correct foundation. Option B's `NEXT_PUBLIC_API_URL` is a future-proofing concession with no current consumer — and adding a public key later is a non-breaking change, while removing one is breaking. Option C ties a foundational decision to infra work explicitly deferred elsewhere.

**Setup:** Exactly one server-only env key — `API_URL` — is the canonical backend address from the FE side. Client Components / browser bundles MUST NOT reference it (enforced structurally by TD-02's t3-env boundary). Server contexts (Route Handlers, Server Actions, RSC) consume it via `env.API_URL`.

```ts
// canonical key set locked by this TD (extends the server slot of TD-02's createEnv)
server: {
  API_URL: z.url(),    // e.g., http://nestjs-api:3000 (shared Compose net) or http://host.docker.internal:3000 (dev)
},
client: {},            // intentionally empty — NO public API URL key in this phase
shared: {
  NODE_ENV: z.enum(["development", "production", "test"]),
},
```

`.env.example` documents `API_URL` + `NODE_ENV` (no `NEXT_PUBLIC_API_URL` entry; absence is intentional and load-bearing for the strict BFF model).

The concrete _value_ of `API_URL` in dev (shared Compose network with `http://nestjs-api:3000` vs `http://host.docker.internal:3000`) is **out-of-scope for this TD** — that is a Docker-Compose-topology decision deferred to a future infra ad-hoc TD or Phase 02 pre-work.

**Application:** logic-only — `API_URL` is consumed only inside `next-frontend/app/api/**/route.ts` files (BFF Route Handlers) and Server Actions / RSC that hit the backend directly. Client Components reaching the backend MUST go through a Route Handler at the same origin (the BFF model). No future phase may introduce a `NEXT_PUBLIC_API_URL` without revisiting this TD (Revision via `/decide` or Supersede via `/research`).

**Migration:**

| File | Current behavior | Required change | Owning SI |
|------|-----------------|-----------------|-----------|
| `next-frontend/CLAUDE.md` | The "Talking to the NestJS API" section names a planned `NEXT_PUBLIC_API_URL` (for client-side reads) alongside `API_URL` (server-side reads) | Rewrite the dual-key paragraph to the single-key strict-BFF model: only `API_URL` exists (server-only); browser hits the backend only via same-origin Route Handlers; remove the `NEXT_PUBLIC_API_URL` mention | SI-NN.M (Doc Update) |

**Verification:**

- **Unit:** after the doc-update SI completes, `grep -rn 'NEXT_PUBLIC_API_URL' next-frontend/` returns zero matches (currently only `next-frontend/CLAUDE.md` mentions it; updating it is sufficient).
- **Integration:** the first downstream Route Handler that consumes `env.API_URL` has an `*.integration.test.ts` whose MSW handler intercepts `fetch` against the `${env.API_URL}/...` URL pattern — proves the key flows correctly from `.env` through t3-env through the handler.
- **E2E:** N/A in this phase (no Route Handler yet).
- **Regression guards:** none (greenfield).

---

<!-- phase-a-complete -->

## Dependency Map

SI-1 (root) — Install deps and create env loader
└── SI-2 — depends on SI-1 (env layer in `lib/env.ts` exists before CLAUDE.md references it as source-of-truth)

---

## Deliverables

- [ ] SI-1 — Install deps and create env loader
- [ ] SI-2 — Update `next-frontend/CLAUDE.md` for strict BFF

**Full test suites:**

- [ ] Type/compilation check passes (`cd next-frontend && docker compose exec next-frontend npx tsc --noEmit`)
- [ ] Lint passes (`cd next-frontend && docker compose exec next-frontend npm run lint`)

_(Vitest / Playwright commands intentionally omitted — `next-frontend/CLAUDE.md` § "Status — bootstrap pending" documents that the test infra is not yet wired. Whether to wire it in this task or defer to a separate bootstrap task is a future scoping decision; this task introduces no testable artifacts that require Vitest, so the omission is non-load-bearing.)_
