import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { normalizeAuthenticationLocator } from '../../../auth/auth-normalization';

export class RequestPhoneOtpDto {
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
  @IsString()
  @MaxLength(254)
  email!: string;
}
