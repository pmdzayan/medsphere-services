import {
  type ActivatedNotificationProviderAdapter,
  ContractNotificationProviderRegistry,
  FIRST_SUPPORTED_NOTIFICATION_CHANNEL,
  NotificationProviderContractFailure,
  parseProviderActivationEnvironment,
  providerSafeConfigView,
  validateProviderActivation,
} from './notification-provider-activation.contracts';

const adapter: ActivatedNotificationProviderAdapter = {
  providerKey: 'test-email-provider',
  channel: 'EMAIL',
  deliver: jest.fn().mockResolvedValue({
    acknowledgement: 'ACCEPTED',
    providerReference: 'volatile-provider-reference',
  }),
};

describe('G3.29 notification provider activation contract', () => {
  it('selects EMAIL as the first supported channel and remains disabled by default', () => {
    expect(FIRST_SUPPORTED_NOTIFICATION_CHANNEL).toBe('EMAIL');
    expect(parseProviderActivationEnvironment({})).toEqual({
      enabled: false,
      channel: 'EMAIL',
      timeoutMs: 5_000,
    });
    const registry = new ContractNotificationProviderRegistry({
      enabled: false,
      channel: 'EMAIL',
    });
    expect(registry.health('EMAIL')).toEqual({ state: 'DISABLED', channel: 'EMAIL' });
    expect(() => registry.forChannel('EMAIL')).toThrow('Notification delivery failed');
  });

  it(
    'parses and validates the explicit startup configuration without resolving secret values',
    () => {
      expect(
        parseProviderActivationEnvironment({
          NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'true',
          NOTIFICATION_EMAIL_PROVIDER_KEY: 'test-email-provider',
          NOTIFICATION_EMAIL_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_EMAIL_PROVIDER_TOKEN',
          NOTIFICATION_EMAIL_PROVIDER_TIMEOUT_MS: '2000',
        }),
      ).toEqual({
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
        timeoutMs: 2_000,
      });
      expect(() =>
        parseProviderActivationEnvironment({ NOTIFICATION_EMAIL_PROVIDER_ENABLED: 'yes' }),
      ).toThrow('Notification delivery failed');
      expect(() =>
        parseProviderActivationEnvironment({ NOTIFICATION_EMAIL_PROVIDER_TIMEOUT_MS: '2s' }),
      ).toThrow('Notification delivery failed');
    },
  );

  it('fails closed for unsupported channels without falling back', () => {
    expect(() =>
      validateProviderActivation({
        enabled: true,
        channel: 'SMS',
        providerKey: 'test-email-provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
      }),
    ).toThrow(NotificationProviderContractFailure);
  });

  it('requires a bounded provider key, credential reference, and timeout', () => {
    expect(() =>
      validateProviderActivation({
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'Invalid Provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
      }),
    ).toThrow('Notification delivery failed');
    expect(() =>
      validateProviderActivation({
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
        credentialReference: 'literal-secret-value',
      }),
    ).toThrow('Notification delivery failed');
    expect(() =>
      validateProviderActivation({
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
        timeoutMs: 60_000,
      }),
    ).toThrow('Notification delivery failed');
  });

  it('rejects conflicting disabled configuration', () => {
    expect(() =>
      validateProviderActivation({
        enabled: false,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
      }),
    ).toThrow('Notification delivery failed');
  });

  it('exposes only metadata-safe configuration state', () => {
    const config = validateProviderActivation({
      enabled: true,
      channel: 'EMAIL',
      providerKey: 'test-email-provider',
      credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
      timeoutMs: 2_000,
    });
    const view = providerSafeConfigView(config);
    expect(view).toEqual({
      enabled: true,
      channel: 'EMAIL',
      providerKey: 'test-email-provider',
      timeoutMs: 2_000,
    });
    expect(view).not.toHaveProperty('credentialReference');
    expect(JSON.stringify(view)).not.toContain('TEST_EMAIL_PROVIDER_TOKEN');
  });

  it('binds only the explicitly configured provider and channel', () => {
    const registry = new ContractNotificationProviderRegistry(
      {
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
      },
      adapter,
    );
    expect(registry.forChannel('EMAIL')).toBe(adapter);
    expect(registry.health('EMAIL')).toEqual({
      state: 'READY',
      channel: 'EMAIL',
      providerKey: 'test-email-provider',
    });
    expect(() => registry.forChannel('SMS')).toThrow('Notification delivery failed');
  });

  it('does not silently substitute an adapter with a mismatched provider key or channel', () => {
    const wrongAdapter: ActivatedNotificationProviderAdapter = {
      providerKey: 'wrong-provider',
      channel: 'EMAIL',
      deliver: jest.fn().mockResolvedValue({ acknowledgement: 'ACCEPTED' }),
    };
    const registry = new ContractNotificationProviderRegistry(
      {
        enabled: true,
        channel: 'EMAIL',
        providerKey: 'test-email-provider',
        credentialReference: 'TEST_EMAIL_PROVIDER_TOKEN',
      },
      wrongAdapter,
    );
    expect(() => registry.forChannel('EMAIL')).toThrow('Notification delivery failed');
    expect(registry.health('EMAIL')).toMatchObject({
      state: 'UNAVAILABLE',
      code: 'PROVIDER_CONFIGURATION_INVALID',
    });
  });

  it('keeps failure output coded and excludes arbitrary secret/provider payloads', () => {
    const failure = new NotificationProviderContractFailure(
      'PROVIDER_TIMEOUT',
      'test-email-provider',
      'TRANSIENT',
    );
    expect(failure).toMatchObject({
      code: 'PROVIDER_TIMEOUT',
      providerKey: 'test-email-provider',
      classification: 'TRANSIENT',
      message: 'Notification delivery failed',
    });
    expect(JSON.stringify(failure)).not.toContain('recipient@example.invalid');
    expect(JSON.stringify(failure)).not.toContain('message body');
  });
});
