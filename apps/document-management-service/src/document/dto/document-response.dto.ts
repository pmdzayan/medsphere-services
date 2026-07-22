import { ApiProperty } from '@nestjs/swagger';
import { DocumentCategory } from '../enums';

export class DocumentResponseDto {
  @ApiProperty({ description: 'Document ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Patient ID', nullable: true })
  patientId!: string | null;

  @ApiProperty({ description: 'Uploader User ID' })
  uploaderId!: string;

  @ApiProperty({ enum: DocumentCategory, description: 'Document category' })
  category!: DocumentCategory;

  @ApiProperty({ description: 'Document title' })
  title!: string;

  @ApiProperty({ description: 'Document description', nullable: true })
  description!: string | null;

  @ApiProperty({ description: 'Original file name' })
  originalName!: string;

  @ApiProperty({ description: 'MIME type' })
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes' })
  fileSize!: number;

  @ApiProperty({ description: 'Storage bucket name' })
  storageBucket!: string;

  @ApiProperty({ description: 'Storage key/path' })
  storageKey!: string;

  @ApiProperty({ description: 'SHA-256 checksum for integrity verification' })
  checksumSha256!: string;

  @ApiProperty({ description: 'Whether the file is encrypted at rest' })
  isEncrypted!: boolean;

  @ApiProperty({ description: 'Whether the document has been digitally signed' })
  isSigned!: boolean;

  @ApiProperty({ description: 'Digital signature payload', nullable: true })
  signatureData!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Arbitrary key-value metadata tags', nullable: true })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;
}
