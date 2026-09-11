# Task 0028 — Privacy-Safe Live Demand Analytics Foundation

**Sprint:** Task 0028
**Status:** Candidate awaiting CTO review (not accepted)
**Date:** 2026-09-11
**Base:** `9182a6850569e7fef2f8dd1a69f82a817c772f6f`
**Branch:** `cto/0028-privacy-safe-live-demand-analytics`

## Task Objective

Give an authorized pharmacy a foundational, privacy-safe read that answers one
operational question:

> "Which medicines are generating live availability demand at this pharmacy?"

The read is provider-scoped, authenticated, bounded, deterministic, and built
exclusively on the already accepted durable `AvailabilityRequest` rows and
`ProviderProductAvailabilityEvidence` pharmacist-confirmation rows (Task 0026).
Task 0028 introduces **no patient- or requester-telemetry collection and no
surveillance surface**.

## Accepted Source Records

| Source                                                         | Role                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `AvailabilityRequest` (Task 0026)                              | One durable server-created availability request row per tenant/provider/product. **The only source of the live request count.** |
| `ProviderProductAvailabilityEvidence` (Task 0026, append-only) | The only accepted source of outcomes: `AVAILABLE`, `UNAVAILABLE`, `CHECK_LATER` pharmacist confirmations.                       |

No parallel request-event history is created. No new analytics table. The
accepted Task 0026 request/evidence lifecycle is read as-is.

## Exact Counting Semantics

For the selected provider and the server-derived bounded window
(`requestedAt >= from AND requestedAt < to`, `from = now - days`):

- `liveRequestCount` = number of durable `AvailabilityRequest` rows
  created/requested in the window.
- `pendingCount` = in-window requests whose **current** status is `PENDING`.
- `respondedCount` = in-window requests whose **current** status is `RESPONDED`.
- `expiredCount` = in-window requests whose **current** status is `EXPIRED`.
- `availableCount` / `unavailableCount` / `checkLaterCount` = counts of accepted
  `ProviderProductAvailabilityEvidence` rows belonging to in-window requests,
  grouped by the authoritative outcome enum values `AVAILABLE`, `UNAVAILABLE`,
  `CHECK_LATER`.

Invariants:

- `pendingCount + respondedCount + expiredCount = liveRequestCount` per product
  and in `totals`.
- Absence of a response is **never** interpreted as `UNAVAILABLE`.
- `CHECK_LATER` is **never** reinterpreted as unavailable.
- Outcome counts never infer availability from an inventory quantity.

## Explicit Privacy Exclusions (non-negotiable)

Task 0028 does **not** store, read, or return:

patient/user identity, public requester identity, account ID, membership ID of
the requester, session ID, cookie identifier, device/browser fingerprint, IP
address, user agent, request ID for analytics purposes, exact or coarse patient
coordinates, search-history rows, raw medicine search strings, free-form
requester text, diagnosis, symptoms, prescription contents, health conditions,
demographic profiles, advertising identifiers, individual request/evidence
timestamps, or individual evidence/request IDs.

No browser analytics, no third-party analytics SDKs, no cookies, and no attempt
to infer a "unique patient" count. The analytic surface returns aggregate
window boundaries, product display fields, and aggregate counts only.

## Request-Count Semantic Statement

> **Live request count is not a unique-patient count and is not a
> public-search count.**

It is specifically the number of durable live availability requests created.
Because accepted request deduplication may cause multiple public attempts to
converge onto one existing PENDING request, `liveRequestCount` can be lower
than the number of public attempts or searchers. It must never be described as
patients, people, searches, or attempts.

## Permission and Access Boundary

- Reuses the accepted least-privilege permission
  `inventory.availability-requests.read`. **No new analytics permission.**
- Provider must:
  - belong to the actor's tenant,
  - be accessible through the accepted trusted-provider authorization boundary
    (`assertTrustedProviderAccess`, ADR-007 `MembershipProviderAccess` live
    state),
  - be a `PHARMACY` provider.
- Cross-tenant, unassigned/untrusted, and non-PHARMACY provider access fails
  closed with the identical `Provider inventory not found` response (no
  provider existence enumeration).
- No public endpoint is added.

## Route / Query / Response Contract

### Route

`GET /inventory/providers/:providerId/availability-request-demand`

`providerId` is a UUID v4 path parameter. No request body.

### Query parameters

| Parameter | Optional | Default | Min | Max | Validation                                                 |
| --------- | -------- | ------- | --- | --- | ---------------------------------------------------------- |
| `days`    | yes      | 7       | 1   | 90  | integer only; fractional/zero/negative/over-limit rejected |
| `limit`   | yes      | 25      | 1   | 100 | integer only; fractional/zero/negative/over-limit rejected |

All other query keys are rejected by the strict whitelist validation pipe.
`from`/`to` are always derived server-side from database/server time.

### Response shape

```ts
{
  providerId: string;
  window: {
    from: string;
    to: string;
    days: number;
  }
  totals: {
    liveRequestCount: number;
    pendingCount: number;
    respondedCount: number;
    expiredCount: number;
  }
  products: Array<{
    productId: string;
    name: string;
    strength: string;
    dosageForm: string;
    manufacturer: string;
    liveRequestCount: number;
    pendingCount: number;
    respondedCount: number;
    expiredCount: number;
    availableCount: number;
    unavailableCount: number;
    checkLaterCount: number;
  }>;
}
```

`from`/`to` are ISO-8601 UTC strings. Product display fields (`name`,
`strength`, `dosageForm`, `manufacturer`) come from the authoritative `Product`
model and match existing public/inventory display conventions.

### Deterministic ordering and bounding

Products are ordered by:

1. `liveRequestCount` DESC,
2. stable tie-break on product display fields (`name`, `strength`,
   `dosageForm`),
3. finally `productId`.

The product ranking is aggregated and ordered inside PostgreSQL, and the bounded
`limit` is applied in SQL before product-level rows are returned to the
application. Top-level totals remain complete across all in-window requests.
The application never materializes every distinct requested product and never
builds a growing product-id `IN (...)` list.

## Validation Evidence

- DTO boundary tests prove defaults, boundary acceptance (1/90, 1/100),
  rejection of zero/negative/fractional/over-limit/non-numeric values, and
  whitelist rejection of unknown query keys.
- Service unit tests prove zero-request behavior, independent per-product
  aggregation, PENDING/RESPONDED/EXPIRED counting, AVAILABLE/UNAVAILABLE/
  CHECK_LATER evidence counting, absence-of-evidence-is-not-unavailable,
  deterministic ordering, result limit, database-level parameterized `LIMIT`
  proof, 7-day default, 1-day minimum, 90-day maximum, service-level
  normalization (defense in depth), trusted
  same-tenant PHARMACY access, cross-tenant/unassigned provider fail-closed,
  non-PHARMACY provider fail-closed, and the privacy-leak contract.
- Controller metadata tests prove the preferred route, GET method, reuse of
  `inventory.availability-requests.read`, and the absence of any invented
  analytics permission.
- A real PostgreSQL integration test seeds actual tenant/provider/product/
  request/evidence rows with random UUID fixtures and proves provider/tenant
  isolation, multiple statuses, confirmation outcomes, deterministic
  aggregation, bounded time filtering, cross-tenant non-leakage, and that the
  read appends no request/evidence/audit rows.

## Migration Status

**Task 0028 required no migration and no schema/index change.**

No analytics table was created, no request lifecycle state was duplicated, and
no new index was added. The corrected query deliberately uses three
status-constrained request branches (PENDING, RESPONDED, EXPIRED), so the
accepted Task 0026 request index
`AvailabilityRequest_tenant_provider_status_requested_idx` on
`(tenantId, providerId, status, requestedAt, id)` has its leading equality
columns constrained before the requested-at range. The accepted
tenant/provider/product evidence index supports the bounded per-selected-product
confirmation aggregation. There is deliberately no empty migration.

## Audit

Task 0028 follows the repository's accepted policy for provider `GET` reads:
it is read-only and appends **no** audit events and no new telemetry. It does
not create write-style audit evidence merely because an aggregate is being
read, and it never writes requester identity or search telemetry anywhere.

## Known Limitations

- Measures live availability-request activity only. It does not measure unique
  patients, all local market demand, arbitrary keystrokes, or public searches.
- A 1-day window naturally observes nothing for pharmacies that seed no
  requests in the last 24 hours; the endpoint reports zero totals rather than
  fabricating a denominator.
- Percentages are intentionally omitted: the raw numerator/denominator counts
  are returned and the aggregate is kept factual.
- No frontend/dashboard is part of this task. A later task may build the
  pharmacy-facing visualization on this accepted API.
