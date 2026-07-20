import { randomBytes } from 'node:crypto';
import { ExecutionContext } from '@nestjs/common';
import { accountTracker, createRateLimitKeyGenerator } from './auth-rate-limit.module';

describe('authentication rate-limit key generation', () => {
  const context = {
    getClass: () => ({ name: 'AuthController' }),
    getHandler: () => ({ name: 'login' }),
  } as unknown as ExecutionContext;

  it('creates a stable keyed digest without exposing the account locator', () => {
    const generator = createRateLimitKeyGenerator(randomBytes(32));
    const tracker = 'account:central-pharmacy:user@example.com';
    const first = generator(context, tracker, 'account');
    const second = generator(context, tracker, 'account');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain('user@example.com');
  });

  it('separates keys by tracker and throttler name', () => {
    const generator = createRateLimitKeyGenerator(randomBytes(32));
    const tracker = 'account:central-pharmacy:user@example.com';

    expect(generator(context, tracker, 'account')).not.toBe(generator(context, tracker, 'ip'));
    expect(generator(context, tracker, 'account')).not.toBe(
      generator(context, 'account:central-pharmacy:other@example.com', 'account'),
    );
  });

  it('canonicalizes account locators before guards run the account throttle', () => {
    expect(
      accountTracker({
        ip: '127.0.0.1',
        body: {
          tenantSlug: '  Central-Pharmacy ',
          email: ' USER@Example.COM  ',
        },
      }),
    ).toBe('account:central-pharmacy:user@example.com');
  });
});
