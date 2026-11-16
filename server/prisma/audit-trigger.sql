-- Makes AuditEvent append-only at the database level (MySQL 8).
-- Applied separately from the migrations with `npm run db:protect-audit`, because some shared hosts
-- don't let ordinary database users create triggers. Without it the app still never changes audit
-- rows, and "Verify integrity" detects any change through the hash chain.
-- The admin purge sets @allow_audit_purge = 1 for its own DELETE and clears it straight after.
-- (MySQL triggers don't fire on TRUNCATE; only a privileged user can run that.)
DROP TRIGGER IF EXISTS audit_event_no_update;
CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON `AuditEvent` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditEvent is append-only (UPDATE blocked)';
DROP TRIGGER IF EXISTS audit_event_no_delete;
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON `AuditEvent` FOR EACH ROW
BEGIN
  IF COALESCE(@allow_audit_purge, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AuditEvent is append-only (DELETE blocked)';
  END IF;
END;
