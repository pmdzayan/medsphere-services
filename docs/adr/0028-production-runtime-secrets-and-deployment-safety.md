# ADR-0028: Production Runtime Configuration, Secret Isolation, and Deployment Safety Foundation

**Status:** Accepted

**Date:** 2026-09-07

**Decision owners:** AIM Project Owner and CTO

**Depends on:** ADR-001, ADR-003, ADR-004, ADR-006, ADR-027

## Context

AIM services require an explicit, repository-owned production configuration contract, secret injection boundary, container runtime isolation standards, component capability classification, and deployment safety procedure. Prior to this decision, runtime environment validation and scaffold classifications were incomplete across non-auth monorepo applications, risking accidental deployment of health-only scaffolds or secret leakage into build artifacts or error messages.

## Decision

1. **Composable Configuration Contract**: `@medsphere/config` is extended to fail fast when required environment variables are missing, blank, or whitespace-only. Configuration validation reports variable key names only and NEVER includes secret values or malformed input text.
2. **Explicit Component Classification**:
   - **Accepted Production-Capable Runtime**: `auth-service`
   - **Workers / Daemons Requiring Activation**: `notification-delivery.worker`, `notification-delivery.daemon`, `batch-expiry.worker`, `reservation-expiry.worker`
   - **Intentionally Prototype-Blocked Runtimes**: `inventory-service`, `reservation-service`, `search-service` (gated by `assertUnacceptedPrototypeRuntimeAllowed`)
   - **Health-Only Scaffolds / Not Application-Capable**: `api-gateway`, `billing-service`, `notification-service` (gated by `assertScaffoldRuntimeNotProduction`)
   - **Frontend Client**: `web`
3. **Secret Isolation Boundary**: Production secrets (`DATABASE_URL`, `REDIS_CLUSTER_URL`, `AUTH_JWT_PRIVATE_KEY_BASE64`, `AUTH_REFRESH_TOKEN_PEPPER`, `AUTH_OTP_PEPPER`, `ORG_JOIN_CODE_PEPPER`, `MSG91_AUTH_KEY`, `MEDSPHERE_NOTIFICATION_SMTP_URL`, `MEDSPHERE_OTLP_COLLECTOR_AUTH_HEADER`) remain strictly injected at runtime by external platforms. Secrets are forbidden in Docker layers, persistent Docker ARGs, `.env` files, git commits, `NEXT_PUBLIC_` frontend variables, logs, telemetry attributes, error messages, or CI artifacts. `.dockerignore` excludes all sensitive files from Docker context.
4. **Forbidden Production Flags**: `ENABLE_SWAGGER`, `ENABLE_TEST_VERIFICATION_PROVIDER`, `ENABLE_UNACCEPTED_PROTOTYPE_SERVICES`, `ENABLE_PRISMA_QUERY_LOGGING`, `RUN_AUTH_INFRASTRUCTURE_TESTS` remain strictly forbidden in `NODE_ENV=production`.
5. **Container Runtime Invariants**: Production containers enforce multi-stage pinned builds, distroless base images (`gcr.io/distroless/nodejs22-debian13:nonroot`), non-root execution (`USER nonroot:nonroot`), and Node-only liveness checks (`HEALTHCHECK CMD ["node", "healthcheck.js"]`).
6. **Release Identity Contract**: Bounded, non-secret build identity (`APP_VERSION`, full 40-character hexadecimal `RELEASE_SHA`, and existing `NODE_ENV`) is standardized and validated without exposing sensitive data.
7. **Deployment Sequence**: Safe deployment follows an immutable order of operations: approved release SHA verification -> immutable container build -> external secret injection -> config validation -> Task 0022 backup pre-flight verification -> append-only database migration -> health/readiness check -> smoke verification -> rollback boundary.

## Reason

A secure healthcare system requires defense-in-depth at the application runtime boundary. Relying on gateway assumptions or external infrastructure without fail-closed repository contracts creates security risks, secret leakage vulnerabilities, and operational instability.

## Consequences

- All runnable components have explicit, repository-certified capability classifications.
- Scaffold applications fail closed before execution in production.
- Configuration errors expose key names only, never values.
- Docker build context is protected against accidental file leakage via `.dockerignore`.
- Continuous Integration certifies the accepted production container runtime without requiring real cloud secrets.

## Review Triggers

Review when new applications transition from health scaffolds to accepted production-capable runtimes, or when an external policy orchestration engine replaces local runtime validation.
