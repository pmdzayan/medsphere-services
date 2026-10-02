# ADR-036: Web/PWA Release Discovery and User-Controlled Activation

**Status:** Accepted

**Date:** 2026-09-27

**Task:** UM14.3

## Decision

AIM will discover new web/PWA builds through a release-bound service worker while keeping update activation explicitly user-controlled.

Each web build generates `apps/web/public/sw-release.js` from a bounded non-secret identity:

1. `RELEASE_SHA` when a valid full 40-character release SHA is supplied;
2. otherwise GitHub's `GITHUB_SHA` when available;
3. otherwise a deterministic SHA-256 fingerprint of the web source/public/config surface.

The generated release marker is imported by `sw.js`. Because `updateViaCache: 'none'` is retained and both service-worker resources are served with `no-cache, no-store, must-revalidate`, a new frontend build changes the worker script graph even when the hand-written `sw.js` logic itself did not change.

The client checks for a worker update:

- once after registration;
- after reconnect;
- when the document returns to the foreground;
- on window focus;
- on a bounded 15-minute interval.

Reconnect/focus checks are throttled to avoid request spam.

Discovery never activates or reloads automatically. When a waiting worker exists, AIM shows a localized update notice that tells the user to save in-progress work. Only the explicit **Update now** action sends `SKIP_WAITING`; the page reloads only after the browser confirms `controllerchange`.

## Reason and context

The pre-UM14.3 PWA already showed an update prompt when a new service worker reached the waiting state, but a frontend-only release could leave `sw.js` byte-for-byte unchanged. In that case, an already-open client had no reliable release signal and could remain on an older frontend bundle.

Healthcare work also makes unconditional background reload unsafe. Forms, inventory operations, billing work and future clinical workflows may be in progress even when the new build is safe.

## Alternatives

### Poll a healthcare/BFF API for application version

Not selected. A public release marker does not need an authenticated API or a new healthcare trust boundary.

### Automatically activate and reload every new worker

Rejected. Background reload can discard unsaved workstation state and surprise users during operational workflows.

### Long-cache the release marker

Rejected. Update metadata must revalidate so clients can discover new builds promptly.

### Use only a timestamp

Rejected. Timestamps make identical builds look different and are less useful for exact-artifact reasoning. The fallback fingerprint is deterministic.

## Consequences

- Frontend-only releases become discoverable even when the service-worker source code did not otherwise change.
- Update checks add small bounded requests for revalidated worker resources.
- Users control when the new frontend takes over.
- Any in-progress work remains untouched until the user explicitly selects **Update now**.
- The service worker still caches only versioned/static public assets; no API, navigation, authenticated page or healthcare record enters Cache Storage.

## Implementation constraints

- `sw-release.js` is generated and gitignored; it must contain release identity only.
- Production secrets and environment values must never be copied into the release marker.
- `/sw.js` and `/sw-release.js` must both use the existing no-cache service-worker policy.
- Update discovery must remain best-effort and must not block authentication or healthcare work.
- Activation remains explicit; no background `skipWaiting()` is allowed.
- Reload must follow `controllerchange`, not an arbitrary timer.
- Offline mode must not attempt update checks.
- Foreground/reconnect checks must be throttled.
- Task 0059 privacy-safe caching and network budgets remain binding.

## Review triggers

Review this ADR if AIM adopts native mobile stores, background synchronization, persistent offline healthcare transactions, a server-side update-manifest service, forced security updates, or a framework/service-worker library that changes activation semantics.
