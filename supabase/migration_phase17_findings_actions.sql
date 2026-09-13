-- =============================================================================
-- LEXBNB PHASE 17 — IDEMPOTENT FINDINGS, EXECUTIVE ALERTS & TASK LIFECYCLE
-- Depends on Phase 9 Operations, Phase 12 Executive and Phase 17 foundation.
-- =============================================================================

-- The JS Today engine already recognizes REVENUE, while the persisted alert
-- constraint did not. Keep MARKETING for future display segmentation as well.
ALTER TABLE public.executive_alerts
    DROP CONSTRAINT IF EXISTS executive_alerts_domain_check;
ALTER TABLE public.executive_alerts
    ADD CONSTRAINT executive_alerts_domain_check CHECK (
        domain IN (
            'OPERATIONS', 'FINANCE', 'GUEST_EXPERIENCE', 'PRICING',
            'SALES_CRM', 'READINESS', 'REVENUE', 'MARKETING'
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_tasks_tenant_id_pair
    ON public.operational_tasks (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_executive_alerts_tenant_id_pair
    ON public.executive_alerts (tenant_id, id);

-- -----------------------------------------------------------------------------
-- 1. MARKETING FINDINGS — canonical source of truth
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketing_findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    channel_listing_id UUID,
    finding_fingerprint CHAR(64) NOT NULL
        CHECK (finding_fingerprint ~ '^[0-9a-f]{64}$'),
    source_domain VARCHAR(30) NOT NULL CHECK (
        source_domain IN ('CHANNEL_ECONOMICS', 'FUNNEL', 'PHOTO_ANALYSIS', 'LISTING_AUDIT')
    ),
    finding_code VARCHAR(80) NOT NULL,
    metric VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    evidence_text TEXT NOT NULL,
    observation JSONB NOT NULL CHECK (jsonb_typeof(observation) = 'object'),
    hypotheses JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(hypotheses) = 'array'),
    recommended_checks JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommended_checks) = 'array'),
    recommended_action TEXT NOT NULL,
    action_kind VARCHAR(30) NOT NULL CHECK (
        action_kind IN (
            'DIGITAL_REVIEW', 'PRICE_REVIEW', 'RULE_REVIEW', 'CONTENT_UPDATE',
            'RESHOOT', 'ON_SITE_CONTENT', 'KEEP'
        )
    ),
    confidence_tier VARCHAR(20) NOT NULL CHECK (
        confidence_tier IN ('LOW', 'MEDIUM', 'HIGH')
    ),
    impact_score NUMERIC(4,2) NOT NULL CHECK (impact_score >= 0 AND impact_score <= 10),
    urgency_score NUMERIC(4,2) NOT NULL CHECK (urgency_score >= 0 AND urgency_score <= 10),
    revenue_opportunity_amount NUMERIC(14,2)
        CHECK (revenue_opportunity_amount IS NULL OR revenue_opportunity_amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'TRY' CHECK (currency ~ '^[A-Z]{3}$'),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (
        status IN ('OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED', 'STALE')
    ),
    evidence_period_start DATE,
    evidence_period_end_exclusive DATE,
    accepted_for_task BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    dismissal_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, property_id, id),
    CONSTRAINT fk_marketing_finding_property_tenant
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES public.properties (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_marketing_finding_listing_same_property
        FOREIGN KEY (tenant_id, property_id, channel_listing_id)
        REFERENCES public.property_channel_listings (tenant_id, property_id, id)
        ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT chk_marketing_finding_evidence_period CHECK (
        (evidence_period_start IS NULL AND evidence_period_end_exclusive IS NULL)
        OR (
            evidence_period_start IS NOT NULL
            AND evidence_period_end_exclusive IS NOT NULL
            AND evidence_period_end_exclusive > evidence_period_start
        )
    ),
    CONSTRAINT chk_marketing_finding_status_metadata CHECK (
        (status <> 'DISMISSED' OR (dismissed_at IS NOT NULL AND dismissal_reason IS NOT NULL))
        AND (status <> 'RESOLVED' OR resolved_at IS NOT NULL)
        AND (status <> 'ACKNOWLEDGED' OR acknowledged_at IS NOT NULL)
        AND (accepted_for_task = FALSE OR action_kind IN ('RESHOOT', 'ON_SITE_CONTENT'))
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_marketing_finding_fingerprint
    ON public.marketing_findings (tenant_id, finding_fingerprint)
    WHERE status IN ('OPEN', 'ACKNOWLEDGED');

CREATE INDEX IF NOT EXISTS idx_marketing_findings_property_status
    ON public.marketing_findings (tenant_id, property_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_findings_expiry
    ON public.marketing_findings (tenant_id, expires_at)
    WHERE status IN ('OPEN', 'ACKNOWLEDGED') AND expires_at IS NOT NULL;

-- Explicit, tenant-aware links make lifecycle synchronization queryable.
ALTER TABLE public.executive_alerts
    ADD COLUMN IF NOT EXISTS marketing_finding_id UUID;
ALTER TABLE public.operational_tasks
    ADD COLUMN IF NOT EXISTS marketing_finding_id UUID;

ALTER TABLE public.executive_alerts
    DROP CONSTRAINT IF EXISTS fk_executive_alert_marketing_finding_tenant;
ALTER TABLE public.executive_alerts
    ADD CONSTRAINT fk_executive_alert_marketing_finding_tenant
    FOREIGN KEY (tenant_id, marketing_finding_id)
    REFERENCES public.marketing_findings (tenant_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.operational_tasks
    DROP CONSTRAINT IF EXISTS fk_operational_task_marketing_finding_tenant;
ALTER TABLE public.operational_tasks
    ADD CONSTRAINT fk_operational_task_marketing_finding_tenant
    FOREIGN KEY (tenant_id, marketing_finding_id)
    REFERENCES public.marketing_findings (tenant_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_executive_alert_marketing_finding
    ON public.executive_alerts (tenant_id, marketing_finding_id)
    WHERE marketing_finding_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_task_marketing_finding
    ON public.operational_tasks (tenant_id, marketing_finding_id)
    WHERE marketing_finding_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. BACKEND UPSERT — one active record and one alert per fingerprint
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_marketing_finding(
    p_tenant_id UUID,
    p_property_id UUID,
    p_channel_listing_id UUID,
    p_finding_fingerprint TEXT,
    p_source_domain TEXT,
    p_finding_code TEXT,
    p_metric TEXT,
    p_title TEXT,
    p_evidence_text TEXT,
    p_observation JSONB,
    p_hypotheses JSONB,
    p_recommended_checks JSONB,
    p_recommended_action TEXT,
    p_action_kind TEXT,
    p_confidence_tier TEXT,
    p_impact_score NUMERIC,
    p_urgency_score NUMERIC,
    p_revenue_opportunity_amount NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'TRY',
    p_evidence_period_start DATE DEFAULT NULL,
    p_evidence_period_end_exclusive DATE DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_finding_id UUID;
    v_finding_status TEXT;
    v_alert_id UUID;
    v_severity TEXT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.marketing_findings (
        tenant_id, property_id, channel_listing_id, finding_fingerprint,
        source_domain, finding_code, metric, title, evidence_text, observation,
        hypotheses, recommended_checks, recommended_action, action_kind,
        confidence_tier, impact_score, urgency_score,
        revenue_opportunity_amount, currency, evidence_period_start,
        evidence_period_end_exclusive, expires_at
    ) VALUES (
        p_tenant_id, p_property_id, p_channel_listing_id, p_finding_fingerprint,
        p_source_domain, p_finding_code, p_metric, p_title, p_evidence_text, p_observation,
        COALESCE(p_hypotheses, '[]'::jsonb),
        COALESCE(p_recommended_checks, '[]'::jsonb),
        p_recommended_action, p_action_kind, p_confidence_tier,
        p_impact_score, p_urgency_score, p_revenue_opportunity_amount,
        upper(p_currency), p_evidence_period_start,
        p_evidence_period_end_exclusive, p_expires_at
    )
    ON CONFLICT (tenant_id, finding_fingerprint)
        WHERE status IN ('OPEN', 'ACKNOWLEDGED')
    DO UPDATE SET
        title = EXCLUDED.title,
        evidence_text = EXCLUDED.evidence_text,
        observation = EXCLUDED.observation,
        hypotheses = EXCLUDED.hypotheses,
        recommended_checks = EXCLUDED.recommended_checks,
        recommended_action = EXCLUDED.recommended_action,
        confidence_tier = EXCLUDED.confidence_tier,
        impact_score = EXCLUDED.impact_score,
        urgency_score = EXCLUDED.urgency_score,
        revenue_opportunity_amount = EXCLUDED.revenue_opportunity_amount,
        last_seen_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id, status INTO v_finding_id, v_finding_status;

    v_severity := CASE
        WHEN p_impact_score >= 9 AND p_urgency_score >= 9 THEN 'CRITICAL'
        WHEN p_impact_score >= 7 OR p_urgency_score >= 7 THEN 'HIGH'
        WHEN p_impact_score >= 4 OR p_urgency_score >= 4 THEN 'MEDIUM'
        ELSE 'LOW'
    END;

    INSERT INTO public.executive_alerts (
        tenant_id, property_id, marketing_finding_id, alert_code, severity,
        domain, status, title, reason, metric, recommended_action, deep_link,
        source_metrics
    ) VALUES (
        p_tenant_id, p_property_id, v_finding_id,
        left('MKT_' || p_finding_code, 80), v_severity,
        'REVENUE',
        CASE WHEN v_finding_status = 'ACKNOWLEDGED' THEN 'ACKNOWLEDGED' ELSE 'OPEN' END,
        p_title, p_evidence_text, p_metric,
        p_recommended_action, '#marketing?findingId=' || v_finding_id::TEXT,
        jsonb_build_array(jsonb_build_object(
            'metric', p_metric,
            'confidenceTier', p_confidence_tier,
            'sourceDomain', p_source_domain
        ))
    )
    ON CONFLICT (tenant_id, marketing_finding_id)
        WHERE marketing_finding_id IS NOT NULL
    DO UPDATE SET
        severity = EXCLUDED.severity,
        status = EXCLUDED.status,
        title = EXCLUDED.title,
        reason = EXCLUDED.reason,
        metric = EXCLUDED.metric,
        recommended_action = EXCLUDED.recommended_action,
        deep_link = EXCLUDED.deep_link,
        source_metrics = EXCLUDED.source_metrics,
        resolved_at = NULL,
        resolved_by = NULL,
        updated_at = NOW()
    RETURNING id INTO v_alert_id;

    RETURN v_finding_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_marketing_finding(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB,
    JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, DATE, TIMESTAMPTZ
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_marketing_finding(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB,
    JSONB, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, DATE, TIMESTAMPTZ
) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. USER REVIEW RPC — acknowledgement, dismissal, resolution and task opt-in
-- -----------------------------------------------------------------------------
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
    v_action TEXT := upper(trim(p_action));
    v_task_id UUID;
BEGIN
    SELECT * INTO v_finding
    FROM public.marketing_findings
    WHERE id = p_finding_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MARKETING_FINDING_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF auth.uid() IS NULL
       OR COALESCE(public.get_tenant_role(v_finding.tenant_id), '') NOT IN ('owner', 'admin', 'manager') THEN
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
GRANT EXECUTE ON FUNCTION public.review_marketing_finding(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. TASK COMPLETION SYNCHRONIZATION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_marketing_finding_from_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.marketing_finding_id IS NOT NULL
       AND NEW.status = 'DONE'
       AND OLD.status IS DISTINCT FROM NEW.status THEN
        UPDATE public.marketing_findings
        SET status = 'RESOLVED', resolved_at = COALESCE(NEW.completed_at, NOW()),
            reviewed_by = COALESCE(NEW.completed_by, reviewed_by), updated_at = NOW()
        WHERE tenant_id = NEW.tenant_id
          AND id = NEW.marketing_finding_id
          AND status IN ('OPEN', 'ACKNOWLEDGED');

        UPDATE public.executive_alerts
        SET status = 'RESOLVED', resolved_at = COALESCE(NEW.completed_at, NOW()),
            resolved_by = NEW.completed_by, updated_at = NOW()
        WHERE tenant_id = NEW.tenant_id
          AND marketing_finding_id = NEW.marketing_finding_id
          AND status <> 'RESOLVED';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_marketing_finding_from_task ON public.operational_tasks;
CREATE TRIGGER trg_sync_marketing_finding_from_task
AFTER UPDATE OF status ON public.operational_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_marketing_finding_from_task();

-- -----------------------------------------------------------------------------
-- 5. RLS — findings are backend-created and RPC-reviewed
-- -----------------------------------------------------------------------------
ALTER TABLE public.marketing_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view marketing findings" ON public.marketing_findings;
CREATE POLICY "Members view marketing findings"
ON public.marketing_findings FOR SELECT
USING (public.is_tenant_member(tenant_id));

-- No authenticated direct INSERT/UPDATE/DELETE policy is intentional.

DROP TRIGGER IF EXISTS trg_touch_marketing_findings_updated_at ON public.marketing_findings;
CREATE TRIGGER trg_touch_marketing_findings_updated_at
BEFORE UPDATE ON public.marketing_findings
FOR EACH ROW EXECUTE FUNCTION public.touch_marketing_updated_at();
