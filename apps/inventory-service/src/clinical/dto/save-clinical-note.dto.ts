import { IsString, IsOptional, IsUUID, IsBoolean } from 'class-validator';

export class SaveClinicalNoteDto {
  @IsUUID()
  encounterId!: string;

  @IsUUID()
  authorId!: string;

  @IsOptional()
  @IsString()
  subjective?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsBoolean()
  isFinalized?: boolean;
}
