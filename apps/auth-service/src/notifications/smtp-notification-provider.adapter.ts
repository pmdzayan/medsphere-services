import nodemailer, { type Transporter } from 'nodemailer';
import type {
  ActivatedNotificationProviderAdapter,
  NotificationProviderResult,
} from './notification-provider-activation.contracts';
import { NotificationProviderContractFailure } from './notification-provider-activation.contracts';
import type { NotificationProviderDeliveryInput } from './notification.contracts';

export const SMTP_PROVIDER_KEY = 'smtp';

export interface SmtpNotificationProviderConfig {
  /** Full SMTP connection URL, e.g. smtps://user:pass@host:465. The secret
   *  value itself -- callers must obtain this only via a runtime secret
   *  reference, never a literal, and must never log or persist it. */
  readonly connectionUrl: string;
  readonly fromAddress: string;
  readonly timeoutMs: number;
}

/**
 * Smallest adapter that satisfies the accepted NotificationProviderAdapter
 * contract for the EMAIL channel: a single deliver() method, no
 * vendor-specific fields leaking into the domain layer, and normalized
 * TRANSIENT/TERMINAL failure classification. SMTP is protocol-based, not a
 * proprietary vendor SDK, so this adapter works against any
 * SMTP-compatible provider (a corporate relay, or any vendor's SMTP
 * endpoint) without contaminating the domain with vendor-specific types.
 *
 * Never logs or persists: the connection URL/credential, the destination
 * address, the composed subject/body, or the raw provider response/error.
 * Only a normalized failure code and an optional provider reference are
 * ever surfaced to the caller.
 */
export class SmtpNotificationProviderAdapter implements ActivatedNotificationProviderAdapter {
  readonly providerKey = SMTP_PROVIDER_KEY;
  readonly channel = 'EMAIL' as const;

  private transport: Transporter | undefined;

  constructor(
    private readonly config: SmtpNotificationProviderConfig,
    /** Test seam only: inject a pre-built transporter (e.g. nodemailer's
     *  own zero-network jsonTransport) to prove real delivery logic
     *  without touching the network. Production always builds a real
     *  transport from config.connectionUrl. */
    private readonly testTransport?: Transporter,
  ) {}

  async deliver(input: NotificationProviderDeliveryInput): Promise<NotificationProviderResult> {
    if (input.channel !== this.channel) {
      throw new NotificationProviderContractFailure(
        'PROVIDER_CHANNEL_UNSUPPORTED',
        this.providerKey,
        'TERMINAL',
      );
    }

    const transport = this.transport ?? this.createTransport();
    this.transport = transport;

    try {
      const info = await transport.sendMail({
        from: this.config.fromAddress,
        to: input.destinationToken,
        subject: input.composedContent.subject,
        text: input.composedContent.body,
        // The provider's own generated Message-ID doubles as a delivery
        // reference for observability -- it is not the same value as
        // MedSphere's own idempotency key, and callers must still only
        // ever hash it before persisting (see NotificationWorkerService).
        headers: { 'X-MedSphere-Delivery-Id': input.deliveryId },
      });
      return { acknowledgement: 'ACCEPTED', providerReference: info.messageId };
    } catch (error) {
      throw new NotificationProviderContractFailure(
        classifyFailureCode(error),
        this.providerKey,
        classifyFailure(error),
      );
    }
  }

  private createTransport(): Transporter {
    if (this.testTransport) return this.testTransport;
    return nodemailer.createTransport({
      url: this.config.connectionUrl,
      connectionTimeout: this.config.timeoutMs,
      greetingTimeout: this.config.timeoutMs,
      socketTimeout: this.config.timeoutMs,
    });
  }
}

/**
 * Normalizes SMTP/network failures into the accepted TRANSIENT/TERMINAL
 * classification without ever surfacing the raw vendor error (message,
 * stack, or response body) to any caller, log, or persisted record.
 */
function classifyFailure(error: unknown): 'TRANSIENT' | 'TERMINAL' {
  const code = nodemailerErrorCode(error);
  // Authentication and permanent-rejection failures will not resolve on
  // retry; everything else (connection/timeout/greylisting/rate-limit) is
  // treated as transient and left to the worker's bounded retry policy.
  if (code === 'EAUTH' || code === 'EENVELOPE') return 'TERMINAL';
  const responseCode = smtpResponseCode(error);
  if (responseCode !== undefined && responseCode >= 500 && responseCode < 600) return 'TERMINAL';
  return 'TRANSIENT';
}

function classifyFailureCode(error: unknown): string {
  return classifyFailure(error) === 'TERMINAL'
    ? 'PROVIDER_REJECTED_TERMINAL'
    : 'PROVIDER_DELIVERY_TRANSIENT';
}

function nodemailerErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const value = (error as { code: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function smtpResponseCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'responseCode' in error) {
    const value = (error as { responseCode: unknown }).responseCode;
    return typeof value === 'number' ? value : undefined;
  }
  return undefined;
}
