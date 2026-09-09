# Task 0025 — Medicine Availability Trust & Inventory Freshness Foundation

**Sprint:** Task 0025
**Status:** Candidate awaiting CTO review (not accepted)
**Date:** 2026-09-09
**Base:** `fb118eb18f791a7c2689ec99ce6d386dd62b196e`

## Objective

When AIM says a medicine is available, there must be trustworthy evidence
supporting that claim. Task 0025 establishes the canonical foundation that
distinguishes fresh and trustworthy availability, stale stock evidence,
confirmed unavailability, availability requiring live confirmation, and unknown
availability — without introducing a second quantity authority and without
fabricating freshness for historical inventory.

## Implemented Work

1. **Persistence (`BatchStockObservation` + `AvailabilityEvidenceSource`):**
   - New append-only migration `20260909090000_medicine_availability_trust_freshness`
     with a closed-catalogue evidence-source enum and a composite-FK scoped
     observation table (Tenant/Inventory/Batch/Provider/Product + optional
     StockMovement provenance + deterministic idempotency key).
   - Unique constraints `(tenantId, idempotencyKey)` and
     `(batchId, occurredAt, source)`; value CHECK; append-only trigger.
   - No historical backfill: existing inventory is never marked fresh by the
     migration (proven by `verify-0025-upgrade.mjs`).

2. **Domain contract (`availability.types.ts`).** One typed contract covering
   the four trust states, closed evidence-source catalogue, freshness
   classifications, machine-readable reason codes, batch candidates, evidence,
   and evaluation result.

3. **V1 freshness policy (`availability-freshness-policy.ts`).** One explicit
   environment-parsed policy (24h fresh window, 5-minute future skew tolerance
   defaults, hard caps), classification of FRESH/STALE/INVALID, and
   fail-closed future/malformed timestamps.

4. **Canonical evaluator (`availability-trust.evaluator.ts`).** Pure,
   injected-clock deterministic evaluator that applies the accepted
   Batch/reservation eligibility semantics and is the single reusable source of
   trust interpretation.

5. **Evidence service (`availability-evidence.service.ts`).** Monotonic
   append recorder safe against out-of-order/older delayed writes, duplicate
   events, and retried commands; fail-closed source/timestamp validation.

6. **Trust read service (`availability-trust.service.ts`).** Internal
   domain/service contract that loads Batch + newest evidence and delegates to
   the canonical evaluator. No public/patient endpoint added.

7. **Write-path integration.** A new batch receipt is the only Task 0025
   automatic freshness producer. It records an AIM-managed observation
   atomically in the same serializable transaction as Batch + StockMovement,
   using the same database timestamp as the driving StockMovement. Generic
   adjustments, transfers, damaged-stock write-offs, and configuration or
   metadata mutations do not refresh freshness.

8. **Tests.** Unit tests for policy/evaluator/evidence plus PostgreSQL-backed
   integration tests covering the required trust matrix, freshness boundaries,
   evidence ordering, tenant/provider isolation, and regression.

9. **Governance docs.** ADR-029 (Proposed) + sprint record + ADR index row.

## Explicit exclusions

- Live Availability Request, pharmacist Available / Not Available / Check
  Later actions, patient medicine-search redesign, demand analytics, POS
  vendor integration, delivery, payments, appointments, family/dependents,
  medical timeline, and AI.
- No second stock quantity authority; Batch remains the only quantity
  authority.

## Verification Status

Clean deployment, populated upgrade, migration status, and drift were verified
on real local PostgreSQL. Task 0025 focused unit tests, real PostgreSQL
integration tests, and existing inventory/reservation regression suites pass.
Formatting, architecture/brand/permission/i18n gates, lint, and build pass.

The production dependency audit now passes on the re-anchored candidate after
the accepted dependency-security hotfix in PR #145. Task 0025 itself introduces
no root, web, or auth dependency-manifest change and no lockfile change; its
only package-script change adds the Task 0025 populated-upgrade verifier to
the existing database verification chain.

Awaiting re-anchored exact-commit CI and CTO acceptance. This candidate is not
production approval and does not authorize real healthcare data.
