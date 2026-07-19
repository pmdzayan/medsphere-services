import { IsString, IsOptional, IsUUID, IsArray, IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['SYSTEM', 'TENANT'])
  @IsOptional()
  type?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  permissionIds?: string[];
}
