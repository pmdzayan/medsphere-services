import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeAuthenticationLocator } from '../auth-normalization';

/**
 * Task 0010: the second step of the slug-free login flow, used only when
 * IdentifyLoginDto resolved more than one active membership for the
 * person. Re-collects the password (rather than trusting a bare
 * membershipId alone) so a membership can only ever be selected by
 * someone who has already proven the account's password -- never by
 * membershipId guessing.
 */
export class SelectOrganizationLoginDto {
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

  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsUUID('4')
  membershipId!: string;
}
