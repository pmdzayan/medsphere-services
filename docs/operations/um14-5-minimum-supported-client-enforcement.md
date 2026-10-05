# UM14.5 — Minimum-Supported Web Client Enforcement

## Purpose

UM14.5 prevents a known-outdated AIM web/PWA client from silently continuing to call browser BFF APIs after the minimum compatible client generation has advanced.

## Build configuration

Current web build generation:

```text
AIM_WEB_CLIENT_GENERATION=1
```

The build generator validates the value and publishes it into the existing non-secret `sw-release.js` marker.

Increase the generation only when a new client contract is intentionally introduced. Do not derive it from a timestamp or Git SHA.

## Runtime configuration

Minimum accepted browser generation:

```text
AIM_WEB_MIN_CLIENT_GENERATION=1
```

The value must be an integer from 1 through 1,000,000,000.

If it is malformed, browser BFF API access fails closed with HTTP 503 until configuration is corrected.

## Browser bootstrap

`sw-release.js` is loaded with `beforeInteractive` in the root layout.

In a browser it writes:

```text
aim_web_client_generation=<generation>
```

with `Path=/`, `SameSite=Strict`, and `Secure` on HTTPS.

In a service worker there is no `document`, so importing the same marker does not write cookies.

## Enforcement

The Next middleware covers `/api/:path*`.

For browser-like requests:

- no generation cookie -> HTTP 426;
- malformed cookie -> HTTP 426;
- generation below minimum -> HTTP 426;
- supported generation -> request continues;
- invalid server minimum -> HTTP 503.

The 426 response contains only:

- `AIM_CLIENT_UPDATE_REQUIRED`;
- bounded reason: missing, invalid, or outdated;
- minimum client generation.

It contains no vulnerability details or healthcare data.

## Security boundary

The generation cookie is a compatibility hint only. It is never an authentication, tenant, provider, permission or clinical authorization factor.

All existing authentication and authorization controls remain mandatory after the middleware allows a compatible request through.

## Rollout rule

When raising the minimum:

1. publish and verify the new web release first;
2. confirm UM14.3 discovery and UM14.4 required-update UX work;
3. confirm rollback path;
4. raise `AIM_WEB_MIN_CLIENT_GENERATION`;
5. monitor 426 counts and user update adoption;
6. rollback the minimum if an operational defect prevents supported clients from loading.

Do not raise the minimum before the replacement client is available.

## Validation

```bash
pnpm --filter @medsphere/web test
pnpm --filter @medsphere/web lint
pnpm --filter @medsphere/web build
pnpm format:check
```

Repository exact-head CI, Task 0060 and production-runtime certification remain mandatory before merge.
