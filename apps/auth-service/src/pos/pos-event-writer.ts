import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { appendOutboxEvent, type OutboxDatabase, type Prisma } from '@medsphere/database';
import type { PosActor } from './pos.types';

export type PosDomainEventType =
  | 'billing.pos.sale.completed'
  | 'billing.pos.invoice.reprinted'
  | 'billing.pos.sale.voided'
  | 'billing.pos.return.completed';

@Injectable()
export class PosEventWriter {
  appendTenantUser(
    database: OutboxDatabase,
    actor: PosActor,
    input: {
      readonly eventType: PosDomainEventType;
      readonly aggregateType: 'PharmacySale' | 'PharmacyInvoice' | 'PharmacySaleReturn';
      readonly aggregateId: string;
      readonly occurredAt: Date;
      readonly payload: Prisma.InputJsonObject;
    },
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
}
