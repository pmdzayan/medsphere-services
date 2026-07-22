import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel } from '../enums';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiProperty({
    description: 'Unique template identifier (e.g., "RX_SUBMITTED_PATIENT")',
    example: 'RX_SUBMITTED_PATIENT',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ enum: NotificationChannel, description: 'Delivery channel' })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiPropertyOptional({ description: 'Email/Push subject line' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({
    description: 'Template body with {{placeholders}}',
    example: 'Hello {{patientName}}, your prescription {{rxNumber}} has been submitted.',
  })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({
    description: 'List of allowed variable keys',
    example: ['patientName', 'rxNumber'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  variables!: string[];

  @ApiPropertyOptional({ description: 'Whether the template is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
