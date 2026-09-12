import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ENABLED_UI_LANGUAGES } from '@medsphere/i18n';

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

  @ApiPropertyOptional({ enum: ENABLED_UI_LANGUAGES })
  @IsOptional()
  @IsIn(ENABLED_UI_LANGUAGES as unknown as string[], {
    message: `preferredLanguage must be one of: ${ENABLED_UI_LANGUAGES.join(', ')}`,
  })
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
