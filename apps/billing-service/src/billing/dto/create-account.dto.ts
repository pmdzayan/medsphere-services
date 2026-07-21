import { IsString, IsEnum } from 'class-validator';
import { AccountType } from '../enums';

export class CreateAccountDto {
  @IsString()
  tenantId!: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(AccountType)
  type!: AccountType;
}
