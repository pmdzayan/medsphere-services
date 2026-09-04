import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  isTrustedTenantActor,
  isTrustedPlatformActor,
  isTrustedSystemActor,
  trustedActorKind,
  requireTrustedTenantActor,
} = require('../dist/trusted-actor.js');

const tenantActor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };
const platformActor = { platformUserId: 'platform-1' };
const systemActor = { service: 'expiry-worker', tenantId: 'tenant-1' };
const platformSystemActor = { service: 'notification-worker' };

test('discriminates the three accepted actor kinds', () => {
  assert.equal(isTrustedTenantActor(tenantActor), true);
  assert.equal(isTrustedPlatformActor(platformActor), true);
  assert.equal(isTrustedSystemActor(systemActor), true);
  assert.equal(trustedActorKind(tenantActor), 'tenant-user');
  assert.equal(trustedActorKind(platformActor), 'platform-user');
  assert.equal(trustedActorKind(systemActor), 'system');
  assert.equal(trustedActorKind(platformSystemActor), 'system');
});

test('rejects ambiguous/incomplete flat objects for tenant actor', () => {
  assert.equal(isTrustedTenantActor({ tenantId: 't', membershipId: 'm' }), false);
  assert.equal(isTrustedTenantActor({ tenantId: 't', userId: 'u' }), false);
  assert.equal(isTrustedTenantActor({ membershipId: 'm', userId: 'u' }), false);
  assert.equal(isTrustedTenantActor({ ...tenantActor, userId: '' }), false);
  assert.equal(isTrustedTenantActor(null), false);
  assert.equal(isTrustedTenantActor('tenant-1'), false);
});

test('system actor can never carry a user or membership identity', () => {
  assert.equal(isTrustedSystemActor({ service: 'x', userId: 'u' }), false);
  assert.equal(isTrustedSystemActor({ service: 'x', membershipId: 'm' }), false);
  assert.equal(isTrustedSystemActor({ service: '', tenantId: 't' }), false);
});

test('requireTrustedTenantActor fails closed on anything but the exact tenant actor', () => {
  assert.deepEqual(requireTrustedTenantActor(tenantActor), tenantActor);
  assert.throws(() => requireTrustedTenantActor(platformActor), /Trusted tenant actor identity/);
  assert.throws(() => requireTrustedTenantActor(systemActor), /Trusted tenant actor identity/);
  assert.throws(
    () => requireTrustedTenantActor({ tenantId: 't', membershipId: 'm', userId: undefined }),
    /Trusted tenant actor identity/,
  );
});
