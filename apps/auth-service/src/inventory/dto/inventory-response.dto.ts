export class InventoryResponseDto {
  id!: string;
  providerId!: string;
  productId!: string;
  sku?: string | null;
  batchNumber!: string;
  expiryDate!: string;
  quantity!: number;
  reservedQuantity!: number;
  sellingPrice!: string;
  mrp!: string;
  discountPercentage!: string;
  taxPercentage!: string;
  minimumStockLevel!: number;
  inStock!: boolean;
  isVisible!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
