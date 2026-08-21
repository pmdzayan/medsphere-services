import { createNotificationProviderRegistry } from './notification-provider-registry.factory';
import { SMTP_PROVIDER_KEY } from './smtp-notification-provider.adapter';

const BASE_ENV = {} as Record<string, string | undefined>;

describe('createNotificationProviderRegistry', () => {
  it('remains disabled by default with no activation configuration', () => {
    const registry = createNotificationProviderRegistry(BASE_ENV);
    expect(registry.health('EMAIL')).toEqual({ state: 'DISABLED', channel: 'EMAIL' });
    expect(() => registry.forChannel('EMAIL')).toThrow();
  });

  it('activates a real SMTP adapter for valid explicit configuration', () => {
    const registry = createNotificationProviderRegistry({
      ...BASE_ENV,
      NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'true',
      NOTIFICATION_EMAIL_PROVIDER_KEY: SMTP_PROVIDER_KEY,
      NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMTP_CONNECTION_URL',
      TEST_SMTP_CONNECTION_URL: 'smtp://user:pass@localhost:2525',
      NOTIFICATION_EMAIL_FROM_ADDRESS: 'reservations@medsphere.test',
    });

    const health = registry.health('EMAIL');
    expect(health).toEqual({ state: 'READY', providerKey: SMTP_PROVIDER_KEY, channel: 'EMAIL' });
    const adapter = registry.forChannel('EMAIL');
    expect(adapter.providerKey).toBe(SMTP_PROVIDER_KEY);
  });

  it('fails closed for an unsupported provider key without falling back', () => {
    const registry = createNotificationProviderRegistry({
      ...BASE_ENV,
      NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'true',
      NOTIFICATION_EMAIL_PROVIDER_KEY: 'unsupported-vendor',
      NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMTP_CONNECTION_URL',
    });

    expect(registry.health('EMAIL').state).toBe('UNAVAILABLE');
    expect(() => registry.forChannel('EMAIL')).toThrow();
  });

  it('throws (fails application bootstrap) when enabled but the referenced secret is missing', () => {
    expect(() =>
      createNotificationProviderRegistry({
        ...BASE_ENV,
        NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'true',
        NOTIFICATION_EMAIL_PROVIDER_KEY: SMTP_PROVIDER_KEY,
        NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMTP_CONNECTION_URL',
        // TEST_SMTP_CONNECTION_URL and NOTIFICATION_EMAIL_FROM_ADDRESS
        // deliberately absent.
      }),
    ).toThrow(/Missing required environment variable/);
  });

  it('throws for malformed activation configuration rather than silently disabling', () => {
    expect(() =>
      createNotificationProviderRegistry({
        ...BASE_ENV,
        NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'not-a-boolean',
      }),
    ).toThrow();
  });

  it('never exposes the credential reference name or value through health()', () => {
    const registry = createNotificationProviderRegistry({
      ...BASE_ENV,
      NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'true',
      NOTIFICATION_EMAIL_PROVIDER_KEY: SMTP_PROVIDER_KEY,
      NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMTP_CONNECTION_URL',
      TEST_SMTP_CONNECTION_URL: 'smtp://user:super-secret-password@localhost:2525',
      NOTIFICATION_EMAIL_FROM_ADDRESS: 'reservations@medsphere.test',
    });

    const serialized = JSON.stringify(registry.health('EMAIL'));
    expect(serialized).not.toContain('super-secret-password');
    expect(serialized).not.toContain('TEST_SMTP_CONNECTION_URL');
    expect(serialized).not.toContain('smtp://');
  });
});
