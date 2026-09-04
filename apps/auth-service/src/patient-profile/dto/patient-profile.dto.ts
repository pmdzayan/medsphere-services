import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors the existing accepted supported-language list (see
 * apps/web/src/lib/i18n.ts localeOptions) -- kept as a small, explicit
 * constant here rather than importing across the frontend/backend
 * boundary. Documented in the candidate integration doc as a
 * reconciliation point if the canonical list moves to a shared
 * package.
 */
export const SUPPORTED_LANGUAGE_CODES = ['en', 'ta', 'ur'] as const;

/**
 * Candidate Task 0032 (pre-0031): the smallest useful self-service
 * patient profile, deliberately reusing the existing canonical User
 * and UserPrivacy fields rather than inventing a parallel identity
 * model. Every field here already exists on an accepted model --
 * this DTO only narrows what the PATIENT MAY MUTATE about their own
 * global identity (never a server-managed field: email, password,
 * verification status, membership, or tenant context are never
 * exposed here for writing).
 */
export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGE_CODES })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGE_CODES)
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wantsReservationNotifications?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideSensitiveNotifications?: boolean;
}

export class PatientProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  phoneVerified!: boolean;

  @ApiProperty()
  preferredLanguage!: string;

  @ApiProperty()
  wantsReservationNotifications!: boolean;

  @ApiProperty()
  hideSensitiveNotifications!: boolean;
}
