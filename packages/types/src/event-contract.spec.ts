import type { DomainEventEnvelope, EventActorContext } from './index';

const actors = [
  {
    actorType: 'TENANT_USER',
    tenantId: 'tenant-id',
    membershipId: 'membership-id',
    userId: 'user-id',
  },
  { actorType: 'PLATFORM_USER', userId: 'platform-user-id' },
  { actorType: 'SYSTEM', tenantId: 'tenant-id', service: 'inventory-expiry-worker' },
] as const satisfies readonly EventActorContext[];

const event = {
  eventId: 'event-id',
  eventType: 'inventory.reservation.confirmed',
  eventVersion: 1,
  aggregateType: 'medicine-reservation',
  aggregateId: 'reservation-id',
  occurredAt: '2026-08-08T00:00:00.000Z',
  actor: actors[0],
  correlationId: 'request-id',
  payload: { reservationId: 'reservation-id' },
} as const satisfies DomainEventEnvelope<{ readonly reservationId: string }>;

// A system actor cannot impersonate a user or membership.
// @ts-expect-error SYSTEM attribution excludes user identity.
const invalidSystemActor: EventActorContext = {
  actorType: 'SYSTEM',
  tenantId: 'tenant-id',
  service: 'worker',
  userId: 'user-id',
};

void event;
void invalidSystemActor;
