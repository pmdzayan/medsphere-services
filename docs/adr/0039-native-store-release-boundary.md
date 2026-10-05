# ADR-039: Native Store Release Boundary

**Status:** Accepted  
**Date:** 2026-10-05  
**Task:** UM14.6

## Decision

AIM will treat Google Play and the Apple App Store as the only approved native update distribution targets when AIM native applications are published.

The repository does not currently contain accepted Android or iOS application code. UM14.6 therefore establishes the server-owned release boundary without pretending that a native application already exists.

The canonical runtime configuration is:

- Android:
  - `AIM_ANDROID_PACKAGE_ID`
  - `AIM_ANDROID_PLAY_STORE_URL`
- iOS:
  - `AIM_IOS_APP_STORE_ID`
  - `AIM_IOS_APP_STORE_URL`

A platform is considered published only when both of its required values exist and pass strict validation.

Android targets must:

- use HTTPS;
- use the exact `play.google.com` host;
- use `/store/apps/details`;
- contain an `id` query value that exactly matches `AIM_ANDROID_PACKAGE_ID`;
- contain no credentials, fragment, or unapproved query parameters.

iOS targets must:

- use HTTPS;
- use the exact `apps.apple.com` host;
- end in `/id<configured numeric app-store-id>`;
- contain no credentials, query string, or fragment.

If a platform has no approved published target, native update resolution fails closed.

## Reason and context

UM14.3–UM14.5 establish web/PWA update discovery, severity, and minimum-client enforcement.

Native mobile updates operate under a different distribution trust model. AIM must never redirect users to arbitrary APK/IPA downloads, third-party stores, shortened links, or caller-supplied URLs when the official store path is available.

The current repository has no native application implementation, so store-launch UI cannot be truthfully certified yet. The correct acceptance boundary now is strict official-store target validation and a fail-closed unpublished state.

## Trust boundary

Store URLs are server/operator configuration. They are never accepted from client request parameters, user input, provider data, or tenant configuration.

Store-target metadata is not authentication, authorization, clinical policy, or evidence that an application has passed Google/Apple review.

## Alternatives

### Hard-code placeholder store URLs

Rejected. Placeholder URLs would create false launch readiness and could direct users to non-existent applications.

### Allow any HTTPS URL

Rejected. HTTPS alone does not prove that a destination is an official app store.

### Allow direct APK/IPA download URLs

Rejected. UM14.6 intentionally preserves official-store distribution and review boundaries.

### Add native UI to the web repository now

Rejected. No accepted native application exists in this repository.

## Consequences

- Future Android/iOS clients have one canonical official-store target contract.
- Unpublished platforms fail closed rather than receiving fabricated links.
- Operators cannot accidentally configure a third-party/sideload destination.
- Actual native app update screens remain blocked until native application code exists and can be certified against this boundary.

## Implementation constraints

- Android and iOS configuration must be paired per platform.
- Store URLs are server-owned.
- Arbitrary redirect URLs are forbidden.
- Package/store identifiers must match the official URL.
- No native publication claim may be made solely because store configuration exists.
- Native-store certification must be revisited when Android/iOS applications are added.

## Review triggers

Review this ADR when AIM adds Android/iOS source code, changes application identifiers, adopts enterprise/private distribution, adds country-specific official store routing, or uses an alternative platform distribution mechanism.
