-- =============================================================================
-- LEXBNB PHASE 103 — SATIS ROLUNE YALNIZ KAPALI TARIHLER
-- =============================================================================
-- Kullanici 19.10.2026 (M83, F.7.1): ariza kayitlari (maintenance_tickets)
-- phase53'ten beri yalniz defter okuyucusuna aciktir. Satis ve izleyici rolu
-- arizalari okuyamadigi icin fiyat takviminde bakimla KAPALI gunu "Acik"
-- goruyor ve o gune fiyat oneriliyordu.
--
-- Kullanici karari: satisciya arizanin ayrintisi degil, yalniz "su tarihlerde
-- kapali" bilgisi gider. get_property_closures yalniz (mulk, baslangic, bitis)
-- dondurur; baslik, aciklama, maliyet, atanan kisi DONMEZ.
--
-- Tanim istemcideki isTicketBlockingOn ile aynidir (L-246):
--   * acik ariza (RESOLVED/CANCELLED degil) + kapali tarih araligi -> o aralik;
--   * araligi olmayan bloklayan/kritik ariza -> yalniz bugun (Europe/Istanbul).
-- Tablo degismez.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 53) THEN
        RAISE EXCEPTION 'PHASE103_REQUIRES_PHASE53';
    END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.get_property_closures(p_tenant_id UUID, p_from DATE, p_to DATE)
RETURNS TABLE(property_id UUID, start_date DATE, end_date DATE)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today DATE := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
    -- Yetki kayit aramadan once (CLAUDE.md 7).
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Oturum acilmamis.' USING ERRCODE = '28000';
    END IF;
    IF NOT COALESCE(public.can_read_sales(p_tenant_id), false) THEN
        RAISE EXCEPTION 'FORBIDDEN_ROLE: Kapali tarihleri okuma yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
        RAISE EXCEPTION 'INVALID_RANGE: Aralik en fazla 400 gun olabilir.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT mt.property_id,
           CASE WHEN mt.downtime_start IS NOT NULL AND mt.downtime_end IS NOT NULL AND mt.downtime_end >= mt.downtime_start
                THEN mt.downtime_start ELSE v_today END,
           CASE WHEN mt.downtime_start IS NOT NULL AND mt.downtime_end IS NOT NULL AND mt.downtime_end >= mt.downtime_start
                THEN mt.downtime_end ELSE v_today END
    FROM public.maintenance_tickets mt
    WHERE mt.tenant_id = p_tenant_id
      AND mt.status NOT IN ('RESOLVED', 'CANCELLED')
      AND (
            (mt.downtime_start IS NOT NULL AND mt.downtime_end IS NOT NULL AND mt.downtime_end >= mt.downtime_start
             AND mt.downtime_end >= p_from AND mt.downtime_start <= p_to)
         OR ((mt.downtime_start IS NULL OR mt.downtime_end IS NULL OR mt.downtime_end < mt.downtime_start)
             AND (mt.blocks_availability OR mt.booking_impact OR mt.severity = 'CRITICAL')
             AND v_today BETWEEN p_from AND p_to)
      );
END;
$$;

REVOKE ALL ON FUNCTION public.get_property_closures(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_property_closures(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_property_closures(UUID, DATE, DATE) TO authenticated;

DO $verify$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_property_closures(uuid,date,date)'::regprocedure);
BEGIN
    IF position('auth.uid()' IN v_def) = 0 OR position('can_read_sales' IN v_def) = 0 THEN
        RAISE EXCEPTION 'PHASE103_AUTHZ_MISSING';
    END IF;
    IF position('mt.title' IN v_def) > 0 OR position('mt.description' IN v_def) > 0
       OR position('cost' IN v_def) > 0 OR position('assigned_to' IN v_def) > 0 THEN
        RAISE EXCEPTION 'PHASE103_TICKET_DETAIL_LEAK';
    END IF;
    IF has_function_privilege('anon', 'public.get_property_closures(uuid,date,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE103_ANON_FUNCTION_PRIVILEGE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_property_closures(uuid,date,date)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE103_AUTHENTICATED_PRIVILEGE_MISSING';
    END IF;
    RAISE NOTICE 'PHASE 103 OK — satis rolu yalniz kapali tarihleri gorur.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (103, 'phase103_property_closures_for_sales')
ON CONFLICT (version) DO NOTHING;

COMMIT;
