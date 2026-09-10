import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AvailabilityRequestState,
  PublicAvailabilityState,
  PublicConfirmationSource,
} from '../availability-request.types';

/**
 * Task 0026 - Public (patient-facing) availability request DTOs.
 *
 * The create endpoint accepts NO body keys: the global validation pipe
 * combines `whitelist` + `forbidNonWhitelisted`, so an empty DTO class makes
 * any payload rejected. The patient only supplies opaque provider + product
 * path identifiers; tenant, patient identity, contact information, quantity,
 * batch, inventory, and staff context are never accepted.
 *
 * Public responses contain ONLY the minimized safe fields enumerated here:
 * request id + state, timestamps, coarse availability state, coarse
 * confirmation source. Never tenant/inventory/batch/quantity/staff/audit ids.
 */
export class CreatePublicAvailabilityRequestDto {
  // Deliberately empty: server derives everything from path + server state.
}

export class PublicAvailabilityRequestResponseDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  requestId!: string | null;

  @ApiProperty({ enum: ['NONE', 'PENDING', 'RESPONDED', 'EXPIRED'] })
  requestStatus!: 'NONE' | AvailabilityRequestState;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  requestedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  respondedAt!: Date | null;

  @ApiProperty({ enum: ['AVAILABLE', 'UNAVAILABLE', 'CONFIRMATION_REQUIRED', 'UNKNOWN'] })
  availabilityState!: PublicAvailabilityState;

  @ApiPropertyOptional({ enum: ['PHARMACY_CONFIRMED'], nullable: true })
  confirmationSource!: PublicConfirmationSource | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  confirmedAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  retryAfterAt!: Date | null;
}
