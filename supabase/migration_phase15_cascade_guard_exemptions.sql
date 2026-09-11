-- =============================================================================
-- PHASE 15: İŞ KURALI KORUMALARININ İŞLETME SİLMEYİ KİLİTLEMESİNİ GİDER
-- =============================================================================
-- SORUN:
--   Şemada, DELETE sırasında exception fırlatan 5 koruma tetikleyicisi var:
--
--     fn_guard_last_tenant_owner              (phase14'te düzeltildi)
--     guard_expense_closed_period             -> kapanmış dönemin gideri silinemez
--     guard_booking_closed_period             -> kapanmış dönemin rezervasyonu silinemez
--     guard_scheduled_message_sent_immutability -> gönderilmiş mesaj silinemez
--     guard_quote_accepted_immutability       -> kabul edilmiş teklif silinemez
--
--   Hepsinin niyeti doğru: bunlar denetim izi (audit trail) ve muhasebe
--   bütünlüğü korumaları. KULLANICI bu kayıtları silmeye kalkarsa engellenmeli.
--
--   Ancak hiçbirinin "üst kayıt zaten siliniyor" istisnası yok. İşletme
--   silindiğinde cascade bu tablolara iner ve korumaya takılır:
--
--     DELETE FROM tenants -> cascade -> scheduled_messages -> "Gönderilmiş mesaj silinemez"
--
--   Pratik sonuç: gönderilmiş tek bir mesajı, kabul edilmiş tek bir teklifi ya da
--   kapanmış tek bir dönemi olan HİÇBİR işletme silinemiyor. Yani gerçekten
--   kullanılmış her müşteri hesabı kalıcı. Müşteri offboarding'i ve KVKK/GDPR
--   silme talebi imkânsız.
--
-- ÇÖZÜM:
--   Ortak bir yardımcı: işletme artık yoksa, bu bir cascade'dir; koruma atlanır.
--   İşletme duruyorsa koruma AYNEN çalışmaya devam eder.
--
-- ÇALIŞTIRMA: Supabase Dashboard -> SQL Editor -> tamamını yapıştır -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ortak yardımcı: üst işletme kaydı gitmiş mi?
-- PostgreSQL cascade'de önce üst satırı siler, sonra alt satırları. Yani bir
-- cascade silme sırasında tenants satırı çoktan yok olmuş olur.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tenant_is_being_deleted(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
    SELECT NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id);
$$;

-- -----------------------------------------------------------------------------
-- 1. GÖNDERİLMİŞ MESAJ DEĞİŞMEZLİĞİ
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_scheduled_message_sent_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Isletme siliniyorsa bu cascade'dir, kullanici girisimi degil.
        IF public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;

        IF OLD.status = 'SENT' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesaj silinemez (Audit Trail)' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'SENT' THEN
            IF NEW.status != 'SENT' OR NEW.rendered_body != OLD.rendered_body OR NEW.recipient_snapshot != OLD.recipient_snapshot THEN
                RAISE EXCEPTION 'IMMUTABILITY_BREACH: Gönderilmiş mesajın içeriği veya durumu değiştirilemez' USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. KABUL EDİLMİŞ TEKLİF DEĞİŞMEZLİĞİ
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_quote_accepted_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
        RETURN OLD;
    END IF;

    IF OLD.status = 'ACCEPTED' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifi silinemez' USING ERRCODE = '42501';
        END IF;
        IF NEW.status != 'ACCEPTED' OR NEW.quoted_total != OLD.quoted_total THEN
            RAISE EXCEPTION 'IMMUTABILITY_BREACH: Kabul edilmiş fiyat teklifinin içeriği değiştirilemez' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. KAPANMIŞ DÖNEM: GİDER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_expense_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_date DATE;
    v_tenant_id UUID;
    v_is_closed BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Isletme siliniyorsa bu cascade'dir, kullanici girisimi degil.
        IF public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;

        v_date := OLD.expense_date;
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_date := NEW.expense_date;
        v_tenant_id := NEW.tenant_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.monthly_financial_closes
        WHERE tenant_id = v_tenant_id
          AND year = EXTRACT(YEAR FROM v_date)::INT
          AND month = EXTRACT(MONTH FROM v_date)::INT
          AND status = 'CLOSED'
    ) INTO v_is_closed;

    IF v_is_closed THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu dönem (%-%) kapatılmıştır. Gider ekleme, güncelleme veya silme yapılamaz.',
            EXTRACT(YEAR FROM v_date)::INT, EXTRACT(MONTH FROM v_date)::INT
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. KAPANMIŞ DÖNEM: REZERVASYON
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_booking_closed_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_check_in DATE;
    v_tenant_id UUID;
    v_is_closed BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Isletme siliniyorsa bu cascade'dir, kullanici girisimi degil.
        IF public.fn_tenant_is_being_deleted(OLD.tenant_id) THEN
            RETURN OLD;
        END IF;

        v_check_in := OLD.check_in;
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_check_in := NEW.check_in;
        v_tenant_id := NEW.tenant_id;

        IF TG_OP = 'UPDATE' THEN
            IF OLD.check_in IS NOT DISTINCT FROM NEW.check_in
               AND OLD.check_out IS NOT DISTINCT FROM NEW.check_out
               AND OLD.gross_amount IS NOT DISTINCT FROM NEW.gross_amount
               AND OLD.ota_commission IS NOT DISTINCT FROM NEW.ota_commission
               AND OLD.cleaning_fee IS NOT DISTINCT FROM NEW.cleaning_fee
               AND OLD.discount IS NOT DISTINCT FROM NEW.discount
               AND OLD.status IS NOT DISTINCT FROM NEW.status
               AND OLD.property_id IS NOT DISTINCT FROM NEW.property_id THEN
                RETURN NEW;
            END IF;
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.monthly_financial_closes
        WHERE tenant_id = v_tenant_id
          AND year = EXTRACT(YEAR FROM v_check_in)::INT
          AND month = EXTRACT(MONTH FROM v_check_in)::INT
          AND status = 'CLOSED'
    ) INTO v_is_closed;

    IF v_is_closed THEN
        RAISE EXCEPTION 'CLOSED_PERIOD_VIOLATION: Bu dönem (%-%) kapatılmıştır. Rezervasyon üzerinde finansal veya operasyonel değişiklik yapılamaz.',
            EXTRACT(YEAR FROM v_check_in)::INT, EXTRACT(MONTH FROM v_check_in)::INT
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- =============================================================================
-- DOĞRULAMA: Korumalar hâlâ çalışıyor mu?
-- Geçici bir işletme kurar, gönderilmiş bir mesaj ekler, önce doğrudan silmenin
-- HÂLÂ engellendiğini, sonra işletme silmenin ARTIK çalıştığını doğrular.
-- Hiçbir kalıcı iz bırakmaz.
-- =============================================================================
DO $$
DECLARE
    v_tenant UUID;
    v_guest  UUID;
    v_msg    UUID;
    v_blocked BOOLEAN := FALSE;
BEGIN
    INSERT INTO public.tenants (name, slug)
    VALUES ('__phase15_dogrulama__', '__phase15_' || floor(random() * 1e9)::TEXT)
    RETURNING id INTO v_tenant;

    INSERT INTO public.guests (tenant_id, first_name)
    VALUES (v_tenant, 'Dogrulama Misafiri')
    RETURNING id INTO v_guest;

    INSERT INTO public.scheduled_messages (
        tenant_id, guest_id, channel, status,
        scheduled_at, rendered_body, idempotency_key, recipient_snapshot, sent_at
    )
    VALUES (
        v_tenant, v_guest, 'WHATSAPP', 'SENT',
        NOW(), 'phase15 dogrulama mesaji', 'phase15-' || v_tenant::TEXT, '+900000000000', NOW()
    )
    RETURNING id INTO v_msg;

    -- 1) Dogrudan silme HALA engellenmelidir.
    BEGIN
        DELETE FROM public.scheduled_messages WHERE id = v_msg;
    EXCEPTION WHEN OTHERS THEN
        v_blocked := TRUE;
    END;

    IF NOT v_blocked THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: gonderilmis mesaj dogrudan silinebildi, koruma kayboldu!';
    END IF;
    RAISE NOTICE 'DOGRULAMA 1: OK - gonderilmis mesaji dogrudan silme HALA engelleniyor.';

    -- 2) Isletme silme ARTIK calismalidir.
    DELETE FROM public.tenants WHERE id = v_tenant;
    RAISE NOTICE 'DOGRULAMA 2: OK - isletme (ve gonderilmis mesaji) cascade ile silinebildi.';

EXCEPTION WHEN OTHERS THEN
    -- Dogrulama isletmesini her halukarda temizlemeye calis.
    IF v_tenant IS NOT NULL THEN
        BEGIN
            DELETE FROM public.tenants WHERE id = v_tenant;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END IF;
    RAISE;
END $$;
