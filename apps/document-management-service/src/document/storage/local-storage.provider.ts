import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProviderType } from '../enums';
import {
  StorageProvider,
  StorageOperationResult,
  UploadParams,
  DownloadParams,
  PresignedUrlParams,
} from './storage-provider.interface';

/**
 * Local disk storage provider.
 *
 * Stores files on the local filesystem under a configurable base directory.
 * This provider is suitable for development and testing environments where
 * a full object storage backend is not available.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly providerType = StorageProviderType.LOCAL_DISK;
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly baseDir: string;

  constructor() {
    this.baseDir = process.env.LOCAL_STORAGE_BASE_DIR ?? './storage';
  }

  private resolvePath(bucket: string, key: string): string {
    return path.join(this.baseDir, bucket, key);
  }

  async upload(params: UploadParams): Promise<StorageOperationResult> {
    const filePath = this.resolvePath(params.bucket, params.key);
    this.logger.log(`Local upload: path="${filePath}" size=${params.body.length} bytes`);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, params.body);

    return {
      success: true,
      key: params.key,
      bucket: params.bucket,
    };
  }

  async download(params: DownloadParams): Promise<Buffer> {
    const filePath = this.resolvePath(params.bucket, params.key);
    this.logger.log(`Local download: path="${filePath}"`);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`File not found: ${filePath}`);
      }
      throw error;
    }
  }

  async delete(bucket: string, key: string): Promise<StorageOperationResult> {
    const filePath = this.resolvePath(bucket, key);
    this.logger.log(`Local delete: path="${filePath}"`);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, errorMessage: `File not found: ${filePath}`, key, bucket };
      }
      throw error;
    }

    return { success: true, key, bucket };
  }

  async generatePresignedUploadUrl(params: PresignedUrlParams): Promise<string> {
    this.logger.log(
      `Local presigned upload URL: bucket="${params.bucket}" key="${params.key}" expiresIn=${params.expiresInSeconds}s`,
    );

    // For local disk, the "URL" is a file path reference.
    // In a real deployment, this would be served via a static file server.
    return `file://${this.resolvePath(params.bucket, params.key)}?expires=${params.expiresInSeconds}`;
  }

  async generatePresignedDownloadUrl(params: PresignedUrlParams): Promise<string> {
    this.logger.log(
      `Local presigned download URL: bucket="${params.bucket}" key="${params.key}" expiresIn=${params.expiresInSeconds}s`,
    );

    return `file://${this.resolvePath(params.bucket, params.key)}?expires=${params.expiresInSeconds}`;
  }
}
