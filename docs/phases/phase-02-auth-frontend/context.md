---
kind: phase
name: phase-02-auth-frontend
sources_mtime:
  docs/project-plan.md: "2026-05-12T13:48:56-03:00"
  docs/decisions/technical-decisions-phase-02-auth-frontend.md: "2026-05-14T11:03:30-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-05-13T15:23:15-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-05-14T09:31:19-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-05-13T19:51:13-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-05-12T16:17:52-03:00"
  docs/phases/phase-01-base-configuration/context.md: "2026-05-12T14:01:06-03:00"
  .claude/skills/testing-guide-next-frontend/SKILL.md: "2026-05-13T10:59:26-03:00"
  docs/inventories/screen-inventory-phase-02-auth-frontend.md: "2026-05-14T10:00:23-03:00"
---

# phase-02-auth-frontend — Context

## Scope

**Phase name:** Signup, Login and Account Management

**Capabilities** (literal, `docs/project-plan.md`):

- Transactional email sending service
- User signup with email and password
- Automatic user channel creation from the email prefix
- Account confirmation via email with activation link
- User login and session control
- Logout
- Password recovery: request via email → token link → reset
- Signup, login, account confirmation and password recovery screens

**Out of scope:** _Not specified._

**Deliverables:** complete signup → confirmation → login → password recovery flow working. Channel created automatically for each user.

**Affected subprojects:**

- `nestjs-project` — no specific note (in scope: signup/login/session, transactional emails, automatic channel creation, confirmation and recovery tokens)
- `nextjs-project` — no specific note (in scope: signup, login, account confirmation and password recovery screens)

**Deferred subprojects:** _None._

**Sequencing notes:** Depends on: Phase 01.

**Neighbors (for boundary detection only):**

- **Phase 01:** Setup of the entire project foundation: repository, development environment, Next.js and Nest.js projects, PostgreSQL database and auxiliary services.
- **Phase 03:** Video Upload and Processing — Depends on: Phase 01, Phase 02.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-02-auth-frontend/TD-01 | phase | Frontend | Authentication Orchestration Approach | decided | A (Custom BFF cookie-based session) | — |
| phase-02-auth-frontend/TD-02 | phase | Frontend | Session Cookie Strategy | decided | B (iron-session encrypted container) | iron-session |
| phase-02-auth-frontend/TD-03 | phase | Frontend | Token Refresh Orchestration | decided | A (Transparent BFF refresh on 401 w/ single-flight) | — |
| phase-02-auth-frontend/TD-04 | phase | Frontend | Form Library and Client-Side Validation | decided | A (react-hook-form + zod resolver) | react-hook-form, @hookform/resolvers |
| phase-02-auth-frontend/TD-05 | phase | Frontend | Mutation Submission Pathway | decided | A (Route Handler POST + client fetch) | — |
| phase-02-auth-frontend/TD-06 | phase | Frontend | Session State Propagation to Client Components | decided | A (Server-rendered session + RSC Context Provider) | — |
| phase-02-auth-frontend/TD-07 | phase | Frontend | Email-Link Landing Pattern | decided | A (RSC processes token; Client form for reset input) | — |

_Source files:_

- phase-02-auth-frontend — `docs/decisions/technical-decisions-phase-02-auth-frontend.md` (scope_type: phase, related_phases: [2])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Transactional email sending service | — _(no TD yet — plan-validate will flag as MD)_ |
| User signup with email and password | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-05 |
| Automatic user channel creation from the email prefix | — _(no TD yet — plan-validate will flag as MD)_ |
| Account confirmation via email with activation link | phase-02-auth-frontend/TD-07 |
| User login and session control | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-02, phase-02-auth-frontend/TD-03, phase-02-auth-frontend/TD-05, phase-02-auth-frontend/TD-06 |
| Logout | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-05 |
| Password recovery: request via email → token link → reset | phase-02-auth-frontend/TD-05, phase-02-auth-frontend/TD-07 |
| Signup, login, account confirmation and password recovery screens | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-04 |

## Decisions Detail

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority — Auth.js's value (DB adapters, OAuth providers, magic-link, `getServerSession` helpers) is mostly unused in this configuration. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern; a misconfigured Auth.js callback is a longer fault-isolation loop. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive both runtimes already use; Auth.js v5 versions track Next.js majors with a lag, adding compatibility risk that Option A does not have. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive (loses RSC personalization).
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection; the marginal cost is one ~3KB dep. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call) and avoids the orphan-cookie failure mode of Option A. (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome (avatar, channel name) without a per-render `/auth/me` round-trip — Phase 04+ gains compound here. Option A is a viable downgrade if the team rejects `iron-session` for any reason; the migration A→B (or B→A) is a one-Route-Handler refactor with no test changes downstream because the BFF interface is unchanged. Option C is rejected: it solves a problem (server-side revocation) the project does not have at the cost of infrastructure the project does not own.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh) — adopting B means doing both. Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving and force a `"use client"` shell near the root.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions; the form code does not change if TD-05 is revisited later. (2) **Aligned with shadcn's canonical form primitive** — the project already commits to `radix-nova` shadcn (`components.json`); `npx shadcn@latest add form` produces react-hook-form wrappers; choosing react-hook-form means using the supported primitive instead of hand-rolling around it. (3) **Zod-first developer ergonomics match the rest of the FE foundation** — `next-frontend-config-base/TD-01` chose Zod 4 for env; the same schemas-as-source-of-truth pattern carries to forms with zero new validator paradigm. Option B is rejected for impedance with shadcn's primitive and for over-investing in progressive-enhancement that the strict-BFF model does not require. Option C is rejected for the per-field boilerplate and the loss of client-side feedback on a project that values quick, type-safe form iteration.
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** `next-frontend-config-base/TD-03` named Route Handlers as the BFF surface; Option A keeps every mutation visible under `app/api/**`. (2) **Test scaffold already exists** — `next-frontend/CLAUDE.md` § Testing and `next-frontend-msw-foundation` were authored for Route-Handlers-as-functions; Option A reuses them with zero invention. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking when the cost of inconsistency compounds (Option C). Option B has real ergonomic appeal for the simplest forms but fragments the BFF surface and forces test-pattern reinvention; if the team later wants progressive enhancement for specific forms, the migration A→B is per-form and doesn't require touching unrelated routes — A is the safer default and the cheaper baseline.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state; users never see "Login" briefly turn into their avatar. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it; the BFF surface stays minimal. The `router.refresh()` requirement after mid-session mutations is a small price (one line in the relevant mutation handler) for the structural benefits. Option B is rejected for the double-read-and-flicker; Option C is dominated by Option B and rejected.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct** — the user sees the right outcome on the first paint, no skeleton, no flicker. (2) **Single integration pattern across both flows** — confirmation is RSC-only; reset is RSC + Client form (TD-04, TD-05 patterns reused) — both share the "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level (a small note for `/plan-build` to confirm; not a separate TD). Option B's Route-Handler-as-link-target adds redirects for no clean gain. Option C is dominated.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-base-configuration/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.

**Libraries:** `@nestjs/config@^4.x`

### phase-01-base-configuration/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.

**Libraries:** `joi@^17.x`

### phase-01-base-configuration/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.

**Libraries:** —

### phase-01-base-configuration/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.

**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### next-frontend-config-base/TD-01

**Recommendation:** **Option A (Zod 4)**. Three converging reasons: (1) **Type-inference matches the FE's strict-TS culture** — `lib/env.ts` exports a typed `env` object with no `as` casts, satisfying the project's "Type Safety" working principle. (2) **Ecosystem gravity in Next.js / React 19** — Zod is the de-facto schema language for App Router (Server Actions inputs, form resolvers, future contract validation), so introducing it once at the env layer compounds value for forms in Phase 02+. (3) **Direct enablement of TD-02 Option A (`@t3-oss/env-nextjs`)** — t3-env's first-citizen validator. Backend parity with Joi is not load-bearing: env schemas are not shared FE↔BE (different runtimes, different key sets); two validators across two subprojects is a bounded cost.

**Libraries:** zod

### next-frontend-config-base/TD-02

**Recommendation:** **Option A (`@t3-oss/env-nextjs`)**. The only option that combines (i) **type-level NEXT_PUBLIC_ prefix enforcement**, (ii) **runtime Proxy-based leak detection**, and (iii) **single-file, single-import-path consumer ergonomics**. Option B reaches roughly the same _structural_ outcome at higher implementation and maintenance cost, with a weaker guarantee (no prefix enforcement, no proxy). Option C is unsafe at any non-trivial team size. The marginal cost over B is one ~3KB dep — well-spent for the strongest boundary among the three.

**Libraries:** @t3-oss/env-nextjs

### next-frontend-config-base/TD-03

**Recommendation:** **Option A (Strict BFF — single server-only `API_URL`)**. Aligned with the BFF testing strategy and architectural commitment already documented in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller; BFF tests stub `fetch` via MSW). Eliminates CORS, eliminates public exposure of the backend URL, and produces the smallest correct foundation. Option B's `NEXT_PUBLIC_API_URL` is a future-proofing concession with no current consumer — and adding a public key later is a non-breaking change, while removing one is breaking. Option C ties a foundational decision to infra work explicitly deferred elsewhere. The Docker networking gap (how server-in-container resolves the backend) is a separate orthogonal decision, surfaced below.

**Libraries:** —

### next-frontend-msw-foundation/TD-01

**Recommendation:** **Option B (per-domain modules + barrel)**. Three reasons. (1) **MSW's own best-practice recommends it** — the project should not invent its own scheme when the official one is documented and matches the codebase's domain orientation. (2) **Domain ownership tracks the codebase**, not the project plan — `components/`, `app/api/`, and any future feature folders will be organized by domain (auth, videos, channels), so handler files mirror that vocabulary and remain stable as phases come and go. (3) **Append-only growth with minimal merge conflicts** — each phase touches a new file plus one line in the barrel, which is the smallest practical concurrent-PR footprint. Option A is acceptable through Phase 02 alone (~5–7 endpoints) but accumulates costs that B avoids from day one; bootstrapping directly into B costs one extra file and one barrel and pays off by Phase 03. Option C's phase coupling is rejected outright — domain-by-phase is a category error.

**Libraries:** —

### next-frontend-msw-foundation/TD-02

**Recommendation:** **Option A (test-only, `setupServer` only at the foundation)**. The browser worker is a future capability with no documented current consumer; wiring it now (Option B) is speculative investment, and wiring it incoherently (Option C) actively misleads developers into thinking interception works when it doesn't under strict BFF. Option A keeps the foundation minimal, aligns 1:1 with everything CLAUDE.md and the existing rules currently document, and is non-breaking to extend.

**Libraries:** —

### next-frontend-msw-foundation/TD-03

**Recommendation:** **Option D (hand-written defaults as the default + opt-in seeded faker for bulk collections)**. Reasons: (1) **Option B's determinism + readability is the right baseline** — every fixture in Phase 02 (5–7 endpoints, single-record-mostly) is naturally hand-written, and the diff-revealing override pattern is the highest-value benefit. (2) **Bulk-collection cases will arrive (Phase 07 home page grid, Phase 06 comment threads) and inline hand-written lists of 20+ items are genuinely tedious** — keeping faker available as a scoped tool is pragmatic. (3) **Per-fixture local seeding eliminates the global-cursor pitfall** that makes Option C structurally fragile — using `faker.seed(N)` immediately before a collection-builder run scopes the determinism to that fixture and isolates it from upstream changes to other factories.

**Libraries:** —

### next-frontend-msw-foundation/TD-04

**Recommendation:** **Option A (universal handler set + `server.use(...)` overrides + `onUnhandledRequest: "error"`)**. The user's "import only what it needs" requirement is satisfied at the *authoring* layer by TD-01 (per-domain files; each phase adds one file). At the *runtime* layer, loading all handlers is the canonical MSW v2 model and imposes no cost on tests that don't fetch the extra URLs. `onUnhandledRequest: "error"` enforces that a phase's test cannot accidentally invoke a route outside its scope (the fetch fails loudly with "no handler matched"), which is the strongest version of "stays inside its phase" available. Option B's per-suite composition pays real boilerplate cost for an explicitness gain that TD-01 already provides at a different layer. Option C invents a Vitest-projects-shaped problem for a phase-shaped concern.

**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** **Option A (`openapi-typescript` + `openapi-fetch`)**. Three reinforcing reasons. (1) **Strict BFF makes the SDK surface valueless on the client.** Only Route Handlers ever call the upstream Nest; they already use `fetch` (Next 16's caching extensions sit on top of native `fetch`); a generated SDK adds a third client style to learn for zero functional gain. (2) **Types-first matches the rest of the FE foundation.** Env validation is Zod-derived types; component variants are `cva` types; both are TS-first with zero generated runtime. `paths` is the natural extension — one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** Hand-written handlers in `mocks/handlers.ts` type their resolver returns off `paths["/videos"]["get"]["responses"][200]`, giving the contract guarantee without orval/kubb's verbose generated handlers (which would be overridden per-test anyway). The marginal cost of adding `openapi-fetch` (~6KB, server-side only) is small enough that we recommend the **types + thin-client** pair, not types alone — `openapi-fetch` removes the `fetch(API_URL + path, { method, headers, body })` boilerplate in each Route Handler while staying within the BFF model. Options B/C/D may be revisited if (a) client-side data-fetching enters the stack with TanStack Query and per-endpoint hooks are wanted, or (b) the API grows beyond ~20 operations and per-call boilerplate becomes painful.

**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** **Option B (committed local copy + repo-root sync script)**. Three reasons. (1) **Preserves the compose-stack independence** that `next-frontend-config-base/TD-03` Context calls out as the current architecture — neither subproject's compose file references the other. (2) **Drift is eliminated structurally when paired with TD-03's CI freshness check** — the check runs the sync script and asserts no diff on either `openapi.json` or `types.gen.ts`, so a backend PR that forgets to re-sync fails CI with a clear message. (3) **The committed local file is a real artifact in PR review** — reviewers see the contract change in `next-frontend/openapi.json`'s diff at the same time as the backend change, doubling the visibility (an `openapi.json`-only diff in a feature PR is a red flag for accidental drift). Option A is acceptable as a pre-CI fallback; Option C is rejected because the cross-stack file dependency in `docker-compose.yaml` introduces coupling that the current architecture explicitly avoids, and the "no drift" gain over B is small once TD-03 lands.

**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** **Option C (committed + CI freshness check)**. It is the only option that makes contract drift _both_ visible (in PR diffs) _and_ impossible to merge accidentally (CI fail). The complexity premium over Option A is one CI step. Option B's "no committed artifacts" purity is poorly paid for in a monorepo where the cross-subproject build coupling becomes a real ergonomic cost, and it wastes the PR visibility that TD-02 Option B's committed `openapi.json` is specifically designed to deliver. Option A is acceptable as a temporary state until the CI pipeline lands; downgrading from C to A is reversible (just remove the CI step) but upgrading to C later requires explaining `types.gen.ts` history in a separate commit. Start at C. Apply the same script-and-check pattern to any future generated artifact (e.g., if `openapi-fetch` is wrapped, the wrapper file is hand-written; the only generated artifact remains `types.gen.ts`).

**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** **Option A (single `lib/api/contracts.ts` with explicit aliases)**. It is the only option that (i) handles pass-through and reshape with the same mechanism, (ii) gives a single grep target for "what shape does the BFF expose", and (iii) decouples Component imports from App Router file paths (Components import `from "@/lib/api/contracts"`, not `from "@/app/api/videos/route"`). Option B is theoretically minimal but fragile against Next's actual RSC/Client/Route-Handler typing; Option C scatters the contract surface and creates drift opportunities. The "long file" concern is bounded — for the scope of StreamTube, the BFF will likely have <30 contract aliases at peak; sectioning by feature header comments is sufficient. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts` (lintable later); every other consumer imports from `contracts.ts`.

**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** **Option A (hand-written, typed via `paths`)**. Reasons: (1) **Determinism over auto-generation** — BFF integration tests assert on specific values; randomized fixtures are anti-helpful. (2) **Coherence with TD-01 recommendation** — `openapi-typescript`'s `paths` type is the single contract anchor; reusing it in MSW handlers means "spec ↔ handler ↔ assertion" is one type chain. (3) **Scale fit** — Phase 02 introduces few endpoints; the manual cost is negligible at this stage. If the API grows to dozens of endpoints and authoring overhead becomes real, this TD can be superseded with a Kubb-or-hey-api MSW plugin without touching TD-01's `paths` import sites (the generator just produces additional handler files; the existing manual handlers stay valid). Option B locks the project into a heavier TD-01 choice for marginal mock-authoring savings; Option C is Option A with an unnecessary detour.

**Libraries:** —

### openapi-docs-nestjs/TD-01

**Recommendation:** **Option A (`@nestjs/swagger`)** — is the only option that preserves the previous decisions (`class-validator` in TD-06 of phase-02-auth) without re-platform; the CLI plugin with `classValidatorShim: true` leverages the existing `class-validator` decorators to infer schemas, keeping the boilerplate low. Nestia has real technical merit but the cost of migrating the validation stack makes it unfeasible without an upstream supersede decision on TD-06. Manual authoring is discarded.

**Libraries:** @nestjs/swagger

### openapi-docs-nestjs/TD-02

**Recommendation:** **Option C (Both)** — the marginal cost over Option A is just one npm script (~15 lines) and the benefit is a correct foundation for future FE integration (offline codegen) without losing the interactive UI that dev/QA use. Option B alone punishes the development experience in dev/local; Option A alone compromises the future codegen pipeline. Combining is dominant.

**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** **Option B (Dev/staging only)** — aligns with the defensive posture already established in phase 02 and does not compromise legitimate consumers (the `openapi.json` committed in TD-02 serves the role of "spec consultable outside the UI"). Re-opening as Option A or C is trivial in the future if a public API use case appears.

**Libraries:** —

## Inherited Conventions

_No inherited conventions from prior phases._

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Frontend screens | deferred | phase-01-base-configuration | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |

## UI Inventory

**Source:** `docs/inventories/screen-inventory-phase-02-auth-frontend.md`
**Screens in scope:** 3

### UI ↔ Capability Join

| Screen | Route | Verb | Capability | Covering Component |
|--------|-------|------|------------|-------------------|
| Signup screen | /signup | Register new user with email and password | "User signup with email and password" | SignupForm + SubmitButton |
| Login screen | /login | Authenticate user with email and password and start session | "User login and session control" | LoginForm + SubmitButton |
| Password recovery request screen | /forgot-password | Request reset link email | "Password recovery: request via email → token link → reset" | ForgotPasswordForm + SubmitButton |

### Server-connected Components

- `SignupForm` (Signup screen) — `Reuse?: new`
- `SubmitButton` (Signup screen) — `Reuse?: components/ui/button.tsx`
- `LoginForm` (Login screen) — `Reuse?: new`
- `SubmitButton` (Login screen) — `Reuse?: components/ui/button.tsx`
- `ForgotPasswordForm` (Password recovery request screen) — `Reuse?: new`
- `SubmitButton` (Password recovery request screen) — `Reuse?: components/ui/button.tsx`

### Open Questions from Inventory

- Capability "Account confirmation via email with activation link" has no inventoried screen — de-scoped by the user on 2026-05-14 ("the rest will not be implemented now"). The end-to-end signup flow depends on this screen to close (after signup → email with link → confirmation screen); it will need to be resumed in a later phase. TD-07 (Email-Link Landing Pattern) provides for RSC processing the token server-side; it is recommended to generate the screen inventory before implementing.
- Capability "Logout" has no inventoried UI in this phase. The logout "screen" is, in practice, a button inside the authenticated chrome (avatar/menu); its location depends on later phases that introduce the chrome (likely Phase 04 — "Management panel" / authenticated chrome). Confirm with `plan-validate` whether logout staying out of this phase is intentional.
- Reset-password screen (set new password — destination of the link sent by email) does NOT exist in the current Figma. The "Password recovery…" capability is only partially covered; the reset step needs to be designed (new Figma node) and inventoried before implementing the complete flow. Until then, `/forgot-password` sends the email but the link destination is a non-existent route.
- Signup screen: "Terms of Service" and "Privacy Policy" links (node 143:2439) point to routes (`/terms`, `/privacy`) outside the scope of Phase 02. Decide whether: (a) render as inert/placeholder links until the routes exist; (b) open an issue to create minimal static pages; (c) another strategy.
- Signup screen + Login screen: no form-level error/feedback surface (post-submit alert, loading state, inline field errors) is present in Figma. TD-04 + the `{ statusCode, error, message }` envelope (phase-02-auth/TD-07) imply that states need to be displayed. Decide whether: (a) infer the design during implementation following the shadcn `FormMessage` + `Alert` pattern; (b) request error/loading variants from the designer before implementation.
- Forgot-password screen: AuthFooter shows a "Sign up" link in Figma, but the usual UX on a recovery screen would be "Sign in" (return to login). Confirm with the designer which link/text is correct; alternative: implement as "Sign in" based on common UX.
- Forgot-password screen: inline success state (after submit) was not extracted as a separate variant from Figma. The design needs a success-state variant OR the implementation infers the style (confirmation box inside the same Card).
- Planned-but-not-existing components detected (`Reuse?` with suffix ` (new)`) that will serve as a trigger for `phase-b.md` § B2.6 (bootstrap SI synthesis): `components/auth/signup-form.tsx`, `components/auth/login-form.tsx`, `components/auth/forgot-password-form.tsx`, `components/auth/back-link.tsx`, `components/auth/password-visibility-toggle.tsx`, `components/auth/password-strength-meter.tsx`, `components/auth/terms-checkbox.tsx`, `components/ui/checkbox.tsx`, `components/ui/icon-button.tsx`. Confirm with `plan-build` that all will be materialized in this phase OR deferred to later phases per decision.

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|-----------|--------|-----------|---------|
| "Account confirmation via email with activation link" | deferred | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. | phase-02-auth-frontend/TD-07 |
| "Logout" | deferred | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-05 |
| "Password recovery (destination screen / set-new-password)" | deferred | deferred_to_next_phase — `/forgot-password` ships this phase sending the email; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. | phase-02-auth-frontend/TD-07 |
| "Signup, login, account confirmation and password recovery screens" | deferred | the account confirmation screen will not be implemented in this current phase, it will be deferred — the umbrella bullet's full coverage requires the confirmation and reset-password destination screens; both are deferred per Non-UI rows above. The 3 ship-this-phase screens (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase that lands the missing screens. | phase-02-auth-frontend/TD-01, phase-02-auth-frontend/TD-04 |

## Testing Requirements

### next-frontend

| Artifact type | Required layers |
|---------------|-----------------|
| **Page** — sync RSC, no interaction | None at component level; cover only if part of a critical flow → `*.e2e-spec.ts` |
| **Page** — sync RSC composing client children | Test the client children directly; cover the rendered page via `*.e2e-spec.ts` |
| **Page** — async RSC (`async function Page()` with `await fetch`) | `*.e2e-spec.ts` only — Vitest cannot render it |
| **Layout** (`layout.tsx`) | None unless it adds logic (auth gate, conditional rendering); else covered via E2E |
| **Client component** (`"use client"`) with state/handlers | `*.test.ts` — render with RTL, mock `next/navigation` and `fetch` |
| **Feature component** (server, composes primitives, presentational) | Skip unit; cover via the page's E2E |
| **shadcn UI primitive** (`components/ui/*`) | None — trust the library; cover via consumers |
| **Icon** (`components/icons/*`) | None |
| **`lib/` utility** with branching | `*.test.ts` |
| **Custom hook** (`hooks/*`) | `*.test.ts` with `renderHook` from `@testing-library/react` |
| **Route handler** (`app/api/**/route.ts`) with branching | `*.test.ts` (pure logic) and/or `*.integration.test.ts` with MSW |
| **Route handler** (simple proxy to NestJS) | `*.integration.test.ts` with MSW only |
| **Server action** | `*.integration.test.ts` with MSW; E2E for the submit flow |
| **Middleware / error / loading / not-found / metadata** | See guide — depends on type |

### nestjs-project

_Out of slice scope: backend auth is settled in `phase-02-auth/TD-01..TD-10`; no backend change is implied by this slice. Testing requirements are inherited from that phase and do not need to be re-declared here._
