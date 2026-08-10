import { ApiProperty } from '@nestjs/swagger';
export class CompletedTransferResponseDto {
  @ApiProperty({ format: 'uuid' }) transferId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) sourceProviderId!: string;
  @ApiProperty({ format: 'uuid' }) destinationProviderId!: string;
  @ApiProperty({ format: 'uuid' }) sourceInventoryId!: string;
  @ApiProperty({ format: 'uuid' }) destinationInventoryId!: string;
  @ApiProperty({ format: 'uuid' }) sourceBatchId!: string;
  @ApiProperty({ format: 'uuid' }) destinationBatchId!: string;
  @ApiProperty({ format: 'uuid' }) sourceMovementId!: string;
  @ApiProperty({ format: 'uuid' }) destinationMovementId!: string;
  @ApiProperty({ minimum: 1 }) quantity!: number;
  @ApiProperty({ minimum: 0 }) sourceOnHandAfter!: number;
  @ApiProperty({ minimum: 0 }) destinationOnHandAfter!: number;
  @ApiProperty({ minimum: 1 }) sourceBatchVersion!: number;
  @ApiProperty({ minimum: 1 }) destinationBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) completedAt!: Date;
  @ApiProperty() replayed!: boolean;
}
