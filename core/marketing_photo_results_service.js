// LEXBNB PHASE 17 — SAFE PHOTO ANALYSIS RESULT VIEW ADAPTER
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarketingPhotoResultsService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function field(source, camel, snake) {
    return source && (source[camel] !== undefined ? source[camel] : source[snake]);
  }

  function timestamp(value) {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function latestSucceededRun(runs = [], propertyId) {
    return runs.filter(run => String(run.status || '').toUpperCase() === 'SUCCEEDED'
      && (!propertyId || field(run, 'propertyId', 'property_id') === propertyId))
      .sort((a, b) => timestamp(field(b, 'completedAt', 'completed_at')) - timestamp(field(a, 'completedAt', 'completed_at')))[0] || null;
  }

  function score(value, max = 100) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
  }

  function unavailable(reason, run = null) {
    return { available: false, reason, runId: run && run.id || null };
  }

  function buildPhotoResultView(input = {}) {
    const run = input.run || latestSucceededRun(input.runs || [], input.propertyId);
    if (!run) return unavailable('NO_SUCCEEDED_ANALYSIS');
    if (!field(run, 'resultSchemaValidatedAt', 'result_schema_validated_at')) return unavailable('RESULT_NOT_SCHEMA_VALIDATED', run);
    const payload = field(run, 'resultPayload', 'result_payload');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return unavailable('RESULT_PAYLOAD_MISSING', run);
    if (payload.schemaVersion !== 'photo-analysis-v1' || payload.runId !== run.id) return unavailable('RESULT_IDENTITY_MISMATCH', run);
    const propertyId = field(run, 'propertyId', 'property_id');
    if (!propertyId || payload.propertyId !== propertyId || (input.propertyId && propertyId !== input.propertyId)) return unavailable('RESULT_PROPERTY_MISMATCH', run);
    const galleryScore = score(payload.overallGalleryScore);
    const confidence = score(payload.confidence, 1);
    if (galleryScore === null || confidence === null || !payload.trustAssessment || payload.trustAssessment.fabricationSuggested !== false) {
      return unavailable('RESULT_TRUST_VALIDATION_FAILED', run);
    }
    const activeMediaIds = new Set((input.media || []).filter(item => field(item, 'propertyId', 'property_id') === propertyId
      && String(field(item, 'mediaStatus', 'media_status') || '').toUpperCase() === 'ACTIVE').map(item => item.id));
    const evaluations = Array.isArray(payload.photoEvaluations) ? payload.photoEvaluations : [];
    const evaluationIds = new Set(evaluations.map(item => item && item.mediaId));
    if (!activeMediaIds.size || evaluationIds.size !== activeMediaIds.size || [...evaluationIds].some(id => !activeMediaIds.has(id))) {
      return unavailable('GALLERY_CHANGED_SINCE_ANALYSIS', run);
    }
    const cover = payload.coverAnalysis || {};
    const candidates = Array.isArray(cover.bestCoverCandidates) ? cover.bestCoverCandidates.filter(item => item
      && activeMediaIds.has(item.mediaId) && score(item.score) !== null && typeof item.reason === 'string') : [];
    const recommendations = evaluations.filter(item => ['EDITABLE', 'RESHOOT'].includes(item.improvementType)
      && score(item.technicalScore) !== null && score(item.commercialScore) !== null)
      .map(item => ({
        mediaId: item.mediaId,
        roomCategory: item.roomCategory,
        technicalScore: Number(item.technicalScore),
        commercialScore: Number(item.commercialScore),
        improvementType: item.improvementType,
        recommendations: Array.isArray(item.actionableRecommendations) ? item.actionableRecommendations.filter(value => typeof value === 'string' && value.trim()) : []
      }));
    return {
      available: true,
      runId: run.id,
      completedAt: field(run, 'completedAt', 'completed_at') || null,
      galleryScore,
      confidencePercent: Math.round(confidence * 100),
      currentCover: cover.currentCoverMediaId && activeMediaIds.has(cover.currentCoverMediaId)
        ? { mediaId: cover.currentCoverMediaId, score: score(cover.currentCoverScore) } : null,
      coverCandidates: candidates,
      recommendations,
      missingCoverage: Array.isArray(payload.missingCoverage) ? payload.missingCoverage.filter(item => item && typeof item.explanation === 'string') : [],
      storyOrder: Array.isArray(payload.recommendedStoryOrder) ? payload.recommendedStoryOrder.filter(item => item && activeMediaIds.has(item.mediaId)) : [],
      uncertainClaims: Array.isArray(payload.trustAssessment.uncertainClaims) ? payload.trustAssessment.uncertainClaims.filter(value => typeof value === 'string') : []
    };
  }

  return { latestSucceededRun, buildPhotoResultView };
}));
