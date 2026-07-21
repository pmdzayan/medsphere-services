import { IsOptional, IsNumber, IsUUID, Min, Max } from 'class-validator';

export class RecordVitalSignsDto {
  @IsUUID()
  encounterId!: string;

  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  systolicBp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  diastolicBp?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(45)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  spO2?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  respiratoryRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  height?: number;
}
