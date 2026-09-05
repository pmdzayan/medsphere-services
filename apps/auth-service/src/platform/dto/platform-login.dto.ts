import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { normalizeAuthenticationLocator } from '../../auth/auth-normalization';

/**
 * Platform login has NO tenant slug and NO organization selection: platform
 * authority comes only from the global identity + active platform access.
 */
export class PlatformLoginDto {
  @ApiProperty({ example: 'admin@aim.example', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password!: string;
}

export class PlatformGoogleLoginDto {
  @ApiProperty({ maxLength: 10000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  idToken!: string;
}

export class PlatformInvitationAcceptDto {
  @ApiProperty({ description: 'One-time invitation proof' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  invitationToken!: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  googleIdToken?: string;

  @ApiPropertyOptional({ description: 'Verified email for the password path', maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ minLength: 15, maxLength: 128, format: 'password' })
  @IsOptional()
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password?: string;
}

export class PlatformRefreshDto {
  @ApiProperty({ description: 'Platform refresh credential (psr.prefixed)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^psr\.[A-Za-z0-9._-]+$/)
  refreshToken!: string;
}
