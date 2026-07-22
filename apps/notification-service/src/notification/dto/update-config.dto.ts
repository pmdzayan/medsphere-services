import { IsString, IsOptional, IsEnum, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationProviderType } from '../enums';

export class UpdateConfigDto {
  @ApiPropertyOptional({ enum: NotificationChannel, description: 'Delivery channel' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({
    enum: NotificationProviderType,
    description: 'Provider type for this channel',
  })
  @IsOptional()
  @IsEnum(NotificationProviderType)
  provider?: NotificationProviderType;

  @ApiPropertyOptional({
    description: 'Encrypted API keys, tokens, or SMTP credentials',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Whether this is the default config for the channel' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Whether the config is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
