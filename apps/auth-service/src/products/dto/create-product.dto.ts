import { IsString, IsNotEmpty, IsEnum, IsBoolean, IsOptional } from 'class-validator';

export enum ProductCategory {
  MEDICINE = 'MEDICINE',
  OTC = 'OTC',
  COSMETIC = 'COSMETIC',
  AYURVEDIC = 'AYURVEDIC',
  SUPPLEMENT = 'SUPPLEMENT',
  BABY_CARE = 'BABY_CARE',
  PERSONAL_CARE = 'PERSONAL_CARE',
  MEDICAL_DEVICE = 'MEDICAL_DEVICE',
}

export enum DosageForm {
  TABLET = 'TABLET',
  SYRUP = 'SYRUP',
  INJECTION = 'INJECTION',
  CREAM = 'CREAM',
  OINTMENT = 'OINTMENT',
  CAPSULE = 'CAPSULE',
  DROPS = 'DROPS',
  INHALER = 'INHALER',
  SPRAY = 'SPRAY',
  LOTION = 'LOTION',
  GEL = 'GEL',
  POWDER = 'POWDER',
  SOLUTION = 'SOLUTION',
  SUSPENSION = 'SUSPENSION',
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  genericName?: string;

  @IsString()
  @IsNotEmpty()
  brand!: string;

  @IsEnum(ProductCategory)
  @IsNotEmpty()
  category!: ProductCategory;

  @IsString()
  @IsOptional()
  subCategory?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  manufacturer!: string;

  @IsEnum(DosageForm)
  @IsNotEmpty()
  dosageForm!: DosageForm;

  @IsString()
  @IsNotEmpty()
  strength!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsBoolean()
  @IsOptional()
  requiresPrescription?: boolean;
}
