import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryBatchStockResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  batchNumber!: string;

  @ApiProperty({ format: 'date-time' })
  expiryDate!: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  manufacturingDate!: Date | null;

  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'EXHAUSTED'] })
  status!: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED';

  @ApiProperty()
  onHandQuantity!: number;

  @ApiProperty()
  heldQuantity!: number;

  @ApiProperty()
  availableQuantity!: number;
}

export class InventoryStockItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  inventoryId!: string;

  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  genericName!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiPropertyOptional()
  sku!: string | null;

  @ApiProperty({ description: 'Decimal currency value encoded as a string' })
  sellingPrice!: string;

  @ApiProperty({ description: 'Decimal currency value encoded as a string' })
  mrp!: string;

  @ApiProperty()
  isVisible!: boolean;

  @ApiProperty()
  totalOnHandQuantity!: number;

  @ApiProperty()
  totalHeldQuantity!: number;

  @ApiProperty()
  totalAvailableQuantity!: number;

  @ApiProperty({ type: [InventoryBatchStockResponseDto] })
  batches!: InventoryBatchStockResponseDto[];
}

export class InventoryStockListResponseDto {
  @ApiProperty({ type: [InventoryStockItemResponseDto] })
  data!: InventoryStockItemResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
