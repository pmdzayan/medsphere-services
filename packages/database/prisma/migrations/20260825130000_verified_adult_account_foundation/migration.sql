-- Verified adult account foundation.
-- Stores only bounded verification outcomes/provenance. No raw government ID,
-- OTP, biometric, document image, or date-of-birth data is introduced.

CREATE TYPE "AccountVerificationMethod" AS ENUM ('PHONE', 'IDENTITY', 'AGE');
CREATE TYPE "AccountVerificationProvider" AS ENUM ('MOCK', 'EXTERNAL_IDENTITY_PROVIDER');

ALTER TABLE "User"
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "identityVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ageVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ageVerified18Plus" BOOLEAN;

CREATE TABLE "AccountVerificationAttempt" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "method" "AccountVerificationMethod" NOT NULL,
  "provider" "AccountVerificationProvider" NOT NULL,
  "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "providerReference" VARCHAR(240),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "commandHash" VARCHAR(64) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountVerificationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountVerificationAttempt_userId_provider_method_idempoten_key"
  ON "AccountVerificationAttempt"("userId", "provider", "method", "idempotencyKey");

CREATE INDEX "AccountVerificationAttempt_userId_method_status_createdAt_idx"
  ON "AccountVerificationAttempt"("userId", "method", "status", "createdAt" DESC);

ALTER TABLE "AccountVerificationAttempt"
  ADD CONSTRAINT "AccountVerificationAttempt_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
