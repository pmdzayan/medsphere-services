import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacyDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  sharePhone?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  shareEmail?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  allowInAppChat?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  privatePickup?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  hideSensitiveNotifications?: boolean;
}

export class PrivacyResponseDto {
  @ApiProperty()
  sharePhone!: boolean;

  @ApiProperty()
  shareEmail!: boolean;

  @ApiProperty()
  allowInAppChat!: boolean;

  @ApiProperty()
  privatePickup!: boolean;

  @ApiProperty()
  hideSensitiveNotifications!: boolean;
}
