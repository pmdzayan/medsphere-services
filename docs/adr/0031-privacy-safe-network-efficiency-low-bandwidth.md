# ADR-0031: Privacy-Safe Network Efficiency and Low-Bandwidth Budgets

**Status:** Accepted

**Date:** 2026-09-25

**Decision owners:** AIM Project Owner and CTO

## Decision

AIM will treat network efficiency as a release property without weakening healthcare-data freshness or privacy.

The web runtime must:

1. enable production response compression;
2. cache only versioned/static public assets through the browser/service worker;
3. keep API responses, navigations, authenticated pages and healthcare records out of shared/service-worker caches;
4. expose bounded cache headers for public manifest/icon assets and force revalidation of service-worker code;
5. certify selected public journeys under a constrained-mobile network profile with cold transfer-size, request-count and readiness budgets;
6. fail CI when those budgets or privacy-cache boundaries regress.

The executable budget is `docs/architecture/network-efficiency-budget.json`.

## Reason and context

AIM is intended for pharmacies, patients and healthcare organizations that may use mobile devices, unstable connections or limited data plans. Transfer size and request fan-out therefore affect usability as well as infrastructure cost.

Task 0058 established that architecture changes must follow measured evidence. Task 0059 applies the same principle to network behavior. The exact-authoritative Task 0058 post-merge production build reported first-load JavaScript of approximately:

- `/`: 190 KB
- `/login`: 209 KB
- `/register`: 198 KB
- `/search`: 200 KB

These values are build output, not wire-transfer measurements. They form the initial baseline only.

Task 0048 already established a privacy-safe PWA contract: service-worker Cache Storage is limited to versioned Next static assets plus the public manifest/icon, while API calls and healthcare content are never cached. Task 0059 preserves and measures that boundary instead of adding aggressive offline caching.

## Alternatives

### Cache healthcare/API responses aggressively

Rejected. Stock availability, reservations, patient data, permissions and other healthcare state can become stale or expose private information through shared caches. Low bandwidth does not justify weakening server authority or privacy.

### Introduce a CDN or new edge platform immediately

Not selected. CDN/provider choice is deployment-specific and requires production evidence under ADR-030. The repository can first reduce avoidable transfer and certify correct cache headers using the existing Next runtime.

### Cache full navigations for offline use

Rejected for the current scope. Authenticated pages and healthcare records must not be persisted in service-worker caches. Task 0048's memory-only offline POS draft remains the accepted resilience model.

### Rely on browser defaults without explicit budgets

Rejected. Defaults do not protect against future bundle growth, extra requests, or accidental shared caching. A measurable CI budget gives a stable regression signal.

## Consequences

### Positive

- Public pages remain usable on constrained mobile connections.
- Large bundle/request regressions fail before merge.
- Public static assets can be reused efficiently without caching healthcare data.
- Service-worker updates remain discoverable instead of being trapped behind a long cache lifetime.
- Compression is an explicit runtime contract rather than an implicit framework default.
- New third-party runtime dependencies become visible in the browser certification.

### Costs and trade-offs

- Real-browser certification adds CI time.
- Budget thresholds need evidence-based review as the product changes.
- CI network emulation is synthetic and does not replace field/RUM measurements.
- Private/no-store healthcare APIs may transfer more data than an aggressive cache design; correctness and privacy take precedence.
- CDN, HTTP/3 and regional edge behavior remain deployment concerns.

## Implementation constraints

- Do not cache patient, prescription, reservation, inventory, billing, audit, authorization or other healthcare API responses in shared caches.
- Do not persist precise location or other sensitive request context for bandwidth optimization.
- Keep collection endpoints paginated and bounded.
- Prefer request cancellation/deduplication, pagination, smaller DTOs, compression and versioned static caching before adding new infrastructure.
- Public-static cache headers may be long-lived only for non-sensitive assets whose update behavior is understood.
- `sw.js` must remain short-lived/revalidated so security and cache-policy changes can propagate.
- Budget increases require measured evidence and review; do not raise a threshold merely to make CI green.
- The constrained-mobile certification must run against a production Next build, not a development server.
- The browser certification must fail on unexpected third-party origins for the selected public routes unless a separately reviewed exception is introduced.

## Review triggers

Review this ADR when:

- real-user monitoring provides representative transfer/latency evidence;
- a selected public route approaches its transfer/request budget;
- a native mobile client changes the network model;
- a CDN/edge platform is introduced;
- offline healthcare workflows expand beyond the Task 0048 contract;
- a new public integration requires third-party browser requests;
- HTTP protocol or compression behavior materially changes.
