import type { AuditRequestContext } from '@medsphere/database';

export interface TrustedTenantActor {
  readonly tenantId: string;
  readonly membershipId: string;
}

export interface ConfigureInventoryCommand {
  readonly actor: TrustedTenantActor;
  readonly providerId: string;
  readonly productId: string;
  readonly expectedVersion?: number;
  readonly sku?: string;
  readonly sellingPrice: string;
  readonly mrp: string;
  readonly discountPercentage: string;
  readonly taxPercentage: string;
  readonly minimumStockLevel: number;
  readonly isVisible: boolean;
  readonly idempotencyKey: string;
  readonly request?: AuditRequestContext;
}

export interface InventoryConfigurationResult {
  readonly inventoryId: string;
  readonly version: number;
  readonly replayed: boolean;
}

export interface ReceiveBatchCommand {
  readonly actor: TrustedTenantActor;
  readonly inventoryId: string;
  readonly providerId: string;
  readonly productId: string;
  readonly batchNumber: string;
  readonly manufacturingDate?: Date;
  readonly expiryDate: Date;
  readonly quantity: number;
  readonly purchasePrice: string;
  readonly sellingPrice: string;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly request?: AuditRequestContext;
}

export interface AdjustBatchCommand {
  readonly actor: TrustedTenantActor;
  readonly batchId: string;
  readonly providerId: string;
  readonly expectedVersion: number;
  readonly delta: number;
  readonly idempotencyKey: string;
  readonly reason: string;
  readonly request?: AuditRequestContext;
}

export interface StockMutationResult {
  readonly inventoryId: string;
  readonly batchId: string;
  readonly movementId: string;
  readonly onHandBefore: number;
  readonly onHandAfter: number;
  readonly batchVersion: number;
  readonly replayed: boolean;
}

export interface FefoCandidate {
  readonly id: string;
  readonly inventoryId: string;
  readonly expiryDate: Date;
  readonly manufacturingDate: Date | null;
  readonly onHandQuantity: number;
  readonly heldQuantity: number;
  readonly version?: number;
  readonly status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED';
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
}

export interface FefoAllocation {
  readonly batchId: string;
  readonly inventoryId: string;
  readonly quantity: number;
}
