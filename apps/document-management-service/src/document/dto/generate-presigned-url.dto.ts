import { IsString, IsNotEmpty, IsInt, Min, Max, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratePresignedDownloadUrlDto {
  @ApiProperty({ description: 'Document ID' })
  @IsUUID()
  @IsNotEmpty()
  documentId!: string;

  @ApiPropertyOptional({
    description: 'URL expiration time in seconds (default 900, max 3600)',
    default: 900,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  expiresInSeconds?: number;
}

export class GeneratePresignedUploadUrlDto {
  @ApiProperty({ description: 'Tenant ID (from x-tenant-id header)' })
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

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

  @ApiPropertyOptional({
    description: 'URL expiration time in seconds (default 900, max 3600)',
    default: 900,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  expiresInSeconds?: number;
}
