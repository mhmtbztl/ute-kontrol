-- Lexbnb phase86 — gider sablonu RPC tenant yetkisini kayit aramadan once dogrular.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 84) THEN
        RAISE EXCEPTION 'PHASE86_REQUIRES_PHASE84';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.generate_expense_from_template(
    p_tenant_id UUID,
    p_template_id UUID,
    p_period_month DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    IF NOT COALESCE(public.can_manage_tenant(p_tenant_id), FALSE) THEN
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

-- Phase84 imzasi once kaydi aradigi icin oturumlu kullanicilara kapatilir.
REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, DATE) FROM authenticated;

REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_expense_from_template(UUID, UUID, DATE) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT;
    v_auth_pos INTEGER;
    v_lock_pos INTEGER;
BEGIN
    v_def := pg_get_functiondef('public.generate_expense_from_template(uuid,uuid,date)'::regprocedure);
    v_auth_pos := strpos(v_def, 'public.can_manage_tenant(p_tenant_id)');
    v_lock_pos := strpos(v_def, 'FOR UPDATE');
    IF v_auth_pos = 0 OR v_lock_pos = 0 OR v_auth_pos >= v_lock_pos
       OR strpos(v_def, 'tenant_id = p_tenant_id') = 0
       OR has_function_privilege('authenticated', 'public.generate_expense_from_template(uuid,date)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.generate_expense_from_template(uuid,uuid,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE86_EXPENSE_TEMPLATE_AUTHZ_CONTRACT';
    END IF;
    RAISE NOTICE 'PHASE 86 OK — gider sablonu yetkisi kayit kilidinden once dogrulaniyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (86, 'phase86_expense_template_authz')
ON CONFLICT (version) DO NOTHING;

COMMIT;
