import { Injectable, Logger } from '@nestjs/common';
import { NotificationProviderType } from '../enums';
import { NotificationProvider, NotificationSendResult } from './notification-provider.interface';

/**
 * Push notification provider.
 *
 * Uses Firebase Cloud Messaging (FCM) credentials from the tenant
 * configuration. In development, this provider simulates delivery by
 * logging the notification and returning a synthetic message ID.
 * In production, it would integrate with the Firebase Admin SDK.
 */
@Injectable()
export class PushProvider implements NotificationProvider {
  readonly providerType = NotificationProviderType.FCM;
  private readonly logger = new Logger(PushProvider.name);

  async send(
    to: string,
    subject: string | undefined,
    body: string,
    credentials: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const messageId = `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(
      `Push notification queued to device "${to.slice(0, 8)}..."` +
        (subject ? ` | title: "${subject}"` : '') +
        ` | messageId: ${messageId}`,
    );

    // In production, this would use the Firebase Admin SDK:
    // const admin = require('firebase-admin');
    // await admin.messaging().send({ token: to, notification: { title: subject, body } });
    return {
      success: true,
      messageId,
      provider: this.providerType,
    };
  }
}
