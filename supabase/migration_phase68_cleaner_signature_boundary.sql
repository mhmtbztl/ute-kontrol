-- =============================================================================
-- LEXBNB PHASE 68 — TEMIZLIKCI Z IMZASI YETKI SINIRI (A2 DENETIM DUZELTMESI)
-- =============================================================================
-- phase55'in fn_execution_actor yardimcisi hem yoneticiyi hem atanan kisiyi
-- dondurur. save_cleaning_progress ve sign_cleaning_done yalniz satirin
-- bulunmasini denetledigi icin yonetici, baskasina atanmis temizligin Z
-- ilerlemesini ve Z imzasini temizlikci adina yazabiliyordu. M denetimi ayri
-- olsa da Z/M iki-imza sozlesmesinin ilk imzasi gercek atanan kisiye ait
-- degildi. Uygulanmis phase55 degistirilmez; bu ileri goc iki RPC'yi
-- is_assignee kapisiyla yeniden tanimlar.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 55) THEN
        RAISE EXCEPTION 'PHASE68_REQUIRES_PHASE55';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.save_cleaning_progress(
    p_execution_id UUID,
    p_checklist_result JSONB,
    p_supplies_result JSONB,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor  RECORD;
    v_exec   public.cleaning_task_executions%ROWTYPE;
    v_merged JSONB := '{}'::jsonb;
    v_key    TEXT;
    v_val    JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL OR NOT v_actor.is_assignee THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu temizlik size atanmamis.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.fn_cleaning_result_valid(COALESCE(p_checklist_result, '{}'::jsonb), COALESCE(p_supplies_result, '{}'::jsonb)) THEN
        RAISE EXCEPTION 'INVALID_RESULT: Kontrol listesi ya da malzeme durumu gecersiz.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    IF v_exec.status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REOPENED') THEN
        RAISE EXCEPTION 'EXECUTION_LOCKED: Imzalanmis temizlik degistirilemez (durum %).', v_exec.status USING ERRCODE = '22023';
    END IF;

    v_merged := v_exec.checklist_result;
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_checklist_result, '{}'::jsonb)) LOOP
        v_merged := jsonb_set(v_merged, ARRAY[v_key],
            jsonb_build_object('z', v_val -> 'z', 'm', COALESCE(v_exec.checklist_result -> v_key -> 'm', 'null'::jsonb)));
    END LOOP;

    UPDATE public.cleaning_task_executions
       SET checklist_result = v_merged,
           supplies_result = COALESCE(p_supplies_result, supplies_result),
           note = NULLIF(btrim(COALESCE(p_note, '')), ''),
           status = CASE WHEN status = 'ASSIGNED' THEN 'IN_PROGRESS' ELSE status END
     WHERE id = p_execution_id
    RETURNING * INTO v_exec;
    RETURN jsonb_build_object('success', true, 'status', v_exec.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.sign_cleaning_done(p_execution_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor RECORD;
    v_exec  public.cleaning_task_executions%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL OR NOT v_actor.is_assignee THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu temizlik size atanmamis.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    IF v_exec.status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'REOPENED') THEN
        RAISE EXCEPTION 'EXECUTION_LOCKED: Bu temizlik zaten imzali (durum %).', v_exec.status USING ERRCODE = '22023';
    END IF;
    UPDATE public.cleaning_task_executions
       SET status = 'CLEANED', cleaner_signed_at = now(), cleaner_signed_by = auth.uid()
     WHERE id = p_execution_id;
    RETURN jsonb_build_object('success', true, 'status', 'CLEANED');
END;
$$;

REVOKE ALL ON FUNCTION public.save_cleaning_progress(UUID, JSONB, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_cleaning_progress(UUID, JSONB, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_cleaning_progress(UUID, JSONB, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.sign_cleaning_done(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sign_cleaning_done(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sign_cleaning_done(UUID) TO authenticated;

DO $verify$
DECLARE
    v_save TEXT := pg_get_functiondef('public.save_cleaning_progress(uuid,jsonb,jsonb,text)'::regprocedure);
    v_sign TEXT := pg_get_functiondef('public.sign_cleaning_done(uuid)'::regprocedure);
BEGIN
    IF strpos(v_save, 'NOT v_actor.is_assignee') = 0
       OR strpos(v_sign, 'NOT v_actor.is_assignee') = 0 THEN
        RAISE EXCEPTION 'PHASE68_ASSIGNEE_GUARD_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.save_cleaning_progress(uuid,jsonb,jsonb,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.sign_cleaning_done(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE68_ANON_EXECUTE_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 68 OK — Z ilerlemesi ve imzasi yalniz atanan temizlikciye ait.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (68, 'phase68_cleaner_signature_boundary')
ON CONFLICT (version) DO NOTHING;

COMMIT;
