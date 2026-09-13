// LEXBNB PHASE 17 — FUNNEL OBSERVATION TO IDEMPOTENT FINDING ORCHESTRATOR
// Intended for a service-role worker; browsers cannot execute the persistence RPC.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./marketing_funnel_service'), require('./marketing_action_service'));
  } else {
    root.MarketingFindingOrchestrator = factory(root.MarketingFunnelService, root.MarketingActionService);
  }
}(typeof self !== 'undefined' ? self : this, function (FunnelService, ActionService) {
  'use strict';

  const CODE_CONFIG = Object.freeze({
    VISIBILITY_BELOW_REFERENCE: { title: 'İlan görünürlüğünü inceleyin', actionKind: 'RULE_REVIEW', impactScore: 7, urgencyScore: 6 },
    CLICK_RATE_BELOW_REFERENCE: { title: 'İlan tıklama performansını inceleyin', actionKind: 'CONTENT_UPDATE', impactScore: 8, urgencyScore: 6 },
    CONVERSION_RATE_BELOW_REFERENCE: { title: 'İlan dönüşüm kaybını inceleyin', actionKind: 'DIGITAL_REVIEW', impactScore: 8, urgencyScore: 7 }
  });

  function finite(value, name) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`VALID_${name}_REQUIRED`);
    return number;
  }

  async function buildFunnelFindingDraft(input = {}) {
    const observation = input.observation || {};
    const config = CODE_CONFIG[observation.code];
    if (!config) throw new Error('UNSUPPORTED_FUNNEL_OBSERVATION');
    if (!input.tenantId || !input.propertyId || !input.channelListingId) throw new Error('FUNNEL_FINDING_SCOPE_REQUIRED');
    const observed = finite(observation.observed, 'OBSERVED_VALUE');
    const reference = finite(observation.reference, 'REFERENCE_VALUE');
    const sampleSize = finite(observation.sampleSize, 'SAMPLE_SIZE');
    const fingerprint = await ActionService.buildFindingFingerprint({
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      channelListingId: input.channelListingId,
      sourceDomain: 'FUNNEL',
      findingCode: observation.code,
      metric: observation.metric
    });
    const delta = Number.isFinite(Number(observation.relativeDeltaPercent))
      ? `; referansa göre fark %${Number(observation.relativeDeltaPercent)}` : '';
    return {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      channelListingId: input.channelListingId,
      findingFingerprint: fingerprint,
      sourceDomain: 'FUNNEL',
      findingCode: observation.code,
      metric: observation.metric,
      title: config.title,
      evidenceText: `${observation.metric}: gözlenen ${observed}, referans ${reference}, örneklem ${sampleSize}${delta}. Bu bir gözlemdir; neden kanıtı değildir.`,
      observation: { ...observation, causalClaim: false },
      hypotheses: Array.isArray(observation.hypotheses) ? observation.hypotheses : [],
      recommendedChecks: Array.isArray(observation.recommendedChecks) ? observation.recommendedChecks : [],
      recommendedAction: (observation.recommendedChecks || []).join(' · ') || 'Veri kaynağını ve ilan ayarlarını inceleyin.',
      actionKind: config.actionKind,
      confidenceTier: observation.confidenceTier,
      impactScore: config.impactScore,
      urgencyScore: config.urgencyScore,
      revenueOpportunityAmount: null,
      currency: input.currency || 'TRY',
      evidencePeriodStart: input.periodStart || null,
      evidencePeriodEndExclusive: input.periodEndExclusive || null,
      expiresAt: input.expiresAt || null
    };
  }

  function rpcArgs(draft) {
    return {
      p_tenant_id: draft.tenantId,
      p_property_id: draft.propertyId,
      p_channel_listing_id: draft.channelListingId,
      p_finding_fingerprint: draft.findingFingerprint,
      p_source_domain: draft.sourceDomain,
      p_finding_code: draft.findingCode,
      p_metric: draft.metric,
      p_title: draft.title,
      p_evidence_text: draft.evidenceText,
      p_observation: draft.observation,
      p_hypotheses: draft.hypotheses,
      p_recommended_checks: draft.recommendedChecks,
      p_recommended_action: draft.recommendedAction,
      p_action_kind: draft.actionKind,
      p_confidence_tier: draft.confidenceTier,
      p_impact_score: draft.impactScore,
      p_urgency_score: draft.urgencyScore,
      p_revenue_opportunity_amount: draft.revenueOpportunityAmount,
      p_currency: draft.currency,
      p_evidence_period_start: draft.evidencePeriodStart,
      p_evidence_period_end_exclusive: draft.evidencePeriodEndExclusive,
      p_expires_at: draft.expiresAt
    };
  }

  async function persistFinding(client, draft) {
    if (!client || typeof client.rpc !== 'function') throw new Error('SUPABASE_SERVICE_CLIENT_REQUIRED');
    const response = await client.rpc('upsert_marketing_finding', rpcArgs(draft));
    if (response && response.error) throw response.error;
    if (!response || !response.data) throw new Error('FINDING_ID_REQUIRED');
    return response.data;
  }

  async function diagnoseAndPersist(client, input = {}) {
    const diagnosis = FunnelService.diagnoseFunnel({
      snapshot: input.snapshot,
      benchmark: input.benchmark,
      normalizedVisibility: input.normalizedVisibility,
      thresholds: input.thresholds
    });
    const findings = [];
    for (const observation of diagnosis.observations) {
      const draft = await buildFunnelFindingDraft({ ...input, observation });
      findings.push({ id: await persistFinding(client, draft), draft });
    }
    return { diagnosis, findings };
  }

  return { CODE_CONFIG, buildFunnelFindingDraft, rpcArgs, persistFinding, diagnoseAndPersist };
}));
