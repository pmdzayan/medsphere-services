import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BestEffortDomainEventPublisher,
  DomainEvent,
  DomainEventEnvelope,
  EventActorContext,
} from './index';

test('DomainEventEnvelope requires eventId, eventName, schemaVersion, occurredAt, tenantId, payload', () => {
  const envelope: DomainEventEnvelope = {
    eventId: 'evt-1',
    eventName: 'inventory.batch.created',
    schemaVersion: 1,
    occurredAt: '2026-08-03T00:00:00.000Z',
    tenantId: 'tenant-1',
    payload: { batchId: 'batch-1' },
  };
  assert.equal(envelope.eventId, 'evt-1');
  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.tenantId, 'tenant-1');
});

test('DomainEventEnvelope supports correlationId, causationId and actorContext', () => {
  const actor: EventActorContext = { actorType: 'SYSTEM' };
  const envelope: DomainEventEnvelope = {
    eventId: 'evt-2',
    eventName: 'inventory.expiry.scan.completed',
    schemaVersion: 1,
    occurredAt: '2026-08-03T00:00:00.000Z',
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    causationId: 'cause-1',
    actorContext: actor,
    payload: {},
  };
  assert.equal(envelope.correlationId, 'corr-1');
  assert.equal(envelope.causationId, 'cause-1');
  assert.equal(envelope.actorContext?.actorType, 'SYSTEM');
});

test('EventActorContext supports TENANT_USER, PLATFORM_USER, SYSTEM and SERVICE actors', () => {
  const actors: EventActorContext[] = [
    { actorType: 'TENANT_USER', actorUserId: 'u1', membershipId: 'm1' },
    { actorType: 'PLATFORM_USER', actorUserId: 'u2' },
    { actorType: 'SYSTEM' },
    { actorType: 'SERVICE' },
  ];
  assert.equal(actors.length, 4);
  assert.equal(actors[0].actorType, 'TENANT_USER');
  assert.equal(actors[3].actorType, 'SERVICE');
});

test('DomainEventEnvelope is typed and versionable', () => {
  interface BatchCreatedPayload {
    batchId: string;
    quantity: number;
  }
  const envelope: DomainEventEnvelope<BatchCreatedPayload> = {
    eventId: 'evt-3',
    eventName: 'inventory.batch.created',
    schemaVersion: 2,
    occurredAt: '2026-08-03T00:00:00.000Z',
    tenantId: 'tenant-1',
    payload: { batchId: 'batch-2', quantity: 100 },
  };
  assert.equal(envelope.payload.quantity, 100);
});

test('BestEffortDomainEventPublisher delivers to subscribed handlers', async () => {
  const publisher = new BestEffortDomainEventPublisher();
  const received: string[] = [];
  publisher.subscribe('inventory.batch.created', async (event: DomainEvent) => {
    received.push(event.eventId);
  });
  await publisher.publish({
    eventId: 'evt-4',
    eventName: 'inventory.batch.created',
    tenantId: 'tenant-1',
    occurredAt: '2026-08-03T00:00:00.000Z',
    payload: {},
  });
  assert.deepEqual(received, ['evt-4']);
});

test('BestEffortDomainEventPublisher swallows handler failures', async () => {
  const publisher = new BestEffortDomainEventPublisher();
  publisher.subscribe('inventory.batch.created', async () => {
    throw new Error('handler failed');
  });
  await publisher.publish({
    eventId: 'evt-5',
    eventName: 'inventory.batch.created',
    tenantId: 'tenant-1',
    occurredAt: '2026-08-03T00:00:00.000Z',
    payload: {},
  });
  assert.ok(true);
});
