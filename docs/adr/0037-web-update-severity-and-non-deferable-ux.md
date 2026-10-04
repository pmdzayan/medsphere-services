# ADR-037: Web Update Severity and Non-Deferable Required UX

**Status:** Accepted  
**Date:** 2026-10-04  
**Task:** UM14.4

## Decision

AIM will extend the UM14.3 web/PWA release marker with bounded, non-secret update policy:

- `updateMode`: `optional` or `required`
- `updateReason`: `routine`, `security`, or `incompatible`

Routine releases default to `optional/routine`.

A release may be marked `required` only when the release pipeline explicitly supplies a bounded non-secret reason. Required routine releases are invalid. An `incompatible` release may not be marked optional.

The waiting service worker exposes only this bounded release policy to the controlled page through a `GET_RELEASE_POLICY` / `AIM_RELEASE_POLICY` message exchange. No credential, environment secret, patient data, organization data, vulnerability details, or arbitrary release note content is sent through this channel.

When AIM discovers a waiting update:

- optional releases keep the UM14.3 **Later** and **Update now** controls;
- required releases remove the **Later** control and present a persistent required-update notice;
- update activation remains explicit and still reloads only after `controllerchange`;
- policy resolution temporarily withholds the defer action so a required release cannot be dismissed before its policy is known.

Legacy or malformed waiting workers that do not expose valid UM14.4 policy are treated as optional for compatibility. Server-side rejection of unsafe/unsupported clients is not part of UM14.4 and remains the responsibility of UM14.5.

## Reason and context

UM14.3 made new frontend builds discoverable and safely user-activated, but every update was effectively optional. AIM needs a controlled distinction between ordinary releases that can wait and releases that operators have explicitly classified as critical security or incompatible.

The policy must not become a new secret-bearing manifest, a vulnerability disclosure channel, or a substitute for server-side client compatibility enforcement.

## Alternatives

### Make every update mandatory

Rejected. Routine frontend changes should not interrupt pharmacy or future clinical workflows unnecessarily.

### Keep every update optional

Rejected. AIM needs a way to clearly require urgent security or incompatible releases once they are published.

### Add a new authenticated backend update API in UM14.4

Deferred. A release-bound worker policy is sufficient for the UX distinction and avoids creating a new healthcare API trust boundary. UM14.5 may introduce stronger server-authoritative compatibility enforcement.

### Put vulnerability details in the client marker

Rejected. The client needs only bounded severity/reason categories. Sensitive exploit or vulnerability detail belongs in controlled security evidence, not public PWA metadata.

## Consequences

- Routine releases remain deferable.
- Required security/incompatible releases cannot be dismissed through the normal update UI.
- A severity-only deployment changes `sw-release.js` bytes and is discoverable without changing handwritten `sw.js`.
- Required-update UX remains explicit; AIM does not silently reload active work.
- A pre-UM14.4 or malformed worker falls back to optional UX rather than trapping users.
- UM14.4 alone does not prove that an old client is technically blocked from backend/API use.

## Implementation constraints

- `AIM_WEB_UPDATE_MODE` accepts only `optional` or `required`.
- `AIM_WEB_UPDATE_REASON` accepts only `routine`, `security`, or `incompatible`.
- Required releases must provide an explicit reason.
- `required/routine` is forbidden.
- `optional/incompatible` is forbidden.
- The generated marker must remain non-secret and gitignored.
- The service worker may expose only bounded release policy through the policy message.
- Required UX must not expose sensitive vulnerability detail.
- Activation remains explicit; no background `skipWaiting()` or arbitrary reload timer is allowed.
- Task 0059 static-only cache/privacy boundaries remain binding.
- Hard minimum-client/version rejection is out of scope until UM14.5.

## Review triggers

Review this ADR when AIM introduces minimum-supported-client enforcement, a server-side signed update manifest, native app-store releases, emergency token invalidation, or any release policy that needs per-tenant/per-region runtime decisions.
