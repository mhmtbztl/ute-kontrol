// =============================================================================
// LEXBNB PHASE 17 — SEASONAL CREATIVE RECOMMENDATIONS
// Advisory only: this service never mutates channel cover placement.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./marketing_action_service'));
  else root.SeasonalMarketingService = factory(root.MarketingActionService);
}(typeof self !== 'undefined' ? self : this, function (MarketingActionService) {
  'use strict';

  const SEASONS = Object.freeze(['WINTER', 'SPRING', 'SUMMER', 'AUTUMN']);

  function parseDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const milliseconds = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
    return new Date(milliseconds);
  }

  function seasonForDate(value) {
    const date = parseDate(value);
    if (!date) throw new Error('INVALID_SEASON_DATE');
    const monthDay = ((date.getUTCMonth() + 1) * 100) + date.getUTCDate();
    if (monthDay >= 1115 || monthDay <= 315) return 'WINTER';
    if (monthDay <= 514) return 'SPRING';
    if (monthDay <= 915) return 'SUMMER';
    return 'AUTUMN';
  }

  function numericScore(candidate) {
    const score = Number(candidate.coverScore ?? candidate.cover_score);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
  }

  function numericConfidence(candidate) {
    const confidence = Number(candidate.confidence);
    return Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null;
  }

  function tags(candidate) {
    const source = candidate.seasonTags || candidate.season_tags || [];
    return Array.isArray(source) ? source.map(tag => String(tag).trim().toUpperCase()) : [];
  }

  function recommendSeasonalCover(input = {}, options = {}) {
    const season = seasonForDate(input.asOfDate);
    const minConfidence = options.minConfidence === undefined ? 0.6 : Number(options.minConfidence);
    const minScoreImprovement = options.minScoreImprovement === undefined ? 5 : Number(options.minScoreImprovement);
    if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) throw new Error('INVALID_MIN_CONFIDENCE');
    if (!Number.isFinite(minScoreImprovement) || minScoreImprovement < 0) throw new Error('INVALID_MIN_SCORE_IMPROVEMENT');

    const candidates = (input.candidates || []).map(candidate => ({
      ...candidate,
      mediaId: candidate.mediaId || candidate.media_id || candidate.id,
      coverScore: numericScore(candidate),
      confidence: numericConfidence(candidate),
      seasonTags: tags(candidate)
    })).filter(candidate => candidate.mediaId && candidate.coverScore !== null && candidate.confidence !== null);
    const eligible = candidates.filter(candidate => candidate.confidence >= minConfidence && candidate.seasonTags.includes(season));
    if (eligible.length === 0) {
      return { status: 'NO_ELIGIBLE_MEDIA', season, autoApply: false, recommendation: null };
    }
    eligible.sort((a, b) => b.coverScore - a.coverScore || b.confidence - a.confidence || String(a.mediaId).localeCompare(String(b.mediaId)));
    const best = eligible[0];
    const current = candidates.find(candidate => candidate.mediaId === input.currentCoverMediaId);
    if (best.mediaId === input.currentCoverMediaId) {
      return { status: 'CURRENT_COVER_IS_BEST', season, autoApply: false, recommendation: null };
    }
    const currentScore = current ? current.coverScore : null;
    if (currentScore !== null && best.coverScore - currentScore < minScoreImprovement) {
      return { status: 'IMPROVEMENT_TOO_SMALL', season, autoApply: false, recommendation: null };
    }
    return {
      status: 'REVIEW_RECOMMENDED',
      season,
      autoApply: false,
      causalClaim: false,
      recommendation: {
        currentCoverMediaId: input.currentCoverMediaId || null,
        proposedCoverMediaId: best.mediaId,
        currentCoverScore: currentScore,
        proposedCoverScore: best.coverScore,
        scoreImprovement: currentScore === null ? null : best.coverScore - currentScore,
        confidence: best.confidence,
        reason: `${season} sezon etiketi ve kapak uygunluk skoru insan incelemesi için yeterli.`
      }
    };
  }

  async function buildSeasonalFinding(input = {}, options = {}) {
    if (!MarketingActionService || typeof MarketingActionService.buildFindingFingerprint !== 'function') throw new Error('MARKETING_ACTION_SERVICE_REQUIRED');
    const result = recommendSeasonalCover(input, options);
    if (result.status !== 'REVIEW_RECOMMENDED') return null;
    if (!input.tenantId || !input.propertyId) throw new Error('SEASONAL_FINDING_SCOPE_REQUIRED');
    const identity = {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      channelListingId: input.channelListingId || null,
      sourceEntityId: `SEASON:${result.season}:${input.asOfDate.slice(0, 4)}`,
      sourceDomain: 'LISTING_AUDIT',
      findingCode: 'SEASONAL_COVER_REVIEW',
      metric: 'COVER_SUITABILITY_SCORE'
    };
    const recommendation = result.recommendation;
    return {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      channelListingId: input.channelListingId || null,
      findingFingerprint: await MarketingActionService.buildFindingFingerprint(identity),
      sourceDomain: 'LISTING_AUDIT',
      findingCode: 'SEASONAL_COVER_REVIEW',
      metric: 'COVER_SUITABILITY_SCORE',
      title: `${result.season} sezonu için kapak görselini inceleyin`,
      evidenceText: `Önerilen görsel ${recommendation.proposedCoverScore}/100 kapak skoruna sahip; değişiklik otomatik uygulanmaz.`,
      observation: { season: result.season, ...recommendation },
      hypotheses: ['Sezonla uyumlu görsel arama sonucunda daha anlaşılır olabilir'],
      recommendedChecks: ['Mobil küçük görseli kontrol edin', 'Fiyat ve kampanya değişikliklerini not edin'],
      recommendedAction: 'Önerilen kapağı insan gözüyle doğrulayın; uygularsanız önce/sonra ölçüm penceresi başlatın.',
      actionKind: 'DIGITAL_REVIEW',
      confidenceTier: recommendation.confidence >= 0.8 ? 'HIGH' : 'MEDIUM',
      impactScore: 5,
      urgencyScore: 4,
      revenueOpportunityAmount: null,
      currency: input.currency || 'TRY'
    };
  }

  return { SEASONS, seasonForDate, recommendSeasonalCover, buildSeasonalFinding };
}));
