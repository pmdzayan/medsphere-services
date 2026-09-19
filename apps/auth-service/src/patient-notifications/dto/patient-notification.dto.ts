import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PATIENT_NOTIFICATION_CATEGORIES = [
  'ACCOUNT',
  'SECURITY',
  'RESERVATION',
  'APPOINTMENT',
  'SYSTEM',
] as const;
const PATIENT_NOTIFICATION_DESTINATION_TYPES = [
  'NONE',
  'RESERVATION',
  'APPOINTMENT',
  'SETTINGS',
] as const;

const LIST_DEFAULT_LIMIT = 20;
const LIST_MAX_LIMIT = 50;

/**
 * Strict boolean transform for a query-string parameter: unlike
 * @Type(() => Boolean) (which follows plain-JS Boolean() coercion,
 * where ANY non-empty string -- including "false" -- becomes true),
 * this accepts only the exact literal strings "true"/"false" (or an
 * already-boolean value from a non-HTTP caller), passes an omitted
 * value through untouched, and maps anything else to a sentinel that
 * @IsBoolean() will reject with a 400 -- an arbitrary string can never
 * silently resolve to true.
 */
function strictOptionalBoolean() {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Symbol('invalid-boolean');
  });
}

/**
 * Explicit whitelist: the global
 * ValidationPipe (whitelist: true, forbidNonWhitelisted: true; see
 * app.bootstrap.ts) already strips/rejects any property not declared
 * here, including any attempt to submit recipientUserId or any other
 * server-managed field.
 */
export class ListPatientNotificationsQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter to unread notifications only' })
  @IsOptional()
  @strictOptionalBoolean()
  @IsBoolean()
  unreadOnly?: boolean;
}

export class MarkNotificationReadParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  notificationId!: string;
}

export class PatientNotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: PATIENT_NOTIFICATION_CATEGORIES })
  category!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: PATIENT_NOTIFICATION_DESTINATION_TYPES })
  destinationType!: string;

  @ApiProperty({ nullable: true })
  destinationId!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  readAt!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class ListPatientNotificationsResponseDto {
  @ApiProperty({ type: [PatientNotificationResponseDto] })
  items!: PatientNotificationResponseDto[];

  @ApiProperty({
    nullable: true,
    description: 'Opaque cursor for the next page, or null if no more pages',
  })
  nextCursor!: string | null;

  @ApiProperty()
  unreadCount!: number;
}

export {
  PATIENT_NOTIFICATION_CATEGORIES,
  PATIENT_NOTIFICATION_DESTINATION_TYPES,
  LIST_DEFAULT_LIMIT,
};
