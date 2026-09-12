import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Task 0034 - Patient-initiated cancellation DTO.
 *
 * Version + idempotency anchor mirror the accepted staff lifecycle
 * contract. Ownership of the targeted reservation is enforced server-side
 * from the authenticated global identity; this DTO carries no userId.
 */
export class CancelPatientReservationDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^\S(?:.*\S)?$/)
  idempotencyKey!: string;
}
