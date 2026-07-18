import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateBatchDto {
  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @IsDateString()
  @IsOptional()
  manufacturingDate?: string;

  @IsDateString()
  @IsNotEmpty()
  expiryDate!: string;

  @IsNumber()
  @Min(0)
  initialQuantity!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  currentQuantity?: number;

  @IsNumber()
  @Min(0)
  purchasePrice!: number;

  @IsNumber()
  @Min(0.01)
  sellingPrice!: number;
}
