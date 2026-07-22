import { Injectable, Logger } from '@nestjs/common';
import { StorageProviderType } from '../enums';
import {
  StorageProvider,
  StorageOperationResult,
  UploadParams,
  DownloadParams,
  PresignedUrlParams,
} from './storage-provider.interface';

/**
 * MinIO storage provider.
 *
 * In production, this provider would use the MinIO SDK (@minio/minio)
 * to interact with MinIO object storage. For development and testing,
 * it simulates storage operations by logging actions and returning
 * synthetic results, similar to the notification-service's mock provider.
 */
@Injectable()
export class MinioStorageProvider implements StorageProvider {
  readonly providerType = StorageProviderType.MINIO;
  private readonly logger = new Logger(MinioStorageProvider.name);

  async upload(params: UploadParams): Promise<StorageOperationResult> {
    const key = `${params.bucket}/${params.key}`;
    this.logger.log(
      `MinIO upload: bucket="${params.bucket}" key="${params.key}" size=${params.body.length} bytes`,
    );

    // In production, this would use:
    // await this.minioClient.putObject(params.bucket, params.key, params.body, params.body.length, params.metadata);

    return {
      success: true,
      key,
      bucket: params.bucket,
    };
  }

  async download(params: DownloadParams): Promise<Buffer> {
    this.logger.log(`MinIO download: bucket="${params.bucket}" key="${params.key}"`);

    // In production, this would use:
    // const stream = await this.minioClient.getObject(params.bucket, params.key);
    // return Buffer.from(await streamToBuffer(stream));

    // Simulated: return empty buffer for development
    return Buffer.alloc(0);
  }

  async delete(bucket: string, key: string): Promise<StorageOperationResult> {
    this.logger.log(`MinIO delete: bucket="${bucket}" key="${key}"`);

    // In production, this would use:
    // await this.minioClient.removeObject(bucket, key);

    return { success: true, key, bucket };
  }

  async generatePresignedUploadUrl(params: PresignedUrlParams): Promise<string> {
    this.logger.log(
      `MinIO presigned upload URL: bucket="${params.bucket}" key="${params.key}" expiresIn=${params.expiresInSeconds}s`,
    );

    // In production, this would use:
    // return await this.minioClient.presignedPutObject(params.bucket, params.key, params.expiresInSeconds);

    // Simulated: return a synthetic pre-signed URL
    return `http://localhost:9000/${params.bucket}/${params.key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${params.expiresInSeconds}`;
  }

  async generatePresignedDownloadUrl(params: PresignedUrlParams): Promise<string> {
    this.logger.log(
      `MinIO presigned download URL: bucket="${params.bucket}" key="${params.key}" expiresIn=${params.expiresInSeconds}s`,
    );

    // In production, this would use:
    // return await this.minioClient.presignedGetObject(params.bucket, params.key, params.expiresInSeconds);

    // Simulated: return a synthetic pre-signed URL
    return `http://localhost:9000/${params.bucket}/${params.key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${params.expiresInSeconds}`;
  }
}
