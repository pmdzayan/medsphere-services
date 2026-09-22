import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const IMPORT_SOURCE_FORMATS = ['CSV', 'XLSX'] as const;

export class InventoryImportStageRowDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  identifier?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  productName?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  brand?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  manufacturer?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  strength?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dosageForm?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  sellingPrice?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mrp?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  discountPercentage?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  taxPercentage?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  minimumStockLevel?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  isVisible?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batchNumber?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  manufacturingDate?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  expiryDate?: string;

  @ApiPropertyOptional({ maxLength: 16 })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  quantity?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  purchasePrice?: string;
}

export class StageInventoryImportDto {
  @ApiProperty({ enum: IMPORT_SOURCE_FORMATS })
  @IsIn(IMPORT_SOURCE_FORMATS)
  sourceFormat!: (typeof IMPORT_SOURCE_FORMATS)[number];

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Matches(/^[^\s\u0000-\u001F\u007F](?:[^\u0000-\u001F\u007F]*[^\s\u0000-\u001F\u007F])?$/)
  sourceFileName!: string;

  @ApiProperty({ description: 'SHA-256 hex digest of the parsed source file' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  contentHash!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  stageIdempotencyKey!: string;

  @ApiProperty({ description: 'Bounded source-header to canonical-field mapping evidence' })
  @IsObject()
  mapping!: Record<string, string>;

  @ApiProperty({ type: [InventoryImportStageRowDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InventoryImportStageRowDto)
  rows!: InventoryImportStageRowDto[];
}

export class ApplyInventoryImportDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;
}

export { IMPORT_SOURCE_FORMATS };
