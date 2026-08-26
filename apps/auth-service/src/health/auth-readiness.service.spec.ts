import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController, HealthReadinessCheck } from '@medsphere/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisThrottlerStorage } from '../security/redis-throttler.storage';
import { AuthReadinessService } from './auth-readiness.service';

describe('AuthReadinessService', () => {
  const queryRaw = jest.fn();
  const redisPing = jest.fn();

  const prisma = {
    client: {
      $queryRaw: queryRaw,
    },
  } as unknown as PrismaService;

  const redis = {
    ping: redisPing,
  } as unknown as RedisThrottlerStorage;

  let service: AuthReadinessService;

  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    redisPing.mockReset().mockResolvedValue(undefined);
    service = new AuthReadinessService(prisma, redis);
  });

  it('reports ready only after PostgreSQL and Redis both respond', async () => {
    await expect(service.check()).resolves.toBeUndefined();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(redisPing).toHaveBeenCalledTimes(1);
  });

  it('fails readiness when PostgreSQL is unavailable and does not probe Redis afterward', async () => {
    queryRaw.mockRejectedValueOnce(new Error('postgresql://secret-host/database'));

    await expect(service.check()).rejects.toThrow();

    expect(redisPing).not.toHaveBeenCalled();
  });

  it('fails readiness when Redis is unavailable', async () => {
    redisPing.mockRejectedValueOnce(new Error('redis://secret-host'));

    await expect(service.check()).rejects.toThrow();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('HealthController readiness boundary', () => {
  it('keeps liveness independent from dependency readiness', () => {
    const readiness: HealthReadinessCheck = {
      check: jest.fn().mockRejectedValue(new Error('dependency unavailable')),
    };
    const controller = new HealthController(readiness);

    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('returns the bounded ready response when dependencies are healthy', async () => {
    const readiness: HealthReadinessCheck = {
      check: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new HealthController(readiness);

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
  });

  it('fails closed without exposing dependency exception details', async () => {
    const readiness: HealthReadinessCheck = {
      check: jest
        .fn()
        .mockRejectedValue(new Error('postgresql://user:password@private-host/medsphere')),
    };
    const controller = new HealthController(readiness);

    try {
      await controller.ready();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);

      const unavailable = error as ServiceUnavailableException;
      expect(unavailable.getStatus()).toBe(503);

      const response = unavailable.getResponse();
      expect(response).toEqual({ status: 'unavailable' });

      expect(JSON.stringify(response)).not.toContain('password');
      expect(JSON.stringify(response)).not.toContain('private-host');
    }
  });
});
