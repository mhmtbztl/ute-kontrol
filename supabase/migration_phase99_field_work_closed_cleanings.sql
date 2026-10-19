-- =============================================================================
-- LEXBNB PHASE 99 — KAPANAN TEMIZLIK PERSONEL EKRANINDAN DUSER
-- =============================================================================
-- phase55 get_my_field_work ileri duzeltmesi (kullanici M62, Gorev 9.5.4–9.5.5).
-- Eskiden fonksiyon araliktaki BUTUN icra satirlarini donduruyordu:
--   * yonetici M onayi verdikten sonra is "Onaylandi" karti olarak kaliyordu;
--   * yonetici isi dogrudan "yapildi" ya da "gerek kalmadi" yapinca icra satiri
--     ASSIGNED kaliyor, temizlikci kapanmis isi "Acik" goruyor ve imzalamaya
--     calisiyordu.
-- Artik yalniz acik is doner: icra INSPECTED degil VE temizlik DONE/SKIPPED
-- degil. Satira 'task_status' eklenir (istemci ayni kurali ikinci kat uygular).
-- Imza, yetki ve donen alanlar phase55 ile ayni; tablo degismez.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 55) THEN
        RAISE EXCEPTION 'PHASE99_REQUIRES_PHASE55';
    END IF;
END
$pre$;

-- Cagiranin bugun/araliktaki ACIK isi. Tutar, odeme, misafir adi DONMEZ.
CREATE OR REPLACE FUNCTION public.get_my_field_work(p_tenant_id UUID, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT public.is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Bu isletmenin uyesi degilsiniz.' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'INVALID_RANGE: Aralik en fazla 62 gun olabilir.' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'cleanings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'execution_id', e.id,
                 'status', e.status,
                 'task_status', ct.status,
                 'task_date', ct.task_date,
                 'property', jsonb_build_object('id', p.id, 'name', p.name),
                 'access', public.fn_property_access_json(ct.tenant_id, ct.property_id),
                 'next_check_in', (SELECT min(b.check_in) FROM public.bookings b
                                   WHERE b.tenant_id = ct.tenant_id AND b.property_id = ct.property_id
                                     AND b.check_in >= ct.task_date AND COALESCE(b.status, '') <> 'CANCELLED'),
                 'checklist', e.checklist_snapshot,
                 'checklist_result', e.checklist_result,
                 'supplies_result', e.supplies_result,
                 'note', e.note,
                 'cleaner_signed_at', e.cleaner_signed_at,
                 'inspector_signed_at', e.inspector_signed_at,
                 'inspector_note', e.inspector_note)
               ORDER BY ct.task_date, p.name)
        FROM public.cleaning_task_executions e
        JOIN public.operational_people op ON op.id = e.person_id AND op.user_id = v_uid
        JOIN public.cleaning_tasks ct ON ct.id = e.cleaning_task_id
        JOIN public.properties p ON p.id = ct.property_id
        WHERE e.tenant_id = p_tenant_id AND ct.task_date BETWEEN p_from AND p_to
          AND e.status <> 'INSPECTED'
          AND COALESCE(ct.status, '') NOT IN ('DONE', 'SKIPPED')), '[]'::jsonb),
      'tasks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', t.id, 'title', t.title, 'description', t.description, 'task_type', t.task_type,
                 'status', t.status, 'priority', t.priority, 'due_at', t.due_at, 'checklist', t.checklist,
                 'property', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id', p.id, 'name', p.name) END,
                 'access', CASE WHEN t.property_id IS NULL THEN NULL ELSE public.fn_property_access_json(t.tenant_id, t.property_id) END)
               ORDER BY t.due_at NULLS LAST)
        FROM public.operational_tasks t
        LEFT JOIN public.properties p ON p.id = t.property_id
        WHERE t.tenant_id = p_tenant_id AND t.assigned_to = v_uid
          AND t.status NOT IN ('DONE', 'CANCELLED')), '[]'::jsonb),
      'tickets', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id, 'title', m.title, 'description', m.description, 'category', m.category,
                 'severity', m.severity, 'status', m.status,
                 'property', jsonb_build_object('id', p.id, 'name', p.name),
                 'access', public.fn_property_access_json(m.tenant_id, m.property_id))
               ORDER BY m.created_at)
        FROM public.maintenance_tickets m
        JOIN public.properties p ON p.id = m.property_id
        WHERE m.tenant_id = p_tenant_id
          AND m.status NOT IN ('RESOLVED', 'CANCELLED')
          AND (m.assigned_to = v_uid OR EXISTS (
                SELECT 1 FROM public.maintenance_assignments ma
                JOIN public.operational_people op ON op.id = ma.person_id
                WHERE ma.maintenance_ticket_id = m.id AND op.user_id = v_uid))), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_field_work(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_field_work(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_field_work(UUID, DATE, DATE) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_my_field_work(uuid,date,date)'::regprocedure);
BEGIN
    IF position('e.status <> ''INSPECTED''' IN v_def) = 0
       OR position('NOT IN (''DONE'', ''SKIPPED'')' IN v_def) = 0
       OR position('''task_status''' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE99_FUNCTION_BODY_INVALID';
    END IF;
    IF position('auth.uid()' IN v_def) = 0 OR position('is_tenant_member' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE99_AUTHZ_LOST';
    END IF;
    IF has_function_privilege('anon', 'public.get_my_field_work(uuid,date,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE99_ANON_FUNCTION_PRIVILEGE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_my_field_work(uuid,date,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE99_AUTHENTICATED_PRIVILEGE_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 99 OK — kapanan temizlik personel ekranindan duser.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (99, 'phase99_field_work_closed_cleanings')
ON CONFLICT (version) DO NOTHING;

COMMIT;
