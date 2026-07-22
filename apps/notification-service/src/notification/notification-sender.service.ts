import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import { TemplateEngine } from './template-engine';
import { NotificationChannel, NotificationProviderType, NotificationStatus } from './enums';
import {
  NotificationProvider,
  NotificationSendResult,
} from './providers/notification-provider.interface';
import {
  EmailProvider,
  SmsProvider,
  WhatsappProvider,
  PushProvider,
  MockProvider,
} from './providers';

/**
 * Sends notifications through the appropriate channel provider.
 *
 * This service resolves the tenant's notification configuration, selects
 * the correct provider implementation, renders the template (if applicable),
 * and records the delivery outcome in the notification log.
 */
@Injectable()
export class NotificationSenderService {
  private readonly logger = new Logger(NotificationSenderService.name);

  private readonly providerMap: Record<NotificationProviderType, NotificationProvider>;

  constructor(
    private readonly repository: NotificationRepository,
    private readonly templateEngine: TemplateEngine,
    emailProvider: EmailProvider,
    smsProvider: SmsProvider,
    whatsappProvider: WhatsappProvider,
    pushProvider: PushProvider,
    mockProvider: MockProvider,
  ) {
    this.providerMap = {
      [NotificationProviderType.SMTP]: emailProvider,
      [NotificationProviderType.SENDGRID]: emailProvider,
      [NotificationProviderType.AWS_SES]: emailProvider,
      [NotificationProviderType.TWILIO]: smsProvider,
      [NotificationProviderType.WHATSAPP_BUSINESS]: whatsappProvider,
      [NotificationProviderType.FCM]: pushProvider,
      [NotificationProviderType.MOCK]: mockProvider,
    };
  }

  /**
   * Send a notification directly (without a template).
   */
  async sendDirect(params: {
    tenantId: string;
    userId?: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    body: string;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationSendResult> {
    const config = await this.repository.findDefaultConfig(params.tenantId, params.channel);

    if (!config) {
      throw new NotFoundException(
        `No active notification config found for tenant ${params.tenantId} on channel ${params.channel}`,
      );
    }

    const provider = this.providerMap[config.provider];
    if (!provider) {
      throw new NotFoundException(`No provider implementation registered for ${config.provider}`);
    }

    const credentials = config.credentials as Record<string, unknown>;
    const result = await provider.send(
      params.recipient,
      params.subject,
      params.body,
      credentials,
      params.metadata,
    );

    // Record the delivery outcome
    await this.repository.createLog({
      tenantId: params.tenantId,
      userId: params.userId,
      channel: params.channel,
      recipient: params.recipient,
      subject: params.subject ?? null,
      body: params.body,
      status: result.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
      errorMessage: result.errorMessage ?? null,
      correlationId: params.correlationId ?? null,
      metadata: params.metadata ?? null,
      sentAt: result.success ? new Date() : null,
    });

    if (!result.success) {
      this.logger.error(
        `Failed to send ${params.channel} notification to ${params.recipient}: ${result.errorMessage}`,
      );
    }

    return result;
  }

  /**
   * Send a notification from a template, rendering placeholders with the payload.
   */
  async sendFromTemplate(params: {
    tenantId: string;
    userId?: string;
    channel: NotificationChannel;
    recipient: string;
    templateCode: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationSendResult> {
    const template = await this.repository.findTemplateByTenantCodeChannel(
      params.tenantId,
      params.templateCode,
      params.channel,
    );

    if (!template || !template.isActive) {
      throw new NotFoundException(
        `No active template found for tenant ${params.tenantId}, code "${params.templateCode}", channel ${params.channel}`,
      );
    }

    const variables = template.variables as string[] | undefined;
    const rendered = this.templateEngine.render(
      template.body,
      template.subject,
      params.payload,
      variables,
    );

    return this.sendDirect({
      tenantId: params.tenantId,
      userId: params.userId,
      channel: params.channel,
      recipient: params.recipient,
      subject: rendered.subject,
      body: rendered.body,
      correlationId: params.correlationId,
      metadata: { ...params.metadata, templateCode: params.templateCode },
    });
  }
}
