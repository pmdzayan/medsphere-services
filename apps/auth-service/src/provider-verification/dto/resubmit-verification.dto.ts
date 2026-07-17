import { IsString, IsNotEmpty, IsEnum, IsDateString, IsOptional } from 'class-validator';

export enum ProviderType {
  PHARMACY = 'PHARMACY',
  HOSPITAL = 'HOSPITAL',
}

export class ResubmitVerificationDto {
  @IsString()
  @IsNotEmpty()
  verificationId!: string;

  @IsEnum(ProviderType)
  @IsOptional()
  providerType?: ProviderType;

  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsDateString()
  @IsOptional()
  licenseExpiryDate?: string;

  @IsString()
  @IsOptional()
  businessRegistrationNumber?: string;

  @IsString()
  @IsOptional()
  governmentIdReference?: string;
}
