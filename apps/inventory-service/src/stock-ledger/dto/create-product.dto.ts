import { IsString, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  tenantId!: string;

  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category!: string;

  @IsString()
  unitOfMeasure!: string;

  @IsOptional()
  @IsBoolean()
  isControlled?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresColdChain?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockThreshold?: number;
}
