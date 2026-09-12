import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

/**
 * Task 0034 - Patient-safe reservation response DTOs.
 *
 * Patient-appropriate presentation only. These projections deliberately
 * exclude batch identifiers, allocation rows, held quantities, internal
 * evidence rows, provider tenant identifiers, and provider configuration.
 */
export class PatientReservationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  genericName!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  strength!: string;

  @ApiProperty()
  dosageForm!: string;

  @ApiProperty({ minimum: 1 })
  quantity!: number;
}

export class PatientReservationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RESERVATION_STATUSES })
  status!: (typeof RESERVATION_STATUSES)[number];

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiredAt!: Date | null;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty()
  providerName!: string;

  @ApiProperty()
  providerCity!: string;

  @ApiProperty()
  providerState!: string;

  @ApiProperty({ type: [PatientReservationItemResponseDto] })
  items!: PatientReservationItemResponseDto[];

  @ApiProperty({ minimum: 1 })
  totalQuantity!: number;
}

export class PatientReservationListResponseDto {
  @ApiProperty({ type: [PatientReservationResponseDto] })
  data!: PatientReservationResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

export class PatientReservationCreationResponseDto {
  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ enum: ['PENDING'] })
  status!: 'PENDING';

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ minimum: 1 })
  itemCount!: number;

  @ApiProperty({ minimum: 1 })
  totalQuantity!: number;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty()
  replayed!: boolean;
}

export class PatientReservationCancellationResponseDto {
  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ enum: ['CANCELLED'] })
  status!: 'CANCELLED';

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ minimum: 1 })
  totalQuantity!: number;

  @ApiProperty()
  replayed!: boolean;
}
