import { Injectable } from '@nestjs/common';
import {
  consumeOutboxEventOnce,
  enqueueNotificationDelivery,
  type Prisma,
} from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';

export const RESERVATION_READY_NOTIFICATION_CONSUMER = 'reservation-ready-notification-v1';
export const RESERVATION_READY_NOTIFICATION_WORKFLOW = 'reservation-ready-membership-v1';
export const RESERVATION_READY_NOTIFICATION_TEMPLATE = 'reservation-ready';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ReservationNotificationEventReference {
  readonly tenantId: string;
  readonly eventId: string;
}

export interface ReservationNotificationConsumerResult {
  readonly processed: boolean;
  readonly enqueued: boolean;
}

interface ReservationReadyPayload {
  readonly providerId: string;
  readonly previousStatus: 'CONFIRMED';
  readonly status: 'READY';
  readonly version: number;
  readonly totalQuantity: number;
}

@Injectable()
export class ReservationNotificationConsumerService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(
    reference: ReservationNotificationEventReference,
  ): Promise<ReservationNotificationConsumerResult> {
    validateReference(reference);
    const consumed = await consumeOutboxEventOnce(
      this.prisma.client,
      {
        tenantId: reference.tenantId,
        eventId: reference.eventId,
        consumerName: RESERVATION_READY_NOTIFICATION_CONSUMER,
      },
      async (transaction) => this.enqueueFromAuthoritativeEvent(transaction, reference),
    );
    return {
      processed: consumed.processed,
      enqueued: consumed.result?.enqueued ?? false,
    };
  }

  private async enqueueFromAuthoritativeEvent(
    transaction: Prisma.TransactionClient,
    reference: ReservationNotificationEventReference,
  ): Promise<{ readonly enqueued: boolean }> {
    const event = await transaction.outboxEvent.findUniqueOrThrow({
      where: {
        id_tenantId: { id: reference.eventId, tenantId: reference.tenantId },
      },
      select: {
        id: true,
        tenantId: true,
        eventType: true,
        eventVersion: true,
        aggregateType: true,
        aggregateId: true,
        occurredAt: true,
        payload: true,
      },
    });
    const payload = validateReservationReadyEvent(event);
    const reservation = await transaction.medicineReservation.findFirstOrThrow({
      where: {
        id: event.aggregateId,
        tenantId: event.tenantId,
        providerId: payload.providerId,
      },
      select: { subjectUserId: true },
    });
    const recipient = await transaction.tenantMembership.findFirstOrThrow({
      where: {
        tenantId: event.tenantId,
        userId: reservation.subjectUserId,
      },
      select: { id: true },
    });

    return enqueueNotificationDelivery(transaction, {
      tenantId: event.tenantId,
      sourceEventId: event.id,
      workflowKey: RESERVATION_READY_NOTIFICATION_WORKFLOW,
      recipientType: 'TENANT_MEMBERSHIP',
      recipientReferenceId: recipient.id,
      channel: 'EMAIL',
      templateKey: RESERVATION_READY_NOTIFICATION_TEMPLATE,
      templateVersion: 1,
      variables: { status: payload.status },
      availableAt: event.occurredAt,
    });
  }
}

function validateReference(reference: ReservationNotificationEventReference): void {
  if (!UUID_PATTERN.test(reference.tenantId)) {
    throw new Error('Reservation notification tenant id must be a UUID');
  }
  if (!UUID_PATTERN.test(reference.eventId)) {
    throw new Error('Reservation notification event id must be a UUID');
  }
}

function validateReservationReadyEvent(event: {
  readonly eventType: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Prisma.JsonValue;
}): ReservationReadyPayload {
  if (event.eventType !== 'inventory.reservation.ready') {
    throw new Error('Reservation notification event type is unsupported');
  }
  if (event.eventVersion !== 1) {
    throw new Error('Reservation notification event version is unsupported');
  }
  if (event.aggregateType !== 'MedicineReservation' || !UUID_PATTERN.test(event.aggregateId)) {
    throw new Error('Reservation notification aggregate is invalid');
  }
  if (!isPlainObject(event.payload)) {
    throw new Error('Reservation notification event payload is invalid');
  }
  const allowedKeys = ['previousStatus', 'providerId', 'status', 'totalQuantity', 'version'];
  const keys = Object.keys(event.payload).sort();
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    throw new Error('Reservation notification event schema is unsupported');
  }
  const { providerId, previousStatus, status, totalQuantity, version } = event.payload;
  if (
    typeof providerId !== 'string' ||
    !UUID_PATTERN.test(providerId) ||
    previousStatus !== 'CONFIRMED' ||
    status !== 'READY' ||
    !Number.isSafeInteger(version) ||
    (version as number) < 2 ||
    !Number.isSafeInteger(totalQuantity) ||
    (totalQuantity as number) < 1
  ) {
    throw new Error('Reservation notification event schema is unsupported');
  }
  return { providerId, previousStatus, status, totalQuantity, version } as ReservationReadyPayload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
