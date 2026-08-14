import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';
import { InventoryStockListResponseDto } from './dto/inventory-stock-response.dto';
import { InventoryRepository } from './inventory.repository';

@Injectable()
export class InventoryService {
  constructor(private readonly repository: InventoryRepository) {}

  async listStock(
    identity: AuthenticatedIdentity,
    providerId: string,
    query: InventoryStockQueryDto,
  ): Promise<InventoryStockListResponseDto> {
    if (!(await this.repository.hasProviderAccess(identity, providerId))) {
      throw new NotFoundException('Provider stock not found');
    }

    const result = await this.repository.listStock(identity.tenantId, providerId, query);
    const now = Date.now();
    return {
      data: result.data.map((inventory) => {
        const batches = inventory.batches.map((batch) => {
          const eligible = batch.status === 'ACTIVE' && batch.expiryDate.getTime() > now;
          return {
            id: batch.id,
            batchNumber: batch.batchNumber,
            manufacturingDate: batch.manufacturingDate,
            expiryDate: batch.expiryDate,
            status: batch.status,
            version: batch.version,
            onHandQuantity: batch.onHandQuantity,
            heldQuantity: batch.heldQuantity,
            availableQuantity: eligible
              ? Math.max(0, batch.onHandQuantity - batch.heldQuantity)
              : 0,
          };
        });
        return {
          inventoryId: inventory.id,
          productId: inventory.productId,
          name: inventory.product.name,
          genericName: inventory.product.genericName,
          brand: inventory.product.brand,
          sku: inventory.sku,
          sellingPrice: inventory.sellingPrice.toFixed(2),
          mrp: inventory.mrp.toFixed(2),
          isVisible: inventory.isVisible,
          totalOnHandQuantity: batches.reduce((sum, batch) => sum + batch.onHandQuantity, 0),
          totalHeldQuantity: batches.reduce((sum, batch) => sum + batch.heldQuantity, 0),
          totalAvailableQuantity: batches.reduce((sum, batch) => sum + batch.availableQuantity, 0),
          batches,
        };
      }),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
