-- =============================================================================
-- LEXBNB PHASE 31 — "KAYDETMEYEN KAYDEDICI"NIN SON ALTI KALEMI
--
-- `saveAppData()` hicbir sey kaydetmiyor: govdesi yalnizca eski
-- `LEXBNB_DATA_*` localStorage anahtarlarini siliyor (CLAUDE.md 6). Onu
-- cagiran fonksiyonlarin cogu 20 Eylul 2026'da gercek bir Postgres
-- yazmasina baglandi; geriye kalan ALTI kalem "yazilacak tablo yok"
-- dendigi icin acik kaldi:
--
--   cycleHkStatus          -> temizlik durumu elle gecersiz kilma
--   saveMarketingCampaign  -> reklam kampanyasi defteri
--   saveInfluencerCollab   -> influencer / barter isbirligi defteri
--   setOtaPricingStrategy  -> kiracinin OTA fiyat stratejisi
--   saveOperatorNote       -> mulk basina operator notu
--   saveAllSettings        -> fiyat merdiveni (taban/hedef/premium/zirve) + isitma
--
-- Uretime 20 Eylul 2026'da salt okunur olarak soruldu; alti hedefin de
-- olmadigi dogrulandi (PGRST205 / 42703). Bu goc alti kalemin tamamini
-- kapatir.
--
-- TASARIM NOTU — neden fiyat merdiveni `properties` sutunu DEGIL:
-- GitHub Pages push ile aninda yayina alir, goc ise elle uygulanir
-- (AGENTS.md, dagitim sirasi tuzagi). `bookings`'e temizlik maliyeti
-- sutunu eklendiginde goc uygulanana kadar HICBIR rezervasyon
-- kaydedilemedi. `properties`'e yeni sutun eklemek ayni tuzaktir: mulk
-- kaydetme akisinin tamami kirilir. Merdiven bu yuzden ayri bir tabloda
-- durur; mulk CRUD'una hic dokunulmaz ve goc uygulanana kadar yalnizca
-- merdiven kaydi calismaz.
--
-- TASARIM NOTU — merdiven alanlari NULL olabilir (CLAUDE.md 3.6):
-- girilmemis bir basamak 0 DEGIL, BILINMIYOR'dur. `|| 3000` kalibiyla
-- uydurulan varsayilanlar 20 Eylul'de temizlendi; sema de ayni ayrimi
-- tasimak zorunda, yoksa "girilmedi" ile "sifir" tekrar birbirine karisir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. REKLAM KAMPANYASI DEFTERI
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('META', 'GOOGLE', 'TIKTOK', 'OTHER')),
  start_date DATE,
  end_date DATE,
  budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  spent NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spent >= 0),
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  leads_count INTEGER NOT NULL DEFAULT 0 CHECK (leads_count >= 0),
  bookings_count INTEGER NOT NULL DEFAULT 0 CHECK (bookings_count >= 0),
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED')),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_marketing_campaign_name CHECK (btrim(name) <> ''),
  CONSTRAINT chk_marketing_campaign_dates
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant
  ON public.marketing_campaigns (tenant_id, start_date DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- 2. INFLUENCER / BARTER ISBIRLIGI DEFTERI
--
-- `followers` ve `collab_dates` metin: arayuz "12,5K" ve "12-15 Haziran"
-- gibi serbest girdi aliyor. Sayiya zorlamak girilen veriyi bozar;
-- uydurulmus bir sayiya cevirmek 3.6 ihlalidir.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_collabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  handle VARCHAR(120) NOT NULL,
  followers VARCHAR(40),
  collab_dates VARCHAR(120),
  cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  discount_code VARCHAR(40),
  bookings_count INTEGER NOT NULL DEFAULT 0 CHECK (bookings_count >= 0),
  revenue NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('PLANLANAN', 'COMPLETED', 'IPTAL')),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_influencer_handle CHECK (btrim(handle) <> '')
);

CREATE INDEX IF NOT EXISTS idx_influencer_collabs_tenant
  ON public.influencer_collabs (tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 3. KIRACI AYARLARI (anahtar/deger)
--
-- Bugunku tek musterisi `otaPricingStrategy` ('MARKUP' | 'ABSORBED').
-- Tek bir enum icin sutun acmak her yeni ayarda yeni goc demek; anahtar
-- bicimi kisitlanmis bir KV tablosu ayni korumayi verir.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key VARCHAR(64) NOT NULL,
  value JSONB NOT NULL,
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key),
  CONSTRAINT chk_tenant_setting_key CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT chk_tenant_setting_value_size CHECK (pg_column_size(value) <= 8192)
);

-- -----------------------------------------------------------------------------
-- 4. MULK BASINA OPERATOR NOTU
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_operator_notes (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_operator_note_size CHECK (char_length(note) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_property_operator_notes_tenant
  ON public.property_operator_notes (tenant_id);

-- -----------------------------------------------------------------------------
-- 5. FIYAT MERDIVENI
--
-- `base_price` ve `clean_cost` zaten `properties` icinde; ayni sayiyi iki
-- tabloda tutmak "hangisi dogru" sorusunu acar (3.4), o yuzden burada
-- YOKLAR. Burasi yalnizca merdivenin geri kalani.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_pricing_ladder (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  floor_price NUMERIC(12,2) CHECK (floor_price IS NULL OR floor_price >= 0),
  target_price NUMERIC(12,2) CHECK (target_price IS NULL OR target_price >= 0),
  premium_price NUMERIC(12,2) CHECK (premium_price IS NULL OR premium_price >= 0),
  peak_price NUMERIC(12,2) CHECK (peak_price IS NULL OR peak_price >= 0),
  heating_cost NUMERIC(12,2) CHECK (heating_cost IS NULL OR heating_cost >= 0),
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_pricing_ladder_tenant
  ON public.property_pricing_ladder (tenant_id);

-- -----------------------------------------------------------------------------
-- 6. TEMIZLIK DURUMU ELLE GECERSIZ KILMA
--
-- Satirin VARLIGI gecersiz kilmadir; "AUTO" durumu satirin SILINMESIDIR.
-- 'AUTO' diye bir deger saklamak, otomatik hesaplanan durumu elle
-- girilmis gibi gosterirdi.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.housekeeping_status_overrides (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('CLEANING', 'READY', 'OCCUPIED')),
  updated_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_housekeeping_overrides_tenant
  ON public.housekeeping_status_overrides (tenant_id);

-- -----------------------------------------------------------------------------
-- updated_at tetikleyicileri (phase24'un ortak fonksiyonu)
-- -----------------------------------------------------------------------------
DO $triggers$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'marketing_campaigns', 'influencer_collabs', 'tenant_settings',
    'property_operator_notes', 'property_pricing_ladder',
    'housekeeping_status_overrides'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', v_table);
  END LOOP;
END
$triggers$;

-- =============================================================================
-- RLS — okuma tum uyelere, yazma role gore
--
-- Politikalar POZITIF `IN` kullanir. Prosedurel `IF ... NOT IN` kalibi
-- yabanci kiraciya karsi sessizce atlanir (CLAUDE.md 7, `NULL NOT IN`);
-- RLS'te pozitif `IN` NULL rolde "izin yok" verir ve bu tuzaga dusmez.
--
-- Temizlik durumu gecersiz kilmayi `staff` da yapabilir: sahadaki temizlik
-- ekibi bu dugmeye basan taraftir. Reklam butcesi ve fiyat merdiveni
-- yonetim kalemidir; onlar owner/admin/manager ile sinirlidir.
-- =============================================================================
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_collabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_operator_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_pricing_ladder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_status_overrides ENABLE ROW LEVEL SECURITY;

DO $policies$
DECLARE
  v_spec RECORD;
BEGIN
  FOR v_spec IN
    SELECT * FROM (VALUES
      ('marketing_campaigns',           $r$'owner', 'admin', 'manager'$r$),
      ('influencer_collabs',            $r$'owner', 'admin', 'manager'$r$),
      ('tenant_settings',               $r$'owner', 'admin', 'manager'$r$),
      ('property_operator_notes',       $r$'owner', 'admin', 'manager', 'staff'$r$),
      ('property_pricing_ladder',       $r$'owner', 'admin', 'manager'$r$),
      ('housekeeping_status_overrides', $r$'owner', 'admin', 'manager', 'staff'$r$)
    ) AS t(tablo, roller)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_spec.tablo || '_select', v_spec.tablo);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_spec.tablo || '_insert', v_spec.tablo);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_spec.tablo || '_update', v_spec.tablo);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_spec.tablo || '_delete', v_spec.tablo);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (public.is_tenant_member(tenant_id))',
      v_spec.tablo || '_select', v_spec.tablo);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (public.is_tenant_member(tenant_id) '
      'AND public.get_tenant_role(tenant_id) IN (%s))',
      v_spec.tablo || '_insert', v_spec.tablo, v_spec.roller);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      'USING (public.is_tenant_member(tenant_id) '
      'AND public.get_tenant_role(tenant_id) IN (%s)) '
      'WITH CHECK (public.is_tenant_member(tenant_id) '
      'AND public.get_tenant_role(tenant_id) IN (%s))',
      v_spec.tablo || '_update', v_spec.tablo, v_spec.roller, v_spec.roller);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
      'USING (public.is_tenant_member(tenant_id) '
      'AND public.get_tenant_role(tenant_id) IN (%s))',
      v_spec.tablo || '_delete', v_spec.tablo, v_spec.roller);

    -- Supabase `public` semasindaki yeni tablolara varsayilan olarak `anon`
    -- yetkisi verir ve `REVOKE ... FROM PUBLIC` bunu KALDIRMAZ (CLAUDE.md 7).
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_spec.tablo);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_spec.tablo);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated',
      v_spec.tablo);
  END LOOP;
END
$policies$;

-- =============================================================================
-- VERI SIFIRLAMA (3.7) — yeni defterler de bosalmali
--
-- `reset_tenant_data` tablo listesi ELLE yazilmis bir dizidir: yeni bir
-- defter eklenip listeye yazilmazsa "sifirla" o defteri oldugu gibi
-- birakir ve musteri sifirladigini sanir. Mulke bagli uc tablo zaten
-- `properties` silinince cascade ile gider; yine de listeye acikca
-- yazilirlar — silme sirasi "cocuklar once" sozlesmesidir ve okuyan kisi
-- neyin silindigini dizide gormeli.
--
-- `tenant_settings` BILEREK listede yok: fiyat stratejisi bir AYARDIR,
-- defter degil. Sifirlama ekibi ve isletmeyi koruyor (3.7); ayarlari
-- silmek "defterleri bosalt" isteminin otesine gecerdi.
--
-- Govde phase21'deki ile birebir aynidir; yalnizca v_tablolar dizisine
-- bes satir eklenmistir.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_tenant_data(
    p_tenant_id UUID,
    p_confirm   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user_id  UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
    v_role     TEXT;
    v_sayim    JSONB;
    v_tablo    TEXT;
    v_silinen  BIGINT;
    v_toplam   BIGINT := 0;
    -- Silme sirasi: cocuklar once. Kalanlari FK cascade halleder.
    v_tablolar TEXT[] := ARRAY[
        'operation_evidence', 'operations_audit_logs', 'operational_tasks',
        'recurring_task_rules', 'property_checklist_templates',
        'message_delivery_logs', 'scheduled_messages', 'message_automation_rules',
        'message_templates', 'property_guest_settings',
        'extension_offers', 'booking_quotes',
        'rate_change_logs', 'pricing_events', 'pricing_overrides',
        'pricing_rules', 'pricing_profiles', 'daily_rates',
        'cleaning_tasks', 'maintenance_tickets',
        'expenses', 'bookings', 'guests', 'leads',
        'monthly_financial_closes', 'monthly_targets', 'finance_import_batches',
        'executive_alerts', 'user_notifications', 'audit_logs',
        'tenant_invitations', 'tenant_onboarding',
        -- phase31 defterleri
        'marketing_campaigns', 'influencer_collabs',
        'housekeeping_status_overrides', 'property_pricing_ladder',
        'property_operator_notes',
        'properties'
    ];
BEGIN
    IF v_user_id IS NULL AND v_jwt_role <> 'service_role' THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;

    IF v_jwt_role <> 'service_role' THEN
        SELECT role INTO v_role
        FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = v_user_id;

        IF v_role IS NULL OR v_role <> 'owner' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: İşletme verisini yalnızca işletme sahibi sıfırlayabilir.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF COALESCE(btrim(p_confirm), '') <> 'VERILERI SIFIRLA' THEN
        RAISE EXCEPTION 'CONFIRMATION_REQUIRED: Onaylamak için tam olarak "VERILERI SIFIRLA" yazmalısınız.'
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('lexbnb.tenant_reset', 'on', TRUE);

    v_sayim := '{}'::jsonb;
    FOREACH v_tablo IN ARRAY v_tablolar LOOP
        IF to_regclass('public.' || v_tablo) IS NOT NULL THEN
            EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_tablo)
                USING p_tenant_id;
            GET DIAGNOSTICS v_silinen = ROW_COUNT;
            IF v_silinen > 0 THEN
                v_sayim := v_sayim || jsonb_build_object(v_tablo, v_silinen);
                v_toplam := v_toplam + v_silinen;
            END IF;
        END IF;
    END LOOP;

    PERFORM set_config('lexbnb.tenant_reset', 'off', TRUE);

    -- Sifirlamanin kendisi denetim kaydina yazilir (silinen audit_logs'tan sonra).
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
        BEGIN
            INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, details)
            VALUES (p_tenant_id, v_user_id, 'TENANT_DATA_RESET', 'tenant',
                    jsonb_build_object('deleted', v_sayim, 'total', v_toplam, 'at', NOW()));
        EXCEPTION WHEN OTHERS THEN
            -- audit_logs semasi farkliysa sifirlama yine de basarili sayilir.
            NULL;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tenant_id', p_tenant_id,
        'total_deleted', v_toplam,
        'deleted', v_sayim
    );
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_tenant_data(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_tenant_data(UUID, TEXT) TO authenticated, service_role;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur
-- =============================================================================
DO $verify$
DECLARE
  v_tablo TEXT;
  v_def   TEXT;
  v_tablolar TEXT[] := ARRAY[
    'marketing_campaigns', 'influencer_collabs', 'tenant_settings',
    'property_operator_notes', 'property_pricing_ladder',
    'housekeeping_status_overrides'
  ];
BEGIN
  FOREACH v_tablo IN ARRAY v_tablolar LOOP
    IF to_regclass('public.' || v_tablo) IS NULL THEN
      RAISE EXCEPTION 'PHASE31_TABLE_MISSING: %', v_tablo;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_tablo AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'PHASE31_RLS_DISABLED: %', v_tablo;
    END IF;

    IF (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = v_tablo) < 4 THEN
      RAISE EXCEPTION 'PHASE31_POLICY_MISSING: %', v_tablo;
    END IF;

    -- `anon` yetkisi tabloda kalirsa, tarayicida duran anon anahtariyla
    -- kiraci defterine erisilir; RLS ikinci kattir, birincisi degil.
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_tablo AND grantee = 'anon'
    ) THEN
      RAISE EXCEPTION 'PHASE31_ANON_TABLE_GRANT_PRESENT: %', v_tablo;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_tablo
        AND grantee = 'authenticated' AND privilege_type = 'INSERT'
    ) THEN
      RAISE EXCEPTION 'PHASE31_AUTHENTICATED_WRITE_GRANT_MISSING: %', v_tablo;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_set_updated_at'
        AND tgrelid = ('public.' || v_tablo)::regclass AND NOT tgisinternal
    ) THEN
      RAISE EXCEPTION 'PHASE31_UPDATED_AT_TRIGGER_MISSING: %', v_tablo;
    END IF;
  END LOOP;

  -- Merdiven basamaklari NULL olabilmeli: "girilmedi" ile "sifir" ayri
  -- seylerdir (3.6). NOT NULL + DEFAULT 0 eklenirse bu kirilir.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'property_pricing_ladder'
      AND column_name IN ('floor_price', 'target_price', 'premium_price',
                          'peak_price', 'heating_cost')
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'PHASE31_LADDER_STEP_NOT_NULLABLE';
  END IF;

  -- Sifirlama yeni defterleri gormeli; gormezse "sifirlandi" denip
  -- reklam ve influencer defteri oldugu gibi kalir.
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reset_tenant_data'
  ORDER BY p.oid DESC LIMIT 1;
  IF v_def IS NULL
     OR strpos(v_def, 'marketing_campaigns') = 0
     OR strpos(v_def, 'influencer_collabs') = 0
     OR strpos(v_def, 'housekeeping_status_overrides') = 0 THEN
    RAISE EXCEPTION 'PHASE31_RESET_TABLE_LIST_STALE';
  END IF;
  IF strpos(v_def, 'tenant_settings') <> 0 THEN
    RAISE EXCEPTION 'PHASE31_RESET_DELETES_SETTINGS';
  END IF;
  IF has_function_privilege('anon', 'public.reset_tenant_data(UUID, TEXT)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE31_RESET_ANON_EXECUTE_PRESENT';
  END IF;

  RAISE NOTICE 'PHASE 31 OK — alti yerel defter Postgres''e tasindi, sifirlama listesi guncel.';
END
$verify$;
