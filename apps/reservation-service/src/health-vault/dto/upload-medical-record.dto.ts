import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { MedicalRecordType } from '../enums/medical-record-type.enum';

export class UploadMedicalRecordDto {
  @IsEnum(MedicalRecordType)
  @IsNotEmpty()
  recordType!: MedicalRecordType;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsNotEmpty()
  recordDate!: string;
}
