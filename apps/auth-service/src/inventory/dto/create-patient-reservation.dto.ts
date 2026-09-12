import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Task 0034 - Patient reservation create DTO.
 *
 * Deliberately NO userId / subjectUserId / tenantId / membershipId fields.
 * Ownership is derived from the authenticated access token via
 * CurrentIdentity. The patient supplies only the provider path reference,
 * the bounded item list, an optional bounded expiry, and an idempotency key.
 */
export class CreatePatientReservationItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreatePatientReservationDto {
  @ApiProperty({ type: [CreatePatientReservationItemDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreatePatientReservationItemDto)
  items!: CreatePatientReservationItemDto[];

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Optional reservation expiry. Must be in the future within the accepted bounded policy (default 24h, maximum 72h from server time).',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^\S(?:.*\S)?$/)
  idempotencyKey!: string;
}
