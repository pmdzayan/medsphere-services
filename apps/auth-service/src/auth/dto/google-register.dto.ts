import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { normalizePhoneNumber } from '../../verification/otp/phone-normalization';
import { ORGANIZATION_TYPES, type OrganizationType } from '../../organization/organization-type';

export class GoogleRegisterDto {
  @ApiProperty({ example: 'HOSPITAL', enum: ORGANIZATION_TYPES })
  @IsString()
  @IsIn(ORGANIZATION_TYPES)
  organizationType!: OrganizationType;

  @ApiProperty({ example: 'MED-X7P42-Q9K3R', required: false, maxLength: 40 })
  @ValidateIf((dto: GoogleRegisterDto) => dto.organizationType !== 'NONE')
  @IsString()
  @MaxLength(40)
  organizationCode?: string;

  @ApiProperty({ example: '+919876543210', maxLength: 20 })
  @Transform(({ value }) => (typeof value === 'string' ? normalizePhoneNumber(value) : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ maxLength: 10000, description: 'Google ID token' })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  idToken!: string;

  @ApiProperty({ example: 'Asha', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Sharma', minLength: 1, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;
}
