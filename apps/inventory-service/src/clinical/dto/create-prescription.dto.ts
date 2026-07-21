import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PrescriptionItemDto {
  @IsUUID()
  productId!: string;

  @IsString()
  dosage!: string;

  @IsString()
  frequency!: string;

  @IsNumber()
  @Min(1)
  durationDays!: number;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  encounterId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  practitionerId!: string;

  @IsUUID()
  targetLocationId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}
