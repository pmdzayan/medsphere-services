import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryQuarantineEvidenceItemDto {
  @ApiProperty({ format: 'uuid' }) recordId!: string;
  @ApiProperty({ format: 'uuid' }) inventoryId!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty({ format: 'uuid' }) actorMembershipId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() genericName!: string | null;
  @ApiProperty() brand!: string;
  @ApiPropertyOptional() sku!: string | null;
  @ApiProperty() batchNumber!: string;
  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED', 'EXHAUSTED', 'QUARANTINED'] })
  currentStatus!: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED';
  @ApiProperty({
    enum: [
      'QUALITY_SUSPECT',
      'TEMPERATURE_EXCURSION',
      'PACKAGING_COMPROMISED',
      'STORAGE_DEVIATION',
    ],
  })
  reasonCode!:
    'QUALITY_SUSPECT' | 'TEMPERATURE_EXCURSION' | 'PACKAGING_COMPROMISED' | 'STORAGE_DEVIATION';
  @ApiProperty({ minimum: 0 }) onHandQuantity!: number;
  @ApiProperty({ minimum: 0 }) affectedReservationCount!: number;
  @ApiProperty({ minimum: 0 }) releasedUnitCount!: number;
  @ApiProperty({ minimum: 1 }) resultingBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
}

export class InventoryQuarantineEvidenceResponseDto {
  @ApiProperty({ type: [InventoryQuarantineEvidenceItemDto] })
  data!: InventoryQuarantineEvidenceItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
