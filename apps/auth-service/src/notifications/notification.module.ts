import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  NOTIFICATION_DELIVERY_OBSERVER,
  NOTIFICATION_PROVIDER_REGISTRY,
  NOTIFICATION_RECIPIENT_RESOLVER,
} from './notification.contracts';
import { LoggingNotificationDeliveryObserver } from './logging-notification-delivery.observer';
import { createNotificationProviderRegistry } from './notification-provider-registry.factory';
import { NotificationOperationsService } from './notification-operations.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationWorkerService } from './notification-worker.service';
import { ReservationNotificationComposerService } from './reservation-notification-composer.service';
import { ReservationNotificationConsumerService } from './reservation-notification-consumer.service';
import { ReservationRecipientResolverService } from './reservation-recipient-resolver.service';

@Module({
  imports: [PrismaModule],
  providers: [
    NotificationQueueService,
    NotificationWorkerService,
    NotificationOperationsService,
    ReservationNotificationConsumerService,
    ReservationNotificationComposerService,
    ReservationRecipientResolverService,
    LoggingNotificationDeliveryObserver,
    {
      provide: NOTIFICATION_RECIPIENT_RESOLVER,
      useExisting: ReservationRecipientResolverService,
    },
    {
      // Activation is read from the process environment exactly once, at
      // module composition -- see notification-provider-registry.factory.ts
      // for the full fail-closed/fail-fast behavior.
      provide: NOTIFICATION_PROVIDER_REGISTRY,
      useFactory: () => createNotificationProviderRegistry(),
    },
    {
      provide: NOTIFICATION_DELIVERY_OBSERVER,
      useExisting: LoggingNotificationDeliveryObserver,
    },
  ],
  exports: [
    NotificationQueueService,
    NotificationWorkerService,
    NotificationOperationsService,
    ReservationNotificationConsumerService,
  ],
})
export class NotificationModule {}
