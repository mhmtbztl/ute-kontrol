-- Lexbnb phase107 — kisi bazinda izin matrisi (L-211, kullanici M40 / 27.10.2026).
--
-- Isletme sahibi her ekip uyesinin satis, finans ve operasyon izinlerini rol
-- varsayilaninin ustune ayri ayri acip kapatir. Rol baslangic paketidir;
-- sahip kisi bazinda degistirir. Degistirilemeyenler: sahibin kendi izinleri
-- ve "yonetim" (mulk, ayar, ekip — can_manage_tenant, role bagli kalir).
--
--   izin               varsayilan roller                  sunucu fonksiyonu
--   sales.read         owner admin manager sales viewer   can_read_sales
--   sales.write        owner admin manager sales          can_write_sales
--   ledger.read        owner admin manager viewer         can_read_ledger
--   ledger.write       owner admin manager                can_write_ledger      (yeni)
--   operations.manage  owner admin manager                can_manage_operations (yeni)
--
-- Yazma izni okumayi icerir (can_read_* = okuma OR yazma). Operasyon izni
-- operasyon defterlerini okumayi da icerir.
--
-- Uygulama: dort yetki fonksiyonu izin tablosunu da okur; finans ve operasyon
-- tablolarinin yazma politikalari ile rolu satir ici listeyle denetleyen 16
-- fonksiyon bu yetki fonksiyonlarina baglanir. Fonksiyon govdeleri ve
-- politikalar TEST projesinin katalogundan birebir alinip yalniz yetki
-- ifadesi degistirildi (pg_get_functiondef / pg_policies).
--
-- Rolde (yonetim kararinda) kalanlar: rezervasyon/talep/misafir silme, donem
-- yeniden acma (owner/admin), finans hareketi silme (owner/admin), pazarlama
-- ve fiyat kurallari yazma.
--
-- Rol degisince o uyenin kisi bazindaki izinleri silinir (yeni rol yeni
-- baslangic paketidir). Uye cikarilinca izinleri de gider (FK cascade).
-- Veri sifirlama izinleri silmez: izin defter degil, ekip ayaridir.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 105) THEN
        RAISE EXCEPTION 'PHASE107_REQUIRES_PHASE105';
    END IF;
END
$pre$;

-- -----------------------------------------------------------------------------
-- 1. Tablo: yalniz rol varsayilanindan FARKLI olan izinler satir olarak durur
-- -----------------------------------------------------------------------------
CREATE TABLE public.tenant_member_permissions (
    -- tenants'a dogrudan FK YOK, bilerek: tablo hem tenants'a hem tenant_members'a
    -- bagli olsaydi PostgREST onu ikisi arasinda ikinci bir iliski yolu sayar ve
    -- tenant_members.select('..., tenants(...)') gommesi PGRST201 ile duserdi —
    -- giris akisinin (handleAuthenticatedSession) kendi sorgusu. Isletmenin varligi
    -- ve silinince temizlik uyelige bagli bilesik FK ile saglanir.
    tenant_id   UUID NOT NULL,
    user_id     UUID NOT NULL,
    permission  TEXT NOT NULL CHECK (permission IN ('sales.read', 'sales.write', 'ledger.read', 'ledger.write', 'operations.manage')),
    granted     BOOLEAN NOT NULL,
    updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id, permission),
    CONSTRAINT tenant_member_permissions_member_fkey FOREIGN KEY (tenant_id, user_id)
        REFERENCES public.tenant_members(tenant_id, user_id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_tenant_id_immutable ON public.tenant_member_permissions;
CREATE TRIGGER trg_tenant_id_immutable
    BEFORE UPDATE OF tenant_id ON public.tenant_member_permissions
    FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_id_immutable();

CREATE TRIGGER trg_set_updated_at
    BEFORE UPDATE ON public.tenant_member_permissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Okuma: kisi kendi izinlerini, yonetim ekibin izinlerini gorur. Yazma yalniz
-- set_member_permissions RPC'si ile (yalniz sahip).
ALTER TABLE public.tenant_member_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_member_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_member_permissions TO authenticated;
CREATE POLICY tenant_member_permissions_select ON public.tenant_member_permissions FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.can_manage_tenant(tenant_id));

-- Rol degisince kisi bazindaki izinler silinir.
CREATE OR REPLACE FUNCTION public.reset_member_permissions_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        DELETE FROM public.tenant_member_permissions
         WHERE tenant_id = NEW.tenant_id AND user_id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_member_permissions_on_role_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_member_permissions_on_role_change() FROM anon;
DROP TRIGGER IF EXISTS trg_reset_member_permissions ON public.tenant_members;
CREATE TRIGGER trg_reset_member_permissions
    AFTER UPDATE OF role ON public.tenant_members
    FOR EACH ROW EXECUTE FUNCTION public.reset_member_permissions_on_role_change();

-- -----------------------------------------------------------------------------
-- 2. Yetki fonksiyonlari (tek sozlesme, CLAUDE.md 3.3.1). Istemci karsiligi
--    core/permission_matrix.js — varsayilan tablo ayni olmak zorunda
--    (permission_matrix_tests goc metnini okuyup karsilastirir).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_permission_default(p_role TEXT, p_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE p_permission
        WHEN 'sales.read'        THEN p_role IN ('owner', 'admin', 'manager', 'sales', 'viewer')
        WHEN 'sales.write'       THEN p_role IN ('owner', 'admin', 'manager', 'sales')
        WHEN 'ledger.read'       THEN p_role IN ('owner', 'admin', 'manager', 'viewer')
        WHEN 'ledger.write'      THEN p_role IN ('owner', 'admin', 'manager')
        WHEN 'operations.manage' THEN p_role IN ('owner', 'admin', 'manager')
        ELSE FALSE
    END;
$$;

-- Cagiranin bu isletmedeki izni: uye degilse FALSE, sahipse her zaman TRUE,
-- degilse kisi bazindaki kayit, yoksa rol varsayilani.
CREATE OR REPLACE FUNCTION public.fn_member_capability(p_tenant_id UUID, p_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT CASE
        WHEN r.role IS NULL THEN FALSE
        WHEN r.role = 'owner' THEN TRUE
        ELSE COALESCE(
            (SELECT p.granted FROM public.tenant_member_permissions p
              WHERE p.tenant_id = p_tenant_id AND p.user_id = auth.uid() AND p.permission = p_permission),
            public.fn_permission_default(r.role, p_permission))
    END
    FROM (SELECT public.get_tenant_role(p_tenant_id)::TEXT AS role) r;
$$;

CREATE OR REPLACE FUNCTION public.can_read_sales(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_member_capability(p_tenant_id, 'sales.read') OR public.fn_member_capability(p_tenant_id, 'sales.write');
$$;

CREATE OR REPLACE FUNCTION public.can_write_sales(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_member_capability(p_tenant_id, 'sales.write');
$$;

CREATE OR REPLACE FUNCTION public.can_read_ledger(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_member_capability(p_tenant_id, 'ledger.read') OR public.fn_member_capability(p_tenant_id, 'ledger.write');
$$;

CREATE OR REPLACE FUNCTION public.can_write_ledger(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_member_capability(p_tenant_id, 'ledger.write');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_operations(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT public.fn_member_capability(p_tenant_id, 'operations.manage');
$$;

REVOKE ALL ON FUNCTION public.fn_permission_default(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_permission_default(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_permission_default(TEXT, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_member_capability(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_member_capability(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_member_capability(UUID, TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_sales(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_sales(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_sales(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_write_sales(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_sales(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_sales(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_read_ledger(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_ledger(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_ledger(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_write_ledger(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_write_ledger(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_write_ledger(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_operations(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_operations(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_operations(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Izinleri degistiren tek yol: yalniz sahip. p_permissions = {izin: true|false|null}
--    null = kisi bazindaki kaydi kaldir (rol varsayilanina don). Yazma okumayi
--    icerir: yazma acilirsa okuma acilir, okuma kapanirsa yazma kapanir.
--    Varsayilana esit kayit tutulmaz.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_permissions(p_tenant_id UUID, p_user_id UUID, p_permissions JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_izinler   TEXT[] := ARRAY['sales.read', 'sales.write', 'ledger.read', 'ledger.write', 'operations.manage'];
    v_rol       TEXT;
    v_anahtar   TEXT;
    v_deger     JSONB;
    v_etkin     JSONB := '{}'::JSONB;
    v_izin      TEXT;
    v_mevcut    BOOLEAN;
    v_varsayilan BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    -- Yetki kayit aramadan once (CLAUDE.md 7): yalniz sahip.
    IF COALESCE(public.get_tenant_role(p_tenant_id)::TEXT, '') <> 'owner' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Izinleri yalniz isletme sahibi degistirir.' USING ERRCODE = '42501';
    END IF;
    IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PERMISSIONS: Izinler nesne olmali.' USING ERRCODE = '22023';
    END IF;
    FOR v_anahtar, v_deger IN SELECT key, value FROM jsonb_each(p_permissions) LOOP
        IF NOT (v_anahtar = ANY (v_izinler)) THEN
            RAISE EXCEPTION 'UNKNOWN_PERMISSION: %', v_anahtar USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_deger) NOT IN ('boolean', 'null') THEN
            RAISE EXCEPTION 'INVALID_PERMISSION_VALUE: %', v_anahtar USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT role INTO v_rol FROM public.tenant_members WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    IF v_rol IS NULL THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND: Bu kisi isletmenin uyesi degil.' USING ERRCODE = 'P0002';
    END IF;
    IF v_rol = 'owner' THEN
        RAISE EXCEPTION 'OWNER_PERMISSIONS_FIXED: Isletme sahibinin izinleri degistirilemez.' USING ERRCODE = '42501';
    END IF;

    -- Hedef etkin durum: istenen deger > mevcut kayit > rol varsayilani.
    FOREACH v_izin IN ARRAY v_izinler LOOP
        SELECT granted INTO v_mevcut FROM public.tenant_member_permissions
         WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND permission = v_izin;
        v_varsayilan := public.fn_permission_default(v_rol, v_izin);
        IF p_permissions ? v_izin THEN
            v_etkin := v_etkin || jsonb_build_object(v_izin,
                CASE WHEN jsonb_typeof(p_permissions -> v_izin) = 'null' THEN v_varsayilan
                     ELSE (p_permissions ->> v_izin)::BOOLEAN END);
        ELSE
            v_etkin := v_etkin || jsonb_build_object(v_izin, COALESCE(v_mevcut, v_varsayilan));
        END IF;
    END LOOP;
    -- Yazma okumayi icerir.
    IF (p_permissions ->> 'sales.read') = 'false' THEN v_etkin := v_etkin || '{"sales.write": false}'; END IF;
    IF (p_permissions ->> 'ledger.read') = 'false' THEN v_etkin := v_etkin || '{"ledger.write": false}'; END IF;
    IF (v_etkin ->> 'sales.write')::BOOLEAN THEN v_etkin := v_etkin || '{"sales.read": true}'; END IF;
    IF (v_etkin ->> 'ledger.write')::BOOLEAN THEN v_etkin := v_etkin || '{"ledger.read": true}'; END IF;

    FOREACH v_izin IN ARRAY v_izinler LOOP
        v_varsayilan := public.fn_permission_default(v_rol, v_izin);
        IF (v_etkin ->> v_izin)::BOOLEAN = v_varsayilan THEN
            DELETE FROM public.tenant_member_permissions
             WHERE tenant_id = p_tenant_id AND user_id = p_user_id AND permission = v_izin;
        ELSE
            INSERT INTO public.tenant_member_permissions(tenant_id, user_id, permission, granted, updated_by)
            VALUES (p_tenant_id, p_user_id, v_izin, (v_etkin ->> v_izin)::BOOLEAN, auth.uid())
            ON CONFLICT (tenant_id, user_id, permission)
            DO UPDATE SET granted = EXCLUDED.granted, updated_by = EXCLUDED.updated_by;
        END IF;
    END LOOP;

    INSERT INTO public.audit_logs(tenant_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (p_tenant_id, auth.uid(), 'MEMBER_PERMISSIONS_CHANGED', 'tenant_member', p_user_id, v_etkin);

    RETURN jsonb_build_object('success', TRUE, 'role', v_rol, 'effective', v_etkin);
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_permissions(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_member_permissions(UUID, UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_member_permissions(UUID, UUID, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Rolu satir ici listeyle denetleyen fonksiyonlar yetki fonksiyonlarina
--    baglanir (govdeler test katalogundan; yalniz yetki satiri degisti).
-- -----------------------------------------------------------------------------

-- public.accept_extension_offer_atomic(uuid,uuid)
CREATE OR REPLACE FUNCTION public.accept_extension_offer_atomic(p_tenant_id uuid, p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_offer public.extension_offers%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_new_checkout DATE;
    v_conflict_count INT;
BEGIN
    -- Yetki, satir kilidinden ONCE (phase25/29 kalibi). Izinli roller
    -- bookings UPDATE politikasiyla ayni: teklif kabulu rezervasyon yazar.
    IF auth.role() IS DISTINCT FROM 'service_role' AND (
         auth.uid() IS NULL
         OR NOT COALESCE(public.can_write_sales(p_tenant_id), FALSE)
       ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED_EXTENSION_ACCEPT' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_offer
    FROM public.extension_offers
    WHERE id = p_offer_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_offer.id IS NULL THEN
        RAISE EXCEPTION 'OFFER_NOT_FOUND: Uzatma teklifi bulunamadı' USING ERRCODE = '42501';
    END IF;

    IF v_offer.status != 'OFFERED' THEN
        RAISE EXCEPTION 'OFFER_INACTIVE: Bu teklif artık geçerli değil (Durum: %)', v_offer.status USING ERRCODE = '42501';
    END IF;

    IF v_offer.expires_at < NOW() THEN
        UPDATE public.extension_offers SET status = 'EXPIRED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OFFER_EXPIRED: Uzatma teklifinin süresi dolmuş' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = v_offer.booking_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_booking.id IS NULL OR v_booking.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'BOOKING_INVALID: Rezervasyon bulunamadı veya iptal edilmiş' USING ERRCODE = '42501';
    END IF;

    IF v_booking.check_out != v_offer.target_date THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'DATES_CHANGED: Rezervasyon çıkış tarihi değiştiği için teklif geçersiz kaldı' USING ERRCODE = '42501';
    END IF;

    v_new_checkout := v_offer.target_date + INTERVAL '1 day';

    SELECT count(*) INTO v_conflict_count
    FROM public.bookings
    WHERE property_id = v_offer.property_id
      AND id != v_booking.id
      AND status != 'CANCELLED'
      AND daterange(check_in, check_out, '[)') && daterange(v_offer.target_date, v_new_checkout, '[)');

    IF v_conflict_count > 0 THEN
        UPDATE public.extension_offers SET status = 'REVOKED', updated_at = NOW() WHERE id = v_offer.id;
        RAISE EXCEPTION 'OVERBOOKING_PREVENTED: Sonraki gece için başka bir rezervasyon bulunmaktadır' USING ERRCODE = '42501';
    END IF;

    UPDATE public.bookings
    SET check_out = v_new_checkout,
        gross_amount = round(gross_amount + v_offer.offered_price, 2),
        net_room_revenue = round(net_room_revenue + v_offer.offered_price, 2),
        updated_at = NOW()
    WHERE id = v_booking.id;

    UPDATE public.extension_offers
    SET status = 'ACCEPTED',
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = v_offer.id;

    RETURN jsonb_build_object(
        'success', true,
        'offer_id', v_offer.id,
        'booking_id', v_booking.id,
        'new_checkout', v_new_checkout,
        'added_amount', v_offer.offered_price
    );
END;
$function$;

-- public.create_booking_atomic(uuid,uuid,text,text,text,text,date,date,integer,numeric,numeric,numeric,numeric,numeric,text,text)
CREATE OR REPLACE FUNCTION public.create_booking_atomic(p_tenant_id uuid, p_property_id uuid, p_booking_code text, p_guest_name text, p_guest_phone text, p_channel text, p_check_in date, p_check_out date, p_pax integer, p_gross_amount numeric, p_ota_commission numeric, p_cleaning_fee numeric, p_discount numeric, p_net_room_revenue numeric, p_status text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_conflict_count INT;
    v_new_booking public.bookings%ROWTYPE;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    -- phase53 (L-107): rezervasyon yazan roller owner, admin, manager, sales; staff saha personelidir
    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(public.can_write_sales(p_tenant_id), FALSE) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyon oluşturulamaz (Viewer yetkisi yetersizdir).'
            USING ERRCODE = '42501';
    END IF;

    -- [3] Property Existence & Tenant Ownership Verification
    -- Prevents foreign property injection across tenants
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties
        WHERE id = p_property_id
          AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Seçilen mülk aktif işletmenize ait değildir veya bulunamadı.'
            USING ERRCODE = '42501';
    END IF;

    -- [4] Date Integrity Validation
    IF p_check_in IS NULL OR p_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'INVALID_DATES: Çıkış tarihi (%) giriş tarihinden (%) sonra olmalıdır.',
            p_check_out,
            p_check_in
            USING ERRCODE = '22023';
    END IF;

    -- [5] Status Validation
    IF p_status NOT IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Tanımsız rezervasyon durumu: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- [6] Amount & Pax Integrity Validation
    IF p_gross_amount < 0 OR p_ota_commission < 0 OR p_cleaning_fee < 0 OR p_discount < 0 OR p_net_room_revenue < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Finansal tutarlar negatif olamaz.'
            USING ERRCODE = '22003';
    END IF;

    IF p_pax < 1 OR p_pax > 100 THEN
        RAISE EXCEPTION 'INVALID_PAX: Misafir sayısı 1 ile 100 arasında olmalıdır.'
            USING ERRCODE = '22003';
    END IF;

    -- [7] Advisory Transaction Lock (Two-Namespace Domain Key: tenant_id + property_id)
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_property_id::text));

    -- [8] Overbooking Verification (Explicit Pre-check before INSERT)
    IF p_status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT') THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM public.bookings
        WHERE property_id = p_property_id
          AND status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
          AND check_in < p_check_out
          AND check_out > p_check_in;

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'OVERBOOKING_CONFLICT: Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.'
                USING ERRCODE = '23P01';
        END IF;
    END IF;

    -- [9] Atomic Insert
    INSERT INTO public.bookings (
        tenant_id, property_id, booking_code, guest_name, guest_phone,
        channel, check_in, check_out, pax, gross_amount, ota_commission,
        cleaning_fee, discount, net_room_revenue, status, notes, created_by
    ) VALUES (
        p_tenant_id, p_property_id, p_booking_code, p_guest_name, p_guest_phone,
        p_channel, p_check_in, p_check_out, p_pax, p_gross_amount, p_ota_commission,
        p_cleaning_fee, p_discount, p_net_room_revenue, p_status, p_notes, v_user_id
    )
    RETURNING * INTO v_new_booking;

    RETURN to_jsonb(v_new_booking);
END;
$function$;

-- public.update_booking_atomic(uuid,uuid,uuid,text,text,text,date,date,integer,numeric,numeric,numeric,numeric,numeric,text,text)
CREATE OR REPLACE FUNCTION public.update_booking_atomic(p_booking_id uuid, p_tenant_id uuid, p_property_id uuid, p_guest_name text, p_guest_phone text, p_channel text, p_check_in date, p_check_out date, p_pax integer, p_gross_amount numeric, p_ota_commission numeric, p_cleaning_fee numeric, p_discount numeric, p_net_room_revenue numeric, p_status text, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_conflict_count INT;
    v_existing_booking public.bookings%ROWTYPE;
    v_updated_booking public.bookings%ROWTYPE;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    SELECT role INTO v_user_role
    FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(public.can_write_sales(p_tenant_id), FALSE) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyon güncellenemez (Viewer yetkisi yetersizdir).'
            USING ERRCODE = '42501';
    END IF;

    -- [3] Existing Booking Ownership Verification
    SELECT * INTO v_existing_booking
    FROM public.bookings
    WHERE id = p_booking_id
      AND tenant_id = p_tenant_id;

    IF v_existing_booking.id IS NULL THEN
        RAISE EXCEPTION 'BOOKING_NOT_FOUND: Güncellenecek rezervasyon bulunamadı veya bu işletmeye ait değil.'
            USING ERRCODE = 'P0002';
    END IF;

    -- [4] Target Property Existence & Tenant Ownership Verification
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties
        WHERE id = p_property_id
          AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Hedef mülk aktif işletmenize ait değildir veya bulunamadı.'
            USING ERRCODE = '42501';
    END IF;

    -- [5] Date Integrity Validation
    IF p_check_in IS NULL OR p_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    IF p_check_out <= p_check_in THEN
        RAISE EXCEPTION 'INVALID_DATES: Çıkış tarihi (%) giriş tarihinden (%) sonra olmalıdır.',
            p_check_out,
            p_check_in
            USING ERRCODE = '22023';
    END IF;

    -- [6] Status Validation
    IF p_status NOT IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Tanımsız rezervasyon durumu: %', p_status
            USING ERRCODE = '22023';
    END IF;

    -- [7] Amount & Pax Integrity Validation
    IF p_gross_amount < 0 OR p_ota_commission < 0 OR p_cleaning_fee < 0 OR p_discount < 0 OR p_net_room_revenue < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Finansal tutarlar negatif olamaz.'
            USING ERRCODE = '22003';
    END IF;

    IF p_pax < 1 OR p_pax > 100 THEN
        RAISE EXCEPTION 'INVALID_PAX: Misafir sayısı 1 ile 100 arasında olmalıdır.'
            USING ERRCODE = '22003';
    END IF;

    -- [8] Advisory Transaction Lock (tenant_id + property_id)
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_property_id::text));

    -- [9] Overbooking Verification (Excluding self)
    IF p_status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT') THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM public.bookings
        WHERE property_id = p_property_id
          AND id != p_booking_id
          AND status IN ('CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT')
          AND check_in < p_check_out
          AND check_out > p_check_in;

        IF v_conflict_count > 0 THEN
            RAISE EXCEPTION 'OVERBOOKING_CONFLICT: Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.'
                USING ERRCODE = '23P01';
        END IF;
    END IF;

    -- [10] Atomic Update
    UPDATE public.bookings SET
        property_id = p_property_id,
        guest_name = p_guest_name,
        guest_phone = p_guest_phone,
        channel = p_channel,
        check_in = p_check_in,
        check_out = p_check_out,
        pax = p_pax,
        gross_amount = p_gross_amount,
        ota_commission = p_ota_commission,
        cleaning_fee = p_cleaning_fee,
        discount = p_discount,
        net_room_revenue = p_net_room_revenue,
        status = p_status,
        notes = p_notes,
        updated_at = NOW()
    WHERE id = p_booking_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_updated_booking;

    RETURN to_jsonb(v_updated_booking);
END;
$function$;

-- public.convert_lead_to_booking_atomic(uuid,uuid,uuid,text,date,date,integer,numeric,numeric,numeric,numeric,text)
CREATE OR REPLACE FUNCTION public.convert_lead_to_booking_atomic(p_lead_id uuid, p_tenant_id uuid, p_property_id uuid DEFAULT NULL::uuid, p_booking_code text DEFAULT NULL::text, p_check_in date DEFAULT NULL::date, p_check_out date DEFAULT NULL::date, p_pax integer DEFAULT NULL::integer, p_gross_amount numeric DEFAULT NULL::numeric, p_ota_commission numeric DEFAULT 0, p_cleaning_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_lead public.leads%ROWTYPE;
    v_prop_id UUID;
    v_check_in DATE;
    v_check_out DATE;
    v_gross NUMERIC;
    v_pax INT;
    v_channel TEXT;
    v_notes TEXT;
    v_net_room_revenue NUMERIC;
    v_booking_json JSONB;
    v_booking_id UUID;
    v_attempts INT := 0;
    v_code TEXT;
BEGIN
    -- [1] Authentication Verification
    IF v_user_id IS NULL AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    -- [2] Tenant Membership & Role Authorization Verification
    IF auth.role() != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        IF v_user_role IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED_TENANT: Belirtilen işletmeye erişim yetkiniz bulunmuyor.'
                USING ERRCODE = '42501';
        END IF;

        IF NOT COALESCE(public.can_write_sales(p_tenant_id), FALSE) THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu rol ile rezervasyona dönüştürme yapılamaz (Viewer yetkisi yetersizdir).'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- [3] Lead Existence & Row Locking (FOR UPDATE)
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = p_lead_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LEAD_NOT_FOUND: Belirtilen talep bulunamadı veya erişim yetkiniz yok.'
            USING ERRCODE = '42501';
    END IF;

    -- [4] Duplicate Conversion Protection
    -- If lead is already converted or WON, reject with ALREADY_CONVERTED
    IF v_lead.converted_booking_id IS NOT NULL OR v_lead.status = 'WON' THEN
        RAISE EXCEPTION 'ALREADY_CONVERTED: Bu talep zaten bir rezervasyona dönüştürülmüş.'
            USING ERRCODE = '23505';
    END IF;

    -- [5] Resolve Conversion Target Values (Override or fallback to Lead record)
    v_prop_id := COALESCE(p_property_id, v_lead.property_id);
    IF v_prop_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PROPERTY: Rezervasyona dönüştürmek için bir mülk seçilmelidir.'
            USING ERRCODE = '22023';
    END IF;

    v_check_in := COALESCE(p_check_in, v_lead.requested_check_in);
    v_check_out := COALESCE(p_check_out, v_lead.requested_check_out);
    IF v_check_in IS NULL OR v_check_out IS NULL THEN
        RAISE EXCEPTION 'INVALID_DATES: Giriş ve çıkış tarihleri zorunludur.'
            USING ERRCODE = '22004';
    END IF;

    v_gross := COALESCE(p_gross_amount, v_lead.quote_amount, 0);
    v_pax := COALESCE(p_pax, v_lead.pax, 2);
    v_channel := UPPER(COALESCE(NULLIF(TRIM(v_lead.channel), ''), 'DIRECT'));
    v_notes := COALESCE(p_notes, v_lead.notes, '');
    v_net_room_revenue := GREATEST(0, v_gross - COALESCE(p_ota_commission, 0) - COALESCE(p_discount, 0));

    -- [6] Execute Atomic Booking Engine with Collision Retry
    WHILE v_attempts < 3 LOOP
        v_attempts := v_attempts + 1;
        v_code := COALESCE(
            NULLIF(TRIM(p_booking_code), ''),
            'BK-' || to_char(v_check_in, 'YYMM') || '-' || floor(random() * 9000 + 1000)::text || UPPER(substr(md5(random()::text), 1, 3))
        );

        BEGIN
            v_booking_json := public.create_booking_atomic(
                p_tenant_id,
                v_prop_id,
                v_code,
                v_lead.guest_name,
                v_lead.guest_phone,
                v_channel,
                v_check_in,
                v_check_out,
                v_pax,
                v_gross,
                COALESCE(p_ota_commission, 0),
                COALESCE(p_cleaning_fee, 0),
                COALESCE(p_discount, 0),
                v_net_room_revenue,
                'CONFIRMED',
                v_notes
            );
            EXIT; -- Success, break retry loop
        EXCEPTION
            WHEN unique_violation THEN
                IF SQLERRM LIKE '%booking_code%' AND v_attempts < 3 THEN
                    p_booking_code := NULL; -- Force generate new code on next attempt
                    CONTINUE;
                ELSE
                    RAISE;
                END IF;
        END;
    END LOOP;

    -- [7] Extract Booking UUID & Mark Lead WON
    v_booking_id := (v_booking_json->>'id')::UUID;
    IF v_booking_id IS NULL THEN
        RAISE EXCEPTION 'BOOKING_CREATION_FAILED: Rezervasyon kimliği alınamadı.'
            USING ERRCODE = 'XX000';
    END IF;

    UPDATE public.leads
    SET status = 'WON',
        converted_booking_id = v_booking_id,
        updated_at = NOW()
    WHERE id = p_lead_id;

    -- [8] Return Structured Conversion Result
    RETURN jsonb_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'converted_booking_id', v_booking_id,
        'booking', v_booking_json
    );
END;
$function$;

-- public.upsert_booking_guest_atomic(uuid,uuid,text,text,text,text,text,text,boolean,boolean,boolean,boolean)
CREATE OR REPLACE FUNCTION public.upsert_booking_guest_atomic(p_tenant_id uuid, p_booking_id uuid, p_first_name text, p_last_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_preferred_language text DEFAULT 'tr'::text, p_country_code text DEFAULT 'TR'::text, p_allow_email boolean DEFAULT true, p_allow_sms boolean DEFAULT true, p_allow_whatsapp boolean DEFAULT true, p_marketing_opt_in boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_booking public.bookings%ROWTYPE;
  v_guest public.guests%ROWTYPE;
  v_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
  v_email TEXT := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_first_name TEXT := NULLIF(trim(COALESCE(p_first_name, '')), '');
  v_last_name TEXT := NULLIF(trim(COALESCE(p_last_name, '')), '');
  v_phone_guest UUID;
  v_email_guest UUID;
BEGIN
  -- Yetki, herhangi bir hedef kaydi aramadan ONCE kontrol edilir.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
  END IF;

  SELECT tm.role INTO v_role
  FROM public.tenant_members tm
  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_user_id;

  IF NOT COALESCE(public.can_write_sales(p_tenant_id), FALSE) THEN
    RAISE EXCEPTION 'FORBIDDEN_ROLE: Misafir profili baglama yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  IF v_first_name IS NULL THEN
    RAISE EXCEPTION 'INVALID_GUEST_NAME: Misafir adi zorunludur.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'GUEST_CONTACT_REQUIRED: Profil baglamak icin telefon veya e-posta zorunludur.' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{6,14}$' THEN
    RAISE EXCEPTION 'INVALID_GUEST_PHONE: Telefon E.164 biciminde olmali.' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'INVALID_GUEST_EMAIL: E-posta bicimi gecersiz.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND: Rezervasyon bulunamadi.' USING ERRCODE = 'P0002';
  END IF;

  -- Iki kimlik de ayri kilitlenir ve siralama her zaman telefon -> e-posta;
  -- ayni e-postayla farkli telefonlardan gelen eszamanli istek de cift profil
  -- olusturamaz, ters kilit sirasi nedeniyle deadlock da uretilmez.
  IF v_phone IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('phone:' || v_phone));
  END IF;
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext('email:' || v_email));
  END IF;

  IF v_booking.primary_guest_id IS NOT NULL THEN
    SELECT * INTO v_guest
    FROM public.guests g
    WHERE g.id = v_booking.primary_guest_id AND g.tenant_id = p_tenant_id
    FOR UPDATE;
  ELSE
    IF v_phone IS NOT NULL THEN
      SELECT g.id INTO v_phone_guest
      FROM public.guests g
      WHERE g.tenant_id = p_tenant_id AND g.phone = v_phone
      ORDER BY g.created_at ASC LIMIT 1;
    END IF;
    IF v_email IS NOT NULL THEN
      SELECT g.id INTO v_email_guest
      FROM public.guests g
      WHERE g.tenant_id = p_tenant_id AND lower(g.email) = v_email
      ORDER BY g.created_at ASC LIMIT 1;
    END IF;
    IF v_phone_guest IS NOT NULL AND v_email_guest IS NOT NULL AND v_phone_guest <> v_email_guest THEN
      RAISE EXCEPTION 'GUEST_IDENTITY_CONFLICT: Telefon ve e-posta farkli profillere ait.' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_guest
    FROM public.guests g
    WHERE g.id = COALESCE(v_phone_guest, v_email_guest)
      AND g.tenant_id = p_tenant_id
    FOR UPDATE;
  END IF;

  IF v_guest.id IS NULL THEN
    INSERT INTO public.guests (
      tenant_id, first_name, last_name, phone, email, preferred_language,
      country_code, allow_email, allow_sms, allow_whatsapp, marketing_opt_in
    ) VALUES (
      p_tenant_id, v_first_name, v_last_name, v_phone, v_email,
      COALESCE(NULLIF(trim(p_preferred_language), ''), 'tr'),
      COALESCE(NULLIF(upper(trim(p_country_code)), ''), 'TR'),
      p_allow_email, p_allow_sms, p_allow_whatsapp, p_marketing_opt_in
    ) RETURNING * INTO v_guest;
  ELSE
    UPDATE public.guests SET
      first_name = v_first_name,
      last_name = v_last_name,
      phone = COALESCE(v_phone, phone),
      email = COALESCE(v_email, email),
      preferred_language = COALESCE(NULLIF(trim(p_preferred_language), ''), preferred_language),
      country_code = COALESCE(NULLIF(upper(trim(p_country_code)), ''), country_code),
      allow_email = p_allow_email,
      allow_sms = p_allow_sms,
      allow_whatsapp = p_allow_whatsapp,
      marketing_opt_in = p_marketing_opt_in,
      updated_at = NOW()
    WHERE id = v_guest.id AND tenant_id = p_tenant_id
    RETURNING * INTO v_guest;
  END IF;

  UPDATE public.bookings SET
    primary_guest_id = v_guest.id,
    guest_name = trim(concat_ws(' ', v_guest.first_name, v_guest.last_name)),
    guest_phone = COALESCE(v_guest.phone, guest_phone),
    updated_at = NOW()
  WHERE id = p_booking_id AND tenant_id = p_tenant_id;

  RETURN to_jsonb(v_guest);
END;
$function$;

-- public.guard_pricing_write_authorization()
CREATE OR REPLACE FUNCTION public.guard_pricing_write_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_role TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED_PRICING_WRITE' USING ERRCODE = '28000';
  END IF;
  v_role := public.get_tenant_role(v_tenant_id);
  IF NOT COALESCE(public.can_write_sales(v_tenant_id), FALSE) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_PRICING_WRITE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- public.close_monthly_period_atomic(uuid,integer,integer,jsonb)
CREATE OR REPLACE FUNCTION public.close_monthly_period_atomic(p_tenant_id uuid, p_year integer, p_month integer, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id   UUID := auth.uid();
    v_jwt_role  TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_user_role TEXT;
    v_server    JSONB;
    v_client_rev NUMERIC;
    v_server_rev NUMERIC;
    v_delta     NUMERIC;
    v_matches   BOOLEAN;
    v_row       public.monthly_financial_closes%ROWTYPE;
    v_today     DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis. Lutfen once giris yapin.'
            USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF NOT COALESCE(public.can_write_ledger(p_tenant_id), FALSE) THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Ay kapanisi yapabilmek icin isletme yoneticisi yetkisi gereklidir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_month < 1 OR p_month > 12 THEN
        RAISE EXCEPTION 'INVALID_PERIOD: Ay 1-12 araliginda olmalidir.' USING ERRCODE = '22023';
    END IF;

    -- Ay BITMEDEN kapatilamaz: kalan gunlere kayit girilemez hale gelirdi.
    -- (Henuz baslamamis ay da bu kosula dahildir.)
    IF (make_date(p_year, p_month, 1) + INTERVAL '1 month')::date > v_today THEN
        RAISE EXCEPTION 'PERIOD_NOT_ENDED: % donemi henuz bitmedi; ay sona ermeden kapatilamaz.',
            to_char(make_date(p_year, p_month, 1), 'YYYY-MM')
            USING ERRCODE = '22023';
    END IF;

    -- Sunucu tarafi anlik goruntu: kaydin resmi rakami budur.
    v_server := public.compute_month_close_snapshot(p_tenant_id, p_year, p_month);

    v_server_rev := COALESCE((v_server ->> 'revenue')::numeric, 0);
    v_client_rev := COALESCE(
        NULLIF(p_snapshot #>> '{financial,revenue}', '')::numeric,
        NULLIF(p_snapshot ->> 'revenue', '')::numeric
    );
    v_delta   := CASE WHEN v_client_rev IS NULL THEN NULL ELSE round(v_client_rev - v_server_rev, 2) END;
    v_matches := CASE WHEN v_delta IS NULL THEN NULL ELSE abs(v_delta) < 0.01 END;

    PERFORM set_config('lexbnb.close_rpc', 'on', TRUE);

    INSERT INTO public.monthly_financial_closes (
        tenant_id, year, month, status, closed_at, closed_by,
        snapshot_json, server_snapshot_json, client_matches_server, revenue_delta,
        history_json, updated_at
    ) VALUES (
        p_tenant_id, p_year, p_month, 'CLOSED', NOW(), v_user_id,
        p_snapshot, v_server, v_matches, v_delta,
        jsonb_build_array(jsonb_build_object(
            'action', 'CLOSED', 'at', NOW(), 'by', v_user_id,
            'serverRevenue', v_server_rev, 'clientRevenue', v_client_rev)),
        NOW()
    )
    ON CONFLICT (tenant_id, year, month) DO UPDATE
    SET status = 'CLOSED',
        closed_at = NOW(),
        closed_by = v_user_id,
        snapshot_json = p_snapshot,
        server_snapshot_json = v_server,
        client_matches_server = v_matches,
        revenue_delta = v_delta,
        reopened_at = NULL,
        reopened_by = NULL,
        reopen_reason = NULL,
        history_json = COALESCE(public.monthly_financial_closes.history_json, '[]'::jsonb)
                       || jsonb_build_object('action', 'CLOSED', 'at', NOW(), 'by', v_user_id,
                                             'serverRevenue', v_server_rev, 'clientRevenue', v_client_rev),
        updated_at = NOW()
    RETURNING * INTO v_row;

    PERFORM set_config('lexbnb.close_rpc', 'off', TRUE);

    RETURN jsonb_build_object(
        'success', TRUE,
        'id', v_row.id,
        'tenant_id', v_row.tenant_id,
        'year', v_row.year,
        'month', v_row.month,
        'status', v_row.status,
        'closed_at', v_row.closed_at,
        'server_snapshot', v_server,
        'client_matches_server', v_matches,
        'revenue_delta', v_delta
    );
END;
$function$;

-- public.undo_finance_import(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.undo_finance_import(p_tenant_id uuid, p_batch_id uuid, p_confirm text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    IF NOT COALESCE(public.can_write_ledger(p_tenant_id), FALSE) THEN
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
$function$;

-- public.generate_expense_from_template(uuid,date)
CREATE OR REPLACE FUNCTION public.generate_expense_from_template(p_template_id uuid, p_period_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_template public.expense_templates%ROWTYPE;
    v_expense_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
    END IF;
    IF p_period_month IS NULL OR p_period_month <> date_trunc('month', p_period_month)::date THEN
        RAISE EXCEPTION 'INVALID_PERIOD_MONTH' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_template
    FROM public.expense_templates
    WHERE id = p_template_id AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPENSE_TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.can_write_ledger(v_template.tenant_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.expense_template_occurrences
        WHERE tenant_id = v_template.tenant_id
          AND template_id = v_template.id
          AND period_month = p_period_month
    ) THEN
        RAISE EXCEPTION 'SABLON_DONEMI_ZATEN_ISLENDI' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.expenses (
        tenant_id, property_id, expense_date, category, expense_type,
        amount, description, created_by
    ) VALUES (
        v_template.tenant_id, v_template.property_id, p_period_month,
        v_template.category, v_template.expense_type, v_template.amount,
        v_template.description, auth.uid()
    ) RETURNING id INTO v_expense_id;

    INSERT INTO public.expense_template_occurrences (
        tenant_id, template_id, generated_expense_id, period_month, recorded_by
    ) VALUES (
        v_template.tenant_id, v_template.id, v_expense_id, p_period_month, auth.uid()
    );

    RETURN v_expense_id;
END
$function$;

-- public.generate_expense_from_template(uuid,uuid,date)
CREATE OR REPLACE FUNCTION public.generate_expense_from_template(p_tenant_id uuid, p_template_id uuid, p_period_month date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_template public.expense_templates%ROWTYPE;
    v_expense_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
    END IF;
    -- Yetki kayit aramasindan ve satir kilidinden once sorulur. Boylece baska
    -- kiracinin sablon UUID'si var/yok oracle'i ve yetkisiz satir kilidi yoktur.
    IF NOT COALESCE(public.can_write_ledger(p_tenant_id), FALSE) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
    IF p_period_month IS NULL OR p_period_month <> date_trunc('month', p_period_month)::date THEN
        RAISE EXCEPTION 'INVALID_PERIOD_MONTH' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_template
    FROM public.expense_templates
    WHERE id = p_template_id
      AND tenant_id = p_tenant_id
      AND is_active = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EXPENSE_TEMPLATE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.expense_template_occurrences
        WHERE tenant_id = p_tenant_id
          AND template_id = v_template.id
          AND period_month = p_period_month
    ) THEN
        RAISE EXCEPTION 'SABLON_DONEMI_ZATEN_ISLENDI' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.expenses (
        tenant_id, property_id, expense_date, category, expense_type,
        amount, description, created_by
    ) VALUES (
        p_tenant_id, v_template.property_id, p_period_month,
        v_template.category, v_template.expense_type, v_template.amount,
        v_template.description, auth.uid()
    ) RETURNING id INTO v_expense_id;

    INSERT INTO public.expense_template_occurrences (
        tenant_id, template_id, generated_expense_id, period_month, recorded_by
    ) VALUES (
        p_tenant_id, v_template.id, v_expense_id, p_period_month, auth.uid()
    );

    RETURN v_expense_id;
END
$function$;

-- public.post_booking_extra_expenses(uuid,uuid,date)
CREATE OR REPLACE FUNCTION public.post_booking_extra_expenses(p_booking_id uuid, p_tenant_id uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE b public.bookings; e JSONB; inserted INT; total INT := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_ledger(p_tenant_id) THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=p_booking_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND OR b.financial_details IS NULL THEN RAISE EXCEPTION 'BOOKING_FINANCE_NOT_FOUND'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'EXPENSE_DATE_REQUIRED'; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(b.financial_details#>'{input,extras}') LOOP
    IF (e->>'amount')::numeric = 0 THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.expenses WHERE tenant_id=p_tenant_id AND legacy_id='BF:'||p_booking_id::text||':'||(e->>'id')) THEN CONTINUE; END IF;
    INSERT INTO public.expenses(tenant_id,property_id,booking_id,expense_date,category,amount,description,expense_type,legacy_id,created_by)
      VALUES(p_tenant_id,b.property_id,b.id,p_date,'Diğer',(e->>'amount')::numeric,e->>'name','OPEX','BF:'||b.id::text||':'||(e->>'id'),auth.uid())
      ON CONFLICT(tenant_id,legacy_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT; total := total+inserted;
  END LOOP;
  RETURN total;
END $function$;

-- public.resolve_maintenance_ticket_atomic(uuid,uuid,numeric,text,text)
CREATE OR REPLACE FUNCTION public.resolve_maintenance_ticket_atomic(p_tenant_id uuid, p_ticket_id uuid, p_actual_cost numeric, p_category text DEFAULT 'Tadilat'::text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_ticket public.maintenance_tickets%ROWTYPE;
    v_expense_id UUID := NULL;
    v_expense_desc TEXT;
    v_category TEXT;
BEGIN
    IF v_user_id IS NULL AND coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum açılmamış. Lütfen önce giriş yapın.'
            USING ERRCODE = '28000';
    END IF;

    IF coalesce(auth.jwt() ->> 'role', '') != 'service_role' THEN
        SELECT role INTO v_user_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id;

        -- phase53 (L-107): kapanis gider yazar; yalniz yonetim rolleri
        IF NOT COALESCE(public.can_manage_operations(p_tenant_id), FALSE) THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Bakım kaydını kapatmak için yetkiniz bulunmuyor.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO v_ticket
    FROM public.maintenance_tickets
    WHERE id = p_ticket_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_ticket.id IS NULL THEN
        RAISE EXCEPTION 'TICKET_NOT_FOUND: Bakım kaydı bulunamadı veya yetkiniz yok.'
            USING ERRCODE = '42501';
    END IF;

    IF v_ticket.status = 'RESOLVED' AND v_ticket.expense_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'ticket_id', v_ticket.id,
            'status', v_ticket.status,
            'expense_id', v_ticket.expense_id,
            'actual_cost', v_ticket.actual_cost,
            'already_resolved', true
        );
    END IF;

    v_expense_id := v_ticket.expense_id;

    IF p_actual_cost IS NOT NULL AND p_actual_cost > 0 AND v_expense_id IS NULL THEN
        v_category := coalesce(nullif(trim(p_category), ''), 'Tadilat');
        v_expense_desc := coalesce(nullif(trim(p_description), ''), 'Bakım Gideri: ' || v_ticket.title);

        INSERT INTO public.expenses (
            tenant_id,
            property_id,
            booking_id,
            expense_date,
            category,
            amount,
            description,
            expense_type,
            created_by
        ) VALUES (
            p_tenant_id,
            v_ticket.property_id,
            v_ticket.booking_id,
            CURRENT_DATE,
            v_category,
            p_actual_cost,
            v_expense_desc,
            'OPEX',
            v_user_id
        ) RETURNING id INTO v_expense_id;
    END IF;

    UPDATE public.maintenance_tickets
    SET status = 'RESOLVED',
        actual_cost = coalesce(p_actual_cost, v_ticket.actual_cost, 0),
        expense_id = v_expense_id,
        resolved_at = NOW(),
        updated_at = NOW()
    WHERE id = v_ticket.id;

    RETURN jsonb_build_object(
        'success', true,
        'ticket_id', v_ticket.id,
        'status', 'RESOLVED',
        'expense_id', v_expense_id,
        'actual_cost', coalesce(p_actual_cost, v_ticket.actual_cost, 0),
        'already_resolved', false
    );
END;
$function$;

-- public.assign_cleaning_task(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.assign_cleaning_task(p_cleaning_task_id uuid, p_person_id uuid, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_task      public.cleaning_tasks%ROWTYPE;
    v_exec      public.cleaning_task_executions%ROWTYPE;
    v_snapshot  JSONB := '{"sections": [], "supplies": []}'::jsonb;
    v_tenant    UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    -- Yetki kayit aramadan ONCE: kiraci, gorevin kiracisi uzerinden degil
    -- cagiranin yonettigi kiracilar uzerinden cozulur.
    SELECT ct.tenant_id INTO v_tenant FROM public.cleaning_tasks ct
    WHERE ct.id = p_cleaning_task_id AND public.can_manage_operations(ct.tenant_id);
    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Temizlik atama yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_task FROM public.cleaning_tasks WHERE id = p_cleaning_task_id FOR UPDATE;
    IF v_task.status = 'DONE' THEN
        RAISE EXCEPTION 'CLEANING_ALREADY_DONE: Bu temizlik zaten yapildi olarak kayitli.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.operational_people
                   WHERE id = p_person_id AND tenant_id = v_tenant AND kind = 'CLEANER' AND is_active) THEN
        RAISE EXCEPTION 'PERSON_NOT_ASSIGNABLE: Kisi bu isletmenin aktif temizlikcisi degil.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE cleaning_task_id = p_cleaning_task_id FOR UPDATE;
    IF v_exec.id IS NOT NULL AND v_exec.status IN ('CLEANED', 'INSPECTED') THEN
        RAISE EXCEPTION 'EXECUTION_SIGNED: Temizlikci imzaladiktan sonra atama degistirilemez.' USING ERRCODE = '22023';
    END IF;

    IF p_template_id IS NOT NULL THEN
        SELECT items INTO v_snapshot FROM public.property_checklist_templates
        WHERE id = p_template_id AND tenant_id = v_tenant AND is_active
          AND (property_id IS NULL OR property_id = v_task.property_id)
          AND jsonb_typeof(items) = 'object';
        IF v_snapshot IS NULL THEN
            RAISE EXCEPTION 'TEMPLATE_NOT_USABLE: Sablon bu mulk icin kullanilamaz.' USING ERRCODE = '22023';
        END IF;
    ELSE
        -- genel once, eve ozel sonra (her birinden en yeni aktif surum)
        SELECT jsonb_build_object(
                 'sections', COALESCE((SELECT jsonb_agg(s ORDER BY ord, idx) FROM (
                     SELECT s, t.ord, x.idx FROM (
                        SELECT items, CASE WHEN property_id IS NULL THEN 0 ELSE 1 END AS ord FROM (
                            SELECT DISTINCT ON (property_id IS NULL) items, property_id
                            FROM public.property_checklist_templates
                            WHERE tenant_id = v_tenant AND is_active AND task_type = 'CLEANING'
                              AND jsonb_typeof(items) = 'object'
                              AND (property_id IS NULL OR property_id = v_task.property_id)
                            ORDER BY (property_id IS NULL), version DESC, updated_at DESC) q) t,
                        jsonb_array_elements(t.items -> 'sections') WITH ORDINALITY AS x(s, idx)) z), '[]'::jsonb),
                 'supplies', COALESCE((SELECT jsonb_agg(s ORDER BY ord, idx) FROM (
                     SELECT s, t.ord, x.idx FROM (
                        SELECT items, CASE WHEN property_id IS NULL THEN 0 ELSE 1 END AS ord FROM (
                            SELECT DISTINCT ON (property_id IS NULL) items, property_id
                            FROM public.property_checklist_templates
                            WHERE tenant_id = v_tenant AND is_active AND task_type = 'CLEANING'
                              AND jsonb_typeof(items) = 'object'
                              AND (property_id IS NULL OR property_id = v_task.property_id)
                            ORDER BY (property_id IS NULL), version DESC, updated_at DESC) q) t,
                        jsonb_array_elements(COALESCE(t.items -> 'supplies', '[]'::jsonb)) WITH ORDINALITY AS x(s, idx)) z), '[]'::jsonb)
               ) INTO v_snapshot;
    END IF;

    IF v_exec.id IS NULL THEN
        INSERT INTO public.cleaning_task_executions (tenant_id, cleaning_task_id, person_id, template_id, checklist_snapshot)
        VALUES (v_tenant, p_cleaning_task_id, p_person_id, p_template_id, v_snapshot)
        RETURNING * INTO v_exec;
    ELSE
        UPDATE public.cleaning_task_executions
           SET person_id = p_person_id, template_id = p_template_id, checklist_snapshot = v_snapshot,
               checklist_result = '{}'::jsonb, supplies_result = '{}'::jsonb, status = 'ASSIGNED'
         WHERE id = v_exec.id
        RETURNING * INTO v_exec;
    END IF;

    RETURN jsonb_build_object('success', true, 'execution_id', v_exec.id, 'status', v_exec.status,
                              'sections', jsonb_array_length(v_snapshot -> 'sections'));
END;
$function$;

-- public.fn_execution_actor(uuid)
CREATE OR REPLACE FUNCTION public.fn_execution_actor(p_execution_id uuid)
 RETURNS TABLE(tenant_id uuid, is_manager boolean, is_assignee boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT e.tenant_id,
           public.can_manage_operations(e.tenant_id),
           EXISTS (SELECT 1 FROM public.operational_people op
                   WHERE op.id = e.person_id AND op.tenant_id = e.tenant_id AND op.user_id = auth.uid())
    FROM public.cleaning_task_executions e
    WHERE e.id = p_execution_id
      AND (public.can_manage_operations(e.tenant_id)
           OR EXISTS (SELECT 1 FROM public.operational_people op
                      WHERE op.id = e.person_id AND op.tenant_id = e.tenant_id AND op.user_id = auth.uid()));
$function$;

-- public.save_my_task_checklist(uuid,jsonb,text,text)
CREATE OR REPLACE FUNCTION public.save_my_task_checklist(p_task_id uuid, p_result jsonb, p_status text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_task public.operational_tasks%ROWTYPE;
    v_next_checklist JSONB;
    v_next_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_task FROM public.operational_tasks t
    WHERE t.id = p_task_id
      AND (public.can_manage_operations(t.tenant_id)
           OR (t.assigned_to = auth.uid() AND public.is_tenant_member(t.tenant_id)))
    FOR UPDATE;
    IF v_task.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu gorev size atanmamis.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status IN ('DONE', 'CANCELLED') THEN
        RAISE EXCEPTION 'TASK_LOCKED: Tamamlanmis veya iptal edilmis gorev degistirilemez.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_result, '{}'::jsonb)) <> 'object'
       OR EXISTS (
            SELECT 1 FROM jsonb_each(COALESCE(p_result, '{}'::jsonb)) entry
            WHERE jsonb_typeof(entry.value) <> 'object'
               OR jsonb_typeof(entry.value -> 'z') <> 'boolean'
               OR entry.value - 'z' <> '{}'::jsonb
       ) THEN
        RAISE EXCEPTION 'INVALID_RESULT: Isaretler { anahtar: { z: true/false } } olmali.' USING ERRCODE = '22023';
    END IF;

    v_next_status := COALESCE(p_status, CASE WHEN v_task.status = 'TODO' THEN 'IN_PROGRESS' ELSE v_task.status END);
    IF v_next_status NOT IN ('TODO', 'IN_PROGRESS', 'DONE') THEN
        RAISE EXCEPTION 'INVALID_STATUS: %', v_next_status USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(v_task.checklist) = 'array' THEN
        SELECT COALESCE(jsonb_agg(
                 CASE WHEN p_result ? format('s0.i%s', ordinality - 1)
                      THEN jsonb_set(value, '{completed}', p_result -> format('s0.i%s', ordinality - 1) -> 'z', true)
                      ELSE value END
                 ORDER BY ordinality), '[]'::jsonb)
          INTO v_next_checklist
          FROM jsonb_array_elements(v_task.checklist) WITH ORDINALITY;
    ELSIF jsonb_typeof(v_task.checklist) = 'object'
          AND jsonb_typeof(v_task.checklist -> 'sections') = 'array' THEN
        v_next_checklist := jsonb_set(v_task.checklist, '{result}', COALESCE(p_result, '{}'::jsonb), true);
    ELSE
        RAISE EXCEPTION 'INVALID_CHECKLIST: Gorev kontrol listesi okunamiyor.' USING ERRCODE = '22023';
    END IF;

    IF v_next_status = 'DONE'
       AND NOT public.fn_checklist_critical_complete(v_next_checklist, NULL) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Onemli maddeler ve alt kontroller tamamlanmadi.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.operational_tasks
       SET checklist = v_next_checklist,
           status = v_next_status,
           completed_at = CASE WHEN v_next_status = 'DONE' THEN now() ELSE NULL END,
           completed_by = CASE WHEN v_next_status = 'DONE' THEN auth.uid() ELSE NULL END,
           evidence_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), evidence_note)
     WHERE id = p_task_id;

    IF v_task.status IS DISTINCT FROM v_next_status THEN
        INSERT INTO public.operations_audit_logs
            (tenant_id, task_id, action, old_status, new_status, performed_by, details)
        VALUES
            (v_task.tenant_id, p_task_id,
             CASE v_next_status WHEN 'TODO' THEN 'REOPENED' WHEN 'IN_PROGRESS' THEN 'STARTED' ELSE 'COMPLETED' END,
             v_task.status, v_next_status, auth.uid(),
             jsonb_build_object('source', 'save_my_task_checklist'));
    END IF;
    RETURN jsonb_build_object('success', true, 'status', v_next_status, 'checklist', v_next_checklist);
END;
$function$;

-- public.set_my_task_status(uuid,text,text)
CREATE OR REPLACE FUNCTION public.set_my_task_status(p_task_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_task public.operational_tasks%ROWTYPE;
    v_old TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_task FROM public.operational_tasks t
    WHERE t.id = p_task_id
      AND (public.can_manage_operations(t.tenant_id)
           OR (t.assigned_to = auth.uid() AND public.is_tenant_member(t.tenant_id)))
    FOR UPDATE;
    IF v_task.id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu gorev size atanmamis.' USING ERRCODE = '42501';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE') THEN
        RAISE EXCEPTION 'INVALID_STATUS: %', p_status USING ERRCODE = '22023';
    END IF;
    IF p_status = 'DONE' AND NOT public.fn_checklist_critical_complete(v_task.checklist, NULL) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Onemli maddeler ve alt kontroller tamamlanmadi.' USING ERRCODE = '22023';
    END IF;
    v_old := v_task.status;
    UPDATE public.operational_tasks
       SET status = p_status,
           completed_at = CASE WHEN p_status = 'DONE' THEN now() ELSE NULL END,
           completed_by = CASE WHEN p_status = 'DONE' THEN auth.uid() ELSE NULL END,
           evidence_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), evidence_note)
     WHERE id = p_task_id;
    INSERT INTO public.operations_audit_logs (tenant_id, task_id, action, old_status, new_status, performed_by, details)
    VALUES (v_task.tenant_id, p_task_id,
            CASE p_status WHEN 'TODO' THEN 'REOPENED' WHEN 'IN_PROGRESS' THEN 'STARTED'
                          WHEN 'BLOCKED' THEN 'BLOCKED' ELSE 'COMPLETED' END,
            v_old, p_status, auth.uid(), jsonb_build_object('source', 'set_my_task_status'));
    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Finans tablolarinda yazma can_write_ledger, operasyon tablolarinda
--    can_manage_operations; operasyon izni olan operasyon defterini okur.
--    Ifadeler test katalogundan (pg_policies); yalniz yetki parcasi degisti.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cleaning_task_executions_delete" ON public.cleaning_task_executions;
CREATE POLICY "cleaning_task_executions_delete" ON public.cleaning_task_executions AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "cleaning_task_executions_insert" ON public.cleaning_task_executions;
CREATE POLICY "cleaning_task_executions_insert" ON public.cleaning_task_executions AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "cleaning_task_executions_select" ON public.cleaning_task_executions;
CREATE POLICY "cleaning_task_executions_select" ON public.cleaning_task_executions AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR (EXISTS ( SELECT 1
   FROM operational_people op
  WHERE ((op.id = cleaning_task_executions.person_id) AND (op.tenant_id = cleaning_task_executions.tenant_id) AND (op.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "cleaning_task_executions_update" ON public.cleaning_task_executions;
CREATE POLICY "cleaning_task_executions_update" ON public.cleaning_task_executions AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "Managers delete cleaning" ON public.cleaning_tasks;
CREATE POLICY "Managers delete cleaning" ON public.cleaning_tasks AS PERMISSIVE FOR DELETE TO public
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "cleaning_tasks_insert" ON public.cleaning_tasks;
CREATE POLICY "cleaning_tasks_insert" ON public.cleaning_tasks AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "cleaning_tasks_select" ON public.cleaning_tasks;
CREATE POLICY "cleaning_tasks_select" ON public.cleaning_tasks AS PERMISSIVE FOR SELECT TO authenticated
    USING ((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)));
DROP POLICY IF EXISTS "cleaning_tasks_update" ON public.cleaning_tasks;
CREATE POLICY "cleaning_tasks_update" ON public.cleaning_tasks AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "expense_template_occurrences_delete" ON public.expense_template_occurrences;
CREATE POLICY "expense_template_occurrences_delete" ON public.expense_template_occurrences AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expense_template_occurrences_insert" ON public.expense_template_occurrences;
CREATE POLICY "expense_template_occurrences_insert" ON public.expense_template_occurrences AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expense_template_occurrences_update" ON public.expense_template_occurrences;
CREATE POLICY "expense_template_occurrences_update" ON public.expense_template_occurrences AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expense_templates_delete" ON public.expense_templates;
CREATE POLICY "expense_templates_delete" ON public.expense_templates AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expense_templates_insert" ON public.expense_templates;
CREATE POLICY "expense_templates_insert" ON public.expense_templates AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expense_templates_update" ON public.expense_templates;
CREATE POLICY "expense_templates_update" ON public.expense_templates AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "Managers delete expenses" ON public.expenses;
CREATE POLICY "Managers delete expenses" ON public.expenses AS PERMISSIVE FOR DELETE TO public
    USING (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "Staff insert expenses" ON public.expenses;
CREATE POLICY "Staff insert expenses" ON public.expenses AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update" ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "finance_import_batch_rows_insert" ON public.finance_import_batch_rows;
CREATE POLICY "finance_import_batch_rows_insert" ON public.finance_import_batch_rows AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "finance_import_batches_insert" ON public.finance_import_batches;
CREATE POLICY "finance_import_batches_insert" ON public.finance_import_batches AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "Finance roles insert financial transactions" ON public.financial_transactions;
CREATE POLICY "Finance roles insert financial transactions" ON public.financial_transactions AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "Finance roles update financial transactions" ON public.financial_transactions;
CREATE POLICY "Finance roles update financial transactions" ON public.financial_transactions AS PERMISSIVE FOR UPDATE TO public
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "housekeeping_status_overrides_delete" ON public.housekeeping_status_overrides;
CREATE POLICY "housekeeping_status_overrides_delete" ON public.housekeeping_status_overrides AS PERMISSIVE FOR DELETE TO authenticated
    USING ((can_manage_operations(tenant_id) OR ((get_tenant_role(tenant_id))::text = 'staff'::text)));
DROP POLICY IF EXISTS "housekeeping_status_overrides_insert" ON public.housekeeping_status_overrides;
CREATE POLICY "housekeeping_status_overrides_insert" ON public.housekeeping_status_overrides AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((can_manage_operations(tenant_id) OR ((get_tenant_role(tenant_id))::text = 'staff'::text)));
DROP POLICY IF EXISTS "housekeeping_status_overrides_update" ON public.housekeeping_status_overrides;
CREATE POLICY "housekeeping_status_overrides_update" ON public.housekeeping_status_overrides AS PERMISSIVE FOR UPDATE TO authenticated
    USING ((can_manage_operations(tenant_id) OR ((get_tenant_role(tenant_id))::text = 'staff'::text)))
    WITH CHECK ((can_manage_operations(tenant_id) OR ((get_tenant_role(tenant_id))::text = 'staff'::text)));
DROP POLICY IF EXISTS "income_entries_delete" ON public.income_entries;
CREATE POLICY "income_entries_delete" ON public.income_entries AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "income_entries_insert" ON public.income_entries;
CREATE POLICY "income_entries_insert" ON public.income_entries AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "income_entries_update" ON public.income_entries;
CREATE POLICY "income_entries_update" ON public.income_entries AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "maintenance_assignments_delete" ON public.maintenance_assignments;
CREATE POLICY "maintenance_assignments_delete" ON public.maintenance_assignments AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "maintenance_assignments_insert" ON public.maintenance_assignments;
CREATE POLICY "maintenance_assignments_insert" ON public.maintenance_assignments AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "maintenance_assignments_select" ON public.maintenance_assignments;
CREATE POLICY "maintenance_assignments_select" ON public.maintenance_assignments AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR (EXISTS ( SELECT 1
   FROM operational_people op
  WHERE ((op.id = maintenance_assignments.person_id) AND (op.tenant_id = maintenance_assignments.tenant_id) AND (op.user_id = auth.uid()))))));
DROP POLICY IF EXISTS "maintenance_assignments_update" ON public.maintenance_assignments;
CREATE POLICY "maintenance_assignments_update" ON public.maintenance_assignments AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "maintenance_tickets_delete" ON public.maintenance_tickets;
CREATE POLICY "maintenance_tickets_delete" ON public.maintenance_tickets AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "maintenance_tickets_insert" ON public.maintenance_tickets;
CREATE POLICY "maintenance_tickets_insert" ON public.maintenance_tickets AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "maintenance_tickets_select" ON public.maintenance_tickets;
CREATE POLICY "maintenance_tickets_select" ON public.maintenance_tickets AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR ((assigned_to = auth.uid()) AND is_tenant_member(tenant_id))));
DROP POLICY IF EXISTS "maintenance_tickets_update" ON public.maintenance_tickets;
CREATE POLICY "maintenance_tickets_update" ON public.maintenance_tickets AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "Managers update closes" ON public.monthly_financial_closes;
CREATE POLICY "Managers update closes" ON public.monthly_financial_closes AS PERMISSIVE FOR ALL TO public
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "monthly_targets_delete" ON public.monthly_targets;
CREATE POLICY "monthly_targets_delete" ON public.monthly_targets AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "monthly_targets_insert" ON public.monthly_targets;
CREATE POLICY "monthly_targets_insert" ON public.monthly_targets AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "monthly_targets_update" ON public.monthly_targets;
CREATE POLICY "monthly_targets_update" ON public.monthly_targets AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_write_ledger(tenant_id))
    WITH CHECK (can_write_ledger(tenant_id));
DROP POLICY IF EXISTS "operation_evidence_insert" ON public.operation_evidence;
CREATE POLICY "operation_evidence_insert" ON public.operation_evidence AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK ((can_manage_operations(tenant_id) OR ((uploaded_by = auth.uid()) AND is_tenant_member(tenant_id) AND ((EXISTS ( SELECT 1
   FROM operational_tasks ot
  WHERE ((ot.id = operation_evidence.operational_task_id) AND (ot.tenant_id = operation_evidence.tenant_id) AND (ot.assigned_to = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM maintenance_tickets mt
  WHERE ((mt.id = operation_evidence.maintenance_ticket_id) AND (mt.tenant_id = operation_evidence.tenant_id) AND (mt.assigned_to = auth.uid()))))))));
DROP POLICY IF EXISTS "operation_evidence_select" ON public.operation_evidence;
CREATE POLICY "operation_evidence_select" ON public.operation_evidence AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR ((uploaded_by = auth.uid()) AND is_tenant_member(tenant_id))));
DROP POLICY IF EXISTS "operational_people_delete" ON public.operational_people;
CREATE POLICY "operational_people_delete" ON public.operational_people AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operational_people_insert" ON public.operational_people;
CREATE POLICY "operational_people_insert" ON public.operational_people AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operational_people_select" ON public.operational_people;
CREATE POLICY "operational_people_select" ON public.operational_people AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR ((user_id = auth.uid()) AND is_tenant_member(tenant_id))));
DROP POLICY IF EXISTS "operational_people_update" ON public.operational_people;
CREATE POLICY "operational_people_update" ON public.operational_people AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operational_tasks_delete" ON public.operational_tasks;
CREATE POLICY "operational_tasks_delete" ON public.operational_tasks AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operational_tasks_insert" ON public.operational_tasks;
CREATE POLICY "operational_tasks_insert" ON public.operational_tasks AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operational_tasks_select" ON public.operational_tasks;
CREATE POLICY "operational_tasks_select" ON public.operational_tasks AS PERMISSIVE FOR SELECT TO authenticated
    USING (((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)) OR ((assigned_to = auth.uid()) AND is_tenant_member(tenant_id))));
DROP POLICY IF EXISTS "operational_tasks_update" ON public.operational_tasks;
CREATE POLICY "operational_tasks_update" ON public.operational_tasks AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operations_audit_logs_insert" ON public.operations_audit_logs;
CREATE POLICY "operations_audit_logs_insert" ON public.operations_audit_logs AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "operations_audit_logs_select" ON public.operations_audit_logs;
CREATE POLICY "operations_audit_logs_select" ON public.operations_audit_logs AS PERMISSIVE FOR SELECT TO authenticated
    USING ((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)));
DROP POLICY IF EXISTS "Staff manage templates" ON public.property_checklist_templates;
CREATE POLICY "Staff manage templates" ON public.property_checklist_templates AS PERMISSIVE FOR ALL TO public
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "Staff manage recurring" ON public.recurring_task_rules;
CREATE POLICY "Staff manage recurring" ON public.recurring_task_rules AS PERMISSIVE FOR ALL TO public
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "recurring_task_rules_select" ON public.recurring_task_rules;
CREATE POLICY "recurring_task_rules_select" ON public.recurring_task_rules AS PERMISSIVE FOR SELECT TO authenticated
    USING ((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)));
DROP POLICY IF EXISTS "task_templates_delete" ON public.task_templates;
CREATE POLICY "task_templates_delete" ON public.task_templates AS PERMISSIVE FOR DELETE TO authenticated
    USING (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "task_templates_insert" ON public.task_templates;
CREATE POLICY "task_templates_insert" ON public.task_templates AS PERMISSIVE FOR INSERT TO authenticated
    WITH CHECK (can_manage_operations(tenant_id));
DROP POLICY IF EXISTS "task_templates_select" ON public.task_templates;
CREATE POLICY "task_templates_select" ON public.task_templates AS PERMISSIVE FOR SELECT TO authenticated
    USING ((can_read_ledger(tenant_id) OR can_manage_operations(tenant_id)));
DROP POLICY IF EXISTS "task_templates_update" ON public.task_templates;
CREATE POLICY "task_templates_update" ON public.task_templates AS PERMISSIVE FOR UPDATE TO authenticated
    USING (can_manage_operations(tenant_id))
    WITH CHECK (can_manage_operations(tenant_id));

-- -----------------------------------------------------------------------------
-- 6. Dogrulama
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
    v_def   TEXT;
    v_imza  TEXT;
    v_kalan TEXT;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenant_member_permissions'::regclass) THEN
        RAISE EXCEPTION 'PHASE107_RLS_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tenant_member_permissions'::regclass
                    AND tgname = 'trg_tenant_id_immutable' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE107_TENANT_ID_TRIGGER_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.tenant_members'::regclass
                    AND tgname = 'trg_reset_member_permissions' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PHASE107_ROLE_CHANGE_TRIGGER_MISSING';
    END IF;
    -- Tek FK (uyelik): ikinci iliski yolu PostgREST gommesini (PGRST201) bozar.
    IF (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.confrelid
         WHERE c.conrelid = 'public.tenant_member_permissions'::regclass AND c.contype = 'f'
           AND t.relnamespace = 'public'::regnamespace) <> 1 THEN
        RAISE EXCEPTION 'PHASE107_EMBED_AMBIGUITY_FK';
    END IF;
    IF has_table_privilege('anon', 'public.tenant_member_permissions', 'SELECT')
       OR has_table_privilege('authenticated', 'public.tenant_member_permissions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.tenant_member_permissions', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.tenant_member_permissions', 'DELETE') THEN
        RAISE EXCEPTION 'PHASE107_TABLE_PRIVILEGE';
    END IF;

    FOREACH v_imza IN ARRAY ARRAY['public.can_read_sales(uuid)', 'public.can_write_sales(uuid)', 'public.can_read_ledger(uuid)',
                                  'public.can_write_ledger(uuid)', 'public.can_manage_operations(uuid)'] LOOP
        IF position('fn_member_capability' IN pg_get_functiondef(v_imza::regprocedure)) = 0 THEN
            RAISE EXCEPTION 'PHASE107_CAPABILITY %', v_imza;
        END IF;
    END LOOP;

    -- Rolu satir ici listeyle denetleyen hedef fonksiyon kalmadi.
    FOREACH v_imza IN ARRAY ARRAY[
        'public.accept_extension_offer_atomic(uuid,uuid)',
        'public.create_booking_atomic(uuid,uuid,text,text,text,text,date,date,integer,numeric,numeric,numeric,numeric,numeric,text,text)',
        'public.update_booking_atomic(uuid,uuid,uuid,text,text,text,date,date,integer,numeric,numeric,numeric,numeric,numeric,text,text)',
        'public.convert_lead_to_booking_atomic(uuid,uuid,uuid,text,date,date,integer,numeric,numeric,numeric,numeric,text)',
        'public.upsert_booking_guest_atomic(uuid,uuid,text,text,text,text,text,text,boolean,boolean,boolean,boolean)',
        'public.guard_pricing_write_authorization()',
        'public.close_monthly_period_atomic(uuid,integer,integer,jsonb)',
        'public.undo_finance_import(uuid,uuid,text)',
        'public.resolve_maintenance_ticket_atomic(uuid,uuid,numeric,text,text)'] LOOP
        v_def := pg_get_functiondef(v_imza::regprocedure);
        IF v_def ~ 'NOT IN \(''owner''' OR v_def !~ 'public\.can_(write_sales|write_ledger|manage_operations)\(' THEN
            RAISE EXCEPTION 'PHASE107_FUNCTION_NOT_REWIRED %', v_imza;
        END IF;
    END LOOP;
    FOREACH v_imza IN ARRAY ARRAY[
        'public.generate_expense_from_template(uuid,date)', 'public.generate_expense_from_template(uuid,uuid,date)',
        'public.post_booking_extra_expenses(uuid,uuid,date)', 'public.assign_cleaning_task(uuid,uuid,uuid)',
        'public.fn_execution_actor(uuid)', 'public.save_my_task_checklist(uuid,jsonb,text,text)',
        'public.set_my_task_status(uuid,text,text)'] LOOP
        IF position('can_manage_tenant' IN pg_get_functiondef(v_imza::regprocedure)) > 0 THEN
            RAISE EXCEPTION 'PHASE107_FUNCTION_NOT_REWIRED %', v_imza;
        END IF;
    END LOOP;

    -- Finans ve operasyon tablolarinda yazma yonetim rolune bagli kalmadi
    -- (yalniz finans hareketi silme bilerek owner/admin).
    SELECT string_agg(tablename || ':' || policyname, ', ') INTO v_kalan
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('expenses', 'income_entries', 'expense_templates', 'expense_template_occurrences', 'finance_import_batches',
                         'finance_import_batch_rows', 'financial_transactions', 'monthly_targets', 'monthly_financial_closes',
                         'cleaning_tasks', 'cleaning_task_executions', 'maintenance_tickets', 'maintenance_assignments', 'operational_tasks',
                         'operational_people', 'operation_evidence', 'operations_audit_logs', 'task_templates', 'recurring_task_rules',
                         'property_checklist_templates', 'housekeeping_status_overrides')
       AND policyname <> 'Finance roles delete financial transactions'
       AND (COALESCE(qual, '') || COALESCE(with_check, '')) ~ 'can_manage_tenant|ARRAY\[''owner''';
    IF v_kalan IS NOT NULL THEN
        RAISE EXCEPTION 'PHASE107_POLICY_NOT_REWIRED %', v_kalan;
    END IF;

    IF has_function_privilege('anon', 'public.set_member_permissions(uuid, uuid, jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.can_write_ledger(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.can_manage_operations(uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_member_capability(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE107_ANON_FUNCTION_PRIVILEGE';
    END IF;

    RAISE NOTICE 'PHASE 107 OK — kisi bazinda izin matrisi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (107, 'phase107_member_permissions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
