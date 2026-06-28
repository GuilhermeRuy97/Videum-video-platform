---
kind: phase
name: phase-02-auth-frontend
test_specs_aware: true
sources_mtime:
  docs/phases/phase-02-auth-frontend/context.md: "2026-05-14T11:17:59-03:00"
  docs/phases/phase-02-auth-frontend/library-refs.md: "2026-05-14T11:07:24-03:00"
  docs/project-plan.md: "2026-05-12T13:48:56-03:00"
  docs/decisions/technical-decisions-phase-02-auth-frontend.md: "2026-05-14T11:03:30-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-05-13T15:23:15-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-05-14T09:31:19-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-05-13T19:51:13-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-05-12T16:17:52-03:00"
  docs/phases/phase-01-base-configuration/context.md: "2026-05-12T14:01:06-03:00"
  docs/inventories/screen-inventory-phase-02-auth-frontend.md: "2026-05-14T10:00:23-03:00"
---

# Phase 02 — Signup, Login and Account Management (Frontend Slice)

## Objective

Deliver the frontend slice of Phase 02 — signup, login and password recovery request screens (`/signup`, `/login`, `/forgot-password`) with the BFF layer that makes them work (Route Handlers under `app/api/auth/**` that proxy NestJS, iron-session encrypted cookie session, transparent 401 refresh, react-hook-form + Zod forms, session propagation to Client Components via RSC) — so that the signup → login → password recovery request flow works against the auth backend already consolidated in `phase-02-auth`.

---

## Step Implementations

### SI-02.0.1 — Infra: install batch shadcn primitives

**Description:** Install the shadcn primitive `checkbox` via CLI registry and commit the generated file in `components/ui/`.

**Technical actions:**

1. Run `docker compose exec next-frontend npx shadcn@latest add checkbox` — generates `components/ui/checkbox.tsx`.
2. Commit `components/ui/checkbox.tsx`.

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- `components/ui/checkbox.tsx` exists.
- Generated file compiles per `docker compose exec next-frontend npx tsc --noEmit`.

---

### SI-02.0.2 — Tests shadcn batch (checkbox)

**Description:** Unit test for the shadcn `checkbox` primitive installed in SI-02.0.1 — variants, a11y, data-slot, event handlers.

**Technical actions:**

1. Author `components/ui/__tests__/checkbox.test.tsx`.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `checkbox.tsx` | Unit per testing-guide-next-frontend § "UI Primitives" — variants, a11y (`role`, `aria-checked`), `data-slot`, `onCheckedChange` | `components/ui/__tests__/checkbox.test.tsx` |

**Dependencies:** SI-02.0.1

**Acceptance criteria:**

- The test covers checked/unchecked/indeterminate states, ARIA attributes and the `onCheckedChange` handler.
- Suite passes per `docker compose exec next-frontend npm test -- components/ui/__tests__/checkbox.test.tsx`.

---

### SI-02.0.3 — Custom-ui: icon-button.tsx

**Description:** Author `components/ui/icon-button.tsx` per UI Contract — primitive under `components/ui/` not available in the shadcn registry (used as `arrow_back` on the forgot-password screen).

**Technical actions:**

1. Author `components/ui/icon-button.tsx` per UI Contract specs (accessible icon-only button, based on `components/ui/button.tsx` + icon slot from `components/icons/`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `icon-button.tsx` | Unit per testing-guide-next-frontend § "UI Primitives" + custom-logic — variants, a11y (mandatory `aria-label`), data-slot, `onClick` | `components/ui/__tests__/icon-button.test.tsx` |

**Dependencies:** none

**Acceptance criteria:**

- `components/ui/icon-button.tsx` exists and matches the UI Contract (icon-only button with `aria-label`).
- Unit test exercises variants + a11y branch (fails/warns when `aria-label` is absent) + `onClick`.

---

### SI-02.0.4 — Custom-business simple group: back-link + forgot-password-form + login-form + password-strength-meter + signup-form

**Description:** Author the base business components without the complex scoring/state logic flagged in the inventory Notes — presentational/structural skeletons consumed by the screens; the fine logic & wiring is applied in the respective SI-Xb.

**Technical actions:**

1. Author `components/auth/back-link.tsx` per UI Contract (client-side navigation link via Next.js `<Link>`).
2. Author `components/auth/forgot-password-form.tsx` per UI Contract (Email field group + Button; form shell, wiring in SI-02.12b).
3. Author `components/auth/login-form.tsx` per UI Contract (email/password fields + Button; form shell, wiring in SI-02.11b).
4. Author `components/auth/password-strength-meter.tsx` per UI Contract (indicator derived from client-side password input).
5. Author `components/auth/signup-form.tsx` per UI Contract (signup fields + Button; form shell, wiring in SI-02.10b).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `back-link.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + href | `components/auth/__tests__/back-link.test.tsx` |
| `forgot-password-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props | `components/auth/__tests__/forgot-password-form.test.tsx` |
| `login-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props | `components/auth/__tests__/login-form.test.tsx` |
| `password-strength-meter.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + reflection of value | `components/auth/__tests__/password-strength-meter.test.tsx` |
| `signup-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — render + props | `components/auth/__tests__/signup-form.test.tsx` |

**Dependencies:** none

**Acceptance criteria:**

- Each component exists at the declared path and matches its UI Contract.
- Unit tests exercise rendering + props of each component.
- Suite passes per `docker compose exec next-frontend npm test -- components/auth/__tests__`.

---

### SI-02.0.5 — Custom-business complex: password-visibility-toggle

**Description:** Author `components/auth/password-visibility-toggle.tsx` — business component with toggle state per Notes "Client-side `type` password/text toggle".

**Technical actions:**

1. Author `components/auth/password-visibility-toggle.tsx` per UI Contract (button that toggles the input `type` between password/text, controlled client-side).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `password-visibility-toggle.tsx` | Unit per testing-guide-next-frontend § "Client Components" baseline | `components/auth/__tests__/password-visibility-toggle.test.tsx` |
| `password-visibility-toggle.tsx` | Unit: toggle assertions per Notes signal ("Client-side `type` password/text toggle") | (same file) |

**Dependencies:** none

**Acceptance criteria:**

- `components/auth/password-visibility-toggle.tsx` exists and matches the UI Contract.
- Unit tests cover baseline rendering + the state transition (click toggles `type` from `password` to `text` and back, with coherent `aria-pressed`/`aria-label`).

---

### SI-02.0.6 — Custom-business complex: terms-checkbox

**Description:** Author `components/auth/terms-checkbox.tsx` — business component with local state per Notes "Local checkbox state; validated by Zod (TD-04)".

**Technical actions:**

1. Author `components/auth/terms-checkbox.tsx` per UI Contract (terms acceptance checkbox row + inline links; local state, integrable into the signup react-hook-form).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `terms-checkbox.tsx` | Unit per testing-guide-next-frontend § "Client Components" baseline | `components/auth/__tests__/terms-checkbox.test.tsx` |
| `terms-checkbox.tsx` | Unit: local-state assertions per Notes signal ("Local checkbox state") | (same file) |

**Dependencies:** SI-02.0.1

**Acceptance criteria:**

- `components/auth/terms-checkbox.tsx` exists and matches the UI Contract (consumes `components/ui/checkbox.tsx`).
- Unit tests cover baseline rendering + local acceptance state transitions (checked/unchecked) and value exposure for validation.

---

### SI-02.1 — Auth contract aliases in `lib/api/contracts.ts`

**Description:** Define the typed auth contract aliases that the BFF and components consume, derived from `paths` (single grep target for "what the BFF exposes").

**Technical actions:**

1. Create/extend `lib/api/contracts.ts` — the only file that imports `paths` from `lib/api/types.gen.ts`; export explicit aliases for `RegisterDto`, `LoginDto`, `ForgotPasswordDto`, the `POST /auth/register` responses (`{ id, email }`), `POST /auth/login` (`{ access_token, refresh_token }`), and `ApiErrorEnvelope` (`{ statusCode, error, message, code }`) (per `next-frontend-openapi-typing/TD-04`; shapes per `### API Contracts` → BFF tier).
2. Ensure no other consumer imports `paths` directly — all import from `@/lib/api/contracts` (per `next-frontend-openapi-typing/TD-04`).

**Tests:** _(empty — type-only aliases; compile-gated by `npx tsc --noEmit`)_

**Dependencies:** none

**Acceptance criteria:**

- `lib/api/contracts.ts` exports aliases for `RegisterDto`, `LoginDto`, `ForgotPasswordDto`, the register/login responses, and `ApiErrorEnvelope`.
- `docker compose exec next-frontend npx tsc --noEmit` exits with code 0 with the aliases in use.

---

### SI-02.2 — iron-session session module (`lib/auth/session.ts`)

**Description:** Create the encrypted cookie session helper — single container that carries tokens + minimal user fingerprint, the base of the strict-BFF cookie-based model.

**Technical actions:**

1. Install `iron-session` (per `phase-02-auth-frontend/TD-02`; library-refs.md → iron-session section).
2. Create `lib/auth/session.ts` — `getSession()`/`setSession()`/`destroySession()` over `next/headers` `cookies()`, encrypted `httpOnly` cookie carrying `access_token` + `refresh_token` + `userId` + `email` + `channelSlug` (per `phase-02-auth-frontend/TD-02`); session password read from `lib/env.ts` (per `next-frontend-config-base/TD-02`).
3. Expose the helper's BFF interface so login/logout/refresh are a single `setSession`/`destroySession` (per `phase-02-auth-frontend/TD-01` — custom BFF cookie-based session; ~50-LOC, grep-friendly).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `lib/auth/session.ts` | Unit per testing-guide-next-frontend § "`lib/` utility" — set/get/destroy round-trip, no cookie → empty session | `lib/auth/__tests__/session.test.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `setSession` followed by `getSession` returns `userId`, `email`, `channelSlug` and the tokens; `destroySession` zeroes the session.
- `getSession` with no cookie present returns an empty session without throwing.
- The emitted cookie is `httpOnly` and encrypted (content not readable in clear).

---

### SI-02.3 — MSW auth handlers (`mocks/handlers/auth.ts`)

**Description:** Add the MSW auth domain file with handlers typed off `paths`, consumed by the BFF Route Handler integration tests (Vitest) and by the E2E server-side (instrumentation).

**Technical actions:**

1. Create `mocks/handlers/auth.ts` — handlers for upstream `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/refresh`, typed via the aliases from `@/lib/api/contracts` (per `next-frontend-openapi-typing/TD-05` — hand-written, typed via `paths`).
2. Register the module in the handlers barrel (one new file + one line in the barrel) (per `next-frontend-msw-foundation/TD-01` — per-domain modules + barrel).
3. Embed reserved trigger fixtures in the shared handler set: `email: "conflict@example.com"` → 409, `"badrequest@example.com"` → 400, otherwise success (per `next-frontend/CLAUDE.md` § E2E architecture; deterministic hand-written fixtures per `next-frontend-msw-foundation/TD-03`).

**Tests:** _(empty — MSW handler set is test-infra; exercised by the integration tests of SI-02.5..SI-02.8 and by E2E)_

**Dependencies:** SI-02.1

**Acceptance criteria:**

- `mocks/handlers/auth.ts` exports handlers for the 5 upstream auth endpoints and is registered in the barrel.
- The trigger fixtures (`conflict@example.com` → 409, `badrequest@example.com` → 400) produce the expected status; other inputs return success.
- The resolver return types derive from `@/lib/api/contracts` (no hand-duplicated DTO).

---

### SI-02.4 — Single-flight token refresh helper (`lib/auth/refresh.ts`)

**Description:** Implement transparent BFF refresh when the upstream responds 401, with single-flight to deduplicate concurrent calls.

**Technical actions:**

1. Create `lib/auth/refresh.ts` — on upstream 401, call `POST /auth/refresh` with the session's `refresh_token`, re-seal the session with the new pair and re-execute the original call (per `phase-02-auth-frontend/TD-03`).
2. Implement single-flight: two concurrent intercepted upstream calls trigger exactly **one** refresh; both await the same promise (per `phase-02-auth-frontend/TD-03` — designed in the helper from day 1).
3. On refresh failure (401/expired/reused in `POST /auth/refresh`), destroy the session and propagate 401 to the caller (per `phase-02-auth-frontend/TD-03`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `lib/auth/refresh.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler/helper" — refresh on 401, single-flight (two calls → one refresh), refresh failure destroys session | `lib/auth/__tests__/refresh.integration.test.ts` |

**Dependencies:** SI-02.2, SI-02.3

**Acceptance criteria:**

- An upstream call that responds 401 triggers a refresh and the original call is re-executed with the new `access_token`.
- Two concurrent upstream calls that receive 401 result in exactly one call to `POST /auth/refresh`.
- Invalid/expired refresh destroys the session and the helper propagates 401 without re-executing.

---

### SI-02.5 — BFF Route Handler: POST /api/auth/signup

**Route:** POST /api/auth/signup
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### POST /api/auth/signup`

**Description:** Same-origin Route Handler that proxies signup to the upstream NestJS, keeping the strict-BFF model.

**Technical actions:**

1. Create `app/api/auth/signup/route.ts` — `POST` that forwards to `POST /auth/register` via server-side `openapi-fetch` reading `env.API_URL` (per `phase-02-auth-frontend/TD-05` — Route Handler POST + client fetch; per `next-frontend-openapi-typing/TD-01`).
2. Type request/response via the aliases from `@/lib/api/contracts` (`RegisterDto` → `{ id, email }`); 201 pass-through, **no** session cookie (per `### API Contracts` → BFF tier `#### POST /api/auth/signup`; per `phase-02-auth-frontend/TD-01`).
3. Pass through upstream errors verbatim in the `ApiErrorEnvelope` envelope: 409 (email already registered) and 400 (validation) pass-through (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/auth/signup/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler (simple proxy)" — 201 pass-through; 409/400 pass-through; no cookie set | `app/api/auth/signup/__tests__/route.integration.test.ts` |

**Dependencies:** SI-02.1, SI-02.3

**Acceptance criteria:**

- `POST /api/auth/signup` with valid payload returns `201` with `{ id, email }` and does **not** set a session cookie.
- `POST /api/auth/signup` with an already registered email returns `409` with the `{ statusCode, error, message }` envelope passed through from upstream.
- `POST /api/auth/signup` with invalid body returns `400` with the validation envelope passed through.

---

### SI-02.6 — BFF Route Handler: POST /api/auth/login

**Route:** POST /api/auth/login
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### POST /api/auth/login`

**Description:** Login Route Handler that proxies the upstream, extracts the tokens from the FE-facing body and seals them in the iron-session cookie.

**Technical actions:**

1. Create `app/api/auth/login/route.ts` — `POST` that forwards to `POST /auth/login` server-side via `openapi-fetch` (per `phase-02-auth-frontend/TD-05`; per `next-frontend-openapi-typing/TD-01`).
2. On upstream 200, **omit** `access_token`/`refresh_token` from the FE-facing body and seal the session via `setSession()` carrying tokens + `userId`/`email`/`channelSlug` (per `### API Contracts` → BFF tier `#### POST /api/auth/login`; per `phase-02-auth-frontend/TD-02`).
3. Pass through upstream errors verbatim: 401 (invalid credentials), 403 (email not confirmed), 400 (validation) in the `ApiErrorEnvelope` envelope (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/auth/login/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — FE-facing body without tokens; `Set-Cookie` iron-session present; 401/403/400 pass-through | `app/api/auth/login/__tests__/route.integration.test.ts` |

**Dependencies:** SI-02.1, SI-02.2, SI-02.3

**Acceptance criteria:**

- `POST /api/auth/login` with valid credentials returns `200` whose body **does not** contain `access_token` or `refresh_token` and responds with an `iron-session` `httpOnly` cookie set.
- `POST /api/auth/login` with invalid credentials returns `401` with the upstream envelope passed through and **without** setting a cookie.
- `POST /api/auth/login` with an unconfirmed email returns `403` with the upstream envelope passed through.

---

### SI-02.7 — BFF Route Handler: POST /api/auth/logout

**Route:** POST /api/auth/logout

**Description:** Logout Route Handler — revokes the refresh tokens upstream and destroys the session cookie. The "Logout" capability has no UI in this phase (button lives in authenticated chrome, later phase); the BFF contract is delivered now to be ready when the chrome lands (per `## Non-UI / Deferred Capabilities`).

**Technical actions:**

1. Create `app/api/auth/logout/route.ts` — `POST` that reads the `access_token` from the session and calls upstream `POST /auth/logout` with `Authorization: Bearer` server-side (per `phase-02-auth-frontend/TD-05`; per `next-frontend-openapi-typing/TD-01`).
2. After the upstream call (success or 401), invoke `destroySession()` — single `session.destroy()` (per `phase-02-auth-frontend/TD-02` — single cookie; per `phase-02-auth-frontend/TD-01`).
3. Respond `204` to the client regardless of the upstream result (local logout idempotency).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/auth/logout/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler" — session destroyed; `204`; upstream 401 still destroys session | `app/api/auth/logout/__tests__/route.integration.test.ts` |

**Dependencies:** SI-02.2, SI-02.3

**Acceptance criteria:**

- `POST /api/auth/logout` with an active session returns `204` and the session cookie is invalidated in the response.
- `POST /api/auth/logout` when the upstream responds `401` still destroys the local session and returns `204`.
- A subsequent authenticated request after logout does not see the previous session.

---

### SI-02.8 — BFF Route Handler: POST /api/auth/forgot-password

**Route:** POST /api/auth/forgot-password
**API Contract:** see `## Technical Specifications` → `### API Contracts` → BFF tier → `#### POST /api/auth/forgot-password`

**Description:** Route Handler that proxies the password recovery request; 204 pass-through response, preserving the upstream anti-enumeration no-op.

**Technical actions:**

1. Create `app/api/auth/forgot-password/route.ts` — `POST` that forwards to `POST /auth/forgot-password` server-side via `openapi-fetch` (per `phase-02-auth-frontend/TD-05`; per `next-frontend-openapi-typing/TD-01`).
2. Type the request via `ForgotPasswordDto` from `@/lib/api/contracts`; `204` pass-through whether the email is registered or not (upstream anti-enumeration); no session cookie (per `### API Contracts` → BFF tier `#### POST /api/auth/forgot-password`).
3. Pass through `400` (validation) verbatim in the `ApiErrorEnvelope` envelope (per `### API Contracts` → BFF tier).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `app/api/auth/forgot-password/route.ts` | Integration (MSW) per testing-guide-next-frontend § "Route handler (simple proxy)" — 204 pass-through (known and unknown email); 400 pass-through; no cookie | `app/api/auth/forgot-password/__tests__/route.integration.test.ts` |

**Dependencies:** SI-02.1, SI-02.3

**Acceptance criteria:**

- `POST /api/auth/forgot-password` with valid email returns `204` with no body and no cookie.
- `POST /api/auth/forgot-password` with an unregistered email returns the same `204` (indistinguishable response — anti-enumeration).
- `POST /api/auth/forgot-password` with invalid body returns `400` with the validation envelope passed through.

---

### SI-02.9 — Session propagation to Client Components (RSC + Context Provider)

**Description:** Deliver the server-rendered session in the same response as the HTML and hydrate a Client Context Provider — no flicker, no extra round-trip.

**Technical actions:**

1. In the root RSC (`app/layout.tsx` or area layout), read `getSession()` and pass the initial state to a Client Provider (per `phase-02-auth-frontend/TD-06` — server-rendered session + RSC Context Provider).
2. Create `components/auth/session-provider.tsx` (`"use client"`) that receives the initial session via props and exposes it through context (per `phase-02-auth-frontend/TD-06`).
3. Create `hooks/use-session.ts` — hook to read the session context for Client Components (per `phase-02-auth-frontend/TD-06`).
4. Document the `router.refresh()` convention after mid-session mutations (one line in the relevant handler) to re-render the chrome with the updated session (per `phase-02-auth-frontend/TD-06`).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `components/auth/session-provider.tsx` | Unit per testing-guide-next-frontend § "Client Components" — hydrates with initial session; exposes value via context | `components/auth/__tests__/session-provider.test.tsx` |
| `hooks/use-session.ts` | Unit per testing-guide-next-frontend § "Custom hook" (`renderHook`) — returns the session from the provider; unauthenticated state when empty | `hooks/__tests__/use-session.test.ts` |

**Dependencies:** SI-02.2

**Acceptance criteria:**

- A Client Component inside the provider reads, on first paint, the correct session (authenticated vs unauthenticated) without an additional round-trip.
- `use-session` returns `userId`/`email`/`channelSlug` when there is a session and unauthenticated state when the cookie is absent.

---

### SI-02.10.0 — Drift audit: Signup screen

**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Signup screen`

**Technical actions:**

1. **Drift audit** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333
   - Reused DS components: [`components/auth/signup-form.tsx`, `components/ui/card.tsx`, `components/auth/back-link.tsx`, `components/auth/brand-logo.tsx`, `components/ui/label.tsx`, `components/ui/input.tsx`, `components/auth/password-visibility-toggle.tsx`, `components/auth/password-strength-meter.tsx`, `components/auth/terms-checkbox.tsx`, `components/ui/checkbox.tsx`, `components/auth/auth-footer.tsx`]
   - Server-connected component names: [`SignupForm`, `SubmitButton`]
   - Target paths (read-only context; no writes here): `app/(auth)/signup/page.tsx` + `components/auth/signup-form.tsx`

   For each component in the Reused DS list, do a value-level diff against the file on disk and classify per the 4-value enum (`aligned` / `minor drift` / `relevant drift` / `missing component`); compose the Decision per default policy; write the `## Screen: signup — audited at SI-02.10.0 ({YYYY-MM-DD})` section in `frontend-drift-report.md`. **No code edits.**

**Dependencies:** SI-02.0.1, SI-02.0.4, SI-02.0.5, SI-02.0.6

**Tests:** _(empty — audit-only; the report is the deliverable)_

**Acceptance criteria:**

- `frontend-drift-report.md` contains the `## Screen: signup` section with the run date in the heading.
- Every component in the Reused DS list has exactly one row with the Decision column filled per the status enum.
- Every `exception` carries a one-line justification.
- `git diff --name-only HEAD -- next-frontend` after the SI is empty.

---

### SI-02.10a — Signup screen (visual shell)

**Route:** /signup
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Signup screen`
**Drift Report:** see `frontend-drift-report.md` → `## Screen: signup`

**Technical actions:**

1. **Apply drift decisions** — read this screen's Drift Report section; for each row apply the verb (`auto-Edit "<specifics>"` → Edit the DS file; `create` → create file; `exception`/`skip` → no-op; `CONFLICT:` → strip the prefix and apply the verb). No drift detection/judgment here.
2. **Visual shell generation** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333
   - Reused DS components: list from the UI Contract _(reflecting action 1 edits)_
   - Server-connected component names: [`SignupForm`, `SubmitButton`]
   - Target paths: `app/(auth)/signup/page.tsx` + `components/auth/signup-form.tsx`

**Dependencies:** SI-02.10.0 + SI-02.0.1, SI-02.0.4, SI-02.0.5, SI-02.0.6

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-02.10b; E2E in /plan-test-specs spec)_

**Acceptance criteria:**

- `app/(auth)/signup/page.tsx` and `components/auth/signup-form.tsx` exist, export the expected components and compile per `docker compose exec next-frontend npx tsc --noEmit`.
- Rendering matches the Figma node fidelity within the DS set tolerance.
- No runtime imports beyond the Reused DS list (visual scope preserved).

---

### SI-02.10b — Signup screen (logic & wiring)

**Test Specs:** see `next-frontend/specs/signup.plan.md`
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Signup screen`

**Technical actions:**

1. **Rendering strategy** — `app/(auth)/signup/page.tsx` as RSC shell composing `components/auth/signup-form.tsx` marked `"use client"` (per UI Contract `**Rendering strategy:**`; per `phase-02-auth-frontend/TD-05`). `Anonymous` route — no auth guard (per UI Contract `**Auth requirement:**`).
2. **Form + validation** — mount `signup-form.tsx` with `react-hook-form` + `zodResolver` (per `phase-02-auth-frontend/TD-04`; library-refs.md → react-hook-form/@hookform/resolvers), Zod schema mirroring the contract (authored now, alignable when `RegisterDto` expands per UI Contract `**Client-side validation mirror:**`).
3. **Endpoint wiring** — submit via `fetch("/api/auth/signup")` with types from `@/lib/api/contracts` (per `phase-02-auth-frontend/TD-05`; endpoint per `### API Contracts` → BFF tier `#### POST /api/auth/signup`).
4. **Error mapping** — map the `ApiErrorEnvelope` envelope: `409` → inline hint in the email field + "log in" CTA; `400` → `FormMessage` inline on the offending field (per UI Contract `**Error Catalog → UX mapping:**`; shadcn `FormMessage`/`Alert` pattern inferred — design gap recorded in the Open questions).
5. **Success** — on `201`, show confirmation (account created; confirmation email sent by the backend); no session at this step (per `### API Contracts` → BFF tier note).

**Dependencies:** SI-02.10a, SI-02.5, SI-02.1

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `components/auth/signup-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — submit happy path, 409/400 error mapping per row, client-side validation pre-submit | `components/auth/__tests__/signup-form.wiring.test.tsx` |

The page E2E (routing, complete signup flow) is authored externally by `/plan-test-specs` in the spec referenced in `**Test Specs:**` and consumed JIT by `/implement`. /plan-build does not emit an E2E row here.

**Acceptance criteria:**

- Submitting the form with valid data calls `POST /api/auth/signup` with typed payload and, on `201`, displays the account-created success state.
- A `409` response renders the inline hint in the email field with a "log in" CTA; a `400` response renders an inline error on the offending field.
- Client-side validation blocks submit and mirrors the backend rules 1:1 (no divergence).

---

### SI-02.11.0 — Drift audit: Login screen

**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Login screen`

**Technical actions:**

1. **Drift audit** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179
   - Reused DS components: [`components/auth/login-form.tsx`, `components/ui/card.tsx`, `components/auth/brand-logo.tsx`, `components/icons/streamtube-icon.tsx`, `components/ui/label.tsx`, `components/ui/input.tsx`, `components/ui/button.tsx`, `components/auth/auth-footer.tsx`]
   - Server-connected component names: [`LoginForm`, `SubmitButton`]
   - Target paths (read-only context; no writes here): `app/(auth)/login/page.tsx` + `components/auth/login-form.tsx`

   Value-level diff per component against disk, classification per the 4-value enum, Decision per default policy; write `## Screen: login — audited at SI-02.11.0 ({YYYY-MM-DD})` in `frontend-drift-report.md`. **No code edits.**

**Dependencies:** SI-02.0.4

**Tests:** _(empty — audit-only; the report is the deliverable)_

**Acceptance criteria:**

- `frontend-drift-report.md` contains the `## Screen: login` section with the run date in the heading.
- Every component in the Reused DS list has exactly one row with Decision filled per the enum.
- Every `exception` carries a one-line justification.
- `git diff --name-only HEAD -- next-frontend` after the SI is empty.

---

### SI-02.11a — Login screen (visual shell)

**Route:** /login
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Login screen`
**Drift Report:** see `frontend-drift-report.md` → `## Screen: login`

**Technical actions:**

1. **Apply drift decisions** — read this screen's Drift Report section; apply each row's verb (`auto-Edit`/`create`/`exception`/`skip`/`CONFLICT:` strip+apply). No detection/judgment here.
2. **Visual shell generation** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179
   - Reused DS components: list from the UI Contract _(reflecting action 1 edits)_
   - Server-connected component names: [`LoginForm`, `SubmitButton`]
   - Target paths: `app/(auth)/login/page.tsx` + `components/auth/login-form.tsx`

**Dependencies:** SI-02.11.0 + SI-02.0.4

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-02.11b; E2E in /plan-test-specs spec)_

**Acceptance criteria:**

- `app/(auth)/login/page.tsx` and `components/auth/login-form.tsx` exist, export the expected components and compile per `docker compose exec next-frontend npx tsc --noEmit`.
- Rendering matches the Figma node fidelity within the DS set tolerance.
- No runtime imports beyond the Reused DS list.

---

### SI-02.11b — Login screen (logic & wiring)

**Test Specs:** see `next-frontend/specs/login.plan.md`
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Login screen`

**Technical actions:**

1. **Rendering strategy** — `app/(auth)/login/page.tsx` as RSC shell composing `components/auth/login-form.tsx` `"use client"` (per UI Contract `**Rendering strategy:**`; per `phase-02-auth-frontend/TD-05`). `Anonymous` route — no guard (per UI Contract `**Auth requirement:**`).
2. **Form + validation** — `react-hook-form` + `zodResolver` (per `phase-02-auth-frontend/TD-04`), Zod schema mirroring the `LoginDto` contract (alignable when it expands, per UI Contract `**Client-side validation mirror:**`).
3. **Endpoint wiring** — submit via `fetch("/api/auth/login")` typed by `@/lib/api/contracts` (per `phase-02-auth-frontend/TD-05`; endpoint per `### API Contracts` → BFF tier `#### POST /api/auth/login`). On `200`, the session has already been sealed in the cookie by the BFF; fire `router.refresh()` so the chrome reflects the session (per `phase-02-auth-frontend/TD-06`).
4. **Error mapping** — `401` → form-level `Alert` "invalid credentials"; `403` → `Alert` with resend-confirmation CTA; `400` → inline `FormMessage` (per UI Contract `**Error Catalog → UX mapping:**`; shadcn pattern inferred — design gap recorded).

**Dependencies:** SI-02.11a, SI-02.6, SI-02.9, SI-02.1

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `components/auth/login-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — submit happy path, 401/403/400 mapping, client-side validation pre-submit | `components/auth/__tests__/login-form.wiring.test.tsx` |

The page E2E (login → session → redirect, guards) is authored externally by `/plan-test-specs` in the spec referenced in `**Test Specs:**` and consumed JIT by `/implement`. /plan-build does not emit an E2E row here.

**Acceptance criteria:**

- Submitting the form with valid credentials calls `POST /api/auth/login`, and after `200` the UI reflects the authenticated state (chrome via `router.refresh()`), with no tokens visible to the client.
- A `401` response renders a form-level alert of invalid credentials; `403` renders an unconfirmed-email alert; `400` renders an inline error.
- Client-side validation blocks submit and mirrors the backend rules 1:1.

---

### SI-02.12.0 — Drift audit: Password recovery request screen

**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Password recovery request screen`

**Technical actions:**

1. **Drift audit** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289
   - Reused DS components: [`components/auth/forgot-password-form.tsx`, `components/ui/card.tsx`, `components/ui/icon-button.tsx`, `components/auth/brand-logo.tsx`, `components/ui/label.tsx`, `components/ui/input.tsx`, `components/ui/button.tsx`, `components/auth/auth-footer.tsx`]
   - Server-connected component names: [`ForgotPasswordForm`, `SubmitButton`]
   - Target paths (read-only context; no writes here): `app/(auth)/forgot-password/page.tsx` + `components/auth/forgot-password-form.tsx`

   Value-level diff per component against disk, classification per the 4-value enum, Decision per default policy; write `## Screen: forgot-password — audited at SI-02.12.0 ({YYYY-MM-DD})` in `frontend-drift-report.md`. **No code edits.**

**Dependencies:** SI-02.0.3, SI-02.0.4

**Tests:** _(empty — audit-only; the report is the deliverable)_

**Acceptance criteria:**

- `frontend-drift-report.md` contains the `## Screen: forgot-password` section with the run date in the heading.
- Every component in the Reused DS list has exactly one row with Decision filled per the enum.
- Every `exception` carries a one-line justification.
- `git diff --name-only HEAD -- next-frontend` after the SI is empty.

---

### SI-02.12a — Password recovery request screen (visual shell)

**Route:** /forgot-password
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Password recovery request screen`
**Drift Report:** see `frontend-drift-report.md` → `## Screen: forgot-password`

**Technical actions:**

1. **Apply drift decisions** — read this screen's Drift Report section; apply each row's verb (`auto-Edit`/`create`/`exception`/`skip`/`CONFLICT:` strip+apply). No detection/judgment here.
2. **Visual shell generation** — invoke `figma:figma-implement-design` (narrow handoff) with:
   - Figma URL: https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289
   - Reused DS components: list from the UI Contract _(reflecting action 1 edits)_
   - Server-connected component names: [`ForgotPasswordForm`, `SubmitButton`]
   - Target paths: `app/(auth)/forgot-password/page.tsx` + `components/auth/forgot-password-form.tsx`

**Dependencies:** SI-02.12.0 + SI-02.0.3, SI-02.0.4

**Tests:** _(empty — shell smoke-gated by build AC; Unit tests live in SI-02.12b; E2E in /plan-test-specs spec)_

**Acceptance criteria:**

- `app/(auth)/forgot-password/page.tsx` and `components/auth/forgot-password-form.tsx` exist, export the expected components and compile per `docker compose exec next-frontend npx tsc --noEmit`.
- Rendering matches the Figma node fidelity within the DS set tolerance.
- No runtime imports beyond the Reused DS list.

---

### SI-02.12b — Password recovery request screen (logic & wiring)

**Test Specs:** see `next-frontend/specs/forgot-password.plan.md`
**UI Contract:** see `## Technical Specifications` → `### UI Contracts` → `#### Screen: Password recovery request screen`

**Technical actions:**

1. **Rendering strategy** — `app/(auth)/forgot-password/page.tsx` as RSC shell composing `components/auth/forgot-password-form.tsx` `"use client"` (per UI Contract `**Rendering strategy:**`; per `phase-02-auth-frontend/TD-05`/`TD-07`). `Anonymous` route — no guard (per UI Contract `**Auth requirement:**`).
2. **Form + validation** — `react-hook-form` + `zodResolver` (per `phase-02-auth-frontend/TD-04`), Zod schema of the email field mirroring `ForgotPasswordDto` (alignable when it expands, per UI Contract `**Client-side validation mirror:**`).
3. **Endpoint wiring** — submit via `fetch("/api/auth/forgot-password")` typed by `@/lib/api/contracts` (per `phase-02-auth-frontend/TD-05`; endpoint per `### API Contracts` → BFF tier `#### POST /api/auth/forgot-password`).
4. **Inline success** — on `204`, replace the form with an inline confirmation box inside the same `Card`, identical response whether the email is registered or not (per UI Contract; per `phase-02-auth-frontend/TD-07` — inline landing, no dedicated route).
5. **Error mapping** — `400` → inline `FormMessage` below the email field (per UI Contract `**Error Catalog → UX mapping:**`; shadcn pattern inferred — design gap recorded).

**Dependencies:** SI-02.12a, SI-02.8, SI-02.1

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `components/auth/forgot-password-form.tsx` | Unit per testing-guide-next-frontend § "Client Components" — submit happy path → inline success, 400 error mapping, client-side validation pre-submit | `components/auth/__tests__/forgot-password-form.wiring.test.tsx` |

The page E2E (request → inline success) is authored externally by `/plan-test-specs` in the spec referenced in `**Test Specs:**` and consumed JIT by `/implement`. /plan-build does not emit an E2E row here.

**Acceptance criteria:**

- Submitting the form with valid email calls `POST /api/auth/forgot-password` and, on `204`, renders the inline confirmation box in the same `Card` (form replaced).
- An unregistered email produces exactly the same inline confirmation (no reveal that the account exists).
- A `400` response renders the inline error below the email field; client-side validation blocks submit mirroring the backend 1:1.

---

## Technical Specifications

### API Contracts

> _BFF tier — frontend-exposed contract. The browser calls the FE-facing route under `app/api/auth/**`; the route proxies the upstream NestJS API server-side per the strict-BFF architecture documented in `next-frontend/CLAUDE.md` (Route Handlers as the only NestJS caller). The slice has no `Scope: Backend | Cross-layer` TD — backend auth is settled in `phase-02-auth` — so only the BFF tier is emitted. Contract source-of-truth: `next-frontend/openapi.json` → `lib/api/types.gen.ts` → `paths` (per `next-frontend-openapi-typing/TD-01..TD-04`)._

#### POST /api/auth/signup (SI-NN.X)

**forwards-to:** `POST /auth/register` *(derived: project contract source)*

**Request headers:**
- Content-Type: application/json *(derived: project contract source)*

**Request body:** `RegisterDto` *(derived: project contract source — fields per source; not re-spelled here to avoid duplication)*

**Response 201 (FE-facing):** `{ id, email }` — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 409 (Email already registered): pass-through *(derived: project contract source)*
- 400 (Validation failed): pass-through *(derived: project contract source)*

_Note: signup sets no session cookie — the backend issues an email-confirmation link and the account is unconfirmed until the user follows it; the iron-session cookie is established only on login (per phase-02-auth-frontend/TD-02). Error bodies follow the upstream `ApiErrorEnvelope` `{ statusCode, error, message, code }` *(derived: project contract source)*._

---

#### POST /api/auth/login (SI-NN.X)

**forwards-to:** `POST /auth/login` *(derived: project contract source)*

**Request headers:**
- Content-Type: application/json *(derived: project contract source)*

**Request body:** `LoginDto` *(derived: project contract source — fields per source; not re-spelled here to avoid duplication)*

**Response 200 (FE-facing):** body OMITS `access_token` / `refresh_token` *(reshape per phase-02-auth-frontend/TD-02)*

**Set-Cookie / session side-effect:** sets the encrypted `iron-session` cookie carrying `access_token` + `refresh_token` + a minimal user fingerprint (`userId`, `email`, `channelSlug`) *(per phase-02-auth-frontend/TD-02)*

**Error responses (FE-facing):**
- 401 (Invalid email or password): pass-through *(derived: project contract source)*
- 403 (Email not confirmed): pass-through *(derived: project contract source)*
- 400 (Validation failed): pass-through *(derived: project contract source)*

_Note: upstream login returns `{ access_token, refresh_token }` per the contract source; the BFF strips both from the FE-facing body and seals them into the `iron-session` cookie instead (custody never crosses to the browser). Transparent re-auth on a later upstream 401 is handled by the single-flight refresh helper against `POST /auth/refresh` *(per phase-02-auth-frontend/TD-03)* — not a server-connected UI endpoint, so it has no block here. Error bodies follow the upstream `ApiErrorEnvelope` *(derived: project contract source)*._

---

#### POST /api/auth/forgot-password (SI-NN.X)

**forwards-to:** `POST /auth/forgot-password` *(derived: project contract source)*

**Request headers:**
- Content-Type: application/json *(derived: project contract source)*

**Request body:** `ForgotPasswordDto` *(derived: project contract source — fields per source; not re-spelled here to avoid duplication)*

**Response 204 (FE-facing):** No content — pass-through *(derived: project contract source; reshape: none)*

**Error responses (FE-facing):**
- 400 (Validation failed): pass-through *(derived: project contract source)*

_Note: the upstream returns 204 whether or not the email is registered (anti-enumeration no-op) *(derived: project contract source)*; the FE renders an inline success state on 204 regardless (per phase-02-auth-frontend/TD-07 — RSC/Client landing split; success shown in the same `/forgot-password` Card). No session cookie is set._

### UI Contracts

#### Screen: Signup screen

**Route:** `/signup`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333 (node `Doz7n3FsRhfvelYrPhTZAG:140:333`)
**Purpose:** "User signup with email and password".

**Auth requirement:** Anonymous _(no §Authorization Matrix emitted — pre-session public auth screen; the upstream `/auth/register` carries no security requirement in the contract source)_

**Rendering strategy:** RSC page shell composing a `"use client"` form child (react-hook-form + Zod resolver), submitting through the BFF Route Handler _(source: phase-02-auth-frontend/TD-05 — Mutation Submission Pathway: Route Handler POST + client fetch; form pattern per phase-02-auth-frontend/TD-04)_

**Reused DS components:**
- `components/auth/signup-form.tsx (new)` — Form as a unit (TD-04/TD-05); submit triggers the signup mutation
- `components/ui/card.tsx` — Auth card container
- `components/auth/back-link.tsx (new)` — Client-side navigation (Next.js `<Link>`)
- `components/auth/brand-logo.tsx` — Includes `components/icons/streamtube-icon.tsx`
- `components/ui/label.tsx` — form field labels
- `components/ui/input.tsx` — Controlled via react-hook-form (TD-04)
- `components/auth/password-visibility-toggle.tsx (new)` — Client-side `type` password/text toggle
- `components/auth/password-strength-meter.tsx (new)` — Operates only on client-side input
- `components/auth/terms-checkbox.tsx (new)` — Local checkbox state; validated by Zod (TD-04)
- `components/ui/checkbox.tsx (new)` — DS primitive not yet authored
- `components/auth/auth-footer.tsx` — Includes "Sign in" link → /login (client-side nav)

**Server-connected components:**
- `SignupForm` — verbs: Register new user with email and password | endpoint: `POST /api/auth/signup` (§API Contracts → BFF tier — see for `forwards-to` + request/response/projection) | reuse: `components/auth/signup-form.tsx (new)`
- `SubmitButton` — verbs: Register new user with email and password | endpoint: `POST /api/auth/signup` (§API Contracts → BFF tier) | reuse: `components/ui/button.tsx`

**Behaviors:**

*Rendered states:*
- Loading: pending submit — `SubmitButton` disabled / spinner while the mutation is in flight.
- Empty: not applicable (form always rendered).
- Success: 201 — account created; backend fires the confirmation email (the account remains unconfirmed until the link is followed). No session at this step.
- Error: 409 email already registered / 400 validation — displayed inline + form-level alert (see mapping below).

*Interactions:*
- `<PasswordVisibilityToggle>` click → toggles `type` password/text of the Password and Confirm Password fields (client-side).
- `<PasswordStrengthMeter>` ← reflects the password input live (client-side).
- `<TermsCheckboxRow>` toggle → local state; blocks submit until checked (validated by Zod, TD-04).
- back-arrow + "Sign in" link from `AuthFooter` → client-side navigation (Next.js `<Link>`).

**Error Catalog → UX mapping:**

| errorCode (upstream `ApiErrorEnvelope`) | UX treatment |
|-----------------------------------------|--------------|
| 409 (Email already registered) | Inline hint in the email field with "log in" CTA; _TBD — design gap, no error variant in Figma_ |
| 400 (Validation failed) | `FormMessage` inline below the offending field; _TBD — design gap_ |

_No §Error Catalog emitted (slice has no Backend/Cross-layer TD); the upstream envelope `{ statusCode, error, message, code }` is the source (derived: project contract source)._

**Client-side validation mirror:** _No field-level validation rules in the contract source (`RegisterDto` with `properties: {}` not expanded in `openapi.json`); the client-side Zod schema is authored during implementation per phase-02-auth-frontend/TD-04, mirroring the upstream when the spec expands._

**Accessibility notes:**
- Follow DS defaults (no specific a11y observation in the inventory).

_Open questions (passive — already recorded in the inventory `## Open questions`, ingested as OQ by plan-validate): "Terms of Service"/"Privacy Policy" links point to `/terms`/`/privacy` outside Phase 02 scope; no error/loading surface present in Figma (design gap — infer the shadcn `FormMessage` + `Alert` pattern during implementation)._

---

#### Screen: Login screen

**Route:** `/login`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179 (node `Doz7n3FsRhfvelYrPhTZAG:138:179`)
**Purpose:** "User login and session control".

**Auth requirement:** Anonymous _(no §Authorization Matrix emitted — pre-session public auth screen; the upstream `/auth/login` carries no security requirement in the contract source)_

**Rendering strategy:** RSC page shell composing a `"use client"` form child (react-hook-form + Zod resolver), submitting through the BFF Route Handler _(source: phase-02-auth-frontend/TD-05; form pattern per phase-02-auth-frontend/TD-04)_. On success, the `iron-session` cookie is sealed by the BFF and the session propagates to Client Components via RSC + Context Provider _(per phase-02-auth-frontend/TD-06)_.

**Reused DS components:**
- `components/auth/login-form.tsx (new)` — react-hook-form + Zod (TD-04); submit → `/api/auth/login` (TD-05)
- `components/ui/card.tsx` — see screen: Signup screen
- `components/auth/brand-logo.tsx` — composed of StreamtubeIcon + wordmark
- `components/icons/streamtube-icon.tsx` — Sub-component of BrandLogo (reuse the DS component, not the remote asset)
- `components/ui/label.tsx` — form field labels
- `components/ui/input.tsx` — Controlled via react-hook-form (TD-04)
- `components/ui/button.tsx` — SubmitButton "Sign in"; submit trigger (TD-05)
- `components/auth/auth-footer.tsx` — "Sign up" internal link → /signup (client-side nav)

**Server-connected components:**
- `LoginForm` — verbs: Authenticate user with email and password and start session | endpoint: `POST /api/auth/login` (§API Contracts → BFF tier — see for `forwards-to` + Set-Cookie projection) | reuse: `components/auth/login-form.tsx (new)`
- `SubmitButton` — verbs: Authenticate user with email and password and start session | endpoint: `POST /api/auth/login` (§API Contracts → BFF tier) | reuse: `components/ui/button.tsx`

**Behaviors:**

*Rendered states:*
- Loading: pending submit — `SubmitButton` disabled / spinner.
- Empty: not applicable.
- Success: 200 — `iron-session` cookie set by the BFF (tokens never reach the browser, per TD-02); redirects to the authenticated area.
- Error: 401 invalid credentials / 403 email not confirmed / 400 validation (see mapping below).

*Interactions:*
- "Forgot password?" link → client-side navigation to `/forgot-password` (Next.js `<Link>`).
- "Sign up" link from `AuthFooter` → client-side navigation to `/signup`.

**Error Catalog → UX mapping:**

| errorCode (upstream `ApiErrorEnvelope`) | UX treatment |
|-----------------------------------------|--------------|
| 401 (Invalid email or password) | form-level `Alert` "invalid credentials"; _TBD — design gap, no error variant in Figma_ |
| 403 (Email not confirmed) | form-level `Alert` with resend-confirmation CTA; _TBD — design gap_ |
| 400 (Validation failed) | `FormMessage` inline below the offending field; _TBD — design gap_ |

_No §Error Catalog emitted; the upstream envelope `{ statusCode, error, message, code }` is the source (derived: project contract source)._

**Client-side validation mirror:** _No field-level rules in the contract source (`LoginDto` with `properties: {}` not expanded); client-side Zod schema authored during implementation per phase-02-auth-frontend/TD-04._

**Accessibility notes:**
- Follow DS defaults (no specific a11y observation in the inventory).

_Open questions (passive — already in the inventory `## Open questions`): password Input without visibility-toggle in Figma (possible design gap); no error/feedback surface present in the Figma node (design gap — runtime states inferred during implementation); StreamtubeIcon rendered as a remote `<img>` in Figma, but reuse the DS component `components/icons/streamtube-icon.tsx`._

---

#### Screen: Password recovery request screen

**Route:** `/forgot-password`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289 (node `Doz7n3FsRhfvelYrPhTZAG:140:289`)
**Purpose:** "Password recovery: request via email → token link → reset" — this screen covers the request step (sending the link by email).

**Auth requirement:** Anonymous _(no §Authorization Matrix emitted — pre-session public auth screen; the upstream `/auth/forgot-password` carries no security requirement in the contract source)_

**Rendering strategy:** RSC page shell composing a `"use client"` form child (react-hook-form + Zod resolver), submitting through the BFF Route Handler _(source: phase-02-auth-frontend/TD-05; form pattern per phase-02-auth-frontend/TD-04)_. Success state rendered inline in the same `Card` on 204 _(per phase-02-auth-frontend/TD-07 — RSC owns token, Client owns input; here the success is shown on the same screen with no dedicated route)_.

**Reused DS components:**
- `components/auth/forgot-password-form.tsx (new)` — Email field group + Button; submit → `POST /api/auth/forgot-password` (TD-05)
- `components/ui/card.tsx` — see screen: Signup screen
- `components/ui/icon-button.tsx (new)` — `arrow_back`; client-side nav back to `/login` (DS primitive not yet authored)
- `components/auth/brand-logo.tsx` — see screen: Signup screen
- `components/ui/label.tsx` — form field label
- `components/ui/input.tsx` — Controlled via react-hook-form (TD-04)
- `components/ui/button.tsx` — SubmitButton "Send reset link" (TD-05)
- `components/auth/auth-footer.tsx` — text shown in Figma is "Sign up" (likely inconsistency — expected "Sign in")

**Server-connected components:**
- `ForgotPasswordForm` — verbs: Request reset link email | endpoint: `POST /api/auth/forgot-password` (§API Contracts → BFF tier — see for `forwards-to` + anti-enumeration note) | reuse: `components/auth/forgot-password-form.tsx (new)`
- `SubmitButton` — verbs: Request reset link email | endpoint: `POST /api/auth/forgot-password` (§API Contracts → BFF tier) | reuse: `components/ui/button.tsx`

**Behaviors:**

*Rendered states:*
- Loading: pending submit — `SubmitButton` disabled / spinner.
- Empty: not applicable.
- Success: 204 — inline confirmation box inside the same `Card` (identical response whether the email is registered or not — upstream anti-enumeration).
- Error: 400 validation (see mapping below).

*Interactions:*
- `<IconButton>` (`arrow_back`) → client-side navigation back to `/login`.
- successful submit → inline success state replaces the form in the same `Card`.

**Error Catalog → UX mapping:**

| errorCode (upstream `ApiErrorEnvelope`) | UX treatment |
|-----------------------------------------|--------------|
| 400 (Validation failed) | `FormMessage` inline below the email field; _TBD — design gap_ |

_No §Error Catalog emitted; the upstream envelope `{ statusCode, error, message, code }` is the source (derived: project contract source)._

**Client-side validation mirror:** _No field-level rules in the contract source (`ForgotPasswordDto` with `properties: {}` not expanded); client-side Zod schema authored during implementation per phase-02-auth-frontend/TD-04._

**Accessibility notes:**
- Follow DS defaults (no specific a11y observation in the inventory).

_Open questions (passive — already in the inventory `## Open questions`): `AuthFooter` shows "Sign up" where the usual UX would be "Sign in" (design inconsistency — confirm with designer); inline success state not extracted as a separate variant in Figma (design gap — infer during implementation); the "set new password" screen (link destination) does not exist in Figma — capability only partially covered, the reset step is in `## Non-UI / Deferred Capabilities` (deferred to a later phase)._

### UI ↔ API Traceability Matrix

| Verb | Component | Screen | Endpoint (from API Contracts) | TD ref |
|------|-----------|--------|-------------------------------|--------|
| Register new user with email and password | SignupForm + SubmitButton | /signup | POST /api/auth/signup → forwards-to POST /auth/register | phase-02-auth-frontend/TD-05 |
| Authenticate user with email and password and start session | LoginForm + SubmitButton | /login | POST /api/auth/login → forwards-to POST /auth/login | phase-02-auth-frontend/TD-05 |
| Request reset link email | ForgotPasswordForm + SubmitButton | /forgot-password | POST /api/auth/forgot-password → forwards-to POST /auth/forgot-password | phase-02-auth-frontend/TD-05 |

_Capabilities flagged in `## Non-UI / Deferred Capabilities` (Account confirmation, Logout, set-new-password destination, umbrella "Screens …") are excluded from this matrix._

---

## Dependency Map

```
Bootstrap (B2.6)
SI-02.0.1 (root) — install shadcn checkbox
├── SI-02.0.2 — depends on SI-02.0.1 (test the installed primitive)
└── SI-02.0.6 — depends on SI-02.0.1 (terms-checkbox consumes ui/checkbox)
SI-02.0.3 (root, independent) — custom-ui icon-button
SI-02.0.4 (root, independent) — custom-business simple group (5 components)
SI-02.0.5 (root, independent) — custom-business complex password-visibility-toggle

Foundation
SI-02.1 (root) — auth contract aliases
└── SI-02.3 — depends on SI-02.1 (typed MSW handlers off contracts)
SI-02.2 (root) — iron-session module
├── SI-02.4 — depends on SI-02.2 + SI-02.3 (refresh helper; single-flight; MSW test)
├── SI-02.9 — depends on SI-02.2 (session propagation RSC + provider)
SI-02.5 — depends on SI-02.1 + SI-02.3 (BFF signup route)
SI-02.6 — depends on SI-02.1 + SI-02.2 + SI-02.3 (BFF login route; seals session)
SI-02.7 — depends on SI-02.2 + SI-02.3 (BFF logout route)
SI-02.8 — depends on SI-02.1 + SI-02.3 (BFF forgot-password route)

Screen: /signup
SI-02.10.0 — depends on SI-02.0.1, SI-02.0.4, SI-02.0.5, SI-02.0.6 (drift audit)
└── SI-02.10a — depends on SI-02.10.0 + SI-02.0.1, SI-02.0.4, SI-02.0.5, SI-02.0.6 (visual shell)
    └── SI-02.10b — depends on SI-02.10a + SI-02.5 + SI-02.1 (logic & wiring)

Screen: /login
SI-02.11.0 — depends on SI-02.0.4 (drift audit)
└── SI-02.11a — depends on SI-02.11.0 + SI-02.0.4 (visual shell)
    └── SI-02.11b — depends on SI-02.11a + SI-02.6 + SI-02.9 + SI-02.1 (logic & wiring)

Screen: /forgot-password
SI-02.12.0 — depends on SI-02.0.3, SI-02.0.4 (drift audit)
└── SI-02.12a — depends on SI-02.12.0 + SI-02.0.3, SI-02.0.4 (visual shell)
    └── SI-02.12b — depends on SI-02.12a + SI-02.8 + SI-02.1 (logic & wiring)
```

---

## Deliverables

- [ ] SI-02.0.1 — Infra: install batch shadcn primitives (checkbox)
- [ ] SI-02.0.2 — Tests shadcn batch (checkbox)
- [ ] SI-02.0.3 — Custom-ui: icon-button.tsx
- [ ] SI-02.0.4 — Custom-business simple group: back-link + forgot-password-form + login-form + password-strength-meter + signup-form
- [ ] SI-02.0.5 — Custom-business complex: password-visibility-toggle
- [ ] SI-02.0.6 — Custom-business complex: terms-checkbox
- [ ] SI-02.1 — Auth contract aliases in `lib/api/contracts.ts`
- [ ] SI-02.2 — iron-session session module (`lib/auth/session.ts`)
- [ ] SI-02.3 — MSW auth handlers (`mocks/handlers/auth.ts`)
- [ ] SI-02.4 — Single-flight token refresh helper (`lib/auth/refresh.ts`)
- [ ] SI-02.5 — BFF Route Handler: POST /api/auth/signup
- [ ] SI-02.6 — BFF Route Handler: POST /api/auth/login
- [ ] SI-02.7 — BFF Route Handler: POST /api/auth/logout
- [ ] SI-02.8 — BFF Route Handler: POST /api/auth/forgot-password
- [ ] SI-02.9 — Session propagation to Client Components (RSC + Context Provider)
- [ ] SI-02.10.0 — Drift audit: Signup screen
- [ ] SI-02.10a — Signup screen (visual shell)
- [ ] SI-02.10b — Signup screen (logic & wiring)
- [ ] SI-02.11.0 — Drift audit: Login screen
- [ ] SI-02.11a — Login screen (visual shell)
- [ ] SI-02.11b — Login screen (logic & wiring)
- [ ] SI-02.12.0 — Drift audit: Password recovery request screen
- [ ] SI-02.12a — Password recovery request screen (visual shell)
- [ ] SI-02.12b — Password recovery request screen (logic & wiring)

**Per-screen deliverables:**

- [ ] Screen Signup screen (`/signup`) is routable
- [ ] Screen Signup screen (`/signup`) renders loading, success, and error states
- [ ] Screen Signup screen (`/signup`) passes component tests (per testing-guide-next-frontend layers)
- [ ] Screen Login screen (`/login`) is routable
- [ ] Screen Login screen (`/login`) renders loading, success, and error states
- [ ] Screen Login screen (`/login`) passes component tests (per testing-guide-next-frontend layers)
- [ ] Screen Password recovery request screen (`/forgot-password`) is routable
- [ ] Screen Password recovery request screen (`/forgot-password`) renders submit, inline success, and error states
- [ ] Screen Password recovery request screen (`/forgot-password`) passes component tests (per testing-guide-next-frontend layers)

**Full test suites:**

- [ ] Frontend unit + integration tests pass (`docker compose exec next-frontend npm test`)
- [ ] E2E tests pass (`npx playwright test` on the host, with the containerized dev server up and `MSW_ENABLED=true` per `next-frontend/CLAUDE.md`)
- [ ] Type/compilation check passes (`docker compose exec next-frontend npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec next-frontend npm run lint`)

_Scope note: `nestjs-project` is out of this slice's scope — backend auth is settled in `phase-02-auth`; no backend command is listed here by design._
