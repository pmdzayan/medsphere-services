import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeAuthenticationLocator } from '../auth-normalization';

/**
 * Task 0010: the slug-free login entry point. A normal user's individual
 * identity (email + password) is verified first and in isolation from
 * any organization context -- no tenant slug, ID, or name is ever
 * collected or required here. See AuthService.identifyLogin for how the
 * resulting membership set is resolved and disambiguated.
 */
export class IdentifyLoginDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeAuthenticationLocator(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 15, maxLength: 128, format: 'password' })
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password!: string;
}
