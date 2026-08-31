import type {
  ActivatedSmsProviderAdapter,
  SmsProviderDeliveryInput,
  SmsProviderResult,
} from './sms-provider-activation.contracts';
import {
  MAX_SMS_PROVIDER_TIMEOUT_MS,
  MIN_SMS_PROVIDER_TIMEOUT_MS,
  SmsProviderContractFailure,
} from './sms-provider-activation.contracts';
import { isValidOtpCodeFormat } from './otp-crypto.util';
import { isValidE164PhoneNumber } from './phone-normalization';

/**
 * ADR-024: production MSG91 delivery adapter behind ADR-023's existing
 * fail-closed SMS provider boundary. The application remains the sole OTP
 * authority: the service generates, hashes, expires, verifies, throttles,
 * and invalidates OTP challenges. This adapter only transmits the exact
 * OTP the application already generated through MSG91's Flow API.
 *
 * It never calls MSG91 SendOTP or Verify OTP and therefore never creates a
 * second OTP state machine. It also never logs or returns credentials,
 * destinations, OTP values, composed SMS bodies, or raw provider payloads.
 */
export const MSG91_PROVIDER_KEY = 'msg91';

const MSG91_FLOW_ENDPOINT = 'https://api.msg91.com/api/v5/flow/';
const DEFAULT_OTP_FLOW_VARIABLE_NAME = 'OTP';
const FLOW_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const PROVIDER_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const MAX_CONFIGURATION_VALUE_LENGTH = 256;

export interface Msg91SmsProviderConfig {
  /** Resolved MSG91 auth key. Secret: never log, persist, or expose it. */
  readonly authKey: string;
  /** MSG91 Flow ID used by the Flow API. This is not a DLT Template ID. */
  readonly flowId: string;
  /** Sender/header configured in MSG91 and DLT-approved where required. */
  readonly senderId: string;
  /** Named Flow variable that receives the application's OTP. Defaults to OTP. */
  readonly otpVariableName?: string;
  readonly timeoutMs: number;
}

interface ValidatedMsg91SmsProviderConfig {
  readonly authKey: string;
  readonly flowId: string;
  readonly senderId: string;
  readonly otpVariableName: string;
  readonly timeoutMs: number;
}

interface Msg91FlowResponseShape {
  readonly type?: unknown;
  readonly message?: unknown;
}

export class Msg91SmsProviderAdapter implements ActivatedSmsProviderAdapter {
  readonly providerKey = MSG91_PROVIDER_KEY;
  private readonly config: ValidatedMsg91SmsProviderConfig;

  constructor(
    config: Msg91SmsProviderConfig,
    /** Test seam only. Production uses the platform fetch implementation. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.config = validateConfig(config);
  }

  async deliver(input: SmsProviderDeliveryInput): Promise<SmsProviderResult> {
    if (!isValidE164PhoneNumber(input.to)) {
      throw failure('PROVIDER_DESTINATION_INVALID', 'TERMINAL');
    }
    if (!input.otpCode || !isValidOtpCodeFormat(input.otpCode)) {
      throw failure('PROVIDER_REQUEST_INVALID_OTP', 'TERMINAL');
    }

    const mobile = toMsg91MobileFormat(input.to);
    let response: Response;
    try {
      response = await this.fetchImpl(MSG91_FLOW_ENDPOINT, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/json',
          authkey: this.config.authKey,
        },
        body: JSON.stringify({
          flow_id: this.config.flowId,
          sender: this.config.senderId,
          recipients: [
            {
              mobiles: mobile,
              [this.config.otpVariableName]: input.otpCode,
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      // Network/DNS failures and timeout aborts are retryable at the application's
      // existing bounded retry boundary. Provider details are deliberately
      // discarded so secrets or message data cannot leak into errors.
      throw failure('PROVIDER_NETWORK_FAILURE', 'TRANSIENT');
    }

    if (response.status === 429) {
      throw failure('PROVIDER_RATE_LIMITED', 'TRANSIENT');
    }
    if (response.status >= 500 && response.status <= 599) {
      throw failure('PROVIDER_SERVER_ERROR', 'TRANSIENT');
    }
    if (response.status === 401 || response.status === 403) {
      throw failure('PROVIDER_AUTH_REJECTED', 'TERMINAL');
    }
    if (response.status === 400 || response.status === 422) {
      throw failure('PROVIDER_REQUEST_REJECTED', 'TERMINAL');
    }
    if (response.status >= 300 && response.status <= 399) {
      throw failure('PROVIDER_REDIRECT_REJECTED', 'TERMINAL');
    }
    if (!response.ok) {
      throw failure('PROVIDER_REQUEST_REJECTED', 'TERMINAL');
    }

    let parsed: Msg91FlowResponseShape;
    try {
      parsed = (await response.json()) as Msg91FlowResponseShape;
    } catch {
      throw failure('PROVIDER_RESPONSE_MALFORMED', 'TERMINAL');
    }

    if (typeof parsed.type !== 'string') {
      throw failure('PROVIDER_RESPONSE_MALFORMED', 'TERMINAL');
    }

    const responseType = parsed.type.trim().toLowerCase();
    if (responseType === 'error') {
      throw failure('PROVIDER_REJECTED_TERMINAL', 'TERMINAL');
    }
    if (responseType !== 'success') {
      throw failure('PROVIDER_RESPONSE_MALFORMED', 'TERMINAL');
    }

    const providerReference = safeProviderReference(
      parsed.message,
      input,
      mobile,
      this.config.authKey,
    );
    if (!providerReference) {
      throw failure('PROVIDER_RESPONSE_MALFORMED', 'TERMINAL');
    }

    return { acknowledgement: 'ACCEPTED', providerReference };
  }
}

function validateConfig(config: Msg91SmsProviderConfig): ValidatedMsg91SmsProviderConfig {
  const authKey = boundedNonEmpty(config.authKey);
  const flowId = boundedNonEmpty(config.flowId);
  const senderId = boundedNonEmpty(config.senderId);
  const otpVariableName =
    config.otpVariableName === undefined ? DEFAULT_OTP_FLOW_VARIABLE_NAME : config.otpVariableName;

  if (!authKey || !flowId || !senderId || !FLOW_VARIABLE_NAME_PATTERN.test(otpVariableName)) {
    throw failure('PROVIDER_CONFIGURATION_INVALID', 'TERMINAL');
  }
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < MIN_SMS_PROVIDER_TIMEOUT_MS ||
    config.timeoutMs > MAX_SMS_PROVIDER_TIMEOUT_MS
  ) {
    throw failure('PROVIDER_CONFIGURATION_INVALID', 'TERMINAL');
  }

  return {
    authKey,
    flowId,
    senderId,
    otpVariableName,
    timeoutMs: config.timeoutMs,
  };
}

function boundedNonEmpty(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_CONFIGURATION_VALUE_LENGTH ? trimmed : null;
}

function toMsg91MobileFormat(e164Phone: string): string {
  return e164Phone.startsWith('+') ? e164Phone.slice(1) : e164Phone;
}

function safeProviderReference(
  value: unknown,
  input: SmsProviderDeliveryInput,
  mobile: string,
  authKey: string,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const reference = value.trim();
  if (!PROVIDER_REFERENCE_PATTERN.test(reference)) {
    return null;
  }

  const sensitiveValues = [authKey, input.to, mobile, input.otpCode, input.body].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  );
  return sensitiveValues.some((sensitive) => reference.includes(sensitive)) ? null : reference;
}

function failure(code: string, classification: 'TRANSIENT' | 'TERMINAL') {
  return new Msg91ContractFailure(code, classification);
}

class Msg91ContractFailure extends SmsProviderContractFailure {
  constructor(code: string, classification: 'TRANSIENT' | 'TERMINAL') {
    super(code, MSG91_PROVIDER_KEY, classification);
    this.name = 'Msg91ContractFailure';
  }
}
