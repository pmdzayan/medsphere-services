export class InventoryHistoryResponseDto {
  id!: string;
  inventoryId!: string;
  providerId!: string;
  productId!: string;
  batchId?: string | null;
  type!: string;
  quantity!: number;
  quantityBefore!: number;
  quantityAfter!: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  notes?: string | null;
  userId!: string;
  createdAt!: string;
}
