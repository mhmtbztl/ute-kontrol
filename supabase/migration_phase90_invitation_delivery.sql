-- Lexbnb phase90 — ekip davetini aninda yeniden teslim edilebilir yapar.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 53) THEN
        RAISE EXCEPTION 'PHASE90_REQUIRES_PHASE53';
    END IF;
    IF to_regclass('public.invitation_delivery_outbox') IS NULL THEN
        RAISE EXCEPTION 'PHASE90_REQUIRES_INVITATION_OUTBOX';
    END IF;
END
$pre$;

-- Ayni PENDING davet tekrar gonderildiginde status SET listesine girer.
-- PostgreSQL UPDATE OF status tetikleyicisi deger ayni kalsa bile calisir;
-- phase24 enqueue tetikleyicisi mevcut outbox satirini PENDING'e sifirlar.
CREATE OR REPLACE FUNCTION public.create_tenant_invitation(
    p_tenant_id UUID,
    p_email TEXT,
    p_role TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_role TEXT;
    v_email TEXT;
    v_id UUID;
    v_expires TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Oturum açılmamış! Lütfen önce giriş yapın.';
    END IF;

    v_caller_role := public.get_tenant_role(p_tenant_id);
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Bu işletmeye üye davet etme yetkiniz yok.';
    END IF;

    IF p_role NOT IN ('admin', 'manager', 'sales', 'staff', 'viewer') THEN
        RAISE EXCEPTION 'Geçersiz rol: %', p_role;
    END IF;
    IF v_caller_role = 'admin' AND p_role = 'admin' THEN
        RAISE EXCEPTION 'Yönetici rolünde davet yalnızca işletme sahibi tarafından gönderilebilir.';
    END IF;

    v_email := lower(trim(p_email));
    IF v_email = '' OR position('@' IN v_email) = 0 THEN
        RAISE EXCEPTION 'Geçerli bir e-posta adresi girin.';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.tenant_members tm
          JOIN auth.users u ON u.id = tm.user_id
         WHERE tm.tenant_id = p_tenant_id
           AND lower(u.email) = v_email
    ) THEN
        RAISE EXCEPTION 'Bu e-posta adresi zaten ekibinizde.';
    END IF;

    UPDATE public.tenant_invitations
       SET role = p_role,
           invited_by = auth.uid(),
           status = 'PENDING',
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
$function$;

REVOKE ALL ON FUNCTION public.create_tenant_invitation(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_invitation(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(UUID, TEXT, TEXT) TO authenticated;

-- Worker veya Edge Function PROCESSING'e aldiktan sonra kapanirsa is sonsuza
-- kadar kilitli kalmaz. On bes dakika gecen sahiplik lease'i yeniden alinabilir.
CREATE OR REPLACE FUNCTION public.claim_invitation_deliveries(p_limit INT DEFAULT 20)
RETURNS SETOF public.invitation_delivery_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH picked AS (
        SELECT id
          FROM public.invitation_delivery_outbox
         WHERE attempts < 5
           AND (
               (status IN ('PENDING', 'FAILED') AND available_at <= NOW())
               OR (status = 'PROCESSING' AND updated_at <= NOW() - INTERVAL '15 minutes')
           )
         ORDER BY available_at, created_at
         FOR UPDATE SKIP LOCKED
         LIMIT GREATEST(1, LEAST(p_limit, 100))
    )
    UPDATE public.invitation_delivery_outbox o
       SET status = 'PROCESSING',
           attempts = o.attempts + 1,
           updated_at = NOW()
      FROM picked
     WHERE o.id = picked.id
    RETURNING o.*;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_invitation_deliveries(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_invitation_deliveries(INT) FROM anon;
REVOKE ALL ON FUNCTION public.claim_invitation_deliveries(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invitation_deliveries(INT) TO service_role;

DO $verify$
DECLARE
    v_create_def TEXT;
    v_claim_def TEXT;
BEGIN
    v_create_def := pg_get_functiondef(
        'public.create_tenant_invitation(uuid,text,text)'::regprocedure
    );
    v_claim_def := pg_get_functiondef(
        'public.claim_invitation_deliveries(integer)'::regprocedure
    );

    IF strpos(v_create_def, 'status = ''PENDING''') = 0
       OR strpos(v_claim_def, 'status = ''PROCESSING''') = 0
       OR strpos(v_claim_def, 'INTERVAL ''15 minutes''') = 0
       OR NOT EXISTS (
           SELECT 1
             FROM pg_trigger
            WHERE tgrelid = 'public.tenant_invitations'::regclass
              AND tgname = 'trg_enqueue_invitation_delivery'
              AND NOT tgisinternal
       )
       OR has_function_privilege('anon', 'public.create_tenant_invitation(uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.claim_invitation_deliveries(integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.claim_invitation_deliveries(integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE90_INVITATION_DELIVERY_CONTRACT';
    END IF;

    RAISE NOTICE 'PHASE 90 OK — davet anlik teslim ve tekrar deneme kuyrugu hazir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (90, 'phase90_invitation_delivery')
ON CONFLICT (version) DO NOTHING;

COMMIT;
