import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const NEAR_EXPIRY_HORIZONS = [7, 30, 60, 90] as const;

/**
 * Candidate Task 0038 (PROVISIONAL). Explicit whitelist -- the global
 * ValidationPipe (whitelist: true, forbidNonWhitelisted: true) already
 * strips/rejects any property not declared here.
 */
export class InventoryAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Bounded near-expiry horizon in days',
    default: 30,
    enum: NEAR_EXPIRY_HORIZONS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(NEAR_EXPIRY_HORIZONS)
  nearExpiryHorizonDays: (typeof NEAR_EXPIRY_HORIZONS)[number] = 30;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  attentionItemLimit = 20;
}

export { NEAR_EXPIRY_HORIZONS };
