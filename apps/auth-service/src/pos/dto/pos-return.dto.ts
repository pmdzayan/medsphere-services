import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { POS_PAYMENT_METHODS } from './pos.dto';
import { PHARMACY_RETURN_REASONS } from '../pos-return.types';

export class PharmacySaleReturnLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  saleLineId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReturnPharmacySaleDto {
  @ApiProperty({ minLength: 8, maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ enum: PHARMACY_RETURN_REASONS })
  @IsIn(PHARMACY_RETURN_REASONS)
  reasonCode!: (typeof PHARMACY_RETURN_REASONS)[number];

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiProperty({ enum: POS_PAYMENT_METHODS })
  @IsIn(POS_PAYMENT_METHODS)
  refundMethod!: (typeof POS_PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  refundExternalReference?: string;

  @ApiProperty({ type: [PharmacySaleReturnLineDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PharmacySaleReturnLineDto)
  lines!: PharmacySaleReturnLineDto[];
}

export class PharmacySaleReturnReceiptDto {
  @ApiProperty({ format: 'uuid' }) returnId!: string;
  @ApiProperty({ format: 'uuid' }) saleId!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ enum: PHARMACY_RETURN_REASONS }) reasonCode!: string;
  @ApiProperty({ enum: POS_PAYMENT_METHODS }) refundMethod!: string;
  @ApiPropertyOptional() refundExternalReference!: string | null;
  @ApiProperty() lineCount!: number;
  @ApiProperty() totalQuantity!: number;
  @ApiProperty() subtotal!: string;
  @ApiProperty() discountTotal!: string;
  @ApiProperty() taxableTotal!: string;
  @ApiProperty() cgstTotal!: string;
  @ApiProperty() sgstTotal!: string;
  @ApiProperty() igstTotal!: string;
  @ApiProperty() cessTotal!: string;
  @ApiProperty() refundTotal!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: Date;
  @ApiProperty() replayed!: boolean;
}
