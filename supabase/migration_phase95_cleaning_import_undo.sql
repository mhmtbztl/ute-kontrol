-- Lexbnb phase95 — gecmis temizlik aktarimi geri alinabilir (kullanici M25, L-195, 15.10.2026).
--
-- Gider sablonu "temizlik buraya girilmez, gorevden yazilir" diyordu; ama
-- gecmis rezervasyonlarin temizlik gorevi yok, yani gecmis aylarda temizlik
-- maliyeti 0 ve kar oldugundan yuksek gorunuyordu. Kullanici karari (Claude'a
-- birakildi): gecmis temizlikler ayri bir sablonla, temizlik defterinin TEK
-- kaynagi olan cleaning_tasks'a "yapildi" (odendi ya da borc) olarak girer.
-- Gider tablosuna ikinci bir yol acilmadi: ayni maliyet iki yerde durursa
-- iki kez sayilir.
--
-- Bu goc yalniz o aktarimi GERI ALINABILIR yapar:
--   * finance_import_batch_rows'a cleaning_task_id (FK, ON DELETE CASCADE).
--     Hedef kurali "tam olarak biri dolu" olur.
--   * undo_finance_import temizligi de geri alir; kurallar rezervasyon ve
--     giderle ayni: kapanmis doneme dusen kayit varsa HIC baslamaz,
--     aktarimdan sonra elle degistirilmis kayit (updated_at > created_at)
--     silinmez, atlanir. Imza ayni; yanit deleted_cleaning_tasks ekler.
--
-- Dagitim sirasi: istemci temizlik aktarimini bu goc yokken BASLATMAZ
-- (geri alinamaz yuzlerce kayit yazmak yerine ne yapilacagini soyler).
-- Rezervasyon ve gider aktarimi goc oncesi ve sonrasi ayni calisir.

BEGIN;

ALTER TABLE public.finance_import_batch_rows
    ADD COLUMN IF NOT EXISTS cleaning_task_id UUID REFERENCES public.cleaning_tasks(id) ON DELETE CASCADE;

ALTER TABLE public.finance_import_batch_rows DROP CONSTRAINT IF EXISTS chk_batch_row_single_target;
ALTER TABLE public.finance_import_batch_rows ADD CONSTRAINT chk_batch_row_single_target
    CHECK (num_nonnulls(booking_id, expense_id, cleaning_task_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batch_rows_cleaning
    ON public.finance_import_batch_rows (cleaning_task_id) WHERE cleaning_task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.undo_finance_import(
    p_tenant_id UUID,
    p_batch_id  UUID,
    p_confirm   TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id          UUID;
    v_role             TEXT;
    v_batch            RECORD;
    v_bagli_rez        INT := 0;
    v_bagli_gid        INT := 0;
    v_bagli_tem        INT := 0;
    v_kapali_rez       INT := 0;
    v_kapali_gid       INT := 0;
    v_kapali_tem       INT := 0;
    v_silinen_rez      INT := 0;
    v_silinen_gid      INT := 0;
    v_silinen_tem      INT := 0;
    v_atlanan          INT := 0;
    v_parti_silindi    BOOLEAN := FALSE;
BEGIN
    -- --- Yetki: KAYIT ARANMADAN ONCE (CLAUDE.md 7) -------------------------
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

    -- `IS NULL` ayri kontrol edilir (NULL NOT IN tuzagi, CLAUDE.md 7).
    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Bu işlem için işletme sahibi, yönetici veya müdür yetkisi gerekir.'
            USING ERRCODE = '42501';
    END IF;

    IF p_confirm IS DISTINCT FROM 'AKTARIMI GERI AL' THEN
        RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Geri almak için onay metnini birebir yazın: AKTARIMI GERI AL'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_batch
    FROM public.finance_import_batches
    WHERE id = p_batch_id AND tenant_id = p_tenant_id;

    IF v_batch.id IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: İçe aktarım kaydı bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- --- Bagli kayit sayisi -------------------------------------------------
    SELECT
        COUNT(*) FILTER (WHERE r.booking_id IS NOT NULL),
        COUNT(*) FILTER (WHERE r.expense_id IS NOT NULL),
        COUNT(*) FILTER (WHERE r.cleaning_task_id IS NOT NULL)
    INTO v_bagli_rez, v_bagli_gid, v_bagli_tem
    FROM public.finance_import_batch_rows r
    WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id;

    -- --- Kapanmis donem: varsa HIC BASLAMA ----------------------------------
    SELECT COUNT(*) INTO v_kapali_rez
    FROM public.finance_import_batch_rows r
    JOIN public.bookings b ON b.id = r.booking_id
    WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
      AND EXISTS (
          SELECT 1 FROM public.monthly_financial_closes c
          WHERE c.tenant_id = p_tenant_id
            AND c.year = EXTRACT(YEAR FROM b.check_in)::INT
            AND c.month = EXTRACT(MONTH FROM b.check_in)::INT
            AND c.status = 'CLOSED'
      );

    SELECT COUNT(*) INTO v_kapali_gid
    FROM public.finance_import_batch_rows r
    JOIN public.expenses e ON e.id = r.expense_id
    WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
      AND EXISTS (
          SELECT 1 FROM public.monthly_financial_closes c
          WHERE c.tenant_id = p_tenant_id
            AND c.year = EXTRACT(YEAR FROM e.expense_date)::INT
            AND c.month = EXTRACT(MONTH FROM e.expense_date)::INT
            AND c.status = 'CLOSED'
      );

    SELECT COUNT(*) INTO v_kapali_tem
    FROM public.finance_import_batch_rows r
    JOIN public.cleaning_tasks t ON t.id = r.cleaning_task_id
    WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
      AND EXISTS (
          SELECT 1 FROM public.monthly_financial_closes c
          WHERE c.tenant_id = p_tenant_id
            AND c.year = EXTRACT(YEAR FROM t.task_date)::INT
            AND c.month = EXTRACT(MONTH FROM t.task_date)::INT
            AND c.status = 'CLOSED'
      );

    IF (v_kapali_rez + v_kapali_gid + v_kapali_tem) > 0 THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_BLOCK: Bu aktarımın % kaydı kapatılmış bir döneme ait. Geri alma yarıda bırakılamayacağı için hiçbir kayıt silinmedi. Önce ilgili dönemi açın.',
            (v_kapali_rez + v_kapali_gid + v_kapali_tem)
            USING ERRCODE = '42501';
    END IF;

    -- --- Silme: SONRADAN DEGISTIRILMIS kayitlar ATLANIR (phase37: tam esitlik)
    WITH hedef AS (
        SELECT b.id
        FROM public.finance_import_batch_rows r
        JOIN public.bookings b ON b.id = r.booking_id
        WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
          AND b.tenant_id = p_tenant_id
          AND b.updated_at <= b.created_at
    ), silinen AS (
        DELETE FROM public.bookings b
        USING hedef h
        WHERE b.id = h.id AND b.tenant_id = p_tenant_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_silinen_rez FROM silinen;

    WITH hedef AS (
        SELECT e.id
        FROM public.finance_import_batch_rows r
        JOIN public.expenses e ON e.id = r.expense_id
        WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
          AND e.tenant_id = p_tenant_id
          AND e.updated_at <= e.created_at
    ), silinen AS (
        DELETE FROM public.expenses e
        USING hedef h
        WHERE e.id = h.id AND e.tenant_id = p_tenant_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_silinen_gid FROM silinen;

    -- Temizlik: "Ödendi" isaretlemek de bir duzenlemedir (updated_at ileri
    -- kayar); o kayit artik kullanicinin emegidir ve silinmez.
    WITH hedef AS (
        SELECT t.id
        FROM public.finance_import_batch_rows r
        JOIN public.cleaning_tasks t ON t.id = r.cleaning_task_id
        WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
          AND t.tenant_id = p_tenant_id
          AND t.updated_at <= t.created_at
    ), silinen AS (
        DELETE FROM public.cleaning_tasks t
        USING hedef h
        WHERE t.id = h.id AND t.tenant_id = p_tenant_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_silinen_tem FROM silinen;

    v_atlanan := (v_bagli_rez + v_bagli_gid + v_bagli_tem) - (v_silinen_rez + v_silinen_gid + v_silinen_tem);

    -- Her sey geri alindiysa parti da silinir; ayni dosya yeniden yuklenebilir.
    IF v_atlanan = 0 THEN
        DELETE FROM public.finance_import_batches
        WHERE id = p_batch_id AND tenant_id = p_tenant_id;
        v_parti_silindi := TRUE;
    END IF;

    RETURN json_build_object(
        'success', TRUE,
        'batch_id', p_batch_id,
        'filename', v_batch.filename,
        'linked_total', v_bagli_rez + v_bagli_gid + v_bagli_tem,
        'deleted_bookings', v_silinen_rez,
        'deleted_expenses', v_silinen_gid,
        'deleted_cleaning_tasks', v_silinen_tem,
        'skipped_modified', v_atlanan,
        'batch_removed', v_parti_silindi
    );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) TO authenticated;

DO $verify$
DECLARE
    v_src TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                    AND table_name = 'finance_import_batch_rows' AND column_name = 'cleaning_task_id') THEN
        RAISE EXCEPTION 'PHASE95_COLUMN_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_batch_row_single_target'
                    AND pg_get_constraintdef(oid) LIKE '%num_nonnulls%cleaning_task_id%') THEN
        RAISE EXCEPTION 'PHASE95_TARGET_CHECK';
    END IF;
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.undo_finance_import(UUID, UUID, TEXT)'::regprocedure;
    IF position('t.updated_at <= t.created_at' IN v_src) = 0 OR position('v_kapali_tem' IN v_src) = 0 THEN
        RAISE EXCEPTION 'PHASE95_CLEANING_UNDO_MISSING';
    END IF;
    -- phase35/37 kazanimlari korunmus olmali.
    IF position('b.updated_at <= b.created_at' IN v_src) = 0 OR position('e.updated_at <= e.created_at' IN v_src) = 0
       OR position('INTERVAL' IN v_src) > 0 THEN
        RAISE EXCEPTION 'PHASE95_EXACT_MATCH_LOST';
    END IF;
    IF position('AKTARIMI GERI AL' IN v_src) = 0 OR position('CLOSED_PERIOD_BLOCK' IN v_src) = 0 THEN
        RAISE EXCEPTION 'PHASE95_GUARD_LOST';
    END IF;
    IF position('tenant_members' IN v_src) > position('finance_import_batches' IN v_src) THEN
        RAISE EXCEPTION 'PHASE95_AUTHZ_ORDER';
    END IF;
    IF has_function_privilege('anon', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE95_ANON_EXECUTE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE95_AUTHENTICATED_EXECUTE_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 95 OK — gecmis temizlik aktarimi geri alinabilir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (95, 'phase95_cleaning_import_undo')
ON CONFLICT (version) DO NOTHING;

COMMIT;
