import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BATCH_RECALL_REASONS,
  INVENTORY_EXCEPTION_ACTIONS,
  INVENTORY_EXCEPTION_DECISIONS,
} from '../inventory-exception.types';

export class RecallBatchDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ enum: BATCH_RECALL_REASONS })
  @IsIn(BATCH_RECALL_REASONS)
  reasonCode!: (typeof BATCH_RECALL_REASONS)[number];

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RequestInventoryExceptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  batchId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ enum: INVENTORY_EXCEPTION_ACTIONS })
  @IsIn(INVENTORY_EXCEPTION_ACTIONS)
  action!: (typeof INVENTORY_EXCEPTION_ACTIONS)[number];

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class DecideInventoryExceptionDto {
  @ApiProperty({ enum: INVENTORY_EXCEPTION_DECISIONS })
  @IsIn(INVENTORY_EXCEPTION_DECISIONS)
  outcome!: (typeof INVENTORY_EXCEPTION_DECISIONS)[number];

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class BatchRecallResponseDto {
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ enum: ['RECALLED'] }) status!: 'RECALLED';
  @ApiProperty({ enum: BATCH_RECALL_REASONS }) reasonCode!: string;
  @ApiProperty() onHandQuantity!: number;
  @ApiProperty() affectedReservationCount!: number;
  @ApiProperty() releasedUnitCount!: number;
  @ApiProperty() resultingBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() replayed!: boolean;
}

export class InventoryExceptionRequestResponseDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ enum: INVENTORY_EXCEPTION_ACTIONS }) action!: string;
  @ApiPropertyOptional() quantity!: number | null;
  @ApiProperty() requestedBatchVersion!: number;
  @ApiProperty({ format: 'date-time' }) requestedAt!: Date;
  @ApiProperty() replayed!: boolean;
}

export class InventoryExceptionDecisionResponseDto {
  @ApiProperty({ format: 'uuid' }) decisionId!: string;
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ format: 'uuid' }) batchId!: string;
  @ApiProperty({ enum: INVENTORY_EXCEPTION_ACTIONS }) action!: string;
  @ApiPropertyOptional() quantity!: number | null;
  @ApiProperty({ enum: INVENTORY_EXCEPTION_DECISIONS }) outcome!: string;
  @ApiPropertyOptional({ format: 'uuid' }) movementId!: string | null;
  @ApiPropertyOptional() onHandBefore!: number | null;
  @ApiPropertyOptional() onHandAfter!: number | null;
  @ApiPropertyOptional() resultingBatchVersion!: number | null;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() replayed!: boolean;
}
