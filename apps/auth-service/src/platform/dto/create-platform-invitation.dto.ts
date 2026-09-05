import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  INVITATION_GRANTABLE_ROLE_KEYS,
  MAX_PLATFORM_INVITATION_TTL_DAYS,
  PlatformRoleKey,
} from '../platform.constants';
import { normalizeAuthenticationLocator } from '../../auth/auth-normalization';

type GrantableInvitationRoleKey = (typeof INVITATION_GRANTABLE_ROLE_KEYS)[number];

export class CreatePlatformInvitationDto {
  @ApiProperty({ example: 'admin@aim.example', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  targetEmail!: string;

  @ApiProperty({ enum: INVITATION_GRANTABLE_ROLE_KEYS })
  @IsIn(INVITATION_GRANTABLE_ROLE_KEYS)
  roleKey!: GrantableInvitationRoleKey;

  @ApiPropertyOptional({
    description: 'Invitation validity window in days (default 7, maximum 30)',
    default: 7,
    minimum: 1,
    maximum: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PLATFORM_INVITATION_TTL_DAYS)
  ttlDays? = 7;
}

export class CreateInvitationResponseDto {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ enum: INVITATION_GRANTABLE_ROLE_KEYS })
  roleKey!: PlatformRoleKey;

  @ApiProperty({
    description:
      'One-time plaintext invitation proof. Returned exactly once to the authorized creator and never persisted.',
  })
  invitationToken!: string;

  @ApiProperty({ example: '2026-09-12T00:00:00.000Z' })
  expiresAt!: string;
}
