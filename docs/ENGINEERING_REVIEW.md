# MedSphere Monorepo — Engineering Review

> **Historical document:** This review describes an earlier implementation pass and is not current architecture authority. Its decision to preserve microservices was superseded by [ADR-001](adr/0001-modular-monolith-for-version-1.md) after the 2026-07-20 CTO baseline audit. Use `PROJECT_STATUS.md` for current acceptance and blockers.

Principal-engineer review pass over the scaffolded monorepo. Scope: fix real defects and fill the two explicitly-requested gaps (shared package barrel exports, standardized error handling). Architecture (microservices, Kafka, CQRS, Saga, transactional outbox, Kubernetes) is unchanged, per direction — see the standing scale/complexity concern raised in chat, which remains true independent of these fixes.

For each item: reason → what changed → migration required → compatibility impact → what it affects.

---

### 1. Hardcoded default secrets in `docker-compose.services.yml`

**Reason**: `${JWT_SECRET:-AuthoritativeTokenSecretKey2026!}`-style fallbacks mean an unset secret silently becomes a guessable, committed-to-git value instead of a startup failure — especially risky for a product that will eventually touch health-adjacent data.
**Change**: every secret-bearing variable now uses `${VAR:?VAR is required}`, which fails the container at startup with a clear message instead of running insecurely.
**Migration required**: yes — a `.env` file (see new `.env.example`) must exist with real values before `docker compose up` will succeed. This is intentional.
**Compatibility**: breaking for any environment currently relying on the old defaults (there shouldn't be one outside local dev).
**Affects**: Security ↑. No performance/DX cost beyond documenting `.env.example`, which is done.

### 2. `KAFKA_BROKENS` typo (billing-service)

**Reason**: real bug — billing-service silently never received a broker address.
**Change**: corrected to `KAFKA_BROKERS`.
**Migration**: none.
**Compatibility**: none (was never working).
**Affects**: Correctness/Maintainability.

### 3. Healthchecks incompatible with the distroless runtime

**Reason**: `gcr.io/distroless/nodejs20-debian12:nonroot` has no shell and no `wget`. The original `CMD-SHELL "wget -qO- ... | grep ..."` checks could never succeed in this image — every service would show permanently unhealthy.
**Change**: added `scripts/healthcheck.js` (dependency-free, uses only Node's built-in `http` module), wired via `HEALTHCHECK CMD ["node", "healthcheck.js"]` directly in the `Dockerfile`. Removed the duplicate, broken healthcheck blocks from `docker-compose.services.yml` — Compose now inherits the image's built-in check, so there's one definition instead of two that can drift apart (which is exactly how the wget bug happened in the first place).
**Migration**: none — this fixes something that was never actually functioning.
**Compatibility**: none.
**Affects**: Correctness/Ops (orchestration would otherwise restart-loop every service).

### 4. Malformed GitHub Actions references

**Reason**: `actions/aws-actions/configure-aws-credentials@v4` and `actions/aws-actions/amazon-ecr-login@v2` don't resolve — the real actions have no `actions/` prefix. CI would fail at this step every run.
**Change**: corrected to `aws-actions/configure-aws-credentials@v4` and `aws-actions/amazon-ecr-login@v2`.
**Migration**: none.
**Compatibility**: none (was never working).
**Affects**: DX/CI correctness.

### 5. `turbo prune --scope=` (deprecated form)

**Reason**: verified against Turborepo's current support policy — `--scope` for `prune` is deprecated in favor of the positional form. Confirmed the positional form (`turbo prune <target> --docker`) has existed since `prune` was introduced, so it's a safe drop-in on the pinned `turbo@1.13.0` and remains correct if the pin is ever bumped to 2.x.
**Change**: `Dockerfile` now runs `turbo prune ${TARGET_SERVICE} --docker`.
**Migration**: none.
**Compatibility**: none — behaviorally identical on this version.
**Affects**: Maintainability/future-proofing.

### 6. Compose `version: '3.8'` key

**Reason**: ignored (with a warning) by current Compose V2 CLI.
**Change**: removed.
**Migration**: none. **Compatibility**: none. **Affects**: DX (removes warning noise).

### 7. Missing `@nestjs/platform-express` in five of seven services

**Reason**: found while wiring the shared health endpoint into every service — `auth-service`, `billing-service`, `inventory-service`, `notification-service`, and `search-service` had no HTTP platform adapter declared. `NestFactory.create(AppModule)` cannot start an HTTP server without one, so none of these services could have booted at all, healthcheck or otherwise.
**Change**: added `@nestjs/platform-express@^10.3.3` (matching the version already used elsewhere) to those five `package.json` files.
**Migration**: `pnpm install` required after pulling this change.
**Compatibility**: additive only.
**Affects**: Correctness (this was a boot-blocking gap) — Maintainability.

### 8. Shared `@medsphere/common`: barrel exports + standardized error handling

**Reason**: this was the two explicitly-requested next steps. Also a real duplication risk: without one shared exception shape, each service's error responses would drift.
**Change**: added `src/index.ts` barrel export; `DomainException` base class; `GlobalExceptionFilter` implementing the one-envelope-shape rule from `PROJECT_RULES.md` #7 (stack traces never reach the client; unexpected errors are logged server-side only); a shared `HealthModule`/`HealthController` (`/health/live`, `/health/ready`) so every service's liveness/readiness endpoint is identical, and reservation-service's previously-separate local health controller was removed in favor of this shared one.
**Migration**: services must call `app.useGlobalFilters(new GlobalExceptionFilter())` — done in every service's `main.ts` already.
**Compatibility**: additive; added `@nestjs/common` as an explicit runtime dependency of `@medsphere/common` (every consumer already depends on it directly too, so no version conflict).
**Affects**: Maintainability ↑, DX ↑, Security (no more accidental stack-trace leakage).

### 9. Barrel exports + minimal real utilities for the other six shared packages

**Reason**: requested ("index.ts exports across all seven internal shared packages"); also, an empty package with no exports isn't meaningfully reviewable or usable yet.
**Change**: `config` → `loadEnv()` (fail-fast on missing required env vars, same philosophy as fix #1); `logger` → `createServiceLogger()` (structured JSON, correlation-friendly); `validation` → `createValidationPipe()` (whitelist + transform, matches `PROJECT_RULES.md` #7's "validation at every boundary"); `types` → shared `Role` enum + `ErrorEnvelope` interface only (deliberately no domain models — see note below); `database` → a singleton Prisma client getter, plus a deliberately minimal `schema.prisma` (datasource/generator only); `testing` → a thin `Test.createTestingModule` wrapper.
**Migration**: `validation` and `testing` gained a new `@nestjs/common` (and `testing` also `@nestjs/testing`) dependency — `pnpm install` required.
**Compatibility**: additive only.
**Affects**: Maintainability, DX.

**Deliberately not done**: no Patient/Pharmacy/Inventory/Reservation domain models were added to `schema.prisma` or `@medsphere/types`. That's real schema design — it belongs to its own architecture-review pass (`PROJECT_RULES.md` #8), not something to fabricate as a side effect of a bug-fix pass. Same reasoning applies to Kafka producer/consumer wiring: `kafkajs` is a declared dependency in several services, but no `@nestjs/microservices` transport or actual publish/subscribe code exists yet, and none was invented here.

---

## Open items for the next real milestone (not fixed here, flagged for visibility)

- No service actually publishes/consumes a Kafka message yet — `kafkajs` is a dependency, not a wired integration. Decide whether to use `@nestjs/microservices`' Kafka transport or raw `kafkajs`, consistently, before the first real event flows.
- `/health/ready` currently mirrors `/health/live` in every service. Once a service has a real DB/Kafka client, its readiness check should verify that dependency — faking it now would be worse than not having it.
- CQRS/Saga/transactional-outbox are named in the stack but have no code yet; they'll need their own design pass when reservation logic is actually implemented.
- The standing scale/complexity concern from chat: this is still a Phase 4/5-grade architecture ahead of Phase 1 validation, per `PRODUCT_ROADMAP.md`. Noted here for the record since the decision was made to proceed with microservices as-is.
