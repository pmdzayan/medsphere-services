import type { ServiceLogger } from '@medsphere/logger';
import {
  createRequestObservabilityMiddleware,
  resolveRequestId,
  safeRouteTemplate,
} from './request-observability';

function createLoggerFixture() {
  return {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } satisfies ServiceLogger;
}

describe('request observability', () => {
  it('preserves a valid inbound request ID', () => {
    expect(resolveRequestId('request-123', () => 'generated-456')).toBe('request-123');
  });

  it('replaces an invalid inbound request ID', () => {
    expect(resolveRequestId('invalid request id', () => 'generated-456')).toBe('generated-456');
  });

  it('rejects an invalid generated request ID', () => {
    expect(() => resolveRequestId(undefined, () => 'invalid generated id')).toThrow(
      'Generated request ID must satisfy the MedSphere request ID contract',
    );
  });

  it('only exposes the bounded route template', () => {
    expect(
      safeRouteTemplate({
        headers: {},
        route: {
          path: '/inventory/providers/:providerId',
        },
      }),
    ).toBe('/inventory/providers/:providerId');

    expect(
      safeRouteTemplate({
        headers: {},
      }),
    ).toBeUndefined();
  });

  it('sets and propagates the request ID and emits safe completion metadata', () => {
    const logger = createLoggerFixture();

    let finishListener: (() => void) | undefined;
    const headers: Record<string, string | string[] | undefined> = {};

    const request = {
      headers,
      method: 'post',
      route: {
        path: '/reservations/:reservationId',
      },
    };

    const response = {
      statusCode: 201,
      setHeader: jest.fn(),
      once: jest.fn((event: 'finish', listener: () => void) => {
        expect(event).toBe('finish');
        finishListener = listener;
      }),
    };

    const next = jest.fn();

    const times = [1_000_000_000n, 1_025_500_000n];
    const clock = jest.fn(() => {
      const value = times.shift();

      if (value === undefined) {
        throw new Error('Clock fixture exhausted');
      }

      return value;
    });

    const middleware = createRequestObservabilityMiddleware(
      logger,
      () => 'generated-request-123',
      clock,
    );

    middleware(request, response, next);

    expect(headers['x-request-id']).toBe('generated-request-123');
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'generated-request-123');
    expect(next).toHaveBeenCalledTimes(1);

    expect(finishListener).toBeDefined();
    finishListener?.();

    expect(logger.info).toHaveBeenCalledWith('HTTP request completed', {
      event: 'http_request_completed',
      requestId: 'generated-request-123',
      method: 'POST',
      route: '/reservations/:reservationId',
      statusCode: 201,
      durationMs: 25.5,
    });
  });

  it('does not log raw URLs, query strings, headers, cookies or request bodies', () => {
    const logger = createLoggerFixture();

    let finishListener: (() => void) | undefined;

    const request = {
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'session=secret-cookie',
      },
      method: 'GET',
      route: {
        path: '/search',
      },
      originalUrl: '/search?medicine=private-value',
      body: {
        password: 'private-password',
      },
    };

    const response = {
      statusCode: 200,
      setHeader: jest.fn(),
      once: jest.fn((_event: 'finish', listener: () => void) => {
        finishListener = listener;
      }),
    };

    const times = [0n, 1_000_000n];

    const middleware = createRequestObservabilityMiddleware(
      logger,
      () => 'generated-request-456',
      () => times.shift() ?? 1_000_000n,
    );

    middleware(request, response, jest.fn());
    finishListener?.();

    const serialized = JSON.stringify(logger.info.mock.calls);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('secret-cookie');
    expect(serialized).not.toContain('private-value');
    expect(serialized).not.toContain('private-password');
  });
});
