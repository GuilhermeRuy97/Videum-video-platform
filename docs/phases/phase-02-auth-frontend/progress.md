# phase-02-auth-frontend — Progress

**Status:** completed
**SIs:** 24/24 completed

### Setup-Infra — playwright.config.ts + instrumentation.ts + tests/fixtures.ts
- **Status:** completed
- **Tests:** no tests (infra setup)
- **Observations:**
  - `@playwright/test` was already in node_modules (v1.60.0) but not declared in package.json — added to devDependencies.
  - `playwright.config.ts` created: no webServer (dev server is containerized), baseURL=localhost:3001, testDir=./tests, testMatch=*.e2e-spec.ts.
  - `instrumentation.ts` created: register() conditional on `NEXT_RUNTIME === "nodejs"` && `MSW_ENABLED === "true"`, `onUnhandledRequest: "bypass"` per E2E architecture.
  - `tests/fixtures.ts` created: auto-use `network` fixture that documents the contract (no page.route(), no per-test server.use()).
  - `test:e2e` script added to package.json.

### SI-02.0.1 — Infra: install batch shadcn primitives
- **Status:** completed
- **Tests:** no tests (infra)
- **Observations:** none

### SI-02.0.2 — Tests shadcn batch (checkbox)
- **Status:** completed
- **Tests:** 6 passing
- **Observations:**
  - `vitest.config.ts` needed `resolve.alias` for the `@/` path (tsconfig is not read automatically by Vite).
  - `vitest.setup.ts` created with `@testing-library/jest-dom/vitest` (specific export for Vitest) and explicit `afterEach(cleanup)` — without globals mode, RTL's auto-cleanup does not fire on its own.

### SI-02.0.3 — Custom-ui: icon-button.tsx
- **Status:** completed
- **Tests:** 5 passing
- **Observations:** none

### SI-02.0.4 — Custom-business simple group
- **Status:** completed
- **Tests:** 22 passing
- **Observations:** none

### SI-02.0.5 — Custom-business complex: password-visibility-toggle
- **Status:** completed
- **Tests:** 3 passing
- **Observations:**
  - Created `components/icons/eye-icon.tsx` and `components/icons/eye-off-icon.tsx` as a dependency of the toggle.

### SI-02.0.6 — Custom-business complex: terms-checkbox
- **Status:** completed
- **Tests:** 6 passing
- **Observations:** none

### SI-02.1 — Auth contract aliases in lib/api/contracts.ts
- **Status:** completed
- **Tests:** no tests (type-only; compile-gated)
- **Observations:**
  - DTOs (`RegisterDto`, `LoginDto`, `ForgotPasswordDto`, `RefreshTokenDto`) are `Record<string, never>` in the current openapi.json — fields will expand when the upstream spec evolves; tsc passes.
  - Added `RefreshTokenPair` and `RefreshTokenDto` that SI-02.4 will need.

### SI-02.2 — iron-session session module (lib/auth/session.ts)
- **Status:** completed
- **Tests:** 4 passing
- **Observations:**
  - `lib/env.ts` updated with `SESSION_PASSWORD` (Zod min 32 chars).
  - `vitest.setup.ts` received `process.env.SESSION_PASSWORD` for tests.
  - `next/headers` mocked via `vi.mock` with an in-memory Map; iron-session runs real crypto in the test.

### SI-02.3 — MSW auth handlers (mocks/handlers/auth.ts)
- **Status:** completed
- **Tests:** no tests (test-infra)
- **Observations:**
  - `lucide-react` (added by shadcn on the checkbox) replaced with `@/components/icons/check-icon.tsx` per UI rule.
  - `@testing-library/user-event` added to devDependencies (was in the container's node_modules but not declared).
  - MSW handler resolvers use `HttpResponse.json(data)` without conflicting generic — body typing still passes via `type` imports of the aliases.

### SI-02.4 — Single-flight token refresh helper (lib/auth/refresh.ts)
- **Status:** completed
- **Tests:** 4 passing
- **Observations:**
  - Uses raw `fetch` (not the `upstream` client) for `/auth/refresh` — avoids type conflict with `RefreshTokenDto: Record<string, never>` in the current schema.

### SI-02.5 — BFF Route Handler: POST /api/auth/signup
- **Status:** completed
- **Tests:** 4 passing
- **Observations:**
  - `server-only` guard resolved via `resolve.alias` in vitest.config.ts (empty stub in `lib/__mocks__/server-only.ts`).
  - Handler imported via dynamic import inside `beforeAll` — mandatory pattern to avoid capturing the fetch not patched by MSW (per project memory).

### SI-02.6 — BFF Route Handler: POST /api/auth/login
- **Status:** completed
- **Tests:** 4 passing
- **Observations:** none

### SI-02.7 — BFF Route Handler: POST /api/auth/logout
- **Status:** completed
- **Tests:** 2 passing
- **Observations:** none

### SI-02.8 — BFF Route Handler: POST /api/auth/forgot-password
- **Status:** completed
- **Tests:** 3 passing
- **Observations:** none

### SI-02.9 — Session propagation to Client Components
- **Status:** completed
- **Tests:** 4 passing (2 session-provider + 2 use-session)
- **Observations:**
  - `lib/env.ts` updated with `isServer: typeof window === "undefined" || process.env.VITEST !== undefined` to avoid blocking server-only vars in jsdom tests.

### SI-02.10.0 — Drift audit: Signup screen
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Re-run at the user's request against the real files on disk (figma:figma-implement-design → node 140:333). Fixed 3 phantoms from the prior report: back-link (was classified as icon-button `size-9→size-6`; actually a text `<Link>` wrapper → aligned), password-visibility-toggle (assumed IconButton consumption; is a raw `<button>` → retune directly on the className), terms-checkbox (anchor `text-foreground` non-existent; already `text-muted-foreground` → aligned).
  - Quick scan corrected: 11 components (8 aligned, 2 minor drift, 1 relevant drift, 0 missing). Applicable specifics: checkbox.tsx (5), password-visibility-toggle.tsx (2), password-strength-meter.tsx (2).
  - Audit produced no edits in `next-frontend` (report lives in `docs/`); AC "git diff empty" interpreted as "no code edits by the audit" (literal impossible in resume with the whole phase uncommitted).

### SI-02.10a — Signup screen (visual shell)
- **Status:** completed
- **Tests:** no tests (visual shell)
- **Observations:**
  - Applied the 3 auto-Edit decisions from the corrected Drift Report: checkbox.tsx (radius hardcoded→token, border→border-2, border-input→border-border, drop 2 dark overrides), password-visibility-toggle.tsx (radius-1→radius-full, svg size-4→size-6), password-strength-meter.tsx (bars rounded-full→radius-0-5, text-helper→text-caption). 8 components skip.
  - Page path: plan specifies `app/(auth)/signup/page.tsx` (route group); the existing login page is at `app/login/page.tsx` (no route group) — path convention divergence between slices; out of scope for this SI to reconcile (observation for the user).
  - Created `components/icons/arrow-back-icon.tsx` from the Figma asset (arrow_back) — back-link.tsx is a `<Link>` wrapper and receives the icon as children (absolute positioning via call site, allowed).
  - **Out of scope (authorized by user):** `hooks/__tests__/use-session.test.ts:12` had a pre-existing TS2769 type error from SI-02.9 (SessionProvider without `children` in createElement); applied a 1-line fix (children in the props object) to unblock the project's `tsc --noEmit` gate. SI-02.9 should have caught this — follow-up for the user.
  - Visual parity not verified in browser (dev server not started per next-frontend/CLAUDE.md rule — only on explicit request); project tsc --noEmit passes (exit 0).

### SI-02.10b — Signup screen (logic & wiring)
- **Status:** completed
- **Tests:** 4 passing (signup-form.wiring vitest) + 3 passing (auth-signup E2E)
- **Observations:**
  - Complete wiring: RHF + zodResolver (schema TD-04: fullName/email/password/confirmPassword/terms; `RegisterDto` empty in the contract source — payload `{email,password}` authored per TD-04, pass-through by the BFF). Submit→`fetch("/api/auth/signup")`; 409→inline hint on email + CTA `/login`; 400→form-level msg (`data-slot=form-error`, not on the email field); 201→"Account created!" state.
  - Installed deps `react-hook-form@^7.76.0` + `@hookform/resolvers@^5.2.2` (zod ^4.4.3 already present; resolver auto-detects v4). `z.email()` / `z.boolean().refine` (Zod 4 idioms).
  - **Library-refs deviation (justified):** the canonical pattern uses the shadcn primitive `components/ui/form.tsx`, which does NOT exist and was deliberately excluded from the screen's Reused DS list (uses raw Label+Input). Wired RHF directly via `register`/`Controller` + inline `text-destructive` msgs, without introducing a non-audited DS primitive — preserves SI scope.
  - **Test-infra (in-scope):** `vitest.setup.ts` gained a `ResizeObserver` polyfill (jsdom does not provide it; Radix `@radix-ui/react-use-size` references it on mount — blocked every Radix-backed component test).
  - **Removed (direct consequence of this SI):** `components/auth/__tests__/signup-form.test.tsx` (bootstrap presentational test from SI-02.0.4) — asserted the old contract (`isSubmitting` prop, "Sign up" button) that this SI deliberately replaced; superseded by the wiring test + E2E.
  - Created `lib/auth/error-mapping.ts` (maps `ApiErrorEnvelope` → setError by status, per library-refs).
  - **Out of scope (follow-ups for user):** (a) `.env.local` was created by the test subagent with `API_URL=http://localhost:3000` — inside the container this points to the Next dev server itself; if MSW server-side dies (hot-reload), the upstream fetch falls into a Next 404 HTML instead of failing fast. Project convention (CLAUDE.md / vitest.setup default) is the Compose service name (`http://nestjs-api:3000`). (b) `.env.example` does not list `SESSION_PASSWORD`. (c) Operational: the dev server needs a clean restart with `MSW_ENABLED=true` before each E2E run — a previous session's server may have MSW silently dead (not reproducible from clean state).

### SI-02.11.0 — Drift audit: Login screen
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Figma node 138:179 audited against disk; 8 components in the Reused DS list. Quick scan: 7 aligned, 1 minor drift, 0 relevant drift, 0 missing.
  - 6 components (`card`, `label`, `input`, `button`, `brand-logo`, `auth-footer`) reproduce the `aligned/skip` decision from the signup audit (SI-02.10.0) — Prior honored, no CONFLICT (identical Figma demand between the two screens, same design file).
  - `streamtube-icon.tsx` is first-time (was not in the signup Reused DS): DS-compliant SVG icon, no token surface to drift → aligned.
  - Only drift: `login-form.tsx` "Forgot password?" link uses `text-label-md` (Medium-weight label token) where Figma 147:539 demands Inter Regular 14/20 = `text-body-md`. Typical auto-Edit retune (same typography system → minor), to apply in SI-02.11a.
  - Audit produced no edits in `next-frontend` (report lives in `docs/`); AC "git diff empty" satisfied in the sense of "no code edits by the audit".

### SI-02.11a — Login screen (visual shell)
- **Status:** completed
- **Tests:** no tests (visual shell)
- **Observations:**
  - Drift Report applied: 1 auto-Edit in `components/auth/login-form.tsx` ("Forgot password?" link `text-label-md` → `text-body-md`, per Figma 147:539 Inter Regular 14/20). Other 7 components `skip`. Post-edit variant-conflict guard: no typographic sibling under a variant prefix on the link → no extra action.
  - Created `app/(auth)/login/page.tsx` (route group, mirrors the `app/(auth)/signup/page.tsx` convention): main > Card > BrandLogo + h1 "Sign in" + LoginForm + AuthFooter. No BackLink/subtitle (absent in Figma node 138:179).
  - **Removed (direct consequence of this SI):** `app/login/page.tsx` (pre-phase scaffold). The plan fixes the path at `app/(auth)/login/page.tsx`; keeping both would resolve `/login` in parallel (route group does not affect the URL) → Next parallel-route error. The old scaffold was the pre-phase version of this same screen, replaced by this one (composes LoginForm) — superseded.
  - Visual parity not verified in browser (dev server not started per next-frontend/CLAUDE.md rule); compilation validated in the final verification.

### SI-02.11b — Login screen (logic & wiring)
- **Status:** completed
- **Tests:** 5 passing (login-form.wiring vitest) + 3 passing (auth-login E2E)
- **Observations:**
  - 4 complete actions: (1) RSC shell + client form already satisfied by SI-02.11a (anonymous route, no guard); (2) RHF + zodResolver, minimal schema `email`+`password` (LoginDto without props in the contract source, authored per TD-04); (3) submit → `fetch("/api/auth/login")`, `router.refresh()` on 200 (TD-06; tokens never on the client per TD-02); (4) error-mapping: 401→form-level alert, 403→distinct alert + resend CTA, 400→inline on the email field.
  - `login-form.tsx` rewritten from presentational (prop `isSubmitting`) to wired RHF — supersedes the SI-02.0.4 scaffold. **Removed (direct consequence):** `components/auth/__tests__/login-form.test.tsx` (bootstrap presentational test asserted the old contract, replaced by the wiring test + E2E).
  - Added `mapLoginErrorToForm` to `lib/auth/error-mapping.ts` (mirrors the signup one; keys by statusCode).
  - **Test-infra (in-scope):** `mocks/handlers/auth.ts` gained 2 reserved triggers on the `/auth/login` handler — `invalid@example.com`→401, `unconfirmed@example.com`→403 (the handler only had `badrequest@`→400). Mechanism sanctioned by the project's E2E contract (per-scenario via reserved trigger, no `server.use()` in E2E); required by the 401/403 scenarios of this SI's spec. Values do not collide with existing triggers.
  - Fix-loop diagnosis (1 attempt): the Vitest failure was test isolation (`refreshMock` module-level retained the count from the previous 200 test — correct source, returns before `router.refresh()` on `!res.ok`); resolved with `beforeEach(refreshMock.mockClear())`. The E2E 401 failure was stale MSW server-side: `instrumentation.ts` loads MSW once at boot and does NOT hot-reload; the pre-edit server fell into the 200 branch. Resolved with a clean dev server restart (same gotcha already recorded in SI-02.10b).
  - **Out of scope (follow-up for user):** the resend-confirmation CTA points to `/resend-confirmation`, a route non-existent in this phase (design gap/TBD already recorded in the UI Contract — `403` Error Catalog "TBD — design gap"). No resend endpoint in this slice's scope.
  - **Operational:** the `next-frontend` container has no `pkill`; killing the stale dev server before E2E requires kill via `/proc` (PIDs of `next-server`). Relevant for SI-02.12b (same E2E flow).
  - Visual parity not verified in browser (next-frontend/CLAUDE.md rule — only on explicit request).

### SI-02.12.0 — Drift audit: Password recovery screen
- **Status:** completed
- **Tests:** no tests (audit-only)
- **Observations:**
  - Figma node 140:289 audited against disk; 8 components. Quick scan: 8 aligned, 0 drift (minor/relevant/missing). No auto-Edit — SI-02.12a will apply only skips.
  - 6 components (`card`, `label`, `input`, `button`, `brand-logo`, `auth-footer`) reproduce `aligned/skip` from the signup/login audits — Prior honored, no CONFLICT.
  - `forgot-password-form.tsx` (first-time): composes only aligned DS primitives, no hardcoded token → aligned. `icon-button.tsx` (first-time): Figma arrow_back is the M3 standard icon button (container invisible until interaction) → maps to the `ghost` variant; arrow size/positioning is call-site composition of SI-02.12a (precedent from the signup back-link) → no DS-file drift.
  - Observed (out of audit scope): Figma footer shows "Sign up" where the usual would be "Sign in" — content/prop value + design-gap already recorded as open question in the UI Contract; not a token drift.
  - Audit produced no edits in `next-frontend` (report in `docs/`); AC "git diff empty" satisfied.

### SI-02.12a — Password recovery screen (visual shell)
- **Status:** completed
- **Tests:** no tests (visual shell)
- **Observations:**
  - Drift Report: 8 `skip` decisions — no DS edit applied.
  - Created `app/(auth)/forgot-password/page.tsx` (route group, mirrors the signup/login convention): main > Card relative > IconButton(arrow_back, absolute top-left) + BrandLogo + h1 "Reset password" + subtitle + ForgotPasswordForm + AuthFooter. No conflicting old scaffold (there was no `app/forgot-password/`).
  - Back affordance: `IconButton` (DS primitive, per UI Contract) with `ArrowBackIcon` (reuses `components/icons/arrow-back-icon.tsx`, created in SI-02.10a from the Figma arrow_back asset — same asset/position as the signup back-link). Client-side navigation back to `/login` (onClick) is interaction → wiring of SI-02.12b; the shell renders the control.
  - **Figma fidelity vs UX (follow-up for user):** AuthFooter rendered per Figma literal — "Remember your password?" + "Sign up" link → `/signup`. The UI Contract records as open question that the usual would be "Sign in" → `/login` (design inconsistency to confirm with designer). Kept faithful to Figma per AC; not unilaterally resolved.
  - Visual parity not verified in browser (next-frontend/CLAUDE.md rule); compilation in the final verification.

### SI-02.12b — Password recovery screen (logic & wiring)
- **Status:** completed
- **Tests:** 4 passing (forgot-password-form.wiring vitest) + 3 passing (auth-forgot-password E2E)
- **Observations:**
  - 5 complete actions: (1) RSC shell + client form already satisfied by SI-02.12a (anonymous route, no guard); (2) RHF + zodResolver, schema only `email` (ForgotPasswordDto without props, authored per TD-04); (3) submit → `fetch("/api/auth/forgot-password")` payload `{email}`; (4) success `204` → inline confirmation box (`role=status`, "Check your email") replaces the form in the same Card, neutral anti-enumeration message (identical registered/not); (5) `400` → inline below the email field (form not replaced).
  - `forgot-password-form.tsx` rewritten from presentational to wired RHF (signup-form pattern, no router — success is inline state, not navigation). **Removed (direct consequence):** `components/auth/__tests__/forgot-password-form.test.tsx` (bootstrap presentational test superseded by the wiring test + E2E).
  - Added `mapForgotPasswordErrorToForm` to `lib/auth/error-mapping.ts` (400→email field; else→root.serverError).
  - No new MSW reserved triggers — `/auth/forgot-password` handler already had `badrequest@`→400 / any other→204 (anti-enumeration). No edits in `mocks/`.
  - Fix-loop not needed (0 attempts); the subagent needed a clean dev server restart because the pre-existing server was running WITHOUT `MSW_ENABLED=true` (HTTP 200 but MSW server-side off). Reliable E2E readiness confirmation = `POST /api/auth/forgot-password` returning 204, not just `curl -I` 200.
  - Visual parity not verified in browser (next-frontend/CLAUDE.md rule).
