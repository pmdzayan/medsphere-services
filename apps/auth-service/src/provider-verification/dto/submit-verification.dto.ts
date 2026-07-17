import { IsString, IsNotEmpty, IsEnum, IsDateString } from 'class-validator';

export enum ProviderType {
  PHARMACY = 'PHARMACY',
  HOSPITAL = 'HOSPITAL',
}

export class SubmitVerificationDto {
  @IsEnum(ProviderType)
  @IsNotEmpty()
  providerType!: ProviderType;

  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;

  @IsDateString()
  @IsNotEmpty()
  licenseExpiryDate!: string;

  @IsString()
  @IsNotEmpty()
  businessRegistrationNumber!: string;

  @IsString()
  @IsNotEmpty()
  governmentIdReference!: string;
}
