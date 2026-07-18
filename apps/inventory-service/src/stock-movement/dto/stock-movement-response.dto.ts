export class StockMovementResponseDto {
  id!: string;
  inventoryId!: string;
  batchId?: string | null;
  providerId!: string;
  productId!: string;
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

export class PaginatedStockMovementResponseDto {
  data!: StockMovementResponseDto[];
  total!: number;
  limit!: number;
  offset!: number;
}
