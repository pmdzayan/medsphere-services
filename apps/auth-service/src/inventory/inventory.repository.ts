import { Injectable } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';

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
}
