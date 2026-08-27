import { Msg91SmsProviderAdapter, type Msg91SmsProviderConfig } from './msg91-sms-provider.adapter';
import { SmsProviderContractFailure } from './sms-provider-activation.contracts';

const CONFIG = {
  authKey: 'test-auth-key-never-logged',
  flowId: 'flow-123',
  senderId: 'MSGTST',
  timeoutMs: 5_000,
};
const INPUT = {
  to: '+919876543210',
  body: 'Your MedSphere verification code is 123456. It expires in 10 minutes.',
  otpCode: '123456',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createAdapter(fetchMock: jest.Mock, overrides: Partial<Msg91SmsProviderConfig> = {}) {
  return new Msg91SmsProviderAdapter(
    { ...CONFIG, ...overrides },
    fetchMock as unknown as typeof fetch,
  );
}

async function expectFailure(
  adapter: Msg91SmsProviderAdapter,
  input: typeof INPUT,
  expected: { code: string; classification: 'TRANSIENT' | 'TERMINAL' },
) {
  await expect(adapter.deliver(input)).rejects.toMatchObject(expected);
}

describe('Msg91SmsProviderAdapter', () => {
  it('uses only the documented HTTPS Flow endpoint and sends MedSphere OTP as a Flow variable', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { type: 'success', message: 'request-id-123' }));
    const adapter = createAdapter(fetchMock);

    await expect(adapter.deliver(INPUT)).resolves.toEqual({
      acknowledgement: 'ACCEPTED',
      providerReference: 'request-id-123',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.msg91.com/api/v5/flow/');
    expect(url).toMatch(/^https:\/\//);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    expect(init.headers.authkey).toBe(CONFIG.authKey);
    expect(JSON.parse(init.body)).toEqual({
      flow_id: CONFIG.flowId,
      sender: CONFIG.senderId,
      recipients: [{ mobiles: '919876543210', OTP: '123456' }],
    });
  });

  it('uses the explicitly configured OTP Flow variable name', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { type: 'success', message: 'request-id-456' }));
    const adapter = createAdapter(fetchMock, { otpVariableName: 'LOGIN_OTP' });

    await adapter.deliver({ ...INPUT, otpCode: '654321' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).recipients[0]).toEqual({
      mobiles: '919876543210',
      LOGIN_OTP: '654321',
    });
  });

  describe('configuration validation', () => {
    const invalidConfigurations: Array<[Partial<Msg91SmsProviderConfig>, string]> = [
      [{ authKey: '' }, 'empty auth key'],
      [{ authKey: '   ' }, 'whitespace auth key'],
      [{ flowId: '' }, 'empty Flow ID'],
      [{ flowId: '   ' }, 'whitespace Flow ID'],
      [{ senderId: '' }, 'empty sender ID'],
      [{ senderId: '   ' }, 'whitespace sender ID'],
      [{ otpVariableName: '' }, 'empty Flow variable'],
      [{ otpVariableName: 'OTP-VAR' }, 'invalid Flow variable'],
      [{ otpVariableName: '9OTP' }, 'invalid leading digit in Flow variable'],
      [{ timeoutMs: 249 }, 'timeout below MedSphere minimum'],
      [{ timeoutMs: 10_001 }, 'timeout above MedSphere maximum'],
      [{ timeoutMs: 1_000.5 }, 'non-integer timeout'],
    ];

    it.each(invalidConfigurations)('rejects %s (%s) before any request', (overrides, _label) => {
      expect(() => createAdapter(jest.fn(), overrides)).toThrow(SmsProviderContractFailure);
    });
  });

  describe('destination guard', () => {
    it.each(['', '   ', 'abc', '+91ABC7654321', '+0123456789', '+1234', '+1234567890123456'])(
      'rejects malformed destination %j without contacting MSG91',
      async (to: string) => {
        const fetchMock = jest.fn();
        const adapter = createAdapter(fetchMock);
        await expectFailure(
          adapter,
          { ...INPUT, to },
          {
            code: 'PROVIDER_DESTINATION_INVALID',
            classification: 'TERMINAL',
          },
        );
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('OTP guard', () => {
    it.each(['', '12345', '1234567', 'abcdef', '12 456', '12345a'])(
      'rejects malformed OTP %j without contacting MSG91',
      async (otpCode: string) => {
        const fetchMock = jest.fn();
        const adapter = createAdapter(fetchMock);
        await expectFailure(
          adapter,
          { ...INPUT, otpCode },
          {
            code: 'PROVIDER_REQUEST_INVALID_OTP',
            classification: 'TERMINAL',
          },
        );
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  it('classifies a network error as transient', async () => {
    const adapter = createAdapter(jest.fn().mockRejectedValue(new TypeError('network failed')));
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_NETWORK_FAILURE',
      classification: 'TRANSIENT',
    });
  });

  it('classifies a timeout abort as transient', async () => {
    const adapter = createAdapter(
      jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')),
    );
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_NETWORK_FAILURE',
      classification: 'TRANSIENT',
    });
  });

  it.each([400, 422])(
    'classifies HTTP %i as terminal request rejection',
    async (status: number) => {
      const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(status, {})));
      await expectFailure(adapter, INPUT, {
        code: 'PROVIDER_REQUEST_REJECTED',
        classification: 'TERMINAL',
      });
    },
  );

  it.each([401, 403])(
    'classifies HTTP %i as terminal authentication rejection',
    async (status: number) => {
      const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(status, {})));
      await expectFailure(adapter, INPUT, {
        code: 'PROVIDER_AUTH_REJECTED',
        classification: 'TERMINAL',
      });
    },
  );

  it('classifies HTTP 429 as transient', async () => {
    const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(429, {})));
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_RATE_LIMITED',
      classification: 'TRANSIENT',
    });
  });

  it.each([500, 503, 599])(
    'classifies HTTP %i as transient provider failure',
    async (status: number) => {
      const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(status, {})));
      await expectFailure(adapter, INPUT, {
        code: 'PROVIDER_SERVER_ERROR',
        classification: 'TRANSIENT',
      });
    },
  );

  it('rejects an unexpected redirect instead of following it', async () => {
    const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(302, {})));
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_REDIRECT_REJECTED',
      classification: 'TERMINAL',
    });
  });

  it('rejects malformed 2xx JSON', async () => {
    const adapter = createAdapter(
      jest.fn().mockResolvedValue(new Response('not-json', { status: 200 })),
    );
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_RESPONSE_MALFORMED',
      classification: 'TERMINAL',
    });
  });

  it.each([
    { type: 'success' },
    { type: 'success', message: '' },
    { type: 'success', message: '   ' },
    { type: 'success', message: 12345 },
    { type: 'success', message: { id: 'request-id' } },
  ])(
    'rejects success-shaped responses without a safe provider reference: %p',
    async (body: unknown) => {
      const adapter = createAdapter(jest.fn().mockResolvedValue(jsonResponse(200, body)));
      await expectFailure(adapter, INPUT, {
        code: 'PROVIDER_RESPONSE_MALFORMED',
        classification: 'TERMINAL',
      });
    },
  );

  it('classifies a functional MSG91 rejection as terminal without exposing its message', async () => {
    const providerMessage = `invalid request for ${INPUT.to} code ${INPUT.otpCode}`;
    const adapter = createAdapter(
      jest.fn().mockResolvedValue(jsonResponse(200, { type: 'error', message: providerMessage })),
    );

    let caught: unknown;
    try {
      await adapter.deliver(INPUT);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: 'PROVIDER_REJECTED_TERMINAL',
      classification: 'TERMINAL',
    });
    expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught))).not.toContain(
      providerMessage,
    );
  });

  it('rejects a provider reference that echoes sensitive request data', async () => {
    const adapter = createAdapter(
      jest.fn().mockResolvedValue(jsonResponse(200, { type: 'success', message: INPUT.otpCode })),
    );
    await expectFailure(adapter, INPUT, {
      code: 'PROVIDER_RESPONSE_MALFORMED',
      classification: 'TERMINAL',
    });
  });

  describe('privacy boundary', () => {
    it('does not leak auth key, phone, OTP, or composed body through errors, logs, results, or URL', async () => {
      const consoleSpies = [
        jest.spyOn(console, 'log').mockImplementation(() => undefined),
        jest.spyOn(console, 'info').mockImplementation(() => undefined),
        jest.spyOn(console, 'warn').mockImplementation(() => undefined),
        jest.spyOn(console, 'error').mockImplementation(() => undefined),
      ];
      try {
        const fetchMock = jest
          .fn()
          .mockResolvedValue(jsonResponse(200, { type: 'success', message: 'opaque-request-789' }));
        const adapter = createAdapter(fetchMock);
        const result = await adapter.deliver(INPUT);
        const [url] = fetchMock.mock.calls[0];
        const serializedResult = JSON.stringify(result);

        for (const sensitive of [CONFIG.authKey, INPUT.to, INPUT.otpCode, INPUT.body]) {
          expect(url).not.toContain(sensitive);
          expect(serializedResult).not.toContain(sensitive);
        }
        for (const spy of consoleSpies) {
          expect(spy).not.toHaveBeenCalled();
        }
      } finally {
        for (const spy of consoleSpies) {
          spy.mockRestore();
        }
      }
    });

    it('does not leak sensitive values in a thrown failure', async () => {
      const adapter = createAdapter(
        jest.fn().mockResolvedValue(
          jsonResponse(401, {
            message: `${CONFIG.authKey} ${INPUT.to} ${INPUT.otpCode} ${INPUT.body}`,
          }),
        ),
      );

      let caught: unknown;
      try {
        await adapter.deliver(INPUT);
      } catch (error) {
        caught = error;
      }
      const serialized = JSON.stringify(caught, Object.getOwnPropertyNames(caught));
      for (const sensitive of [CONFIG.authKey, INPUT.to, INPUT.otpCode, INPUT.body]) {
        expect(serialized).not.toContain(sensitive);
      }
    });
  });
});
