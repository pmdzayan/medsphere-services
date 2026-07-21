import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { EncounterType } from '../enums';

export class CreateEncounterDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  practitionerId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsEnum(EncounterType)
  type!: EncounterType;

  @IsOptional()
  @IsString()
  chiefComplaint?: string;
}
