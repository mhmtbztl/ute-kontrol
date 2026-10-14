-- Lexbnb phase93 — bildirim merkezine kaynak (kullanici M22, L-192, 14.10.2026).
--
-- user_notifications tablosunu okuyan ve "okundu" yazan kod vardi; satir
-- URETEN hicbir kod yoktu. Merkez her hesapta tasarim geregi bostu.
--
-- Bildirimler istemcide, kullanicinin zaten okuyabildigi gercek veriden
-- turetilir (core/notification_feed.js): onay bekleyen temizlik, yeni acik
-- ariza, kapanmamis gecen ay, takip tarihi gelen talep, ekibe katilan uye,
-- bosluk gecesi kazanc firsati. Bu RPC yalniz CAGIRANIN KENDI satirlarini
-- (user_id = auth.uid()) yazar: baskasina bildirim uretemez, baskasinin
-- okundu durumuna dokunamaz. Icerik zaten okuyabildigi veriden geldigi icin
-- yeni bir okuma yuzeyi acilmaz.
--
--   * Listede olup satiri olmayan olay -> UNREAD satir.
--   * Listede olan olayin basligi/metni guncellenir (durumuna dokunulmaz);
--     daha once cozulmus (RESOLVED) olay yeniden etkinse UNREAD olur.
--   * Kendi acik satiri listede yoksa -> RESOLVED (olay bitti: temizlik
--     onaylandi, ay kapandi, ariza kapandi). Silinmez; iz kalir.
--
-- Tablo degismez, sutun eklenmez. Yalniz kisisel satirlar icin tekil indeks
-- eklenir (ayni olay ayni kisiye iki kez yazilmaz). Isletme geneli
-- (user_id NULL) satirlarin kurali phase53'teki gibi kalir.

BEGIN;

DO $pre$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.user_notifications
        WHERE user_id IS NOT NULL
        GROUP BY tenant_id, user_id, event_key HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'PHASE93_DUPLICATE_PERSONAL_NOTIFICATIONS: ayni kisiye ayni olay birden fazla kez yazilmis; once incelenmeli.';
    END IF;
END
$pre$;

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_personal_event_uidx
    ON public.user_notifications(tenant_id, user_id, event_key)
    WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_my_notifications(p_tenant_id UUID, p_events JSONB)
RETURNS SETOF public.user_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_event JSONB;
    v_keys TEXT[] := ARRAY[]::TEXT[];
    v_key TEXT;
    v_domain TEXT;
    v_severity TEXT;
    v_title TEXT;
    v_message TEXT;
    v_link TEXT;
BEGIN
    -- Yetki kayit aramadan once (CLAUDE.md 7).
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_tenant_member(p_tenant_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Bu isletmenin uyesi degilsiniz.' USING ERRCODE = '42501';
    END IF;
    IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
        RAISE EXCEPTION 'EVENTS_MUST_BE_ARRAY' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_events) > 100 THEN
        RAISE EXCEPTION 'TOO_MANY_EVENTS' USING ERRCODE = '22023';
    END IF;

    FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
        v_key := v_event->>'event_key';
        v_domain := v_event->>'domain';
        v_severity := v_event->>'severity';
        v_title := btrim(COALESCE(v_event->>'title', ''));
        v_message := btrim(COALESCE(v_event->>'message', ''));
        v_link := NULLIF(btrim(COALESCE(v_event->>'deep_link', '')), '');

        IF v_key IS NULL OR v_key !~ '^[a-z_]{3,40}:[A-Za-z0-9_:.-]{1,200}$' THEN
            RAISE EXCEPTION 'INVALID_EVENT_KEY' USING ERRCODE = '22023';
        END IF;
        IF v_domain IS NULL OR v_domain NOT IN ('TEAM', 'OPERATIONS', 'FINANCE', 'SALES', 'PRICING') THEN
            RAISE EXCEPTION 'INVALID_DOMAIN' USING ERRCODE = '22023';
        END IF;
        IF v_severity IS NULL OR v_severity NOT IN ('INFO', 'WARNING', 'CRITICAL') THEN
            RAISE EXCEPTION 'INVALID_SEVERITY' USING ERRCODE = '22023';
        END IF;
        IF v_title = '' OR length(v_title) > 160 OR length(v_message) > 600 THEN
            RAISE EXCEPTION 'INVALID_TEXT' USING ERRCODE = '22023';
        END IF;
        IF v_link IS NOT NULL AND v_link !~ '^[a-z]+(:[A-Za-z0-9_.-]{1,80}){0,2}$' THEN
            RAISE EXCEPTION 'INVALID_DEEP_LINK' USING ERRCODE = '22023';
        END IF;
        IF v_key = ANY(v_keys) THEN
            CONTINUE;
        END IF;
        v_keys := array_append(v_keys, v_key);

        INSERT INTO public.user_notifications AS t
            (tenant_id, user_id, event_key, domain, severity, title, message, deep_link, status)
        VALUES
            (p_tenant_id, v_uid, v_key, v_domain, v_severity, v_title, v_message, v_link, 'UNREAD')
        ON CONFLICT (tenant_id, user_id, event_key) WHERE user_id IS NOT NULL
        DO UPDATE SET
            domain = EXCLUDED.domain,
            severity = EXCLUDED.severity,
            title = EXCLUDED.title,
            message = EXCLUDED.message,
            deep_link = EXCLUDED.deep_link,
            status = CASE WHEN t.status = 'RESOLVED' THEN 'UNREAD' ELSE t.status END,
            read_at = CASE WHEN t.status = 'RESOLVED' THEN NULL ELSE t.read_at END;
    END LOOP;

    UPDATE public.user_notifications n
       SET status = 'RESOLVED'
     WHERE n.tenant_id = p_tenant_id
       AND n.user_id = v_uid
       AND n.status <> 'RESOLVED'
       AND NOT (n.event_key = ANY(v_keys));

    RETURN QUERY
        SELECT n.*
          FROM public.user_notifications n
         WHERE n.tenant_id = p_tenant_id
           AND n.user_id = v_uid
           AND n.status <> 'RESOLVED'
         ORDER BY n.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_my_notifications(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_my_notifications(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_my_notifications(UUID, JSONB) TO authenticated;

DO $verify$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                    AND indexname = 'user_notifications_personal_event_uidx') THEN
        RAISE EXCEPTION 'PHASE93_UNIQUE_INDEX_MISSING';
    END IF;
    IF has_function_privilege('anon', 'public.sync_my_notifications(uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE93_ANON_EXECUTE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.sync_my_notifications(uuid, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE93_AUTHENTICATED_EXECUTE_MISSING';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.sync_my_notifications(uuid, jsonb)'::regprocedure
                    AND prosecdef AND prosrc LIKE '%user_id = v_uid%') THEN
        RAISE EXCEPTION 'PHASE93_FUNCTION_NOT_PERSONAL';
    END IF;
    RAISE NOTICE 'PHASE 93 OK — bildirim merkezi kendi satirlarini uretir.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (93, 'phase93_notification_feed')
ON CONFLICT (version) DO NOTHING;

COMMIT;
