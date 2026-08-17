import { Injectable, Logger } from '@nestjs/common';
import type { NotificationDeliveryState, Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TrustedNotificationOperator {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly userId: string;
}

export interface NotificationOperationsQuery {
  readonly limit?: number;
  readonly status?: NotificationDeliveryState;
}

export interface NotificationOperationsSummary {
  readonly tenantId: string;
  readonly counts: Readonly<{
    PENDING: number;
    PROCESSING: number;
    FAILED: number;
    DELIVERED: number;
    DEAD_LETTER: number;
  }>;
}

@Injectable()
export class NotificationOperationsService {
  private readonly logger = new Logger(NotificationOperationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(actor: TrustedNotificationOperator, query: NotificationOperationsQuery) {
    await this.authorize(actor);
    const take = validateLimit(query.limit);
    this.logger.log({
      event: 'notification_operations_read',
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      status: query.status ?? 'ALL',
      limit: take,
    });
    return this.prisma.client.notificationDelivery.findMany({
      where: { tenantId: actor.tenantId, status: query.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      select: {
        id: true,
        sourceEventId: true,
        sourceEvent: { select: { correlationId: true } },
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
        attempts: {
          orderBy: { attemptNumber: 'asc' },
          select: {
            attemptNumber: true,
            outcome: true,
            providerKey: true,
            errorCode: true,
            occurredAt: true,
          },
        },
      } satisfies Prisma.NotificationDeliverySelect,
    });
  }

  async summary(actor: TrustedNotificationOperator): Promise<NotificationOperationsSummary> {
    await this.authorize(actor);
    const [pending, processing, failed, delivered, deadLetter] = await Promise.all([
      this.count(actor.tenantId, 'PENDING'),
      this.count(actor.tenantId, 'PROCESSING'),
      this.count(actor.tenantId, 'FAILED'),
      this.count(actor.tenantId, 'DELIVERED'),
      this.count(actor.tenantId, 'DEAD_LETTER'),
    ]);
    return {
      tenantId: actor.tenantId,
      counts: {
        PENDING: pending,
        PROCESSING: processing,
        FAILED: failed,
        DELIVERED: delivered,
        DEAD_LETTER: deadLetter,
      },
    };
  }

  async readiness(): Promise<{ readonly ready: true; readonly dependency: 'postgresql' }> {
    await this.prisma.client.$queryRaw`SELECT 1`;
    return { ready: true, dependency: 'postgresql' };
  }

  private async authorize(actor: TrustedNotificationOperator): Promise<void> {
    validateActor(actor);
    const membership = await this.prisma.client.tenantMembership.findFirst({
      where: {
        id: actor.membershipId,
        tenantId: actor.tenantId,
        userId: actor.userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!membership) throw new Error('Notification operational access denied');
  }

  private count(tenantId: string, status: NotificationDeliveryState): Promise<number> {
    return this.prisma.client.notificationDelivery.count({ where: { tenantId, status } });
  }
}

function validateLimit(value: number | undefined): number {
  const take = value ?? 50;
  if (!Number.isSafeInteger(take) || take < 1 || take > 100) {
    throw new Error('Notification operations limit must be between 1 and 100');
  }
  return take;
}

function validateActor(actor: TrustedNotificationOperator): void {
  for (const [label, value] of Object.entries(actor)) {
    if (!UUID_PATTERN.test(value)) {
      throw new Error(`Notification operator ${label} must be a UUID`);
    }
  }
}
