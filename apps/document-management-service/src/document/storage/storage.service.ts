import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StorageProviderType } from '../enums';
import {
  StorageProvider,
  StorageOperationResult,
  UploadParams,
  DownloadParams,
  PresignedUrlParams,
} from './storage-provider.interface';
import { S3StorageProvider } from './s3-storage.provider';
import { MinioStorageProvider } from './minio-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';

/**
 * Storage service that resolves the appropriate storage provider
 * based on the configured StorageProviderType and delegates operations.
 *
 * This service follows the same provider-map pattern as the
 * NotificationSenderService, selecting the correct implementation
 * from an injected set of providers.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly providerMap: Record<StorageProviderType, StorageProvider>;

  constructor(
    s3Provider: S3StorageProvider,
    minioProvider: MinioStorageProvider,
    localProvider: LocalStorageProvider,
  ) {
    this.providerMap = {
      [StorageProviderType.S3]: s3Provider,
      [StorageProviderType.MINIO]: minioProvider,
      [StorageProviderType.LOCAL_DISK]: localProvider,
    };
  }

  /**
   * Get the storage provider for the given provider type.
   * Defaults to LOCAL_DISK if no provider is configured.
   */
  getProvider(providerType?: StorageProviderType): StorageProvider {
    const provider = providerType
      ? this.providerMap[providerType]
      : this.providerMap[StorageProviderType.LOCAL_DISK];

    if (!provider) {
      throw new NotFoundException(`No storage provider registered for type: ${providerType}`);
    }

    return provider;
  }

  /**
   * Upload a file to the configured storage backend.
   */
  async upload(
    params: UploadParams,
    providerType?: StorageProviderType,
  ): Promise<StorageOperationResult> {
    const provider = this.getProvider(providerType);
    return provider.upload(params);
  }

  /**
   * Download a file from the configured storage backend.
   */
  async download(params: DownloadParams, providerType?: StorageProviderType): Promise<Buffer> {
    const provider = this.getProvider(providerType);
    return provider.download(params);
  }

  /**
   * Delete a file from the configured storage backend.
   */
  async delete(
    bucket: string,
    key: string,
    providerType?: StorageProviderType,
  ): Promise<StorageOperationResult> {
    const provider = this.getProvider(providerType);
    return provider.delete(bucket, key);
  }

  /**
   * Generate a pre-signed URL for uploading a file.
   */
  async generatePresignedUploadUrl(
    params: PresignedUrlParams,
    providerType?: StorageProviderType,
  ): Promise<string> {
    const provider = this.getProvider(providerType);
    return provider.generatePresignedUploadUrl(params);
  }

  /**
   * Generate a pre-signed URL for downloading a file.
   */
  async generatePresignedDownloadUrl(
    params: PresignedUrlParams,
    providerType?: StorageProviderType,
  ): Promise<string> {
    const provider = this.getProvider(providerType);
    return provider.generatePresignedDownloadUrl(params);
  }
}
