-- DropIndex
DROP INDEX "AuditEvent_agreementId_createdAt_idx";

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "seq" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_agreementId_seq_key" ON "AuditEvent"("agreementId", "seq");

