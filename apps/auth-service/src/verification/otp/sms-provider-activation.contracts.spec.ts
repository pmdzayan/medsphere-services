import {
  type ActivatedSmsProviderAdapter,
  ContractSmsProviderRegistry,
  SmsProviderContractFailure,
  parseSmsProviderActivationEnvironment,
  smsProviderSafeConfigView,
  validateSmsProviderActivation,
} from './sms-provider-activation.contracts';

const adapter: ActivatedSmsProviderAdapter = {
  providerKey: 'test-sms-provider',
  deliver: jest.fn().mockResolvedValue({
    acknowledgement: 'ACCEPTED',
    providerReference: 'volatile-provider-reference',
  }),
};

describe('ADR-023 SMS provider activation contract', () => {
  it('is disabled by default with no vendor activated', () => {
    expect(parseSmsProviderActivationEnvironment({})).toEqual({
      enabled: false,
      timeoutMs: 5_000,
    });
    const registry = new ContractSmsProviderRegistry({ enabled: false });
    expect(registry.health()).toEqual({ state: 'DISABLED' });
    expect(() => registry.provider()).toThrow('Notification delivery failed');
  });

  it('parses and validates explicit configuration without resolving secret values', () => {
    expect(
      parseSmsProviderActivationEnvironment({
        OTP_SMS_PROVIDER_ENABLED: 'true',
        OTP_SMS_PROVIDER_KEY: 'test-sms-provider',
        OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMS_PROVIDER_TOKEN',
        OTP_SMS_PROVIDER_TIMEOUT_MS: '2000',
      }),
    ).toEqual({
      enabled: true,
      providerKey: 'test-sms-provider',
      credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
      timeoutMs: 2_000,
    });
    expect(() =>
      parseSmsProviderActivationEnvironment({ OTP_SMS_PROVIDER_ENABLED: 'yes' }),
    ).toThrow('Notification delivery failed');
    expect(() =>
      parseSmsProviderActivationEnvironment({ OTP_SMS_PROVIDER_TIMEOUT_MS: '2s' }),
    ).toThrow('Notification delivery failed');
  });

  it('requires a bounded provider key, credential reference, and timeout', () => {
    expect(() =>
      validateSmsProviderActivation({
        enabled: true,
        providerKey: 'Invalid Provider',
        credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
      }),
    ).toThrow('Notification delivery failed');
    expect(() =>
      validateSmsProviderActivation({
        enabled: true,
        providerKey: 'test-sms-provider',
        credentialReference: 'lowercase-not-allowed',
      }),
    ).toThrow('Notification delivery failed');
    expect(() =>
      validateSmsProviderActivation({
        enabled: true,
        providerKey: 'test-sms-provider',
        credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
        timeoutMs: 50,
      }),
    ).toThrow('Notification delivery failed');
  });

  it('rejects disabled configuration that still supplies provider/credential fields', () => {
    expect(() =>
      validateSmsProviderActivation({ enabled: false, providerKey: 'test-sms-provider' }),
    ).toThrow('Notification delivery failed');
  });

  it('never activates without a matching adapter, even when enabled', () => {
    const registry = new ContractSmsProviderRegistry({
      enabled: true,
      providerKey: 'test-sms-provider',
      credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
    });
    expect(() => registry.provider()).toThrow(SmsProviderContractFailure);
    expect(registry.health()).toEqual({
      state: 'UNAVAILABLE',
      providerKey: 'test-sms-provider',
      code: 'PROVIDER_CONFIGURATION_INVALID',
    });
  });

  it('returns the matching adapter once enabled and correctly wired', () => {
    const registry = new ContractSmsProviderRegistry(
      {
        enabled: true,
        providerKey: 'test-sms-provider',
        credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
      },
      adapter,
    );
    expect(registry.provider()).toBe(adapter);
    expect(registry.health()).toEqual({ state: 'READY', providerKey: 'test-sms-provider' });
  });

  it('rejects a mismatched adapter provider key even when enabled', () => {
    const registry = new ContractSmsProviderRegistry(
      {
        enabled: true,
        providerKey: 'different-provider',
        credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
      },
      adapter,
    );
    expect(() => registry.provider()).toThrow(SmsProviderContractFailure);
  });

  it('never exposes the credential reference through the safe config view', () => {
    const config = validateSmsProviderActivation({
      enabled: true,
      providerKey: 'test-sms-provider',
      credentialReference: 'TEST_SMS_PROVIDER_TOKEN',
    });
    const safeView = smsProviderSafeConfigView(config);
    expect(safeView).toEqual({ enabled: true, providerKey: 'test-sms-provider', timeoutMs: 5_000 });
    expect(Object.keys(safeView)).not.toContain('credentialReference');
  });
});
