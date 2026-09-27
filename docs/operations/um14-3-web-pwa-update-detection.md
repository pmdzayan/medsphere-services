# UM14.3 — Web/PWA Update Detection & Safe Update Flow

## Build identity

The web package runs:

```bash
node scripts/generate-release-marker.mjs
```

before `next dev` and `next build`.

The generated, gitignored `public/sw-release.js` contains only one bounded non-secret release ID. A full `RELEASE_SHA` wins when supplied; GitHub Actions may use `GITHUB_SHA`; local/other builds fall back to a deterministic content fingerprint.

Never add database URLs, tokens, credentials, patient data, organization data or other runtime configuration to the marker.

## Discovery lifecycle

`PwaRuntime` registers `/sw.js` with `updateViaCache: 'none'` and checks for updates:

- immediately after registration;
- after network reconnect;
- when AIM becomes visible again;
- when the window regains focus;
- every 15 minutes while the workstation remains open.

Frequent foreground/reconnect events are throttled by the UM14.3 minimum-gap policy.

## User flow

When the new worker finishes installation and waits:

1. AIM displays **A new AIM version is ready**.
2. The user is told to save in-progress work.
3. **Later** dismisses the notice temporarily.
4. **Update now** sends `SKIP_WAITING` to the waiting worker.
5. AIM reloads only after `controllerchange` proves the new worker became active.

There is no automatic refresh timer.

## Privacy/cache boundary

Both:

- `/sw.js`
- `/sw-release.js`

use `Cache-Control: no-cache, no-store, must-revalidate`.

The service worker continues to ignore all `/api/*`, navigations and protected healthcare pages. Only versioned Next static assets plus the public manifest/icon are eligible for Cache Storage.

## Validation

```bash
pnpm --filter @medsphere/web test
pnpm test:architecture
pnpm test:network-efficiency-boundary
pnpm --filter @medsphere/web build
```

The constrained-mobile network certification also verifies both service-worker resources use the required revalidation policy.

## Dependency boundary

UM14.3 is stacked on UM14.2 while UM14.1/UM14.2 complete their accepted merge/cooling sequence. It must not be merged into the authoritative branch ahead of those dependencies.
