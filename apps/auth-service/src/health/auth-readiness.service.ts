import { Injectable } from '@nestjs/common';
import { HealthReadinessCheck } from '@medsphere/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisThrottlerStorage } from '../security/redis-throttler.storage';

@Injectable()
export class AuthReadinessService implements HealthReadinessCheck {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisThrottlerStorage,
  ) {}

  async check(): Promise<void> {
    await this.prisma.client.$queryRaw`SELECT 1`;
    await this.redis.ping();
  }
}
