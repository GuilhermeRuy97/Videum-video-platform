---
kind: phase
name: phase-03-upload-processing
sources_mtime:
  docs/project-plan.md: "2026-06-28T19:38:56.891944000-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processing.md: "2026-07-08T18:04:18.204062600-03:00"
  docs/decisions/technical-decisions-upload-completion-signal.md: "2026-07-08T17:30:52.053757500-03:00"
  docs/phases/phase-01-base-configuration/context.md: "2026-06-28T17:41:07.237843800-03:00"
  docs/phases/phase-02-auth/context.md: "2026-06-28T17:41:07.244835500-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-06-28T17:41:07.240836500-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-06-28T17:41:07.229837100-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-06-28T17:41:07.227836700-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-06-28T17:41:07.227836700-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-06-28T17:41:07.228891500-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-06-28T17:41:07.117300600-03:00"
---

# phase-03-upload-processing — Context

## Scope

**Phase name:** Upload and Video Processing

**Capabilities** (literal, `docs/project-plan.md`):

- File storage service (videos and thumbnails)
- Background processing service (queues)
- Video upload supporting files up to 10GB without performance impact
- Automatic pre-registration of the video as a draft when upload starts
- Automatic video processing after upload (duration and metadata extraction)
- Automatic thumbnail generation from a video frame
- Unique URL per video, without conflict with other videos
- Streaming playback (no full download required)
- Video download by the user

**Out of scope:** _Not specified in project-plan.md._

**Deliverables:** functional upload up to 10GB, automatic video processing, working streaming, unique URLs generated.

**Affected subprojects:** `nestjs-project` — backend concerns (object storage, queue-based processing, FFmpeg, upload/streaming/download endpoints). The phase does not name subproject paths explicitly.

**Deferred subprojects:** _None._

**Sequencing notes:** Depends on: Phase 01, Phase 02.

**Neighbors (for boundary detection only):**

- **Phase 02:** Signup, Login and Account Management (Depends on: Phase 01).
- **Phase 04:** Video and Channel Management (Depends on: Phase 02, Phase 03).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-upload-processing/TD-01 | phase | Backend | Object Storage Backend | decided | A (MinIO, self-hosted S3-compatible) | — |
| phase-03-upload-processing/TD-02 | phase | Backend | Video Processing Worker Deployment Topology | decided | B (separate worker container, shared codebase, 2nd entrypoint) | — |
| phase-03-upload-processing/TD-03 | phase | Backend | Video/Thumbnail Processing Library (FFmpeg Invocation) | decided | A (raw `child_process` spawn of FFmpeg/FFprobe) | — |
| phase-03-upload-processing/TD-04 | phase | Backend | Unique Video URL / Public Identifier Strategy | decided | C (separate `public_id` column, UUID v7) | — |
| phase-03-upload-processing/TD-05 | phase | Cross-layer | Large File Upload Protocol | decided | B (presigned direct-to-storage multipart) | — |
| phase-03-upload-processing/TD-06 | phase | Cross-layer | Video Delivery Mechanism (Streaming & Download) | decided | A (presigned GET URLs, Range-native) | — |
| upload-completion-signal/TD-01 | ad-hoc | Cross-layer | Upload-Completion Detection & Processing Trigger | decided | A (client complete + server verification + reconciliation safety-net) | — |

_Source files:_

- phase-03-upload-processing — `docs/decisions/technical-decisions-phase-03-upload-processing.md` (scope_type: phase, related_phases: [3])
- upload-completion-signal — `docs/decisions/technical-decisions-upload-completion-signal.md` (scope_type: ad-hoc, related_phases: [3])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| File storage service (videos and thumbnails) | phase-03-upload-processing/TD-01 |
| Background processing service (queues) | phase-03-upload-processing/TD-02 |
| Video upload supporting files up to 10GB without performance impact | phase-03-upload-processing/TD-05 |
| Automatic pre-registration of the video as a draft when upload starts | phase-03-upload-processing/TD-05, upload-completion-signal/TD-01 |
| Automatic video processing after upload (duration and metadata extraction) | phase-03-upload-processing/TD-02, phase-03-upload-processing/TD-03, upload-completion-signal/TD-01 |
| Automatic thumbnail generation from a video frame | phase-03-upload-processing/TD-02, phase-03-upload-processing/TD-03 |
| Unique URL per video, without conflict with other videos | phase-03-upload-processing/TD-04 |
| Streaming playback (no full download required) | phase-03-upload-processing/TD-06 |
| Video download by the user | phase-03-upload-processing/TD-06 |

## Decisions Detail

### phase-03-upload-processing/TD-01

**Recommendation:** it is the only option consistent with the project's established convention of running every infra dependency inside Docker Compose (mirroring `db` and `mailpit`), requires no cloud credentials for any contributor, and is S3-API-compatible so a later move to AWS S3 in production is a configuration change, not a rewrite, of the already-planned `StorageService` abstraction.
**Libraries:** —

### phase-03-upload-processing/TD-02

**Recommendation:** it is the only option that honors the architecture diagram's explicit process separation (independent scaling and failure isolation between API and video processing) without paying Option C's cost of maintaining two independent codebases. The "two processes locally" overhead of Option B is a one-line addition to `compose.yaml` and a second `main.ts`-style file, not a structural rewrite.
**Libraries:** —

### phase-03-upload-processing/TD-03

**Recommendation:** `fluent-ffmpeg` (Option B) is disqualified by its archived status: adopting an abandoned dependency contradicts the project's Definition of Done culture of not leaving known debt in place. Option C's WASM path is a poor fit for the stated 10GB file-size requirement. Option A requires the least code beyond what any option needs anyway (FFmpeg installed in the worker image) and has zero dependency-risk surface.
**Libraries:** —

### phase-03-upload-processing/TD-04

**Recommendation:** decoupling the public identifier from the internal PK keeps the PK strategy free to change without breaking public URLs and avoids exposing the internal key, while UUID v7's time-ordering gives chronological sortability (e.g. "recently uploaded") for free without a separate sort key — a concrete edge over both Option A (which forecloses PK changes and leaks the internal key) and Option B's random `nanoid` (which has no ordering). It follows the project's own `Channel.nickname` precedent of a dedicated public-facing field, and the draft-before-metadata sequencing rules out title-derived slugs regardless. The costs are modest and bounded: one extra column plus a uniqueness constraint, and a second UUID *version* (v7) alongside the v4 used for entity PKs — documented so future readers understand why the codebase carries both. Option A remains the zero-extra-code fallback if the team decides public/internal decoupling and chronological sortability are not worth one column; Option B is the pick if short URLs later become a requirement (UUID v7 is 36 chars).
**Libraries:** —

### phase-03-upload-processing/TD-05

**Recommendation:** for a stated requirement of "up to 10GB without performance impact," keeping the API out of the byte path entirely is the most direct way to guarantee that outcome, and it is the pattern AWS's own documentation recommends for exactly this use case. The extra client-side complexity is real but is paid once, by whichever phase builds the upload widget, not repeatedly by the API. Option A remains a reasonable fallback if the team prefers every request to visibly pass through the API (simpler mental model, at the cost of long-lived API connections during upload). Option C's resumability is valuable but introduces a protocol inconsistent with the project's established typed-REST contract convention; worth reconsidering later specifically for resumability if dropped connections prove to be a real problem in practice.
**Libraries:** —

### phase-03-upload-processing/TD-06

**Recommendation:** it is the option most aligned with the architecture diagram's own sketch, requires no custom byte-serving code (S3/MinIO already implement `Range` correctly), keeps the API out of the sustained-throughput path for the same reason TD-05 kept it out of the upload path, and the same mechanism naturally covers both "streaming" and "download" with one primitive. Option C (HLS) is explicitly scoped out as extrapolation beyond what Phase 03's capabilities state — worth raising as a separate future ad-hoc research if adaptive bitrate becomes a real requirement.
**Libraries:** —

### upload-completion-signal/TD-01

**Recommendation:** it builds directly on TD-05's already-decided client-complete handshake, keeps the completion path inside the project's typed-REST/OpenAPI contract convention, and delivers immediate (no-poll-latency) processing on upload finish while server-side `CompleteMultipartUpload`/`HeadObject` verification guards against a client that lies about completion. Its one real weakness — a client that uploads then crashes before calling complete — is covered by a small repeatable reconciliation sweep that the phase needs anyway for abandoned-upload cleanup, which is why Option C is an implementation refinement of A rather than the primary trigger. Option B is the most robust against client disconnects but pays for it by breaking TD-01's MinIO↔S3 config-only portability (notification config diverges sharply between backends) and by adding a secured storage→backend inbound surface; reconsider B only if, in production on real S3, client-callback reliability proves insufficient despite the reconciliation net. This TD depends on TD-05 (upload protocol), TD-02 (worker/queue topology), and TD-01 (storage backend).
**Libraries:** —

## Inherited Decisions Detail

_(inherited TDs from prior phases via phases-reader + correlator-confirmed ad-hoc docs; dedupe applied against current-scope refs)_

### phase-01-base-configuration/TD-01

**Recommendation:** Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.
**Libraries:** `@nestjs/config@^4.x`

### phase-01-base-configuration/TD-02

**Recommendation:** First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.
**Libraries:** `joi@^17.x`

### phase-01-base-configuration/TD-03

**Recommendation:** The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.
**Libraries:** —

### phase-01-base-configuration/TD-04

**Recommendation:** Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.
**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.
**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.
**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.
**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.
**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.
**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.
**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.

**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.
**Libraries:** —

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

### openapi-docs-nestjs/TD-01

**Recommendation:** it is the only option that preserves the previous decisions (`class-validator` in phase-02-auth/TD-06) without a re-platform; the CLI plugin with `classValidatorShim: true` leverages existing `class-validator` decorators to infer schemas, keeping boilerplate low. Nestia has real technical merit but the cost of migrating the validation stack makes it unfeasible without an upstream decision to supersede TD-06. Manual authoring is discarded.
**Libraries:** @nestjs/swagger

**Revisions:**
- 2026-05-12 — Clarifies that the CLI plugin (`classValidatorShim: true`) only covers schema inference for DTOs from `class-validator`; documentation of operations, status-code-typed responses, error contracts (aligned with the envelope from phase-02-auth/TD-07) and examples require explicit decorators (`@ApiOperation`, `@ApiResponse`, `@ApiBody`, `@ApiParam`, `@ApiQuery`, `@ApiExtraModels`). _Rationale:_ the openapi.json generated by the current bootstrap is generic — no parameter details, no return schemas per status, no error contracts — because the installed base relied only on automatic introspection. This revision fixes that enrichment via explicit decorators is part of the chosen Option A, not work outside the TD's scope.

### openapi-docs-nestjs/TD-02

**Recommendation:** the marginal cost over Option A is just one npm script (~15 lines) and the benefit is a correct foundation for future FE integration (offline codegen) without losing the interactive UI that dev/QA use. Option B alone punishes the development experience in dev/local; Option A alone compromises the future codegen pipeline. Combining them is dominant.
**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** aligns with the defensive posture already established in Phase 02 and does not compromise legitimate consumers (the `openapi.json` committed in TD-02 fulfills the role of "spec consultable outside the UI"). Reopening as Option A or C is trivial in the future if a public API use case appears.
**Libraries:** —

### next-frontend-config-base/TD-01

**Recommendation:** Three converging reasons: (1) **Type-inference matches the FE's strict-TS culture** — `lib/env.ts` exports a typed `env` object with no `as` casts, satisfying the project's "Type Safety" working principle. (2) **Ecosystem gravity in Next.js / React 19** — Zod is the de-facto schema language for App Router (Server Actions inputs, form resolvers, future contract validation), so introducing it once at the env layer compounds value for forms in Phase 02+. (3) **Direct enablement of TD-02 Option A (`@t3-oss/env-nextjs`)** — t3-env's first-citizen validator. Backend parity with Joi is not load-bearing: env schemas are not shared FE↔BE (different runtimes, different key sets); two validators across two subprojects is a bounded cost.
**Libraries:** zod

### next-frontend-config-base/TD-02

**Recommendation:** The only option that combines (i) **type-level NEXT_PUBLIC_ prefix enforcement**, (ii) **runtime Proxy-based leak detection**, and (iii) **single-file, single-import-path consumer ergonomics**. Option B reaches roughly the same _structural_ outcome at higher implementation and maintenance cost, with a weaker guarantee (no prefix enforcement, no proxy). Option C is unsafe at any non-trivial team size. The marginal cost over B is one ~3KB dep — well-spent for the strongest boundary among the three.
**Libraries:** @t3-oss/env-nextjs

### next-frontend-config-base/TD-03

**Recommendation:** Aligned with the BFF testing strategy and architectural commitment already documented in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller; BFF tests stub `fetch` via MSW). Eliminates CORS, eliminates public exposure of the backend URL, and produces the smallest correct foundation. Option B's `NEXT_PUBLIC_API_URL` is a future-proofing concession with no current consumer — and adding a public key later is a non-breaking change, while removing one is breaking. Option C ties a foundational decision to infra work explicitly deferred elsewhere. The Docker networking gap (how server-in-container resolves the backend) is a separate orthogonal decision, surfaced below.
**Libraries:** —

### next-frontend-msw-foundation/TD-01

**Recommendation:** Three reasons. (1) **MSW's own best-practice recommends it** — the project should not invent its own scheme when the official one is documented and matches the codebase's domain orientation. (2) **Domain ownership tracks the codebase**, not the project plan — `components/`, `app/api/`, and any future feature folders will be organized by domain (auth, videos, channels), so handler files mirror that vocabulary and remain stable as phases come and go. (3) **Append-only growth with minimal merge conflicts** — each phase touches a new file plus one line in the barrel, which is the smallest practical concurrent-PR footprint. Option A is acceptable through Phase 02 alone (~5–7 endpoints) but accumulates costs that B avoids from day one; bootstrapping directly into B costs one extra file and one barrel and pays off by Phase 03. Option C's phase coupling is rejected outright — domain-by-phase is a category error.
**Libraries:** —

### next-frontend-msw-foundation/TD-02

**Recommendation:** The browser worker is a future capability with no documented current consumer; wiring it now (Option B) is speculative investment, and wiring it incoherently (Option C) actively misleads developers into thinking interception works when it doesn't under strict BFF. Option A keeps the foundation minimal, aligns 1:1 with everything CLAUDE.md and the existing rules currently document, and is non-breaking to extend.
**Libraries:** —

### next-frontend-msw-foundation/TD-03

**Recommendation:** Reasons: (1) **Option B's determinism + readability is the right baseline** — every fixture in Phase 02 (5–7 endpoints, single-record-mostly) is naturally hand-written, and the diff-revealing override pattern is the highest-value benefit. (2) **Bulk-collection cases will arrive (Phase 07 home page grid, Phase 06 comment threads) and inline hand-written lists of 20+ items are genuinely tedious** — keeping faker available as a scoped tool is pragmatic. (3) **Per-fixture local seeding eliminates the global-cursor pitfall** that makes Option C structurally fragile — using `faker.seed(N)` immediately before a collection-builder run scopes the determinism to that fixture and isolates it from upstream changes to other factories.
**Libraries:** —

### next-frontend-msw-foundation/TD-04

**Recommendation:** The user's "import only what it needs" requirement is satisfied at the *authoring* layer by TD-01 (per-domain files; each phase adds one file). At the *runtime* layer, loading all handlers is the canonical MSW v2 model and imposes no cost on tests that don't fetch the extra URLs. `onUnhandledRequest: "error"` enforces that a phase's test cannot accidentally invoke a route outside its scope (the fetch fails loudly with "no handler matched"), which is the strongest version of "stays inside its phase" available. Option B's per-suite composition pays real boilerplate cost for an explicitness gain that TD-01 already provides at a different layer. Option C invents a Vitest-projects-shaped problem for a phase-shaped concern.
**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** Three reinforcing reasons. (1) **Strict BFF makes the SDK surface valueless on the client.** Only Route Handlers ever call the upstream Nest; they already use `fetch` (Next 16's caching extensions sit on top of native `fetch`); a generated SDK adds a third client style to learn for zero functional gain. (2) **Types-first matches the rest of the FE foundation.** Env validation is Zod-derived types; component variants are `cva` types; both are TS-first with zero generated runtime. `paths` is the natural extension — one `.d.ts` file imported wherever the contract is touched. (3) **MSW typing is solved by the same `paths` symbol.** Hand-written handlers in `mocks/handlers.ts` type their resolver returns off `paths["/videos"]["get"]["responses"][200]`, giving the contract guarantee without orval/kubb's verbose generated handlers (which would be overridden per-test anyway). The marginal cost of adding `openapi-fetch` (~6KB, server-side only) is small enough that we recommend the **types + thin-client** pair, not types alone — `openapi-fetch` removes the `fetch(API_URL + path, { method, headers, body })` boilerplate in each Route Handler while staying within the BFF model. Options B/C/D may be revisited if (a) client-side data-fetching enters the stack with TanStack Query and per-endpoint hooks are wanted, or (b) the API grows beyond ~20 operations and per-call boilerplate becomes painful.
**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** Three reasons. (1) **Preserves the compose-stack independence** that `next-frontend-config-base/TD-03` Context calls out as the current architecture — neither subproject's compose file references the other. (2) **Drift is eliminated structurally when paired with TD-03's CI freshness check** — the check runs the sync script and asserts no diff on either `openapi.json` or `types.gen.ts`, so a backend PR that forgets to re-sync fails CI with a clear message. (3) **The committed local file is a real artifact in PR review** — reviewers see the contract change in `next-frontend/openapi.json`'s diff at the same time as the backend change, doubling the visibility (an `openapi.json`-only diff in a feature PR is a red flag for accidental drift). Option A is acceptable as a pre-CI fallback; Option C is rejected because the cross-stack file dependency in `docker-compose.yaml` introduces coupling that the current architecture explicitly avoids, and the "no drift" gain over B is small once TD-03 lands.
**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** It is the only option that makes contract drift _both_ visible (in PR diffs) _and_ impossible to merge accidentally (CI fail). The complexity premium over Option A is one CI step. Option B's "no committed artifacts" purity is poorly paid for in a monorepo where the cross-subproject build coupling becomes a real ergonomic cost, and it wastes the PR visibility that TD-02 Option B's committed `openapi.json` is specifically designed to deliver. Option A is acceptable as a temporary state until the CI pipeline lands; downgrading from C to A is reversible (just remove the CI step) but upgrading to C later requires explaining `types.gen.ts` history in a separate commit. Start at C. Apply the same script-and-check pattern to any future generated artifact (e.g., if `openapi-fetch` is wrapped, the wrapper file is hand-written; the only generated artifact remains `types.gen.ts`).
**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** It is the only option that (i) handles pass-through and reshape with the same mechanism, (ii) gives a single grep target for "what shape does the BFF expose", and (iii) decouples Component imports from App Router file paths (Components import `from "@/lib/api/contracts"`, not `from "@/app/api/videos/route"`). Option B is theoretically minimal but fragile against Next's actual RSC/Client/Route-Handler typing; Option C scatters the contract surface and creates drift opportunities. The "long file" concern is bounded — for the scope of StreamTube, the BFF will likely have <30 contract aliases at peak; sectioning by feature header comments is sufficient. Make `lib/api/contracts.ts` the only file that imports `paths` from `types.gen.ts` (lintable later); every other consumer imports from `contracts.ts`.
**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** Reasons: (1) **Determinism over auto-generation** — BFF integration tests assert on specific values; randomized fixtures are anti-helpful. (2) **Coherence with TD-01 recommendation** — `openapi-typescript`'s `paths` type is the single contract anchor; reusing it in MSW handlers means "spec ↔ handler ↔ assertion" is one type chain. (3) **Scale fit** — Phase 02 introduces few endpoints; the manual cost is negligible at this stage. If the API grows to dozens of endpoints and authoring overhead becomes real, this TD can be superseded with a Kubb-or-hey-api MSW plugin without touching TD-01's `paths` import sites (the generator just produces additional handler files; the existing manual handlers stay valid). Option B locks the project into a heavier TD-01 choice for marginal mock-authoring savings; Option C is Option A with an unnecessary detour.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, ... })`. _(from phase 01)_
- Config injected via `ConfigType<typeof xxxConfig>` + `@Inject(xxxConfig.KEY)`; same factory importable as a plain function for non-DI (TypeORM CLI). _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- DB connection params sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `data-source.ts`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` (not `forRoot`) with `imports:[ConfigModule]`, `inject:[databaseConfig.KEY]`, `autoLoadEntities:true`, `synchronize:false`. _(from phase 01)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Frontend screens | deferred | phase-01-base-configuration | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Signup, login, account confirmation and password recovery screens | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Account confirmation via email with activation link" | deferred | phase-02-auth-frontend | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. |
| "Logout" | deferred | phase-02-auth-frontend | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. |
| "Password recovery (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the email; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. |
| "Signup, login, account confirmation and password recovery screens" | deferred | phase-02-auth-frontend | the account confirmation screen will not be implemented in this current phase — the umbrella bullet's full coverage requires the confirmation and reset-password destination screens; both deferred per rows above. The 3 ship-this-phase screens (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase that lands the missing screens. |

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

_Artifact-type → required-layers, from `testing-guide-nestjs-project` (§3 Feature Implementation Checklist)._

| Artifact created | Required tests |
|---|---|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |

_Note: "E2E" here means HTTP-layer integration tests via supertest (routing → guards → pipes → controller → service → response), not browser-based E2E._

_`next-frontend` is not an affected subproject for this phase (no screens; TD-05/TD-06 and upload-completion-signal/TD-01 fix only the cross-layer wire contract consumed by a future UI phase), so its testing requirements are deferred to the phase that builds the upload widget / player._
