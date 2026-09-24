import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@medsphere/database';
import { PrismaService } from '../prisma/prisma.service';
import { CONSENT_CATEGORY_VERSION, ConsentCategory } from './consent-category';

type ConsentDatabase = Pick<Prisma.TransactionClient, 'consentRecord'>;

@Injectable()
export class ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    userId: string,
    category: ConsentCategory,
    status: 'GRANTED' | 'WITHDRAWN',
    source: string,
  ) {
    return this.appendWith(this.prisma.client, userId, category, status, source);
  }

  async appendWith(
    database: ConsentDatabase,
    userId: string,
    category: ConsentCategory,
    status: 'GRANTED' | 'WITHDRAWN',
    source: string,
  ) {
    return database.consentRecord.create({
      data: {
        id: randomUUID(),
        userId,
        category,
        status,
        version: CONSENT_CATEGORY_VERSION[category],
        source,
      },
    });
  }

  async findLatestPerCategory(userId: string) {
    const records = await this.prisma.client.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const latestByCategory = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      if (!latestByCategory.has(record.category)) {
        latestByCategory.set(record.category, record);
      }
    }
    return latestByCategory;
  }
}
