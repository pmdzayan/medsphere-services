# V1 Browser and Device Permission Boundary

## Scope

Task 0012 establishes a least-permission frontend boundary. Browser permission
state is device/browser state, is never authorization, and is separate from a
MedSphere preference.

## Rules

- `apps/web/src/lib/browser-permissions.ts` is the only production module that
  may call geolocation, notification, Permissions API, or camera APIs.
- Location is requested only after the nearby-search action and MedSphere's
  localized explanation. Coordinates are transient request inputs: they are not
  placed in browser storage, logs, analytics, identity, tenancy, or authority.
- Location uses one bounded high-accuracy position request. There is no watch,
  background location, or continuous tracking. Ordinary medicine search is the
  manual fallback.
- Notification requests require a contextual action. Browser permission and
  MedSphere notification preferences remain independent.
- Camera access is exposed only as the explicit `startCameraScan` action. Audio
  is disabled, no media is silently retained, and consumers must stop the
  returned session when scanning ends or a component unmounts.
- File selection remains an ordinary user-selected `File` boundary. The shared
  validator enforces allowlisted MIME types and a bounded size without reading
  or exposing arbitrary local paths.
- V1 does not request microphone, contacts, SMS inbox, call logs, background
  location, Bluetooth, directory access, or unrelated device sensors.

## Enforcement and privacy review

`scripts/browser-permission-boundary-check.mjs` scans production frontend code
and fails when direct permission calls bypass the central module or a prohibited
V1 API appears. The same check prohibits geolocation watchers and broad file or
directory picker APIs.

The boundary returns only bounded capability states: `unsupported`, `prompt`,
`granted`, `denied`, `unavailable`, and `error`. It never reflects upstream
exceptions into user copy and performs no permission-related logging. Permission
results do not change authentication, sessions, RBAC, tenant membership, or
provider assignment.
