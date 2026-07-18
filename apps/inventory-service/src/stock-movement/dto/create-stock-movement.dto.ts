import { IsString, IsNotEmpty, IsNumber, IsOptional, IsUUID, IsEnum, Min } from 'class-validator';
import { StockMovementType } from '../../common/enums';

export class CreateStockMovementDto {
  @IsUUID()
  @IsNotEmpty()
  inventoryId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsEnum(StockMovementType)
  @IsNotEmpty()
  type!: StockMovementType;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  quantityBefore!: number;

  @IsNumber()
  @Min(0)
  quantityAfter!: number;

  @IsString()
  @IsOptional()
  referenceType?: string;

  @IsString()
  @IsOptional()
  referenceId?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
