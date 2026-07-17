import { MedicalRecordType } from '../enums/medical-record-type.enum';

export class MedicalRecordResponseDto {
  id!: string;
  userId!: string;
  recordType!: MedicalRecordType;
  title!: string;
  description?: string;
  fileUrl!: string;
  fileName!: string;
  fileSize!: number;
  mimeType!: string;
  recordDate!: string;
  uploadedAt!: string;
  createdAt!: string;
  updatedAt!: string;
}
