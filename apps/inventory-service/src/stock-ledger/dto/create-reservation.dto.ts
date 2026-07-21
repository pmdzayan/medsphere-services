import { IsString, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  tenantId!: string;

  @IsString()
  locationId!: string;

  @IsString()
  productId!: string;

  @IsString()
  batchId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsDateString()
  expiresAt!: string;

  @IsString()
  referenceId!: string;
}
