---
kind: task
name: task-openapi-docs-nestjs
test_specs_aware: true
sources_mtime:
  docs/tasks/task-openapi-docs-nestjs/context.md: "2026-05-12T15:45:10-03:00"
  docs/tasks/task-openapi-docs-nestjs/library-refs.md: "2026-05-12T14:29:23-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-05-12T15:39:23-03:00"
---

# task-openapi-docs-nestjs

## Objective

Implement OpenAPI documentation in the NestJS project — tooling, artifact strategy, and production exposure policy.

---

## Step Implementations

### SI-1 — Install `@nestjs/swagger` + configure CLI plugin

**Description:** Bring the official tooling decided in `openapi-docs-nestjs/TD-01` (`@nestjs/swagger` + CLI plugin with `classValidatorShim`) into `nestjs-project/` — the foundation that SI-2/SI-3/SI-4 consume.

**Technical actions:**

1. Install `@nestjs/swagger@^11.0.0` in `nestjs-project/package.json` (compatible with `@nestjs/core ^11.0.1` installed — per `openapi-docs-nestjs/TD-01`).
2. Add a `compilerOptions.plugins` block in `nestjs-project/nest-cli.json` with `name: "@nestjs/swagger"` and `options: { classValidatorShim: true, introspectComments: true, dtoFileNameSuffix: [".dto.ts", ".entity.ts"] }` (per `openapi-docs-nestjs/TD-01` Recommendation — preserves the `class-validator` stack already fixed in `phase-02-auth/TD-06`).

**Tests:** _(empty — Infra)_

**Dependencies:** none

**Acceptance criteria:**

- `npx tsc --noEmit` in `nestjs-project/` returns code `0` after the install (lib installs without type regression).
- `npm run build` emits `metadata.ts` alongside `dist/` (signal that the CLI plugin ran against existing DTOs).
- `node -e "require('@nestjs/swagger')"` loads without error inside the `nestjs-api` container.

---

### SI-2 — `swagger.config.ts` configuration + `SWAGGER_ENABLED` flag

**Description:** Materialize the exposure policy decided in `openapi-docs-nestjs/TD-03` as a dedicated config namespace, aligned with the `registerAs(...)` pattern inherited from phase 02 (`Inherited Conventions`). SI-3 reads this config to trigger the mount.

**Technical actions:**

1. Create `nestjs-project/src/config/swagger.config.ts` exporting `registerAs('swagger', () => ({ enabled: process.env.SWAGGER_ENABLED === 'true' }))` — follows the `Inherited Conventions` pattern (config-per-domain in `src/config/`).
2. Add a `SWAGGER_ENABLED: Joi.string().valid('true','false').default('false')` entry to the schema in `nestjs-project/src/config/env.validation.ts` — Joi rejects values outside the `true|false` pair, secure-by-default (aligns with `openapi-docs-nestjs/TD-03` defensive posture).
3. Register `swaggerConfig` in the `load: [...]` of `ConfigModule.forRoot(...)` in `nestjs-project/src/app.module.ts` (alongside the other project configs).

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `swagger.config.ts` | Unit: real lib (`@nestjs/config`) with test config — verifies that `enabled` is `true` when `SWAGGER_ENABLED='true'` and `false` for any other value (per Testing Requirements → "Service with configured lib") | `src/config/swagger.config.spec.ts` |
| `env.validation.ts` | Integration: Joi schema with invalid `SWAGGER_ENABLED` fails boot; with `'true'`/`'false'` it passes (per Testing Requirements → "Module with configured imports") | `src/config/env.validation.integration-spec.ts` |

**Dependencies:** SI-1 _(the lib must be installed for `app.module.ts` to compile with the config registered)_

**Acceptance criteria:**

- Loading `swaggerConfig` via `@Inject(swaggerConfig.KEY)` returns `{ enabled: true }` when `SWAGGER_ENABLED=true` is in the environment.
- Boot of the application with `SWAGGER_ENABLED=invalid` fails immediately with a Joi validation error referencing the `SWAGGER_ENABLED` key.
- Boot of the application without `SWAGGER_ENABLED` in the env works — Joi applies the default `'false'`, with no error.

---

### SI-3 — Build conditional Swagger UI runtime in `main.ts`

**Description:** Implement the runtime part of `openapi-docs-nestjs/TD-02` (Option C) gated by the flag defined in SI-2 — `DocumentBuilder` + `SwaggerModule.setup('api/docs', ...)` mounted only when `swagger.enabled === true`, per `openapi-docs-nestjs/TD-03`. The three endpoints `### API Contracts` (`/api/docs`, `/api/docs-json`, `/api/docs-yaml`) now exist.

**Technical actions:**

1. In `nestjs-project/src/main.ts`, after `NestFactory.create(AppModule)` and before `app.listen(...)`, read `app.get(swaggerConfig.KEY).enabled` and, when `true`, instantiate `DocumentBuilder().setTitle('StreamTube API').setDescription('StreamTube REST API').setVersion('1.0').addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token').build()` (per `openapi-docs-nestjs/TD-02` + library-refs § 1).
2. Load `await SwaggerModule.loadPluginMetadata((await import('./metadata')).default)` before `createDocument` — without this, the CLI plugin output (SI-1) is not injected into the document (per library-refs § 3).
3. Call `SwaggerModule.setup('api/docs', app, document, { customSiteTitle: 'StreamTube API Docs', swaggerOptions: { persistAuthorization: true } })` inside the `if (enabled)` branch — `## Technical Specifications → ### API Contracts → Conditional-mount contract` defines the expected semantics.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `main.ts` (Swagger mount) | E2E (Supertest) — boot the app with `SWAGGER_ENABLED=true` → `GET /api/docs` responds `200`/HTML; `GET /api/docs-json` responds `200`/JSON with `info.title === 'StreamTube API'`; `GET /api/docs-yaml` responds `200`/YAML | `test/swagger.e2e-spec.ts` |
| `main.ts` (gating) | E2E (Supertest) — boot the app without `SWAGGER_ENABLED` (or with `'false'`) → the three routes return `404` | (same file, second `describe`) |

**Dependencies:** SI-1, SI-2 _(SI-1 guarantees the lib + metadata.ts; SI-2 guarantees the injectable `swagger.enabled`)_

**Acceptance criteria:**

- With `SWAGGER_ENABLED=true`, `GET /api/docs` returns `200` with `Content-Type: text/html` and the body contains the title `StreamTube API Docs`.
- With `SWAGGER_ENABLED=true`, `GET /api/docs-json` returns `200` with `application/json` and the body is an OpenAPI 3.x document whose `info.title === 'StreamTube API'` and `components.securitySchemes['access-token']` declares `type: 'http', scheme: 'bearer', bearerFormat: 'JWT'`.
- With `SWAGGER_ENABLED=true`, `GET /api/docs-yaml` returns `200` with `application/yaml`.
- With `SWAGGER_ENABLED` absent or `'false'`, any of the three routes returns `404` (no Swagger header leakage).

---

### SI-4 — `openapi:export` script + `openapi.json` artifact

**Description:** Implement the static part of `openapi-docs-nestjs/TD-02` (Option C) — `nestjs-project/src/openapi-export.ts` instantiates `AppModule`, serializes the document via `JSON.stringify(document, null, 2)` into `nestjs-project/openapi.json`, and terminates without `app.listen`. Enables offline codegen for the future frontend (cross-layer contact point declared in TD-02).

**Technical actions:**

1. Create `nestjs-project/src/openapi-export.ts` with a `bootstrap` that calls `NestFactory.create(AppModule, { logger: false })`, mounts a `DocumentBuilder` identical to SI-3's (same `setTitle/setVersion/addBearerAuth`), calls `SwaggerModule.createDocument(app, document)`, writes `writeFileSync('openapi.json', JSON.stringify(document, null, 2))`, and ends with `await app.close()` (per library-refs § 6).
2. Add `"openapi:export": "ts-node -r tsconfig-paths/register src/openapi-export.ts"` to `nestjs-project/package.json` → `scripts` (per library-refs § 6).
3. Commit the initial `nestjs-project/openapi.json` produced by the first script run, so that PR diffs expose contract changes (per `openapi-docs-nestjs/TD-02` Recommendation — "correct foundation for future FE integration").

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `openapi-export.ts` | Integration: invokes the `exportSpec` function programmatically (no subprocess), writes to a temp path, reads the file, and asserts on `info.title === 'StreamTube API'`, `info.version === '1.0'`, and `components.securitySchemes['access-token']` present | `src/openapi-export.integration-spec.ts` |

**Dependencies:** SI-1 _(needs `@nestjs/swagger` + the metadata.ts emitted by the CLI plugin; the script reuses the loaded `AppModule`, independent of the `SWAGGER_ENABLED` state)_

**Acceptance criteria:**

- `docker compose exec nestjs-api npm run openapi:export` ends with exit code `0` and produces `nestjs-project/openapi.json`.
- `nestjs-project/openapi.json` is a valid OpenAPI 3.x document with `info.title === 'StreamTube API'` and `info.version === '1.0'`.
- The exported document contains `components.securitySchemes['access-token']` with `type: 'http'`, `scheme: 'bearer'`, `bearerFormat: 'JWT'` — mirroring SI-3's runtime.
- The exported document contains schemas inferred from existing DTOs (e.g., phase-02-auth DTOs) via the CLI plugin — verifies that `components.schemas` is non-empty.

---

### SI-5 — Enrich OpenAPI spec with explicit decorators on existing controllers/DTOs

**Description:** Materialize the 2026-05-12 Revision in `openapi-docs-nestjs/TD-01` — inference via the CLI plugin (`classValidatorShim: true`) covers only DTO schemas from `class-validator`, but operations, typed responses per status code, error contracts, and examples require explicit decorators. This SI iterates over the controllers already implemented in `nestjs-project/src/auth/` and `nestjs-project/src/users/` (delivered in phase-02-auth) annotating each endpoint with `@ApiOperation` (summary + description), `@ApiBody` when the body is typed, `@ApiParam`/`@ApiQuery` for parameters, and `@ApiResponse` covering the success status code + relevant errors aligned with the phase-02-auth/TD-07 envelope (`{ statusCode, error, message, code }`). Declares a shared error model via `@ApiExtraModels(ApiErrorEnvelope)` registered once in `DocumentBuilder` (or via `@ApiExtraModels` at the root of the affected controllers) and referenced in `@ApiResponse({ schema: { $ref: getSchemaPath(ApiErrorEnvelope) } })`.

**Technical actions:**

1. Create `nestjs-project/src/common/openapi/api-error-envelope.dto.ts` exporting an `ApiErrorEnvelope` class whose fields (`statusCode: number`, `error: string`, `message: string | string[]`, `code?: string`) are decorated with `@ApiProperty` — mirrors the envelope decided in `phase-02-auth/TD-07` (see `## Inherited Decisions Detail → phase-02-auth/TD-07` in the context). This class is the reusable schema referenced by all error `@ApiResponse`s.
2. Register `ApiErrorEnvelope` in `nestjs-project/src/swagger/swagger-document.ts` (the `buildSwaggerConfig` helper) via `SwaggerModule.createDocument(app, config, { extraModels: [ApiErrorEnvelope] })` — guarantees the schema appears in `components.schemas` even if no individual controller registers it with `@ApiExtraModels`.
3. Annotate `nestjs-project/src/auth/*.controller.ts` (signup/login/refresh/forgot-password/reset-password/confirm-email) and `nestjs-project/src/users/*.controller.ts` with `@ApiTags('auth' | 'users')` at the controller-level + per endpoint: `@ApiOperation({ summary, description })`, `@ApiBody({ type: <ExistingDto> })` (the CLI plugin already infers, but make it explicit when there are `examples`), `@ApiParam`/`@ApiQuery` when applicable, and multiple `@ApiResponse`s covering: (a) success status (200/201/204) with `type: <ResponseDto>` or `description`; (b) the documented errors each endpoint emits (400 validation, 401 unauthorized, 403 forbidden, 404 not found, 409 conflict, 429 throttler) using `{ status, description, schema: { $ref: getSchemaPath(ApiErrorEnvelope) } }`.
4. For endpoints protected by `JwtAuthGuard`, add `@ApiBearerAuth('access-token')` (the security scheme name already registered in the `DocumentBuilder` from SI-3). Public endpoints do not receive the decorator.
5. Re-run `npm run openapi:export` and review the `nestjs-project/openapi.json` diff before committing — confirm that each path has `summary`, `responses` per status code, and references to `#/components/schemas/ApiErrorEnvelope` in error responses.

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ApiErrorEnvelope` | Integration: extends the integration test of `openapi-export.ts` (SI-4) asserting: (a) `components.schemas.ApiErrorEnvelope` exists and has the expected properties; (b) at least one path has `responses['401'].content['application/json'].schema.$ref === '#/components/schemas/ApiErrorEnvelope'`; (c) protected auth/users endpoints have `security: [{ 'access-token': [] }]`; (d) documented endpoints have a non-empty `summary` | `src/openapi-export.integration-spec.ts` (extension) |

**Dependencies:** SI-1, SI-2, SI-3, SI-4 _(needs the tooling, config, runtime UI, and export script already in place; only annotates existing code and extends an integration test already created)._

**Acceptance criteria:**

- `nestjs-project/src/common/openapi/api-error-envelope.dto.ts` exists and exports `ApiErrorEnvelope` with 4 `@ApiProperty` (statusCode, error, message, code).
- `npm run openapi:export` regenerates `nestjs-project/openapi.json` and the diff shows: (a) a new `ApiErrorEnvelope` schema in `components.schemas`; (b) each endpoint in `/auth/*` and `/users/*` gained `summary`, ≥1 `responses` documenting the success case and ≥1 error; (c) protected endpoints have `security: [{ "access-token": [] }]`.
- `docker compose exec nestjs-api npm run test -- openapi-export.integration-spec` passes with the new assertions.
- `npx tsc --noEmit` exits 0 and `npm run lint` exits 0 after the annotations.

---

## Technical Specifications

### API Contracts

The task adds three meta/documentation endpoints exposed by `SwaggerModule.setup('api/docs', app, document, …)` and conditionally mounted per `openapi-docs-nestjs/TD-03` (Option B — dev/staging only). When the `SWAGGER_ENABLED` env flag is not `'true'`, none of these endpoints are mounted and requests return `404 Not Found` from the global Nest router.

#### GET /api/docs

Swagger UI (interactive HTML documentation) for the OpenAPI spec built in-process.

**Request:** none.

**Responses:**
- `200 OK` — `text/html`; Swagger UI page (`customSiteTitle: 'StreamTube API Docs'`, `swaggerOptions: { persistAuthorization: true }`).
- `404 Not Found` — when `SWAGGER_ENABLED !== 'true'` (production posture per `openapi-docs-nestjs/TD-03`).

**Auth:** public when mounted; the UI itself supports the `access-token` Bearer scheme declared in `DocumentBuilder` so an operator can authorize and exercise protected endpoints interactively.

#### GET /api/docs-json

OpenAPI 3.x specification in JSON form, served from the runtime in-memory document.

**Request:** none.

**Responses:**
- `200 OK` — `application/json`; OpenAPI document built by `SwaggerModule.createDocument(app, config)` with `DocumentBuilder` configured (`setTitle`, `setDescription`, `setVersion`, `addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')`).
- `404 Not Found` — when `SWAGGER_ENABLED !== 'true'`.

**Note:** This is the runtime side of `openapi-docs-nestjs/TD-02` (Option C — Both). The static-file counterpart is `nestjs-project/openapi.json`, produced by the `openapi:export` npm script and not served at any HTTP route.

#### GET /api/docs-yaml

OpenAPI 3.x specification in YAML form (sibling of `/api/docs-json`).

**Request:** none.

**Responses:**
- `200 OK` — `application/yaml`; same document as `/api/docs-json`, serialized as YAML by `@nestjs/swagger`.
- `404 Not Found` — when `SWAGGER_ENABLED !== 'true'`.

#### Conditional-mount contract

The three endpoints share a single mount switch: the `if (process.env.SWAGGER_ENABLED === 'true') { SwaggerModule.setup(...) }` guard in `nestjs-project/src/main.ts`. Per `openapi-docs-nestjs/TD-03`, the flag is `true` for development and staging environments and unset (or `false`) for production, where requests to `/api/docs*` MUST return `404`. The flag is validated by the existing Joi schema in `nestjs-project/src/config/env.validation.ts` (inherited convention from phase 02) so an invalid value fails fast at boot.

---

<!-- phase-a-complete -->

## Dependency Map

```
SI-1 (root — install lib + CLI plugin)
├── SI-2 — depends on SI-1 (config namespace needs the lib installed to compile `app.module.ts`)
│   └── SI-3 — depends on SI-1 + SI-2 (runtime mount needs @nestjs/swagger + injectable flag)
├── SI-4 — depends on SI-1 (export script reuses CLI plugin metadata; SWAGGER_ENABLED flag does not apply)
└── SI-5 — depends on SI-1, SI-2, SI-3, SI-4 (enriches spec via decorators; reuses runtime + export already in place; extends SI-4 integration test)
```

---

## Deliverables

- [ ] SI-1 — Install `@nestjs/swagger` + configure CLI plugin
- [ ] SI-2 — `swagger.config.ts` configuration + `SWAGGER_ENABLED` flag
- [ ] SI-3 — Build conditional Swagger UI runtime in `main.ts`
- [ ] SI-4 — `openapi:export` script + `openapi.json` artifact
- [ ] SI-5 — Enrich OpenAPI spec with explicit decorators on existing controllers/DTOs

**Full test suites:**

- [ ] Backend unit + integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] Backend E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type-check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] Lint passes (`docker compose exec nestjs-api npm run lint`)
- [ ] Build succeeds and emits `metadata.ts` alongside `dist/` (`docker compose exec nestjs-api npm run build`)
