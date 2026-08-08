import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditWriter } from './audit-writer.service';
import { AuditDatabase } from './audit.types';

function createFakeDatabase(): AuditDatabase & { events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    auditEvent: {
      async create(args: { data: Record<string, unknown> }) {
        events.push(args.data);
        return { id: String(events.length) };
      },
    },
  };
}

const writer = new AuditWriter();

test('appendTenantUser writes a tenant-user audit event', async () => {
  const db = createFakeDatabase();
  await writer.appendTenantUser(db, {
    tenantId: 'tenant-1',
    actorMembershipId: 'membership-1',
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
    resourceType: 'session',
    resourceId: 'session-1',
  });
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].scope, 'TENANT');
  assert.equal(db.events[0].actorType, 'TENANT_USER');
  assert.equal(db.events[0].tenantId, 'tenant-1');
  assert.equal(db.events[0].actorMembershipId, 'membership-1');
});

test('appendTenantSystem writes a tenant-system event', async () => {
  const db = createFakeDatabase();
  await writer.appendTenantSystem(db, {
    tenantId: 'tenant-1',
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
  });
  assert.equal(db.events[0].scope, 'TENANT');
  assert.equal(db.events[0].actorType, 'SYSTEM');
  assert.equal(db.events[0].tenantId, 'tenant-1');
});

test('appendPlatformUser writes a platform-user event', async () => {
  const db = createFakeDatabase();
  await writer.appendPlatformUser(db, {
    platformActorUserId: 'user-1',
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
  });
  assert.equal(db.events[0].scope, 'PLATFORM');
  assert.equal(db.events[0].actorType, 'PLATFORM_USER');
  assert.equal(db.events[0].platformActorUserId, 'user-1');
});

test('appendSystem writes a system event', async () => {
  const db = createFakeDatabase();
  await writer.appendSystem(db, {
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
  });
  assert.equal(db.events[0].scope, 'PLATFORM');
  assert.equal(db.events[0].actorType, 'SYSTEM');
});

test('appendService writes a service event with tenant scope when tenantId present', async () => {
  const db = createFakeDatabase();
  await writer.appendService(db, {
    tenantId: 'tenant-1',
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
  });
  assert.equal(db.events[0].scope, 'TENANT');
  assert.equal(db.events[0].actorType, 'SERVICE');
});

test('appendService writes a platform-scoped service event without tenantId', async () => {
  const db = createFakeDatabase();
  await writer.appendService(db, {
    eventType: 'auth.logout.success',
    outcome: 'SUCCESS',
  });
  assert.equal(db.events[0].scope, 'PLATFORM');
  assert.equal(db.events[0].actorType, 'SERVICE');
});

test('rejects resource type without resource id', async () => {
  const db = createFakeDatabase();
  await assert.rejects(
    writer.appendSystem(db, {
      eventType: 'auth.logout.success',
      outcome: 'SUCCESS',
      resourceType: 'batch',
    }),
    /must be provided together/,
  );
});

test('rejects invalid metadata', async () => {
  const db = createFakeDatabase();
  await assert.rejects(
    writer.appendSystem(db, {
      eventType: 'auth.login.success',
      outcome: 'SUCCESS',
      metadata: { password: 'secret' },
    }),
    /Missing required audit metadata key "email"/,
  );
});

test('rejects overlong resource id', async () => {
  const db = createFakeDatabase();
  await assert.rejects(
    writer.appendSystem(db, {
      eventType: 'auth.logout.success',
      outcome: 'SUCCESS',
      resourceType: 'batch',
      resourceId: 'x'.repeat(200),
    }),
    /resource identifier/,
  );
});

test('audit failure propagates to caller', async () => {
  const db = {
    auditEvent: {
      async create() {
        throw new Error('database down');
      },
    },
  };
  await assert.rejects(
    writer.appendSystem(db, {
      eventType: 'auth.logout.success',
      outcome: 'SUCCESS',
      metadata: { email: 'test@example.com' },
    }),
    /database down/,
  );
});
