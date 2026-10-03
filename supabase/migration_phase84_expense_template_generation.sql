-- =============================================================================
-- LEXBNB PHASE 84 — GIDER SABLONUNDAN ATOMIK AYLIK GIDER URETIMI
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 78) THEN
        RAISE EXCEPTION 'PHASE84_REQUIRES_PHASE78';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.generate_expense_from_template(
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
    IF NOT public.can_manage_tenant(v_template.tenant_id) THEN
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

REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_expense_from_template(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_expense_from_template(UUID, DATE) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    v_def := pg_get_functiondef('public.generate_expense_from_template(uuid,date)'::regprocedure);
    IF strpos(v_def, 'public.can_manage_tenant') = 0
       OR strpos(v_def, 'expense_template_occurrences') = 0
       OR strpos(v_def, 'FOR UPDATE') = 0
       OR has_function_privilege('anon', 'public.generate_expense_from_template(uuid,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE84_EXPENSE_TEMPLATE_RPC_CONTRACT';
    END IF;
    RAISE NOTICE 'PHASE 84 OK — gider sablonu tek transaction ile aya islenir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (84, 'phase84_expense_template_generation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
