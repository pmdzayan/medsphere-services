import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RecordDamagedStockDto {
  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  expectedVersion!: number;

  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
