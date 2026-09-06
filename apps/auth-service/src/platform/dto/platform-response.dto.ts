import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformRoleKey } from '../platform.constants';

export class PlatformUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  platformAccountId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class PlatformLoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: PlatformUserResponseDto })
  user!: PlatformUserResponseDto;

  @ApiProperty({ type: [String], example: ['platform.administration.read'] })
  permissions!: string[];
}

export class PlatformIdentityResponseDto {
  @ApiProperty({ format: 'uuid' })
  platformAccountId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ type: [String], enum: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] })
  roles!: ReadonlyArray<PlatformRoleKey>;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class PlatformAdminSummaryDto {
  @ApiProperty({ format: 'uuid' })
  platformAccountId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  status!: 'ACTIVE' | 'SUSPENDED';

  @ApiProperty({ type: [String], enum: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] })
  roles!: ReadonlyArray<PlatformRoleKey>;

  @ApiProperty()
  createdAt!: string;
}

export class PlatformAdminListResponseDto {
  @ApiProperty({ type: [PlatformAdminSummaryDto] })
  data!: ReadonlyArray<PlatformAdminSummaryDto>;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ example: 50 })
  limit!: number;
}

export class PlatformInvitationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  invitationId!: string;

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  status!: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

  @ApiProperty({ enum: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] })
  roleKey!: PlatformRoleKey;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty({ nullable: true, format: 'date-time' })
  acceptedAt!: string | null;
}

export class PlatformInvitationListResponseDto {
  @ApiProperty({ type: [PlatformInvitationSummaryDto] })
  data!: ReadonlyArray<PlatformInvitationSummaryDto>;

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ example: 50 })
  limit!: number;
}

export class PlatformAdminActionResponseDto {
  @ApiProperty({ format: 'uuid' })
  platformAccountId!: string;

  @ApiProperty()
  status!: 'ACTIVE' | 'SUSPENDED';

  @ApiPropertyOptional({ example: 2 })
  revokedSessionCount?: number;
}

export class PlatformRevokeSessionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  platformAccountId!: string;

  @ApiProperty({ example: 2 })
  revokedSessionCount!: number;
}

export class PlatformLogoutResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message!: string;
}
