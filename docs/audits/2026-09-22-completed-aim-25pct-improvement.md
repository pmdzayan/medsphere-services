# Completed AIM 25% Improvement Tranche

## Status

Implementation candidate on `cto/0042a-completed-aim-25pct-improvement`.

This tranche improves already-built AIM capabilities. It does not count unfinished
V1 product capabilities as "improvement" and does not alter AIM's healthcare
authority, tenant isolation, inventory ledger, FEFO rules, reservation integrity,
privacy authorization, or audit authority.

## Completed improvement areas

### 1. Organization-aware workspace design system

- Added semantic organization theme tokens.
- Added distinct palettes for Pharmacy, Hospital, Laboratory, Clinic, Blood Bank,
  Supplier, and personal/patient workspaces.
- Bound the protected shell to the server-derived
  `session.context.organizationType`.
- Added coordinated 440 ms color/surface transitions.
- Added reduced-motion behavior that collapses transitions to 1 ms.
- Shared buttons, inputs, active navigation, sidebar, header, and identity marks
  consume the semantic theme layer.

### 2. Google authentication UX and security correction

- Restored `Continue with Google` to the login UI.
- Converted Google login from the obsolete tenant-slug path to identity-first,
  slug-free membership resolution.
- Resolves Google identity by the provider subject, checks the verified email,
  and returns only that identity's active organization memberships.
- Re-verifies the Google credential before organization selection.
- Requires an exact UUID v4 membership identifier and an exact request shape at
  both Nest DTO and BFF boundaries.
- Does not expose access/refresh tokens to browser JavaScript.
- Routes personal `NONE` identities to the patient workspace.
- In local development, a missing Google OAuth client ID now shows a disabled,
  explicit setup state instead of silently hiding the option.
- Apple sign-in remains intentionally absent because AIM has no accepted Apple
  identity authority yet; no fake UI was introduced.

### 3. Privacy-safe PWA resilience

- Added a service worker and root registration runtime.
- Cache scope is intentionally limited to hashed Next static assets, manifest,
  and icon assets.
- API traffic, navigations, authenticated pages, medicine data, patient data,
  reservations, and inventory data are never cached by the service worker.
- Added a fail-closed architecture audit for this cache boundary.

### 4. Real-browser accessibility certification

- Added Chromium checks for public routes covering:
  - valid language/direction attributes;
  - single main landmark;
  - duplicate IDs;
  - missing image alt attributes;
  - unnamed interactive controls;
  - keyboard-visible focus;
  - reduced-motion behavior;
  - actual service-worker registration.
- Wired these checks into the existing real runtime Dashboard certification.

### 5. OpenTelemetry Collector operational reuse

- Added a separately operated OpenTelemetry Collector reference service.
- Pinned `otel/opentelemetry-collector-contrib:0.161.0` rather than using
  `latest`.
- Collector scrapes only AIM's existing bounded `/metrics` endpoint.
- Added memory limiting and batching before export.
- Collector Prometheus and health endpoints bind to localhost only.
- Added architecture tests preventing accidental public exposure or
  patient/tenant identifiers in collector configuration.
- Updated the observability runbook with deployment and privacy boundaries.

## Validation gates

This candidate must pass the repository's existing quality, migration/drift,
populated-upgrade, lint, unit/integration, build, runtime, reservation,
performance, backup/recovery, deployment-safety, and browser certification
workflows before it is accepted or merged.

## Non-goals

This tranche does not add a new healthcare feature, Apple identity provider,
offline healthcare mutations, generic POS/ERP logic, a second authorization
system, a second inventory authority, or a production monitoring vendor.
