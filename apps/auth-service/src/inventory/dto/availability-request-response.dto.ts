import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PHARMACIST_CONFIRMATION_OUTCOMES } from '../availability-request.types';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Operational availability-request queue query. Bounded: no unbounded
 * findMany; the maximum page size is hard-capped server-side as well.
 */
export class AvailabilityRequestQueueQueryDto {
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset = 0;
}

/**
 * Pharmacist response body. Strict whitelist via the global validation pipe:
 * outcome + idempotencyKey + expectedVersion required; retryAfterMinutes
 * optional and only meaningful for CHECK_LATER (backend rejects it otherwise).
 * Tenant/actor/provider identity are never accepted here.
 */
export class RespondAvailabilityRequestDto {
  @ApiProperty({ enum: PHARMACIST_CONFIRMATION_OUTCOMES })
  @IsIn(PHARMACIST_CONFIRMATION_OUTCOMES)
  outcome!: (typeof PHARMACIST_CONFIRMATION_OUTCOMES)[number];

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ minimum: 5, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  retryAfterMinutes?: number;
}

export class AvailabilityResponseResultDto {
  @ApiProperty({ format: 'uuid' })
  requestId!: string;

  @ApiProperty({ enum: PHARMACIST_CONFIRMATION_OUTCOMES })
  outcome!: (typeof PHARMACIST_CONFIRMATION_OUTCOMES)[number];

  @ApiProperty({ format: 'date-time' })
  confirmedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  validUntil!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  retryAfterAt!: Date | null;

  @ApiProperty()
  replayed!: boolean;
}

export class AvailabilityRequestQueueRowDto {
  @ApiProperty({ format: 'uuid' }) requestId!: string;
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiPropertyOptional({ nullable: true }) genericName!: string | null;
  @ApiProperty() brand!: string;
  @ApiProperty() strength!: string;
  @ApiProperty() dosageForm!: string;
  @ApiProperty({ enum: ['PENDING', 'RESPONDED', 'EXPIRED'] })
  status!: 'PENDING' | 'RESPONDED' | 'EXPIRED';
  @ApiProperty({ format: 'date-time' }) requestedAt!: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ minimum: 1 }) version!: number;
}

export class AvailabilityRequestQueueResponseDto {
  @ApiProperty({ type: [AvailabilityRequestQueueRowDto] })
  data!: AvailabilityRequestQueueRowDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
