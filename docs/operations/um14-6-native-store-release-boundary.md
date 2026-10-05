# UM14.6 — Native Store Release Boundary

## Current repository state

AIM does not currently contain accepted Android or iOS application code.

UM14.6 therefore establishes the official-store configuration and validation boundary only. It does not claim that a native application is published.

## Android publication configuration

```text
AIM_ANDROID_PACKAGE_ID=com.example.aim
AIM_ANDROID_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.example.aim
```

Both variables must be configured together.

The URL must use the official Google Play app-details endpoint and the `id` value must exactly match the configured package identifier.

## iOS publication configuration

```text
AIM_IOS_APP_STORE_ID=1234567890
AIM_IOS_APP_STORE_URL=https://apps.apple.com/in/app/aim/id1234567890
```

Both variables must be configured together.

The URL must use `apps.apple.com` and its path must end in the configured numeric App Store ID.

## Fail-closed behavior

When a platform has no approved target, `requireNativeStoreReleaseTarget(platform)` throws and the caller must not invent, redirect, or fall back to another URL.

Malformed official-store configuration is also rejected.

## Security rules

Never use:

- arbitrary client-supplied store URLs;
- URL shorteners;
- third-party download pages;
- direct APK/IPA links;
- tenant-specific store destinations without a future accepted ADR;
- secrets or patient/organization data in store URLs.

## Native-client integration rule

When an accepted Android/iOS client is added, its required-update screen must consume the canonical platform target from this boundary or an accepted server contract derived from it.

The native client must not hard-code an unofficial fallback.

## Validation

The production-runtime certification verifies:

- unpublished platforms return null in the boundary;
- paired configuration is mandatory;
- Google Play hostname/path/package matching;
- Apple hostname/path/store-ID matching;
- arbitrary hosts are rejected;
- unpublished native target resolution fails closed.

Repository lint, formatting, build, Task 0060 and exact-head CI remain mandatory.
