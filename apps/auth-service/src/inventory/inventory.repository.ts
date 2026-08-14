import { Injectable } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';
import { InventoryExpiryQueryDto } from './dto/inventory-expiry-query.dto';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hasProviderAccess(identity: AuthenticatedIdentity, providerId: string): Promise<boolean> {
    const access = await this.prisma.client.membershipProviderAccess.findFirst({
      where: {
        tenantId: identity.tenantId,
        membershipId: identity.membershipId,
        providerId,
        membership: {
          userId: identity.userId,
          status: 'ACTIVE',
          deletedAt: null,
          tenant: { isActive: true, deletedAt: null },
        },
        provider: { isActive: true, deletedAt: null },
      },
      select: { id: true },
    });
    return access !== null;
  }

  async listStock(tenantId: string, providerId: string, query: InventoryStockQueryDto) {
    const search = query.query?.trim();
    const where = {
      tenantId,
      providerId,
      deletedAt: null,
      product: {
        isActive: true,
        deletedAt: null,
      },
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' as const } },
              { product: { name: { contains: search, mode: 'insensitive' as const } } },
              { product: { genericName: { contains: search, mode: 'insensitive' as const } } },
              { product: { brand: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    } as const;

    const [data, total] = await Promise.all([
      this.prisma.client.inventory.findMany({
        where,
        select: {
          id: true,
          productId: true,
          sku: true,
          sellingPrice: true,
          mrp: true,
          isVisible: true,
          product: { select: { name: true, genericName: true, brand: true } },
          batches: {
            where: { deletedAt: null },
            select: {
              id: true,
              batchNumber: true,
              manufacturingDate: true,
              expiryDate: true,
              status: true,
              version: true,
              onHandQuantity: true,
              heldQuantity: true,
            },
            orderBy: [
              { expiryDate: 'asc' },
              { manufacturingDate: 'asc' },
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
          },
        },
        orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.client.inventory.count({ where }),
    ]);
    return { data, total };
  }

  async listExpiryWorklist(
    tenantId: string,
    providerId: string,
    query: InventoryExpiryQueryDto,
    asOf: Date,
    horizonEndsAt: Date,
  ) {
    const where = {
      tenantId,
      providerId,
      deletedAt: null,
      status: 'ACTIVE' as const,
      onHandQuantity: { gt: 0 },
      expiryDate: { gt: asOf, lte: horizonEndsAt },
      inventory: { deletedAt: null },
      product: { isActive: true, deletedAt: null },
    } as const;
    const [data, total] = await Promise.all([
      this.prisma.client.batch.findMany({
        where,
        select: {
          id: true,
          inventoryId: true,
          productId: true,
          batchNumber: true,
          expiryDate: true,
          version: true,
          onHandQuantity: true,
          heldQuantity: true,
          inventory: { select: { sku: true, isVisible: true } },
          product: { select: { name: true, genericName: true, brand: true } },
        },
        orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.client.batch.count({ where }),
    ]);
    return { data, total };
  }
}
