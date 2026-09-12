import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const PATIENT_RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export class PatientReservationQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  offset = 0;

  @ApiPropertyOptional({ enum: PATIENT_RESERVATION_STATUSES })
  @IsOptional()
  @IsIn(PATIENT_RESERVATION_STATUSES)
  status?: (typeof PATIENT_RESERVATION_STATUSES)[number];
}
