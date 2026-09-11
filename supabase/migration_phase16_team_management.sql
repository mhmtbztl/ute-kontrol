-- =============================================================================
-- PHASE 16: EKİP DAVETİ & ROL YÖNETİMİ
-- =============================================================================
-- NEDEN:
--   Şema owner/admin/manager/staff/viewer rollerini ve RLS'ini destekliyor ama
--   bir işletmeye ikinci bir kullanıcı EKLEMENİN hiçbir yolu yok:
--
--   * Tarayıcı auth.users'ı okuyamaz, dolayısıyla bir e-postadan user_id
--     bulunamaz. tenant_members'a satır eklemek için gereken bilgi elde yok.
--   * profiles yalnızca sahibine görünür, dolayısıyla ekip listesi takım
--     arkadaşlarının adını/e-postasını gösteremez.
--
-- BU GÖÇ NE EKLER:
--   1. tenant_invitations tablosu (e-posta ile davet, kabul edilene kadar bekler)
--   2. create_tenant_invitation()  - davet oluştur
--   3. accept_pending_invitations() - giriş yapan kullanıcıyı bekleyen davetlere bağla
--   4. revoke_tenant_invitation()  - bekleyen daveti iptal et
--   5. get_tenant_members()        - ekip listesi (isim + e-posta ile)
--   6. get_tenant_invitations()    - bekleyen davetler
--
-- AYRICA BİR YETKİ YÜKSELTME AÇIĞINI KAPATIR:
--   Mevcut INSERT politikası admin'in DOĞRUDAN 'owner' rolünde üye eklemesine
--   izin veriyordu. Bir admin, kontrol ettiği ikinci bir hesabı owner yapıp
--   işletmeyi devralabilirdi. Artık admin yalnızca kendinden düşük rol verebilir.
--
-- ÇALIŞTIRMA: Supabase Dashboard -> SQL Editor -> tamamını yapıştır -> Run
-- Idempotenttir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DAVET TABLOSU
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'viewer')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED')),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    accepted_at TIMESTAMPTZ
);

-- Ayni isletmede ayni e-posta icin yalnizca TEK bekleyen davet olabilir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invitations_pending_unique
    ON public.tenant_invitations (tenant_id, lower(email))
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email
    ON public.tenant_invitations (lower(email)) WHERE status = 'PENDING';

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

-- Tablo YALNIZCA asagidaki RPC'ler uzerinden yazilir. Dogrudan yazma politikasi
-- bilerek tanimlanmamistir; boylece rol dogrulamasi atlanamaz.
DROP POLICY IF EXISTS "Owners and admins view invitations" ON public.tenant_invitations;
CREATE POLICY "Owners and admins view invitations" ON public.tenant_invitations
    FOR SELECT USING (
        public.is_tenant_member(tenant_id)
        AND public.get_tenant_role(tenant_id) IN ('owner', 'admin')
    );

-- -----------------------------------------------------------------------------
-- 2. YETKİ YÜKSELTME AÇIĞINI KAPAT
--    Admin artik 'owner' veya 'admin' rolunde uye EKLEYEMEZ.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners and admins add members" ON public.tenant_members;
CREATE POLICY "Owners and admins add members" ON public.tenant_members FOR INSERT WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (
        public.get_tenant_role(tenant_id) = 'owner'
        OR (
            public.get_tenant_role(tenant_id) = 'admin'
            AND tenant_members.role IN ('manager', 'staff', 'viewer')
        )
    )
);

-- -----------------------------------------------------------------------------
-- 3. DAVET OLUŞTUR
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
    p_tenant_id UUID,
    p_email TEXT,
    p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_role TEXT;
    v_email       TEXT;
    v_id          UUID;
    v_expires     TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    v_caller_role := public.get_tenant_role(p_tenant_id);
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Bu işletmeye üye davet etme yetkiniz yok.';
    END IF;

    IF p_role NOT IN ('admin', 'manager', 'staff', 'viewer') THEN
        RAISE EXCEPTION 'Geçersiz rol: %', p_role;
    END IF;

    -- Admin kendinden ustun/esit rol veremez (yetki yukseltme engeli).
    IF v_caller_role = 'admin' AND p_role = 'admin' THEN
        RAISE EXCEPTION 'Yönetici rolünde davet yalnızca işletme sahibi tarafından gönderilebilir.';
    END IF;

    v_email := lower(trim(p_email));
    IF v_email = '' OR position('@' IN v_email) = 0 THEN
        RAISE EXCEPTION 'Geçerli bir e-posta adresi girin.';
    END IF;

    -- Zaten uye mi?
    IF EXISTS (
        SELECT 1 FROM public.tenant_members tm
        JOIN auth.users u ON u.id = tm.user_id
        WHERE tm.tenant_id = p_tenant_id AND lower(u.email) = v_email
    ) THEN
        RAISE EXCEPTION 'Bu e-posta adresi zaten ekibinizde.';
    END IF;

    -- Bekleyen davet varsa rolu/suresi tazelenir, mukerrer satir olusmaz.
    UPDATE public.tenant_invitations
       SET role = p_role,
           invited_by = auth.uid(),
           created_at = NOW(),
           expires_at = NOW() + INTERVAL '14 days'
     WHERE tenant_id = p_tenant_id
       AND lower(email) = v_email
       AND status = 'PENDING'
    RETURNING id, expires_at INTO v_id, v_expires;

    IF v_id IS NULL THEN
        INSERT INTO public.tenant_invitations (tenant_id, email, role, invited_by)
        VALUES (p_tenant_id, v_email, p_role, auth.uid())
        RETURNING id, expires_at INTO v_id, v_expires;
    END IF;

    RETURN json_build_object(
        'invitation_id', v_id,
        'email', v_email,
        'role', p_role,
        'expires_at', v_expires
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. BEKLEYEN DAVETLERİ KABUL ET
--    Giris yapan kullanicinin DOGRULANMIS e-postasina gonderilmis, suresi
--    dolmamis davetleri uyelige cevirir. Uygulama bunu her girişte cagirir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid       UUID;
    v_email     TEXT;
    v_confirmed TIMESTAMPTZ;
    v_joined    INT := 0;
    r           RECORD;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    SELECT lower(u.email), u.email_confirmed_at
      INTO v_email, v_confirmed
    FROM auth.users u WHERE u.id = v_uid;

    -- DOGRULANMAMIS e-posta ile davet kabul edilemez. Aksi halde biri,
    -- baskasinin adresiyle kayit olup o adrese gelen davetleri toplayabilirdi.
    IF v_email IS NULL OR v_confirmed IS NULL THEN
        RETURN json_build_object('joined', 0, 'tenants', '[]'::JSON);
    END IF;

    FOR r IN
        SELECT i.id, i.tenant_id, i.role
        FROM public.tenant_invitations i
        WHERE lower(i.email) = v_email
          AND i.status = 'PENDING'
          AND i.expires_at > NOW()
    LOOP
        INSERT INTO public.tenant_members (tenant_id, user_id, role)
        VALUES (r.tenant_id, v_uid, r.role)
        ON CONFLICT (tenant_id, user_id) DO NOTHING;

        UPDATE public.tenant_invitations
           SET status = 'ACCEPTED', accepted_at = NOW(), accepted_by = v_uid
         WHERE id = r.id;

        v_joined := v_joined + 1;
    END LOOP;

    RETURN json_build_object(
        'joined', v_joined,
        'tenants', COALESCE((
            SELECT json_agg(json_build_object('id', t.id, 'name', t.name))
            FROM public.tenants t
            JOIN public.tenant_members tm ON tm.tenant_id = t.id
            WHERE tm.user_id = v_uid
        ), '[]'::JSON)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. DAVETİ İPTAL ET
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_tenant_invitation(p_invitation_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant UUID;
    v_role   TEXT;
BEGIN
    SELECT tenant_id INTO v_tenant
    FROM public.tenant_invitations
    WHERE id = p_invitation_id AND status = 'PENDING';

    IF v_tenant IS NULL THEN
        RAISE EXCEPTION 'Bekleyen davet bulunamadı.';
    END IF;

    v_role := public.get_tenant_role(v_tenant);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Bu daveti iptal etme yetkiniz yok.';
    END IF;

    UPDATE public.tenant_invitations SET status = 'REVOKED' WHERE id = p_invitation_id;
    RETURN json_build_object('revoked', TRUE, 'invitation_id', p_invitation_id);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. EKİP LİSTESİ
--    profiles yalnizca sahibine gorunur oldugundan, ekip listesi ancak
--    SECURITY DEFINER bir fonksiyonla verilebilir. Yalnizca ilgili isletmenin
--    uyelerine ve yalnizca o isletmenin kadrosunu doner.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id UUID)
RETURNS TABLE (
    user_id    UUID,
    email      TEXT,
    full_name  TEXT,
    role       TEXT,
    is_self    BOOLEAN,
    joined_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'Bu işletmenin ekibini görüntüleme yetkiniz yok.';
    END IF;

    RETURN QUERY
    SELECT tm.user_id,
           u.email::TEXT,
           COALESCE(p.full_name, split_part(u.email, '@', 1))::TEXT,
           tm.role::TEXT,
           (tm.user_id = auth.uid()),
           tm.created_at
    FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.tenant_id = p_tenant_id
    ORDER BY
        CASE tm.role
            WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3
            WHEN 'staff' THEN 4 ELSE 5
        END,
        tm.created_at;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. BEKLEYEN DAVETLER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_invitations(p_tenant_id UUID)
RETURNS TABLE (
    id         UUID,
    email      TEXT,
    role       TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    expired    BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role TEXT;
BEGIN
    v_role := public.get_tenant_role(p_tenant_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Davetleri görüntüleme yetkiniz yok.';
    END IF;

    RETURN QUERY
    SELECT i.id, i.email::TEXT, i.role::TEXT, i.created_at, i.expires_at,
           (i.expires_at <= NOW())
    FROM public.tenant_invitations i
    WHERE i.tenant_id = p_tenant_id AND i.status = 'PENDING'
    ORDER BY i.created_at DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. YETKİLER: anon ASLA çağıramaz, yalnızca authenticated
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_tenant_invitation(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_pending_invitations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pending_invitations() TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_tenant_invitation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_invitation(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_tenant_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_members(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_tenant_invitations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_invitations(UUID) TO authenticated;

GRANT SELECT ON public.tenant_invitations TO authenticated;

-- =============================================================================
-- DOĞRULAMA: hiçbir kalıcı iz bırakmaz
-- =============================================================================
DO $$
DECLARE
    v_ok INT := 0;
BEGIN
    -- Fonksiyonlarin varligi
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='create_tenant_invitation') THEN v_ok := v_ok+1; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='accept_pending_invitations') THEN v_ok := v_ok+1; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='revoke_tenant_invitation') THEN v_ok := v_ok+1; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='get_tenant_members') THEN v_ok := v_ok+1; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='get_tenant_invitations') THEN v_ok := v_ok+1; END IF;

    IF v_ok <> 5 THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: yalnizca % / 5 fonksiyon olusturuldu', v_ok;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tenant_invitations') THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: tenant_invitations tablosu yok';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='tenant_members'
          AND policyname='Owners and admins add members'
          AND with_check LIKE '%manager%'
    ) THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: yetki yukseltme politikasi guncellenmedi';
    END IF;

    RAISE NOTICE 'DOGRULAMA: OK - 5 fonksiyon, davet tablosu ve sertlestirilmis politika yerinde.';
END $$;
