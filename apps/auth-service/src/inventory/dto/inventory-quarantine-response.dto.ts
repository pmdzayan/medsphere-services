import { ApiProperty } from '@nestjs/swagger';
import { BATCH_QUARANTINE_REASONS, BatchQuarantineReason } from '../inventory-quarantine.types';

export class BatchQuarantineResponseDto {
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ enum: ['QUARANTINED'] }) status!: 'QUARANTINED';
  @ApiProperty({ enum: BATCH_QUARANTINE_REASONS }) reasonCode!: BatchQuarantineReason;
  @ApiProperty({ minimum: 0 }) onHandQuantity!: number;
  @ApiProperty({ minimum: 0 }) affectedReservationCount!: number;
  @ApiProperty({ minimum: 0 }) releasedUnitCount!: number;
  @ApiProperty({ minimum: 1 }) resultingBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() replayed!: boolean;
}
