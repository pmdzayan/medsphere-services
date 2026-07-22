import { IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsUUID, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationProviderType } from '../enums';

export class CreateConfigDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ enum: NotificationChannel, description: 'Delivery channel' })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({
    enum: NotificationProviderType,
    description: 'Provider type for this channel',
  })
  @IsEnum(NotificationProviderType)
  provider!: NotificationProviderType;

  @ApiProperty({
    description: 'Encrypted API keys, tokens, or SMTP credentials',
    type: Object,
  })
  @IsObject()
  credentials!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Whether this is the default config for the channel',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Whether the config is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
