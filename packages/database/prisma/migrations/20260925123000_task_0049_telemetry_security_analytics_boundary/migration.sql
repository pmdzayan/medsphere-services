-- Task 0049 — Production Telemetry, Security Monitoring & De-identified Analytics Boundary
--
-- This migration creates a read model only. It adds no operational write path,
-- copies no identifiers, and grants no analytics access to PUBLIC.
--
-- A deployment DBA may grant USAGE on schema aim_analytics and SELECT on the
-- approved view to a separate read-only BI principal. That principal must not
-- receive privileges on public/OLTP tables.

CREATE SCHEMA IF NOT EXISTS aim_analytics;

REVOKE ALL ON SCHEMA aim_analytics FROM PUBLIC;

CREATE OR REPLACE VIEW aim_analytics.daily_audit_activity
WITH (security_barrier = true)
AS
SELECT
  date_trunc('day', "occurredAt")::date AS activity_date,
  CASE split_part("eventType", '.', 1)
    WHEN 'authentication' THEN 'authentication'
    WHEN 'authorization' THEN 'authorization'
    WHEN 'billing' THEN 'billing'
    WHEN 'compliance' THEN 'compliance'
    WHEN 'inventory' THEN 'inventory'
    WHEN 'patient' THEN 'patient'
    WHEN 'pharmacy' THEN 'pharmacy'
    WHEN 'platform' THEN 'platform'
    WHEN 'privacy' THEN 'privacy'
    ELSE 'other'
  END::text AS domain,
  "outcome"::text AS outcome,
  COUNT(*)::bigint AS event_count
FROM public."AuditEvent"
-- Exclude the current day so low-latency operational monitoring never depends
-- on this BI boundary and partial-day slices cannot be used as near-real-time
-- activity probes.
WHERE "occurredAt" < date_trunc('day', CURRENT_TIMESTAMP)
GROUP BY
  date_trunc('day', "occurredAt")::date,
  CASE split_part("eventType", '.', 1)
    WHEN 'authentication' THEN 'authentication'
    WHEN 'authorization' THEN 'authorization'
    WHEN 'billing' THEN 'billing'
    WHEN 'compliance' THEN 'compliance'
    WHEN 'inventory' THEN 'inventory'
    WHEN 'patient' THEN 'patient'
    WHEN 'pharmacy' THEN 'pharmacy'
    WHEN 'platform' THEN 'platform'
    WHEN 'privacy' THEN 'privacy'
    ELSE 'other'
  END,
  "outcome"::text
-- Small-cohort suppression. Counts below this threshold are not exposed at all.
HAVING COUNT(*) >= 20;

REVOKE ALL ON aim_analytics.daily_audit_activity FROM PUBLIC;

COMMENT ON SCHEMA aim_analytics IS
  'Task 0049 de-identified, read-only analytics boundary. No OLTP writes or direct identifiers.';

COMMENT ON VIEW aim_analytics.daily_audit_activity IS
  'Platform-wide daily aggregate audit activity. No tenant/user/provider/resource dimensions; cohorts below 20 are suppressed.';
