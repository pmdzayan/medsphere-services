import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ProviderReservationStatus = (typeof RESERVATION_STATUSES)[number];

export class ProviderReservationQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset = 0;

  @ApiPropertyOptional({ enum: RESERVATION_STATUSES })
  @IsOptional()
  @IsIn(RESERVATION_STATUSES)
  status?: ProviderReservationStatus;
}
