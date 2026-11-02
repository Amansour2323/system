\set ON_ERROR_STOP on
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
DO $correction$
DECLARE
  m "CashMovement"%ROWTYPE;
  original_entry "JournalEntry"%ROWTYPE;
  cash_id text; clearing_id text; capital_id text;
  reverse_id text := gen_random_uuid()::text;
  corrected_id text := gen_random_uuid()::text;
  target_day date := DATE '2026-10-31';
BEGIN
  SELECT * INTO STRICT m FROM "CashMovement" WHERE number = 'DEP-69396583-367' FOR UPDATE;
  IF m.type::text <> 'SAFE_DEPOSIT' OR m.status::text <> 'APPROVED' OR m."paymentMethod"::text <> 'CASH'
    OR m.amount <> 113000 OR m."businessDate" <> DATE '2026-11-01' OR m."requestedById" IS NULL THEN
    RAISE EXCEPTION 'Movement does not match the expected original deposit; no changes made';
  END IF;
  IF EXISTS (SELECT 1 FROM "FiscalPeriod" WHERE status::text = 'CLOSED' AND "startsAt"::date <= DATE '2026-11-01' AND "endsAt"::date >= target_day) THEN
    RAISE EXCEPTION 'Financial period is closed; no changes made';
  END IF;
  IF EXISTS (SELECT 1 FROM "JournalEntry" WHERE "referenceType" = 'CashMovementCorrection' AND "referenceId" = m.id) THEN
    RAISE EXCEPTION 'Correction already exists; no changes made';
  END IF;
  SELECT id INTO STRICT cash_id FROM "Account" WHERE code = '1000' AND active = true AND type = 'ASSET';
  SELECT id INTO STRICT clearing_id FROM "Account" WHERE code = '2101' AND active = true;
  SELECT id INTO STRICT capital_id FROM "Account" WHERE code = '3001' AND active = true AND type = 'EQUITY';
  SELECT * INTO STRICT original_entry FROM "JournalEntry" WHERE "referenceType" = 'CashMovement' AND "referenceId" = m.id FOR UPDATE;
  IF original_entry."businessDate" <> DATE '2026-11-01' OR original_entry.status::text <> 'POSTED'
    OR (SELECT count(*) FROM "JournalLine" WHERE "journalEntryId" = original_entry.id) <> 2
    OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "journalEntryId" = original_entry.id AND "accountId" = cash_id AND debit = 113000 AND credit = 0)
    OR NOT EXISTS (SELECT 1 FROM "JournalLine" WHERE "journalEntryId" = original_entry.id AND "accountId" = clearing_id AND debit = 0 AND credit = 113000) THEN
    RAISE EXCEPTION 'Original journal does not match expected entries; no changes made';
  END IF;
  INSERT INTO "JournalEntry" (id, number, description, "referenceType", "referenceId", "createdById", "occurredAt", "businessDate", "createdAt") VALUES
    (reverse_id, 'CORR-REV-' || m.number, 'عكس قيد إيداع المالك الخاطئ', 'CashMovementCorrection', m.id, m."requestedById", now(), m."businessDate", now()),
    (corrected_id, 'CORR-CAP-' || m.number, 'إثبات إيداع رأس مال المالك بالتاريخ الصحيح', 'CashMovementCorrection', m.id, m."requestedById", now(), target_day, now());
  INSERT INTO "JournalLine" (id, "journalEntryId", "accountId", debit, credit) VALUES
    (gen_random_uuid()::text, reverse_id, clearing_id, 113000, 0),
    (gen_random_uuid()::text, reverse_id, cash_id, 0, 113000),
    (gen_random_uuid()::text, corrected_id, cash_id, 113000, 0),
    (gen_random_uuid()::text, corrected_id, capital_id, 0, 113000);
  UPDATE "CashMovement" SET "businessDate" = target_day WHERE id = m.id;
  INSERT INTO "AuditLog" (id, action, entity, "entityId", payload, "userId", "createdAt") VALUES
    (gen_random_uuid()::text, 'CORRECT_BUSINESS_DATE_AND_CAPITAL', 'CashMovement', m.id,
      jsonb_build_object('movementNumber', m.number, 'oldBusinessDate', m."businessDate", 'newBusinessDate', target_day, 'oldAccount', '2101', 'newAccount', '3001', 'reversalEntryId', reverse_id, 'correctedEntryId', corrected_id), m."requestedById", now());
  RAISE NOTICE 'Deposit correction applied once: %', m.number;
END
$correction$;
COMMIT;
