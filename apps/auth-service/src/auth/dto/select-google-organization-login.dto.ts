import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Google login step 2. The Google ID token is verified again so the selected
 * membership is bound to the provider-authenticated global identity rather
 * than trusted as a bare client-supplied identifier.
 */
export class SelectGoogleOrganizationLoginDto {
  @ApiProperty({ maxLength: 10000, description: 'Google-signed identity proof' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  idToken!: string;

  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsUUID('4')
  membershipId!: string;
}
