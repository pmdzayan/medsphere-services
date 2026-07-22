import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsObject,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory } from '../enums';

export class CreateDocumentDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @ApiPropertyOptional({ description: 'Patient ID this document belongs to' })
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @ApiProperty({ description: 'User ID of the uploader' })
  @IsUUID()
  @IsNotEmpty()
  uploaderId!: string;

  @ApiProperty({ enum: DocumentCategory, description: 'Document category' })
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @ApiProperty({ description: 'Document title', example: 'Lab Results - CBC' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Document description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Original file name', example: 'lab_results.pdf' })
  @IsString()
  @IsNotEmpty()
  originalName!: string;

  @ApiProperty({ description: 'MIME type', example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes', example: 102400 })
  @IsInt()
  @Min(0)
  fileSize!: number;

  @ApiProperty({ description: 'SHA-256 checksum of the file content' })
  @IsString()
  @IsNotEmpty()
  checksumSha256!: string;

  @ApiPropertyOptional({ description: 'Storage bucket name' })
  @IsOptional()
  @IsString()
  storageBucket?: string;

  @ApiPropertyOptional({ description: 'Storage key/path' })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiPropertyOptional({ description: 'Whether the file is encrypted at rest', default: true })
  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;

  @ApiPropertyOptional({ description: 'Arbitrary key-value metadata tags', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
