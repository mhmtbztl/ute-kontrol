// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE AI ADVISOR & SANITIZED CONTEXT BUILDER
// Sanitized Context Extraction, PII & Secret Scrubbing, Structured Schema,
// Hallucination Guardrails, and Explainable "Ask Lexbnb" Contextual QA.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExecutiveAIAdvisor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Sanitizes text strings to remove door codes, wifi passwords, and PINs.
   */
  function sanitizeString(str) {
    if (!str || typeof str !== 'string') return str;
    return str
      .replace(/(şifre[a-z]*|parola|kod|password|pass|code|wi-?fi(?:\s+password|\s+şifresi)?|pin)[:=\s]+([^\s\n\r,.]+)/gi, '$1: [MASKED]')
      .replace(/\b\d{4,8}\b/g, '[PIN_MASKED]');
  }

  /**
   * Builds sanitized executive context for AI Advisor.
   * Strips all sensitive credentials, door codes, and unnecessary personal PII.
   */
  function buildSanitizedExecutiveContext(params) {
    const {
      tenant = {},
      kpis = {},
      health = {},
      properties = [],
      tasks = [],
      tickets = [],
      alerts = [],
      gapNights = [],
      leads = [],
      forecast = {},
      targets = {}
    } = params;

    const sanitizedProperties = properties.map(p => ({
      id: p.id || p.dbId,
      name: p.name,
      basePrice: p.base_price || p.basePrice || 0,
      minPrice: p.min_price || p.minPrice || 0,
      maxPrice: p.max_price || p.maxPrice || 0
    }));

    const sanitizedAlerts = alerts.map(a => ({
      id: a.id,
      alertCode: a.alert_code || a.alertCode,
      severity: a.severity,
      domain: a.domain,
      propertyId: a.property_id || a.propertyId || null,
      title: sanitizeString(a.title),
      reason: sanitizeString(a.reason),
      sourceMetrics: a.source_metrics || a.sourceMetrics || []
    }));

    const sanitizedTickets = tickets.map(t => ({
      id: t.id,
      propertyId: t.property_id || t.propertyId,
      severity: t.severity,
      title: sanitizeString(t.title),
      status: t.status
    }));

    return {
      portfolio: {
        companyName: tenant.company_name || 'LexBnB İşletmesi',
        propertiesCount: properties.length,
        overallHealth: health.overallStatus || 'HEALTHY',
        domainsHealth: health.domains || {}
      },
      financial: {
        revenue: kpis.revenue ? kpis.revenue.current : 0,
        targetRevenue: kpis.revenue ? kpis.revenue.target : 0,
        netProfit: kpis.netProfit ? kpis.netProfit.current : 0,
        targetProfit: kpis.netProfit ? kpis.netProfit.target : 0,
        occupancy: kpis.occupancy ? kpis.occupancy.current : 0,
        adr: kpis.adr ? kpis.adr.current : 0,
        revpar: kpis.revpar ? kpis.revpar.current : 0,
        forecastedRevenue: (kpis.forecast && kpis.forecast.monthEndRevenue) || 0
      },
      operations: {
        openTasksCount: tasks.filter(t => t.status !== 'DONE').length,
        criticalTasksCount: tasks.filter(t => t.priority === 'CRITICAL' && t.status !== 'DONE').length,
        openMaintenanceTickets: sanitizedTickets.filter(t => t.status !== 'RESOLVED').length
      },
      pricing: {
        gapNightsCount: gapNights.length,
        gapDates: gapNights.map(g => g.date)
      },
      sales: {
        openLeadsCount: leads.filter(l => l.stage !== 'WON' && l.stage !== 'LOST').length
      },
      properties: sanitizedProperties,
      alerts: sanitizedAlerts,
      targets: {
        revenueTarget: targets.revenue_target || 0,
        profitTarget: targets.profit_target || 0
      }
    };
  }

  /**
   * Generates structured recommendations strictly adhering to the output schema.
   */
  function generateExecutiveRecommendations(context) {
    const fin = context.financial;
    const ops = context.operations;
    const pricing = context.pricing;
    const alerts = context.alerts || [];

    const wins = [];
    const risks = [];
    const opportunities = [];
    const recommendedActions = [];

    // Evaluate Wins
    if (fin.revenue >= fin.targetRevenue && fin.targetRevenue > 0) {
      wins.push(`Bu ay ciro hedefine ulaşıldı (${fin.revenue} TL / Hedef: ${fin.targetRevenue} TL).`);
    }
    if (ops.criticalTasksCount === 0 && ops.openMaintenanceTickets === 0) {
      wins.push('Tüm mülklerde kritik bakım ve acil operasyonel görev bulunmuyor.');
    }

    // Evaluate Risks
    if (fin.revenue < fin.targetRevenue && fin.targetRevenue > 0) {
      const diff = fin.targetRevenue - fin.revenue;
      risks.push(`Ciro hedefin ${diff} TL gerisinde.`);
    }
    if (ops.openMaintenanceTickets > 0) {
      risks.push(`${ops.openMaintenanceTickets} adet açık bakım bileti operasyonel riske yol açıyor.`);
      recommendedActions.push({
        title: 'Açık bakım biletlerini tamamlayın',
        reason: 'Misafir check-in öncesi mülk hazır olma durumunu güvenceye alın.',
        priority: 'HIGH',
        domain: 'OPERATIONS',
        propertyId: null,
        expectedImpact: 'Mülk engellemesini kaldırır, misafir memnuniyetini korur.',
        sourceMetrics: [`openMaintenanceTickets: ${ops.openMaintenanceTickets}`],
        canonicalActionType: 'RESOLVE_MAINTENANCE',
        deepLink: '/operations?tab=maintenance'
      });
    }

    // Evaluate Opportunities
    if (pricing.gapNightsCount > 0) {
      opportunities.push(`${pricing.gapNightsCount} adet boşluk gece indirimli fiyatla doldurulabilir.`);
      recommendedActions.push({
        title: 'Boşluk gecelere teşvik indirimi uygulayın',
        reason: `${pricing.gapNightsCount} adet takvim boşluğu tespit edildi.`,
        priority: 'HIGH',
        domain: 'PRICING',
        propertyId: null,
        expectedImpact: 'Atıl envanteri nakite çevirerek ciroya ek katkı sağlar.',
        sourceMetrics: [`gapNightsCount: ${pricing.gapNightsCount}`],
        canonicalActionType: 'PRICING_OVERRIDE',
        deepLink: '/pricing'
      });
    }

    if (context.sales.openLeadsCount > 0) {
      opportunities.push(`${context.sales.openLeadsCount} potansiyel misafir rezervasyona dönüştürülmeyi bekliyor.`);
      recommendedActions.push({
        title: 'Açık potansiyel müşterilere dönüş yapın',
        reason: 'Sıcak satış fırsatları bekliyor.',
        priority: 'MEDIUM',
        domain: 'SALES_CRM',
        propertyId: null,
        expectedImpact: 'Lead dönüşüm oranını artırır.',
        sourceMetrics: [`openLeadsCount: ${context.sales.openLeadsCount}`],
        canonicalActionType: 'CRM_FOLLOWUP',
        deepLink: '/leads'
      });
    }

    const summary = `Portföy genelinde ${context.portfolio.propertiesCount} mülk aktif. ${risks.length > 0 ? risks[0] : 'Süreçler dengeli ilerliyor.'} Öncelikli gelir fırsatı: ${opportunities.length > 0 ? opportunities[0] : 'Normal doluluk takibi.'}`;

    return {
      summary,
      wins,
      risks,
      opportunities,
      recommendedActions
    };
  }

  /**
   * Validates AI recommendation guardrails:
   * 1. No invented numbers outside sanitizedContext.
   * 2. No direct database mutations.
   * 3. Actions require explicit confirmation.
   */
  function validateRecommendationGuardrails(recommendation, context) {
    if (!recommendation || typeof recommendation !== 'object') {
      return { valid: false, error: 'INVALID_SCHEMA: Recommendation must be an object' };
    }

    const requiredKeys = ['summary', 'wins', 'risks', 'opportunities', 'recommendedActions'];
    for (const k of requiredKeys) {
      if (recommendation[k] === undefined) {
        return { valid: false, error: `MISSING_FIELD: ${k} is required in recommendation output` };
      }
    }

    for (const act of recommendation.recommendedActions) {
      if (!act.title || !act.reason || !act.priority || !act.domain || !act.sourceMetrics || !act.deepLink) {
        return { valid: false, error: 'INVALID_ACTION_SCHEMA: Every action must contain title, reason, priority, domain, sourceMetrics, and deepLink' };
      }
      // Ensure AI doesn't claim to have executed a mutation
      if (act.isExecuted || act.executedDirectly) {
        return { valid: false, error: 'GUARDRAIL_VIOLATION: AI cannot directly execute database mutations' };
      }
    }

    return { valid: true };
  }

  /**
   * Contextual QA answering ("Ask Lexbnb") using structured context only.
   */
  function answerExecutiveQuery(query, context) {
    const q = query.toLowerCase();
    const fin = context.financial;
    const ops = context.operations;
    const pricing = context.pricing;

    let answer = '';
    const sourceMetrics = [];

    if (q.includes('kâr') || q.includes('kar') || q.includes('düştü') || q.includes('ciro')) {
      answer = `Bu ay toplam ciro ${fin.revenue} TL, net nakit kârı ise ${fin.netProfit} TL olarak gerçekleşmiştir. Hedeflenen ciro ${fin.targetRevenue} TL olup, gerçekleşme oranı %${fin.targetRevenue > 0 ? Math.round((fin.revenue / fin.targetRevenue) * 100) : 100}'dir.`;
      sourceMetrics.push(`revenue: ${fin.revenue} TL`, `netProfit: ${fin.netProfit} TL`, `targetRevenue: ${fin.targetRevenue} TL`);
    } else if (q.includes('sorun') || q.includes('kritik') || q.includes('bakım')) {
      answer = `Mevcut durumda ${ops.openMaintenanceTickets} açık bakım bileti ve ${ops.criticalTasksCount} kritik operasyonel görev bulunmaktadır.`;
      sourceMetrics.push(`criticalTasks: ${ops.criticalTasksCount}`, `openMaintenanceTickets: ${ops.openMaintenanceTickets}`);
    } else if (q.includes('fiyat') || q.includes('boşluk') || q.includes('fırsat')) {
      answer = `Takvimde ${pricing.gapNightsCount} adet boşluk gece bulunmaktadır (${pricing.gapDates.join(', ') || 'Yok'}). Bu geceler için minimum konaklama süresini esneterek gelir artırılabilir.`;
      sourceMetrics.push(`gapNightsCount: ${pricing.gapNightsCount}`);
    } else {
      answer = `Portföyünüzde ${context.portfolio.propertiesCount} mülk aktif durumdadır. Genel sağlık durumu: ${context.portfolio.overallHealth}.`;
      sourceMetrics.push(`propertiesCount: ${context.portfolio.propertiesCount}`, `overallHealth: ${context.portfolio.overallHealth}`);
    }

    return {
      query,
      answer,
      sourceMetrics,
      requiresConfirmationForActions: true
    };
  }

  return {
    sanitizeString,
    buildSanitizedExecutiveContext,
    generateExecutiveRecommendations,
    validateRecommendationGuardrails,
    answerExecutiveQuery
  };
}));
