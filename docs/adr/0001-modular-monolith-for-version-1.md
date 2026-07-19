# ADR-001: Modular Monolith for MedSphere Version 1

**Status:** Accepted

**Date:** 2026-07-20

**Owners:** MedSphere CTO and project owner

## Decision

MedSphere Version 1 will be implemented as a modular monolith: one primary backend deployment, one controlled relational database, bounded domain modules, explicit application contracts, module-owned persistence, and domain events backed by a transactional outbox where asynchronous integration is required.

The existing multi-application repository will be migrated incrementally. Existing deployable applications do not remain approved service boundaries merely because they exist.

## Reason and context

The audited repository has seven NestJS applications that share a Prisma client, schema, and database. Domain logic is duplicated or misplaced across applications, while the API gateway and event architecture are mostly scaffolding. This creates distributed operational complexity without database ownership or reliable distributed-workflow guarantees.

Version 1 priorities are tenant isolation, medicine-inventory correctness, transactional workflows, testability, maintainability, and fast feedback. Inventory, reservation, procurement, fulfilment, audit, consent, and privacy also contain workflows that initially benefit from strong consistency.

A modular monolith provides these properties while allowing measured future extraction through explicit contracts and domain events.

## Alternatives

### Continue shared-database microservices

Rejected. It retains hidden coupling, duplicate logic, unclear ownership, non-atomic cross-service behavior, and microservice deployment cost.

### Convert immediately to true microservices

Not selected for Version 1. True microservices would require per-service data ownership, contract versioning, outbox/inbox delivery, idempotency, distributed tracing, failure recovery, and operational ownership before the product foundation is stable.

### Unstructured monolith

Rejected. One deployment without enforced module boundaries would make later maintenance and extraction difficult.

## Consequences

### Positive

- Stronger transactional integrity for early healthcare workflows
- Simpler local development, testing, deployment, and observability
- Clearer domain ownership and reduced duplicate code
- Lower operational complexity during product validation
- Future extraction remains possible through contracts and events

### Negative and cost

- Existing applications and duplicated modules require controlled consolidation.
- Boundary rules need architecture tests or lint rules to prevent erosion.
- A single deployable has a larger blast radius until operational safeguards mature.
- Independent scaling is limited until a module is deliberately extracted.

### Risks

- A modular monolith can degrade into a tightly coupled monolith if repositories and imports cross boundaries.
- Premature consolidation can break behavior if existing code is moved without tests.

## Implementation constraints

- Define a bounded-context map before moving production behavior.
- Establish characterization and integration tests before deleting duplicates.
- Assign each table and repository to one module owner.
- Prohibit direct persistence access across module boundaries.
- Use explicit application services for synchronous interactions.
- Use a transactional outbox for reliable asynchronous domain events.
- Keep authentication, tenant context, authorization, audit, consent, and privacy as cross-cutting policies with explicit ownership—not scattered helpers.
- Do not add another deployable service without a new accepted ADR and measured need.

## Future extraction criteria

A module may become a service when several of these conditions are proven:

- Independent scaling or availability requirements
- Separate team ownership and release cadence
- Regulatory or data-isolation requirement
- Stable versioned contract and limited transaction coupling
- Demonstrated operational readiness for messaging, observability, deployment, and incident response

## Review triggers

Review this decision after Version 1 production evidence, material scaling data, major organizational growth, a regulatory isolation requirement, or a module that repeatedly requires independent availability and deployment.
