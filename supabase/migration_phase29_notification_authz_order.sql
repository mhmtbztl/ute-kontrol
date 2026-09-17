-- =============================================================================

BEGIN;
-- LEXBNB PHASE 29 — BILDIRIM VE UYARI RPC'LERINDE YETKI SIRASI + anon IPTALI
--
-- phase25 `review_marketing_finding` icin ayni hatayi duzeltmisti; phase12'den
-- gelen iki fonksiyon ayni kalibi TASIMAYA DEVAM EDIYORDU ve kimse bakmamisti:
--
--     SELECT * INTO v_notif ... FOR UPDATE;          <- once satir KILITLENIYOR
--     IF NOT FOUND THEN RETURN 'NOTIFICATION_NOT_FOUND';
--     IF NOT EXISTS (tenant_members ...) THEN RAISE 'UNAUTHORIZED...';  <- SONRA
--
-- 17 Eylul 2026'da URETIME ve TEST projesine sorularak olculdu:
--
--   * `anon` her iki fonksiyonu da CALISTIRABILIYOR. phase22 yalnizca
--     pazarlama fonksiyonlarindaki grant'i geri almisti; bunlar acikta kaldi.
--     (Uretim, anon anahtariyla: HTTP 200 + NOTIFICATION_NOT_FOUND.)
--   * VARLIK ORACULU ACIK. Test projesinde olculdu:
--       - var olmayan UUID  -> {"success": false, "error": "NOTIFICATION_NOT_FOUND"}
--       - VAR OLAN UUID     -> UNAUTHORIZED: Tenant membership mismatch
--     Yani giris bile yapmamis biri, elindeki anon anahtariyla bir bildirim
--     ya da uyari kimliginin VAR OLUP OLMADIGINI ogrenebiliyor.
--   * Yetkisiz cagiran, yetki kontrolunden ONCE satira `FOR UPDATE` kilidi
--     koydurabiliyor.
--
-- VERI BUTUNLUGU BOZULMADI: govdedeki ikinci kat (tenant_members kontrolu)
-- calisiyor; anon ve yabanci kiraci kaydi DEGISTIREMIYOR (olculdu: durum
-- UNREAD kaldi). Kirilan sey gizlilik ve kilit disiplini. Bu, 7. bolumdeki
-- "iki katli kural"in neden iki katli oldugunun uclencu kanitidir.
--
-- DAVRANIS DEGISIKLIGI: var olmayan bir kimlik artik {"success": false, ...}
-- yerine 42501 hatasi doner. Istemci kodu bu metinlere bagimli degil
-- (`NOTIFICATION_NOT_FOUND` ve `ALERT_NOT_FOUND` depo genelinde tarandi:
-- yalnizca bu iki govdede geciyor).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. acknowledge_notification_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_notification_atomic(
  p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Yetki, satir kilidinden ONCE. "Bulunamadi" ile "yetkisiz" ayni hataya
  -- dusurulur; varlik oraculu boyle kapanir.
  SELECT tenant_id INTO v_tenant_id
  FROM public.user_notifications
  WHERE id = p_notification_id;

  IF NOT FOUND
     OR (
       NOT EXISTS (
         SELECT 1 FROM public.tenant_members
         WHERE tenant_id = v_tenant_id AND user_id = auth.uid()
       )
       AND auth.role() <> 'service_role'
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_NOTIFICATION_ACK' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_notifications
  SET status = 'ACKNOWLEDGED',
      acknowledged_at = NOW()
  WHERE id = p_notification_id;

  RETURN jsonb_build_object('success', true, 'id', p_notification_id, 'status', 'ACKNOWLEDGED');
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_notification_atomic(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification_atomic(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. resolve_executive_alert_atomic
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_executive_alert_atomic(
  p_alert_id UUID,
  p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_user UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.executive_alerts
  WHERE id = p_alert_id;

  IF NOT FOUND
     OR (
       NOT EXISTS (
         SELECT 1 FROM public.tenant_members
         WHERE tenant_id = v_tenant_id AND user_id = auth.uid()
       )
       AND auth.role() <> 'service_role'
     ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ALERT_RESOLVE' USING ERRCODE = '42501';
  END IF;

  -- p_resolved_by CAGIRANDAN gelen bir degerdir; "kim cozdu" denetim izini
  -- cagiranin yazmasina izin verilmez. auth.uid() varsa o kullanilir.
  v_user := COALESCE(auth.uid(), p_resolved_by);

  UPDATE public.executive_alerts
  SET status = 'RESOLVED',
      resolved_at = NOW(),
      resolved_by = v_user,
      updated_at = NOW()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('success', true, 'id', p_alert_id, 'status', 'RESOLVED');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- DOGRULAMA — basarisizsa goc COMMIT edilmez.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
  v_authz INT;
  v_lock INT;
BEGIN
  -- 1) Bildirim onaylama
  SELECT pg_get_functiondef('public.acknowledge_notification_atomic(uuid)'::regprocedure) INTO v_def;

  IF strpos(v_def, 'NOTIFICATION_NOT_FOUND') > 0 THEN
    RAISE EXCEPTION 'PHASE29_NOTIFICATION_ORACLE_STILL_OPEN';
  END IF;

  v_authz := strpos(v_def, 'UNAUTHORIZED_NOTIFICATION_ACK');
  v_lock  := strpos(v_def, 'FOR UPDATE');
  IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz) THEN
    RAISE EXCEPTION 'PHASE29_NOTIFICATION_LOCK_BEFORE_AUTHZ (authz=%, lock=%)', v_authz, v_lock;
  END IF;

  IF has_function_privilege('anon', 'public.acknowledge_notification_atomic(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE29_NOTIFICATION_ANON_STILL_EXECUTABLE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.acknowledge_notification_atomic(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE29_NOTIFICATION_AUTHENTICATED_ACCESS_LOST';
  END IF;

  -- 2) Uyari cozme
  SELECT pg_get_functiondef('public.resolve_executive_alert_atomic(uuid, uuid)'::regprocedure) INTO v_def;

  IF strpos(v_def, 'ALERT_NOT_FOUND') > 0 THEN
    RAISE EXCEPTION 'PHASE29_ALERT_ORACLE_STILL_OPEN';
  END IF;

  v_authz := strpos(v_def, 'UNAUTHORIZED_ALERT_RESOLVE');
  v_lock  := strpos(v_def, 'FOR UPDATE');
  IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz) THEN
    RAISE EXCEPTION 'PHASE29_ALERT_LOCK_BEFORE_AUTHZ (authz=%, lock=%)', v_authz, v_lock;
  END IF;

  IF has_function_privilege('anon', 'public.resolve_executive_alert_atomic(UUID, UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE29_ALERT_ANON_STILL_EXECUTABLE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.resolve_executive_alert_atomic(UUID, UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE29_ALERT_AUTHENTICATED_ACCESS_LOST';
  END IF;

  RAISE NOTICE 'PHASE 29 OK — yetki kilitten once, varlik oraculu kapali, anon kesildi.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (29, 'phase29_notification_authz_order')
ON CONFLICT (version) DO NOTHING;

COMMIT;
