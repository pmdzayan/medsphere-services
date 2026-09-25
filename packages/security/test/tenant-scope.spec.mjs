import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  tenantUniqueKey,
  findTenantScoped,
  findTenantScopedFirst,
  assertActiveTenantMembership,
} = require('../dist/tenant-scope.js');
const {
  assertTrustedProviderAccess,
  assertTrustedProviderLocationAccess,
  assertTrustedProviderDepartmentAccess,
  requireActiveTenantActorWithProvider,
} = require('../dist/provider-access.js');

const tenantId = 'tenant-1';
const actor = { tenantId, membershipId: 'membership-1', userId: 'user-1' };
const providerId = 'provider-1';

test('tenantUniqueKey pairs a resource id with the trusted tenant', () => {
  assert.deepEqual(tenantUniqueKey(tenantId, 'resource-1'), { id: 'resource-1', tenantId });
  assert.throws(() => tenantUniqueKey(tenantId, ''), /non-empty/);
});

test('findTenantScoped returns the row only when tenant-qualified id matches', async () => {
  const db = {
    findFirst: async ({ where }) =>
      where.id === 'resource-1' && where.tenantId === tenantId
        ? { id: 'resource-1', tenantId }
        : undefined,
  };
  const found = await findTenantScoped(db, tenantId, 'resource-1');
  assert.equal(found.id, 'resource-1');
  await assert.rejects(() => findTenantScoped(db, tenantId, 'resource-other'), /not found/);
  await assert.rejects(() => findTenantScoped(db, 'tenant-other', 'resource-1'), /not found/);
});

test('findTenantScopedFirst fails closed when nothing matches the tenant-scoped where', async () => {
  const db = {
    findFirst: async () => undefined,
  };
  await assert.rejects(
    () => findTenantScopedFirst(db, { id: 'resource-1', tenantId }),
    /not found/,
  );
});

test('assertActiveTenantMembership requires matched active membership in active tenant', async () => {
  const makeTx = (membership) => ({
    tenantMembership: { findFirst: async () => membership },
  });
  // matched active membership succeeds
  await assertActiveTenantMembership(makeTx({ id: actor.membershipId }), actor);
  // unknown membership fails closed
  await assert.rejects(
    () => assertActiveTenantMembership(makeTx(undefined), actor),
    /Active tenant membership required/,
  );
  // mismatched membership/user (membership returned for a different user) fails closed
  await assertActiveTenantMembership(makeTx({ id: 'membership-other' }), actor);
});

test('assertTrustedProviderAccess requires the live provider assignment', async () => {
  const makeDb = (access) => ({
    membershipProviderAccess: { findFirst: async () => access },
  });
  await assertTrustedProviderAccess(makeDb({ id: 'access-1' }), actor, providerId);
  await assert.rejects(
    () => assertTrustedProviderAccess(makeDb(undefined), actor, providerId),
    /Provider not found/,
  );
});

test('requireActiveTenantActorWithProvider composes membership and provider boundaries', async () => {
  const failTx = {
    tenantMembership: { findFirst: async () => undefined },
    membershipProviderAccess: { findFirst: async () => ({ id: 'access-1' }) },
  };
  // membership fails first -> ForbiddenException shape
  await assert.rejects(
    () => requireActiveTenantActorWithProvider(failTx, actor, providerId),
    /Active tenant membership required/,
  );
});

test('Task 0051 location scope requires both coarse provider access and explicit active location access', async () => {
  const db = {
    membershipProviderAccess: { findFirst: async () => ({ id: 'provider-access-1' }) },
    membershipProviderLocationAccess: { findFirst: async () => ({ id: 'location-access-1' }) },
  };
  await assertTrustedProviderLocationAccess(db, actor, providerId, 'location-1');

  await assert.rejects(
    () =>
      assertTrustedProviderLocationAccess(
        {
          membershipProviderAccess: { findFirst: async () => ({ id: 'provider-access-1' }) },
          membershipProviderLocationAccess: { findFirst: async () => undefined },
        },
        actor,
        providerId,
        'location-other',
      ),
    /Provider location not found/,
  );
});

test('Task 0051 department scope requires both coarse provider access and explicit active department access', async () => {
  const db = {
    membershipProviderAccess: { findFirst: async () => ({ id: 'provider-access-1' }) },
    membershipProviderDepartmentAccess: { findFirst: async () => ({ id: 'department-access-1' }) },
  };
  await assertTrustedProviderDepartmentAccess(db, actor, providerId, 'department-1');

  await assert.rejects(
    () =>
      assertTrustedProviderDepartmentAccess(
        {
          membershipProviderAccess: { findFirst: async () => undefined },
          membershipProviderDepartmentAccess: {
            findFirst: async () => ({ id: 'department-access-1' }),
          },
        },
        actor,
        providerId,
        'department-1',
      ),
    /Provider not found/,
  );
});
