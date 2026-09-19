import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 50;

/**
 * Explicit whitelist -- the global
 * ValidationPipe (whitelist: true, forbidNonWhitelisted: true) already
 * strips/rejects any property not declared here, including any
 * attempt to submit recipientUserId or any other server-managed
 * field.
 */
export class ListPatientTimelineQueryDto {
  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: LIST_MAX_LIMIT, default: LIST_DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  limit: number = LIST_DEFAULT_LIMIT;
}

export class GetPatientTimelineEventParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  timelineEventId!: string;
}

export class PatientTimelineEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  eventType!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ enum: ['NONE', 'RESERVATION', 'APPOINTMENT', 'SETTINGS'] })
  destinationType!: string;

  @ApiProperty({ nullable: true })
  destinationId!: string | null;

  @ApiProperty({ format: 'date-time' })
  occurredAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ListPatientTimelineResponseDto {
  @ApiProperty({ type: [PatientTimelineEventResponseDto] })
  items!: PatientTimelineEventResponseDto[];

  @ApiProperty({
    nullable: true,
    description: 'Opaque cursor for the next page, or null if no more pages',
  })
  nextCursor!: string | null;
}

export { LIST_DEFAULT_LIMIT };
