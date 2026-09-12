import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Task 0034 - Patient medicine search response DTOs.
 *
 * Patient-safe presentation ONLY. Deliberately excludes: tenantId,
 * membershipId, subjectUserId, internal actor IDs, batch records, allocation
 * rows, heldQuantity, raw inventory rows, internal evidence rows, private
 * provider settings, audit metadata, tokens and credentials.
 *
 * Availability comes from the accepted Task 0025 trust evaluation combined
 * with Task 0026 live pharmacist evidence (never a raw quantity test), so a
 * stale or unknown state can never masquerade as confidently available.
 */
export type PatientAvailabilityState =
  'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN';

export class PatientMedicineSearchResultDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty()
  providerName!: string;

  @ApiProperty()
  providerCity!: string;

  @ApiProperty()
  providerState!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  genericName!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  strength!: string;

  @ApiProperty()
  dosageForm!: string;

  @ApiProperty()
  requiresPrescription!: boolean;

  @ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE', 'CONFIRMATION_REQUIRED', 'UNKNOWN'] })
  availability!: PatientAvailabilityState;

  @ApiPropertyOptional({ enum: ['PHARMACY_CONFIRMED'], nullable: true })
  confirmationSource!: 'PHARMACY_CONFIRMED' | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  confirmedAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  requestId!: string | null;

  @ApiPropertyOptional({ enum: ['NONE', 'PENDING', 'RESPONDED', 'EXPIRED'], nullable: true })
  requestStatus!: 'NONE' | 'PENDING' | 'RESPONDED' | 'EXPIRED';

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  requestedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  retryAfterAt!: Date | null;

  @ApiPropertyOptional({ description: 'Only present for one-shot precise location searches' })
  distanceKm!: number | null;
}

export class PatientMedicineSearchResponseDto {
  @ApiProperty({ type: PatientMedicineSearchResultDto, isArray: true })
  data!: PatientMedicineSearchResultDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;

  @ApiPropertyOptional({ description: 'Present when a precise-coordinate search was requested' })
  radiusKm!: number | null;

  @ApiPropertyOptional({
    description: 'Present when an area-mode (city/state) search was requested',
  })
  area!: { city: string; state: string } | null;
}
