import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { normalizeAuthenticationLocator } from '../auth-normalization';
import { normalizePhoneNumber } from '../../verification/otp/phone-normalization';

export class GoogleRegisterDto {
  @ApiProperty({ example: 'central-pharmacy', maxLength: 100 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  tenantSlug!: string;

  @ApiProperty({ example: '+919876543210', maxLength: 20 })
  @Transform(({ value }) => (typeof value === 'string' ? normalizePhoneNumber(value) : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ maxLength: 10000, description: 'Google ID token' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  idToken!: string;

  @ApiProperty({ example: 'Asha', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Sharma', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;
}
