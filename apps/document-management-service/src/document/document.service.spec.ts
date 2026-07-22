import { Test, TestingModule } from '@nestjs/testing';
import { DocumentService } from './document.service';
import { DocumentRepository } from './document.repository';
import { StorageService } from './storage/storage.service';
import { SignatureService } from './signatures/signature.service';
import { DocumentCategory } from './enums';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('DocumentService', () => {
  let service: DocumentService;
  let repository: jest.Mocked<DocumentRepository>;
  let storageService: jest.Mocked<StorageService>;
  let signatureService: jest.Mocked<SignatureService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentService,
        {
          provide: DocumentRepository,
          useValue: {
            createDocument: jest.fn(),
            findById: jest.fn(),
            findByTenant: jest.fn(),
            findByPatient: jest.fn(),
            findByCategory: jest.fn(),
            findByChecksum: jest.fn(),
            updateDocument: jest.fn(),
            updateSignature: jest.fn(),
            deleteDocument: jest.fn(),
            createAccessLog: jest.fn(),
            findAccessLogsByDocument: jest.fn(),
            findAccessLogsByUser: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: {
            upload: jest.fn(),
            download: jest.fn(),
            delete: jest.fn(),
            generatePresignedUploadUrl: jest.fn(),
            generatePresignedDownloadUrl: jest.fn(),
            getProvider: jest.fn(),
          },
        },
        {
          provide: SignatureService,
          useValue: {
            computeChecksum: jest.fn(),
            verifyChecksum: jest.fn(),
            signDocument: jest.fn(),
            verifySignature: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DocumentService>(DocumentService);
    repository = module.get(DocumentRepository);
    storageService = module.get(StorageService);
    signatureService = module.get(SignatureService);
  });

  describe('uploadDocument', () => {
    it('should upload a document when checksum matches', async () => {
      const fileBuffer = Buffer.from('test content');
      const checksum = 'a9993e364706816aba3e25717850c26c9cd0d89d';

      signatureService.computeChecksum.mockReturnValue(checksum);
      storageService.upload.mockResolvedValue({
        success: true,
        key: 'test-key',
        bucket: 'test-bucket',
      });
      repository.createDocument.mockResolvedValue({
        id: 'doc-1',
        checksumSha256: checksum,
      } as never);
      repository.createAccessLog.mockResolvedValue({} as never);

      const result = await service.uploadDocument(
        {
          tenantId: 'tenant-1',
          uploaderId: 'user-1',
          category: DocumentCategory.LAB_REPORT_PDF,
          title: 'Lab Results',
          originalName: 'lab.pdf',
          mimeType: 'application/pdf',
          fileSize: 12,
          checksumSha256: checksum,
        },
        fileBuffer,
      );

      expect(result.id).toBe('doc-1');
      expect(storageService.upload).toHaveBeenCalled();
      expect(repository.createDocument).toHaveBeenCalled();
      expect(repository.createAccessLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DOCUMENT_UPLOADED' }),
      );
    });

    it('should throw BadRequestException when checksum does not match', async () => {
      const fileBuffer = Buffer.from('test content');

      signatureService.computeChecksum.mockReturnValue('different-checksum');

      await expect(
        service.uploadDocument(
          {
            tenantId: 'tenant-1',
            uploaderId: 'user-1',
            category: DocumentCategory.LAB_REPORT_PDF,
            title: 'Lab Results',
            originalName: 'lab.pdf',
            mimeType: 'application/pdf',
            fileSize: 12,
            checksumSha256: 'expected-checksum',
          },
          fileBuffer,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDocument', () => {
    it('should return the document when found and tenant matches', async () => {
      repository.findById.mockResolvedValue({
        id: 'doc-1',
        tenantId: 'tenant-1',
      } as never);

      const result = await service.getDocument('doc-1', 'tenant-1');
      expect(result.id).toBe('doc-1');
    });

    it('should throw NotFoundException when document not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getDocument('nonexistent', 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when tenant does not match', async () => {
      repository.findById.mockResolvedValue({
        id: 'doc-1',
        tenantId: 'tenant-2',
      } as never);
      await expect(service.getDocument('doc-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listDocuments', () => {
    it('should list documents by tenant', async () => {
      repository.findByTenant.mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0 });
      const result = await service.listDocuments('tenant-1', {});
      expect(result.total).toBe(0);
      expect(repository.findByTenant).toHaveBeenCalledWith('tenant-1', undefined, undefined);
    });

    it('should list documents by patient when patientId provided', async () => {
      repository.findByPatient.mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0 });
      await service.listDocuments('tenant-1', { patientId: 'patient-1' });
      expect(repository.findByPatient).toHaveBeenCalledWith(
        'tenant-1',
        'patient-1',
        undefined,
        undefined,
      );
    });
  });

  describe('deleteDocument', () => {
    it('should delete the document when found', async () => {
      repository.findById.mockResolvedValue({
        id: 'doc-1',
        tenantId: 'tenant-1',
        storageBucket: 'bucket',
        storageKey: 'key',
      } as never);
      storageService.delete.mockResolvedValue({ success: true });
      repository.deleteDocument.mockResolvedValue({} as never);

      await service.deleteDocument('doc-1', 'tenant-1');
      expect(storageService.delete).toHaveBeenCalledWith('bucket', 'key');
      expect(repository.deleteDocument).toHaveBeenCalledWith('doc-1');
    });

    it('should throw NotFoundException when document not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.deleteDocument('nonexistent', 'tenant-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generatePresignedDownloadUrl', () => {
    it('should generate a presigned download URL', async () => {
      repository.findById.mockResolvedValue({
        id: 'doc-1',
        tenantId: 'tenant-1',
        storageBucket: 'bucket',
        storageKey: 'key',
      } as never);
      storageService.generatePresignedDownloadUrl.mockResolvedValue('https://presigned-url');
      repository.createAccessLog.mockResolvedValue({} as never);

      const result = await service.generatePresignedDownloadUrl(
        { documentId: 'doc-1' },
        'tenant-1',
        'user-1',
      );

      expect(result.url).toBe('https://presigned-url');
      expect(repository.createAccessLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PRESIGNED_DOWNLOAD_URL_GENERATED' }),
      );
    });
  });
});
