import type { AuditRequestContext } from '@medsphere/database';
import type { TrustedInventoryActor } from './inventory-command.types';

export type NormalizedInventoryImportRow = {
  rowId: string;
  rowNumber: number;
  productId: string;
  sku?: string;
  sellingPrice: string;
  mrp: string;
  discountPercentage: string;
  taxPercentage: string;
  minimumStockLevel: number;
  isVisible: boolean;
  batchNumber: string;
  manufacturingDate?: Date;
  expiryDate: Date;
  quantity: number;
  purchasePrice: string;
};

export type ApplyInventoryImportCommand = {
  actor: TrustedInventoryActor;
  providerId: string;
  importJobId: string;
  idempotencyKey: string;
  rows: readonly NormalizedInventoryImportRow[];
  request?: AuditRequestContext;
};

export type AppliedInventoryImportRow = {
  rowId: string;
  inventoryId: string;
  batchId: string;
};

export type InventoryImportApplyResult = {
  receiptId: string;
  appliedRowCount: number;
  totalQuantity: number;
  replayed: boolean;
  rows: AppliedInventoryImportRow[];
};
