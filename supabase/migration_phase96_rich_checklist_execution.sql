-- =============================================================================
-- LEXBNB PHASE 96 — ZENGIN KONTROL LISTESI YURUTME KAPISI
-- =============================================================================
-- phase55/63 ileri duzeltmesi. Atanan personel CHECKIN_PREP kontrol listesini
-- dar bir RPC ile kaydeder. Temizlik Z imzasi ve genel gorev DONE gecisi,
-- onemli maddeler ile onlarin alt kontrolleri tamamlanmadan sunucuda reddedilir.
-- Eski dizi bicimli checklist kayitlari geriye uyumlu kalir.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 55)
       OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 63) THEN
        RAISE EXCEPTION 'PHASE96_REQUIRES_PHASE55_AND_PHASE63';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.fn_checklist_critical_complete(
    p_checklist JSONB,
    p_result JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_result JSONB := COALESCE(p_result, p_checklist -> 'result', '{}'::jsonb);
    v_section RECORD;
    v_item RECORD;
    v_sub RECORD;
    v_key TEXT;
BEGIN
    IF p_checklist IS NULL OR p_checklist = 'null'::jsonb THEN
        RETURN TRUE;
    END IF;

    -- Phase9 eski gorev snapshot'i: required/completed alanli dizi.
    IF jsonb_typeof(p_checklist) = 'array' THEN
        RETURN NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_checklist) entry
            WHERE COALESCE((entry ->> 'required')::boolean, false)
              AND NOT COALESCE((entry ->> 'completed')::boolean, false)
        );
    END IF;

    IF jsonb_typeof(p_checklist) <> 'object'
       OR jsonb_typeof(p_checklist -> 'sections') <> 'array'
       OR jsonb_typeof(v_result) <> 'object' THEN
        RETURN FALSE;
    END IF;

    FOR v_section IN
        SELECT value, ordinality - 1 AS idx
        FROM jsonb_array_elements(p_checklist -> 'sections') WITH ORDINALITY
    LOOP
        IF jsonb_typeof(v_section.value -> 'items') <> 'array' THEN RETURN FALSE; END IF;
        FOR v_item IN
            SELECT value, ordinality - 1 AS idx
            FROM jsonb_array_elements(v_section.value -> 'items') WITH ORDINALITY
        LOOP
            IF COALESCE((v_item.value ->> 'important')::boolean, false) THEN
                v_key := format('s%s.i%s', v_section.idx, v_item.idx);
                IF COALESCE(v_result -> v_key -> 'z', 'false'::jsonb) <> 'true'::jsonb THEN
                    RETURN FALSE;
                END IF;
                IF v_item.value ? 'subChecks'
                   AND jsonb_typeof(v_item.value -> 'subChecks') <> 'array' THEN RETURN FALSE; END IF;
                FOR v_sub IN
                    SELECT ordinality - 1 AS idx
                    FROM jsonb_array_elements(COALESCE(v_item.value -> 'subChecks', '[]'::jsonb)) WITH ORDINALITY
                LOOP
                    IF COALESCE(v_result -> format('%s.sub%s', v_key, v_sub.idx) -> 'z', 'false'::jsonb) <> 'true'::jsonb THEN
                        RETURN FALSE;
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
    RETURN TRUE;
EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_operational_task_checklist_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.status = 'DONE' AND OLD.status IS DISTINCT FROM 'DONE'
       AND NOT public.fn_checklist_critical_complete(NEW.checklist, NULL) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Onemli maddeler ve alt kontroller tamamlanmadi.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_operational_task_checklist_completion ON public.operational_tasks;
CREATE TRIGGER trg_guard_operational_task_checklist_completion
    BEFORE UPDATE OF status, checklist ON public.operational_tasks
    FOR EACH ROW EXECUTE FUNCTION public.guard_operational_task_checklist_completion();

CREATE OR REPLACE FUNCTION public.save_my_task_checklist(
    p_task_id UUID,
    p_result JSONB,
    p_status TEXT DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
      AND (public.can_manage_tenant(t.tenant_id)
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
$$;

-- Phase55 fonksiyonunun ileri duzeltmesi: Z imzasi kritik liste kapisindan gecer.
CREATE OR REPLACE FUNCTION public.sign_cleaning_done(p_execution_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor RECORD;
    v_exec public.cleaning_task_executions%ROWTYPE;
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
    IF NOT public.fn_checklist_critical_complete(v_exec.checklist_snapshot, v_exec.checklist_result) THEN
        RAISE EXCEPTION 'CHECKLIST_INCOMPLETE: Onemli maddeler ve alt kontroller tamamlanmadi.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.cleaning_task_executions
       SET status = 'CLEANED', cleaner_signed_at = now(), cleaner_signed_by = auth.uid()
     WHERE id = p_execution_id;
    RETURN jsonb_build_object('success', true, 'status', 'CLEANED');
END;
$$;

-- Phase63 fonksiyonunun ileri duzeltmesi: eski RPC DONE kapisini atlayamaz.
CREATE OR REPLACE FUNCTION public.set_my_task_status(p_task_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.operational_tasks%ROWTYPE;
    v_old TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    SELECT * INTO v_task FROM public.operational_tasks t
    WHERE t.id = p_task_id
      AND (public.can_manage_tenant(t.tenant_id)
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
$$;

REVOKE ALL ON FUNCTION public.fn_checklist_critical_complete(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_checklist_critical_complete(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.sign_cleaning_done(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sign_cleaning_done(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sign_cleaning_done(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) TO authenticated;

DO $verify$
DECLARE
    v_save TEXT := pg_get_functiondef('public.save_my_task_checklist(uuid,jsonb,text,text)'::regprocedure);
    v_sign TEXT := pg_get_functiondef('public.sign_cleaning_done(uuid)'::regprocedure);
    v_status TEXT := pg_get_functiondef('public.set_my_task_status(uuid,text,text)'::regprocedure);
BEGIN
    IF strpos(v_save, 'assigned_to = auth.uid()') = 0
       OR strpos(v_sign, 'CHECKLIST_INCOMPLETE') = 0
       OR strpos(v_status, 'fn_checklist_critical_complete') = 0 THEN
        RAISE EXCEPTION 'PHASE96_FUNCTION_BODY_INVALID';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_guard_operational_task_checklist_completion' AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'PHASE96_COMPLETION_TRIGGER_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.save_my_task_checklist(uuid,jsonb,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE96_ANON_EXECUTE_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 96 OK — zengin checklist ilerlemesi ve kritik tamamlama kapisi hazir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (96, 'phase96_rich_checklist_execution')
ON CONFLICT (version) DO NOTHING;

COMMIT;
