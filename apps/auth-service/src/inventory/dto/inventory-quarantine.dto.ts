import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BATCH_QUARANTINE_REASONS, BatchQuarantineReason } from '../inventory-quarantine.types';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class QuarantineBatchDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @ApiProperty({ minLength: 8, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ enum: BATCH_QUARANTINE_REASONS })
  @IsEnum(BATCH_QUARANTINE_REASONS)
  reasonCode!: BatchQuarantineReason;
}
