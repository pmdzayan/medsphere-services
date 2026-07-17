import {
  IsString,
  IsOptional,
  IsEnum,
  IsEmail,
  IsNumber,
  Min,
  Max,
  MinLength,
} from 'class-validator';

export enum ProviderType {
  PHARMACY = 'PHARMACY',
  HOSPITAL = 'HOSPITAL',
}

export class UpdateProviderDto {
  @IsEnum(ProviderType)
  @IsOptional()
  providerType?: ProviderType;

  @IsString()
  @IsOptional()
  @MinLength(2)
  businessName?: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  ownerName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  postalCode?: string;

  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
