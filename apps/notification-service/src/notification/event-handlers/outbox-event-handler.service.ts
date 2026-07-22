import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OutboxService } from '@medsphere/event-bus';
import { DomainEventEnvelope } from '@medsphere/event-bus';
import { NotificationService } from '../notification.service';
import { NotificationRepository } from '../notification.repository';
import { NotificationChannel } from '../enums';

/**
 * Maps domain event types to notification template codes.
 *
 * When an outbox event is processed, the handler looks up templates
 * matching this code for the tenant and sends notifications through
 * each template's configured channel.
 */
const EVENT_TEMPLATE_MAP: Record<string, string> = {
  'patient.created': 'PATIENT_REGISTERED',
  'patient.registered': 'PATIENT_REGISTERED',
  'clinical.prescription.submitted': 'RX_SUBMITTED_PATIENT',
  'finance.invoice.issued': 'INVOICE_ISSUED',
};

/**
 * Maps notification channels to the payload field that contains the recipient.
 */
const RECIPIENT_FIELD_MAP: Record<NotificationChannel, string> = {
  [NotificationChannel.EMAIL]: 'email',
  [NotificationChannel.SMS]: 'phone',
  [NotificationChannel.WHATSAPP]: 'phone',
  [NotificationChannel.PUSH]: 'deviceToken',
};

/**
 * Event-driven notification trigger.
 *
 * Subscribes to Gate 6 outbox events via the OutboxService and dispatches
 * multi-channel notifications based on tenant-configured templates.
 *
 * Supported events:
 * - `patient.created` → PATIENT_REGISTERED template
 * - `clinical.prescription.submitted` → RX_SUBMITTED_PATIENT template
 * - `finance.invoice.issued` → INVOICE_ISSUED template
 */
@Injectable()
export class OutboxEventHandler implements OnModuleInit {
  private readonly logger = new Logger(OutboxEventHandler.name);

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationService: NotificationService,
  ) {}

  onModuleInit(): void {
    const eventTypes = Object.keys(EVENT_TEMPLATE_MAP);
    for (const eventType of eventTypes) {
      this.outboxService.on(eventType, this.handleEvent.bind(this));
    }
    this.logger.log(`Registered notification event handlers for: ${eventTypes.join(', ')}`);
  }

  /**
   * Handle an outbox domain event by looking up templates and sending
   * notifications through each configured channel.
   */
  private async handleEvent(event: DomainEventEnvelope): Promise<void> {
    const { eventType, tenantId, payload, correlationId } = event;
    const templateCode = EVENT_TEMPLATE_MAP[eventType];

    if (!templateCode) {
      this.logger.warn(`No template mapping for event type "${eventType}"`);
      return;
    }

    // Find all templates for this tenant and code (across all channels)
    const templates = await this.notificationRepository.findTemplatesByTenantAndCode(
      tenantId,
      templateCode,
    );

    if (templates.length === 0) {
      this.logger.warn(`No active templates found for tenant ${tenantId}, code "${templateCode}"`);
      return;
    }

    const payloadRecord = payload as Record<string, unknown>;

    // Send a notification for each template (one per channel)
    for (const template of templates) {
      const channel = template.channel as unknown as NotificationChannel;
      const recipientField = RECIPIENT_FIELD_MAP[channel];
      const recipient = payloadRecord[recipientField] as string | undefined;

      if (!recipient) {
        this.logger.warn(
          `No recipient found in payload for channel ${channel} (field: ${recipientField})`,
        );
        continue;
      }

      try {
        await this.notificationService.sendFromTemplate({
          tenantId,
          channel,
          recipient,
          templateCode,
          payload: payloadRecord,
          correlationId,
        });

        this.logger.log(
          `Notification sent for event "${eventType}" via ${channel} to ${recipient}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send notification for event "${eventType}" via ${channel}: ${(error as Error).message}`,
        );
      }
    }
  }
}
