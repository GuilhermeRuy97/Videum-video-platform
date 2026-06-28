---
subproject: frontend
runner: playwright
scope: phase-02-auth-frontend
si: SI-02.12b
target_file: tests/auth-forgot-password.e2e-spec.ts
---

# Password recovery request screen — Test Plan

## Application Overview

The `/forgot-password` screen covers the request step of the password recovery flow: the user provides their email and the backend sends a reset link. It is an anonymous route: an RSC shell composes the `"use client"` form (`components/auth/forgot-password-form.tsx`, react-hook-form + Zod), which submits via `fetch("/api/auth/forgot-password")` to the BFF Route Handler, which proxies `POST /auth/forgot-password` on the NestJS upstream. The upstream responds `204` regardless of whether the email is registered (anti-enumeration); the FE renders an inline success state in the same `Card` (form replaced), with no dedicated route. `400` (validation) error is mapped to inline feedback below the email field; client-side validation mirrors the backend 1:1.

## Test Scenarios

### 1. Request a password reset email with a reset link

**Setup:** `next-frontend/tests/fixtures.ts` (MSW network fixture auto-applied; server-side upstream faked via `instrumentation.ts`, no browser `page.route()` of `/api/**`)

#### 1.1. forgot-password-success-inline

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/forgot-password`
    - expect: the `Card` renders with the email field and the "Send reset link" button
  2. User fills in a valid (registered) email and clicks "Send reset link"
    - expect: the `POST /api/auth/forgot-password` request is fired with a typed payload
    - expect: while the mutation is in flight, the `SubmitButton` is disabled / in loading
  3. Backend responds `204`
    - expect: the inline confirmation box replaces the form within the same `Card`
    - expect: no session is established and there is no navigation to another route

#### 1.2. forgot-password-anti-enumeration

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/forgot-password` and submits an unregistered email (valid in format)
    - expect: `POST /api/auth/forgot-password` returns `204` (upstream anti-enumeration — no-op)
    - expect: the same inline confirmation box as in scenario 1.1 is rendered, with no text that reveals whether the account exists or not

#### 1.3. forgot-password-error-400-and-client-side-validation

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/forgot-password` and clicks "Send reset link" with the email field empty
    - expect: no `POST /api/auth/forgot-password` request is fired (submit blocked client-side)
    - expect: an inline validation message appears below the email field
  2. User enters a malformed email
    - expect: submit remains blocked and the inline message mirrors the backend rule 1:1
  3. User enters a well-formed email that triggers upstream validation (reserved trigger → `400`) and submits
    - expect: the `400` message is rendered inline below the email field (form not replaced)
