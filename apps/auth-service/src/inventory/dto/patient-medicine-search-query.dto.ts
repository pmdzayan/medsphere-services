import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Task 0034 - Patient medicine search query DTO.
 *
 * Deliberately NO userId / subjectUserId / tenantId / membershipId fields:
 * the patient's identity comes exclusively from the authenticated access
 * token. The patient supplies only the bounded search term and an optional
 * single location mode:
 *
 * - manual area fallback: optional `city` / `state` (no browser permission,
 *   no precise coordinates, no distance claim), or
 * - one-shot precise: `latitude` + `longitude` (+ optional `radiusKm`), used
 *   only after an explicit consent-bearing user action in the client.
 *
 * Mixing modes is rejected by the service (fail closed). Every value is
 * bounded; pagination is a safe integer pair.
 */
export class PatientMedicineSearchQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 120, example: 'paracetamol' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  q!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  city?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  state?: string;

  @ApiPropertyOptional({ example: 12.9716 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 77.5946 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  radiusKm?: number;

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
