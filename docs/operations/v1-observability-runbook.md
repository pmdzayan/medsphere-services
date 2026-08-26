# V1 Observability Runbook

## Status

This runbook documents the V1 application-level observability foundation.

It does not activate a production monitoring vendor, external log sink, alerting service, metrics backend, tracing backend, or real healthcare-data workflow.

## Scope

The V1 observability foundation currently provides:

- structured JSON service logging through `@medsphere/logger`
- privacy-safe recursive metadata redaction
- bearer/basic credential redaction
- credential-bearing URL redaction
- password, token, OTP, API-key, secret, credential, database URL, Redis URL, SMTP URL, cookie, and authorization-field redaction
- bounded handling of nested and circular metadata
- validated or generated `x-request-id` values
- `x-request-id` response propagation
- correlated HTTP completion events
- HTTP method, route template, status code, and request duration
- bounded server-error telemetry without raw exception messages or stacks
- request-ID correlation between server errors and HTTP responses

## HTTP completion event

Successful and unsuccessful HTTP requests emit structured metadata containing:

- `event`
- `requestId`
- `method`
- framework route template
- `statusCode`
- `durationMs`

The application must log the framework route template only.

Do not add raw URLs, query strings, request bodies, cookies, authorization headers, patient searches, phone numbers, email addresses, or clinical content to this event.

## Server-error event

Unhandled server failures emit only bounded metadata:

- message: `Unhandled HTTP exception`
- safe `requestId`
- HTTP `status`
- bounded `errorType`

Raw server exception messages and stack traces are deliberately excluded from this telemetry boundary.

Client responses continue to use the generic server-error envelope and may include only the safe request ID for correlation.

## Request-ID handling

Inbound `x-request-id` values are accepted only when they satisfy the shared MedSphere request-ID contract.

If the inbound identifier is absent or invalid, the service generates a new UUID.

The selected identifier is attached to the request before application processing, returned through the `x-request-id` response header, available to existing request metadata extraction, and included in HTTP completion and bounded server-error telemetry.

Operators should use the request ID as the primary correlation key when investigating a failed HTTP request.

## Incident investigation

When a user or synthetic runtime reports a failure:

1. obtain the `x-request-id` response header where available;
2. search application logs for the matching `requestId`;
3. identify the HTTP completion event and inspect service, method, route template, status code, and duration;
4. for a server error, locate the matching `Unhandled HTTP exception` event;
5. use `errorType` and internal infrastructure health evidence to continue diagnosis;
6. do not request or add passwords, OTPs, access tokens, refresh tokens, cookies, authorization headers, database URLs, or other credentials to logs.

## Privacy and security rules

Observability data must remain metadata-only.

Never intentionally log passwords or password hashes, plaintext OTPs, tokens, authorization headers, cookies, API/private keys, credential-bearing infrastructure URLs, raw request/response bodies, raw query strings, patient medicine searches, medical records, clinical content, or unnecessary direct identifiers.

The shared logger is a defense-in-depth redaction layer. It is not permission to pass known sensitive data into logging calls. Call sites must still avoid collecting sensitive values.

## Validation

Required validation for changes to this boundary:

- logger redaction regression tests
- request-observability tests
- server-error observability tests
- auth HTTP E2E boundary tests
- TypeScript
- ESLint
- builds
- formatting
- `git diff --check`
- exact-head GitHub CI before merge

## Operational boundaries

This foundation does not yet claim centralized production log ingestion, production log retention policy, alert routing/on-call paging, SLO/SLA monitoring, metrics dashboards, distributed tracing, external APM activation, production incident-response approval, production traffic approval, or approval for real healthcare data.
