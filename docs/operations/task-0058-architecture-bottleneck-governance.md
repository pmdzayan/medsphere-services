# Task 0058 — Architecture & Bottleneck Governance

## Purpose

Task 0058 turns AIM's existing architecture philosophy into an executable rule:

> Measure the real bottleneck, make the smallest safe improvement, measure again.

This task does **not** introduce a broker, new cache, new database, sharding, read replicas, autoscaling, a service mesh, or another monitoring stack.

## Reused AIM evidence

The gate deliberately reuses:

- ADR-001 modular-monolith and extraction criteria;
- the V1 real-stack performance/reliability certification;
- PostgreSQL and Redis readiness;
- the accepted transactional outbox/worker model;
- OpenTelemetry plus Prometheus/Alertmanager;
- production runtime classification and prototype-service blocking;
- existing quality-gate architecture tests.

The current repository baseline is bound directly to
`scripts/v1-performance-certification.mjs`:

| Measure                          | Current reproducible baseline |
| -------------------------------- | ----------------------------: |
| Concurrent certification workers |                            20 |
| Certified read operations        |                           160 |
| Certified mutation operations    |                            40 |
| Total certified operations       |                           200 |
| Maximum error rate               |                            1% |
| Maximum p95                      |                       1500 ms |
| Maximum p99                      |                       3000 ms |

These numbers are **CI evidence, not a production capacity promise**.

## What the governance gate scans

`scripts/architecture-bottleneck-governance.mjs` scans accepted production
surfaces for markers representing classes of scaling complexity:

- message brokers / queue platforms;
- additional production datastores or search clusters;
- database read-replica/sharding layers;
- automatic horizontal scaling;
- service meshes;
- explicit promotion of another service boundary.

Historical documentation and the existing development-only prototype compose
surface are excluded from production authority. An exclusion means "not an
accepted production surface", not "approved for production".

## How a future scaling change becomes allowed

A future task may add a bounded entry to
`docs/architecture/bottleneck-governance.json#approvedExceptions` only when
the same change contains:

1. an **Accepted ADR**;
2. measured bottleneck evidence;
3. a named baseline;
4. a quantified expected improvement;
5. rollout and rollback;
6. evidence files committed or referenced by repository-controlled paths.

The automated gate verifies the ADR exists, is Accepted, contains the required
architecture sections, and explicitly addresses the measured bottleneck,
baseline, expected improvement, and rollback.

Human CTO/security review remains required. The JSON entry is not
self-approval.

## Smallest-change ladder

Before proposing a distributed component, evaluate in this order where
applicable:

1. remove unnecessary/duplicate work;
2. bound queries and responses;
3. fix query plans/indexes;
4. batch safe operations;
5. tune worker concurrency/backpressure;
6. use the already-accepted Redis capability where its semantics are safe;
7. improve caching of non-sensitive/static data;
8. scale the existing stateless runtime with deployment-specific evidence;
9. only then consider a new broker, datastore, service boundary, or distribution layer.

The ladder is guidance, not a requirement to perform an unsafe optimization.
Healthcare correctness, authorization, audit, consent, and data integrity win
over latency.

## Commands

Run the focused contract tests:

```bash
node --test scripts/architecture-bottleneck-governance.spec.mjs
```

Run the live repository gate:

```bash
node scripts/architecture-bottleneck-governance.mjs
```

Both are included in `pnpm test:architecture`, so the normal Quality Gate
enforces them automatically.

## Failure interpretation

A failure naming `message-broker`, `new-datastore-or-search-cluster`,
`database-distribution`, `automatic-horizontal-scaling`, `service-mesh`,
or `new-production-service-boundary` means a production surface now contains
a scaling primitive without a valid accepted-evidence exception.

A `performance baseline drift` failure means the actual performance
certification profile/threshold changed without updating the governance
baseline. The correct response is to review and document the changed evidence;
do not weaken either side merely to make CI pass.

## Out of scope

- production capacity planning;
- cloud-provider autoscaling configuration;
- CDN selection;
- multi-region topology;
- a new load-testing vendor/tool;
- changing V1 release approval;
- Task 0059 network/low-bandwidth efficiency;
- Task 0060 AI-code security/data-integrity gate.
