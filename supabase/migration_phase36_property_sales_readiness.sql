-- =============================================================================
-- LEXBNB PHASE 36 — MULK SATIS HAZIRLIGI DURUMLARI
-- =============================================================================
-- Phase 31 housekeeping_status_overrides tablosunu olusturdu. O goc
-- degistirilemez; bu ileri yonlu goc ayni kalici kaydi satis hazirligi
-- sozlesmesine genisletir. Eski degerler mevcut satirlari bozmamak icin kabul
-- edilmeye devam eder ve istemci tarafinda yeni degerlere normalize edilir.
--
-- `paid` temizlik borcunun odeme durumudur. Bu tabloya veya kisita finansal
-- bir alan eklenmez; operasyonel hazirlik ayri bir kavram olarak kalir.
-- =============================================================================

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.housekeeping_status_overrides') IS NULL THEN
    RAISE EXCEPTION 'PHASE36_DEPENDENCY_MISSING: housekeeping_status_overrides (phase31)';
  END IF;
END
$preflight$;

ALTER TABLE public.housekeeping_status_overrides
  DROP CONSTRAINT IF EXISTS housekeeping_status_overrides_status_check;

ALTER TABLE public.housekeeping_status_overrides
  ADD CONSTRAINT housekeeping_status_overrides_status_check
  CHECK (status IN (
    'CLEANING', 'READY', 'OCCUPIED',
    'SALES_READY', 'NEEDS_CLEANING',
    'BLOCKED_MAINTENANCE', 'NON_BLOCKING_ISSUE'
  ));

DO $verify$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'housekeeping_status_overrides'
    AND c.conname = 'housekeeping_status_overrides_status_check'
    AND c.contype = 'c';

  IF v_constraint IS NULL
     OR strpos(v_constraint, 'SALES_READY') = 0
     OR strpos(v_constraint, 'NEEDS_CLEANING') = 0
     OR strpos(v_constraint, 'BLOCKED_MAINTENANCE') = 0
     OR strpos(v_constraint, 'NON_BLOCKING_ISSUE') = 0 THEN
    RAISE EXCEPTION 'PHASE36_STATUS_CONSTRAINT_INCOMPLETE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'housekeeping_status_overrides'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'PHASE36_RLS_DISABLED';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'housekeeping_status_overrides') < 4 THEN
    RAISE EXCEPTION 'PHASE36_POLICY_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'housekeeping_status_overrides'
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'PHASE36_ANON_TABLE_GRANT_PRESENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'housekeeping_status_overrides'
      AND grantee = 'authenticated'
      AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'PHASE36_AUTHENTICATED_WRITE_GRANT_MISSING';
  END IF;

  RAISE NOTICE 'PHASE 36 OK — mulk satis hazirligi durumlari kalici sozlesmeye eklendi.';
END
$verify$;

COMMIT;
