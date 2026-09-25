# ADR-0030: Evidence-Before-Scaling Architecture and Bottleneck Governance

**Status:** Accepted

**Date:** 2026-09-25

**Decision owners:** AIM Project Owner and CTO

## Decision

AIM will use a **measure-before-complexity** rule for scaling architecture.

The accepted runtime remains the smallest architecture that safely satisfies the product's measured needs. A new production broker, datastore/search cluster, read-replica/sharding layer, autoscaling controller, service mesh, or independently deployed service boundary may not be activated merely because it is common at larger companies or appears in prototype code.

A scaling change requires all of the following before production activation:

1. a reproducible **measured bottleneck** against an explicitly identified baseline;
2. evidence that the bottleneck is material to an accepted product or operational requirement;
3. comparison of the smallest viable alternatives, including improving the current architecture;
4. a bounded **expected improvement** expressed in measurable terms;
5. an Accepted ADR defining ownership, consistency/failure semantics, security/privacy effects, observability, cost, rollout, and **rollback**;
6. implementation and regression evidence demonstrating that the change improves the measured problem without weakening healthcare safety, tenant isolation, data integrity, or recoverability.

Task 0058 makes this decision executable through
`scripts/architecture-bottleneck-governance.mjs` and
`docs/architecture/bottleneck-governance.json`.

## Reason and context

AIM already has substantial infrastructure capability: PostgreSQL, Redis, a transactional outbox/worker model, OpenTelemetry, Prometheus/Alertmanager, Docker/runtime certification, backup/recovery certification, and a real-stack performance/reliability harness.

The accepted CI-safe **baseline** currently exercises the web -> auth-service -> PostgreSQL + Redis path using 20 concurrent workers and 200 certified operations (160 reads, 40 mutations). Its fail-closed thresholds are error rate <= 1%, p95 <= 1500 ms, p99 <= 3000 ms, post-load readiness PASS, and post-load data integrity PASS.

That baseline is not a production-capacity promise. It is the reproducible repository evidence available today. New complexity must be justified by stronger workload evidence rather than assumptions about hypothetical scale.

The repository also contains legacy/prototype references to multiple NestJS deployables and Kafka. Those references are not production authority. Existing runtime safety policy already keeps prototype services blocked. Task 0058 preserves that distinction rather than treating repository presence as architecture approval.

## Alternatives

### Adopt distributed infrastructure pre-emptively

Rejected. Kafka, sharding, replicas, extra databases, service meshes, autoscaling, or more microservices can be appropriate later, but pre-activating them adds failure modes, security/privacy surface, deployment burden, backup/recovery requirements, and debugging cost before a measured need exists.

### Ban scaling technologies permanently

Rejected. AIM is intended to grow. This ADR does not prohibit scale-out architecture; it requires evidence before activation.

### Rely only on human review

Rejected as insufficient. Review remains mandatory, but a machine-checkable repository gate prevents accidental activation or dependency creep from silently becoming production architecture.

### Use a new benchmarking platform

Not selected for this task. AIM already has a repository-native concurrent performance/reliability harness and production observability. Task 0058 reuses those assets. A new load-testing platform may itself be proposed later if current tooling becomes a measured limitation.

## Consequences

### Positive

- Architecture complexity follows real AIM bottlenecks instead of fashion.
- Existing PostgreSQL/Redis/outbox/runtime investments remain the default until evidence shows otherwise.
- New infrastructure decisions become reviewable and reversible.
- AI coding agents cannot silently promote prototype infrastructure into accepted production surfaces.
- Performance thresholds and governance baseline cannot drift independently without CI failure.
- Healthcare safety, tenancy, audit, recovery, and operational ownership must be considered before scale-out.

### Costs and trade-offs

- A genuine scaling change requires an ADR and evidence package before activation.
- The static scanner is intentionally conservative and may need a reviewed exception for a legitimate new primitive.
- Repository CI evidence is not equivalent to real production capacity testing.
- Some future bottlenecks will require environment-specific load/soak tests beyond the current CI profile.

## Implementation constraints

- `MembershipProviderAccess`, healthcare authorization, audit, consent, and data-integrity boundaries may not be weakened as a scaling shortcut.
- The current performance baseline must stay synchronized with `scripts/v1-performance-certification.mjs`.
- Prototype-only surfaces remain excluded from accepted production authority; exclusion does not make them approved.
- An exception in `bottleneck-governance.json` must point to an existing Accepted ADR and measured evidence files.
- The ADR for a future exception must document the measured bottleneck, baseline, expected improvement, and rollback.
- Prefer query/index improvements, bounded caching using existing Redis where safe, batching, pagination, worker tuning, and removal of duplicate work before adding distributed components.
- A new service boundary must satisfy ADR-001 extraction criteria and define data ownership, contract versioning, failure recovery, observability, and deployment ownership.
- A new datastore or search engine must define source-of-truth authority, synchronization semantics, retention/deletion, backup/recovery, access control, and tenant isolation.
- A broker or queue must define delivery semantics, idempotency, replay/dead-letter behavior, ordering requirements, backpressure, and audit consequences.
- Autoscaling must use a measured saturation signal and prove safe scale-out/scale-in behavior.

## Review triggers

Review this decision when:

- production measurements repeatedly exceed accepted latency/error/capacity targets;
- a domain requires materially different availability or scaling characteristics;
- a regulatory/data-isolation requirement demands a separate runtime or datastore;
- sustained traffic makes the current PostgreSQL/Redis/outbox architecture economically or operationally unsuitable;
- team ownership/release cadence independently justifies service extraction;
- the existing performance harness can no longer reproduce the relevant bottleneck;
- a new deployment region or major healthcare domain changes the traffic/failure model.

The review must update the measured baseline rather than simply weakening thresholds to obtain a green result.
