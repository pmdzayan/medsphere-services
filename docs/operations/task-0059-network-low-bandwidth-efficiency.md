# Task 0059 — Network & Low-Bandwidth Efficiency

## Purpose

Task 0059 makes AIM's mobile/data-efficiency expectations measurable while preserving the existing healthcare privacy and freshness boundaries.

The task does not cache healthcare data, introduce a CDN, add a new transport, or weaken `no-store` semantics.

## Baseline

The exact-authoritative Task 0058 post-merge quality-gate build (run `36160336434`) reported:

| Public route | Build-reported first-load JS |
| ------------ | ---------------------------: |
| `/`          |                       190 KB |
| `/login`     |                       209 KB |
| `/register`  |                       198 KB |
| `/search`    |                       200 KB |

The runtime certification uses a separate wire-transfer budget because build-reported JavaScript size and actual compressed transfer bytes are not the same measurement.

## Constrained-mobile profile

The browser certification uses Chromium network emulation:

- latency: 150 ms;
- download: 1.6 Mbps;
- upload: 750 Kbps;
- mobile viewport: 390 x 844.

Each selected public route starts from a fresh browser context with service-worker caching blocked so the measurement is a true cold-load regression check.

Initial per-route ceilings:

- total cold transfer: <= 300,000 bytes;
- navigation + resource entries: <= 20 requests;
- network-idle readiness: <= 5,000 ms;
- no horizontal overflow;
- no unexpected third-party origins;
- HTML response must use an accepted compression encoding.

These values were tightened after the first successful real-browser certification (run `36164971346`) measured 217,925–237,164 bytes, 10–14 requests and 1,947–2,206 ms across the selected routes. They retain bounded regression headroom and are not customer SLAs.

## Cache contract

### Public static assets

`/manifest.webmanifest` and `/icon.svg` use:

`public, max-age=86400, stale-while-revalidate=604800`

They contain no healthcare or identity data and are also within Task 0048's public-static service-worker boundary.

### Service worker

`/sw.js` uses:

`no-cache, no-store, must-revalidate`

This prevents a stale worker from indefinitely preserving an obsolete security/cache policy.

### Healthcare/API data

BFF/API routes remain private/no-store. The architecture check fails if a route under `apps/web/src/app/api` introduces known shared-cache or force-cache markers without a future reviewed policy change.

The service worker continues to ignore `/api/*`, navigations, authenticated pages and healthcare data.

## Compression

`apps/web/next.config.ts` explicitly sets `compress: true`.

The real-browser certification verifies selected HTML responses advertise an accepted compressed content encoding.

## Automated enforcement

Fast architecture check:

```bash
pnpm test:network-efficiency-boundary
```

This checks:

- explicit Next compression;
- public-static cache headers;
- service-worker revalidation header;
- service-worker API exclusion/static-only behavior;
- browser API `requestJson` default `cache: 'no-store'`;
- absence of known shared/long-lived caching markers in BFF API route sources.

Real browser certification:

```bash
pnpm --filter @medsphere/web exec playwright test e2e/network-efficiency.spec.ts
```

CI workflow: `.github/workflows/network-efficiency-certification.yml`.

## Interpreting failures

A transfer/request/readiness failure means the selected route exceeded its accepted constrained-mobile budget. Measure which resource or request caused the growth and make the smallest safe improvement.

A cache-boundary failure means a change may cache sensitive or stale healthcare data. Do not solve it by weakening the check.

A compression failure means the production browser-facing response is no longer compressed under the certified runtime.

An unexpected-origin failure means a selected public route added a browser dependency outside the AIM origin and requires explicit review.

## Out of scope

- CDN/vendor selection;
- HTTP/3 or edge routing;
- production carrier testing;
- real-user monitoring vendor activation;
- caching healthcare API payloads;
- durable offline healthcare records;
- Task 0060 AI-code security/data-integrity gate.
