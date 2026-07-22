import { NotificationProviderType } from '../enums';

/**
 * Result of a notification delivery attempt.
 */
export interface NotificationSendResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  provider: NotificationProviderType;
}

/**
 * Common interface that all notification channel providers must implement.
 *
 * Each provider is responsible for delivering a notification through its
 * specific channel (Email, SMS, WhatsApp, Push) using the configured
 * credentials.
 */
export interface NotificationProvider {
  /**
   * The provider type this implementation handles.
   */
  readonly providerType: NotificationProviderType;

  /**
   * Send a notification through this provider's channel.
   *
   * @param to The recipient address (email, phone number, or device token)
   * @param subject Optional subject line (for Email/Push)
   * @param body The message body
   * @param credentials Provider-specific credentials from TenantNotificationConfig
   * @param metadata Additional metadata for the delivery
   */
  send(
    to: string,
    subject: string | undefined,
    body: string,
    credentials: Record<string, unknown>,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationSendResult>;
}
