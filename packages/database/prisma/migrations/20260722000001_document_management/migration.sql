-- Gate 8: Document Management & Secure Object Storage
--
-- Adds document metadata tracking, SHA-256 checksum verification,
-- encrypted PHI storage, time-bounded pre-signed URLs, digital
-- signature verification for clinical sign-offs, and complete
-- access logging per document download.

-- === Enums ===

CREATE TYPE "DocumentCategory" AS ENUM (
  'CLINICAL_NOTE_ATTACHMENT',
  'LAB_REPORT_PDF',
  'PRESCRIPTION_SCAN',
  'RADIOLOGY_DICOM',
  'PATIENT_IDENTIFICATION',
  'INSURANCE_CARD',
  'GENERAL_ATTACHMENT'
);

CREATE TYPE "StorageProviderType" AS ENUM ('S3', 'MINIO', 'LOCAL_DISK');

-- === Tables ===

CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID,
    "uploaderId" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "isSigned" BOOLEAN NOT NULL DEFAULT false,
    "signatureData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_access_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "accessedById" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- === Constraints ===

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents"
    ADD CONSTRAINT "documents_uploaderId_fkey"
    FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
    ADD CONSTRAINT "document_access_logs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
    ADD CONSTRAINT "document_access_logs_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "document_access_logs"
    ADD CONSTRAINT "document_access_logs_accessedById_fkey"
    FOREIGN KEY ("accessedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === Indexes ===

CREATE INDEX "documents_tenantId_patientId_idx"
    ON "documents"("tenantId", "patientId");

CREATE INDEX "documents_tenantId_category_idx"
    ON "documents"("tenantId", "category");

CREATE INDEX "documents_checksumSha256_idx"
    ON "documents"("checksumSha256");

CREATE INDEX "document_access_logs_tenantId_documentId_idx"
    ON "document_access_logs"("tenantId", "documentId");

CREATE INDEX "document_access_logs_accessedById_idx"
    ON "document_access_logs"("accessedById");
