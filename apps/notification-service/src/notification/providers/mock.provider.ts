import { Injectable, Logger } from '@nestjs/common';
import { NotificationProviderType } from '../enums';
import { NotificationProvider, NotificationSendResult } from './notification-provider.interface';

/**
 * Mock provider for local testing and development.
 *
 * Always succeeds and returns a synthetic message ID. This allows the
 * notification platform to be fully exercised end-to-end without real
 * email/SMS/WhatsApp/Push credentials.
 */
@Injectable()
export class MockProvider implements NotificationProvider {
  readonly providerType = NotificationProviderType.MOCK;
  private readonly logger = new Logger(MockProvider.name);

  async send(
    to: string,
    subject: string | undefined,
    body: string,
    _credentials: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const messageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(
      `MOCK notification sent to "${to}"` +
        (subject ? ` | subject: "${subject}"` : '') +
        ` | messageId: ${messageId}` +
        (metadata ? ` | metadata: ${JSON.stringify(metadata)}` : ''),
    );

    return {
      success: true,
      messageId,
      provider: this.providerType,
    };
  }
}
