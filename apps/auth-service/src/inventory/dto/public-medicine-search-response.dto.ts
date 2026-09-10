import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Task 0026 - Public medicine search availability states.
 *
 * These replace the previous coarse IN_STOCK/OUT_OF_STOCK pair so a public
 * result can never present stale or unknown evidence as confidently
 * available. States map to the accepted Task 0025 trust evaluation plus the
 * Task 0026 live pharmacist-confirmation signal:
 * - AVAILABLE             (fresh evidence, or pharmacy-confirmed)
 * - UNAVAILABLE           (confirmed unavailable)
 * - CONFIRMATION_REQUIRED (stale evidence, or CHECK_LATER waiting window)
 * - UNKNOWN               (no trustworthy evidence)
 *
 * `confirmationSource`, `confirmedAt`, `requestId`, `requestStatus`,
 * `requestedAt`, `expiresAt` and `retryAfterAt` are optional and only
 * populated when live pharmacist evidence / an active request exists. They
 * are still minimized: never tenant/inventory/batch/quantity/staff/audit ids.
 */
export type PublicAvailabilityState =
  'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN';

export class PublicMedicineSearchResultDto {
  @ApiProperty({ format: 'uuid', description: 'Opaque product reference' })
  productId!: string;

  @ApiProperty({ format: 'uuid', description: 'Opaque provider reference' })
  providerId!: string;

  @ApiProperty()
  providerName!: string;

  @ApiProperty()
  providerCity!: string;

  @ApiProperty()
  providerState!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false, nullable: true })
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
  availability!: PublicAvailabilityState;

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
}

export class PublicMedicineSearchResponseDto {
  @ApiProperty({ type: PublicMedicineSearchResultDto, isArray: true })
  data!: PublicMedicineSearchResultDto[];

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}
