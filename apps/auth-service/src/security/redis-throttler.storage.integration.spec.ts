import { randomUUID } from 'node:crypto';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const describeWithRedis = process.env.REDIS_CLUSTER_URL ? describe : describe.skip;

describeWithRedis('RedisThrottlerStorage integration', () => {
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
    await expect(storage.increment(key, 60_000)).resolves.toMatchObject({ totalHits: 1 });
    await expect(storage.increment(key, 60_000)).resolves.toMatchObject({ totalHits: 2 });
  });
});
