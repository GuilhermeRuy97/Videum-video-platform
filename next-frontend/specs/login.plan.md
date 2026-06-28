---
subproject: frontend
runner: playwright
scope: phase-02-auth-frontend
si: SI-02.11b
target_file: tests/auth-login.e2e-spec.ts
---

# Login screen — Test Plan

## Application Overview

The `/login` screen authenticates a user with email and password and starts the session. It is an anonymous route: an RSC shell composes the `"use client"` form (`components/auth/login-form.tsx`, react-hook-form + Zod), which submits via `fetch("/api/auth/login")` to the BFF Route Handler, which proxies `POST /auth/login` on the NestJS upstream. On `200` the BFF seals the encrypted `iron-session` cookie (carrying `access_token`/`refresh_token` + minimal user fingerprint) — the tokens never reach the browser — and the form fires `router.refresh()` so the chrome reflects the authenticated state. `401` (invalid credentials), `403` (email not confirmed) and `400` (validation) errors are mapped to alerts/feedback; client-side validation mirrors the backend 1:1.

## Test Scenarios

### 1. Authenticate user with email and password and start session

**Setup:** `next-frontend/tests/fixtures.ts` (MSW network fixture auto-applied; server-side upstream faked via `instrumentation.ts`, no browser `page.route()` of `/api/**`)

#### 1.1. login-success-session-started

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/login`
    - expect: the login `Card` renders with email and password fields and the "Sign in" button
  2. User fills in valid credentials and clicks "Sign in"
    - expect: the `POST /api/auth/login` request is fired with a typed payload
    - expect: while the mutation is in flight, the `SubmitButton` is disabled / in loading
  3. Backend responds `200` and the BFF seals the session cookie
    - expect: no `access_token`/`refresh_token` appears in the client-visible response body or in browser storage
    - expect: the UI reflects the authenticated state (chrome updated via `router.refresh()`) / redirects to the authenticated area

#### 1.2. login-errors-401-403-400

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User submits the form with invalid credentials (reserved upstream trigger → `401`)
    - expect: a form-level "invalid credentials" `Alert` is rendered
    - expect: no session is established
  2. User submits with an email whose account has not been confirmed (reserved trigger → `403`)
    - expect: a form-level "email not confirmed" `Alert` is rendered, with a resend-confirmation CTA
  3. User submits with a payload that triggers upstream validation (reserved trigger → `400`)
    - expect: the `400` message is rendered inline below the offending field

#### 1.3. login-client-side-validation-blocks-submit

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/login` and clicks "Sign in" with the form empty
    - expect: no `POST /api/auth/login` request is fired (submit blocked client-side)
    - expect: inline validation messages appear on the required fields
  2. User fills in values that violate the backend-mirrored rules (e.g. malformed email)
    - expect: submit remains blocked and the inline messages mirror the backend 1:1
  3. User corrects the fields to valid values
    - expect: submit is enabled and `POST /api/auth/login` is fired
