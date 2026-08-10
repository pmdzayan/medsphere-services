import { ApiProperty } from '@nestjs/swagger';

export class DamagedStockResponseDto {
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ format: 'uuid' }) inventoryId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ format: 'uuid' }) movementId!: string;
  @ApiProperty({ minimum: 1 }) quantity!: number;
  @ApiProperty({ minimum: 1 }) onHandBefore!: number;
  @ApiProperty({ minimum: 0 }) onHandAfter!: number;
  @ApiProperty({ minimum: 1 }) resultingBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() replayed!: boolean;
}
