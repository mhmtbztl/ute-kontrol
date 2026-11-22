-- Lexbnb phase123 — temizlik kontrol listesi: iki sutun, ayni anda isaretleme
-- (kullanici, 22.11.2026: "evi sectigimizde o evin temizlik listesi direkt eklenmeli
-- ve temizlikcinin de benim de ekranimda ayni anda isaretlenebilmeli").
--
-- Kullanici karari: "Iki ayri sutun". Her maddede Temizlikci (Z) ve Kontrol (M)
-- isareti ayri durur; ikisi de istedigi an isaretler, ikisi de ikisini gorur.
--   * Z yalniz atanan temizlikcinin (phase68 siniri DEGISMEZ: yonetici Z yazamaz).
--   * M yoneticinindir. Eskiden M yalniz temizlikci "bitti" dedikten sonra, onayla
--     birlikte (inspect_cleaning) yazilabiliyordu. Yeni set_cleaning_manager_marks
--     M'yi temizlik surerken de yazar; Z'ye dokunmaz. Onay/red (inspect_cleaning),
--     gider ve borc kurallari aynen kalir: M isareti onay degildir.
--   * Ayni anda: cleaning_task_executions canli yayina (supabase_realtime) eklenir.
--     Okuma yine RLS'tedir (yonetici + yalniz kendi isindeki temizlikci).
-- Yeni tablo/sutun yok.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 107) THEN
        RAISE EXCEPTION 'PHASE123_REQUIRES_PHASE107';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.set_cleaning_manager_marks(
    p_execution_id UUID,
    p_marks JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor  RECORD;
    v_exec   public.cleaning_task_executions%ROWTYPE;
    v_merged JSONB;
    v_key    TEXT;
    v_val    JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    -- Yetki kayit aranmadan once: fn_execution_actor yalniz yetkili cagirana satir dondurur
    -- (yabanci kiraci icin "bulunamadi" ile "yetkisiz" ayirt edilemez; oracle yok).
    SELECT * INTO v_actor FROM public.fn_execution_actor(p_execution_id);
    IF v_actor.tenant_id IS NULL OR NOT COALESCE(v_actor.is_manager, false) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Kontrol isareti yalniz operasyon yonetimiyle yazilir.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(COALESCE(p_marks, '{}'::jsonb)) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_marks, '{}'::jsonb)) e
                   WHERE jsonb_typeof(e.value) NOT IN ('boolean', 'null')
                      OR e.key !~ '^s[0-9]+\.i[0-9]+(\.sub[0-9]+)?$') THEN
        RAISE EXCEPTION 'INVALID_RESULT: Kontrol isaretleri { s0.i0: true/false } olmali.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_exec FROM public.cleaning_task_executions WHERE id = p_execution_id FOR UPDATE;
    -- Onaylanmis (INSPECTED) temizlik muhurludur; diger tum durumlarda M yazilir.
    IF v_exec.status = 'INSPECTED' THEN
        RAISE EXCEPTION 'EXECUTION_LOCKED: Onaylanmis temizlik degistirilemez.' USING ERRCODE = '22023';
    END IF;

    v_merged := COALESCE(v_exec.checklist_result, '{}'::jsonb);
    FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_marks, '{}'::jsonb)) LOOP
        v_merged := jsonb_set(v_merged, ARRAY[v_key],
            jsonb_build_object('z', COALESCE(v_exec.checklist_result -> v_key -> 'z', 'null'::jsonb), 'm', v_val));
    END LOOP;

    UPDATE public.cleaning_task_executions
       SET checklist_result = v_merged
     WHERE id = p_execution_id;
    RETURN jsonb_build_object('success', true, 'checklist_result', v_merged);
END;
$$;

REVOKE ALL ON FUNCTION public.set_cleaning_manager_marks(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_cleaning_manager_marks(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_cleaning_manager_marks(UUID, JSONB) TO authenticated;

-- Canli yayin: isaret karsi ekranda aninda gorunsun. Yayin yoksa (yerel Postgres) atlanir.
DO $realtime$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cleaning_task_executions') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cleaning_task_executions';
    END IF;
END
$realtime$;

DO $verify$
DECLARE
    v_def TEXT;
BEGIN
    v_def := pg_get_functiondef('public.set_cleaning_manager_marks(uuid,jsonb)'::regprocedure);
    IF v_def NOT LIKE '%fn_execution_actor%' OR v_def NOT LIKE '%is_manager%' OR v_def LIKE '%''z'', v_val%' THEN
        RAISE EXCEPTION 'PHASE123_MARKS_GATE_WRONG';
    END IF;
    IF has_function_privilege('anon', 'public.set_cleaning_manager_marks(uuid,jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE123_ANON_CAN_MARK';
    END IF;
    -- phase68 siniri: Z yine yalniz atanan kisi.
    v_def := pg_get_functiondef('public.save_cleaning_progress(uuid,jsonb,jsonb,text)'::regprocedure);
    IF v_def NOT LIKE '%is_assignee%' THEN
        RAISE EXCEPTION 'PHASE123_Z_BOUNDARY_LOST';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cleaning_task_executions') THEN
        RAISE EXCEPTION 'PHASE123_REALTIME_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 123 OK — temizlik listesinde Kontrol isareti her an yazilir, canli yayin acik.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (123, 'phase123_cleaning_live_checklist')
ON CONFLICT (version) DO NOTHING;

COMMIT;
