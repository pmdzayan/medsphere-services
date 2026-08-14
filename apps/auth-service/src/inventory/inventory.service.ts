import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { InventoryStockQueryDto } from './dto/inventory-stock-query.dto';
import { InventoryStockListResponseDto } from './dto/inventory-stock-response.dto';
import { InventoryExpiryQueryDto } from './dto/inventory-expiry-query.dto';
import { InventoryExpiryWorklistResponseDto } from './dto/inventory-expiry-response.dto';
import { InventoryQuarantineEvidenceQueryDto } from './dto/inventory-quarantine-evidence-query.dto';
import { InventoryQuarantineEvidenceResponseDto } from './dto/inventory-quarantine-evidence-response.dto';
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

  async listExpiryWorklist(
    identity: AuthenticatedIdentity,
    providerId: string,
    query: InventoryExpiryQueryDto,
  ): Promise<InventoryExpiryWorklistResponseDto> {
    if (!(await this.repository.hasProviderAccess(identity, providerId))) {
      throw new NotFoundException('Provider expiry worklist not found');
    }
    const asOf = new Date();
    const horizonEndsAt = new Date(asOf.getTime() + query.horizonDays * 86_400_000);
    const result = await this.repository.listExpiryWorklist(
      identity.tenantId,
      providerId,
      query,
      asOf,
      horizonEndsAt,
    );
    return {
      data: result.data.map((batch) => ({
        inventoryId: batch.inventoryId,
        batchId: batch.id,
        productId: batch.productId,
        name: batch.product.name,
        genericName: batch.product.genericName,
        brand: batch.product.brand,
        sku: batch.inventory.sku,
        isVisible: batch.inventory.isVisible,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        version: batch.version,
        onHandQuantity: batch.onHandQuantity,
        heldQuantity: batch.heldQuantity,
        availableQuantity: Math.max(0, batch.onHandQuantity - batch.heldQuantity),
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
      asOf,
      horizonEndsAt,
    };
  }

  async listQuarantineEvidence(
    identity: AuthenticatedIdentity,
    providerId: string,
    query: InventoryQuarantineEvidenceQueryDto,
  ): Promise<InventoryQuarantineEvidenceResponseDto> {
    if (!(await this.repository.hasProviderAccess(identity, providerId))) {
      throw new NotFoundException('Provider quarantine evidence not found');
    }
    const result = await this.repository.listQuarantineEvidence(
      identity.tenantId,
      providerId,
      query,
    );
    return {
      data: result.data.map((record) => ({
        recordId: record.id,
        inventoryId: record.inventoryId,
        batchId: record.batchId,
        productId: record.productId,
        actorMembershipId: record.actorMembershipId,
        name: record.product.name,
        genericName: record.product.genericName,
        brand: record.product.brand,
        sku: record.inventory.sku,
        batchNumber: record.batch.batchNumber,
        currentStatus: record.batch.status,
        reasonCode: record.reasonCode,
        onHandQuantity: record.onHandQuantity,
        affectedReservationCount: record.affectedReservationCount,
        releasedUnitCount: record.releasedUnitCount,
        resultingBatchVersion: record.resultingBatchVersion,
        occurredAt: record.occurredAt,
      })),
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
