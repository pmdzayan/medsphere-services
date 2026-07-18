import { IsString, IsOptional, IsNumber, IsDateString, IsEnum, Min } from 'class-validator';
import { BatchStatus } from '../../common/enums';

export class UpdateBatchDto {
  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsDateString()
  @IsOptional()
  manufacturingDate?: string;

  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  currentQuantity?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  purchasePrice?: number;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  sellingPrice?: number;

  @IsEnum(BatchStatus)
  @IsOptional()
  status?: BatchStatus;
}
