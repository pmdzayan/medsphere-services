import { IsBoolean, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdatePrivacyDto {
  @IsBoolean()
  @IsOptional()
  sharePhone?: boolean;

  @IsBoolean()
  @IsOptional()
  shareEmail?: boolean;

  @IsBoolean()
  @IsOptional()
  allowInAppChat?: boolean;

  @IsBoolean()
  @IsOptional()
  privatePickup?: boolean;

  @IsBoolean()
  @IsOptional()
  hideSensitiveNotifications?: boolean;

  @IsString()
  @IsIn(['en', 'es', 'fr', 'de', 'zh', 'ja', 'ar', 'pt', 'ru'])
  @IsOptional()
  preferredLanguage?: string;
}
