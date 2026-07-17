import { IsString, IsNotEmpty, IsEnum, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { ReservationType } from '../enums/reservation-type.enum';

export class CreateReservationDto {
  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsEnum(ReservationType)
  @IsNotEmpty()
  reservationType!: ReservationType;

  @IsDateString()
  @IsNotEmpty()
  scheduledAt!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
