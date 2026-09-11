import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Task 0028 - Privacy-safe live demand analytics query contract.
 *
 * The provider-scoped analytics read accepts exactly TWO bounded query
 * parameters and nothing else. `days` bounds the evaluated time window and
 * `limit` bounds the deterministic product result list. Both are optional with
 * fail-closed server defaults; the global strict whitelist validation pipe
 * rejects any other query key.
 *
 * No date range, no cursor, no patient/requester identifiers, no free-form
 * filters are ever accepted here. `from`/`to` are always derived server-side
 */

export const AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS = 7;
export const AVAILABILITY_REQUEST_DEMAND_MIN_DAYS = 1;
export const AVAILABILITY_REQUEST_DEMAND_MAX_DAYS = 90;

export const AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT = 25;
export const AVAILABILITY_REQUEST_DEMAND_MIN_LIMIT = 1;
export const AVAILABILITY_REQUEST_DEMAND_MAX_LIMIT = 100;

export class AvailabilityRequestDemandQueryDto {
  @ApiPropertyOptional({
    default: AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(AVAILABILITY_REQUEST_DEMAND_MIN_DAYS)
  @Max(AVAILABILITY_REQUEST_DEMAND_MAX_DAYS)
  days = AVAILABILITY_REQUEST_DEMAND_DEFAULT_DAYS;

  @ApiPropertyOptional({
    default: AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(AVAILABILITY_REQUEST_DEMAND_MIN_LIMIT)
  @Max(AVAILABILITY_REQUEST_DEMAND_MAX_LIMIT)
  limit = AVAILABILITY_REQUEST_DEMAND_DEFAULT_LIMIT;
}

/**
 * Deterministic bounded date window returned to the caller. `from`/`to` are
 * ISO-8601 strings (UTC) derived server-side; `days` is the resolved window
 * length that produced them. Individual request timestamps are never exposed.
 */
export class AvailabilityRequestDemandWindowDto {
  @ApiProperty({ format: 'date-time', description: 'ISO-8601 UTC window start (inclusive)' })
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'ISO-8601 UTC window end (exclusive)' })
  to!: string;

  @ApiProperty({ minimum: 1, maximum: 90 })
  days!: number;
}

export class AvailabilityRequestDemandTotalsDto {
  @ApiProperty({
    description:
      'Number of durable AvailabilityRequest rows created/requested in the window for the provider. ' +
      'Not a unique-patient count and not a public-search count.',
  })
  liveRequestCount!: number;

  @ApiProperty() pendingCount!: number;
  @ApiProperty() respondedCount!: number;
  @ApiProperty() expiredCount!: number;
}

export class AvailabilityRequestDemandProductDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty() name!: string;
  @ApiProperty() strength!: string;
  @ApiProperty({ description: 'Accepted DosageForm display value' })
  dosageForm!: string;
  @ApiProperty() manufacturer!: string;

  @ApiProperty() liveRequestCount!: number;
  @ApiProperty() pendingCount!: number;
  @ApiProperty() respondedCount!: number;
  @ApiProperty() expiredCount!: number;

  @ApiProperty() availableCount!: number;
  @ApiProperty() unavailableCount!: number;
  @ApiProperty() checkLaterCount!: number;
}

export class AvailabilityRequestDemandResponseDto {
  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ type: AvailabilityRequestDemandWindowDto })
  window!: AvailabilityRequestDemandWindowDto;

  @ApiProperty({ type: AvailabilityRequestDemandTotalsDto })
  totals!: AvailabilityRequestDemandTotalsDto;

  @ApiProperty({ type: [AvailabilityRequestDemandProductDto] })
  products!: AvailabilityRequestDemandProductDto[];
}
