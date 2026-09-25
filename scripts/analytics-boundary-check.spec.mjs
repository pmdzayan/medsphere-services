import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkAnalyticsBoundary } from './analytics-boundary-check.mjs';

describe('Task 0049 de-identified analytics boundary', () => {
  it('accepts the committed suppressed read model', () => {
    assert.deepEqual(checkAnalyticsBoundary(), []);
  });

  it('rejects a direct tenant identifier dimension', () => {
    const unsafe = `
      CREATE SCHEMA IF NOT EXISTS aim_analytics;
      REVOKE ALL ON SCHEMA aim_analytics FROM PUBLIC;
      CREATE OR REPLACE VIEW aim_analytics.daily_audit_activity
      WITH (security_barrier = true) AS
      SELECT "tenantId", COUNT(*) AS event_count
      FROM public."AuditEvent"
      WHERE "occurredAt" < date_trunc('day', CURRENT_TIMESTAMP)
      GROUP BY "tenantId"
      HAVING COUNT(*) >= 20;
      REVOKE ALL ON aim_analytics.daily_audit_activity FROM PUBLIC;
      COMMENT ON SCHEMA aim_analytics IS 'test';
    `;
    assert.ok(
      checkAnalyticsBoundary(unsafe).some((failure) => failure.includes('tenantId')),
    );
  });

  it('rejects write-capable analytics grants', () => {
    const unsafe = `
      CREATE SCHEMA IF NOT EXISTS aim_analytics;
      REVOKE ALL ON SCHEMA aim_analytics FROM PUBLIC;
      CREATE OR REPLACE VIEW aim_analytics.daily_audit_activity
      WITH (security_barrier = true) AS
      SELECT date_trunc('day', "occurredAt")::date activity_date,
             'other'::text domain, "outcome"::text outcome, COUNT(*)::bigint event_count
      FROM public."AuditEvent"
      WHERE "occurredAt" < date_trunc('day', CURRENT_TIMESTAMP)
      GROUP BY 1,2,3 HAVING COUNT(*) >= 20;
      REVOKE ALL ON aim_analytics.daily_audit_activity FROM PUBLIC;
      GRANT UPDATE ON aim_analytics.daily_audit_activity TO aim_bi_reader;
      COMMENT ON SCHEMA aim_analytics IS 'test';
    `;
    assert.ok(
      checkAnalyticsBoundary(unsafe).some((failure) => failure.includes('write-capable')),
    );
  });
});
