import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class RecordCompletedTransferDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') destinationProviderId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') sourceBatchId!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(2_147_483_647) expectedSourceVersion!: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(2_147_483_647) quantity!: number;
  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  idempotencyKey!: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
