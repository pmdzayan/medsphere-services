import { Injectable } from '@nestjs/common';
import type { NotificationChannel } from '@medsphere/database';
import {
  NotificationDeliveryObserver,
  NotificationProviderRegistry,
  NotificationRecipientResolver,
} from './notification.contracts';
import { NotificationDeliveryFailure } from './notification.errors';

@Injectable()
export class UnconfiguredNotificationRecipientResolver implements NotificationRecipientResolver {
  resolve(): Promise<never> {
    return Promise.reject(
      new NotificationDeliveryFailure('RECIPIENT_RESOLUTION_UNAVAILABLE', 'unresolved'),
    );
  }
}

@Injectable()
export class UnconfiguredNotificationProviderRegistry implements NotificationProviderRegistry {
  forChannel(_channel: NotificationChannel): never {
    throw new NotificationDeliveryFailure('PROVIDER_UNAVAILABLE', 'unconfigured');
  }
}

@Injectable()
export class NoopNotificationDeliveryObserver implements NotificationDeliveryObserver {
  record(): void {}
}
