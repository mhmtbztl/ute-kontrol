-- =============================================================================

BEGIN;
-- LEXBNB PHASE 39 — BILDIRIM/UYARI RPC'LERI: 0 SATIR ETKILENDIGINDE YALAN SOYLEME
--
-- phase29 yetkiyi satir kilidinden one aldi ve bunu yapabilmek icin
-- `SELECT ... FOR UPDATE` kilidini TAMAMEN kaldirdi. O gocun kendi notunda
-- yazili, BILEREK ERTELENMIS yan etki buydu:
--
--     SELECT tenant_id INTO v_tenant_id FROM user_notifications WHERE id = ...;
--     -- ... yetki kontrolu ...
--     UPDATE user_notifications SET status = 'ACKNOWLEDGED' WHERE id = ...;
--     RETURN jsonb_build_object('success', true, ...);   <- KOSULSUZ
--
-- `SELECT` ile `UPDATE` arasinda kilit yok. O aralikta satir silinirse
-- `UPDATE` 0 satir etkiler ama fonksiyon YINE `success: true` doner.
--
-- PRATIK RISK KUCUKTUR ve oyle oldugu icin ertelenmisti: bu satirlar tek tek
-- silinmiyor (yalnizca kiraci sifirlama ve hesap kapatma akislarinda,
-- cascade ile), pencere mikrosaniye ve istemci `success` uzerinden yikici bir
-- is yapmiyor. ERTELENMESI DOGRUYDU, KALMASI DEGIL: yanlis olan sey,
-- fonksiyonun YAPMADIGI bir isi yaptim demesidir. Bu depoda kabul edilmeyen
-- kalip tam olarak budur — "kaydettim" deyip kaydetmeyen `saveAppData()` ile
-- ayni aile (CLAUDE.md 1 ve 6).
--
-- COZUM: `GET DIAGNOSTICS ... ROW_COUNT` ile 0 satir durumu `success: false`e
-- cevrilir.
--
-- NEDEN `RAISE` DEGIL `success: false`:
--   Cagiran zaten `{success, ...}` sozlesmesini okuyor. Istisna firlatmak
--   istemcide AYRI bir yol acardi ve 0 satir bir HATA degil, bir SONUCtur:
--   kayit artik yok. Yetki ihlalleri (42501) istisna olmaya devam eder.
--
-- FOR UPDATE GERI GETIRILMEDI: kilit yetki kontrolunden once alinamaz
-- (phase29'un duzelttigi acik buydu) ve kilidi yetkiden SONRA almak
-- pencereyi kapatmaz, yalnizca daraltir. 0 satiri durust raporlamak hem
-- daha basit hem daha dogru.
--
-- phase29'un kazanimlari KORUNUR: yetki kilitten once, varlik oraculu kapali
-- (bulunamadi ile yetkisiz ayni hataya duser), anon kesik, denetim izini
-- cagiran yazdiramaz. `CREATE OR REPLACE` govdeyi butunuyle degistirdigi icin
-- bu goc hepsini yeniden yazar ve dogrulama blogu hepsini yeniden olcer.
--
-- CALISTIRMA: Supabase Dashboard -> SQL Editor -> tamamini yapistir -> Run
-- Idempotenttir. phase29'dan SONRA uygulanmalidir.
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
  v_rows      INT;
BEGIN
  -- Yetki, satir kilidinden ONCE. "Bulunamadi" ile "yetkisiz" ayni hataya
  -- dusurulur; varlik oraculu boyle kapanir. (phase29)
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

  -- phase39: yukaridaki SELECT ile bu UPDATE arasinda kilit yok. Satir o
  -- aralikta silindiyse 0 satir etkilenir; `success: true` demek yalan olur.
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'id', p_notification_id,
      'error', 'NOTIFICATION_GONE'
    );
  END IF;

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
  v_user      UUID;
  v_rows      INT;
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
  -- cagiranin yazmasina izin verilmez. auth.uid() varsa o kullanilir. (phase29)
  v_user := COALESCE(auth.uid(), p_resolved_by);

  UPDATE public.executive_alerts
  SET status = 'RESOLVED',
      resolved_at = NOW(),
      resolved_by = v_user,
      updated_at = NOW()
  WHERE id = p_alert_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'id', p_alert_id,
      'error', 'ALERT_GONE'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', p_alert_id, 'status', 'RESOLVED');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_executive_alert_atomic(UUID, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- DOGRULAMA — basarisizsa goc COMMIT edilmez.
--
-- Hem YENI davranisi hem phase29'un kazanimlarini olcer. `CREATE OR REPLACE`
-- govdeyi butunuyle degistirdigi icin, eksik birakilan her koruma sessizce
-- kaybolurdu.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def   TEXT;
  v_authz INT;
  v_lock  INT;
BEGIN
  -- 1) Bildirim onaylama
  SELECT pg_get_functiondef('public.acknowledge_notification_atomic(uuid)'::regprocedure) INTO v_def;

  IF strpos(v_def, 'ROW_COUNT') = 0 THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_ROWCOUNT_MISSING: 0 satir hala success:true donuyor';
  END IF;
  IF strpos(v_def, 'NOTIFICATION_GONE') = 0 THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_GONE_MISSING: 0 satir durumu raporlanmiyor';
  END IF;

  -- phase29 kazanimlari
  IF strpos(v_def, 'NOTIFICATION_NOT_FOUND') > 0 THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_ORACLE_REOPENED: varlik oraculu geri geldi';
  END IF;
  v_authz := strpos(v_def, 'UNAUTHORIZED_NOTIFICATION_ACK');
  v_lock  := strpos(v_def, 'FOR UPDATE');
  IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz) THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_LOCK_BEFORE_AUTHZ (authz=%, lock=%)', v_authz, v_lock;
  END IF;
  IF has_function_privilege('anon', 'public.acknowledge_notification_atomic(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_ANON_STILL_EXECUTABLE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.acknowledge_notification_atomic(UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE39_NOTIFICATION_AUTHENTICATED_ACCESS_LOST';
  END IF;

  -- 2) Uyari cozme
  SELECT pg_get_functiondef('public.resolve_executive_alert_atomic(uuid, uuid)'::regprocedure) INTO v_def;

  IF strpos(v_def, 'ROW_COUNT') = 0 THEN
    RAISE EXCEPTION 'PHASE39_ALERT_ROWCOUNT_MISSING: 0 satir hala success:true donuyor';
  END IF;
  IF strpos(v_def, 'ALERT_GONE') = 0 THEN
    RAISE EXCEPTION 'PHASE39_ALERT_GONE_MISSING: 0 satir durumu raporlanmiyor';
  END IF;

  IF strpos(v_def, 'ALERT_NOT_FOUND') > 0 THEN
    RAISE EXCEPTION 'PHASE39_ALERT_ORACLE_REOPENED: varlik oraculu geri geldi';
  END IF;
  v_authz := strpos(v_def, 'UNAUTHORIZED_ALERT_RESOLVE');
  v_lock  := strpos(v_def, 'FOR UPDATE');
  IF v_authz = 0 OR (v_lock <> 0 AND v_lock < v_authz) THEN
    RAISE EXCEPTION 'PHASE39_ALERT_LOCK_BEFORE_AUTHZ (authz=%, lock=%)', v_authz, v_lock;
  END IF;
  -- Denetim izi sirasi: oturum varken izi OTURUM belirler.
  IF strpos(v_def, 'COALESCE(auth.uid(), p_resolved_by)') = 0 THEN
    RAISE EXCEPTION 'PHASE39_ALERT_AUDIT_ORDER_LOST: cagiran denetim izine baskasinin kimligini yazdirabilir';
  END IF;
  IF has_function_privilege('anon', 'public.resolve_executive_alert_atomic(UUID, UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE39_ALERT_ANON_STILL_EXECUTABLE';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.resolve_executive_alert_atomic(UUID, UUID)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE39_ALERT_AUTHENTICATED_ACCESS_LOST';
  END IF;

  RAISE NOTICE 'PHASE 39 OK — 0 satir artik success:false; phase29 korumalari yerinde.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (39, 'phase39_notification_rowcount')
ON CONFLICT (version) DO NOTHING;

COMMIT;
