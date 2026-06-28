---
subproject: frontend
runner: playwright
scope: phase-02-auth-frontend
si: SI-02.10b
target_file: tests/auth-signup.e2e-spec.ts
---

# Signup screen — Test Plan

## Application Overview

The `/signup` screen allows registering a new user with email and password. It is an anonymous route (no session guard): an RSC shell composes the `"use client"` form (`components/auth/signup-form.tsx`, react-hook-form + Zod), which submits via `fetch("/api/auth/signup")` to the BFF Route Handler, which proxies `POST /auth/register` on the NestJS upstream. On `201` the account is created (unconfirmed — the backend fires a confirmation email) and no session is established at this step. `409` (email already registered) and `400` (validation) errors are mapped to inline feedback; client-side validation mirrors the backend 1:1 and blocks submit before calling the network.

## Test Scenarios

### 1. Register a new user with email and password

**Setup:** `next-frontend/tests/fixtures.ts` (MSW network fixture auto-applied; server-side upstream faked via `instrumentation.ts`, no browser `page.route()` of `/api/**`)

#### 1.1. signup-success-account-created

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/signup`
    - expect: the signup `Card` renders with the email and password fields and the submit button
  2. User fills in valid email and password, checks the terms checkbox, and clicks "Sign up"
    - expect: the `POST /api/auth/signup` request is fired with a typed payload (email/password)
    - expect: while the mutation is in flight, the `SubmitButton` is disabled / in a loading state
  3. Backend responds `201`
    - expect: the account-created success state is shown (message indicating that the account was created and the confirmation email was sent)
    - expect: no session is established — there is no session cookie and no redirect to an authenticated area

#### 1.2. signup-error-409-email-already-registered

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/signup` and submits the form with an email that already exists (reserved upstream trigger → `409`, e.g. `conflict@example.com`)
    - expect: `POST /api/auth/signup` returns `409`
    - expect: an inline hint appears on the email field stating that the email is already registered
    - expect: the hint includes a "log in" CTA that navigates client-side to `/login`
  2. User corrects the email to a fresh one and resubmits, receiving `400` (reserved trigger → validation, e.g. `badrequest@example.com`)
    - expect: the `400` message is rendered inline below the offending field (not as a global email-field error)

#### 1.3. signup-client-side-validation-blocks-submit

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-05-16T21:32:09Z

**Steps:**
  1. User navigates to `/signup` and clicks "Sign up" with the form empty
    - expect: no `POST /api/auth/signup` request is fired (submit blocked by client-side validation)
    - expect: inline validation messages appear on the required fields
  2. User fills in data that violates the backend-mirrored rules (e.g. malformed email, weak password) and/or leaves the terms checkbox unchecked
    - expect: submit remains blocked and the inline messages reflect the same backend rules (no client/server divergence)
  3. User corrects all fields to valid values and checks the terms
    - expect: submit is enabled and `POST /api/auth/signup` is fired
