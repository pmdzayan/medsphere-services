import { loadEnv } from '@medsphere/config';
import {
  ContractSmsProviderRegistry,
  parseSmsProviderActivationEnvironment,
} from './sms-provider-activation.contracts';
import { MSG91_PROVIDER_KEY, Msg91SmsProviderAdapter } from './msg91-sms-provider.adapter';

export interface SmsProviderRegistryFactoryDependencies {
  /** Test seam only. Production omits this and uses the platform fetch. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Creates the existing ADR-023 fail-closed SMS registry. MSG91 is wired only
 * when SMS delivery is explicitly enabled with provider key "msg91".
 * Unsupported keys receive no adapter, so they cannot silently become a
 * mock/test production fallback.
 */
export function createSmsProviderRegistry(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: SmsProviderRegistryFactoryDependencies = {},
): ContractSmsProviderRegistry {
  const activation = parseSmsProviderActivationEnvironment(environment);
  if (!activation.enabled || activation.providerKey !== MSG91_PROVIDER_KEY) {
    return new ContractSmsProviderRegistry(activation);
  }

  const credentialReference = activation.credentialReference;
  if (!credentialReference) {
    // parseSmsProviderActivationEnvironment already fails closed here; this
    // branch is a defensive type/runtime boundary and exposes no secret data.
    throw new Error('SMS provider credential configuration is invalid');
  }

  const configuration = loadEnv(
    [credentialReference, 'MSG91_FLOW_ID', 'MSG91_SENDER_ID'] as const,
    environment,
  );
  const adapter = new Msg91SmsProviderAdapter(
    {
      authKey: configuration[credentialReference],
      flowId: configuration.MSG91_FLOW_ID,
      senderId: configuration.MSG91_SENDER_ID,
      otpVariableName: environment.MSG91_OTP_FLOW_VARIABLE_NAME,
      timeoutMs: activation.timeoutMs,
    },
    dependencies.fetchImpl,
  );
  return new ContractSmsProviderRegistry(activation, adapter);
}
