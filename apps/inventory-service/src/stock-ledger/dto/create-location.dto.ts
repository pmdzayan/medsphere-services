import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { LocationType } from '../enums';

export class CreateLocationDto {
  @IsString()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsEnum(LocationType)
  type!: LocationType;

  @IsOptional()
  @IsBoolean()
  isStorage?: boolean;
}
