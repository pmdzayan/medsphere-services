import { Injectable, Logger } from '@nestjs/common';
import { NotificationProviderType } from '../enums';
import { NotificationProvider, NotificationSendResult } from './notification-provider.interface';

/**
 * WhatsApp notification provider.
 *
 * Uses WhatsApp Business API credentials from the tenant configuration.
 * In development, this provider simulates delivery by logging the
 * notification and returning a synthetic message ID. In production,
 * it would integrate with the WhatsApp Business Cloud API.
 */
@Injectable()
export class WhatsappProvider implements NotificationProvider {
  readonly providerType = NotificationProviderType.WHATSAPP_BUSINESS;
  private readonly logger = new Logger(WhatsappProvider.name);

  async send(
    to: string,
    _subject: string | undefined,
    _body: string,
    _credentials: Record<string, unknown>,
    _metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const messageId = `whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(
      `WhatsApp message queued to "${to}" via WhatsApp Business | messageId: ${messageId}`,
    );

    // In production, this would use the WhatsApp Business Cloud API:
    // await fetch('https://graph.facebook.com/v18.0/{phone-number-id}/messages', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body } }),
    // });
    return {
      success: true,
      messageId,
      provider: this.providerType,
    };
  }
}
