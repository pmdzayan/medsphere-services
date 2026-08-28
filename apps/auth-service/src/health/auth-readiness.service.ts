import { Injectable } from '@nestjs/common';
import { appMetrics, HealthReadinessCheck } from '@medsphere/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisThrottlerStorage } from '../security/redis-throttler.storage';

@Injectable()
export class AuthReadinessService implements HealthReadinessCheck {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisThrottlerStorage,
  ) {}

  async check(): Promise<void> {
    await this.timedCheck('postgresql', () => this.prisma.client.$queryRaw`SELECT 1`);
    await this.timedCheck('redis', () => this.redis.ping());
  }

  private async timedCheck(
    dependency: 'postgresql' | 'redis',
    run: () => Promise<unknown>,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();
    try {
      await run();
      appMetrics.dependencyCheckTotal.increment({ dependency, outcome: 'success' });
    } catch (error) {
      appMetrics.dependencyCheckTotal.increment({ dependency, outcome: 'failure' });
      throw error;
    } finally {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      appMetrics.dependencyCheckDurationMs.observe(elapsedMs, { dependency });
    }
  }
}
