import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedTenantActor } from '@medsphere/security';

/**
 * Task 0020: the canonical trusted server-derived identity contract for
 * tenant-human actors now lives in `@medsphere/security`. The inventory
 * command surface keeps this type alias so existing call sites compile
 * unchanged while sharing one verified identity shape with future verticals.
 */
export type TrustedInventoryActor = TrustedTenantActor;

export interface ConfigureInventoryCommand {
  readonly actor: TrustedInventoryActor;
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
  readonly actor: TrustedInventoryActor;
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
  readonly actor: TrustedInventoryActor;
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
