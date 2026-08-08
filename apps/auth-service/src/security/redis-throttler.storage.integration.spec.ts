import { randomUUID } from 'node:crypto';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { isInfrastructureTestEnabled, requireEnv } from '../auth/testing/infrastructure-test-gate';

const isRedisTestEnabled =
  isInfrastructureTestEnabled() && Boolean(process.env.REDIS_CLUSTER_URL?.trim());
const describeRedisInfra = isRedisTestEnabled ? describe : describe.skip;

if (isRedisTestEnabled) {
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

  it('blocks after reaching thresold within window', async () => {
    const key = `integration:${randomUUID()}`;
    for (let i = 0; i < 2; i++) {
      await storage.increment(key, 60_000, 2, 60_000, 'integration');
    }
    const blocked = await storage.increment(key, 60_000, 2, 60_000, 'integration');
    expect(blocked.isBlocked).toBe(true);
  });
});
