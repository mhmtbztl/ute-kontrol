-- =============================================================================
-- LEXBNB PHASE 63 — set_my_task_status DENETIM IZI DUZELTMESI (phase55 ileri duzeltme)
-- =============================================================================
-- phase55'in set_my_task_status fonksiyonu operations_audit_logs'a
-- action = 'STATUS_CHANGE' yaziyordu; tablonun CHECK kurali yalniz
-- CREATED / ASSIGNED / STARTED / BLOCKED / COMPLETED / CANCELLED / REOPENED
-- kabul ediyor. Sonuc: personel gorevini HIC guncelleyemiyordu (23514, islem
-- geri aliniyor). phase55 canli suiti (D1) test projesinde yakaladi.
--
-- phase55 test projesine uygulandigi icin DEGISMEZ (CLAUDE.md 4.2 / phase37
-- emsali); duzeltme bu ileri gocle. Numara: Claude'un ilk bos tek numarasi
-- (57/59 A2 paketlerine, 61 A4'e ayrildi). Manifestte phase55'in hemen
-- arkasinda durur ve onunla birlikte uretime uygulanir.
--
-- Durum -> iz eslemesi: TODO -> REOPENED, IN_PROGRESS -> STARTED,
-- BLOCKED -> BLOCKED, DONE -> COMPLETED. Govdenin geri kalani phase55 ile ayni.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 55) THEN
        RAISE EXCEPTION 'PHASE63_REQUIRES_PHASE55';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.set_my_task_status(p_task_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.operational_tasks%ROWTYPE;
    v_old  TEXT;
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
            v_old, p_status, auth.uid(),
            jsonb_build_object('source', 'set_my_task_status'));
    RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_task_status(UUID, TEXT, TEXT) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.set_my_task_status(uuid,text,text)'::regprocedure);
BEGIN
    IF strpos(v_def, 'STATUS_CHANGE') > 0 OR strpos(v_def, '''COMPLETED''') = 0 THEN
        RAISE EXCEPTION 'PHASE63_AUDIT_ACTION_NOT_FIXED';
    END IF;
    IF has_function_privilege('anon', 'public.set_my_task_status(uuid,text,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE63_ANON_EXECUTE_OPEN';
    END IF;
    RAISE NOTICE 'PHASE 63 OK — gorev durumu denetim izine izinli eylemle yaziliyor.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (63, 'phase63_task_status_audit_action')
ON CONFLICT (version) DO NOTHING;

COMMIT;
