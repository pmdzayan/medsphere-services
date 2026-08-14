import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  claimNotificationDeliveries,
  recordNotificationDelivered,
  recordNotificationFailed,
  type ClaimedNotificationDelivery,
} from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_DELIVERY_OBSERVER,
  NOTIFICATION_PROVIDER_REGISTRY,
  NOTIFICATION_RECIPIENT_RESOLVER,
  type NotificationDeliveryObserver,
  type NotificationObservation,
  type NotificationProviderRegistry,
  type NotificationRecipientResolver,
} from './notification.contracts';
import { NotificationDeliveryFailure } from './notification.errors';

export interface NotificationWorkerConfig {
  readonly limit: number;
  readonly leaseMs: number;
  readonly maximumAttempts?: number;
  readonly now?: Date;
}

export interface NotificationWorkerSummary {
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
  readonly deadLettered: number;
}

@Injectable()
export class NotificationWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_RECIPIENT_RESOLVER)
    private readonly recipients: NotificationRecipientResolver,
    @Inject(NOTIFICATION_PROVIDER_REGISTRY)
    private readonly providers: NotificationProviderRegistry,
    @Inject(NOTIFICATION_DELIVERY_OBSERVER)
    private readonly observer: NotificationDeliveryObserver,
  ) {}

  async run(config: NotificationWorkerConfig): Promise<NotificationWorkerSummary> {
    const now = config.now ?? new Date();
    const claimed = await claimNotificationDeliveries(this.prisma.client, {
      limit: config.limit,
      now,
      leaseMs: config.leaseMs,
    });
    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;
    for (const delivery of claimed) {
      const outcome = await this.deliverOne(delivery, now, config.maximumAttempts);
      if (outcome === 'DELIVERED') delivered += 1;
      else if (outcome === 'FAILED') failed += 1;
      else deadLettered += 1;
    }
    return { claimed: claimed.length, delivered, failed, deadLettered };
  }

  private async deliverOne(
    delivery: ClaimedNotificationDelivery,
    occurredAt: Date,
    maximumAttempts?: number,
  ): Promise<'DELIVERED' | 'FAILED' | 'DEAD_LETTER'> {
    let providerKey = 'unresolved';
    let providerReference: string | undefined;
    try {
      const recipient = await this.recipients.resolve({
        tenantId: delivery.tenantId,
        recipientType: delivery.recipientType,
        recipientReferenceId: delivery.recipientReferenceId,
        channel: delivery.channel,
      });
      assertDestinationToken(recipient.destinationToken);
      const provider = this.providers.forChannel(delivery.channel);
      providerKey = provider.providerKey;
      assertProviderKey(providerKey);
      const result = await provider.deliver({
        deliveryId: delivery.deliveryId,
        idempotencyKey: delivery.deliveryId,
        tenantId: delivery.tenantId,
        channel: delivery.channel,
        destinationToken: recipient.destinationToken,
        templateKey: delivery.templateKey,
        templateVersion: delivery.templateVersion,
        variables: asVariables(delivery.variables),
      });
      providerReference = result.providerReference;
    } catch (error) {
      const failure = safeFailure(error, providerKey);
      const outcome = await recordNotificationFailed(this.prisma.client, delivery, {
        occurredAt,
        providerKey: failure.providerKey,
        errorCode: failure.code,
        maximumAttempts,
      });
      await this.observeSafely(observation(delivery, outcome, failure.code));
      return outcome;
    }
    await recordNotificationDelivered(this.prisma.client, delivery, {
      occurredAt,
      providerKey,
      providerReferenceHash: providerReference
        ? createHash('sha256').update(providerReference).digest('hex')
        : undefined,
    });
    await this.observeSafely(observation(delivery, 'DELIVERED'));
    return 'DELIVERED';
  }

  private async observeSafely(entry: NotificationObservation): Promise<void> {
    try {
      await this.observer.record(entry);
    } catch {
      // Observability must never change durable delivery state or expose payloads.
    }
  }
}

function safeFailure(error: unknown, providerKey: string): NotificationDeliveryFailure {
  return error instanceof NotificationDeliveryFailure
    ? error
    : new NotificationDeliveryFailure('UNEXPECTED_DELIVERY_FAILURE', providerKey);
}

function assertDestinationToken(value: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new NotificationDeliveryFailure('RECIPIENT_DESTINATION_INVALID', 'unresolved');
  }
}

function assertProviderKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) {
    throw new NotificationDeliveryFailure('PROVIDER_CONFIGURATION_INVALID', 'unconfigured');
  }
}

function asVariables(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NotificationDeliveryFailure('TEMPLATE_VARIABLES_INVALID', 'unresolved');
  }
  return value as Readonly<Record<string, unknown>>;
}

function observation(
  delivery: ClaimedNotificationDelivery,
  outcome: 'DELIVERED' | 'FAILED' | 'DEAD_LETTER',
  errorCode?: string,
) {
  return {
    tenantId: delivery.tenantId,
    deliveryId: delivery.deliveryId,
    channel: delivery.channel,
    attemptCount: delivery.attemptCount,
    outcome,
    errorCode,
  } as const;
}
