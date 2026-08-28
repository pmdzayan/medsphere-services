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

---

# V1 Metrics, Export, SLO & Alerting Foundation

This section extends the runbook above with the V1 metrics, centralized telemetry export, SLO, and alerting foundation. It does not weaken or replace anything documented above; it adds a metrics layer alongside the existing logging/redaction/correlation layer.

## Architecture

- In-process, dependency-free metrics registry (`@medsphere/common`'s `MetricsRegistry`, exported as the singleton `appMetrics`): Counter and Histogram primitives with a fixed label-key allowlist enforced at record time.
- `GET /metrics` exposes the registry in Prometheus text-exposition format for scraping by any Prometheus-compatible collector.
- An optional OTLP/HTTP+JSON push exporter (`OtlpMetricsExporter`) can additionally push the same data, on an interval, to an external OTLP-compatible collector -- disabled by default.
- No OpenTelemetry SDK dependency was added: the two metric primitives this task needs are small enough to implement directly, and a Prometheus-text/OTLP-JSON serializer is a stable, well-documented format. This keeps the monitoring foundation itself from becoming a new source of dependency or runtime risk.
- Metrics are recorded as a singleton import at each call site (HTTP middleware, the global exception filter, readiness checks, notification/OTP/reservation outcomes) rather than through constructor injection, so adding metrics never changed the constructor signature of an already-accepted, already-tested class.

## Metrics available

| Metric                                      | Type      | Labels                                       | Meaning                                         |
| ------------------------------------------- | --------- | -------------------------------------------- | ----------------------------------------------- |
| `medsphere_http_requests_total`             | counter   | `service`, `method`, `route`, `status_class` | HTTP requests by outcome class                  |
| `medsphere_http_request_duration_ms`        | histogram | `service`, `method`, `route`                 | HTTP request duration                           |
| `medsphere_http_server_errors_total`        | counter   | `service`, `status_class`                    | Unhandled server errors (5xx)                   |
| `medsphere_dependency_check_total`          | counter   | `dependency`, `outcome`                      | Readiness check attempts (`postgresql`/`redis`) |
| `medsphere_dependency_check_duration_ms`    | histogram | `dependency`                                 | Readiness check duration                        |
| `medsphere_reservation_outcome_total`       | counter   | `outcome`                                    | Reservation creation attempts                   |
| `medsphere_notification_delivery_total`     | counter   | `channel`, `outcome`                         | Notification worker delivery attempts           |
| `medsphere_otp_dispatch_total`              | counter   | `outcome`                                    | OTP provider dispatch attempts                  |
| `medsphere_metrics_exporter_failures_total` | counter   | (none)                                       | OTLP export failures                            |

`route` is always the framework route template (e.g. `/api/inventory/providers/:providerId/reservations`), never a raw URL. Every label key is drawn from a fixed allowlist enforced in code (`service`, `method`, `route`, `status_class`, `dependency`, `outcome`, `channel`, `provider`) -- recording a metric with any other label key throws immediately, so a future call site cannot silently introduce a tenant ID, phone number, request ID, medicine name, or other high-cardinality/sensitive value as a label.

## Privacy boundary (extends the rules above)

In addition to every rule already stated above for logs, metrics must never carry: raw URLs, query strings, tenant IDs, user IDs, emails, phone numbers, OTPs, medicine/product/search text, patient data, or request IDs as a label. This is enforced structurally (the label allowlist), not only by convention -- see `metrics-registry.spec`/`.spec.mjs` tests for `rejects a label key outside the allowed low-cardinality allowlist`.

The `/metrics` endpoint is unauthenticated (matching `/health/live` and `/health/ready`'s existing convention), since a scrape endpoint is typically reached only from an internal network/collector, not end users. Restricting network access to `/metrics` in a real deployment (e.g. via network policy, ingress rule, or a reverse-proxy allowlist) is a deployment-time concern this endpoint does not enforce itself.

## Exporter configuration

Push export to an external OTLP-compatible collector is **disabled by default** (`TELEMETRY_METRICS_EXPORT_ENABLED=false`) and local-safe: leaving every related variable unset is a fully supported configuration, and `/metrics` scraping works regardless of export being enabled.

| Variable                                               | Purpose                                                                                                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEMETRY_METRICS_EXPORT_ENABLED`                     | `true`/`false`. Must be exactly one of these two values.                                                                                           |
| `TELEMETRY_SERVICE_NAME`                               | Reported as the OTLP `service.name` resource attribute.                                                                                            |
| `TELEMETRY_METRICS_EXPORT_ENDPOINT`                    | Collector URL. Must be HTTPS -- a non-HTTPS endpoint fails configuration parsing closed.                                                           |
| `TELEMETRY_METRICS_EXPORT_TIMEOUT_MS`                  | Bounded 250-10000ms; out-of-range values fail closed.                                                                                              |
| `TELEMETRY_METRICS_EXPORT_INTERVAL_MS`                 | Minimum 5000ms.                                                                                                                                    |
| `TELEMETRY_METRICS_EXPORT_HEADER_CREDENTIAL_REFERENCE` | Optional: names another env var holding a collector auth header value. The referenced variable must exist when set, or configuration fails closed. |

Malformed configuration never crashes the service: `main.ts` catches a configuration error, logs one bounded warning (`metrics_export_config_invalid`), and leaves export disabled -- `/metrics` scraping and the rest of the application continue normally.

A monitoring backend outage never fails a business request: `OtlpMetricsExporter.exportOnce()` never throws. Every failure increments the bounded `medsphere_metrics_exporter_failures_total` counter and is logged only on the 1st and then every 10th consecutive failure (never per-attempt), so a persistent collector outage cannot create a log storm. The exporter never references the OTLP endpoint, credential, or payload content in a log line -- only a bounded occurrence count.

## SLO definitions (initial engineering thresholds, not a contractual SLA)

**These are conservative initial engineering targets for internal operational awareness. They are not a contractual guarantee, SLA, or promise to any customer.**

| Indicator                         | Target (initial)                                          |
| --------------------------------- | --------------------------------------------------------- |
| HTTP availability (non-5xx rate)  | >= 99.5% over rolling 30 days                             |
| Server-error rate                 | <= 1% over rolling 5 minutes                              |
| p95 latency                       | <= 1500 ms                                                |
| p99 latency                       | <= 3000 ms                                                |
| PostgreSQL readiness              | >= 99.9% of readiness checks succeed over rolling 30 days |
| Redis readiness                   | >= 99.9% of readiness checks succeed over rolling 30 days |
| Notification worker health        | < 5% of delivery attempts fail over rolling 15 minutes    |
| Reservation workflow failure rate | <= 2% over rolling 15 minutes                             |

These mirror the thresholds already accepted for V1 CI performance certification (error rate <=1%, p95 <=1500ms, p99 <=3000ms -- see `docs/operations/v1-performance-reliability-certification.md`) rather than inventing a separate, inconsistent bar.

## Alert rules

Provider-neutral, executable Prometheus alerting rules are defined in `docs/operations/v1-alert-rules.prometheus.yml` (valid Prometheus rule-file YAML, importable into any Prometheus-compatible alerting system without modification). Every rule declares a warning threshold, a critical threshold, a bounded evaluation window (`for:`), and relies on Prometheus's built-in recovery semantics (an alert resolves once its expression is no longer true for the evaluation window) -- no rule fires on a single event.

Covered conditions: service unavailable, repeated readiness failure, PostgreSQL unavailable, Redis unavailable, elevated 5xx rate, abnormal latency, notification worker repeatedly failing, and exporter/collector unhealthy.

## Dashboard specification

An operator dashboard (in any Prometheus-compatible visualization tool) should present:

1. **Traffic** -- `sum(rate(medsphere_http_requests_total[5m])) by (route)`
2. **Error rate** -- `sum(rate(medsphere_http_server_errors_total[5m])) / sum(rate(medsphere_http_requests_total[5m]))`
3. **Latency p50/p95/p99** -- `histogram_quantile(0.50|0.95|0.99, sum(rate(medsphere_http_request_duration_ms_bucket[5m])) by (le))`
4. **Service readiness** -- `/health/live` and `/health/ready` scrape/uptime, plus `medsphere_dependency_check_total{outcome="failure"}` rate
5. **PostgreSQL health** -- `medsphere_dependency_check_total{dependency="postgresql"}` success rate and `medsphere_dependency_check_duration_ms{dependency="postgresql"}` percentiles
6. **Redis health** -- same, `dependency="redis"`
7. **Reservations** -- `medsphere_reservation_outcome_total` success/failure rate
8. **Notification delivery** -- `medsphere_notification_delivery_total` by `channel`/`outcome`
9. **OTP dispatch** -- `medsphere_otp_dispatch_total` success/failure rate

No panel may break down by tenant, medicine/search text, phone number, or email -- none of that data exists in these metrics to break down by in the first place.

## Incident workflow (extends the section above)

For a metrics-flagged incident (an alert fired, not a single user report):

1. identify which alert fired and its current value vs. threshold from the dashboard;
2. correlate the time window against the HTTP completion/server-error log events described above, using `requestId` for any specific failed request a user also reported;
3. check `/health/ready` and the `medsphere_dependency_check_total`/`_duration_ms` metrics to rule in/out PostgreSQL or Redis;
4. for a notification/OTP-specific alert, check `medsphere_notification_delivery_total`/`medsphere_otp_dispatch_total` broken down by `outcome` (never by tenant or destination);
5. for an exporter-health alert, remember this reflects telemetry pipeline health only -- it does not by itself indicate a business-impacting outage;
6. do not add tenant IDs, phone numbers, OTPs, or other sensitive values to any incident notes derived from this data -- none of it is present in the source metrics.

## What still requires production deployment/vendor activation

This foundation does **not** claim centralized production monitoring is operational. The following remain external, deployment-only steps:

- deploying and operating an actual Prometheus-compatible collector/backend (or OTLP-compatible collector) to scrape `/metrics` or receive pushed exports;
- configuring real alert routing/on-call paging (e.g. Alertmanager, PagerDuty, Opsgenie) to consume `docs/operations/v1-alert-rules.prometheus.yml`;
- building and publishing the actual dashboard described above in a real visualization tool;
- distributed tracing and external APM remain out of scope for this task, as stated in the original runbook;
- converting the initial engineering SLO targets above into any customer-facing SLA is a separate business/legal decision, not a code change.

Do not claim centralized production monitoring is operational until an actual collector/backend has been deployed and a real end-to-end scrape or export has been tested against it.

## Validation (extends the section above)

Additional required validation for changes to the metrics/export boundary:

- `packages/common` metrics/exporter test suite (`node --test test/*.spec.mjs`)
- existing logger/redaction, request-observability, and server-error observability tests (must continue passing unchanged)
- readiness-service tests (PostgreSQL-backed where infrastructure is available)
- TypeScript, ESLint, Prettier
- `git diff --check`
