import { createHmac } from 'node:crypto';
import { ExecutionContext, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthConfigService } from '../auth/auth-config.service';
import { normalizeAuthenticationLocator } from '../auth/auth-normalization';
import { AuthModule } from '../auth/auth.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

interface ThrottleRequest {
  readonly ip?: string;
  readonly url?: string;
  readonly body?: Record<string, unknown>;
  readonly user?: { readonly userId?: string };
}

function requestFrom(context: ExecutionContext): ThrottleRequest {
  return context.switchToHttp().getRequest<ThrottleRequest>();
}

function skipUnlessHandler(handlerName: string) {
  return (context: ExecutionContext): boolean => context.getHandler().name !== handlerName;
}

function skipHealth(context: ExecutionContext): boolean {
  return requestFrom(context).url?.startsWith('/health/') ?? false;
}

function ipTracker(request: Record<string, unknown>): string {
  return typeof request.ip === 'string' ? request.ip : 'unknown-network-source';
}

export function accountTracker(request: Record<string, unknown>): string {
  const typedRequest = request as ThrottleRequest;
  if (typedRequest.user?.userId) {
    return `user:${typedRequest.user.userId}`;
  }

  const tenantSlug = typedRequest.body?.tenantSlug;
  const email = typedRequest.body?.email;
  if (typeof tenantSlug === 'string' && typeof email === 'string') {
    return `account:${normalizeAuthenticationLocator(tenantSlug)}:${normalizeAuthenticationLocator(
      email,
    )}`;
  }

  const refreshCredential = typedRequest.body?.refreshToken;
  if (typeof refreshCredential === 'string') {
    const sessionId = refreshCredential.split('.')[1];
    if (sessionId) {
      return `session:${sessionId}`;
    }
  }

  return `network:${ipTracker(request)}`;
}

export function createRateLimitKeyGenerator(secret: Buffer) {
  const rateLimitKey = createHmac('sha256', secret)
    .update('medsphere:authentication-rate-limit:v1', 'utf8')
    .digest();

  return (context: ExecutionContext, tracker: string, throttlerName: string): string =>
    createHmac('sha256', rateLimitKey)
      .update(context.getClass().name, 'utf8')
      .update('\0', 'utf8')
      .update(context.getHandler().name, 'utf8')
      .update('\0', 'utf8')
      .update(throttlerName, 'utf8')
      .update('\0', 'utf8')
      .update(tracker, 'utf8')
      .digest('hex');
}

@Module({
  providers: [
    {
      provide: RedisThrottlerStorage,
      useFactory: () => new RedisThrottlerStorage(),
    },
  ],
  exports: [RedisThrottlerStorage],
})
class AuthRateLimitStorageModule {}

@Module({
  imports: [
    AuthRateLimitStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [AuthRateLimitStorageModule, AuthModule],
      inject: [RedisThrottlerStorage, AuthConfigService],
      useFactory: (storage: RedisThrottlerStorage, authConfig: AuthConfigService) => ({
        storage,
        generateKey: createRateLimitKeyGenerator(authConfig.value.refreshTokenPepper),
        throttlers: [
          {
            name: 'ip',
            ttl: 60_000,
            limit: 120,
            skipIf: skipHealth,
            getTracker: ipTracker,
          },
          {
            name: 'account',
            ttl: 60_000,
            limit: 120,
            skipIf: skipHealth,
            getTracker: accountTracker,
          },
          {
            name: 'otp-request',
            ttl: 60_000,
            limit: 1,
            skipIf: (context) =>
              skipHealth(context) || skipUnlessHandler('requestPhoneOtp')(context),
            getTracker: accountTracker,
          },
          {
            name: 'otp-verify',
            ttl: 60_000,
            limit: 10,
            skipIf: (context) =>
              skipHealth(context) || skipUnlessHandler('verifyPhoneOtp')(context),
            getTracker: accountTracker,
          },
        ],
        errorMessage: 'Too many requests',
      }),
    }),
  ],
  exports: [AuthRateLimitStorageModule],
})
export class AuthRateLimitModule {}
