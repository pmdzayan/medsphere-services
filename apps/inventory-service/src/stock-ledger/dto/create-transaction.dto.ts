import { IsString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { TransactionType } from '../enums';

export class CreateTransactionDto {
  @IsString()
  tenantId!: string;

  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsString()
  sourceLocationId!: string;

  @IsString()
  targetLocationId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;
}
