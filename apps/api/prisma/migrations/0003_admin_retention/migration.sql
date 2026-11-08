-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Agreement" ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "purgedById" TEXT,
ADD COLUMN     "retentionDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Agreement_retentionDueAt_idx" ON "Agreement"("retentionDueAt");


-- AuditEvent stays append-only. The one exception is an admin purge (retention / erasure
-- request), which deletes an agreement's events inside a transaction that first runs
-- SET LOCAL app.allow_audit_purge = 'on'. UPDATE and TRUNCATE are always rejected.
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.allow_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditEvent is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
