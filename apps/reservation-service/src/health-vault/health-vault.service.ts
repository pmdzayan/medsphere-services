import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { HealthVaultRepository } from './health-vault.repository';
import { UploadMedicalRecordDto } from './dto/upload-medical-record.dto';
import { UpdateMedicalRecordDto } from './dto/update-medical-record.dto';
import { MedicalRecordResponseDto } from './dto/medical-record-response.dto';
import { StorageProvider } from './storage/storage-provider.interface';

export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/dicom',
  'application/dicom',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

@Injectable()
export class HealthVaultService {
  constructor(
    private readonly repository: HealthVaultRepository,
    @Inject('STORAGE_PROVIDER') private readonly storageProvider: StorageProvider,
  ) {}

  async upload(
    userId: string,
    dto: UploadMedicalRecordDto,
    file: UploadFile,
  ): Promise<MedicalRecordResponseDto> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types: PDF, JPEG, PNG, TIFF, DICOM, DOC, DOCX`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      );
    }

    const uploadResult = await this.storageProvider.upload(
      userId,
      file.originalname,
      file.mimetype,
      file.buffer,
    );

    const record = await this.repository.create({
      userId,
      recordType: dto.recordType,
      title: dto.title,
      description: dto.description,
      fileUrl: uploadResult.fileUrl,
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      recordDate: new Date(dto.recordDate),
    });

    return this.toResponseDto(record);
  }

  async findById(userId: string, id: string): Promise<MedicalRecordResponseDto> {
    const record = await this.repository.findById(id);

    if (!record || record.deletedAt) {
      throw new NotFoundException('Medical record not found');
    }

    if (record.userId !== userId) {
      throw new ForbiddenException('You can only access your own medical records');
    }

    return this.toResponseDto(record);
  }

  async findByUser(userId: string): Promise<MedicalRecordResponseDto[]> {
    const records = await this.repository.findByUser(userId);
    return (
      records
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((record: any) => !record.deletedAt)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((record: any) => this.toResponseDto(record))
    );
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMedicalRecordDto,
  ): Promise<MedicalRecordResponseDto> {
    const existing = await this.repository.findById(id);

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Medical record not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only update your own medical records');
    }

    const updateData: Record<string, unknown> = {};

    if (dto.recordType !== undefined) updateData.recordType = dto.recordType;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.recordDate !== undefined) updateData.recordDate = new Date(dto.recordDate);

    const updated = await this.repository.update(id, updateData);
    return this.toResponseDto(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.repository.findById(id);

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Medical record not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own medical records');
    }

    await this.storageProvider.delete(existing.fileUrl);
    await this.repository.softDelete(id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toResponseDto(record: any): MedicalRecordResponseDto {
    const dto = new MedicalRecordResponseDto();
    dto.id = record.id;
    dto.userId = record.userId;
    dto.recordType = record.recordType;
    dto.title = record.title;
    dto.description = record.description ?? undefined;
    dto.fileUrl = record.fileUrl;
    dto.fileName = record.fileName;
    dto.fileSize = record.fileSize;
    dto.mimeType = record.mimeType;
    dto.recordDate =
      record.recordDate instanceof Date ? record.recordDate.toISOString() : record.recordDate;
    dto.uploadedAt =
      record.uploadedAt instanceof Date ? record.uploadedAt.toISOString() : record.uploadedAt;
    dto.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
    dto.updatedAt =
      record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt;
    return dto;
  }
}
