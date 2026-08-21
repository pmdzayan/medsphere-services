import { Injectable, Logger } from '@nestjs/common';
import type {
  NotificationDeliveryObserver,
  NotificationObservation,
} from './notification.contracts';

/**
 * Real (not no-op) delivery observability for an activated provider.
 * Logs only the fields the accepted contract classifies as safe:
 * tenantId, deliveryId, channel, attemptCount, outcome, errorCode. Never
 * the destination address, composed content, credentials, or raw
 * provider response -- none of those are present on
 * NotificationObservation in the first place, so there is nothing to
 * accidentally leak here.
 */
@Injectable()
export class LoggingNotificationDeliveryObserver implements NotificationDeliveryObserver {
  private readonly logger = new Logger(LoggingNotificationDeliveryObserver.name);

  record(observation: NotificationObservation): void {
    this.logger.log({
      event: 'notification_delivery_outcome',
      tenantId: observation.tenantId,
      deliveryId: observation.deliveryId,
      channel: observation.channel,
      attemptCount: observation.attemptCount,
      outcome: observation.outcome,
      errorCode: observation.errorCode,
    });
  }
}
