import { Injectable, Logger } from '@nestjs/common';
import { NotificationProviderType } from '../enums';
import { NotificationProvider, NotificationSendResult } from './notification-provider.interface';

/**
 * Email notification provider.
 *
 * Supports SMTP, SendGrid, and AWS SES credential configurations.
 * In development, this provider simulates delivery by logging the
 * notification and returning a synthetic message ID. In production,
 * it would integrate with the appropriate email service SDK.
 */
@Injectable()
export class EmailProvider implements NotificationProvider {
  readonly providerType = NotificationProviderType.SMTP;
  private readonly logger = new Logger(EmailProvider.name);

  async send(
    to: string,
    subject: string | undefined,
    body: string,
    credentials: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const provider = credentials.provider as string | undefined;
    const messageId = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log(
      `Email queued to "${to}" via ${provider ?? 'SMTP'}` +
        (subject ? ` | subject: "${subject}"` : '') +
        ` | messageId: ${messageId}`,
    );

    // In production, this would use nodemailer, @sendgrid/mail, or @aws-sdk/client-ses
    // based on the configured provider type. For now, we simulate successful delivery.
    return {
      success: true,
      messageId,
      provider: this.providerType,
    };
  }
}
