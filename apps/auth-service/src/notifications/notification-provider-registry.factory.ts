import { loadEnv } from '@medsphere/config';
import {
  ContractNotificationProviderRegistry,
  parseProviderActivationEnvironment,
} from './notification-provider-activation.contracts';
import {
  SMTP_PROVIDER_KEY,
  SmtpNotificationProviderAdapter,
} from './smtp-notification-provider.adapter';

/**
 * Reads real activation configuration from the process environment and
 * constructs the accepted G3.29 registry -- disabled by construction when
 * no activation config is present, and failing closed for any
 * unsupported provider key. Kept in its own file, independent of
 * NotificationModule/PrismaModule, so this logic can be exercised
 * directly without pulling in the database layer.
 *
 * No activation config -> disabled by construction
 * (parseProviderActivationEnvironment defaults `enabled` to false and
 * validateProviderActivation forbids supplying provider/credential
 * fields while disabled). A malformed or incomplete activation throws
 * here, failing application bootstrap loudly -- the same fail-fast
 * philosophy @medsphere/config's own loadEnv already uses for missing
 * required variables, not a new policy invented for this module.
 */
export function createNotificationProviderRegistry(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ContractNotificationProviderRegistry {
  const activation = parseProviderActivationEnvironment(environment);
  if (!activation.enabled || activation.providerKey !== SMTP_PROVIDER_KEY) {
    // Either genuinely disabled, or an unsupported provider key was
    // configured -- both fall through to a registry with no adapter,
    // which already fails every request closed via the accepted
    // forChannel()/health() contract logic.
    return new ContractNotificationProviderRegistry(activation);
  }
  const secrets = loadEnv(
    [activation.credentialReference as string, 'NOTIFICATION_EMAIL_FROM_ADDRESS'] as const,
    environment,
  );
  const adapter = new SmtpNotificationProviderAdapter({
    connectionUrl: secrets[activation.credentialReference as string],
    fromAddress: secrets.NOTIFICATION_EMAIL_FROM_ADDRESS,
    timeoutMs: activation.timeoutMs,
  });
  return new ContractNotificationProviderRegistry(activation, adapter);
}
