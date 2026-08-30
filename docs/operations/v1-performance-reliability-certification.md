# V1 Performance & Reliability Certification

This document describes the automated certification that proves the
accepted AIM V1 runtime chain (Frontend BFF -> auth-service ->
PostgreSQL -> Redis) stays stable under controlled, genuinely concurrent
synthetic traffic. It is launch-hardening evidence, not a feature, and not
a promise about production capacity -- see "What this does NOT prove"
below.

## What is tested

```
A. Baseline health   -- backend live, backend ready (Postgres + Redis via
                         AuthReadinessService), Postgres directly reachable
B. Read traffic       -- bounded-concurrency authenticated dashboard shell,
                         RBAC catalogue, inventory stock read, and public
                         medicine search, round-robin
C. Mutation traffic    -- bounded-concurrency real reservation creation
                         (accepted API, real idempotency/concurrency
                         behavior and tenant-scoped persistence invariants
                         exercised)
E. Measurements        -- totals, error rate, throughput, average/p50/p95/
                         p99/max latency, all computed programmatically
F. Thresholds          -- fail-closed, non-zero exit on violation
G. Post-load           -- liveness, readiness, Postgres reachability, and
                         data-integrity assertions
```

Every read and mutation call reuses the exact accepted HTTP contracts
already proven by `scripts/task5-smoke-test.mjs` (registration, login,
dashboard shell, RBAC catalogue read, inventory stock read, public
medicine search, reservation creation) and the exact accepted direct-SQL
synthetic-fixture bootstrap pattern used there and in
`scripts/backup-restore-certification.mjs`. This is a second, narrowly
scoped tool for concurrency/timing/percentiles -- it does not duplicate or
compete with the existing functional-correctness harness.

## Concurrency profile

| Phase               | Workers | Operations                                 |
| ------------------- | ------- | ------------------------------------------ |
| Warm-up             | 5       | 20 (discarded from certified measurements) |
| Read (B)            | 20      | 160                                        |
| Mutation (C)        | 20      | 40                                         |
| **Total certified** |         | **200**                                    |

This matches the task's suggested V1 CI-safe profile exactly (20
concurrent workers, >= 200 total operations); nothing found during
repository inspection demonstrated a need to adjust it. The 4:1 read-to-
mutation ratio reflects realistic traffic shape (reads dominate) and
keeps the amount of synthetic stock the seed step must provision bounded
(`mutationOperations * 10` units, seeded fresh per run). Concurrency is
real, not simulated: a bounded worker-pool (`runWorkerPool`) starts all
workers together via `Promise.all`, each pulling the next task from a
shared queue as soon as its previous request settles -- not a sequential
loop labeled as load.

## Why a repository-native script instead of k6/Artillery/autocannon

The required concurrency (20 overlapping workers, ~200 HTTP requests) is
well within what Node's built-in `fetch` plus a small bounded worker-pool
already does correctly and measurably. Adding a new load-testing
dependency would add supply-chain surface and a second tool to keep
consistent with the repository's existing synthetic-fixture and HTTP-
contract conventions, for no capability this scale actually needs. See
`scripts/v1-performance-certification.mjs`'s `runWorkerPool` for the
~15-line implementation.

## Thresholds

| Metric                   | Threshold  |
| ------------------------ | ---------- |
| Error rate               | <= 1%      |
| p95 latency              | <= 1500 ms |
| p99 latency              | <= 3000 ms |
| Post-load readiness      | must PASS  |
| Post-load data integrity | must PASS  |

These are the task's suggested V1 CI thresholds, used as-is: nothing
observed during implementation or local validation demonstrated a need to
loosen them, and thresholds are never silently loosened just to obtain a
green run. **These are launch-certification thresholds for a CI-safe
synthetic profile, not a promise to customers about production latency
or availability.**

## Synthetic-data boundary

- A dedicated tenant, admin user, provider, product, inventory listing,
  and batch are created fresh for every run via the exact accepted
  direct-SQL bootstrap pattern (rows no accepted API can create: `Tenant`,
  the `SYSTEM` `TENANT_ADMINISTRATOR` role and its full permission grant,
  per the migration-authored invariant already cited in
  `scripts/task5-smoke-test.mjs`).
- The admin account itself is created through the **real accepted
  registration API**, then activated via the same documented bootstrap-
  only workaround already recorded in `scripts/task5-smoke-test.mjs` (no
  accepted self-service verification path exists yet).
- All values are synthetic: no real names, phone numbers, emails, or
  healthcare data. No production credentials are used or required.
- No real SMS, no real email, no external Maps/healthcare API, no
  production notification provider activation. Authentication and accepted
  provider authorization are exercised. Adversarial tenant-isolation
  authorization remains certified by the dedicated functional/security
  suites; this harness checks the narrower cross-tenant persistence invariant.
- Mutable synthetic workload rows are deleted after the run. Immutable
  AuditEvent/OutboxEvent evidence is deliberately retained; its synthetic
  tenant/user/membership lineage is deactivated instead of deleting or
  weakening append-only evidence protections.

## How to run locally

```bash
export DATABASE_URL='postgresql://medsphere_ci:medsphere_ci@localhost:5432/medsphere_ci?schema=public'
export FRONTEND_URL='http://localhost:3001'
export BACKEND_URL='http://localhost:3000'
node scripts/v1-performance-certification.mjs
```

Requirements: a running backend (auth-service) and frontend (Next.js),
PostgreSQL 16, and Redis, matching the same environment variables used by
`.github/workflows/v1-core-runtime-regression.yml`. `psql` must be on
`PATH`.

Run the certification's own logic tests (no live server required):

```bash
node --test scripts/v1-performance-certification.spec.mjs
```

## How CI runs it

`.github/workflows/v1-performance-certification.yml` runs on pull
requests targeting `feature/database-architecture` and on manual
dispatch: starts PostgreSQL 16 and Redis, applies/verifies migrations,
builds and boots the real backend and frontend, waits for readiness, runs
the certification, and fails the job (non-zero exit) on any threshold or
integrity failure. Only the text evidence log is uploaded -- no database
dump, no secrets. This is a dedicated, isolated workflow; it does not
modify any existing certification workflow.

## How to interpret failures

The script prints a `PERFORMANCE CERTIFICATION` block with every measured
value, followed by `postLoadReadiness=PASS/FAIL` and `integrity=PASS/FAIL`,
followed by the final verdict line. On failure, each specific violated
condition is printed (e.g. `p95 latency 1800ms exceeds threshold 1500ms`,
`3 duplicate groups`) before `V1 PERFORMANCE RELIABILITY CERTIFICATION:
FAIL`. Check the uploaded evidence log for the full per-phase detail,
including a sample of failed-operation responses when `failedOperations >
0`.

## What this certification does NOT prove

This certifies runtime stability under a bounded, CI-safe synthetic
concurrency profile only. It does **not** by itself prove:

- unlimited scalability
- national or global production capacity
- capacity planning for millions of users
- DDoS resistance
- production infrastructure autoscaling behavior
- production CDN behavior
- external-provider (SMS/email/Maps) performance
- soak or endurance behavior
- adversarial authorization/tenant-isolation correctness (covered by dedicated suites)

Those require separate, deployment-specific capacity and infrastructure
testing, tracked as later launch-operations work.
