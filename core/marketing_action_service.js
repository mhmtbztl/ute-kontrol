// =============================================================================
// LEXBNB PHASE 17 — MARKETING FINDING, EXECUTIVE ADAPTER & TASK LIFECYCLE
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./executive_priority_service'), require('crypto'));
  } else {
    root.MarketingActionService = factory(root.ExecutivePriorityService, root.crypto);
  }
}(typeof self !== 'undefined' ? self : this, function (ExecutivePriorityService, CryptoProvider) {
  'use strict';

  if (!ExecutivePriorityService || typeof ExecutivePriorityService.computeActionPriorityScore !== 'function') {
    throw new Error('MarketingActionService requires ExecutivePriorityService');
  }

  const TERMINAL_STATUSES = Object.freeze(['DISMISSED', 'RESOLVED', 'STALE']);
  const TASK_ACTION_KINDS = Object.freeze(['RESHOOT', 'ON_SITE_CONTENT']);

  function normalizeEnum(value) {
    return String(value || '').trim().toUpperCase();
  }

  function stableObject(value) {
    if (Array.isArray(value)) return value.map(stableObject);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableObject(value[key]);
      return result;
    }, {});
  }

  async function sha256Hex(value) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') {
      return CryptoProvider.createHash('sha256').update(value, 'utf8').digest('hex');
    }
    if (CryptoProvider && CryptoProvider.subtle) {
      const bytes = new TextEncoder().encode(value);
      const digest = await CryptoProvider.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  async function buildFindingFingerprint(identity = {}) {
    const required = ['tenantId', 'propertyId', 'sourceDomain', 'findingCode', 'metric'];
    for (const field of required) {
      if (!identity[field]) throw new Error(`MISSING_FINDING_IDENTITY: ${field}`);
    }
    const canonicalIdentity = stableObject({
      tenantId: identity.tenantId,
      propertyId: identity.propertyId,
      channelListingId: identity.channelListingId || null,
      sourceDomain: normalizeEnum(identity.sourceDomain),
      findingCode: normalizeEnum(identity.findingCode),
      metric: normalizeEnum(identity.metric),
      periodStart: identity.periodStart || null,
      periodEndExclusive: identity.periodEndExclusive || null
    });
    return sha256Hex(JSON.stringify(canonicalIdentity));
  }

  function normalizeConfidence(value) {
    const tier = normalizeEnum(value);
    if (tier === 'HIGH') return 'HIGH';
    if (tier === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }

  function revenueImpactFor(finding) {
    const explicit = normalizeEnum(finding.revenueImpact);
    if (['HIGH', 'MEDIUM', 'LOW'].includes(explicit)) return explicit;
    const impact = Number(finding.impactScore || finding.impact_score || 0);
    if (impact >= 7) return 'HIGH';
    if (impact >= 4) return 'MEDIUM';
    return 'LOW';
  }

  function adaptFindingToExecutiveAction(finding = {}) {
    const id = finding.id || finding.findingId;
    const propertyId = finding.propertyId || finding.property_id;
    if (!id || !propertyId || !finding.title) throw new Error('INVALID_MARKETING_FINDING');

    const action = {
      id: `marketing-${id}`,
      findingId: id,
      propertyId,
      propertyName: finding.propertyName || finding.property_name || null,
      category: 'REVENUE_OPPORTUNITY',
      domain: 'REVENUE',
      sourceDomain: 'MARKETING',
      collapseKey: `MARKETING:${propertyId}`,
      title: finding.title,
      reason: finding.evidenceText || finding.evidence_text || finding.observation || '',
      recommendedAction: finding.recommendedAction || finding.recommended_action || '',
      metric: finding.metric || finding.targetMetric || finding.target_metric || null,
      revenueImpact: revenueImpactFor(finding),
      revenueOpportunityAmount: Number(finding.revenueOpportunityAmount || finding.revenue_opportunity_amount || 0),
      confidence: normalizeConfidence(finding.confidenceTier || finding.confidence_tier),
      deepLink: `#marketing?findingId=${encodeURIComponent(id)}`,
      sourceMetrics: Array.isArray(finding.sourceMetrics)
        ? finding.sourceMetrics
        : [finding.metric || finding.targetMetric || finding.target_metric].filter(Boolean),
      isDueToday: Boolean(finding.isDueToday || finding.is_due_today),
      hoursUntilDue: finding.hoursUntilDue === undefined ? null : finding.hoursUntilDue
    };

    return {
      ...action,
      priorityScore: ExecutivePriorityService.computeActionPriorityScore(action)
    };
  }

  function shouldCreateOperationalTask(finding = {}) {
    const status = normalizeEnum(finding.status || 'OPEN');
    const actionKind = normalizeEnum(finding.actionKind || finding.action_kind);
    const accepted = finding.acceptedForTask === true || finding.accepted_for_task === true;
    return accepted && !TERMINAL_STATUSES.includes(status) && TASK_ACTION_KINDS.includes(actionKind);
  }

  function taskPriorityFor(finding) {
    const urgency = Number(finding.urgencyScore || finding.urgency_score || 0);
    const impact = Number(finding.impactScore || finding.impact_score || 0);
    if (urgency >= 9 && impact >= 8) return 'CRITICAL';
    if (urgency >= 7 || impact >= 7) return 'HIGH';
    if (urgency >= 4 || impact >= 4) return 'MEDIUM';
    return 'LOW';
  }

  function buildOperationalTaskDraft(finding = {}) {
    if (!shouldCreateOperationalTask(finding)) {
      throw new Error('MARKETING_TASK_REQUIRES_ACCEPTED_PHYSICAL_ACTION');
    }
    const id = finding.id || finding.findingId;
    const tenantId = finding.tenantId || finding.tenant_id;
    const propertyId = finding.propertyId || finding.property_id;
    if (!id || !tenantId || !propertyId || !finding.title) throw new Error('INVALID_MARKETING_FINDING');

    return {
      tenant_id: tenantId,
      property_id: propertyId,
      task_type: 'GENERAL',
      task_subtype: 'MARKETING_CREATIVE',
      title: finding.title,
      description: finding.recommendedAction || finding.recommended_action || finding.evidenceText || finding.evidence_text || '',
      status: 'TODO',
      priority: taskPriorityFor(finding),
      source: 'MANUAL',
      source_event_id: `MKT:${id}`,
      metadata: {
        marketingFindingId: id,
        findingFingerprint: finding.findingFingerprint || finding.finding_fingerprint || null,
        actionKind: normalizeEnum(finding.actionKind || finding.action_kind)
      }
    };
  }

  function transitionFinding(current = {}, event, context = {}) {
    const status = normalizeEnum(current.status || 'OPEN');
    const normalizedEvent = normalizeEnum(event);
    const now = context.now || new Date().toISOString();
    const actorId = context.actorId || null;
    const next = { ...current };

    if (normalizedEvent === 'REDISCOVER') {
      next.status = 'OPEN';
      next.lastSeenAt = now;
      next.resolvedAt = null;
      next.dismissedAt = null;
      return next;
    }

    if (TERMINAL_STATUSES.includes(status)) throw new Error(`TERMINAL_FINDING: ${status}`);

    if (normalizedEvent === 'ACKNOWLEDGE') {
      next.status = 'ACKNOWLEDGED';
      next.acknowledgedAt = now;
      next.reviewedBy = actorId;
    } else if (normalizedEvent === 'ACCEPT_FOR_TASK') {
      const actionKind = normalizeEnum(current.actionKind || current.action_kind);
      if (!TASK_ACTION_KINDS.includes(actionKind)) throw new Error('NON_PHYSICAL_FINDING_CANNOT_CREATE_TASK');
      next.status = 'ACKNOWLEDGED';
      next.acceptedForTask = true;
      next.acknowledgedAt = now;
      next.reviewedBy = actorId;
    } else if (normalizedEvent === 'DISMISS') {
      if (!context.reason) throw new Error('DISMISS_REASON_REQUIRED');
      next.status = 'DISMISSED';
      next.dismissedAt = now;
      next.dismissalReason = context.reason;
      next.reviewedBy = actorId;
    } else if (normalizedEvent === 'RESOLVE' || normalizedEvent === 'TASK_COMPLETED') {
      if (normalizedEvent === 'TASK_COMPLETED' && !current.operationalTaskId && !current.operational_task_id) {
        throw new Error('TASK_LINK_REQUIRED');
      }
      next.status = 'RESOLVED';
      next.resolvedAt = now;
      next.reviewedBy = actorId;
    } else if (normalizedEvent === 'MARK_STALE') {
      next.status = 'STALE';
      next.staleAt = now;
    } else {
      throw new Error(`INVALID_FINDING_EVENT: ${normalizedEvent}`);
    }

    return next;
  }

  return {
    TERMINAL_STATUSES,
    TASK_ACTION_KINDS,
    buildFindingFingerprint,
    adaptFindingToExecutiveAction,
    shouldCreateOperationalTask,
    buildOperationalTaskDraft,
    transitionFinding
  };
}));
