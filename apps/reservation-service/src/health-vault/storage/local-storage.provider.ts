import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, UploadResult } from './storage-provider.interface';

function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor() {
    this.basePath =
      process.env.HEALTH_VAULT_STORAGE_PATH || path.join(process.cwd(), 'uploads', 'health-vault');
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(
    userId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<UploadResult> {
    const userDir = path.join(this.basePath, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const uniqueName = `${generateUniqueId()}-${fileName}`;
    const filePath = path.join(userDir, uniqueName);

    fs.writeFileSync(filePath, buffer);

    return {
      fileUrl: `/uploads/health-vault/${userId}/${uniqueName}`,
      fileName,
      fileSize: buffer.length,
      mimeType,
    };
  }

  async delete(fileUrl: string): Promise<void> {
    // Convert URL path to filesystem path
    const relativePath = fileUrl.replace('/uploads/health-vault/', '');
    const filePath = path.join(this.basePath, relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
