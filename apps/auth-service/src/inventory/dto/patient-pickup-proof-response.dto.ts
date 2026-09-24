import { ApiProperty } from '@nestjs/swagger';

export class PatientPickupProofResponseDto {
  @ApiProperty({ format: 'uuid' })
  reservationId!: string;

  @ApiProperty({
    description: 'One-time pickup proof. Returned only in this response and never persisted in plaintext.',
    minLength: 32,
    maxLength: 32,
  })
  pickupToken!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ minimum: 1 })
  proofVersion!: number;
}
