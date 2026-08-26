import { NotificationDeliveryFailure } from '../../notifications/notification.errors';

/**
 * ADR-023: the SMS provider activation boundary for real phone OTP
 * delivery. Deliberately mirrors
 * notifications/notification-provider-activation.contracts.ts (accepted
 * under ADR-021 for EMAIL) file-for-file rather than generalizing that
 * module into a multi-channel registry -- this keeps the accepted EMAIL
 * contract and its existing tests completely untouched, at the cost of
 * some duplication. SMS remains disabled/fail-closed by construction:
 * this file activates no real vendor and commits no credential.
 */

export const OTP_SMS_CHANNEL = 'SMS' as const;
export const DEFAULT_SMS_PROVIDER_TIMEOUT_MS = 5_000;
export const MIN_SMS_PROVIDER_TIMEOUT_MS = 250;
export const MAX_SMS_PROVIDER_TIMEOUT_MS = 10_000;

const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SECRET_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]{2,127}$/;

export type SmsProviderAcknowledgement = 'ACCEPTED' | 'REJECTED' | 'UNKNOWN';
export type SmsProviderFailureClass = 'TRANSIENT' | 'TERMINAL';
export type SmsProviderReadinessState = 'DISABLED' | 'READY' | 'DEGRADED' | 'UNAVAILABLE';

export interface SmsProviderActivationDeclaration {
  readonly enabled: boolean;
  readonly providerKey?: string;
  /** Name of a runtime secret/config key. Never the secret value itself. */
  readonly credentialReference?: string;
  readonly timeoutMs?: number;
}

export interface ValidatedSmsProviderActivation {
  readonly enabled: boolean;
  readonly providerKey?: string;
  readonly credentialReference?: string;
  readonly timeoutMs: number;
}

export interface SmsProviderSafeConfigView {
  readonly enabled: boolean;
  readonly providerKey?: string;
  readonly timeoutMs: number;
}

export interface SmsProviderDeliveryInput {
  /** E.164 destination. Adapters must not log this. */
  readonly to: string;
  /** Fully composed message body. Adapters must not log this. */
  readonly body: string;
}

export interface SmsProviderResult {
  readonly acknowledgement: SmsProviderAcknowledgement;
  /** Volatile provider reference. Callers may hash it but must not persist it raw. */
  readonly providerReference?: string;
}

export interface ActivatedSmsProviderAdapter {
  readonly providerKey: string;
  deliver(input: SmsProviderDeliveryInput): Promise<SmsProviderResult>;
}

export interface SmsProviderHealth {
  readonly state: SmsProviderReadinessState;
  readonly providerKey?: string;
  readonly code?: string;
}

export class SmsProviderContractFailure extends NotificationDeliveryFailure {
  constructor(
    code: string,
    providerKey: string,
    readonly classification: SmsProviderFailureClass,
  ) {
    super(code, providerKey);
    this.name = 'SmsProviderContractFailure';
  }
}

export function parseSmsProviderActivationEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): ValidatedSmsProviderActivation {
  const enabledValue = environment.OTP_SMS_PROVIDER_ENABLED;
  if (enabledValue !== undefined && enabledValue !== 'true' && enabledValue !== 'false') {
    throw configurationFailure('PROVIDER_ENABLED_INVALID');
  }

  const timeoutValue = environment.OTP_SMS_PROVIDER_TIMEOUT_MS;
  if (timeoutValue !== undefined && !/^\d+$/.test(timeoutValue)) {
    throw configurationFailure('PROVIDER_TIMEOUT_INVALID');
  }

  return validateSmsProviderActivation({
    enabled: enabledValue === 'true',
    providerKey: environment.OTP_SMS_PROVIDER_KEY,
    credentialReference: environment.OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE,
    timeoutMs: timeoutValue === undefined ? undefined : Number(timeoutValue),
  });
}

export function validateSmsProviderActivation(
  declaration: SmsProviderActivationDeclaration,
): ValidatedSmsProviderActivation {
  const timeoutMs = declaration.timeoutMs ?? DEFAULT_SMS_PROVIDER_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MIN_SMS_PROVIDER_TIMEOUT_MS ||
    timeoutMs > MAX_SMS_PROVIDER_TIMEOUT_MS
  ) {
    throw configurationFailure('PROVIDER_TIMEOUT_INVALID');
  }

  if (!declaration.enabled) {
    if (declaration.providerKey || declaration.credentialReference) {
      throw configurationFailure('PROVIDER_DISABLED_CONFIGURATION_CONFLICT');
    }
    return { enabled: false, timeoutMs };
  }

  if (!declaration.providerKey || !PROVIDER_KEY_PATTERN.test(declaration.providerKey)) {
    throw configurationFailure('PROVIDER_KEY_INVALID');
  }
  if (
    !declaration.credentialReference ||
    !SECRET_REFERENCE_PATTERN.test(declaration.credentialReference)
  ) {
    throw new SmsProviderContractFailure(
      'PROVIDER_CREDENTIAL_REFERENCE_INVALID',
      declaration.providerKey,
      'TERMINAL',
    );
  }

  return {
    enabled: true,
    providerKey: declaration.providerKey,
    credentialReference: declaration.credentialReference,
    timeoutMs,
  };
}

export function smsProviderSafeConfigView(
  config: ValidatedSmsProviderActivation,
): SmsProviderSafeConfigView {
  return { enabled: config.enabled, providerKey: config.providerKey, timeoutMs: config.timeoutMs };
}

/**
 * Single-channel (SMS-only) fail-closed registry, deliberately not
 * generalized alongside ContractNotificationProviderRegistry -- see file
 * header. No production vendor is activated by this class; it only holds
 * whatever adapter its caller constructs from real configuration.
 */
export class ContractSmsProviderRegistry {
  private readonly activation: ValidatedSmsProviderActivation;
  private readonly adapter?: ActivatedSmsProviderAdapter;

  constructor(
    declaration: SmsProviderActivationDeclaration,
    adapter?: ActivatedSmsProviderAdapter,
  ) {
    this.activation = validateSmsProviderActivation(declaration);
    this.adapter = adapter;
  }

  provider(): ActivatedSmsProviderAdapter {
    if (!this.activation.enabled) {
      throw new SmsProviderContractFailure('PROVIDER_UNAVAILABLE', 'unconfigured', 'TRANSIENT');
    }
    if (!this.adapter || this.adapter.providerKey !== this.activation.providerKey) {
      throw new SmsProviderContractFailure(
        'PROVIDER_CONFIGURATION_INVALID',
        this.activation.providerKey ?? 'unconfigured',
        'TERMINAL',
      );
    }
    return this.adapter;
  }

  health(): SmsProviderHealth {
    if (!this.activation.enabled) {
      return { state: 'DISABLED' };
    }
    if (!this.adapter || this.adapter.providerKey !== this.activation.providerKey) {
      return {
        state: 'UNAVAILABLE',
        providerKey: this.activation.providerKey,
        code: 'PROVIDER_CONFIGURATION_INVALID',
      };
    }
    return { state: 'READY', providerKey: this.adapter.providerKey };
  }
}

function configurationFailure(code: string): SmsProviderContractFailure {
  return new SmsProviderContractFailure(code, 'unconfigured', 'TERMINAL');
}
