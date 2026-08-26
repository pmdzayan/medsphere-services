import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  LOG_CIRCULAR_VALUE,
  LOG_REDACTED_VALUE,
  isSensitiveLogKey,
  redactLogInfo,
  redactLogValue,
  sanitizeLogString,
} = require('../dist/index.js');

test('recognizes sensitive metadata keys without treating ordinary fields as secrets', () => {
  assert.equal(isSensitiveLogKey('authorization'), true);
  assert.equal(isSensitiveLogKey('password'), true);
  assert.equal(isSensitiveLogKey('passwordHash'), true);
  assert.equal(isSensitiveLogKey('accessToken'), true);
  assert.equal(isSensitiveLogKey('refreshToken'), true);
  assert.equal(isSensitiveLogKey('idToken'), true);
  assert.equal(isSensitiveLogKey('AUTH_OTP'), true);
  assert.equal(isSensitiveLogKey('databaseUrl'), true);
  assert.equal(isSensitiveLogKey('REDIS_CLUSTER_URL'), true);
  assert.equal(isSensitiveLogKey('apiKey'), true);

  assert.equal(isSensitiveLogKey('requestId'), false);
  assert.equal(isSensitiveLogKey('tenantId'), false);
  assert.equal(isSensitiveLogKey('statusCode'), false);
  assert.equal(isSensitiveLogKey('durationMs'), false);
  assert.equal(isSensitiveLogKey('tokenCount'), false);
});

test('redacts nested credentials while preserving safe operational metadata', () => {
  const input = {
    requestId: 'request-123',
    tenantId: 'tenant-123',
    statusCode: 200,
    auth: {
      accessToken: 'secret-access-token',
      password: 'secret-password',
      provider: 'google',
    },
    headers: {
      authorization: 'Bearer secret-token',
      'user-agent': 'synthetic-test-agent',
    },
  };

  const output = redactLogValue(input);

  assert.deepEqual(output, {
    requestId: 'request-123',
    tenantId: 'tenant-123',
    statusCode: 200,
    auth: {
      accessToken: LOG_REDACTED_VALUE,
      password: LOG_REDACTED_VALUE,
      provider: 'google',
    },
    headers: {
      authorization: LOG_REDACTED_VALUE,
      'user-agent': 'synthetic-test-agent',
    },
  });
});

test('sanitizes bearer/basic credentials and credential-bearing URLs in free text', () => {
  const input =
    'Bearer abc.def.ghi Basic YWRtaW46c2VjcmV0 postgresql://dbuser:dbpass@db.internal:5432/medsphere token=plain-secret';

  const output = sanitizeLogString(input);

  assert.equal(output.includes('abc.def.ghi'), false);
  assert.equal(output.includes('YWRtaW46c2VjcmV0'), false);
  assert.equal(output.includes('dbuser'), false);
  assert.equal(output.includes('dbpass'), false);
  assert.equal(output.includes('plain-secret'), false);

  assert.match(output, /Bearer \[REDACTED\]/);
  assert.match(output, /Basic \[REDACTED\]/);
  assert.match(output, /postgresql:\/\/\[REDACTED\]@db\.internal:5432\/medsphere/);
  assert.match(output, /token=\[REDACTED\]/);
});

test('redacts sensitive fields from the exact object passed through the Winston format', () => {
  const info = {
    level: 'error',
    message: 'request failed',
    requestId: 'req-safe-001',
    refreshToken: 'refresh-secret',
    nested: {
      apiKey: 'api-secret',
      status: 'FAILED',
    },
  };

  const output = redactLogInfo(info);

  assert.equal(output.refreshToken, LOG_REDACTED_VALUE);
  assert.deepEqual(output.nested, {
    apiKey: LOG_REDACTED_VALUE,
    status: 'FAILED',
  });
  assert.equal(output.requestId, 'req-safe-001');
});

test('sanitizes Error messages and stacks', () => {
  const error = new Error(
    'database failed at postgresql://operator:super-secret@localhost:5432/medsphere',
  );

  const output = redactLogValue(error);

  assert.equal(typeof output, 'object');

  const serialized = JSON.stringify(output);
  assert.equal(serialized.includes('operator'), false);
  assert.equal(serialized.includes('super-secret'), false);
  assert.match(serialized, /\[REDACTED\]/);
});

test('handles circular metadata without throwing', () => {
  const metadata = {
    requestId: 'req-circular',
  };

  metadata.self = metadata;

  const output = redactLogValue(metadata);

  assert.deepEqual(output, {
    requestId: 'req-circular',
    self: LOG_CIRCULAR_VALUE,
  });
});
