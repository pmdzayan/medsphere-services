import { randomUUID } from 'node:crypto';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';

const describeRedisInfra = isInfrastructureTestEnabled() ? describe : describe.skip;

if (isInfrastructureTestEnabled()) {
  requireEnv('REDIS_CLUSTER_URL');
}

describeRedisInfra('RedisThrottlerStorage integration', () => {
  let storage: RedisThrottlerStorage;

  beforeAll(async () => {
    storage = new RedisThrottlerStorage(process.env.REDIS_CLUSTER_URL);
    await storage.onModuleInit();
  });

  afterAll(async () => {
    await storage.onModuleDestroy();
  });

  it('atomically shares a fixed-window counter', async () => {
    const key = `integration:${randomUUID()}`;
    await expect(storage.increment(key, 60_000, 10, 60_000, 'integration')).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await expect(storage.increment(key, 60_000, 10, 60_000, 'integration')).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: false,
    });
  });

  it('blocks atomically and does not increase a blocked counter', async () => {
    const key = `integration:${randomUUID()}`;
    await expect(storage.increment(key, 60_000, 1, 60_000, 'integration')).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
    await expect(storage.increment(key, 60_000, 1, 60_000, 'integration')).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: true,
    });
    await expect(storage.increment(key, 60_000, 1, 60_000, 'integration')).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: true,
    });
  });
});
