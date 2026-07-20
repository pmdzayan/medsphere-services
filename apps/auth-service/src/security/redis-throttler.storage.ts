import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

const INCREMENT_SCRIPT = `
local total = redis.call('INCR', KEYS[1])
if total == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local remaining = redis.call('PTTL', KEYS[1])
return {total, remaining}
`;

function requireRedisUrl(): string {
  const raw = process.env.REDIS_CLUSTER_URL;
  if (!raw) {
    throw new Error('REDIS_CLUSTER_URL is required for distributed authentication rate limits');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('REDIS_CLUSTER_URL must be an absolute Redis URL');
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_CLUSTER_URL must use redis:// or rediss://');
  }
  return raw;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(redisUrl: string = requireRedisUrl()) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.redis.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  async increment(key: string, ttl: number): Promise<{ totalHits: number; timeToExpire: number }> {
    const result: unknown = await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      `medsphere:auth-throttle:${key}`,
      ttl.toString(),
    );

    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      typeof result[0] !== 'number' ||
      typeof result[1] !== 'number'
    ) {
      throw new Error('Authentication rate-limit storage returned an invalid response');
    }

    return {
      totalHits: result[0],
      timeToExpire: Math.max(1, Math.ceil(result[1] / 1000)),
    };
  }
}
