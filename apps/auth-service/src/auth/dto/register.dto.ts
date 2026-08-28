import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeAuthenticationLocator } from '../auth-normalization';
import { normalizePhoneNumber } from '../../verification/otp/phone-normalization';
import { ORGANIZATION_TYPES, type OrganizationType } from '../../organization/organization-type';

export class RegisterDto {
  @ApiProperty({ example: 'HOSPITAL', enum: ORGANIZATION_TYPES })
  @IsString()
  @IsIn(ORGANIZATION_TYPES)
  organizationType!: OrganizationType;

  /**
   * Required for every organizationType except 'NONE'. @ValidateIf skips
   * validation entirely (including presence) when organizationType is
   * 'NONE', matching the frontend behavior of hiding this field for a
   * personal account. Bounded length matches the generated code's own
   * fixed shape (MED-XXXXX-XXXXX, 15 characters) with slack for
   * whitespace/casing a user might paste.
   */
  @ApiProperty({ example: 'MED-X7P42-Q9K3R', required: false, maxLength: 40 })
  @ValidateIf((dto: RegisterDto) => dto.organizationType !== 'NONE')
  @IsString()
  @MaxLength(40)
  organizationCode?: string;

  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '+919876543210', maxLength: 20 })
  @Transform(({ value }) => (typeof value === 'string' ? normalizePhoneNumber(value) : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password!: string;

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
