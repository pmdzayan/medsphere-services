import { ApiProperty } from '@nestjs/swagger';

export class ProviderReservationCreationResponseDto {
  @ApiProperty({ format: 'uuid' }) reservationId!: string;
  @ApiProperty({ enum: ['PENDING'] }) status!: 'PENDING';
  @ApiProperty({ minimum: 1 }) version!: number;
  @ApiProperty({ minimum: 1, maximum: 20 }) itemCount!: number;
  @ApiProperty({ minimum: 1 }) totalQuantity!: number;
  @ApiProperty() replayed!: boolean;
}
