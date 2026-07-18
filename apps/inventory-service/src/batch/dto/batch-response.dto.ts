export class BatchResponseDto {
  id!: string;
  providerId!: string;
  productId!: string;
  batchNumber!: string;
  manufacturingDate?: string | null;
  expiryDate!: string;
  initialQuantity!: number;
  currentQuantity!: number;
  purchasePrice!: string;
  sellingPrice!: string;
  status!: string;
  createdAt!: string;
  updatedAt!: string;
}
