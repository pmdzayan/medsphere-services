import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const LOCK_REASONS = ['manual', 'walked-away'] as const;

export class LockSessionDto {
  @ApiProperty({ enum: LOCK_REASONS, default: 'manual', maxLength: 40 })
  @IsString()
  @MaxLength(40)
  @IsIn(LOCK_REASONS)
  reason!: 'manual' | 'walked-away';
}
