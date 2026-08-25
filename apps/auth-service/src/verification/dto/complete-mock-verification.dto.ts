import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizeAuthenticationLocator } from '../../auth/auth-normalization';
import { ACCOUNT_VERIFICATION_METHODS } from '../verification.types';

export class CompleteMockVerificationDto {
  @ApiProperty({ example: 'central-pharmacy', maxLength: 100 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  tenantSlug!: string;

  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ACCOUNT_VERIFICATION_METHODS })
  @IsIn(ACCOUNT_VERIFICATION_METHODS)
  method!: (typeof ACCOUNT_VERIFICATION_METHODS)[number];

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  idempotencyKey!: string;

  @ApiProperty({ description: 'Synthetic test-provider decision only.' })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({
    description: 'Required only for a successful AGE verification result.',
  })
  @IsOptional()
  @IsBoolean()
  ageVerified18Plus?: boolean;

  @ApiPropertyOptional({
    description:
      'Opaque provider reference. Never submit Aadhaar numbers, OTPs, biometrics, or document images.',
    maxLength: 240,
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  providerReference?: string;
}
