-- =============================================================================
-- PHASE 35: ICE AKTARIMI GERI ALMA
-- =============================================================================
-- SORUN:
--   Ice aktarma tek seferde yuzlerce kayit yazabiliyor. Dosya yanlis secildiyse
--   ya da sutunlar yanlis eslestiyse kullanicinin elinde 300 hatali kayit
--   kaliyor ve TEK TEK silmekten baska yolu yok. Kapanmis donem korumasi
--   ve cakisma kontrolu bozuk VERIYI degil, bozuk BICIMI yakalar; "yanlis
--   dosyayi yukledim" hicbir kapiya takilmiyor.
--
--   `finance_import_batches` zaten her aktarimi kaydediyordu (dosya parmak
--   izi, satir sayisi, tutar) ama olusturulan kayitlarla ARASINDA BAG YOKTU.
--   Yani "bu aktarim neyi yazdi" sorusunun cevabi hicbir yerde durmuyordu.
--
-- COZUM:
--   1. `finance_import_batch_rows` — aktarim ile yazdigi kayit arasindaki bag.
--   2. `undo_finance_import()` — tek transaction, yazili onay, owner/admin/manager.
--
-- NEDEN `bookings`/`expenses`'E SUTUN EKLENMEDI:
--   GitHub Pages push ile ANINDA yayina alir, gocler ELLE uygulanir. Kod her
--   zaman gocten once canliya cikabilir. `bookings`'e temizlik maliyeti sutunu
--   eklendiginde goc uygulanana kadar HICBIR REZERVASYON KAYDEDILEMEDI
--   (CLAUDE.md 3.4) cunku `mapBookingToDb()` ciktisi dogrudan insert ediliyor.
--   Ayni tuzak burada da gecerliydi. Bag ayri tabloda durur: goc uygulanana
--   kadar yalnizca GERI ALMA calismaz, ice aktarmanin kendisi calismaya
--   devam eder. phase31'deki fiyat merdiveni karariyla ayni gerekce.
--
-- IKI DAVRANIS KARARI:
--   * SONRADAN DEGISTIRILMIS kayit SILINMEZ, atlanir. Kullanici aktarimdan
--     sonra bir kaydi elle duzelttiyse o artik "aktarilan veri" degil, onun
--     emegidir; geri alma onu yok saymamalidir.
--   * KAPANMIS DONEME dusen kayit varsa islem HIC BASLAMAZ. Yarisini silip
--     yarisini birakmak, geri alinmasi istenen karisikligin daha kotusunu
--     uretirdi. Kullaniciya kac kayit oldugu soylenir; donemi acip
--     tekrar dener.
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BAG TABLOSU
-- -----------------------------------------------------------------------------
-- `record_id` yerine IKI AYRI FK tutulur. Tek bir polimorfik sutun olsaydi
-- kayit baska bir yoldan silindiginde bag satiri SARKIK kalirdi; iki FK ile
-- ON DELETE CASCADE bunu kendiliginden temizler.
CREATE TABLE IF NOT EXISTS public.finance_import_batch_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.finance_import_batches(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    source_row_num INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_batch_row_single_target CHECK (
        (booking_id IS NOT NULL AND expense_id IS NULL)
        OR (booking_id IS NULL AND expense_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_import_batch_rows_batch
    ON public.finance_import_batch_rows (tenant_id, batch_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batch_rows_booking
    ON public.finance_import_batch_rows (booking_id) WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batch_rows_expense
    ON public.finance_import_batch_rows (expense_id) WHERE expense_id IS NOT NULL;

ALTER TABLE public.finance_import_batch_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view import rows" ON public.finance_import_batch_rows;
CREATE POLICY "Members view import rows" ON public.finance_import_batch_rows
FOR SELECT USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Staff insert import rows" ON public.finance_import_batch_rows;
CREATE POLICY "Staff insert import rows" ON public.finance_import_batch_rows
FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND public.get_tenant_role(tenant_id) IN ('owner', 'admin', 'manager', 'staff')
);

-- Silme YALNIZCA RPC uzerinden. Dogrudan DELETE politikasi bilerek yoktur:
-- bagi tek tek silebilmek, geri almayi sessizce etkisizlestirmenin yolu olurdu.

-- Supabase `public` semasindaki yeni tabloya varsayilan olarak anon yetkisi
-- verir; `FROM PUBLIC` bunu KALDIRMAZ (CLAUDE.md 7).
REVOKE ALL ON TABLE public.finance_import_batch_rows FROM PUBLIC;
REVOKE ALL ON TABLE public.finance_import_batch_rows FROM anon;
GRANT SELECT, INSERT ON TABLE public.finance_import_batch_rows TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. GERI ALMA
-- -----------------------------------------------------------------------------
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
    -- Koruma tetikleyicisiyle ayni olcut kullanilir (check_in / expense_date
    -- ayinin kapanmis olmasi). Tetikleyiciye carpmayi beklemek de olurdu ama
    -- o zaman kullaniciya kac kaydin engellendigi soylenemezdi.
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
    -- Olcut kaydin KENDI zaman damgalaridir, partinin degil: parti satiri
    -- kayitlardan sonra yazildigi icin `imported_at` karsilastirmasi her
    -- kaydi "degismis" gosterirdi. 2 saniyelik pay, olusturma anindaki
    -- tetikleyici guncellemeleri icindir.
    WITH hedef AS (
        SELECT b.id
        FROM public.finance_import_batch_rows r
        JOIN public.bookings b ON b.id = r.booking_id
        WHERE r.batch_id = p_batch_id AND r.tenant_id = p_tenant_id
          AND b.tenant_id = p_tenant_id
          AND b.updated_at <= b.created_at + INTERVAL '2 seconds'
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
          AND e.updated_at <= e.created_at + INTERVAL '2 seconds'
    ), silinen AS (
        DELETE FROM public.expenses e
        USING hedef h
        WHERE e.id = h.id AND e.tenant_id = p_tenant_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_silinen_gid FROM silinen;

    v_atlanan := (v_bagli_rez + v_bagli_gid) - (v_silinen_rez + v_silinen_gid);

    -- --- Parti kaydi --------------------------------------------------------
    -- Her sey geri alindiysa parti da silinir; boylece ayni dosya yeniden
    -- yuklenebilir (mukerrer engeli artik yanlis olurdu). Atlanan kayit
    -- varsa parti DURUR: geriye kalanin hangi aktarimdan geldigi
    -- soylenebilir olmali.
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
    v_eksik TEXT;
BEGIN
    IF to_regclass('public.finance_import_batch_rows') IS NULL THEN
        RAISE EXCEPTION 'PHASE35_TABLE_MISSING: finance_import_batch_rows olusmadi';
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid = 'public.finance_import_batch_rows'::regclass) THEN
        RAISE EXCEPTION 'PHASE35_RLS_DISABLED: bag tablosunda RLS kapali';
    END IF;

    IF (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'finance_import_batch_rows') < 2 THEN
        RAISE EXCEPTION 'PHASE35_POLICY_MISSING: bag tablosunda politika eksik';
    END IF;

    -- Dogrudan DELETE politikasi OLMAMALI: bag silinebilseydi geri alma
    -- sessizce etkisizlestirilebilirdi.
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'finance_import_batch_rows'
                 AND cmd = 'DELETE') THEN
        RAISE EXCEPTION 'PHASE35_DELETE_POLICY_PRESENT: bag dogrudan silinebiliyor';
    END IF;

    IF has_table_privilege('anon', 'public.finance_import_batch_rows', 'SELECT') THEN
        RAISE EXCEPTION 'PHASE35_ANON_TABLE_GRANT_PRESENT: anon bag tablosunu okuyabiliyor';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.finance_import_batch_rows', 'INSERT') THEN
        RAISE EXCEPTION 'PHASE35_AUTHENTICATED_INSERT_MISSING: authenticated bag yazamiyor';
    END IF;

    -- Iki hedeften tam biri dolu olmali.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.finance_import_batch_rows'::regclass
          AND conname = 'chk_batch_row_single_target'
    ) THEN
        RAISE EXCEPTION 'PHASE35_TARGET_CHECK_MISSING: tek hedef kisiti yok';
    END IF;

    -- Kayit silinince bag da gitmeli (sarkik bag birakmak, geri almayi
    -- var olmayan kayitlara yoneltirdi).
    SELECT string_agg(a.attname, ', ') INTO v_eksik
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.finance_import_batch_rows'::regclass
      AND c.contype = 'f'
      AND a.attname IN ('booking_id', 'expense_id')
      AND c.confdeltype <> 'c';
    IF v_eksik IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE35_CASCADE_MISSING: ON DELETE CASCADE yok -> %', v_eksik;
    END IF;

    IF to_regprocedure('public.undo_finance_import(UUID, UUID, TEXT)') IS NULL THEN
        RAISE EXCEPTION 'PHASE35_FUNCTION_MISSING: undo_finance_import olusmadi';
    END IF;

    IF has_function_privilege('anon', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE35_ANON_EXECUTE_PRESENT: anon geri alma cagirabiliyor';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.undo_finance_import(UUID, UUID, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE35_AUTHENTICATED_EXECUTE_MISSING: authenticated cagiramiyor';
    END IF;

    -- Yetki kontrolu KAYIT ARANMADAN once olmali (varlik oracülü, 7).
    IF (SELECT position('tenant_members' IN prosrc) FROM pg_proc
        WHERE oid = 'public.undo_finance_import(UUID, UUID, TEXT)'::regprocedure)
       > (SELECT position('finance_import_batches' IN prosrc) FROM pg_proc
          WHERE oid = 'public.undo_finance_import(UUID, UUID, TEXT)'::regprocedure) THEN
        RAISE EXCEPTION 'PHASE35_AUTHZ_ORDER: yetki kontrolu kayit aramasindan SONRA';
    END IF;

    RAISE NOTICE 'PHASE 35 OK — ice aktarim bagi kuruldu, geri alma yerinde, anon kapali.';
END $verify$;
