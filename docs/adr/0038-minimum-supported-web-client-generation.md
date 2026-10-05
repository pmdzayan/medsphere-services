# ADR-038: Minimum Supported Web Client Generation

**Status:** Accepted  
**Date:** 2026-10-04  
**Task:** UM14.5

## Decision

AIM will enforce a monotonic, bounded **web client generation** at the Next.js BFF boundary for browser-originated API requests.

Each web build exposes a non-secret integer `clientGeneration` through the existing generated `sw-release.js` marker. The same marker is loaded before hydration in the browser and writes only the bounded `aim_web_client_generation` compatibility cookie.

The BFF middleware compares that cookie with `AIM_WEB_MIN_CLIENT_GENERATION`.

For browser API requests:

- missing generation -> `426 Upgrade Required`;
- malformed generation -> `426 Upgrade Required`;
- generation below the configured minimum -> `426 Upgrade Required`;
- supported generation -> request continues;
- malformed server minimum-generation configuration -> `503 Service Unavailable` and no API request is allowed through.

The 426 response is no-store and exposes only a stable error code, bounded reason category, and minimum generation. It does not expose vulnerability details, credentials, patient data, organization data or internal release notes.

## Reason and context

UM14.4 can present a non-deferable update notice, but UX alone cannot guarantee an incompatible stale browser continues to be rejected by the BFF.

Git commit SHAs are identities, not ordered versions. Comparing SHAs lexically would be invalid. AIM therefore uses a monotonically increasing integer generation for compatibility ordering while retaining the exact release SHA/content ID for artifact identity.

## Trust boundary

The generation cookie is **not** an authentication credential and must never be used to authorize a user, tenant, role, provider, clinical action or data access.

A client can self-assert this compatibility value. That does not weaken authentication or tenant controls because those continue to be enforced independently by trusted session/token context.

UM14.5 exists to stop known-stale browser applications from silently continuing through a BFF contract they are no longer compatible with.

## Browser scope

The middleware applies the web-generation gate only to browser-like requests identified through Fetch Metadata headers. Server-to-server and repository certification calls without browser Fetch Metadata are not reclassified as browser clients.

This preserves existing operational/API test paths while keeping browser clients on the accepted web compatibility contract.

Native application compatibility is out of scope until UM14.6.

## Alternatives

### Compare Git SHAs as versions

Rejected. SHAs are not monotonic and have no version ordering semantics.

### Make the release cookie an authentication credential

Rejected. Client-version metadata is attacker-controlled compatibility input, not identity.

### Require every server/service caller to present a web generation

Rejected. UM14.5 is specifically a web/PWA client control; native/store and other clients get their own accepted contracts later.

### Silently allow requests when server minimum configuration is invalid

Rejected. A malformed compatibility policy must fail closed rather than accidentally re-enable an unsupported client.

## Consequences

- AIM can raise the minimum accepted web client generation during an incompatible release.
- Stale browser clients fail with explicit HTTP 426 instead of unpredictable API errors.
- Current browser builds publish their generation before normal React hydration.
- Compatibility enforcement remains independent from auth, tenancy and clinical authorization.
- Operators must increase `AIM_WEB_CLIENT_GENERATION` for incompatible client-contract generations and move `AIM_WEB_MIN_CLIENT_GENERATION` only after the corresponding release is available.

## Implementation constraints

- generation must be an integer from 1 through 1,000,000,000;
- default current generation is 1;
- default minimum generation is 1;
- generated marker remains non-secret and gitignored;
- compatibility cookie contains generation only;
- secure deployments add the Secure cookie attribute;
- 426 and policy-failure responses are no-store;
- compatibility values may not authorize data or actions;
- old-client blocking must never replace session, tenant or permission validation;
- minimum generation changes require normal release approval and exact-artifact evidence.

## Review triggers

Review this ADR if AIM introduces signed client attestations, native app generations, per-platform minima, multiple simultaneously supported web generations with different API contracts, or a server-side update manifest that becomes the authoritative compatibility policy.
