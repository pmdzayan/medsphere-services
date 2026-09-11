import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ConfigureAvailabilityRequestPreferenceDto {
  @ApiProperty({
    description:
      'Explicit pharmacy opt-in. False prevents creation of new live availability requests.',
  })
  @IsBoolean()
  liveRequestsEnabled!: boolean;

  @ApiProperty({
    example: 'Asia/Kolkata',
    minLength: 1,
    maxLength: 64,
    description: 'IANA timezone used to evaluate pharmacy quiet hours.',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  timezone!: string;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: 1439,
    description:
      'Quiet-hours start as minutes after local midnight. Supply both quiet-hour boundaries or neither.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursStartMinute?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 0,
    maximum: 1439,
    description:
      'Quiet-hours end as minutes after local midnight. Supply both quiet-hour boundaries or neither.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  quietHoursEndMinute?: number | null;
}

export class AvailabilityRequestPreferenceResponseDto {
  @ApiProperty({
    description: 'False means no preference row exists and live requests therefore fail closed.',
  })
  configured!: boolean;

  @ApiProperty()
  liveRequestsEnabled!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Asia/Kolkata',
  })
  timezone!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 0,
    maximum: 1439,
  })
  quietHoursStartMinute!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 0,
    maximum: 1439,
  })
  quietHoursEndMinute!: number | null;
}
