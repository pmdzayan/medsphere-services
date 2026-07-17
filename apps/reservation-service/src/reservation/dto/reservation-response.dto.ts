import { ReservationType } from '../enums/reservation-type.enum';
import { ReservationStatus } from '../enums/reservation-status.enum';

export class ReservationResponseDto {
  id!: string;
  userId!: string;
  providerId!: string;
  reservationType!: ReservationType;
  status!: ReservationStatus;
  scheduledAt!: string;
  notes?: string;
  createdAt!: string;
  updatedAt!: string;
}
