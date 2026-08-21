import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicMedicineSearchQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'paracetamol' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  q!: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  offset = 0;
}
