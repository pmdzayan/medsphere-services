import { getPrismaClient } from '@medsphere/database';
import { OutboxStatus } from './types';

export class OutboxRepository {
  private readonly prisma = getPrismaClient();

  async create(data: {
    tenantId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    correlationId?: string;
  }) {
    return this.prisma.outboxEvent.create({
      data: {
        tenantId: data.tenantId,
        eventType: data.eventType,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload,
        correlationId: data.correlationId,
      },
    });
  }

  async findPending(batchSize = 50) {
    return this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxStatus.PENDING,
        scheduledFor: { lte: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
  }

  async markProcessing(id: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.PROCESSING },
    });
  }

  async markPublished(id: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  async markFailed(id: string, error: string) {
    return this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.FAILED,
        lastError: error,
        retryCount: { increment: 1 },
      },
    });
  }
}
