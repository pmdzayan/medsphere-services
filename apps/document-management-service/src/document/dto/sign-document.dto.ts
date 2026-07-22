import { IsString, IsNotEmpty, IsUUID, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SignDocumentDto {
  @ApiProperty({ description: 'Document ID' })
  @IsUUID()
  @IsNotEmpty()
  documentId!: string;

  @ApiProperty({ description: 'User ID of the signer' })
  @IsUUID()
  @IsNotEmpty()
  signerId!: string;

  @ApiPropertyOptional({ description: 'Signer role/title', example: 'Attending Physician' })
  @IsOptional()
  @IsString()
  signerRole?: string;

  @ApiPropertyOptional({ description: 'Additional signature metadata', type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class VerifySignatureDto {
  @ApiProperty({ description: 'Document ID' })
  @IsUUID()
  @IsNotEmpty()
  documentId!: string;

  @ApiProperty({ description: 'Public key to verify against (PEM format)' })
  @IsString()
  @IsNotEmpty()
  publicKey!: string;
}
