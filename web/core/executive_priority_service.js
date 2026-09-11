// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE PRIORITY & TODAY COMMAND CENTER SERVICE
// Centralized Priority Weights, Cross-Domain Scoring, Duplicate Action Collapse,
// and Strict Maximum Capacity (3 Critical + 2 Operations + 1 Revenue Opportunity).
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExecutivePriorityService = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Centralized configuration for executive scoring weights.
   * Never hardcode weights inline.
   */
  const EXECUTIVE_PRIORITY_CONFIG = {
    weights: {
      guestImpact: 40,
      urgencyDueTime: 30,
      revenueImpact: 25,
      slaBreachProximity: 20,
      reversibilityConfidence: 15
    },
    caps: {
      maxCritical: 3,
      maxOperations: 2,
      maxRevenueOpportunities: 1
    },
    categoryThresholds: {
      criticalScoreMin: 70,
      operationsScoreMin: 35
    }
  };

  /**
   * Computes deterministic priority score for an action based on centralized config.
   */
  function computeActionPriorityScore(action, context = {}) {
    const w = EXECUTIVE_PRIORITY_CONFIG.weights;
    let score = 0;

    // 1. Guest Impact (0 to 40)
    if (action.isGuestInHouse || action.guestImpact === 'HIGH') {
      score += w.guestImpact;
    } else if (action.guestImpact === 'MEDIUM' || action.isCheckInToday) {
      score += Math.round(w.guestImpact * 0.75);
    } else if (action.guestImpact === 'LOW') {
      score += Math.round(w.guestImpact * 0.25);
    }

    // 2. Urgency & Due Time (0 to 30)
    if (action.isOverdue) {
      score += w.urgencyDueTime;
    } else if (action.isDueToday || action.hoursUntilDue <= 4) {
      score += Math.round(w.urgencyDueTime * 0.8);
    } else if (action.hoursUntilDue <= 24) {
      score += Math.round(w.urgencyDueTime * 0.5);
    }

    // 3. Revenue Impact (0 to 25)
    if (action.domain === 'PRICING' || action.domain === 'REVENUE' || action.revenueImpact === 'HIGH') {
      score += w.revenueImpact;
    } else if (action.revenueImpact === 'MEDIUM') {
      score += Math.round(w.revenueImpact * 0.6);
    }

    // 4. SLA Breach Proximity (0 to 20)
    if (action.isSlaBreached) {
      score += w.slaBreachProximity;
    } else if (action.isSlaAtRisk) {
      score += Math.round(w.slaBreachProximity * 0.6);
    }

    // 5. Reversibility & Confidence (0 to 15)
    if (action.confidence === 'HIGH') {
      score += w.reversibilityConfidence;
    } else if (action.confidence === 'MEDIUM') {
      score += Math.round(w.reversibilityConfidence * 0.6);
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Collapses co-occurring issues for the same property into a single unified action.
   * E.g. Cleaning incomplete + Property NOT_READY + Check-in in 2h => single collapsed card.
   */
  function collapseDuplicateActions(actions) {
    const propertyGroups = new Map();
    const standaloneActions = [];

    actions.forEach(act => {
      const propId = act.propertyId || act.property_id;
      if (!propId) {
        standaloneActions.push(act);
        return;
      }
      if (!propertyGroups.has(propId)) {
        propertyGroups.set(propId, []);
      }
      propertyGroups.get(propId).push(act);
    });

    const collapsedList = [...standaloneActions];

    propertyGroups.forEach((groupActions, propId) => {
      if (groupActions.length === 1) {
        collapsedList.push(groupActions[0]);
        return;
      }

      // Multiple issues for the same property -> collapse!
      const highestScoreAction = [...groupActions].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0))[0];
      const propertyName = highestScoreAction.propertyName || highestScoreAction.property_name || `Mülk #${propId}`;

      const rootCauses = groupActions.map(a => a.reason || a.title || a.name);
      const combinedSourceMetrics = groupActions.flatMap(a => a.sourceMetrics || []);
      const primaryCategory = groupActions.some(a => a.category === 'CRITICAL' || a.severity === 'CRITICAL')
        ? 'CRITICAL'
        : (highestScoreAction.category || 'OPERATIONS');

      const collapsedAction = {
        id: `collapsed-${propId}-${Date.now()}`,
        isCollapsed: true,
        propertyId: propId,
        propertyName,
        category: primaryCategory,
        title: `${propertyName}: Zirve hazırlık & operasyonel müdahale gerekiyor`,
        reason: `${groupActions.length} adet bağlantılı operasyonel sorun tespit edildi.`,
        rootCauses: rootCauses,
        priorityScore: Math.min(100, (highestScoreAction.priorityScore || 50) + 10), // slight boost for multiple issues
        domain: highestScoreAction.domain || 'OPERATIONS',
        deepLink: highestScoreAction.deepLink || `/operations?propertyId=${propId}`,
        sourceMetrics: Array.from(new Set(combinedSourceMetrics)),
        originalActionsCount: groupActions.length,
        originalActions: groupActions
      };

      collapsedList.push(collapsedAction);
    });

    return collapsedList;
  }

  /**
   * Selects Today Command Center actions based on strict maximum capacity:
   * Max 3 Critical, Max 2 Operations, Max 1 Revenue Opportunity.
   * NEVER creates fake filler items if genuine actions are fewer.
   */
  function selectTodayCommandCenterActions(actions) {
    const scoredActions = actions.map(act => {
      const score = act.priorityScore !== undefined ? act.priorityScore : computeActionPriorityScore(act);
      return { ...act, priorityScore: score };
    });

    // Ensure mandatory sourceMetrics and deepLink
    scoredActions.forEach(act => {
      if (!act.sourceMetrics) act.sourceMetrics = [];
      if (!act.deepLink) act.deepLink = act.domain ? `/${act.domain.toLowerCase()}` : '/';
    });

    // Collapse duplicates
    const collapsed = collapseDuplicateActions(scoredActions);

    // Sort by priorityScore DESC
    collapsed.sort((a, b) => b.priorityScore - a.priorityScore);

    const criticalPool = [];
    const operationsPool = [];
    const revenuePool = [];

    collapsed.forEach(act => {
      const cat = act.category || act.type;
      const dom = act.domain;

      if (cat === 'REVENUE_OPPORTUNITY' || dom === 'PRICING' || dom === 'REVENUE') {
        revenuePool.push(act);
      } else if (cat === 'CRITICAL' || act.priorityScore >= EXECUTIVE_PRIORITY_CONFIG.categoryThresholds.criticalScoreMin) {
        criticalPool.push(act);
      } else {
        operationsPool.push(act);
      }
    });

    const selectedCritical = criticalPool.slice(0, EXECUTIVE_PRIORITY_CONFIG.caps.maxCritical);
    const selectedOperations = operationsPool.slice(0, EXECUTIVE_PRIORITY_CONFIG.caps.maxOperations);
    const selectedRevenue = revenuePool.slice(0, EXECUTIVE_PRIORITY_CONFIG.caps.maxRevenueOpportunities);

    return {
      critical: selectedCritical,
      operations: selectedOperations,
      revenueOpportunities: selectedRevenue,
      totalSelected: selectedCritical.length + selectedOperations.length + selectedRevenue.length,
      maxCapacities: EXECUTIVE_PRIORITY_CONFIG.caps,
      allAvailableCount: collapsed.length
    };
  }

  return {
    EXECUTIVE_PRIORITY_CONFIG,
    computeActionPriorityScore,
    collapseDuplicateActions,
    selectTodayCommandCenterActions
  };
}));
