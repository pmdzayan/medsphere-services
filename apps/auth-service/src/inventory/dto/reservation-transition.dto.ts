import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProviderReservationTransition } from '../reservation.types';

const PROVIDER_TRANSITIONS: readonly ProviderReservationTransition[] = [
  'CONFIRM',
  'READY',
  'COMPLETE',
  'CANCEL',
];

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class TransitionProviderReservationDto {
  @ApiProperty({ enum: PROVIDER_TRANSITIONS })
  @IsIn(PROVIDER_TRANSITIONS)
  transition!: ProviderReservationTransition;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  idempotencyKey!: string;
}
