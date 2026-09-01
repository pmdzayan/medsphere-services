import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CONSENT_CATEGORY_VERSION, ConsentCategory } from './consent-category';

@Injectable()
export class ConsentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Always INSERTs a new row -- a ConsentRecord is append-only (also
   * enforced at the database level by a trigger). A withdrawal is
   * recorded the same way, as a new row with status WITHDRAWN; the
   * prior GRANTED row is never touched.
   */
  async append(
    userId: string,
    category: ConsentCategory,
    status: 'GRANTED' | 'WITHDRAWN',
    source: string,
  ) {
    return this.prisma.client.consentRecord.create({
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

  /** The single latest row per category for this user -- the current effective consent state. */
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
