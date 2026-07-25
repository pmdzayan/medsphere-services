# ADR-006: Supported Runtime and Secure HTTP Baseline

**Status:** Accepted

**Date:** 2026-07-25

**Decision owners:** MedSphere Project Owner and CTO

**Depends on:** ADR-001, ADR-003, ADR-004, ADR-005

## Context

The post-S0.5 architecture audit found known production dependency
vulnerabilities, NestJS throttler contract drift, missing HTTP security headers,
unsafe error/request-ID handling, default Prisma query logging, and three
unauthenticated prototype applications that Docker Compose could start as
ordinary services.

## Decision

- Version 1 moves as one compatible unit to Node.js 20 and NestJS 11.
- CI blocks moderate-or-higher production dependency advisories.
- Authentication throttling uses one Redis-side atomic window/block script and
  the complete NestJS throttler storage contract.
- Every HTTP application installs Helmet before other middleware or routes.
- Validation errors always return a bounded string; unsafe request IDs are
  dropped; server-side failure detail is never returned.
- Prisma query logging is disabled by default and cannot be enabled in
  production.
- Inventory, reservation, and search prototypes start only when
  `NODE_ENV=development` and
  `ENABLE_UNACCEPTED_PROTOTYPE_SERVICES=true`. Production, staging, test, and
  unspecified environments fail before Nest application creation.
- Compose places these rejected applications behind the explicit
  `unaccepted-prototypes` profile.

## Reason

Passing builds cannot compensate for vulnerable dependencies, inconsistent
framework contracts, sensitive logging, or unauthenticated applications that
can be started accidentally. The application process itself must fail closed;
gateway configuration alone is not a security boundary.

## Alternatives

- **Keep NestJS 10 and override every vulnerable dependency:** rejected because
  it creates an unsupported and fragile transitive graph.
- **Rely on the gateway to hide prototypes:** rejected because internal or
  direct deployment can bypass that assumption.
- **Delete all prototypes immediately:** deferred because S0.5 needs them for
  characterization and migration evidence.
- **Use in-memory rate limits:** rejected because counters diverge across
  instances and disappear on restart.

## Consequences

Positive consequences are a supported framework contract, zero known
production advisories at the checkpoint, deterministic shared throttling,
consistent HTTP protection, and fail-closed prototype execution.

Costs are a substantial lockfile change, explicit local prototype opt-in,
periodic override review, and mandatory PostgreSQL/Redis CI evidence.

## Implementation constraints

1. Frozen installation precedes the production audit.
2. PostgreSQL 16 and Redis 7 suites must execute without skips in CI.
3. Prototype checks run before `NestFactory.create`.
4. Prototype flags never enter production deployment manifests.
5. Request IDs never establish identity, tenancy, or authorization.
6. Query logging is restricted to sanitized local diagnostics.

## Review triggers

Review when Node 20 or NestJS 11 reaches end of support, Express is replaced,
an accepted inventory application replaces the prototypes, or rate limiting
moves to an external policy platform.
