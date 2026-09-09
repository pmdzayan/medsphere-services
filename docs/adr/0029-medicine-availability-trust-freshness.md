# ADR-029: Medicine Availability Trust and Inventory Freshness Foundation

**Status:** Proposed

**Date:** 2026-09-09

**Decision owners:** AIM Project Owner and CTO

**Depends on:** ADR-001, ADR-003, ADR-004, ADR-005, ADR-007, ADR-008, ADR-013, ADR-014, ADR-028

## Context

AIM V1 is medicine-first. When AIM says a medicine is available, that claim
must be backed by trustworthy evidence. Existing quantity correctness alone is
not enough: a pharmacy may hold a positive stored quantity while that
information is too old to trust publicly.

The accepted inventory architecture already makes `Batch` the single physical
quantity authority and the accepted reservation model the sole authority for
held/reserved quantities (ADR-005). Those authorities are correct for
_quantity_. What they do not yet express is _evidence freshness_: which
inventory commands objectively (re)established the physical quantity, when, and
whether that observation is fresh enough to make a public availability claim.

Task 0025 must create the canonical foundation that distinguishes fresh and
trustworthy availability, stale stock evidence, confirmed unavailability,
availability requiring live confirmation, and unknown availability — without
introducing a second quantity authority and without fabricating freshness for
historical inventory.

## Decision

1. **Closed-catalogue evidence sources.** Persist a strict
   `AvailabilityEvidenceSource` enum. `AIM_MANAGED_INVENTORY` is the only live
   batch-bound write source in Task 0025, and new batch receipt is its only
   automatic producer. `MANUAL_PHYSICAL_COUNT` and `POS_SYNC` are reserved
   batch-bound contract slots that require normalization to a real AIM Batch
   before future use. `PHARMACIST_CONFIRMATION` is deliberately not persisted
   in `BatchStockObservation`; it is reserved for the future provider/product-
   level evidence model used by Live Availability Request. Unvalidated
   free-form source strings are never accepted.

2. **Append-only physical-stock observation evidence.** A new append-only
   `BatchStockObservation` table records, for each qualifying observation:
   tenant/inventory/batch/provider/product (all composite-FK scoped),
   source, `observedOnHandQuantity`, the observation's own `occurredAt`,
   optional movement provenance, and a deterministic idempotency key.
3. **Monotonic evidence.** An older-or-equal observation arriving later can
   never overwrite newer evidence. Duplicate events, retried commands, and
   same-observation double submission degenerate into no-ops via deterministic
   idempotency keys and unique constraints, not last-write-wins.

4. **V1 freshness policy.** One explicit policy (`AvailabilityFreshnessPolicy`)
   parsed from environment through the accepted bounded-integer configuration
   pattern. Conservative defaults: 24-hour fresh window, 5-minute future
   clock-skew tolerance. Implausible/future timestamps fail closed (never
   AVAILABLE). Exactly-at-boundary is FRESH; strictly beyond the window is
   STALE.

5. **Canonical trust evaluator.** A single pure evaluator produces one typed
   availability-trust result (`AvailabilityTrustEvaluation`) with four states:
   `AVAILABLE`, `UNAVAILABLE`, `CONFIRMATION_REQUIRED`, `UNKNOWN`. It applies
   the same stock-eligibility semantics the accepted reservation/FEFO path uses
   (ACTIVE, non-expired, non-deleted batches; onHand minus held), so freshness
   never overrides a safety exclusion and held reservation quantity keeps
   reducing available quantity.

6. **Atomic write-path recording.** New batch receipt records its observation
   inside the same serializable transaction as the Batch and StockMovement,
   using the same database timestamp that stamps the driving StockMovement.
   Evidence cannot commit independently of the receipt. Other Task 0025
   inventory mutations do not automatically refresh freshness.

7. **Tenant/provider isolation.** Evidence rows are bound by composite FKs to
   the owning tenant/inventory/batch/provider/product (the same scoped-FK
   pattern as StockMovement), so Tenant A evidence can never attach to Tenant B
   inventory and Provider A evidence can never affect Provider B.

8. **Domain-first, no new public endpoint.** Task 0025 establishes the
   domain/service contract (`AvailabilityTrustService` /
   `AvailabilityTrustEvaluator`) and does not add a new public patient
   medicine endpoint.

9. **Task 0025 automatic observation boundary.** New batch receipt is the only
   automatic producer because it starts from zero and objectively establishes
   the received batch quantity. Generic adjustments, completed transfers,
   damaged-stock write-offs, and row `updatedAt` changes do not refresh
   freshness. Future explicit physical counts or normalized POS observations
   require their own validated ingestion path.

## Reason

Availability claims are patient-impacting. A fresh-observation requirement
prevents stale stock from being presented as available, safety-state precedence
prevents quarantined/expired/exhausted stock from being presented as available,
and monotonic append-only evidence prevents out-of-order or replayed writes
from corrupting the trust record. Binding evidence to the accepted Batch
quantity authority keeps one quantity source of truth.

## Consequences

- Availability trust is derived from objectively-observed physical-stock
  evidence plus the accepted Batch/reservation eligibility, never from generic
  record modification timestamps.
- Historical inventory gains no fabricated freshness; it becomes trustworthy
  only after a real qualifying observation.
- Future batch-bound sources (manual counts and normalized POS synchronization)
  can append through the same batch evidence service. Pharmacist confirmation
  and Live Availability Request remain reserved for a future provider/product-
  level evidence model that the canonical trust layer can combine.
- No second quantity authority, no new patient endpoint, and no weakening of
  accepted FEFO/reservation/expiry/quarantine/damage/transfer rules.

## Review Triggers

Review when POS synchronization, real pharmacist confirmation, or a patient
medicine-search surface introduces a new evidence source; when the V1 freshness
window needs revision; or when a second availability state is required.
