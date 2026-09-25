import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const CODE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

abstract class ProviderAddressDto {
  @ApiProperty({ minLength: 1, maxLength: 254 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 30 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  phone!: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  state!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  country!: string;

  @ApiProperty({ minLength: 1, maxLength: 20 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsLongitude()
  longitude!: number;
}

export class CreateFacilityProviderDto extends ProviderAddressDto {
  @ApiProperty({ enum: ['HOSPITAL', 'CLINIC', 'LABORATORY'] })
  @IsIn(['HOSPITAL', 'CLINIC', 'LABORATORY'])
  providerType!: 'HOSPITAL' | 'CLINIC' | 'LABORATORY';

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  ownerName!: string;
}

export class CreateProfessionalProviderDto extends ProviderAddressDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  userId!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  registrationNumber!: string;

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  registrationAuthority!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString({ strict: true })
  registrationExpiryDate?: string;

  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  primarySpecialty?: string;
}

export class CreateProviderLocationDto extends ProviderAddressDto {
  @ApiProperty({ minLength: 1, maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(CODE)
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
}

export class CreateProviderDepartmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  locationId!: string;

  @ApiProperty({ minLength: 1, maxLength: 40 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(CODE)
  code!: string;

  @ApiProperty({ minLength: 1, maxLength: 160 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
}

export class ProviderDomainSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['HOSPITAL', 'CLINIC', 'LABORATORY', 'DOCTOR'] })
  providerType!: 'HOSPITAL' | 'CLINIC' | 'LABORATORY' | 'DOCTOR';

  @ApiProperty()
  businessName!: string;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  isActive!: boolean;
}

export class ProviderLocationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty()
  country!: string;

  @ApiProperty()
  postalCode!: string;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  version!: number;
}

export class ProviderDepartmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  locationId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  version!: number;
}

export class ProviderProfessionalProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  registrationNumber!: string;

  @ApiProperty()
  registrationAuthority!: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  registrationExpiryDate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  primarySpecialty!: string | null;

  @ApiProperty()
  version!: number;
}
