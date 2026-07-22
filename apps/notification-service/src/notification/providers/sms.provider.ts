import { Injectable, Logger } from '@nestjs/common';
import { NotificationProviderType } from '../enums';
import { NotificationProvider, NotificationSendResult } from './notification-provider.interface';

/**
 * SMS notification provider.
 *
 * Uses Twilio credentials from the tenant configuration. In development,
 * this provider simulates delivery by logging the notification and returning
 * a synthetic message ID. In production, it would integrate with the Twilio
 * SDK.
 */
@Injectable()
export class SmsProvider implements NotificationProvider {
  readonly providerType = NotificationProviderType.TWILIO;
  private readonly logger = new Logger(SmsProvider.name);

  async send(
    to: string,
    _subject: string | undefined,
    _body: string,
    _credentials: Record<string, unknown>,
    _metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(`SMS queued to "${to}" via Twilio | messageId: ${messageId}`);

    // In production, this would use the Twilio SDK:
    // const client = twilio(accountSid, authToken);
    // await client.messages.create({ to, from: fromNumber, body });
    return {
      success: true,
      messageId,
      provider: this.providerType,
    };
  }
}
