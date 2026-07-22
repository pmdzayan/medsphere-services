import { IsString, IsOptional, IsEnum, IsBoolean, IsArray, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '../enums';

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: 'Template code' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: NotificationChannel, description: 'Delivery channel' })
  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @ApiPropertyOptional({ description: 'Email/Push subject line' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Template body with {{placeholders}}' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({
    description: 'List of allowed variable keys',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @ApiPropertyOptional({ description: 'Whether the template is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
