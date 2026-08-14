import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  NOTIFICATION_DELIVERY_OBSERVER,
  NOTIFICATION_PROVIDER_REGISTRY,
  NOTIFICATION_RECIPIENT_RESOLVER,
} from './notification.contracts';
import {
  NoopNotificationDeliveryObserver,
  UnconfiguredNotificationProviderRegistry,
  UnconfiguredNotificationRecipientResolver,
} from './notification-defaults';
import { NotificationOperationsService } from './notification-operations.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationWorkerService } from './notification-worker.service';

@Module({
  imports: [PrismaModule],
  providers: [
    NotificationQueueService,
    NotificationWorkerService,
    NotificationOperationsService,
    UnconfiguredNotificationRecipientResolver,
    UnconfiguredNotificationProviderRegistry,
    NoopNotificationDeliveryObserver,
    {
      provide: NOTIFICATION_RECIPIENT_RESOLVER,
      useExisting: UnconfiguredNotificationRecipientResolver,
    },
    {
      provide: NOTIFICATION_PROVIDER_REGISTRY,
      useExisting: UnconfiguredNotificationProviderRegistry,
    },
    {
      provide: NOTIFICATION_DELIVERY_OBSERVER,
      useExisting: NoopNotificationDeliveryObserver,
    },
  ],
  exports: [NotificationQueueService, NotificationWorkerService, NotificationOperationsService],
})
export class NotificationModule {}
