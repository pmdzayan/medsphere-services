# V1 Blood Bank and Live Blood Availability Scope

## Status

Planned V1 capability. This document adds roadmap scope only and does not claim implementation, validation, regulatory approval, clinical suitability, or production readiness.

## Product objective

Provide a clinically controlled hospital-to-blood-bank network for near-real-time blood-component availability. MedSphere helps authorized healthcare staff discover, request, hold, and coordinate blood inventory while preserving blood-bank authority, donor privacy, traceability, and clinical safety boundaries.

This is not a general consumer marketplace. Blood availability is primarily exposed in response to a documented healthcare need created by an authorized hospital or clinician.

## Primary V1 users

### Hospital and authorized clinical staff

- create a blood requirement for a patient under the hospital's authorized workflow
- specify the requested component, quantity, urgency, required location/time, and other accepted non-sensitive request metadata
- search verified nearby blood banks and hospital blood banks for matching aggregate availability
- send requests, track responses, and coordinate provider-side holds
- view freshness timestamps and request status

### Blood-bank staff

- maintain component inventory and lifecycle state
- publish safe aggregate availability
- receive, accept, reject, or expire hospital requests
- create and release authorized holds according to accepted policy
- manage issued, quarantined, expired, discarded, and other approved lifecycle states
- receive low-stock and urgent-request events
- use operational dashboards and audit evidence

### Doctors

- initiate or confirm the clinical need where the accepted hospital workflow permits
- provide clinical request context within policy
- do not directly select or release a specific blood unit unless separately authorized by the blood-bank/clinical policy

### Patients and family members

Patient-facing access is deliberately limited. Where permitted by policy, they may:

- discover verified facilities that report relevant aggregate blood-component availability
- submit a bounded emergency-assistance request that is routed to authorized healthcare providers
- track non-sensitive request progress where appropriate

Patients or family members do not directly reserve, allocate, select, or release a specific blood unit in V1.

### Donors

Donor recruitment, donor eligibility, donation appointments, donation history, and donor medical records are not part of this V1 capability. They require a separate future product boundary and regulatory review.

## V1 capability boundary

MedSphere V1 should support:

- verified hospital blood banks and standalone blood-bank provider profiles
- blood components including red blood cells, platelets, plasma, and other explicitly configured component types
- ABO/Rh classification and component-specific stock tracking
- unit/bag identifiers, collection timestamps, expiry timestamps, status, and storage-location metadata inside the authorized provider boundary
- immutable inventory movements and auditable lifecycle changes
- available, reserved/held, issued, quarantined, expired, discarded, and otherwise policy-approved states
- near-real-time aggregate availability reads with a freshness timestamp
- authorized location-aware search across verified providers
- clinically triggered blood-requirement records with bounded urgency/status transitions
- hospital-to-blood-bank request workflows
- provider-side holds/reservations that are atomic and concurrency-safe
- emergency-request workflows with bounded status transitions and audit evidence
- low-stock and urgent-request events that can feed the accepted notification platform
- operational dashboards for hospitals and blood-bank staff
- tenant isolation, RBAC, durable audit, idempotency, and database integrity consistent with MedSphere platform standards

## Reference workflow

1. A patient has a documented clinical need for a blood component.
2. An authorized doctor or hospital staff member creates or confirms the blood requirement.
3. MedSphere searches verified blood-bank aggregate inventory using the accepted location and availability contract.
4. The hospital sees eligible provider locations, availability freshness, and requestable aggregate stock without donor data.
5. The hospital sends a request to one or more authorized blood banks according to policy.
6. A blood bank confirms availability and may create an atomic provider-side hold.
7. Compatibility testing, crossmatch, final unit selection, clinical release, and transfusion authorization remain under the blood-bank/clinical workflow.
8. MedSphere records request, hold, release, expiry, cancellation, and audit evidence according to the accepted domain contract.

For emergency escalation, the system may fan out a bounded request to multiple verified nearby providers, but it must preserve authorization, deduplication, auditability, rate limits, and clear response/expiry semantics.

## Clinical and privacy safety boundary

- Patient-facing or public availability exposes safe aggregate availability and provider information only; donor identity and sensitive unit-level clinical data must not be exposed.
- MedSphere must not infer transfusion suitability from ABO/Rh alone.
- Crossmatch, compatibility testing, clinical release, transfusion authorization, and final unit selection remain blood-bank/clinical responsibilities governed by local policy and applicable regulation.
- Emergency workflows must not bypass authorization, audit, compatibility requirements, or inventory-conservation controls.
- A displayed availability count is not a guarantee that a specific unit is clinically suitable or releasable for a particular patient.

## Explicit V1 exclusions unless separately accepted

- donor recruitment, donor eligibility determination, collection-center donor workflows, donation appointments, or donor medical records
- direct consumer reservation or allocation of individual blood units
- autonomous compatibility, crossmatch, transfusion, or clinical-release recommendations
- national blood-network integrations
- predictive demand AI, AI allocation, or AI clinical decision-making
- production deployment without the full Milestone 11 verification and compliance gates

## Dependency order

1. Complete the accepted core inventory safety sequence.
2. Accept compliance prerequisites for identity, authorization, privacy, verification, retention, and policy where required.
3. Establish the shared search/live-availability contract and event-delivery foundation.
4. Implement verified blood-bank provider and blood-component inventory domain boundaries.
5. Implement clinically triggered hospital blood-requirement and provider-request contracts.
6. Implement live aggregate availability reads and freshness semantics.
7. Implement atomic provider-side holds and emergency escalation.
8. Connect notification events and hospital/blood-bank staff workflows, followed by restricted patient discovery/emergency assistance.
9. Complete integration, concurrency, security, E2E, performance, observability, backup/restore, and operational verification before production acceptance.

## Acceptance gate

This capability is not complete until the accepted implementation includes required schema/migrations, tenant-safe authorization, verified-provider authority, durable audit, immutable inventory evidence, concurrency and idempotency protections, API contracts, relevant hospital and blood-bank workflows, restricted patient-facing behavior, real PostgreSQL integration tests, exact-head CI, security/privacy review, and CTO acceptance.
