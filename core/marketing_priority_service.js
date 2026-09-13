// =============================================================================
// LEXBNB PHASE 17 — MARKETING ACTION PRIORITIZATION
// Deterministic, explainable ranking for the marketing workspace (max three).
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingPriorityService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({ maxActions: 3, defaultEffort: 2 });
  const CONFIDENCE_VALUES = Object.freeze({ LOW: 0.4, MEDIUM: 0.7, HIGH: 0.9 });
  const ACTION_EFFORT = Object.freeze({
    KEEP: 1,
    DIGITAL_REVIEW: 1,
    PRICE_REVIEW: 1,
    RULE_REVIEW: 1,
    CONTENT_UPDATE: 2,
    RESHOOT: 4,
    ON_SITE_CONTENT: 5
  });
  const ACTIVE_STATUSES = new Set(['OPEN', 'ACKNOWLEDGED']);

  function round(value, digits = 3) {
    const scale = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function enumValue(value) {
    return String(value || '').trim().toUpperCase();
  }

  function numberInRange(value, name, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) throw new Error(`INVALID_${name}`);
    return number;
  }

  function confidenceValue(finding) {
    const explicit = finding.confidenceScore ?? finding.confidence_score;
    if (explicit !== undefined && explicit !== null) return numberInRange(explicit, 'CONFIDENCE_SCORE', 0, 1);
    return CONFIDENCE_VALUES[enumValue(finding.confidenceTier || finding.confidence_tier)] || 0;
  }

  function effortValue(finding, options) {
    const explicit = finding.effortScore ?? finding.effort_score;
    if (explicit !== undefined && explicit !== null) return numberInRange(explicit, 'EFFORT_SCORE', 1, 5);
    return ACTION_EFFORT[enumValue(finding.actionKind || finding.action_kind)] || options.defaultEffort;
  }

  function scoreMarketingFinding(finding = {}, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const impact = numberInRange(finding.impactScore ?? finding.impact_score, 'IMPACT_SCORE', 0, 10);
    const urgency = numberInRange(finding.urgencyScore ?? finding.urgency_score, 'URGENCY_SCORE', 0, 10);
    const confidence = confidenceValue(finding);
    const effort = effortValue(finding, config);
    const revenueOpportunity = Number(finding.revenueOpportunityAmount ?? finding.revenue_opportunity_amount ?? 0);
    if (!Number.isFinite(revenueOpportunity) || revenueOpportunity < 0) throw new Error('INVALID_REVENUE_OPPORTUNITY');
    const revenueMultiplier = 1 + Math.log10(1 + revenueOpportunity);
    const score = round((impact * confidence * urgency * revenueMultiplier) / effort);
    return {
      score,
      formulaVersion: 'marketing-priority-v1',
      factors: { impact, confidence, urgency, effort, revenueOpportunity, revenueMultiplier: round(revenueMultiplier) }
    };
  }

  function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function selectTopMarketingActions(findings = [], options = {}) {
    const config = { ...DEFAULTS, ...options };
    if (!Number.isInteger(config.maxActions) || config.maxActions < 0) throw new Error('INVALID_MAX_ACTIONS');
    const deduped = new Map();
    findings.forEach(finding => {
      const status = enumValue(finding.status || 'OPEN');
      const actionKind = enumValue(finding.actionKind || finding.action_kind);
      if (!ACTIVE_STATUSES.has(status) || actionKind === 'KEEP') return;
      const identity = finding.findingFingerprint || finding.finding_fingerprint || finding.id;
      if (!identity) throw new Error('FINDING_IDENTITY_REQUIRED');
      const existing = deduped.get(identity);
      if (!existing || timestamp(finding.lastSeenAt || finding.last_seen_at) > timestamp(existing.lastSeenAt || existing.last_seen_at)) {
        deduped.set(identity, finding);
      }
    });

    return [...deduped.values()]
      .map(finding => ({ ...finding, priority: scoreMarketingFinding(finding, config) }))
      .sort((a, b) => b.priority.score - a.priority.score
        || b.priority.factors.urgency - a.priority.factors.urgency
        || timestamp(b.lastSeenAt || b.last_seen_at) - timestamp(a.lastSeenAt || a.last_seen_at)
        || String(a.id || '').localeCompare(String(b.id || '')))
      .slice(0, config.maxActions);
  }

  return { DEFAULTS, CONFIDENCE_VALUES, ACTION_EFFORT, scoreMarketingFinding, selectTopMarketingActions };
}));
