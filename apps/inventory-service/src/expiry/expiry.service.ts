import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpiryStatus, BatchStatus } from '../common/enums';
import { EXPIRY_CONFIG } from './config/expiry.config';
import { ExpiryQueryDto } from './dto/expiry-query.dto';

export interface ExpiryDashboard {
  totalExpired: number;
  expiringToday: number;
  expiringWithin7Days: number;
  expiringWithin30Days: number;
  expiringWithin60Days: number;
  totalBatches: number;
}

export interface ExpiryBatchResult {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  expiryDate: string;
  currentQuantity: number;
  status: string;
  daysUntilExpiry: number;
}

export interface PaginatedExpiryResult {
  data: ExpiryBatchResult[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class ExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(providerId: string): Promise<ExpiryDashboard> {
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_7_DAYS);
    in7Days.setHours(23, 59, 59, 999);

    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_30_DAYS);
    in30Days.setHours(23, 59, 59, 999);

    const in60Days = new Date();
    in60Days.setDate(in60Days.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_60_DAYS);
    in60Days.setHours(23, 59, 59, 999);

    const batches = await this.prisma.client.batch.findMany({
      where: {
        providerId,
        deletedAt: null,
      },
      select: {
        expiryDate: true,
        status: true,
      },
    });

    let totalExpired = 0;
    let expiringToday = 0;
    let expiringWithin7Days = 0;
    let expiringWithin30Days = 0;
    let expiringWithin60Days = 0;

    for (const batch of batches) {
      // Skip exhausted batches from expiry dashboard
      if (batch.status === BatchStatus.EXHAUSTED) continue;

      if (batch.expiryDate < now || batch.status === BatchStatus.EXPIRED) {
        totalExpired++;
      } else if (batch.expiryDate <= todayEnd) {
        expiringToday++;
      }

      if (
        batch.expiryDate >= now &&
        batch.expiryDate <= in7Days &&
        batch.status !== BatchStatus.EXPIRED
      ) {
        expiringWithin7Days++;
      }
      if (
        batch.expiryDate >= now &&
        batch.expiryDate <= in30Days &&
        batch.status !== BatchStatus.EXPIRED
      ) {
        expiringWithin30Days++;
      }
      if (
        batch.expiryDate >= now &&
        batch.expiryDate <= in60Days &&
        batch.status !== BatchStatus.EXPIRED
      ) {
        expiringWithin60Days++;
      }
    }

    // Count non-exhausted batches for total
    const totalBatches = batches.filter((b) => b.status !== BatchStatus.EXHAUSTED).length;

    return {
      totalExpired,
      expiringToday,
      expiringWithin7Days,
      expiringWithin30Days,
      expiringWithin60Days,
      totalBatches,
    };
  }

  async getExpiredBatches(
    providerId: string,
    query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    const now = new Date();
    const limit = query.limit ?? EXPIRY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = {
      providerId,
      deletedAt: null,
      status: { not: BatchStatus.EXHAUSTED },
      expiryDate: { lt: now },
    };

    if (query.productId) where.productId = query.productId;

    const [batches, total] = await Promise.all([
      this.prisma.client.batch.findMany({
        where,
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.batch.count({ where }),
    ]);

    return {
      data: batches.map((batch) => this.toExpiryResult(batch, now)),
      total,
      limit,
      offset,
    };
  }

  async getExpiringSoonBatches(
    providerId: string,
    query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    const now = new Date();
    const daysThreshold = EXPIRY_CONFIG.EXPIRING_SOON_DAYS;
    const future = new Date();
    future.setDate(future.getDate() + daysThreshold);
    future.setHours(23, 59, 59, 999);

    const limit = query.limit ?? EXPIRY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = {
      providerId,
      deletedAt: null,
      status: BatchStatus.ACTIVE,
      expiryDate: { gte: now, lte: future },
    };

    if (query.productId) where.productId = query.productId;

    const [batches, total] = await Promise.all([
      this.prisma.client.batch.findMany({
        where,
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.batch.count({ where }),
    ]);

    return {
      data: batches.map((batch) => this.toExpiryResult(batch, now)),
      total,
      limit,
      offset,
    };
  }

  async getBatchExpirySummary(
    providerId: string,
    query: ExpiryQueryDto,
  ): Promise<PaginatedExpiryResult> {
    const now = new Date();
    const in60Days = new Date();
    in60Days.setDate(in60Days.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_60_DAYS);
    in60Days.setHours(23, 59, 59, 999);

    const limit = query.limit ?? EXPIRY_CONFIG.DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;

    const where: Record<string, unknown> = {
      providerId,
      deletedAt: null,
      status: { not: BatchStatus.EXHAUSTED },
    };

    if (query.productId) where.productId = query.productId;
    if (query.status) {
      switch (query.status) {
        case ExpiryStatus.EXPIRED:
          where.expiryDate = { lt: now };
          break;
        case ExpiryStatus.EXPIRING_WITHIN_30_DAYS: {
          const in30 = new Date();
          in30.setDate(in30.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_30_DAYS);
          in30.setHours(23, 59, 59, 999);
          where.expiryDate = { gte: now, lte: in30 };
          where.status = BatchStatus.ACTIVE;
          break;
        }
        case ExpiryStatus.EXPIRING_WITHIN_60_DAYS: {
          const in60 = new Date();
          in60.setDate(in60.getDate() + EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_60_DAYS);
          in60.setHours(23, 59, 59, 999);
          where.expiryDate = { gte: now, lte: in60 };
          where.status = BatchStatus.ACTIVE;
          break;
        }
        case ExpiryStatus.SAFE: {
          where.expiryDate = { gt: in60Days };
          where.status = BatchStatus.ACTIVE;
          break;
        }
      }
    }

    // Date range filtering
    if (query.startDate || query.endDate) {
      const expiryDateFilter: Record<string, Date> = {};
      if (query.startDate) expiryDateFilter.gte = new Date(query.startDate);
      if (query.endDate) expiryDateFilter.lte = new Date(query.endDate);
      where.expiryDate = { ...(where.expiryDate as Record<string, unknown>), ...expiryDateFilter };
    }

    const [batches, total] = await Promise.all([
      this.prisma.client.batch.findMany({
        where,
        include: { product: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.client.batch.count({ where }),
    ]);

    return {
      data: batches.map((batch) => this.toExpiryResult(batch, now)),
      total,
      limit,
      offset,
    };
  }

  async getPharmacyExpiryDashboard(providerId: string): Promise<ExpiryDashboard> {
    return this.getDashboard(providerId);
  }

  private toExpiryResult(
    batch: {
      id: string;
      batchNumber: string;
      productId: string;
      product: { name: string };
      expiryDate: Date;
      currentQuantity: number;
    },
    now: Date,
  ): ExpiryBatchResult {
    const daysUntilExpiry = Math.ceil(
      (batch.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    const status = this.determineExpiryStatus(batch.expiryDate, now, daysUntilExpiry);

    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      productId: batch.productId,
      productName: batch.product.name,
      expiryDate: batch.expiryDate.toISOString(),
      currentQuantity: batch.currentQuantity,
      status,
      daysUntilExpiry,
    };
  }

  private determineExpiryStatus(expiryDate: Date, now: Date, daysUntilExpiry: number): string {
    if (expiryDate < now) return ExpiryStatus.EXPIRED;
    if (daysUntilExpiry <= EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_30_DAYS)
      return ExpiryStatus.EXPIRING_WITHIN_30_DAYS;
    if (daysUntilExpiry <= EXPIRY_CONFIG.WINDOWS.EXPIRING_WITHIN_60_DAYS)
      return ExpiryStatus.EXPIRING_WITHIN_60_DAYS;
    return ExpiryStatus.SAFE;
  }
}
