import { IsUUID, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class FefoPreviewQueryDto {
  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  quantity?: number;
}
