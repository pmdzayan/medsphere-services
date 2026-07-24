import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AUDIT_EVENT_TYPES, AuditEventType } from '../audit.constants';

export class AuditEventQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_EVENT_TYPES })
  @IsOptional()
  @IsIn(AUDIT_EVENT_TYPES)
  eventType?: AuditEventType;

  @ApiPropertyOptional({ enum: ['SUCCEEDED', 'DENIED', 'FAILED'] })
  @IsOptional()
  @IsIn(['SUCCEEDED', 'DENIED', 'FAILED'])
  outcome?: 'SUCCEEDED' | 'DENIED' | 'FAILED';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  actorMembershipId?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resourceId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
