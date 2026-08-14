import { Injectable } from '@nestjs/common';
import type { NotificationDeliveryState, Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TrustedNotificationOperator {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly userId: string;
}

export interface NotificationOperationsQuery {
  readonly limit?: number;
  readonly status?: NotificationDeliveryState;
}

@Injectable()
export class NotificationOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: TrustedNotificationOperator, query: NotificationOperationsQuery) {
    validateActor(actor);
    const take = query.limit ?? 50;
    if (!Number.isSafeInteger(take) || take < 1 || take > 100) {
      throw new Error('Notification operations limit must be between 1 and 100');
    }
    return this.prisma.client.notificationDelivery.findMany({
      where: { tenantId: actor.tenantId, status: query.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        sourceEventId: true,
        workflowKey: true,
        recipientType: true,
        channel: true,
        templateKey: true,
        templateVersion: true,
        status: true,
        attemptCount: true,
        availableAt: true,
        deliveredAt: true,
        lastErrorCode: true,
        createdAt: true,
      } satisfies Prisma.NotificationDeliverySelect,
    });
  }
}

function validateActor(actor: TrustedNotificationOperator): void {
  for (const [label, value] of Object.entries(actor)) {
    if (!UUID_PATTERN.test(value)) throw new Error(`Notification operator ${label} must be a UUID`);
  }
}
