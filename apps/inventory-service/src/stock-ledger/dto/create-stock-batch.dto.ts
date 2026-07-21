import { IsString, IsNumber, IsOptional, Min, IsDateString } from 'class-validator';

export class CreateStockBatchDto {
  @IsString()
  tenantId!: string;

  @IsString()
  productId!: string;

  @IsString()
  batchNumber!: string;

  @IsOptional()
  @IsDateString()
  manufacturedDate?: string;

  @IsDateString()
  expiryDate!: string;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsNumber()
  @Min(0)
  initialQuantity!: number;
}
