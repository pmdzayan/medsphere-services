import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const DECIMAL_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const PERCENTAGE_PATTERN = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

class IdempotentCommandDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  idempotencyKey!: string;
}

export class ConfigureInventoryDto extends IdempotentCommandDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku?: string;

  @ApiProperty({ example: '120.00', description: 'Non-negative decimal with at most 2 places' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  sellingPrice!: string;

  @ApiProperty({ example: '135.00', description: 'Non-negative decimal with at most 2 places' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  mrp!: string;

  @ApiProperty({ example: '5.00', description: 'Percentage from 0 through 100' })
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  discountPercentage!: string;

  @ApiProperty({ example: '5.00', description: 'Percentage from 0 through 100' })
  @IsString()
  @Matches(PERCENTAGE_PATTERN)
  taxPercentage!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  minimumStockLevel!: number;

  @ApiProperty()
  @IsBoolean()
  isVisible!: boolean;
}

export class ReceiveBatchDto extends IdempotentCommandDto {
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  batchNumber!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  manufacturingDate?: string;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  expiryDate!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: '100.00' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  purchasePrice!: string;

  @ApiProperty({ example: '120.00' })
  @IsString()
  @Matches(DECIMAL_PATTERN)
  sellingPrice!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}

export class AdjustBatchDto extends IdempotentCommandDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ description: 'Non-zero signed quantity change' })
  @IsInt()
  @NotEquals(0)
  delta!: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
