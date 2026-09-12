import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { appendOutboxEvent, type OutboxDatabase, type Prisma } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export const INVENTORY_DOMAIN_EVENT_TYPES = [
  'inventory.reservation.created',
  'inventory.reservation.confirmed',
  'inventory.reservation.ready',
  'inventory.reservation.completed',
  'inventory.reservation.cancelled',
  'inventory.reservation.expired',
  'inventory.batch.expired',
  'inventory.batch.quarantined',
  'inventory.stock.damaged',
  'inventory.stock.transferred',
  'inventory.availability.request.created',
  'inventory.availability.request.responded',
] as const;

export type InventoryDomainEventType = (typeof INVENTORY_DOMAIN_EVENT_TYPES)[number];

interface InventoryDomainEventInput {
  readonly eventType: InventoryDomainEventType;
  readonly aggregateType:
    'MedicineReservation' | 'Batch' | 'InventoryTransfer' | 'AvailabilityRequest';
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: Prisma.InputJsonObject;
}

@Injectable()
export class InventoryEventWriter {
  appendTenantUser(
    database: OutboxDatabase,
    actor: TrustedInventoryActor,
    input: InventoryDomainEventInput,
  ): Promise<void> {
    return appendOutboxEvent(database, {
      eventId: randomUUID(),
      eventType: input.eventType,
      eventVersion: 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      occurredAt: input.occurredAt.toISOString(),
      actor: {
        actorType: 'TENANT_USER',
        tenantId: actor.tenantId,
        membershipId: actor.membershipId,
        userId: actor.userId,
      },
      payload: input.payload,
    });
  }

  appendTenantSystem(
    database: OutboxDatabase,
    tenantId: string,
    service:
      | 'reservation-expiry-worker'
      | 'batch-expiry-worker'
      | 'inventory-quarantine-service'
      | 'public-live-availability'
      // Task 0034: patient-created/cancelled reservation events are written
      // with a SYSTEM actor because a patient has no ACTIVE membership inside
      // the provider's tenant (OutboxEvent carries a single tenantId and the
      // TENANT_USER composite FK binds membership+user+tenant). Exact-user
      // accountability for patient actions lives in the AuditEvent trail via
      // appendPlatformUser; the outbox payload stays patient-free.
      | 'patient-reservations',
    input: InventoryDomainEventInput,
  ): Promise<void> {
    return appendOutboxEvent(database, {
      eventId: randomUUID(),
      eventType: input.eventType,
      eventVersion: 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      occurredAt: input.occurredAt.toISOString(),
      actor: { actorType: 'SYSTEM', tenantId, service },
      payload: input.payload,
    });
  }
}
