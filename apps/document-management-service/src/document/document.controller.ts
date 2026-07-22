import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import {
  GeneratePresignedDownloadUrlDto,
  GeneratePresignedUploadUrlDto,
} from './dto/generate-presigned-url.dto';
import { SignDocumentDto, VerifySignatureDto } from './dto/sign-document.dto';
import { AuditAction } from './audit-action.decorator';

@ApiTags('Documents')
@Controller('documents')
@ApiHeader({
  name: 'x-tenant-id',
  description: 'Tenant ID for tenant-scoped access',
  required: true,
})
@ApiHeader({
  name: 'x-correlation-id',
  description: 'Correlation ID for request tracing',
  required: false,
})
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  private extractRequestMetadata(headers: Record<string, string | undefined>) {
    return {
      ipAddress: headers['x-forwarded-for'] ?? headers['x-real-ip'],
      userAgent: headers['user-agent'],
      correlationId: headers['x-correlation-id'],
    };
  }

  // === Document CRUD ===

  @Post()
  @AuditAction({ action: 'create', resource: 'document', captureBody: true })
  @ApiOperation({ summary: 'Upload a document with checksum verification' })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Checksum mismatch or invalid input' })
  async uploadDocument(
    @Body() dto: CreateDocumentDto,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    // In a real implementation, the file buffer would come from a Multer upload.
    // For this scaffold, we create a placeholder buffer since the file content
    // is expected to be provided via pre-signed URL upload.
    const fileBuffer = Buffer.from(dto.originalName);
    const requestMetadata = this.extractRequestMetadata(headers);
    return this.documentService.uploadDocument(dto, fileBuffer, requestMetadata);
  }

  @Get()
  @AuditAction({ action: 'access', resource: 'document' })
  @ApiOperation({ summary: 'List documents for a tenant' })
  @ApiResponse({ status: 200, description: 'Paginated document list' })
  async listDocuments(
    @Query('tenantId') tenantId: string,
    @Query('patientId') patientId?: string,
    @Query('category') category?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.documentService.listDocuments(tenantId, {
      patientId,
      category,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get(':id')
  @AuditAction({ action: 'access', resource: 'document' })
  @ApiOperation({ summary: 'Get document metadata by ID' })
  @ApiResponse({ status: 200, description: 'Document metadata' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocument(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.documentService.getDocument(id, tenantId);
  }

  @Patch(':id')
  @AuditAction({ action: 'update', resource: 'document', captureBody: true })
  @ApiOperation({ summary: 'Update document metadata' })
  @ApiResponse({ status: 200, description: 'Updated document' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async updateDocument(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Query('tenantId') tenantId: string,
  ) {
    return this.documentService.updateDocument(id, dto, tenantId);
  }

  @Delete(':id')
  @AuditAction({ action: 'delete', resource: 'document' })
  @ApiOperation({ summary: 'Delete a document and its stored file' })
  @ApiResponse({ status: 200, description: 'Document deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    await this.documentService.deleteDocument(id, tenantId);
    return { message: 'Document deleted successfully' };
  }

  // === Pre-signed URLs ===

  @Post('presigned-upload')
  @AuditAction({ action: 'create', resource: 'document_presigned_upload' })
  @ApiOperation({ summary: 'Generate a time-bounded pre-signed upload URL' })
  @ApiResponse({ status: 201, description: 'Pre-signed upload URL' })
  async generatePresignedUploadUrl(
    @Body() dto: GeneratePresignedUploadUrlDto,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const requestMetadata = this.extractRequestMetadata(headers);
    return this.documentService.generatePresignedUploadUrl(dto, requestMetadata);
  }

  @Post(':id/download-url')
  @AuditAction({ action: 'access', resource: 'document_download_url' })
  @ApiOperation({ summary: 'Generate a time-bounded pre-signed download URL' })
  @ApiResponse({ status: 201, description: 'Pre-signed download URL' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async generatePresignedDownloadUrl(
    @Param('id') documentId: string,
    @Query('tenantId') tenantId: string,
    @Query('expiresInSeconds') expiresInSeconds?: string,
    @Headers() headers?: Record<string, string | undefined>,
  ) {
    const dto = new GeneratePresignedDownloadUrlDto();
    dto.documentId = documentId;
    dto.expiresInSeconds = expiresInSeconds ? parseInt(expiresInSeconds, 10) : undefined;

    const requestMetadata = this.extractRequestMetadata(headers);
    // Use the uploaderId from the x-user-id header as the accessor
    const accessedById = headers['x-user-id'] ?? 'unknown';
    return this.documentService.generatePresignedDownloadUrl(
      dto,
      tenantId,
      accessedById,
      requestMetadata,
    );
  }

  // === Digital Signatures ===

  @Post(':id/sign')
  @AuditAction({ action: 'create', resource: 'document_signature' })
  @ApiOperation({ summary: 'Digitally sign a document with RSA' })
  @ApiResponse({ status: 201, description: 'Signature data' })
  @ApiResponse({ status: 400, description: 'Document already signed or invalid key' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async signDocument(
    @Param('id') documentId: string,
    @Body() dto: SignDocumentDto,
    @Query('tenantId') tenantId: string,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    dto.documentId = documentId;
    const privateKey = headers['x-signing-key'] ?? '';
    const requestMetadata = this.extractRequestMetadata(headers);
    return this.documentService.signDocument(dto, privateKey, tenantId, requestMetadata);
  }

  @Get(':id/verify')
  @AuditAction({ action: 'access', resource: 'document_signature' })
  @ApiOperation({ summary: 'Verify a document digital signature' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async verifySignature(
    @Param('id') documentId: string,
    @Query('tenantId') tenantId: string,
    @Query('publicKey') publicKey: string,
  ) {
    const dto = new VerifySignatureDto();
    dto.documentId = documentId;
    dto.publicKey = publicKey;
    return this.documentService.verifySignature(dto, tenantId);
  }

  // === Access Logs ===

  @Get(':id/access-logs')
  @AuditAction({ action: 'access', resource: 'document_access_log' })
  @ApiOperation({ summary: 'Get access logs for a document' })
  @ApiResponse({ status: 200, description: 'Paginated access logs' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getAccessLogs(
    @Param('id') documentId: string,
    @Query('tenantId') tenantId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.documentService.getAccessLogs(documentId, tenantId, {
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }
}
