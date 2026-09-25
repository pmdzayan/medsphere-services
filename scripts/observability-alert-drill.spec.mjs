import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSyntheticIncidentDrill,
  runIncidentDrill,
  validateAlertmanagerUrl,
} from './observability-alert-drill.mjs';

describe('Task 0049 synthetic incident drill', () => {
  it('builds a bounded alert with no healthcare or identity dimensions', () => {
    const [alert] = buildSyntheticIncidentDrill(new Date('2026-09-25T12:00:00.000Z'));
    assert.deepEqual(alert.labels, {
      alertname: 'AimIncidentDrill',
      severity: 'warning',
      category: 'synthetic_drill',
    });
    const serialized = JSON.stringify(alert);
    assert.doesNotMatch(
      serialized,
      /tenantId|userId|providerId|patient|medicine|email|phone|requestId/i,
    );
  });

  it('requires an HTTPS Alertmanager endpoint', () => {
    assert.throws(() => validateAlertmanagerUrl('http://alerts.example.test'), /HTTPS/);
    assert.doesNotThrow(() => validateAlertmanagerUrl('https://alerts.example.test'));
  });

  it('posts only the synthetic payload and optional bearer token', async () => {
    let received;
    const fetchImpl = async (url, init) => {
      received = { url: String(url), init };
      return { ok: true, status: 200 };
    };

    await runIncidentDrill({
      baseUrl: 'https://alerts.example.test',
      bearerToken: 'fixture-token',
      fetchImpl,
      now: new Date('2026-09-25T12:00:00.000Z'),
    });

    assert.equal(received.url, 'https://alerts.example.test/api/v2/alerts');
    assert.equal(received.init.headers.authorization, 'Bearer fixture-token');
    assert.doesNotMatch(received.init.body, /fixture-token/);
  });
});
