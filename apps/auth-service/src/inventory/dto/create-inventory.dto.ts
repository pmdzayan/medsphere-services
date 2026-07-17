import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class CreateInventoryDto {
  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @IsDateString()
  @IsNotEmpty()
  expiryDate!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  reservedQuantity?: number;

  @IsNumber()
  @Min(0.01)
  sellingPrice!: number;

  @IsNumber()
  @Min(0)
  mrp!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxPercentage?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumStockLevel?: number;
}
