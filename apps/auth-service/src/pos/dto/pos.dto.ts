import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const POS_REGISTRATION_TYPES = ['GST_REGULAR', 'GST_COMPOSITION', 'UNREGISTERED'] as const;
export const POS_PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'OTHER'] as const;

export class ConfigurePharmacyFiscalProfileDto {
  @ApiProperty({ enum: POS_REGISTRATION_TYPES })
  @IsIn(POS_REGISTRATION_TYPES)
  registrationType!: (typeof POS_REGISTRATION_TYPES)[number];

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  legalName!: string;

  @ApiPropertyOptional({ maxLength: 15 })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  gstin?: string;

  @ApiProperty({ pattern: '^\\d{2}$' })
  @Matches(/^\d{2}$/)
  stateCode!: string;

  @ApiProperty({ pattern: '^[A-Z0-9]{1,4}$' })
  @Matches(/^[A-Z0-9]{1,4}$/)
  invoiceSeries!: string;

  @ApiProperty({ default: true })
  @IsBoolean()
  pricesIncludeTax!: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ConfigureInventoryFiscalProfileDto {
  @ApiProperty({ pattern: '^\\d{4}(?:\\d{2}){0,2}$' })
  @Matches(/^\d{4}(?:\d{2}){0,2}$/)
  hsnCode!: string;

  @ApiProperty({ pattern: '^[A-Z]{2,8}$', default: 'NOS' })
  @Matches(/^[A-Z]{2,8}$/)
  uqc!: string;

  @ApiProperty({ pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,2})?$' })
  @Matches(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/)
  cessPercentage!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class PharmacyCheckoutLineDto {
  @ApiProperty()
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class PharmacyCheckoutPaymentDto {
  @ApiProperty({ enum: POS_PAYMENT_METHODS })
  @IsIn(POS_PAYMENT_METHODS)
  method!: (typeof POS_PAYMENT_METHODS)[number];

  @ApiProperty({ maxLength: 32 })
  @IsString()
  @MaxLength(32)
  amount!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalReference?: string;
}

export class PharmacyCheckoutDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ type: [PharmacyCheckoutLineDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PharmacyCheckoutLineDto)
  lines!: PharmacyCheckoutLineDto[];

  @ApiProperty({ type: [PharmacyCheckoutPaymentDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PharmacyCheckoutPaymentDto)
  payments!: PharmacyCheckoutPaymentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  reservationId?: string;

  @ApiPropertyOptional({
    description: 'Short-lived one-time pickup proof issued to the reservation owner',
    minLength: 32,
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32}$/)
  pickupToken?: string;

  @ApiProperty({ pattern: '^\\d{2}$' })
  @Matches(/^\d{2}$/)
  placeOfSupplyStateCode!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recipientAddress?: string;

  @ApiPropertyOptional({ maxLength: 15 })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  recipientGstin?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  cashTendered?: string;
}

export class VoidPharmacySaleDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
