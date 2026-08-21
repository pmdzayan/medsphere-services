# Batch 2 Task 2 — Scope Boundary: Public Patient Medicine Search + Safe Staff-Assisted Reservation Handoff

**Status:** Revised scope, accepted as the V1 boundary for this task

**Branch:** `cto/batch2-task2-patient-search-reservation`

**Revision date:** 2026-08-21

## Revised objective

The original Task 2 contract asked for a complete patient-facing path from
search through self-service reservation creation. Repository analysis
during implementation found that self-service patient reservation creation
cannot currently be built safely (see "Why patient self-service reservation
creation is deferred" below). The V1 scope for this task is therefore
formally revised to:

**Public Patient Medicine Search + Safe Staff-Assisted Reservation
Handoff.**

This is the accepted V1 boundary for Task 2. It is not a partial or
abandoned implementation of the original contract — it is a deliberate,
evidence-based scope decision made to avoid two unsafe alternatives
(described below), and V1 launch readiness or store approval must be
evaluated against this revised boundary, not the original one.

## What is delivered

- A public, unauthenticated, provider-scoped medicine search endpoint
  (`GET /public/providers/:providerId/medicine-search`) returning only
  privacy-safe fields, with coarse (`IN_STOCK` / `OUT_OF_STOCK`)
  availability derived from the same eligibility criteria the accepted
  reservation-creation path itself uses.
- A frontend `/search` page and feature component consuming that endpoint,
  with loading/error/empty states and duplicate-submit prevention.
- An explicit, honest handoff: each search result reads "Contact
  {pharmacy} to reserve or purchase" rather than offering a reservation
  action the platform cannot yet fulfil safely for a self-service patient.
- Reservation creation itself is unchanged: it remains the existing,
  accepted, staff/provider-authorized path
  (`POST providers/:providerId/reservations`), used by staff (call
  center, front counter, phone intake) to create a reservation on a
  patient's behalf.

## Why patient self-service reservation creation is deferred

Two structural facts, established by direct inspection of the accepted
codebase, not by assumption:

1. `ReservationCreationService.create()` requires the reservation's
   subject to already have an **ACTIVE** `TenantMembership` in the target
   provider's tenant. This is enforced both in application code and by a
   database-level composite foreign key
   (`AuditEvent.actorMembershipId` → `TenantMembership(id, tenantId)`,
   established in Post-Audit Stabilization Batch 1 Task 4) — any audited
   mutation structurally requires a real membership row scoped to the
   correct tenant.
2. Self-registration (`RegistrationService` / `UsersRepository.
createPendingRegistration`) already creates exactly this kind of
   membership on signup, but leaves it `PENDING` (and the registering
   user `PENDING_VERIFICATION`) permanently. No email-verification
   endpoint exists anywhere in the accepted codebase that would ever
   transition either status forward. This gap predates Batch 2.

Two unsafe alternatives were considered and rejected:

- **Bypassing the existing ACTIVE-membership check for a new "patient"
  code path.** This would mean a self-service reservation could be
  created for an actor whose relationship to the tenant was never
  verified — a real authorization weakening of an already-accepted
  invariant, and out of bounds under "no auth bypass or auto-activation
  is permitted."
- **Auto-activating self-registered memberships** (flipping `PENDING` to
  `ACTIVE` without an intervening verification step). `PENDING` is the
  same status gate staff-onboarding self-registration relies on
  elsewhere in the system; auto-activating it globally risks letting an
  unvetted self-registered account receive real permissions the moment
  any admin later assigns a role, without the admin ever having
  explicitly approved that specific account. This is a genuine RBAC
  regression risk, not merely a cautious refusal.

Given both alternatives were rejected, and inventing a full
email-verification system (tokens, delivery, a new endpoint) is
substantially larger and different in kind from "search and reservation
creation," it is out of proportion for this task.

## Explicit governance statements

- **V1 patient self-service reservation creation is deferred.** It is not
  implemented in this task, and no code path in this repository allows a
  patient to create a reservation for themselves without staff
  involvement.
- **Existing reservation creation remains staff/provider-authorized.**
  `ReservationCreationService.create()` and its mounted route are
  unchanged by this task and continue to require `assertTrustedProviderAccess`
  (a real, active `membershipProviderAccess` grant) for the acting staff
  member.
- **Self-registration currently does not provide a safe ACTIVE patient
  authority path.** The `PENDING` membership and `PENDING_VERIFICATION`
  user status created at self-registration are never transitioned forward
  by any accepted code path today.
- **No auth bypass or auto-activation was implemented, and none is
  permitted.** No change was made to `ReservationCreationService`'s
  subject-membership check, to registration's initial statuses, or to any
  other accepted authorization boundary.
- **Future patient identity/verification must be implemented as a
  separate, bounded task.** Building a working email-verification (or
  equivalent) flow that safely activates a self-registered patient's
  membership is explicitly out of scope here and is recorded as follow-up
  work, not silently absorbed into this task's boundary.

## Test coverage supporting this boundary

- `public-medicine-search.integration.spec.ts` — privacy-safe field
  exposure (verified via full-payload string scan for cost, batch
  numbers, owner identity, and contact details), hidden-listing
  concealment, and identical fail-closed behavior for a nonexistent
  provider versus an inactive/unverified one (no enumeration signal).
- `batch2-task2-reservation-creation-cross-tenant.integration.spec.ts` —
  a tenant B actor with genuine access to its own tenant's provider is
  rejected, tenant-safe, attempting reservation creation against tenant
  A's real opaque provider/product IDs through the unchanged, existing
  staff-authorized path.
- `public-medicine-search.test.tsx` and the medicine-search BFF
  `route.test.ts` — frontend-side privacy/response-shape and
  response-minimization coverage (real-data rendering, out-of-stock/
  prescription badges, empty state, exact server error, loading state
  with duplicate-submit prevention, no-credential forwarding,
  enumeration-safe 404 propagation, invalid-shape rejection).

## Non-approval boundary

This scope revision and its supporting evidence are not production
approval, do not authorize real healthcare data, and do not by themselves
establish overall MedSphere V1 launch readiness. They record a bounded,
evidence-based V1 scope decision for Task 2 only.
