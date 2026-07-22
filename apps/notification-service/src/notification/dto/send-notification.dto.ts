import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '../enums';

export class SendNotificationDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({ enum: NotificationChannel, description: 'Delivery channel' })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty({ description: 'Recipient address (email, phone, or device token)' })
  @IsString()
  @IsNotEmpty()
  recipient!: string;

  @ApiPropertyOptional({ description: 'Subject line for Email/Push' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: 'Message body' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ description: 'User ID associated with this notification' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Correlation ID for tracing' })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Additional metadata', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
