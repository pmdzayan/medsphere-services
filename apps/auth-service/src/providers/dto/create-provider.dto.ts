import {
  IsString,
  IsNotEmpty,
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

export class CreateProviderDto {
  @IsEnum(ProviderType)
  @IsNotEmpty()
  providerType!: ProviderType;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  businessName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  ownerName!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  country!: string;

  @IsString()
  @IsNotEmpty()
  postalCode!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}
