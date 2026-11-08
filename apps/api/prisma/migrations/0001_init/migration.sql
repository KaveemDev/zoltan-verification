-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'OPENED', 'VERIFIED', 'SIGNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('VISA', 'TRAVEL', 'BOTH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "packageType" "PackageType" NOT NULL,
    "destination" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "notes" TEXT,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "consentTextVersion" TEXT,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "signingTokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "originalPdfKey" TEXT,
    "originalPdfSha256" TEXT,
    "signedPdfKey" TEXT,
    "signedPdfSha256" TEXT,
    "videoKey" TEXT,
    "videoSha256" TEXT,
    "videoMimeType" TEXT,
    "videoDurationSec" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceInfo" JSONB,
    "metadata" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agreementId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AgreementTemplate_name_version_key" ON "AgreementTemplate"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_signingTokenHash_key" ON "Agreement"("signingTokenHash");

-- CreateIndex
CREATE INDEX "Agreement_status_createdAt_idx" ON "Agreement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Agreement_customerPhone_idx" ON "Agreement"("customerPhone");

-- CreateIndex
CREATE INDEX "OtpChallenge_agreementId_createdAt_idx" ON "OtpChallenge"("agreementId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_agreementId_createdAt_idx" ON "AuditEvent"("agreementId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AgreementTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AuditEvent is append-only: block UPDATE, DELETE and TRUNCATE at the database level.
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();

CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_append_only();
