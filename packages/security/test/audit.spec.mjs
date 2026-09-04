import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { appendExactTenantUserAudit } = require('../dist/audit.js');

const actor = { tenantId: 'tenant-1', membershipId: 'membership-1', userId: 'user-1' };

test('appendExactTenantUserAudit writes actorUserId from the trusted actor only', async () => {
  const calls = [];
  const audit = {
    appendTenantUser: async (_db, input) => {
      calls.push(input);
    },
  };
  await appendExactTenantUserAudit({}, audit, actor, {
    eventType: 'inventory.reservation.created',
    outcome: 'SUCCEEDED',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tenantId, actor.tenantId);
  assert.equal(calls[0].actorMembershipId, actor.membershipId);
  assert.equal(calls[0].actorUserId, actor.userId);
  assert.equal(calls[0].eventType, 'inventory.reservation.created');
});

test('appendExactTenantUserAudit rejects an incomplete actor (no SYSTEM shortcut)', async () => {
  const audit = { appendTenantUser: async () => {} };
  await assert.rejects(
    () =>
      appendExactTenantUserAudit(
        {},
        audit,
        { tenantId: 't', membershipId: 'm' },
        {
          eventType: 'inventory.reservation.created',
          outcome: 'SUCCEEDED',
        },
      ),
    /complete trusted tenant actor/,
  );
});
