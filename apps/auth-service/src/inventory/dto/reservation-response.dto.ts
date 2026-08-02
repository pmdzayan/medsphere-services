import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export class ProviderReservationAllocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  batchId!: string;

  @ApiProperty()
  batchNumber!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ enum: ['HELD', 'CONSUMED', 'RELEASED'] })
  status!: 'HELD' | 'CONSUMED' | 'RELEASED';
}

export class ProviderReservationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  genericName!: string | null;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ type: [ProviderReservationAllocationResponseDto] })
  allocations!: ProviderReservationAllocationResponseDto[];
}

export class ProviderReservationResponseDto {
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

  @ApiProperty({ type: [ProviderReservationItemResponseDto] })
  items!: ProviderReservationItemResponseDto[];

  @ApiProperty()
  totalQuantity!: number;
}

export class ProviderReservationListResponseDto {
  @ApiProperty({ type: [ProviderReservationResponseDto] })
  data!: ProviderReservationResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  offset!: number;
}

export class ProviderReservationTransitionResponseDto {
  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({ enum: ['CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'] })
  status!: 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty()
  totalQuantity!: number;

  @ApiProperty()
  replayed!: boolean;
}
