/**
 * Document management domain enums.
 *
 * These mirror the Prisma schema enums for type-safe usage in the
 * document-management-service without importing Prisma-generated types directly.
 */

export enum DocumentCategory {
  CLINICAL_NOTE_ATTACHMENT = 'CLINICAL_NOTE_ATTACHMENT',
  LAB_REPORT_PDF = 'LAB_REPORT_PDF',
  PRESCRIPTION_SCAN = 'PRESCRIPTION_SCAN',
  RADIOLOGY_DICOM = 'RADIOLOGY_DICOM',
  PATIENT_IDENTIFICATION = 'PATIENT_IDENTIFICATION',
  INSURANCE_CARD = 'INSURANCE_CARD',
  GENERAL_ATTACHMENT = 'GENERAL_ATTACHMENT',
}

export enum StorageProviderType {
  S3 = 'S3',
  MINIO = 'MINIO',
  LOCAL_DISK = 'LOCAL_DISK',
}
