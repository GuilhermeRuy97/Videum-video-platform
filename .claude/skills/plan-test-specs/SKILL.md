---
name: plan-test-specs
description: "Stage 5 of the plan pipeline (post-build). Generates and syncs <subproject>/specs/<scenario>.plan.md files from phase/task plans, in Microsoft spec-driven format. Specs are later consumed by /implement Step 3a — frontend path loads the playwright-cli Skill for Playwright pattern reference and LLM-authors the E2E test file; backend path LLM-authors its E2E test file (file path/suffix per the per-subproject testing-guide skill; what-to-test and best practices per artifact come from that same skill, already loaded at /implement Step 2). Use after /plan-build completes. Triggers: 'plan-test-specs NN', 'plan-test-specs <slug>', 'generate test specs for phase X'."
disable-model-invocation: true
---

# Plan Pipeline — Stage 5: Test Specs

This is **Stage 5** (optional, post-build) of the plan pipeline defined in `.claude/skills/plan-pipeline/SKILL.md`. Read that file first for the cross-stage convention (frontmatter format, registered values, stage interaction). Stage 1-4 produce/edit a phase or task plan; Stage 5 derives external **spec files** from screen-wiring / controller-wiring / cross-layer SIs of that plan.

The skill is **skippable**: legacy plans (frontmatter without `test_specs_aware: true`) are routed to an abort message instructing migration; modern plans without any SI carrying `**Test Specs:**` (e.g., backend-pure phases) fall through silently.

## Input

- Positional argument: phase number `NN` (phase mode) OR task slug (task mode).
- Resolves the plan path same way `/implement` does:
  - phase mode → `docs/phases/phase-{NN}-{slug}/phase-{NN}-{slug}.md`
  - task mode → `docs/tasks/task-{slug}/task-{slug}.md`
- No flags in v1. (`--analyze`, `--reconcile`, `--force-regen <scenario>` deferred to v2 — see § "Out-of-scope".)

## Preflight

Run **in order**; abort on the first failure.

### 1. Plan existence

`Bash`-based stat on the resolved plan path. If file missing:

```
Plan does not exist at <resolved-path>. Check whether /plan-build has already run for <slug>.
```

### 2. Mode detection

The discriminator is the frontmatter `test_specs_aware: true` field — same algorithm `/implement` uses for `PLAN_MODE`:

```bash
TEST_SPECS_AWARE=$(awk '/^---$/{f=!f;next} f' "$PLAN" | grep -c "^test_specs_aware: true$" || echo 0)
```

- `TEST_SPECS_AWARE = 0` → legacy plan. Abort:

  ```
  Plan <slug> is in legacy mode (frontmatter does not declare `test_specs_aware: true`).
  To migrate: run '/plan-build <slug> --rebuild' first to regenerate in the new format,
  then rerun /plan-test-specs.
  ```

- `TEST_SPECS_AWARE > 0` → modern plan. Continue.

### 3. SI count with `**Test Specs:**`

```bash
TEST_SPECS_COUNT=$(grep -c "^\*\*Test Specs:\*\*" "$PLAN" || echo 0)
```

- `TEST_SPECS_COUNT = 0` → modern plan but zero screen/controller/cross-layer SIs (legitimate backend-pure phase or foundations-only). **No-op exit silently** with:

  ```
  /plan-test-specs: no SI with `**Test Specs:**` field in <slug>. Skip silently.
  ```

  Not an error — this is the expected path for pure backend phases.

- `TEST_SPECS_COUNT > 0` → continue to Procedure.

### 4. (No host-only binary precondition)

`/plan-test-specs` does NOT depend on the `playwright-cli` host binary. The binary's interactive workflow (Section 2 / Section 3 of the vendored skill) is not invoked by this skill nor by `/implement` Step 3a — both stages author specs and tests via single-pass LLM authoring (see `playwright-cli/VENDOR.md` § "Adaptations vs source"). The Playwright **test runner** (`@playwright/test` package in the frontend subproject) is a runtime dependency of `/implement` Step 4 (subagent runs the generated tests via the frontend subproject's Playwright invocation — e.g., `npx playwright test ...` for Node-based stacks), but that is the frontend subproject's dependency-manifest responsibility — not a precondition this skill checks.

## Procedure

Three stages, in order. Stage 1 reads and classifies; Stage 2 emits the report; Stage 3 applies NEW + re-stamps PRESERVED + no-op-bump per spec. UPDATED/DELETED/ORPHAN are only reported (warnings) in v1.

### Stage 1 — Iterate SIs and classify

Locate every SI block via `Grep -n '^### SI-' "$PLAN"`. For each SI block:

1. **Bounded read** between this SI's header and the next `^### SI-` header (or end of file).
2. **Compute discriminator triplet** (canonical algorithm — see § "Discovery via **Test Specs:** field" below for the full rationale):

   The bounded read from Step 1 (the SI block content from `### SI-NN.X` until the next `### SI-` or EOF) is the canonical extraction mechanism. The pseudo-code below is illustrative and uses awk only to make the field-extraction logic concrete; the LLM may use the Read-tool excerpt instead.

   ```bash
   # Inputs: $SI_HEADER_LINE = the matched header from `Grep -n '^### SI-'` output
   # (e.g., "42:### SI-03.5b — Signup screen (logic & wiring)")
   SI_HEADER=$(echo "$SI_HEADER_LINE" | sed -E 's/^[0-9]+://')
   N=$(echo "$SI_HEADER" | sed -E 's|^### SI-([0-9]+)\.[0-9a-z.]+.*|\1|')   # ex: "03"
   Y=$(echo "$SI_HEADER" | sed -E 's|^### SI-[0-9]+\.([0-9a-z.]+).*|\1|')    # ex: "5" or "5b"

   # Bounded slice of this SI's content (already obtained via Read in Step 1; awk shown for clarity):
   SI_BLOCK=$(awk "/^### SI-${N}\\.${Y}/,/^### SI-/" "$PLAN")

   HAS_TEST_SPECS=$(echo "$SI_BLOCK" | grep -c "^\*\*Test Specs:\*\*")
   HAS_ROUTE=$(echo "$SI_BLOCK" | grep -cE "^\*\*Route:\*\* (GET|POST|PUT|PATCH|DELETE) /")
   SI_ID="SI-${N}.${Y}"
   TITLE=$(echo "$SI_BLOCK" | head -1)
   IS_CROSS_LAYER=$(echo "$TITLE" | grep -c '(cross-layer)')
   ```

3. **Classify** per the discriminator table:

   | Case | HAS_TEST_SPECS | HAS_ROUTE | SI_ID shape | `(cross-layer)` in title | Inferred subproject |
   |---|---|---|---|---|---|
   | Skip — not screen/controller wiring | 0 | * | any | * | n/a (skip silently) |
   | **Frontend Xb** | 1 | 0 | ends in `b` (e.g., `SI-03.5b`) | * | `frontend` (Playwright) |
   | **Backend controller wiring** | 1 | 1 | plain `SI-NN.X` or `SI-NN.X.Y` (no letter) | * | `backend` |
   | **Cross-layer** | 1 | 0 | plain `SI-NN.X` (no letter, no Route) | yes | emit BOTH frontend + backend specs |
   | (impossible by construction) | 1 | 1 | ends in `b` | * | assert + abort |
   | **FALL-THROUGH** | 1 | 0 | plain `SI-NN.X` without letter **OR** shape `SI-NN.X.0` (drift audit-SI) | no | abort with actionable message (see below) |

   Fall-through abort message:

   ```
   SI-NN.X has **Test Specs:** but does not match any valid case
   (no 'b' suffix, no **Route:**, no '(cross-layer)' keyword in the title;
   OR shape SI-NN.X.0 — audit-SIs must never carry a **Test Specs:** field
   by construction, see phase-b.md § "Which SIs receive the placeholder").
   Invalid state by construction — investigate placeholder emission in phase-b.md/phase-c.md.
   Likely a bug in /plan-build.
   Run /plan-build <slug> --rebuild OR manually remove the **Test Specs:** field from the SI before retry.
   ```

4. **Resolve spec path(s) for this SI:**

   The default path is `<subproject>/specs/<feature>.plan.md` where `<subproject>` is the relevant subproject directory (resolved from the plan frontmatter's `affected_subprojects:` field — the entry that plays the frontend or backend role for the SI). Per-case:

   - **Frontend Xb (single subproject):**
     - `<subproject>` = the frontend subproject directory; `<feature>` is derived from the SI title's screen name (kebab-cased, no spaces, no special chars).
     - If `**Test Specs:**` is already populated (`see \`<path>\``), trust the path verbatim — user may have customized it.
   - **Backend controller wiring (single subproject):**
     - `<subproject>` = the backend subproject directory; `<feature>` derives from the route's resource name (e.g., `POST /auth/register` → `auth-register`).
   - **Cross-layer (dual subproject):** emit BOTH `<frontend-subproject>/specs/<feature>.plan.md` and `<backend-subproject>/specs/<feature>.plan.md`.

   **Resolving the role-to-directory mapping:** `affected_subprojects:` lists directory names but does NOT label which one plays the frontend/backend role. Discover the mapping in this order:

   1. Inspect the directory's layout and dependency manifest for framework markers — entry-point conventions, framework-specific config files, and routing structure (e.g., a Next.js `app/` or `pages/` layout signals frontend; a Vite + React entry signals frontend; a NestJS-style controllers/modules layout signals backend; a Django `manage.py` or a Spring Boot `pom.xml` signals backend) — to infer the role unambiguously.
   2. Cross-reference `docs/project-plan.md`'s `### Subprojects` section, which typically annotates each subproject's role.
   3. **If the mapping is still ambiguous** (e.g., two backend candidates, or a stack-agnostic name like `app/`), ask the user via `AskUserQuestion` before resolving the path. Do not guess — writing a spec to the wrong directory is silent corruption.

5. **Read existing spec(s)** if any. Do a single Read per spec file (full content — specs are small, ~100-200 lines). Cross-layer iterates twice.

6. **Compute lifecycle state per scenario** of the spec — the per-scenario classification feeds the delta report:

   | State | Detection | Decision in Stage 3 |
   |---|---|---|
   | **NEW** | Plan AC with no covering scenario | Generate scenario; mark `Source: auto`; set `Last sync` to the operation timestamp |
   | **PRESERVED** | Scenario exists; source mtime (phase plan) ≤ scenario's `Last sync` | Re-stamp `Last sync` (surgical Edit replaces only the line) — updates file mtime as a side-effect |
   | **MANUAL** | Scenario with `Source: manual` or no `Source` field | Skip silently (do not touch the file; user owns it) |
   | **UPDATED** | Scenario with `Source: auto` AND plan mtime > `Last sync` | Warning only (v1) |
   | **DELETED** | Scenario with `Source: auto` covering only ACs that disappeared from the plan | Warning only (v1) |
   | **ORPHAN** | `Covers AC: #N` points to a non-existent AC in the SI | Warning only (v1) |

   **Comparison mechanism (PRESERVED vs UPDATED).** The plan's `mtime` from `stat -c %Y` is an integer (Unix epoch seconds); each scenario's `Last sync` is an ISO-8601 string (e.g. `2026-05-02T14:30:00Z`). Both must be normalized to epoch integers before comparison:

   ```bash
   PLAN_MTIME=$(stat -c %Y "$PLAN")
   LAST_SYNC_EPOCH=$(date -u -d "$LAST_SYNC_ISO" +%s)
   if [ "$PLAN_MTIME" -le "$LAST_SYNC_EPOCH" ]; then echo PRESERVED; else echo UPDATED; fi
   ```

   Date-only comparison (e.g., `2026-05-02 > 2026-04-29`) is **insufficient** — same-day edits would be silently misclassified as PRESERVED.

7. **Coverage gate** (warnings, never abort):

   ```
   ACs_SI         = all Acceptance criteria lines of the SI
   ACs_in_spec    = union of **Covers AC:** fields from ALL scenarios in ALL specs of the SI
   ACs_no_spec    = ACs_SI \ ACs_in_spec
   ```

   For cross-layer specifically: the union between frontend.plan.md + backend.plan.md covers the SI. Warning fires only if some AC remains uncovered in BOTH specs.

   `ACs_no_spec ≠ ∅` → warning in the delta report. Reason: many ACs may be legitimately covered by Unit/Integration rows in the SI's Tests table; v1 does not infer that coverage.

8. **Accumulate** per-spec:
   - List of (state, scenario_id, AC_set) tuples.
   - Coverage gap (`ACs_no_spec`).
   - Whether any Edit will fire in Stage 3 (PRESERVED re-stamp ou NEW append).

### Stage 2 — Surface delta report

Emit a single block to user (no `AskUserQuestion` in v1 — informational only):

```
/plan-test-specs: delta report for <slug>

Per-spec breakdown:

  <frontend-subproject>/specs/signup.plan.md (frontend, SI-03.5b)
    NEW:        2 scenarios
    PRESERVED:  3 scenarios (Last sync re-stamp)
    UPDATED:    0
    MANUAL:     0
    Coverage:   AC #1, #2, #3, #4 covered ✓

  <backend-subproject>/specs/auth-register.plan.md (backend, SI-03.3)
    NEW:        1 scenario
    PRESERVED:  0
    UPDATED:    1 (warning — review manually)
    MANUAL:     0
    Coverage:   AC #5 not covered (warning)

Warnings:
  - SI-03.3 spec has 1 UPDATED scenario: source mtime (2026-05-02) > Last sync (2026-04-29).
    Resolutions: (a) edit content + manually update Last sync; (b) mark Source: manual.
  - SI-03.3 AC #5 not covered by any spec scenario. Add a scenario OR ensure Tests table
    Unit/Integration row covers it (v1 does not track cross-source coverage).

Apply pass: will emit 3 NEW scenarios + 3 Last sync re-stamps + 1 no-op file mtime bump.
```

### Stage 3 — Apply NEW + re-stamp PRESERVED + no-op bump

For each spec file:

1. **NEW state per scenario**: Edit (or Write if file does not exist) — append a new `#### N.M. <kebab-name>` block under the appropriate `### N. <Group Name>` section. Frontmatter is initialized on Write (first NEW per file). Each NEW scenario gets:

   ```markdown
   #### 1.2. <kebab-case-name>

   **Covers AC:** #2
   **Source:** auto
   **Last sync:** 2026-05-02T14:30:00Z

   **Steps:**
     1. <user-actor or API-caller voice — depending on subproject>
       - expect: <observable outcome>
   ```

   Starting material comes from the UI Contract section (frontend) or the API Contract section (backend) — author-interpreted but deterministic (same prompts → same outputs).

2. **PRESERVED state per scenario**: surgical Edit replaces only the `**Last sync:** <old-iso>` line with `**Last sync:** <current-iso>`. Scenario content stays intact.

3. **MANUAL / UPDATED / DELETED / ORPHAN state**: skip — warning emitted in Stage 2 already reported, but Stage 3 does not touch content.

4. **Update `**Test Specs:**` field in the plan if it still contains `_pending_`** (regardless of which state classified the scenarios). The trigger is "field is still pending", NOT "we just generated a NEW scenario" — otherwise, a `--rebuild` that regenerates the plan with `_pending_` placeholder and immediately afterwards runs `/plan-test-specs` (all scenarios classified PRESERVED or UPDATED) would fall into an infinite deadlock: `/implement` aborts `PENDING TEST SPECS`, user runs `/plan-test-specs`, no NEW, field never repairs.

   Algorithm:

   ```bash
   # For each spec path resolved in Stage 1 Step 4 (regardless of lifecycle state distribution):
   if grep -q "^\*\*Test Specs:\*\* _pending" <SI_BLOCK_in_PLAN>; then
     # Surgical Edit in the plan: replace `_pending /plan-test-specs_` with populated form
     # Single-subproject:    `see \`<spec-path>\``
     # Cross-layer:           `see \`<frontend-path>\`, \`<backend-path>\``
   fi
   ```

   `_pending_` placeholder → `see \`<spec-path>\`` populated form. Single-subproject SI → 1 path; cross-layer SI → 2 paths comma-separated. Surgical Edit in the plan. Populated form:

   ```markdown
   **Test Specs:** see `<frontend-subproject>/specs/<feature>.plan.md`
   ```

   Cross-layer (subproject names resolved per Step 4 above — including the role-to-directory ask-user fallback):

   ```markdown
   **Test Specs:** see `<frontend-subproject>/specs/<feature>.plan.md`, `<backend-subproject>/specs/<feature>.plan.md`
   ```

   If the field is already populated (`see ...`), skip — already done in a prior `/plan-test-specs` run.

5. **Edge case — non-content-touching specs (zero NEW + zero PRESERVED Edits).** When ALL scenarios of a spec end up in **UPDATED / MANUAL / DELETED / ORPHAN** states, no content-bearing Edit fires and the file mtime stays old → /implement preflight aborts STALE even after /plan-test-specs has run. **Mandatory mitigation (applies even to all-MANUAL specs):** emit a **no-op Edit in the spec frontmatter** (idempotent substitution of the field's own current value — read the frontmatter, pick a stable line, and substitute it with itself) just to bump the file mtime. Example: for a frontend spec, replace `subproject: frontend` with `subproject: frontend`; for a backend spec, replace `subproject: backend` with `subproject: backend`. **Use the field's current value, not a hardcoded literal** — substituting `subproject: backend` with `subproject: frontend` would corrupt the spec and break runner detection in `/implement` Step 3a. The frontmatter bump **does NOT violate** the "user is owner of MANUAL content" invariant because no scenario has its body touched — the only change is file metadata. Equivalent alternative: `Bash touch <spec-path>`. The skill **chooses the no-op Edit** (does not require Bash dispatch). This is the canonical mitigation for the **MANUAL deadlock**: without it, all-MANUAL specs would cause an infinite loop (`/implement` aborts STALE → user runs `/plan-test-specs` → MANUAL skips silently → file mtime still old → `/implement` aborts STALE again).

### Stage 4 — Output summary

Emit a single block:

```
DONE. /plan-test-specs <slug>:
  Test specs created: <list of NEW spec file paths>
  Test specs updated: <list of files with NEW or re-stamped scenarios>
  Test specs mtime-bumped only: <list of files where ALL scenarios are MANUAL/UPDATED/DELETED/ORPHAN — no content edit, only no-op frontmatter bump from Stage 3 Step 5>
  Warnings: <count>

Next: run /implement <slug> to execute the plan with these specs.
```

If warnings count > 0, ensure the report references the line numbers (or just the warning text) emitted in Stage 2.

## Spec format (universal)

The spec file is **NOT** a planning artifact — it does not follow `kind:` / `name:` convention from `.claude/skills/plan-pipeline/SKILL.md`. Specs are test contracts, parallel to `library-refs.md` exemption.

```markdown
---
subproject: backend | frontend       # canonical runner discriminator (consumed by /implement Step 3a)
runner: <runner-tag>                 # informational only — `playwright` for frontend; per-backend runner tag for backend (e.g., `jest+supertest`, `pytest`, `gotest`); must match `subproject:`; `subproject:` is canonical
scope: phase-NN-{slug} | task-{slug}
si: SI-NN.X | SI-N
target_file: <resolved E2E test path>         # 1 test file per spec; scenarios become test() blocks.
                                              # Concrete path (folder + suffix + name) derived from the subproject's
                                              # E2E convention via testing-guide-{subproject} and resolved by
                                              # /plan-test-specs at generation time — do NOT hardcode folder/suffix here.
---

# <Screen | Endpoint> Test Plan

## Application Overview

<One paragraph describing what this screen / endpoint does and why.>

## Test Scenarios

### 1. <Group Name — verbatim from screen-inventory ou API Contract>

**Setup:** <fixture reference (frontend) | DB cleanup + module bootstrap (backend)>

#### 1.1. <kebab-case-scenario-name>

**Covers AC:** #1, #4
**Source:** auto
**Last sync:** 2026-05-02T14:30:00Z

**Steps:**
  1. <user-actor or API-caller voice — depending on subproject>
    - expect: <observable outcome>
    - expect: <another outcome>
  2. <next step>
    - expect: <outcome>
```

### File-naming convention

- **1 spec → 1 test file**, declared via `target_file:` in the frontmatter. The concrete path (folder + suffix + name) is derived from the subproject's E2E convention via `testing-guide-{subproject}` (see Reason below) and resolved by `/plan-test-specs` at generation time — this skill does NOT fix folder or suffix.
- **N scenarios in the spec → N `test()` blocks** inside a single `test.describe('<feature>')` in the generated file.
- An individual scenario does NOT have a `**File:**` field — the path is shared via `target_file:`.

Reason: the project's frontend testing convention is *"one file per feature/flow"* with `test.describe('<feature>')` grouping. Adopting 1 file per scenario (Microsoft canonical) would violate that rule. The `testing-guide-{subproject}` Skill (loaded by `/implement` Step 2 for the frontend subproject) is the canonical entry point for that convention. It is also the single source of truth for the `target_file:` path itself (folder + suffix per subproject); `/plan-test-specs` reads that convention at generation time and writes a concrete `target_file:` — no folder or suffix is hardcoded in this skill.

### Per-subproject vocabulary

| Field / Voice | Frontend | Backend |
|---|---|---|
| `Setup:` | `<frontend-subproject>/tests/fixtures.ts` (MSW network fixture auto-applied) | `beforeEach` truncate test DB; bootstrap backend test module (e.g., NestJS: `Test.createTestingModule(...).compile()`) |
| Step voice | "User clicks Sign in" (user-actor) | "POST /auth/register with body X" (API-caller) |
| Expect vocabulary | DOM-observable + URL state + toast text | HTTP status + response body shape + DB state + side-effects |
| File path (per spec) | per `testing-guide-frontend` E2E convention — resolved at generation, no folder/suffix hardcoded here | per `testing-guide-backend` E2E convention — idem |
| Import in generated test | the MSW network fixture, imported from its path per `testing-guide-frontend` (NEVER `'@playwright/test'`) | backend test bootstrap module + HTTP client (e.g., NestJS `Test` module + Supertest) |

### Boundary — what externalizes vs stays inline

| Layer | Location | Reason |
|---|---|---|
| Playwright E2E (frontend) | `<frontend-subproject>/specs/*.plan.md` | externalized |
| E2E (backend) | `<backend-subproject>/specs/*.plan.md` | externalized |
| Unit (frontend) | inline in the SI's Tests table | stays inline |
| Integration (frontend — e.g., Route Handlers / msw/node) | inline in the SI's Tests table | stays inline |
| MSW handler tests (`auth-handlers.spec.ts`) | inline in its own SI | stays inline (not screen wiring) |
| Unit (backend — services / repos) | inline in the SI's Tests table | stays inline |
| Backend integration (ORM repos / modules — e.g., TypeORM, Prisma, SQLAlchemy, Hibernate) | inline in the SI's Tests table | stays inline |

## Lifecycle states (MVP — L2 revisado)

| State | Detection | v1 action |
|---|---|---|
| **NEW** | Plan AC with no covering scenario | generate scenario, mark `Source: auto`, set `Last sync` to the operation timestamp |
| **PRESERVED** | Scenario exists; source mtime (phase plan) ≤ scenario's `Last sync` | re-stamp Last sync (surgical Edit replaces only the line) — updates file mtime as a side-effect |
| **MANUAL** | Scenario with `Source: manual` or no `Source` field | skip silently |
| **UPDATED** | Scenario with `Source: auto` AND plan mtime > `Last sync` | warning in the delta report; user edits by hand |
| **DELETED** | Scenario with `Source: auto` covering only ACs that disappeared from the plan | warning in the delta report |
| **ORPHAN** | `Covers AC: #N` points to a non-existent AC in the current SI | warning in the delta report |

**Critical — PRESERVED and file mtime.** `/implement`'s preflight checks **file mtime** (`stat -c %Y`) vs plan mtime. If PRESERVED skipped silently, file mtime would stay old and preflight would falsely abort STALE. That's why PRESERVED **emits an Edit** even with OK content — the Edit naturally updates file mtime. This is the operation that makes the canonical sequence `/plan-build` (append) → `/plan-test-specs` → `/implement` functional.

**MANUAL state — content untouched, but frontmatter bump still fires when ALL scenarios are MANUAL.** The skill respects user-as-owner-of-scenario: it does NOT modify a MANUAL scenario's body or add/change adjacent scenarios. **But** if ALL scenarios in the spec are MANUAL (i.e., zero NEW + zero PRESERVED content-bearing Edits fired), the no-op frontmatter Edit from Stage 3 Step 5 fires anyway — just to bump file mtime and satisfy `/implement` preflight. This eliminates the deadlock where all-MANUAL specs would cause an infinite loop. When the spec has a mix of states (e.g., 2 NEW + 3 MANUAL), the NEW Edits naturally bump mtime; the no-op Step 5 only fires when the Edit set is empty.

**Known limitation — UPDATED state overdetection by global file mtime.** `mtime of plan` is file-level. If the user edits an independent backend SI, mtime rises and EVERY auto spec covering any SI is classified UPDATED. v1 treats all UPDATED via warning; v2 considers per-SI mtime via parsing Revisions blocks per SI.

**CONFLICTED state** (auto-generated + user-edited + source changed) is deferred to v2 — requires hash-based detection that adds complexity not justified in the MVP.

## Discovery via `**Test Specs:**` field

The presence of `**Test Specs:**` field is the **trigger** (decides whether /plan-test-specs processes the SI). The **discriminator** is the SI_ID-shape + HAS_ROUTE combo, NOT `**Figma:**` (Xa-only field).

**Why NOT use `**Figma:**`:** the Xb template (`screen-si.md`) does NOT include `**Figma:**` — only Xa does. Using HAS_FIGMA would classify Xb (frontend genuine) as backend. Correct discriminator: SI_ID shape (`b` suffix = frontend Xb) + presence of `**Route:**` whose value **starts with an HTTP method** (regex `^\*\*Route:\*\* (GET|POST|PUT|PATCH|DELETE) /`) = backend controller wiring. **Important:** SI-Xa also has a `**Route:**` field, but with only the URL path (e.g., `**Route:** /signup`) — no HTTP method prefix. The regex above does not fire on SI-Xa, so HAS_ROUTE=0 and Xa is not misclassified as backend. SI-Xa also does not receive `**Test Specs:**` (HAS_TEST_SPECS=0), so it is skipped in case 1 of the table ("Skip — not screen/controller wiring").

**Cross-layer keyword is byte-verbatim binding (v1).** The cross-layer case matches the title via literal match of `(cross-layer)` (parenthesis, lowercase, hyphen, no variants). Variants not supported in v1: capitalized `Cross-layer`, `(Cross-Layer)`, synonyms like "full-stack flow". Phase-b.md emit rules and this SKILL must prescribe **literally** "use `(cross-layer)` lowercase in parentheses at the end of the SI title".

## Integration points

- **plan-pipeline overview** — `/plan-test-specs` is Stage 5 (linked back from `.claude/skills/plan-pipeline/SKILL.md`).
- **plan-build** — emits `**Test Specs:** _pending /plan-test-specs_` placeholder in Xb / controller wiring / cross-layer SIs (phase-b.md, phase-c.md, screen-si.md) and `test_specs_aware: true` in the frontmatter (phase-a.md). Output contract B7/C7 emits a conditional hint to invoke /plan-test-specs. **Trigger discriminator** (the placeholder string itself) is canonical — `/plan-test-specs` preflight greps for `^\*\*Test Specs:\*\* _pending` to count placeholders; `/implement` preflight uses the same regex.
- **implement** — consumes specs JIT at Step 3a (reads the spec, LLM-authors the test file in a single pass; **1 spec → 1 file with N `test()` blocks**). Frontend: invokes `Skill playwright-cli` to load pattern references (test-generation.md, request-mocking.md, element-attributes.md) into the LLM context — does NOT invoke Section 2 interactive workflow nor `Bash playwright-cli generate` (non-existent subcommand). Backend: LLM-authored directly; what-to-test and best practices per artifact come from the `testing-guide-{subproject}` Skill (already loaded at `/implement` Step 2 for the backend subproject). Modern preflight aborts with `MISSING` / `STALE` / `PENDING TEST SPECS` (see implement Skill § "Preflight").
- **plan-validate** — **NO CHANGE.** Plan-validate continues to operate only on `context.md`. No spec-related checks; spec-related gates live in /plan-test-specs (delta report) and /implement preflight. Documented in `docs/plan-spec-driven-test-skill.md` § "NO CHANGE".

## Failure modes + abort messages

| Scenario | Detection | Message |
|---|---|---|
| Plan does not exist | stat fail | `Plan does not exist at <path>. Check whether /plan-build has already run for <slug>.` |
| Legacy plan | `test_specs_aware` absent from frontmatter | `Plan <slug> is in legacy mode. To migrate: run '/plan-build <slug> --rebuild' first to regenerate in the new format, then rerun /plan-test-specs.` |
| Modern plan with no **Test Specs:** SI | `grep -c "^\*\*Test Specs:\*\*"` = 0 | Silent no-op exit. (Not an error — pure backend phase or foundations-only.) |
| SI Xb with `**Route:**` (impossible by construction) | discriminator case 5 | `SI-NN.X ends in 'b' AND has **Route:**. Invalid state by construction — Xb never has Route. Investigate emission in phase-b.md. Likely a bug.` |
| Fall-through (plain SI, no Route, no cross-layer) | discriminator FALL-THROUGH | `SI-NN.X has **Test Specs:** but does not match any valid case. Run /plan-build <slug> --rebuild OR manually remove the **Test Specs:** field from the SI before retry.` |
| Spec file malformed Covers AC | parse fail | `Scenario <id> in <spec-path> has malformed **Covers AC:**: '<line>'. Expected: '#<int>(, #<int>)*'. Edit manually and rerun.` |

## Coverage gate semantics (v1 reduzido)

Stage 1 step 7 builds two sets considering the scenarios in all specs referenced by the SI:

```
ACs_SI         = all Acceptance criteria lines of the SI
ACs_in_spec    = union of **Covers AC:** from ALL scenarios in ALL specs
                 referenced by the SI's `**Test Specs:**` field
ACs_no_spec    = ACs_SI \ ACs_in_spec
```

For cross-layer specifically: each spec (frontend.plan.md, backend.plan.md) has scenarios covering a subset of ACs. SI coverage = union of `**Covers AC:**` from both. Warning fires only if some AC remains uncovered in BOTH.

`ACs_no_spec ≠ ∅` → **warning** (not an error). Reason: many ACs legitimately covered by Unit/Integration rows in the SI's Tests section; v1 does not infer that coverage without an annotation convention.

**v1 explicitly does NOT force:**
- `(covers AC #N)` convention in Tests section rows.
- Cross-source coverage (spec scenarios + Tests section rows).
- Abort on incomplete coverage — always warning, never abort.

**v2 (under demand)** may add `**Covers AC:** #N, #M` as an additional column in the Tests section; coverage = union {Tests rows covers} ∪ {spec scenarios covers}.

## Out-of-scope (v1 vs v2)

**v1 implements:** default mode (analyze + apply NEW + re-stamp PRESERVED), MANUAL skip (with no-op frontmatter bump when ALL-MANUAL to avoid STALE deadlock), UPDATED/DELETED/ORPHAN warnings, single + cross-layer specs, no-op bump for non-content-touching specs, legacy abort, no-op exit on modern without Specs.

**v2 (under demand):**
- `--reconcile` mode with `AskUserQuestion` per delta (UPDATED/DELETED/ORPHAN).
- `--force-regen <scenario>` override.
- `--strict` flag (turns coverage gate warnings into hard aborts).
- `--analyze` dedicated flag (v1: default mode is already analyze + apply NEW; user reruns after editing).
- Auto-deletion of ORPHAN scenarios.
- CONFLICTED state detection (hash of auto-generated content).
- Tests section convention `(covers AC #N)` for cross-source coverage.
- Heal phase (Microsoft Section 3) integration in /implement.
- App exploration during /plan-test-specs via Microsoft Section 1.3 commands.
- Backend equivalent of `playwright-cli` (does not exist; will remain manual indefinitely).
- Cross-spec coverage reports.
- v2 structural marker `**Cross-layer:** true` field — would eliminate the fragility of the byte-verbatim `(cross-layer)` keyword.
- Per-SI mtime tracking via parsing of Revisions blocks (mitigates UPDATED overdetection).
