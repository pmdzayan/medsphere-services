import { StorageProviderType } from '../enums';

/**
 * Result of a storage operation.
 */
export interface StorageOperationResult {
  success: boolean;
  key?: string;
  bucket?: string;
  url?: string;
  errorMessage?: string;
}

/**
 * Parameters for uploading a file to object storage.
 */
export interface UploadParams {
  bucket: string;
  key: string;
  body: Buffer;
  mimeType: string;
  metadata?: Record<string, string>;
}

/**
 * Parameters for downloading a file from object storage.
 */
export interface DownloadParams {
  bucket: string;
  key: string;
}

/**
 * Parameters for generating a pre-signed URL.
 */
export interface PresignedUrlParams {
  bucket: string;
  key: string;
  expiresInSeconds: number;
  mimeType?: string;
}

/**
 * Common interface that all storage providers must implement.
 *
 * Each provider is responsible for storing and retrieving files through
 * its specific object storage backend (AWS S3, MinIO, or local disk).
 */
export interface StorageProvider {
  /**
   * The provider type this implementation handles.
   */
  readonly providerType: StorageProviderType;

  /**
   * Upload a file to object storage.
   */
  upload(params: UploadParams): Promise<StorageOperationResult>;

  /**
   * Download a file from object storage.
   */
  download(params: DownloadParams): Promise<Buffer>;

  /**
   * Delete a file from object storage.
   */
  delete(bucket: string, key: string): Promise<StorageOperationResult>;

  /**
   * Generate a pre-signed URL for uploading a file.
   */
  generatePresignedUploadUrl(params: PresignedUrlParams): Promise<string>;

  /**
   * Generate a pre-signed URL for downloading a file.
   */
  generatePresignedDownloadUrl(params: PresignedUrlParams): Promise<string>;
}
