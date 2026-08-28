import { Injectable, Logger } from '@nestjs/common';
import { appMetrics } from '@medsphere/common';
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
 *
 * Also records a bounded metric counter (channel + outcome only --
 * tenantId, deliveryId, and errorCode are deliberately excluded from the
 * metric labels: the first two are high-cardinality identifiers, and
 * errorCode's cardinality is not bounded by this contract, so none of
 * the three belong on a low-cardinality metric label even though they
 * are safe to log).
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
    appMetrics.notificationDeliveryTotal.increment({
      channel: observation.channel,
      outcome: observation.outcome,
    });
  }
}
