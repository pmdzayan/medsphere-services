import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentRepository } from './document.repository';
import { StorageService } from './storage/storage.service';
import { SignatureService } from './signatures/signature.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  GeneratePresignedDownloadUrlDto,
  GeneratePresignedUploadUrlDto,
} from './dto/generate-presigned-url.dto';
import { SignDocumentDto, VerifySignatureDto } from './dto/sign-document.dto';
import { StorageProviderType } from './enums';

/**
 * Document management service that orchestrates storage operations,
 * checksum verification, digital signatures, and access logging.
 *
 * Reuses AuditLogService for audit trail compliance (via the
 * AuditAction decorator and AuditLogInterceptor at the controller layer).
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storageService: StorageService,
    private readonly signatureService: SignatureService,
  ) {}

  // === Document CRUD ===

  /**
   * Upload a document: verify checksum, store in object storage,
   * and persist metadata in the database.
   */
  async uploadDocument(
    dto: CreateDocumentDto,
    fileBuffer: Buffer,
    requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ) {
    // Verify SHA-256 checksum of the uploaded file
    const computedChecksum = this.signatureService.computeChecksum(fileBuffer);
    if (computedChecksum !== dto.checksumSha256) {
      throw new BadRequestException(
        `Checksum mismatch: expected ${dto.checksumSha256}, got ${computedChecksum}`,
      );
    }

    // Determine storage bucket and key
    const storageBucket = dto.storageBucket ?? `tenant-${dto.tenantId}-docs`;
    const storageKey = dto.storageKey ?? `tenants/${dto.tenantId}/docs/${dto.originalName}`;

    // Upload to object storage
    const uploadResult = await this.storageService.upload(
      {
        bucket: storageBucket,
        key: storageKey,
        body: fileBuffer,
        mimeType: dto.mimeType,
      },
      StorageProviderType.LOCAL_DISK,
    );

    if (!uploadResult.success) {
      throw new BadRequestException(`Storage upload failed: ${uploadResult.errorMessage}`);
    }

    // Persist document metadata
    const document = await this.repository.createDocument({
      tenantId: dto.tenantId,
      patientId: dto.patientId ?? null,
      uploaderId: dto.uploaderId,
      category: dto.category,
      title: dto.title,
      description: dto.description ?? null,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      storageBucket,
      storageKey,
      checksumSha256: dto.checksumSha256,
      isEncrypted: dto.isEncrypted ?? true,
      isSigned: false,
      signatureData: null,
      metadata: dto.metadata ?? null,
    });

    // Log the upload action
    await this.repository.createAccessLog({
      tenantId: dto.tenantId,
      documentId: document.id,
      accessedById: dto.uploaderId,
      action: 'DOCUMENT_UPLOADED',
      ipAddress: requestMetadata?.ipAddress ?? null,
      userAgent: requestMetadata?.userAgent ?? null,
      correlationId: requestMetadata?.correlationId ?? null,
    });

    return document;
  }

  /**
   * Get a single document's metadata by ID.
   */
  async getDocument(id: string, tenantId: string) {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    return document;
  }

  /**
   * List documents for a tenant, optionally filtered by patient or category.
   */
  async listDocuments(
    tenantId: string,
    params: {
      patientId?: string;
      category?: string;
      skip?: number;
      take?: number;
    },
  ) {
    if (params.patientId) {
      return this.repository.findByPatient(tenantId, params.patientId, params.skip, params.take);
    }
    if (params.category) {
      return this.repository.findByCategory(
        tenantId,
        params.category as never,
        params.skip,
        params.take,
      );
    }
    return this.repository.findByTenant(tenantId, params.skip, params.take);
  }

  /**
   * Update document metadata.
   */
  async updateDocument(id: string, dto: UpdateDocumentDto, tenantId: string) {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${id}`);
    }

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.originalName !== undefined) updateData.originalName = dto.originalName;
    if (dto.mimeType !== undefined) updateData.mimeType = dto.mimeType;
    if (dto.fileSize !== undefined) updateData.fileSize = dto.fileSize;
    if (dto.checksumSha256 !== undefined) updateData.checksumSha256 = dto.checksumSha256;
    if (dto.storageBucket !== undefined) updateData.storageBucket = dto.storageBucket;
    if (dto.storageKey !== undefined) updateData.storageKey = dto.storageKey;
    if (dto.isEncrypted !== undefined) updateData.isEncrypted = dto.isEncrypted;
    if (dto.isSigned !== undefined) updateData.isSigned = dto.isSigned;
    if (dto.signatureData !== undefined) updateData.signatureData = dto.signatureData;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

    return this.repository.updateDocument(id, updateData);
  }

  /**
   * Delete a document and its stored file.
   */
  async deleteDocument(id: string, tenantId: string) {
    const document = await this.repository.findById(id);
    if (!document) {
      throw new NotFoundException(`Document not found: ${id}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${id}`);
    }

    // Delete from object storage
    await this.storageService.delete(document.storageBucket, document.storageKey);

    // Delete from database (cascade deletes access logs)
    return this.repository.deleteDocument(id);
  }

  // === Pre-signed URLs ===

  /**
   * Generate a time-bounded pre-signed download URL for a document.
   */
  async generatePresignedDownloadUrl(
    dto: GeneratePresignedDownloadUrlDto,
    tenantId: string,
    accessedById: string,
    requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ) {
    const document = await this.repository.findById(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }

    const expiresInSeconds = dto.expiresInSeconds ?? 900;
    const url = await this.storageService.generatePresignedDownloadUrl(
      {
        bucket: document.storageBucket,
        key: document.storageKey,
        expiresInSeconds,
      },
      StorageProviderType.LOCAL_DISK,
    );

    // Log the download URL generation
    await this.repository.createAccessLog({
      tenantId,
      documentId: document.id,
      accessedById,
      action: 'PRESIGNED_DOWNLOAD_URL_GENERATED',
      ipAddress: requestMetadata?.ipAddress ?? null,
      userAgent: requestMetadata?.userAgent ?? null,
      correlationId: requestMetadata?.correlationId ?? null,
    });

    return { url, expiresInSeconds, documentId: document.id };
  }

  /**
   * Generate a time-bounded pre-signed upload URL.
   */
  async generatePresignedUploadUrl(
    dto: GeneratePresignedUploadUrlDto,
    _requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ) {
    const storageBucket = `tenant-${dto.tenantId}-docs`;
    const storageKey = `tenants/${dto.tenantId}/docs/${dto.originalName}`;
    const expiresInSeconds = dto.expiresInSeconds ?? 900;

    const url = await this.storageService.generatePresignedUploadUrl(
      {
        bucket: storageBucket,
        key: storageKey,
        expiresInSeconds,
        mimeType: dto.mimeType,
      },
      StorageProviderType.LOCAL_DISK,
    );

    return { url, expiresInSeconds, storageBucket, storageKey };
  }

  // === Digital Signatures ===

  /**
   * Sign a document digitally using the signer's RSA private key.
   */
  async signDocument(
    dto: SignDocumentDto,
    privateKey: string,
    tenantId: string,
    requestMetadata?: { ipAddress?: string; userAgent?: string; correlationId?: string },
  ) {
    const document = await this.repository.findById(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }

    const signatureData = await this.signatureService.signDocument({
      documentId: dto.documentId,
      signerId: dto.signerId,
      privateKey,
      signerRole: dto.signerRole,
      metadata: dto.metadata,
    });

    // Log the signing action
    await this.repository.createAccessLog({
      tenantId,
      documentId: document.id,
      accessedById: dto.signerId,
      action: 'SIGNED',
      ipAddress: requestMetadata?.ipAddress ?? null,
      userAgent: requestMetadata?.userAgent ?? null,
      correlationId: requestMetadata?.correlationId ?? null,
    });

    return signatureData;
  }

  /**
   * Verify a document's digital signature.
   */
  async verifySignature(dto: VerifySignatureDto, tenantId: string) {
    const document = await this.repository.findById(dto.documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${dto.documentId}`);
    }

    return this.signatureService.verifySignature({
      documentId: dto.documentId,
      publicKey: dto.publicKey,
    });
  }

  // === Access Logs ===

  /**
   * Get access logs for a document.
   */
  async getAccessLogs(
    documentId: string,
    tenantId: string,
    params: { skip?: number; take?: number },
  ) {
    const document = await this.repository.findById(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }
    if (document.tenantId !== tenantId) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    return this.repository.findAccessLogsByDocument(tenantId, documentId, params.skip, params.take);
  }
}
