import { MSG91_PROVIDER_KEY } from './msg91-sms-provider.adapter';
import { createSmsProviderRegistry } from './sms-provider-registry.factory';

const VALID_ENV = {
  OTP_SMS_PROVIDER_ENABLED: 'true',
  OTP_SMS_PROVIDER_KEY: MSG91_PROVIDER_KEY,
  OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_MSG91_AUTH_KEY',
  OTP_SMS_PROVIDER_TIMEOUT_MS: '5000',
  TEST_MSG91_AUTH_KEY: 'factory-test-auth-key',
  MSG91_FLOW_ID: 'flow-factory-123',
  MSG91_SENDER_ID: 'MSGTST',
} as const;

function successResponse(): Response {
  return new Response(JSON.stringify({ type: 'success', message: 'factory-request-id' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createSmsProviderRegistry', () => {
  it('keeps SMS disabled by default', () => {
    const registry = createSmsProviderRegistry({});
    expect(registry.health()).toEqual({ state: 'DISABLED' });
    expect(() => registry.provider()).toThrow();
  });

  it('activates MSG91 only when explicitly configured', () => {
    const registry = createSmsProviderRegistry(VALID_ENV);
    expect(registry.health()).toEqual({ state: 'READY', providerKey: MSG91_PROVIDER_KEY });
    expect(registry.provider().providerKey).toBe(MSG91_PROVIDER_KEY);
  });

  it.each([
    ['auth key', 'TEST_MSG91_AUTH_KEY'],
    ['Flow ID', 'MSG91_FLOW_ID'],
    ['sender ID', 'MSG91_SENDER_ID'],
  ] as const)('fails bootstrap closed when %s is missing', (_label: string, missingKey: string) => {
    const environment: Record<string, string | undefined> = { ...VALID_ENV };
    delete environment[missingKey];
    expect(() => createSmsProviderRegistry(environment)).toThrow(
      /Missing required environment variable/,
    );
  });

  it('fails closed for an unsupported provider without any fallback adapter', () => {
    const registry = createSmsProviderRegistry({
      OTP_SMS_PROVIDER_ENABLED: 'true',
      OTP_SMS_PROVIDER_KEY: 'unsupported-vendor',
      OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMS_SECRET',
    });
    expect(registry.health()).toMatchObject({
      state: 'UNAVAILABLE',
      providerKey: 'unsupported-vendor',
    });
    expect(() => registry.provider()).toThrow();
  });

  it.each(['mock', 'test', 'fake'])(
    'never treats %s as a production fallback provider',
    (providerKey: string) => {
      const registry = createSmsProviderRegistry({
        OTP_SMS_PROVIDER_ENABLED: 'true',
        OTP_SMS_PROVIDER_KEY: providerKey,
        OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE: 'TEST_SMS_SECRET',
        TEST_SMS_SECRET: 'not-used',
      });
      expect(registry.health().state).toBe('UNAVAILABLE');
      expect(() => registry.provider()).toThrow();
    },
  );

  it('resolves the auth key through the configured credential reference', async () => {
    const fetchMock = jest.fn().mockResolvedValue(successResponse());
    const registry = createSmsProviderRegistry(
      {
        ...VALID_ENV,
        OTP_SMS_PROVIDER_CREDENTIAL_REFERENCE: 'ALTERNATE_MSG91_SECRET',
        TEST_MSG91_AUTH_KEY: undefined,
        ALTERNATE_MSG91_SECRET: 'indirect-auth-key',
      },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    await registry
      .provider()
      .deliver({ to: '+919876543210', body: 'private body', otpCode: '123456' });
    expect(fetchMock.mock.calls[0][1].headers.authkey).toBe('indirect-auth-key');
  });

  it('defaults the OTP Flow variable safely to OTP', async () => {
    const fetchMock = jest.fn().mockResolvedValue(successResponse());
    const registry = createSmsProviderRegistry(VALID_ENV, {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await registry
      .provider()
      .deliver({ to: '+919876543210', body: 'private body', otpCode: '123456' });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.recipients[0]).toEqual({ mobiles: '919876543210', OTP: '123456' });
  });

  it('uses an explicitly configured OTP Flow variable', async () => {
    const fetchMock = jest.fn().mockResolvedValue(successResponse());
    const registry = createSmsProviderRegistry(
      { ...VALID_ENV, MSG91_OTP_FLOW_VARIABLE_NAME: 'LOGIN_OTP' },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    await registry
      .provider()
      .deliver({ to: '+919876543210', body: 'private body', otpCode: '654321' });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.recipients[0]).toEqual({ mobiles: '919876543210', LOGIN_OTP: '654321' });
  });

  it('fails closed for an explicitly empty OTP Flow variable', () => {
    expect(() =>
      createSmsProviderRegistry({ ...VALID_ENV, MSG91_OTP_FLOW_VARIABLE_NAME: '' }),
    ).toThrow();
  });
});
