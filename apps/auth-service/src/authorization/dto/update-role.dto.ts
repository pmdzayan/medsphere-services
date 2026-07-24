import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_KEYS, PermissionKey } from '../permission.constants';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateRoleDto {
  @ApiPropertyOptional({
    example: 'PHARMACY_MANAGER',
    minLength: 3,
    maxLength: 64,
    pattern: '^[A-Z][A-Z0-9_]{2,63}$',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Z][A-Z0-9_]{2,63}$/)
  name?: string;

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({
    enum: PERMISSION_KEYS,
    isArray: true,
    maxItems: PERMISSION_KEYS.length,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @IsIn(PERMISSION_KEYS, { each: true })
  permissionKeys?: PermissionKey[];
}
