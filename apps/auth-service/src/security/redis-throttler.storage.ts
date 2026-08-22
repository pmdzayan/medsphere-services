import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

interface RedisThrottleRecord {
  readonly totalHits: number;
  readonly timeToExpire: number;
  readonly isBlocked: boolean;
  readonly timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
local redisTime = redis.call('TIME')
local now = (tonumber(redisTime[1]) * 1000) + math.floor(tonumber(redisTime[2]) / 1000)
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local total = tonumber(redis.call('HGET', KEYS[1], 'total')) or 0
local windowExpiresAt = tonumber(redis.call('HGET', KEYS[1], 'windowExpiresAt')) or 0
local blockedUntil = tonumber(redis.call('HGET', KEYS[1], 'blockedUntil')) or 0

if blockedUntil > now then
  local timeToExpire = math.max(0, math.ceil((windowExpiresAt - now) / 1000))
  local timeToBlockExpire = math.max(1, math.ceil((blockedUntil - now) / 1000))
  return {total, timeToExpire, 1, timeToBlockExpire}
end

if blockedUntil > 0 or windowExpiresAt <= now then
  total = 0
  windowExpiresAt = now + ttl
  blockedUntil = 0
end

total = total + 1
if total > limit then
  blockedUntil = now + blockDuration
end

redis.call('HSET', KEYS[1], 'total', total, 'windowExpiresAt', windowExpiresAt, 'blockedUntil', blockedUntil)
local expiresAt = math.max(windowExpiresAt, blockedUntil)
redis.call('PEXPIRE', KEYS[1], math.max(1, expiresAt - now))

local timeToExpire = math.max(1, math.ceil((windowExpiresAt - now) / 1000))
local isBlocked = blockedUntil > now and 1 or 0
local timeToBlockExpire = isBlocked == 1 and math.max(1, math.ceil((blockedUntil - now) / 1000)) or 0
return {total, timeToExpire, isBlocked, timeToBlockExpire}
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
    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RedisThrottleRecord> {
    if (
      !Number.isSafeInteger(ttl) ||
      ttl <= 0 ||
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      !Number.isSafeInteger(blockDuration) ||
      blockDuration <= 0 ||
      !throttlerName
    ) {
      throw new Error('Authentication rate-limit configuration is invalid');
    }

    const result: unknown = await this.redis.eval(
      INCREMENT_SCRIPT,
      1,
      `medsphere:auth-throttle:${key}`,
      ttl.toString(),
      limit.toString(),
      blockDuration.toString(),
    );

    if (
      !Array.isArray(result) ||
      result.length !== 4 ||
      typeof result[0] !== 'number' ||
      typeof result[1] !== 'number' ||
      typeof result[2] !== 'number' ||
      typeof result[3] !== 'number'
    ) {
      throw new Error('Authentication rate-limit storage returned an invalid response');
    }

    return {
      totalHits: result[0],
      timeToExpire: result[1],
      isBlocked: result[2] === 1,
      timeToBlockExpire: result[3],
    };
  }
}
