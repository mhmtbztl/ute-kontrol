// LEXBNB PHASE 17 — BENCHMARK-BACKED CHANNEL ECONOMICS FINDINGS
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_action_service'));
  else root.MarketingEconomicsFindingService = factory(root.MarketingActionService);
}(typeof self !== 'undefined' ? self : this, function (ActionService) {
  'use strict';
  const MIN_BOOKINGS = 5;
  const field = (object, camel, snake) => object && (object[camel] !== undefined ? object[camel] : object[snake]);
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function percent(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null; }

  function diagnose(input = {}) {
    const report = input.report || {}; const benchmark = input.benchmark || {};
    const totals = report.totals || {}; const mix = report.mix || {};
    const sampleSize = Number(totals.reservationCount);
    if (!Number.isInteger(sampleSize) || sampleSize < (input.minBookings || MIN_BOOKINGS)) return { status: 'INSUFFICIENT_SAMPLE', observations: [] };
    const observations = [];
    const grossRoomRevenue = Number(totals.roomRevenueBeforeDistribution);
    const distributionCost = Number(totals.distributionCost);
    const maxCostPercent = percent(field(benchmark, 'maxDistributionCostPercent', 'max_distribution_cost_percent'));
    if (maxCostPercent !== null && grossRoomRevenue > 0 && distributionCost >= 0) {
      const observed = round(distributionCost / grossRoomRevenue * 100);
      if (observed > maxCostPercent) observations.push({
        code: 'DISTRIBUTION_COST_ABOVE_REFERENCE', metric: 'DISTRIBUTION_COST_PERCENT', observed,
        reference: maxCostPercent, sampleSize, confidenceTier: sampleSize >= 10 ? 'HIGH' : 'MEDIUM',
        revenueOpportunityAmount: round(Math.max(0, distributionCost - grossRoomRevenue * maxCostPercent / 100)),
        hypotheses: ['Kanal komisyon oranı veya kanal karması referans döneme göre daha maliyetli olabilir.'],
        recommendedChecks: ['Kanal sözleşmesindeki komisyon oranını doğrulayın.', 'Kanal bazında net oda gelirini ve toplam misafir fiyatını karşılaştırın.', 'Daha düşük maliyetli kanala geçişin dönüşüm ve doluluğa etkisini ölçün.']
      });
    }
    const directReference = percent(field(benchmark, 'minimumDirectReservationSharePercent', 'minimum_direct_reservation_share_percent'));
    const directObserved = percent(field(mix, 'directReservationSharePercent', 'direct_reservation_share_percent'));
    const reliableChannels = !report.dataQuality || report.dataQuality.status === 'OK';
    if (directReference !== null && directObserved !== null && reliableChannels && directObserved < directReference) observations.push({
      code: 'DIRECT_SHARE_BELOW_REFERENCE', metric: 'DIRECT_RESERVATION_SHARE_PERCENT', observed: directObserved,
      reference: directReference, sampleSize, confidenceTier: sampleSize >= 10 ? 'HIGH' : 'MEDIUM', revenueOpportunityAmount: null,
      hypotheses: ['Direkt rezervasyon görünürlüğü, fiyat teklifi veya tekrar misafir akışı referansın altında kalıyor olabilir.'],
      recommendedChecks: ['Direkt ve platform toplam misafir fiyatlarını aynı tarihler için karşılaştırın.', 'Web, telefon ve WhatsApp talep akışlarının dönüşümünü inceleyin.', 'Kanal sözleşmesi ve fiyat eşitliği şartlarını doğrulayın.']
    });
    return { status: observations.length ? 'FINDINGS' : 'NO_VARIANCE', observations };
  }

  async function buildFindingDraft(input = {}) {
    const observation = input.observation || {};
    const config = {
      DISTRIBUTION_COST_ABOVE_REFERENCE: { title: 'Dağıtım maliyetini inceleyin', impactScore: 8, urgencyScore: 5 },
      DIRECT_SHARE_BELOW_REFERENCE: { title: 'Direkt rezervasyon payını inceleyin', impactScore: 6, urgencyScore: 4 }
    }[observation.code];
    if (!config) throw new Error('UNSUPPORTED_ECONOMICS_OBSERVATION');
    if (!input.tenantId || !input.propertyId) throw new Error('ECONOMICS_FINDING_SCOPE_REQUIRED');
    const fingerprint = await ActionService.buildFindingFingerprint({ tenantId: input.tenantId, propertyId: input.propertyId,
      sourceDomain: 'CHANNEL_ECONOMICS', findingCode: observation.code, metric: observation.metric });
    return {
      tenantId: input.tenantId, propertyId: input.propertyId, channelListingId: null,
      findingFingerprint: fingerprint, sourceDomain: 'CHANNEL_ECONOMICS', findingCode: observation.code,
      metric: observation.metric, title: config.title,
      evidenceText: `${observation.metric}: gözlenen %${observation.observed}, referans %${observation.reference}, örneklem ${observation.sampleSize} rezervasyon. Bu bir gözlemdir; neden kanıtı değildir.`,
      observation: { ...observation, causalClaim: false }, hypotheses: observation.hypotheses,
      recommendedChecks: observation.recommendedChecks, recommendedAction: observation.recommendedChecks.join(' · '),
      actionKind: 'DIGITAL_REVIEW', confidenceTier: observation.confidenceTier,
      impactScore: config.impactScore, urgencyScore: config.urgencyScore,
      revenueOpportunityAmount: observation.revenueOpportunityAmount, currency: input.currency || 'TRY',
      evidencePeriodStart: input.periodStart, evidencePeriodEndExclusive: input.periodEndExclusive,
      expiresAt: input.expiresAt || null
    };
  }
  return { MIN_BOOKINGS, diagnose, buildFindingDraft };
}));
