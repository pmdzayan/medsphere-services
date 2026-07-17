import { IsString, IsNotEmpty } from 'class-validator';

export class VerificationStatusDto {
  @IsString()
  @IsNotEmpty()
  verificationId!: string;
}
