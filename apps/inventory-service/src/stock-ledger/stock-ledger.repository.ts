import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StockLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Product Catalog ----

  async createProduct(data: {
    tenantId: string;
    sku: string;
    name: string;
    genericName?: string;
    description?: string;
    category: string;
    unitOfMeasure: string;
    isControlled: boolean;
    requiresColdChain: boolean;
    minStockThreshold: number;
  }) {
    return this.prisma.client.productCatalog.create({ data });
  }

  async findProductById(id: string) {
    return this.prisma.client.productCatalog.findUnique({
      where: { id },
      include: { batches: true },
    });
  }

  async findProductByTenantSku(tenantId: string, sku: string) {
    return this.prisma.client.productCatalog.findUnique({
      where: { tenantId_sku: { tenantId, sku } },
    });
  }

  async findProductsByTenant(tenantId: string) {
    return this.prisma.client.productCatalog.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  // ---- Locations ----

  async createLocation(data: { tenantId: string; name: string; type: string; isStorage: boolean }) {
    return this.prisma.client.location.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        name: data.name,
        type: data.type as never,
        isStorage: data.isStorage,
      },
    });
  }

  async findLocationById(id: string) {
    return this.prisma.client.location.findUnique({ where: { id } });
  }

  async findLocationByTenantName(tenantId: string, name: string) {
    return this.prisma.client.location.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  }

  async findLocationsByTenant(tenantId: string) {
    return this.prisma.client.location.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  // ---- Stock Batches ----

  async createStockBatch(data: {
    tenantId: string;
    productId: string;
    batchNumber: string;
    manufacturedDate?: Date;
    expiryDate: Date;
    unitCost: number;
    sellingPrice: number;
    initialQuantity: number;
    currentQuantity: number;
  }) {
    return this.prisma.client.stockBatch.create({ data });
  }

  async findStockBatchById(id: string) {
    return this.prisma.client.stockBatch.findUnique({
      where: { id },
      include: { product: true, ledgerEntries: true },
    });
  }

  async findStockBatchesByProduct(tenantId: string, productId: string) {
    return this.prisma.client.stockBatch.findMany({
      where: { tenantId, productId },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async findFefoBatches(tenantId: string, productId: string, quantityNeeded?: number) {
    const batches = await this.prisma.client.stockBatch.findMany({
      where: {
        tenantId,
        productId,
        currentQuantity: { gt: 0 },
        expiryDate: { gt: new Date() },
      },
      orderBy: [
        { expiryDate: 'asc' },
        { manufacturedDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });

    if (!quantityNeeded || quantityNeeded <= 0) {
      return {
        batches: batches.map((b) => ({
          batchId: b.id,
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          currentQuantity: b.currentQuantity,
        })),
        fulfilled: true,
      };
    }

    const selected: Array<{ batchId: string; quantity: number; batchNumber: string }> = [];
    let remaining = quantityNeeded;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.currentQuantity, remaining);
      selected.push({ batchId: batch.id, batchNumber: batch.batchNumber, quantity: take });
      remaining -= take;
    }

    return { batches: selected, fulfilled: remaining <= 0 };
  }

  async updateStockBatchQuantity(id: string, currentQuantity: number) {
    return this.prisma.client.stockBatch.update({
      where: { id },
      data: { currentQuantity },
    });
  }

  // ---- Stock Ledger (immutable) ----

  async createTransaction(data: {
    tenantId: string;
    transactionType: string;
    productId: string;
    batchId: string;
    sourceLocationId: string;
    targetLocationId: string;
    quantity: number;
    referenceType?: string;
    referenceId?: string;
    correlationId?: string;
  }) {
    return this.prisma.client.stockLedger.create({
      data: {
        tenantId: data.tenantId,
        transactionType: data.transactionType as never,
        productId: data.productId,
        batchId: data.batchId,
        sourceLocationId: data.sourceLocationId,
        targetLocationId: data.targetLocationId,
        quantity: data.quantity,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        correlationId: data.correlationId,
      },
      include: {
        batch: true,
        sourceLocation: true,
        targetLocation: true,
      },
    });
  }

  async findTransactionsByTenant(
    tenantId: string,
    params: {
      productId?: string;
      batchId?: string;
      transactionType?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (params.productId) where.productId = params.productId;
    if (params.batchId) where.batchId = params.batchId;
    if (params.transactionType) where.transactionType = params.transactionType;

    const take = params.limit ?? 50;
    const skip = params.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.client.stockLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { batch: true, sourceLocation: true, targetLocation: true },
      }),
      this.prisma.client.stockLedger.count({ where }),
    ]);

    return { data, total, limit: take, offset: skip };
  }

  // ---- Stock Reservations ----

  async createReservation(data: {
    tenantId: string;
    locationId: string;
    productId: string;
    batchId: string;
    quantity: number;
    expiresAt: Date;
    referenceId: string;
  }) {
    return this.prisma.client.stockReservation.create({ data });
  }

  async findReservationById(id: string) {
    return this.prisma.client.stockReservation.findUnique({
      where: { id },
      include: { location: true, batch: true },
    });
  }

  async findActiveReservationsByLocation(tenantId: string, locationId: string, productId: string) {
    return this.prisma.client.stockReservation.findMany({
      where: {
        tenantId,
        locationId,
        productId,
        status: 'ACTIVE',
      },
    });
  }

  async updateReservationStatus(id: string, status: string) {
    return this.prisma.client.stockReservation.update({
      where: { id },
      data: { status: status as never },
    });
  }
}
