-- =============================================================================

BEGIN;
-- LEXBNB PHASE 25 — PAZARLAMA BULGUSU INCELEMESINDE YETKI SIRASI
--
-- phase23 sonrasi review_marketing_finding'in korumasi DOGRUYDU ama YERI yanlisti:
--
--     SELECT ... FOR UPDATE;                  <- once satir bulunup KILITLENIYOR
--     IF NOT FOUND THEN RAISE 'MARKETING_FINDING_NOT_FOUND';
--     IF ... get_tenant_role ... THEN RAISE 'UNAUTHORIZED...';   <- yetki SONRA
--
-- Iki sonucu vardi:
--   1. Yetkisiz bir cagiran, baska bir kiracinin satirina kisa sureligine
--      kilit koydurabiliyordu.
--   2. Hata mesaji "bulunamadi" ile "yetkisiz" arasinda ayrim yaptigi icin,
--      bir bulgu kimliginin var olup olmadigi disariya siziyordu (varlik oraculu).
--
-- phase22 anon'u tamamen kestigi icin bu yalnizca giris yapmis yabanci bir
-- kiraci tarafindan kullanilabilirdi ve UUID'ler tahmin edilemez; etki dusuk.
-- Yine de dogru sira ucuz: once yetki, sonra kilit; ve iki durum tek hata.
--
-- Davranis degisikligi: var olmayan bir bulgu artik P0002 yerine 42501 doner.
-- Hicbir istemci kodu MARKETING_FINDING_NOT_FOUND metnine bagimli degildi
-- (depo genelinde tarandi).
--
-- Bu dosya phase23'teki nihai govdeden OTOMATIK uretilmistir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.review_marketing_finding(
    p_finding_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_finding public.marketing_findings%ROWTYPE;
    v_tenant_id UUID;
    v_action TEXT := upper(trim(p_action));
    v_task_id UUID;
BEGIN
    -- Yetki kontrolu satir kilidinden ONCE yapilir. Iki sebep:
    --   1. Yetkisiz bir cagiran, baska bir kiracinin satirina kilit koyduramamali.
    --   2. "bulunamadi" (P0002) ile "yetkisiz" (42501) ayri hatalar oldugunda,
    --      bir bulgu kimliginin VAR OLUP OLMADIGI disariya sizardi. Iki durum
    --      artik ayni hatayi dondurur; varlik oraculu kapanir.
    SELECT tenant_id INTO v_tenant_id
    FROM public.marketing_findings
    WHERE id = p_finding_id;

    IF NOT FOUND
       OR auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(v_tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_REVIEW' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_finding
    FROM public.marketing_findings
    WHERE id = p_finding_id
    FOR UPDATE;

    -- Satir yetki kontrolu ile kilit arasinda silinmis olabilir (yaris).
    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MARKETING_REVIEW' USING ERRCODE = '42501';
    END IF;

    IF v_finding.status IN ('DISMISSED', 'RESOLVED', 'STALE') THEN
        RAISE EXCEPTION 'TERMINAL_MARKETING_FINDING' USING ERRCODE = '22023';
    END IF;

    IF v_action = 'ACKNOWLEDGE' THEN
        UPDATE public.marketing_findings
        SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_at = NOW(),
            acknowledged_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'DISMISS' THEN
        IF p_reason IS NULL OR trim(p_reason) = '' THEN
            RAISE EXCEPTION 'DISMISS_REASON_REQUIRED' USING ERRCODE = '22023';
        END IF;

        UPDATE public.marketing_findings
        SET status = 'DISMISSED', dismissed_at = NOW(), dismissal_reason = trim(p_reason),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'RESOLVE' THEN
        UPDATE public.marketing_findings
        SET status = 'RESOLVED', resolved_at = NOW(),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'RESOLVED', resolved_at = NOW(), resolved_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;

    ELSIF v_action = 'ACCEPT_TASK' THEN
        IF v_finding.action_kind NOT IN ('RESHOOT', 'ON_SITE_CONTENT') THEN
            RAISE EXCEPTION 'NON_PHYSICAL_FINDING_CANNOT_CREATE_TASK' USING ERRCODE = '22023';
        END IF;

        INSERT INTO public.operational_tasks (
            tenant_id, property_id, marketing_finding_id, task_type, task_subtype,
            title, description, status, priority, source, source_event_id, metadata
        ) VALUES (
            v_finding.tenant_id, v_finding.property_id, v_finding.id,
            'GENERAL', 'MARKETING_CREATIVE', v_finding.title,
            v_finding.recommended_action, 'TODO',
            CASE
                WHEN v_finding.impact_score >= 8 AND v_finding.urgency_score >= 9 THEN 'CRITICAL'
                WHEN v_finding.impact_score >= 7 OR v_finding.urgency_score >= 7 THEN 'HIGH'
                WHEN v_finding.impact_score >= 4 OR v_finding.urgency_score >= 4 THEN 'MEDIUM'
                ELSE 'LOW'
            END,
            'MANUAL', 'MKT:' || v_finding.id::TEXT,
            jsonb_build_object('marketingFindingId', v_finding.id, 'actionKind', v_finding.action_kind)
        )
        ON CONFLICT (tenant_id, source_event_id)
            WHERE source_event_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            priority = EXCLUDED.priority,
            marketing_finding_id = EXCLUDED.marketing_finding_id,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
        RETURNING id INTO v_task_id;

        UPDATE public.marketing_findings
        SET status = 'ACKNOWLEDGED', accepted_for_task = TRUE,
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            reviewed_by = auth.uid(), updated_at = NOW()
        WHERE id = p_finding_id;

        UPDATE public.executive_alerts
        SET status = 'ACKNOWLEDGED', acknowledged_at = COALESCE(acknowledged_at, NOW()),
            acknowledged_by = auth.uid(), updated_at = NOW()
        WHERE tenant_id = v_finding.tenant_id AND marketing_finding_id = p_finding_id;
    ELSE
        RAISE EXCEPTION 'INVALID_MARKETING_REVIEW_ACTION' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'findingId', p_finding_id,
        'action', v_action,
        'taskId', v_task_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_marketing_finding(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_marketing_finding(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_marketing_finding(UUID, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- DOGRULAMA — basarisizsa goc durur (CLAUDE.md bolum 4.2)
-- =============================================================================
DO $verify$
DECLARE
    v_def TEXT;
    v_lock INT;
    v_authz INT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'review_marketing_finding'
    ORDER BY p.oid DESC LIMIT 1;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'PHASE25_FUNCTION_MISSING';
    END IF;

    -- Duz metin aramasi; regex kacisi bu kontrolu sessizce yanlis yapabilirdi.
    IF strpos(v_def, 'MARKETING_FINDING_NOT_FOUND') > 0 THEN
        RAISE EXCEPTION 'PHASE25_EXISTENCE_ORACLE_STILL_OPEN';
    END IF;

    IF strpos(v_def, 'COALESCE(public.get_tenant_role') = 0 THEN
        RAISE EXCEPTION 'PHASE25_GUARD_NOT_NULL_SAFE';
    END IF;

    v_authz := strpos(v_def, 'UNAUTHORIZED_MARKETING_REVIEW');
    v_lock  := strpos(v_def, 'FOR UPDATE');
    IF v_lock = 0 OR v_authz = 0 OR v_lock < v_authz THEN
        RAISE EXCEPTION 'PHASE25_LOCK_STILL_BEFORE_AUTHZ (authz=%, lock=%)', v_authz, v_lock;
    END IF;

    IF has_function_privilege('anon', 'public.review_marketing_finding(UUID, TEXT, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE25_ANON_STILL_EXECUTABLE';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.review_marketing_finding(UUID, TEXT, TEXT)', 'EXECUTE') THEN
        RAISE EXCEPTION 'PHASE25_AUTHENTICATED_ACCESS_LOST';
    END IF;

    RAISE NOTICE 'PHASE 25 OK — yetki kilitten once, varlik oraculu kapali.';
END
$verify$;

INSERT INTO public.schema_migrations(version, name)
VALUES (25, 'phase25_marketing_review_authz_order')
ON CONFLICT (version) DO NOTHING;

COMMIT;
