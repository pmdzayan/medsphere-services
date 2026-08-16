import { Injectable } from '@nestjs/common';
import { NotificationDeliveryFailure } from './notification.errors';

export const RESERVATION_READY_TEMPLATE_KEY = 'reservation-ready';
export const RESERVATION_READY_TEMPLATE_VERSION = 1;
export const RESERVATION_READY_DEFAULT_LOCALE = 'en';

export interface ReservationNotificationCompositionInput {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly locale?: string;
}

export interface NotificationComposedContent {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly locale: string;
  readonly subject: string;
  readonly body: string;
  readonly metadata: {
    readonly workflowKey: 'reservation-ready-membership-v1';
    readonly contentClass: 'OPERATIONAL';
  };
}

@Injectable()
export class ReservationNotificationComposerService {
  compose(
    input: ReservationNotificationCompositionInput,
  ): NotificationComposedContent {
    if (input.templateKey !== RESERVATION_READY_TEMPLATE_KEY) {
      throw failure('TEMPLATE_KEY_UNSUPPORTED');
    }
    if (input.templateVersion !== RESERVATION_READY_TEMPLATE_VERSION) {
      throw failure('TEMPLATE_VERSION_UNSUPPORTED');
    }

    const locale = input.locale ?? RESERVATION_READY_DEFAULT_LOCALE;
    if (locale !== RESERVATION_READY_DEFAULT_LOCALE) {
      throw failure('TEMPLATE_LOCALE_UNSUPPORTED');
    }

    const variableKeys = Object.keys(input.variables).sort();
    if (variableKeys.length !== 1 || variableKeys[0] !== 'status') {
      throw failure('TEMPLATE_VARIABLES_INVALID');
    }
    if (input.variables.status !== 'READY') {
      throw failure('TEMPLATE_VARIABLES_INVALID');
    }

    return {
      templateKey: RESERVATION_READY_TEMPLATE_KEY,
      templateVersion: RESERVATION_READY_TEMPLATE_VERSION,
      locale,
      subject: 'Your reservation is ready',
      body: 'Your reserved item is ready for collection.',
      metadata: {
        workflowKey: 'reservation-ready-membership-v1',
        contentClass: 'OPERATIONAL',
      },
    };
  }
}

function failure(code: string): NotificationDeliveryFailure {
  return new NotificationDeliveryFailure(code, 'composition');
}
