import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryExpiryWorklistItemDto {
  @ApiProperty({ format: 'uuid' }) inventoryId!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() genericName!: string | null;
  @ApiProperty() brand!: string;
  @ApiPropertyOptional() sku!: string | null;
  @ApiProperty() isVisible!: boolean;
  @ApiProperty() batchNumber!: string;
  @ApiProperty({ format: 'date-time' }) expiryDate!: Date;
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ minimum: 1 }) onHandQuantity!: number;
  @ApiProperty({ minimum: 0 }) heldQuantity!: number;
  @ApiProperty({ minimum: 0 }) availableQuantity!: number;
}

export class InventoryExpiryWorklistResponseDto {
  @ApiProperty({ type: [InventoryExpiryWorklistItemDto] })
  data!: InventoryExpiryWorklistItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty({ format: 'date-time' }) asOf!: Date;
  @ApiProperty({ format: 'date-time' }) horizonEndsAt!: Date;
}
