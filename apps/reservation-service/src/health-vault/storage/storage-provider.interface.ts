export interface UploadResult {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface StorageProvider {
  upload(userId: string, fileName: string, mimeType: string, buffer: Buffer): Promise<UploadResult>;

  delete(fileUrl: string): Promise<void>;
}
