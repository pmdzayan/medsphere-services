import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { assertNoSensitiveValues } = require('../dist/sensitive-values.js');

test('accepts a clean whitelisted DTO', () => {
  assert.doesNotThrow(() =>
    assertNoSensitiveValues({ productName: 'Paracetamol', quantity: 4, notes: 'ok' }),
  );
});

test('rejects security-sensitive client-controlled values', () => {
  for (const key of [
    'userId',
    'tenantId',
    'membershipId',
    'actorUserId',
    'platformActorUserId',
    'roleId',
    'permissionId',
    'sessionId',
    'providerId',
    'verificationStatus',
    'authorizationStatus',
  ]) {
    assert.throws(
      () => assertNoSensitiveValues({ [key]: 'value' }),
      new RegExp(`Sensitive server-managed field.*${key}`),
      `expected ${key} to be rejected`,
    );
  }
});

test('rejects admin/identity values as extra fields even when other fields are present', () => {
  assert.throws(
    () => assertNoSensitiveValues({ reason: 'Looks valid', tenantId: 'other-tenant' }),
    /tenantId/,
  );
  assert.throws(
    () => assertNoSensitiveValues({ description: 'x', roles: ['tenant_admin'] }),
    /roles/,
  );
});
