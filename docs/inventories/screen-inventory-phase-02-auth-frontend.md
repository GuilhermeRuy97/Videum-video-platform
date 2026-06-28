# phase-02-auth-frontend — Screen Inventory

> **Phase:** 02 — Signup, Login, and Account Management (frontend slice)
> **Status:** Validated
> **Date:** 2026-05-14
> **Screens in scope:** 3

---

## Screen: Signup screen

**Route:** `/signup`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-333 (node `Doz7n3FsRhfvelYrPhTZAG:140:333`)
**Purpose (from project-plan.md):** "User signup with email and password".

### Component inventory

| Component (Figma node)              | Type              | In DS? | Reuse?                                  | Notes |
|-------------------------------------|-------------------|--------|-----------------------------------------|-------|
| SignupForm (143:2399)               | Server-connected  | ✗      | `components/auth/signup-form.tsx (new)` | Form as a unit (TD-04/TD-05); submit dispatches the signup mutation |
| Card (143:2400)                     | Presentational    | ✓      | `components/ui/card.tsx`                | Auth card container |
| BackArrow (143:2407)                | Local-interactive | ✗      | `components/auth/back-link.tsx (new)`   | Client-side navigation (Next.js `<Link>`) |
| BrandLogo (2387:2263)               | Presentational    | ✓      | `components/auth/brand-logo.tsx`        | Includes `components/icons/streamtube-icon.tsx` |
| Heading "Create account" (143:2429) | Presentational    | ✗      | new                                     | Pure-DOM `<h1>` |
| Subtitle (143:2442)                 | Presentational    | ✗      | new                                     | Pure-DOM helper text |
| FullNameField (2716:2085)           | Presentational    | ✗      | new                                     | Label + Input composition |
| FormLabel "Full Name" (2172:347)    | Presentational    | ✓      | `components/ui/label.tsx`               | — |
| Input "Full Name" (143:2433)        | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04) |
| EmailField (2716:2087)              | Presentational    | ✗      | new                                     | Label + Input composition |
| FormLabel "Email address" (2172:350)| Presentational    | ✓      | `components/ui/label.tsx`               | — |
| Input "Email" (143:2434)            | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04) |
| PasswordField (2716:2089)           | Presentational    | ✗      | new                                     | Label + Input + toggle + strength meter + helper composition |
| FormLabel "Password" (2172:353)     | Presentational    | ✓      | `components/ui/label.tsx`               | — |
| Input "Password" (143:2435)         | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04) |
| PasswordVisibilityToggle (I143:2435;82:6685) | Local-interactive | ✗ | `components/auth/password-visibility-toggle.tsx (new)` | Toggles the `type` between password/text client-side |
| PasswordStrengthMeter (143:2446)    | Local-interactive | ✗      | `components/auth/password-strength-meter.tsx (new)` | Operates only on client-side input |
| PasswordStrengthHelper (143:2444)   | Presentational    | ✗      | new                                     | Helper text driven by the strength meter |
| ConfirmPasswordField (2716:2091)    | Presentational    | ✗      | new                                     | Label + Input + toggle composition |
| FormLabel "Confirm Password" (2172:356) | Presentational | ✓      | `components/ui/label.tsx`               | — |
| Input "Confirm Password" (143:2436) | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04) |
| ConfirmPasswordVisibilityToggle (I143:2436;82:6685) | Local-interactive | ✗ | `components/auth/password-visibility-toggle.tsx (new)` | Toggles the `type` between password/text client-side |
| TermsCheckboxRow (2716:2093)        | Local-interactive | ✗      | `components/auth/terms-checkbox.tsx (new)` | Local checkbox state; validated by Zod (TD-04) |
| Checkbox (143:2445)                 | Local-interactive | ✗      | `components/ui/checkbox.tsx (new)`      | DS primitive not yet authored |
| TermsLinks (143:2439)               | Local-interactive | ✗      | new                                     | Inline anchors to /terms and /privacy (routes out of scope) |
| SubmitButton "Create account" (143:2443) | Server-connected | ✓   | `components/ui/button.tsx`              | Form submit; dispatches the signup mutation (TD-05) |
| AuthFooter (2394:2284)              | Presentational    | ✓      | `components/auth/auth-footer.tsx`       | Includes "Sign in" link → /login (client-side nav) |

### Verbs of intent

| Verb                                          | Component                            | Capability (project-plan.md)             |
|-----------------------------------------------|--------------------------------------|------------------------------------------|
| Sign up a new user with email and password    | SignupForm + SubmitButton (143:2443) | "User signup with email and password" |

### Observations

- Form classified as Server-connected as a unit (skill rule: forms with local validation + server submit are always Server-connected); SubmitButton also marked Server-connected because the submit action is dispatched by it (TD-05).
- Capabilities "Automatic creation of the user's channel from the email prefix" and "Account confirmation via email with an activation link" are server-side side-effects of the signup mutation; they have no dedicated affordance on this screen.
- The "Sign in" link in AuthFooter and the back-arrow at the top depend on framework-provided client-side navigation (Next.js `<Link>`) — Local-interactive per skill rules.
- Visibility-toggles and the strength meter operate only on client-side input.
- "Terms of Service" and "Privacy Policy" links point to routes outside the scope of Phase 02 — flagged for Open questions.
- No visible component in the screenshot is missing from `get_design_context`.

---

## Screen: Login screen

**Route:** `/login`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=138-179 (node `Doz7n3FsRhfvelYrPhTZAG:138:179`)
**Purpose (from project-plan.md):** "User login and session control".

### Component inventory

| Component (Figma node)                       | Type              | In DS? | Reuse?                                  | Notes |
|----------------------------------------------|-------------------|--------|-----------------------------------------|-------|
| LoginForm (143:2265)                         | Server-connected  | ✗      | `components/auth/login-form.tsx (new)`  | react-hook-form + Zod (TD-04); submit → `/api/auth/login` (TD-05) |
| Card (143:1250)                              | Presentational    | ✓      | `components/ui/card.tsx`                | see screen: Signup screen |
| BrandLogo (2387:2244)                        | Presentational    | ✓      | `components/auth/brand-logo.tsx`        | see screen: Signup screen; composed of StreamtubeIcon + wordmark |
| StreamtubeIcon (I2387:2244;2417:133)         | Presentational    | ✓      | `components/icons/streamtube-icon.tsx`  | Sub-component of BrandLogo |
| Heading "Sign in" (143:2273)                 | Presentational    | ✗      | new                                     | Pure-DOM `<h1>` |
| FormLabel "Email address" (2172:253)         | Presentational    | ✓      | `components/ui/label.tsx`               | — |
| Input email (147:536)                        | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04) |
| FormLabel "Password" (2172:263)              | Presentational    | ✓      | `components/ui/label.tsx`               | — |
| Link "Forgot password?" (147:539)            | Local-interactive | ✗      | new                                     | Client-side nav → `/forgot-password` (Next.js `<Link>`) |
| Input password (147:540)                     | Local-interactive | ✓      | `components/ui/input.tsx`               | Controlled via react-hook-form (TD-04); no visibility-toggle in Figma |
| SubmitButton "Sign in" (147:541)             | Server-connected  | ✓      | `components/ui/button.tsx`              | Submit trigger; mutation pathway TD-05 |
| AuthFooter (2394:2271)                       | Presentational    | ✓      | `components/auth/auth-footer.tsx`       | see screen: Signup screen; internal "Sign up" link → /signup (client-side nav) |

### Verbs of intent

| Verb                                                     | Component                              | Capability (project-plan.md)            |
|----------------------------------------------------------|----------------------------------------|-----------------------------------------|
| Authenticate user with email and password and start session | LoginForm + SubmitButton (147:541)     | "User login and session control" |

### Observations

- Form and SubmitButton together realize the only Server-connected verb; the verbs table has 1 row because both contribute to the same submit intent.
- Input password (147:540) has no visibility-toggle in Figma — classified as Local-interactive only due to state ownership via react-hook-form. Possible design gap.
- The "Forgot password?" link navigates to `/forgot-password` (screen inventoried as #3 in this phase).
- The "Sign up" link in AuthFooter navigates to `/signup` (screen inventoried as #1 in this phase).
- No error/feedback surface (inline field error, form-level alert, loading state) present in the Figma node — flagged as a design gap; runtime states will need to be inferred during implement or sourced from a separate Figma variant.
- StreamtubeIcon is rendered in Figma as an `<img>` pointing to a remote asset, but the filesystem snapshot has `components/icons/streamtube-icon.tsx` as the canonical DS component — reuse the DS component, not the asset.

---

## Screen: Password recovery request screen

**Route:** `/forgot-password`
**Figma:** https://www.figma.com/design/Doz7n3FsRhfvelYrPhTZAG/?node-id=140-289 (node `Doz7n3FsRhfvelYrPhTZAG:140:289`)
**Purpose (from project-plan.md):** "Password recovery: request via email → link with token → reset" — this screen covers the request step (sending the link by email).

### Component inventory

| Component (Figma node)                | Type              | In DS? | Reuse?                                      | Notes |
|---------------------------------------|-------------------|--------|---------------------------------------------|-------|
| ForgotPasswordForm (140:289 wrapper)  | Server-connected  | ✗      | `components/auth/forgot-password-form.tsx (new)` | Email field group + Button; submit → `POST /api/auth/forgot-password` (TD-05) |
| Card (143:2308)                       | Presentational    | ✓      | `components/ui/card.tsx`                    | see screen: Signup screen |
| arrow_back (143:2343)                 | Local-interactive | ✗      | `components/ui/icon-button.tsx (new)`       | Client-side nav back to `/login` |
| BrandLogo (2387:2252)                 | Presentational    | ✓      | `components/auth/brand-logo.tsx`            | see screen: Signup screen |
| Heading "Reset password" (143:2347)   | Presentational    | ✗      | new                                         | Pure-DOM `<h1>` |
| Helper text (143:2353)                | Presentational    | ✗      | new                                         | Pure-DOM `<p>` ("Enter your email and we'll send you a reset link") |
| EmailField group (2713:2086)          | Presentational    | ✗      | new                                         | FormLabel + Input composition |
| FormLabel "Email address" (2172:282)  | Presentational    | ✓      | `components/ui/label.tsx`                   | — |
| Input email (143:2351)                | Local-interactive | ✓      | `components/ui/input.tsx`                   | Controlled via react-hook-form (TD-04) |
| SubmitButton "Send reset link" (143:2354) | Server-connected | ✓     | `components/ui/button.tsx`                  | Triggers submit → `POST /api/auth/forgot-password` (TD-05) |
| AuthFooter (2394:2276)                | Presentational    | ✓      | `components/auth/auth-footer.tsx`           | see screen: Signup screen; text shown in Figma is "Sign up" (likely inconsistency — expected "Sign in") |

### Verbs of intent

| Verb                                                              | Component                                          | Capability (project-plan.md)                                                                  |
|-------------------------------------------------------------------|----------------------------------------------------|-----------------------------------------------------------------------------------------------|
| Request an email with a password reset link                       | ForgotPasswordForm + SubmitButton (143:2354)       | "Password recovery: request via email → link with token → reset"                              |

### Observations

- Form normalized as ForgotPasswordForm (Server-connected as a unit) for consistency with signup/login; the submit state unifies EmailField + SubmitButton.
- This screen's AuthFooter displays a link labeled "Sign up" in Figma where the usual UX would be "Sign in" (back to login). Treated as a design inconsistency — flagged for Open questions.
- The success state is displayed inline on this same screen (no dedicated "check your email" route), per the decision recorded in the progress file. The success-state rendering is not present as a separate variant in Figma — only the form's default state was extracted.
- **Figma gap:** the "set new password" screen (destination of the link sent by email, where the user sets the new password) does not exist in the current Figma file. The "Password recovery…" capability is only partially covered by the design — the reset step needs to be designed before it can be inventoried.
- The `arrow_back` icon (143:2343) corresponds to the "Icon button" Figma component in the design system, but there is no equivalent React wrapper in `components/ui/`; emitted as `components/ui/icon-button.tsx (new)` for `phase-b.md` § B2.6 to generate the bootstrap SI.

---

## Reconciliation summary

| Capability (project-plan.md)                                                       | Covered by                                  | Screens                                              |
|------------------------------------------------------------------------------------|---------------------------------------------|------------------------------------------------------|
| "Transactional email sending service"                                              | (backend; side-effect of signup + forgot-password) | — (backend capability; no direct UI)              |
| "User signup with email and password"                                              | SignupForm + SubmitButton                   | /signup                                              |
| "Automatic creation of the user's channel from the email prefix"                   | (backend; side-effect of signup)            | — (backend capability; no direct UI)                |
| "Account confirmation via email with an activation link"                           | — (de-scoped by the user)                   | — (no screen; see Open questions)                    |
| "User login and session control"                                                   | LoginForm + SubmitButton                    | /login                                               |
| "Logout"                                                                           | — (no UI in this phase)                     | — (no screen; see Open questions)                    |
| "Password recovery: request via email → link with token → reset"                   | ForgotPasswordForm + SubmitButton (partial — request only) | /forgot-password (set-new-password absent from Figma) |
| "Signup, login, account confirmation, and password recovery screens"               | Signup + login + forgot-password screens    | /signup, /login, /forgot-password (confirmation de-scoped) |

## Open questions

- Capability "Account confirmation via email with an activation link" has no inventoried screen — de-scoped by the user on 2026-05-14 ("the rest we will not implement now"). The end-to-end signup flow depends on this screen to close (after signup → email with link → confirmation screen); it will need to be revisited in a later phase. TD-07 (Email-Link Landing Pattern) provides for RSC processing the token server-side; it is recommended to generate the screen inventory before implementing.
- Capability "Logout" has no inventoried UI in this phase. The logout "screen" is, in practice, a button inside the authenticated chrome (avatar/menu); its location depends on later phases that introduce the chrome (probably Phase 04 — "Management panel" / authenticated chrome). Confirm with `plan-validate` whether logout stays out of this phase intentionally.
- The password reset screen (set new password — destination of the link sent by email) does NOT exist in the current Figma. The "Password recovery…" capability is only partially covered; the reset step needs to be designed (a new Figma node) and inventoried before the full flow is implemented. Until then, `/forgot-password` sends the email but the link destination is a non-existent route.
- Signup screen: "Terms of Service" and "Privacy Policy" links (node 143:2439) point to routes (`/terms`, `/privacy`) outside the scope of Phase 02. Decide whether: (a) render as inert/placeholder links until the routes exist; (b) open an issue to create minimal static pages; (c) another strategy.
- Signup screen + Login screen: no form-level error/feedback surface (post-submit alert, loading state, inline field errors) is present in Figma. TD-04 + the `{ statusCode, error, message }` envelope (phase-02-auth/TD-07) imply that states need to be displayed. Decide whether: (a) infer the design during implement following the shadcn `FormMessage` + `Alert` pattern; (b) request error/loading variants from the designer before implement.
- Forgot-password screen: AuthFooter displays a "Sign up" link in Figma, but the usual UX on a recovery screen would be "Sign in" (back to login). Confirm with the designer which link/text is correct; alternative: implement as "Sign in" based on common UX.
- Forgot-password screen: the inline success state (after submit) was not extracted as a separate Figma variant. The design needs a success-state variant OR the implement infers the style (confirmation box inside the same Card).
- Planned-but-not-yet-existing components detected (`Reuse?` with the ` (new)` suffix) that will serve as triggers for `phase-b.md` § B2.6 (bootstrap SI synthesis): `components/auth/signup-form.tsx`, `components/auth/login-form.tsx`, `components/auth/forgot-password-form.tsx`, `components/auth/back-link.tsx`, `components/auth/password-visibility-toggle.tsx`, `components/auth/password-strength-meter.tsx`, `components/auth/terms-checkbox.tsx`, `components/ui/checkbox.tsx`, `components/ui/icon-button.tsx`. Confirm with `plan-build` that all will be materialized in this phase OR deferred to later phases per decision.
