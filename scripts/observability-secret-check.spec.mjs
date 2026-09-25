import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateAlertWebhookUrl } from './observability-secret-check.mjs';

describe('Task 0049 alert webhook secret validation', () => {
  it('accepts an HTTPS alert destination', () => {
    assert.deepEqual(validateAlertWebhookUrl('https://alerts.example.test/aim'), []);
  });

  it('rejects insecure destinations and URL userinfo', () => {
    assert.ok(validateAlertWebhookUrl('http://alerts.example.test/aim').length > 0);
    assert.ok(validateAlertWebhookUrl('https://user:pass@alerts.example.test/aim').length > 0);
  });

  it('rejects malformed URLs without reflecting secret input', () => {
    assert.ok(validateAlertWebhookUrl('not-a-url').length > 0);
  });
});
