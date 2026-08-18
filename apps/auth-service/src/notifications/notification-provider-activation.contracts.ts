import type { NotificationChannel } from '@medsphere/database';
import type {
  NotificationProviderAdapter,
  NotificationProviderDeliveryInput,
  NotificationProviderRegistry,
} from './notification.contracts';
import { NotificationDeliveryFailure } from './notification.errors';

export const FIRST_SUPPORTED_NOTIFICATION_CHANNEL: NotificationChannel = 'EMAIL';
export const DEFAULT_PROVIDER_TIMEOUT_MS = 5_000;
export const MIN_PROVIDER_TIMEOUT_MS = 250;
export const MAX_PROVIDER_TIMEOUT_MS = 10_000;

const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SECRET_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;

export type NotificationProviderAcknowledgement = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
export type NotificationProviderFailureClass = 'TRANSIENT' | 'TERMINAL';
export type NotificationProviderReadinessState = 'DISABLED' | 'READY' | 'DEGRADED' | 'UNAVAILABLE';

export interface NotificationProviderActivationDeclaration {
  readonly enabled: boolean;
  readonly channel: NotificationChannel;
  readonly providerKey?: string;
  /** Name of a runtime secret/config key. Never the secret value itself. */
  readonly credentialReference?: string;
  readonly timeoutMs?: number;
}

export interface ValidatedNotificationProviderActivation {
  readonly enabled: boolean;
  readonly channel: NotificationChannel;
  readonly providerKey?: string;
  readonly credentialReference?: string;
  readonly timeoutMs: number;
}

export interface NotificationProviderSafeConfigView {
  readonly enabled: boolean;
  readonly channel: NotificationChannel;
  readonly providerKey?: string;
  readonly timeoutMs: number;
}

export interface NotificationProviderResult {
  readonly acknowledgement: NotificationProviderAcknowledgement;
  /** Volatile provider reference. Callers may hash it but must not persist it raw. */
  readonly providerReference?: string;
}

export interface ActivatedNotificationProviderAdapter extends NotificationProviderAdapter {
  readonly channel: NotificationChannel;
  deliver(input: NotificationProviderDeliveryInput): Promise<NotificationProviderResult>;
}

export interface NotificationProviderHealth {
  readonly state: NotificationProviderReadinessState;
  readonly providerKey?: string;
  readonly channel: NotificationChannel;
  readonly code?: string;
}

export class NotificationProviderContractFailure extends NotificationDeliveryFailure {
  constructor(
    code: string,
    providerKey: string,
    readonly classification: NotificationProviderFailureClass,
  ) {
    super(code, providerKey);
    this.name = 'NotificationProviderContractFailure';
  }
}

export function parseProviderActivationEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ValidatedNotificationProviderActivation {
  const enabledValue = environment.NOTIFICATION_EMAIL_PROVIDER_ENABLED;
  if (enabledValue !== undefined && enabledValue !== 'true' && enabledValue !== 'false') {
    throw configurationFailure('PROVIDER_ENABLED_INVALID');
  }

  const timeoutValue = environment.NOTIFICATION_EMAIL_PROVIDER_TIMEOUT_MS;
  if (timeoutValue !== undefined && !/^\d+$/.test(timeoutValue)) {
    throw configurationFailure('PROVIDER_TIMEOUT_INVALID');
  }

  return validateProviderActivation({
    enabled: enabledValue === 'true',
    channel: FIRST_SUPPORTED_NOTIFICATION_CHANNEL,
    providerKey: environment.NOTIFICATION_EMAIL_PROVIDER_KEY,
    credentialReference: environment.NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE,
    timeoutMs: timeoutValue === undefined ? undefined : Number(timeoutValue),
  });
}

export function validateProviderActivation(
  declaration: NotificationProviderActivationDeclaration,
): ValidatedNotificationProviderActivation {
  if (declaration.channel !== FIRST_SUPPORTED_NOTIFICATION_CHANNEL) {
    throw configurationFailure('PROVIDER_CHANNEL_UNSUPPORTED');
  }

  const timeoutMs = declaration.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_PROVIDER_TIMEOUT_MS ||
    timeoutMs > MAX_PROVIDER_TIMEOUT_MS
  ) {
    throw configurationFailure('PROVIDER_TIMEOUT_INVALID');
  }

  if (!declaration.enabled) {
    if (declaration.providerKey || declaration.credentialReference) {
      throw configurationFailure('PROVIDER_DISABLED_CONFIGURATION_CONFLICT');
    }
    return { enabled: false, channel: declaration.channel, timeoutMs };
  }

  if (!declaration.providerKey || !PROVIDER_KEY_PATTERN.test(declaration.providerKey)) {
    throw configurationFailure('PROVIDER_KEY_INVALID');
  }
  if (
    !declaration.credentialReference ||
    !SECRET_REFERENCE_PATTERN.test(declaration.credentialReference)
  ) {
    throw new NotificationProviderContractFailure(
      'PROVIDER_CREDENTIAL_REFERENCE_INVALID',
      declaration.providerKey,
      'TERMINAL',
    );
  }

  return {
    enabled: true,
    channel: declaration.channel,
    providerKey: declaration.providerKey,
    credentialReference: declaration.credentialReference,
    timeoutMs,
  };
}

export function providerSafeConfigView(
  config: ValidatedNotificationProviderActivation,
): NotificationProviderSafeConfigView {
  return {
    enabled: config.enabled,
    channel: config.channel,
    providerKey: config.providerKey,
    timeoutMs: config.timeoutMs,
  };
}

export class ContractNotificationProviderRegistry implements NotificationProviderRegistry {
  private readonly activation: ValidatedNotificationProviderActivation;
  private readonly adapter?: ActivatedNotificationProviderAdapter;

  constructor(
    declaration: NotificationProviderActivationDeclaration,
    adapter?: ActivatedNotificationProviderAdapter,
  ) {
    this.activation = validateProviderActivation(declaration);
    this.adapter = adapter;
  }

  forChannel(channel: NotificationChannel): NotificationProviderAdapter {
    if (channel !== this.activation.channel || !this.activation.enabled) {
      throw new NotificationProviderContractFailure(
        'PROVIDER_UNAVAILABLE',
        'unconfigured',
        'TRANSIENT',
      );
    }
    if (
      !this.adapter ||
      this.adapter.providerKey !== this.activation.providerKey ||
      this.adapter.channel !== channel
    ) {
      throw new NotificationProviderContractFailure(
        'PROVIDER_CONFIGURATION_INVALID',
        this.activation.providerKey ?? 'unconfigured',
        'TERMINAL',
      );
    }
    return this.adapter;
  }

  health(channel: NotificationChannel): NotificationProviderHealth {
    if (channel !== this.activation.channel || !this.activation.enabled) {
      return { state: 'DISABLED', channel };
    }
    if (
      !this.adapter ||
      this.adapter.providerKey !== this.activation.providerKey ||
      this.adapter.channel !== channel
    ) {
      return {
        state: 'UNAVAILABLE',
        providerKey: this.activation.providerKey,
        channel,
        code: 'PROVIDER_CONFIGURATION_INVALID',
      };
    }
    return { state: 'READY', providerKey: this.adapter.providerKey, channel };
  }
}

function configurationFailure(code: string): NotificationProviderContractFailure {
  return new NotificationProviderContractFailure(code, 'unconfigured', 'TERMINAL');
}
