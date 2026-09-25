# Task 0049 — Production Telemetry, Security Monitoring & De-identified Analytics Boundary

**Engineering status:** implemented on the Task 0049 branch.  
**Production approval status:** not granted by this task. Task 0050 remains the pharmacy-first release-certification gate.  
**Legal/compliance status:** retention and external-tool decisions still require the qualified review described by Task 0045.

## Purpose

Task 0049 turns AIM's existing privacy-bounded metrics and OpenTelemetry Collector foundation into an operable production-reference monitoring boundary without creating a second healthcare-data authority.

The design separates three concerns:

1. operational telemetry — low-cardinality AIM metrics only;
2. security monitoring — bounded categories derived after durable audit evidence commits;
3. business intelligence — delayed, suppressed, de-identified read models in a separate schema.

No monitoring or BI component may write healthcare transactions.

## Production-reference monitoring path

The repository-owned reference path is:

`auth-service /metrics -> OpenTelemetry Collector -> Prometheus -> Alertmanager -> operator HTTPS webhook`

Components are pinned:

- OpenTelemetry Collector contrib: `0.161.0`;
- Prometheus: `3.14.0`;
- Alertmanager: `0.34.1`.

SigNoz, Wazuh and Superset are **not activated** by Task 0049. Their license, security, administration and privacy boundaries must be reviewed separately before deployment. Superset may only ever sit behind the de-identified analytics boundary, never directly on AIM OLTP with broad access.

## Collector privacy boundary

The collector still scrapes only `auth-service:3000/metrics`.

Before export it now applies an explicit metric-name allowlist for AIM application metrics plus target-health `up`. The legacy-compatible metric prefix remains an internal stable identifier and is not user-facing branding.

The collector has no log or trace receiver and no debug exporter. It cannot receive request bodies, cookies, authorization headers, patient searches, medicine names, tenant IDs, user IDs, phone numbers or emails through this configuration.

A collector/backend outage is outside the business-request path and must never determine authentication, stock, reservation, billing or pickup outcomes.

## Prometheus and Alertmanager

`compose/docker-compose.observability.yml` is a production-reference layer, not part of ordinary development startup.

Prometheus:

- stores metrics for at most 30 days;
- caps the TSDB at 10 GB;
- scrapes the collector rather than AIM application/database internals;
- applies a second metric-name allowlist;
- loads the repository-owned V1 alert rules.

Alertmanager:

- retains alert state for 720 hours (30 days);
- groups by bounded `alertname` and `severity`;
- routes critical alerts more frequently than warnings;
- reads the delivery destination from `/run/secrets/aim-alert-webhook-url`;
- stores no alert destination in source control.

Prometheus and Alertmanager use Compose `expose`, not host `ports`. They share an internal-only `aim-observability` network; only the Collector bridges the application network into it. Alertmanager alone also joins `aim-alert-egress` so it can make the approved outbound HTTPS webhook call. Human/API access must be added only through an operator-owned authenticated TLS ingress. Direct public port exposure is prohibited.

## Alert secret activation

The alert webhook value is a deployment secret and must contain an HTTPS URL.

Before starting the monitoring stack:

```bash
AIM_ALERT_WEBHOOK_URL_FILE=/secure/path/aim-alert-webhook-url pnpm observability:validate-alert-secret
```

The validator never prints the configured URL.

Then run the accepted app/collector, monitoring, and bounded-log layers together:

```bash
docker compose \
  -f compose/docker-compose.services.yml \
  -f compose/docker-compose.observability.yml \
  -f compose/docker-compose.logging-policy.yml \
  up -d auth-service notification-worker aim-otel-collector aim-alertmanager aim-prometheus
```

The external AIM networks and normal application secrets must already exist.

## Local log retention fallback

Task 0049 deliberately does not activate a centralized production log vendor. That would create a new high-risk data sink before the release/privacy review.

`compose/docker-compose.logging-policy.yml` applies Docker's local rotating driver to the accepted runtime/monitoring services with:

- 20 MB maximum file size;
- 10 retained files;
- compression enabled.

This is a bounded-disk fallback, not a jurisdiction-specific legal retention period. A production platform may enforce a shorter reviewed time-based retention policy, but must not extend retention merely for debugging convenience.

The shared logger now redacts direct identity/contact keys and identifier-like free text in addition to credentials. Safe `requestId` metadata remains available for incident correlation.

## Security monitoring

Security telemetry is derived from AIM's accepted `AuditEvent` catalogue only after the corresponding audit create succeeds. The durable database audit trail remains authoritative; the in-memory metric is operational telemetry and does not replace commit evidence.

`medsphere_security_event_total{category,outcome}` exposes only bounded categories such as:

- `authorization_denied`;
- `credential_replay`;
- `workstation_unlock_failed`;
- `join_code_rejected`;
- `account_control`;
- `session_security`.

It never carries a tenant, membership, user, provider, IP address, email, phone, request ID or resource identifier.

Prometheus rules cover:

- any credential replay evidence — critical;
- repeated workstation unlock failures — warning;
- authorization-denial spikes — warning;
- organization join-code rejection spikes — warning.

Telemetry tells operators that a condition exists. Investigation of a particular actor or tenant must use the existing authorized audit workflow, not a new identifying telemetry dimension.

## Synthetic incident drill

A release candidate must prove the alert path with a synthetic alert that contains no healthcare data.

Use only an externally exposed, authenticated TLS Alertmanager ingress:

```bash
AIM_ALERTMANAGER_URL=https://monitoring.example.invalid \
AIM_ALERTMANAGER_BEARER_TOKEN_FILE=/secure/path/alertmanager-token \
pnpm observability:incident-drill
```

The drill posts only:

- alert name `AimIncidentDrill`;
- severity `warning`;
- category `synthetic_drill`;
- fixed text explicitly stating that it contains no patient, tenant, provider, medicine or user data;
- bounded start/end timestamps.

The operator must verify delivery and resolution in the approved alert channel. Task 0050 must capture real-environment evidence; repository unit tests only prove payload and transport-policy shape.

## De-identified analytics boundary

Task 0049 creates schema `aim_analytics` and view `aim_analytics.daily_audit_activity`.

The view exposes only:

- calendar day;
- coarse event domain;
- bounded audit outcome;
- aggregate event count.

It deliberately:

- excludes current-day/near-real-time activity;
- exposes no tenant, user, membership, provider, resource, request, IP, user-agent or metadata dimension;
- suppresses every cohort smaller than 20;
- is not updatable;
- grants nothing to `PUBLIC`.

The view is a reporting read model, not an operational source of truth.

### BI principal

A deployment DBA may create a separate read-only principal out of band. Credentials must never be committed.

The deployment DBA creates the `aim_bi_reader` LOGIN/credential out of band, then applies `packages/database/scripts/task-0049-bi-reader-grants.sql`. The script sets `default_transaction_read_only`, revokes table/sequence privileges in `public`, removes `CREATE` on the public schema, and grants only `USAGE` on `aim_analytics` plus `SELECT` on the approved view. It deliberately does not create a role or password.

Do **not** grant the BI principal broad `SELECT` on the `public` schema or AIM OLTP tables. Do not grant INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, CREATE or ownership privileges.

If Superset is approved later, it must use this type of isolated principal/read model. It must not receive the normal application database credential.

## Retention and Task 0045

Task 0049 defines engineering defaults for operational telemetry, not statutory periods.

- Prometheus metrics: 30-day / 10-GB cap.
- Alertmanager state: 30 days.
- Local container logs: size-bounded rotating fallback.
- Durable security/audit evidence: remains governed by Task 0045 and is not deleted by this telemetry task.
- Analytics view: computed from retained source evidence; it stores no separate rows.

Qualified legal/compliance owners must decide whether deployed-jurisdiction requirements demand shorter or longer approved evidence retention, and any change must preserve Task 0045 legal-hold precedence.

## Outage behavior

Monitoring is fail-open with respect to business processing and fail-closed with respect to access:

- collector, Prometheus or Alertmanager failure must not fail a patient/pharmacy request;
- monitoring services receive no OLTP write credential;
- BI receives no OLTP write privilege;
- monitoring admin surfaces have no host port by default;
- telemetry configuration must never be used as a fallback identity or authorization system.

## Required Task 0049 evidence

Engineering acceptance requires:

- collector config/privacy architecture tests;
- logger identifier/credential redaction tests;
- security-event metric classification and post-audit-create-success tests;
- Prometheus/Alertmanager retention and routing static tests;
- HTTPS alert-secret validator tests;
- synthetic incident-drill payload/transport tests;
- analytics static boundary tests;
- clean and populated 0049 migration/upgrade verification;
- full formatting, lint, unit/integration, build and existing exact-head certification workflows.

Real production activation, authenticated TLS ingress evidence, real alert delivery evidence, security review, recovery/rollback drills and final go/no-go remain Task 0050.
