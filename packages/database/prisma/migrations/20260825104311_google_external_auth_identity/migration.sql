-- CreateEnum
CREATE TYPE "ExternalAuthProvider" AS ENUM ('GOOGLE');

-- CreateTable
CREATE TABLE "ExternalAuthIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "ExternalAuthProvider" NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" CITEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalAuthIdentity_userId_idx" ON "ExternalAuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalAuthIdentity_provider_subject_key" ON "ExternalAuthIdentity"("provider", "subject");

-- AddForeignKey
ALTER TABLE "ExternalAuthIdentity" ADD CONSTRAINT "ExternalAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
