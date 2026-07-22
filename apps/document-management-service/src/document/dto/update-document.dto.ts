import { IsString, IsOptional, IsEnum, IsBoolean, IsObject, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentCategory } from '../enums';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ enum: DocumentCategory, description: 'Document category' })
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @ApiPropertyOptional({ description: 'Document title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Document description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Original file name' })
  @IsOptional()
  @IsString()
  originalName?: string;

  @ApiPropertyOptional({ description: 'MIME type' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional({ description: 'SHA-256 checksum' })
  @IsOptional()
  @IsString()
  checksumSha256?: string;

  @ApiPropertyOptional({ description: 'Storage bucket name' })
  @IsOptional()
  @IsString()
  storageBucket?: string;

  @ApiPropertyOptional({ description: 'Storage key/path' })
  @IsOptional()
  @IsString()
  storageKey?: string;

  @ApiPropertyOptional({ description: 'Whether the file is encrypted at rest' })
  @IsOptional()
  @IsBoolean()
  isEncrypted?: boolean;

  @ApiPropertyOptional({ description: 'Whether the document has been digitally signed' })
  @IsOptional()
  @IsBoolean()
  isSigned?: boolean;

  @ApiPropertyOptional({ description: 'Digital signature payload', type: Object })
  @IsOptional()
  @IsObject()
  signatureData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Arbitrary key-value metadata tags', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
