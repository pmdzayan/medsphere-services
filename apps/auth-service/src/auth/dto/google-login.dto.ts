import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  tenantSlug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  idToken!: string;
}
