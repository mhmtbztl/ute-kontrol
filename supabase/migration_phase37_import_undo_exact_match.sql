-- =============================================================================
-- PHASE 37: GERI ALMADA "DEGISMIS KAYIT" OLCUMUNU DUZELT
-- =============================================================================
-- SORUN (phase35'in canli suiti yakaladi, 2026-09-22):
--
--   phase35 "sonradan elle duzenlenmis kaydi silme, atla" kurali koydu ve
--   olcutu soyle yazdi:
--
--       b.updated_at <= b.created_at + INTERVAL '2 seconds'
--
--   Iki saniyelik pay, olusturma anindaki tetikleyici guncellemelerini
--   yutmak icin konulmustu. GEREKSIZDI VE ZARARLIYDI.
--
--   Test projesinde olculdu:
--       INSERT -> created_at = updated_at   (birebir ayni; ikisi de NOW())
--       UPDATE -> updated_at 82 ms sonraya kayiyor
--
--   `set_updated_at` (phase24) yalnizca BEFORE UPDATE calisir; olusturma
--   aninda `updated_at`'e hic dokunmaz. Yani pay hicbir seyi korumuyordu.
--   Buna karsilik gercek bir zarari vardi: aktarimdan HEMEN SONRA — ki en
--   olagan durum budur, kullanici yanlisi fark edip duzeltir — yapilan bir
--   duzenleme "degismemis" sayiliyor ve geri alma kullanicinin emegini
--   SESSIZCE siliyordu.
--
--   Canli suit ilk kosusunda 6., 7. ve 8. iddialar bu yuzden kirmiziydi:
--   duzenlenmis rezervasyon atlanmasi gerekirken silinmisti.
--
-- COZUM:
--   Karsilastirma TAM ESITLIK olur; pay kaldirilir. Fonksiyonun geri kalani
--   phase35'teki gibidir (CREATE OR REPLACE govdeyi butunuyle degistirir).
--
-- NEDEN phase35 DUZELTILMEDI:
--   Goc dosyalari bir veritabanina uygulandiktan sonra DEGISMEZDIR ve
--   `bootstrap_test_project.js` bunu kapida reddeder ("baska bir icerikle
--   uygulanmis"). Duzeltme yeni bir goc olarak gelir (AGENTS.md; Claude tek
--   numara).
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir. phase35'ten SONRA uygulanmalidir.
-- =============================================================================

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
    v_kapali_rez       INT := 0;
    v_kapali_gid       INT := 0;
    v_silinen_rez      INT := 0;
    v_silinen_gid      INT := 0;
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

    -- `IS NULL` ayri kontrol edilir. `NULL NOT IN (...)` sonucu TRUE degil
    -- NULL'dur ve `IF NULL THEN` calismaz; koruma TAM DA korumasi gereken
    -- anda (yabanci kiracidan gelen cagri) sessizce atlanirdi (CLAUDE.md 7).
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
        COUNT(*) FILTER (WHERE r.expense_id IS NOT NULL)
    INTO v_bagli_rez, v_bagli_gid
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

    IF (v_kapali_rez + v_kapali_gid) > 0 THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_BLOCK: Bu aktarımın % kaydı kapatılmış bir döneme ait. Geri alma yarıda bırakılamayacağı için hiçbir kayıt silinmedi. Önce ilgili dönemi açın.',
            (v_kapali_rez + v_kapali_gid)
            USING ERRCODE = '42501';
    END IF;

    -- --- Silme: SONRADAN DEGISTIRILMIS kayitlar ATLANIR ---------------------
    --
    -- PHASE 37 DEGISIKLIGI: karsilastirma TAM ESITLIK, pay YOK.
    --   INSERT -> created_at = updated_at (birebir)
    --   UPDATE -> updated_at ileri kayar (olculen: 82 ms)
    -- phase35'teki 2 saniyelik pay, aktarimdan hemen sonra yapilan
    -- duzenlemeyi "degismemis" sayip kullanicinin emegini siliyordu.
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

    v_atlanan := (v_bagli_rez + v_bagli_gid) - (v_silinen_rez + v_silinen_gid);

    -- Her sey geri alindiysa parti da silinir; boylece ayni dosya yeniden
    -- yuklenebilir. Atlanan kayit varsa parti DURUR.
    IF v_atlanan = 0 THEN
        DELETE FROM public.finance_import_batches
        WHERE id = p_batch_id AND tenant_id = p_tenant_id;
        v_parti_silindi := TRUE;
    END IF;

    RETURN json_build_object(
        'success', TRUE,
        'batch_id', p_batch_id,
        'filename', v_batch.filename,
        'linked_total', v_bagli_rez + v_bagli_gid,
        'deleted_bookings', v_silinen_rez,
        'deleted_expenses', v_silinen_gid,
        'skipped_modified', v_atlanan,
        'batch_removed', v_parti_silindi
    );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_finance_import(UUID, UUID, TEXT) TO authenticated;

-- =============================================================================
-- DOGRULAMA
-- =============================================================================
DO $verify$
DECLARE
    v_src TEXT;
BEGIN
    IF to_regprocedure('public.undo_finance_import(UUID, UUID, TEXT)') IS NULL THEN
        RAISE EXCEPTION 'PHASE37_FUNCTION_MISSING: undo_finance_import yok';
    END IF;

    SELECT prosrc INTO v_src FROM pg_proc
    WHERE oid = 'public.undo_finance_import(UUID, UUID, TEXT)'::regprocedure;

    -- Asil duzeltme: zaman payi govdede KALMAMALI.
    IF position('INTERVAL ''2 seconds''' IN v_src) > 0 THEN
        RAISE EXCEPTION 'PHASE37_TOLERANCE_STILL_PRESENT: 2 saniyelik pay duruyor; aktarimdan hemen sonraki duzenleme silinir';
    END IF;

    IF position('b.updated_at <= b.created_at' IN v_src) = 0
       OR position('e.updated_at <= e.created_at' IN v_src) = 0 THEN
        RAISE EXCEPTION 'PHASE37_EXACT_MATCH_MISSING: tam esitlik olcutu yok';
    END IF;

    -- phase35'in kazanimlari korunmus olmali.
    IF position('CLOSED_PERIOD_BLOCK' IN v_src) = 0 THEN
        RAISE EXCEPTION 'PHASE37_CLOSED_PERIOD_LOST: kapanmis donem korumasi kayboldu';
    END IF;
    IF position('AKTARIMI GERI AL' IN v_src) = 0 THEN
        RAISE EXCEPTION 'PHASE37_CONFIRM_LOST: yazili onay kayboldu';
    END IF;
    IF position('tenant_members' IN v_src) > position('finance_import_batches' IN v_src) THEN
        RAISE EXCEPTION 'PHASE37_AUTHZ_ORDER: yetki kontrolu kayit aramasindan SONRA';
    END IF;

    IF has_function_privilege('anon', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE37_ANON_EXECUTE_PRESENT: anon cagirabiliyor';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE37_AUTHENTICATED_EXECUTE_MISSING: authenticated cagiramiyor';
    END IF;

    RAISE NOTICE 'PHASE 37 OK — degismis kayit olcumu tam esitlik, zaman payi kaldirildi.';
END $verify$;
