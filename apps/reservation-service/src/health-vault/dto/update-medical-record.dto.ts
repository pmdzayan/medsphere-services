import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { MedicalRecordType } from '../enums/medical-record-type.enum';

export class UpdateMedicalRecordDto {
  @IsEnum(MedicalRecordType)
  @IsOptional()
  recordType?: MedicalRecordType;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  recordDate?: string;
}
