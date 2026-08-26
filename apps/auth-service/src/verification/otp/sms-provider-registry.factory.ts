import {
  ContractSmsProviderRegistry,
  parseSmsProviderActivationEnvironment,
} from './sms-provider-activation.contracts';

/**
 * Reads real activation configuration from the process environment. No
 * commercial SMS vendor adapter exists in this repository -- selecting one
 * is a separate deployment/business decision (see ADR-023). Until that
 * decision is made and an adapter is added here (mirroring
 * SmtpNotificationProviderAdapter's role for EMAIL), this factory can only
 * ever construct a registry with no adapter, which fails every OTP
 * dispatch closed with PROVIDER_UNAVAILABLE via the accepted
 * provider()/health() contract logic -- the same fail-closed default the
 * EMAIL channel had before PR #66.
 */
export function createSmsProviderRegistry(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ContractSmsProviderRegistry {
  const activation = parseSmsProviderActivationEnvironment(environment);
  // No adapter is ever constructed here: no vendor implementation exists
  // yet. A future change wires a real adapter the same way
  // notification-provider-registry.factory.ts does for SMTP.
  return new ContractSmsProviderRegistry(activation);
}
