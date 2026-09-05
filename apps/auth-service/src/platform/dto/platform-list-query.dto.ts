import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MAX_PLATFORM_ADMIN_PAGE_SIZE } from '../platform.constants';

export class PlatformAdminListQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: MAX_PLATFORM_ADMIN_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PLATFORM_ADMIN_PAGE_SIZE)
  limit = 50;

  @ApiPropertyOptional({ description: 'Opaque deterministic cursor from the previous page' })
  @IsOptional()
  @MaxLength(1024)
  cursor?: string;
}

export class PlatformListQueryDto extends PlatformAdminListQueryDto {}

export class PlatformInvitationListQueryDto {
  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ description: 'Opaque deterministic cursor from the previous page' })
  @IsOptional()
  @MaxLength(1024)
  cursor?: string;
}
