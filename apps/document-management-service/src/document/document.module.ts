import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentRepository } from './document.repository';
import { StorageService } from './storage/storage.service';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { MinioStorageProvider } from './storage/minio-storage.provider';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { SignatureService } from './signatures/signature.service';

@Module({
  controllers: [DocumentController],
  providers: [
    DocumentRepository,
    DocumentService,
    StorageService,
    S3StorageProvider,
    MinioStorageProvider,
    LocalStorageProvider,
    SignatureService,
  ],
  exports: [DocumentService, DocumentRepository, StorageService, SignatureService],
})
export class DocumentModule {}
