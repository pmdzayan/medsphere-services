import type {
  ClaimedNotificationDelivery,
  NotificationChannel,
  NotificationRecipientType,
} from '@medsphere/database';
import type { NotificationComposedContent } from './reservation-notification-composer.service';

export const NOTIFICATION_RECIPIENT_RESOLVER = Symbol('NOTIFICATION_RECIPIENT_RESOLVER');
export const NOTIFICATION_PROVIDER_REGISTRY = Symbol('NOTIFICATION_PROVIDER_REGISTRY');
export const NOTIFICATION_DELIVERY_OBSERVER = Symbol('NOTIFICATION_DELIVERY_OBSERVER');

export interface NotificationRecipientResolver {
  resolve(input: {
    readonly tenantId: string;
    readonly recipientType: NotificationRecipientType;
    readonly recipientReferenceId: string;
    readonly channel: NotificationChannel;
  }): Promise<{ readonly destinationToken: string }>;
}

export interface NotificationProviderDeliveryInput {
  readonly deliveryId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly channel: NotificationChannel;
  readonly destinationToken: string;
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly composedContent: NotificationComposedContent;
}

export interface NotificationProviderAdapter {
  readonly providerKey: string;
  deliver(
    input: NotificationProviderDeliveryInput,
  ): Promise<{ readonly providerReference?: string }>;
}

export interface NotificationProviderRegistry {
  forChannel(channel: NotificationChannel): NotificationProviderAdapter;
}

export interface NotificationObservation {
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly channel: NotificationChannel;
  readonly attemptCount: number;
  readonly outcome: 'DELIVERED' | 'FAILED' | 'DEAD_LETTER';
  readonly errorCode?: string;
}

export interface NotificationDeliveryObserver {
  record(observation: NotificationObservation): void | Promise<void>;
}

export type NotificationWorkerDelivery = ClaimedNotificationDelivery;
