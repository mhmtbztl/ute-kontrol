// =============================================================================
// LEXBNB PHASE 17 — PROVIDER-NEUTRAL PHOTO INTELLIGENCE CONTRACT
// Cache planning, structured-result validation and evidence-safe gallery gaps.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('crypto'), require('./marketing_action_service'));
  } else {
    root.PhotoIntelligenceService = factory(root.crypto, root.MarketingActionService);
  }
}(typeof self !== 'undefined' ? self : this, function (CryptoProvider, MarketingActionService) {
  'use strict';

  const ANALYSIS_SCHEMA_VERSION = 'photo-analysis-v1';
  const IMPROVEMENT_TYPES = Object.freeze(['NONE', 'EDITABLE', 'RESHOOT']);
  const ROOM_CATEGORIES = Object.freeze([
    'EXTERIOR', 'LIVING_ROOM', 'BEDROOM', 'BATHROOM', 'KITCHEN',
    'DINING', 'POOL', 'SPA', 'VIEW_TERRACE', 'AMENITY', 'OTHER'
  ]);
  const SAFE_EDIT_OPERATIONS = Object.freeze([
    'EXPOSURE', 'WHITE_BALANCE', 'STRAIGHTEN', 'CROP',
    'PERSPECTIVE_CORRECTION', 'MINOR_CLUTTER_REMOVAL',
    'NOISE_REDUCTION', 'SHARPEN'
  ]);
  const COVERAGE_RULES = Object.freeze([
    { propertyKeys: ['sauna'], coverageKey: 'SAUNA', categories: ['SPA', 'AMENITY'], label: 'Sauna' },
    { propertyKeys: ['jacuzzi', 'hot_tub'], coverageKey: 'JACUZZI', categories: ['SPA'], label: 'Jakuzi' },
    { propertyKeys: ['pool', 'swimming_pool'], coverageKey: 'POOL', categories: ['POOL'], label: 'Havuz' },
    { propertyKeys: ['fireplace'], coverageKey: 'FIREPLACE', categories: ['LIVING_ROOM', 'AMENITY'], label: 'Şömine' },
    { propertyKeys: ['terrace', 'balcony'], coverageKey: 'TERRACE', categories: ['VIEW_TERRACE'], label: 'Teras/Balkon' }
  ]);

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonical(value[key]);
      return result;
    }, {});
  }

  async function sha256(value) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') {
      return CryptoProvider.createHash('sha256').update(value, 'utf8').digest('hex');
    }
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  function requireHash(value, name) {
    if (!/^[0-9a-f]{64}$/.test(String(value || ''))) throw new Error(`INVALID_${name}`);
  }

  async function buildAnalysisCacheKey(input = {}) {
    requireHash(input.contentSha256, 'CONTENT_SHA256');
    requireHash(input.propertyContextHash, 'PROPERTY_CONTEXT_HASH');
    if (!input.promptVersion || !input.schemaVersion) throw new Error('ANALYSIS_VERSION_REQUIRED');
    return sha256(JSON.stringify(canonical({
      contentSha256: input.contentSha256,
      promptVersion: String(input.promptVersion),
      schemaVersion: String(input.schemaVersion),
      propertyContextHash: input.propertyContextHash
    })));
  }

  function ageDays(timestamp, now) {
    const created = Date.parse(timestamp);
    const current = Date.parse(now);
    if (!Number.isFinite(created) || !Number.isFinite(current) || created > current) return null;
    return (current - created) / 86400000;
  }

  async function planIncrementalAnalysis(input = {}) {
    const media = Array.isArray(input.media) ? input.media : [];
    const cachedItems = Array.isArray(input.cachedItems) ? input.cachedItems : [];
    const now = input.now;
    if (!Number.isFinite(Date.parse(now))) throw new Error('VALID_NOW_REQUIRED');
    const ttlDays = Number.isFinite(Number(input.cacheTtlDays)) ? Number(input.cacheTtlDays) : 30;
    if (ttlDays < 0) throw new Error('INVALID_CACHE_TTL');

    const seen = new Set();
    const cached = [];
    const fresh = [];
    for (const item of media) {
      const mediaId = item.id || item.mediaId || item.media_id;
      const contentSha256 = item.contentSha256 || item.content_sha256;
      if (!mediaId || seen.has(mediaId)) throw new Error('MISSING_OR_DUPLICATE_MEDIA_ID');
      seen.add(mediaId);
      const cacheKey = await buildAnalysisCacheKey({
        contentSha256,
        propertyContextHash: input.propertyContextHash,
        promptVersion: input.promptVersion,
        schemaVersion: input.schemaVersion
      });
      const hit = cachedItems.find(candidate => {
        const candidateKey = candidate.cacheKey || candidate.cache_key;
        const candidateStatus = String(candidate.status || '').toUpperCase();
        const candidateAge = ageDays(candidate.createdAt || candidate.created_at, now);
        const candidatePayload = candidate.resultPayload ?? candidate.result_payload;
        return candidateKey === cacheKey
          && ['CACHED', 'SUCCEEDED'].includes(candidateStatus)
          && isPlainObject(candidatePayload)
          && candidateAge !== null && candidateAge <= ttlDays;
      });
      const planned = { mediaId, cacheKey, contentSha256 };
      if (hit) cached.push({ ...planned, resultPayload: hit.resultPayload ?? hit.result_payload, sourceItemId: hit.id || null });
      else fresh.push(planned);
    }
    return {
      totalCount: media.length,
      cachedCount: cached.length,
      freshCount: fresh.length,
      allCached: media.length > 0 && fresh.length === 0,
      cached,
      fresh
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function validateScore(value, path, errors, max = 100) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max) errors.push(`${path}:OUT_OF_RANGE`);
  }

  function validateStringArray(value, path, errors) {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) errors.push(`${path}:STRING_ARRAY_REQUIRED`);
  }

  function validateAnalysisResult(payload = {}, context = {}) {
    const errors = [];
    const expected = new Set(context.expectedMediaIds || []);
    if (!isPlainObject(payload)) return { valid: false, errors: ['PAYLOAD:OBJECT_REQUIRED'] };
    if (payload.schemaVersion !== ANALYSIS_SCHEMA_VERSION) errors.push('schemaVersion:MISMATCH');
    if (!payload.runId || (context.runId && payload.runId !== context.runId)) errors.push('runId:MISMATCH_OR_MISSING');
    if (!payload.propertyId || (context.propertyId && payload.propertyId !== context.propertyId)) errors.push('propertyId:MISMATCH_OR_MISSING');
    validateScore(payload.overallGalleryScore, 'overallGalleryScore', errors);
    validateScore(payload.confidence, 'confidence', errors, 1);

    if (!isPlainObject(payload.coverAnalysis)) errors.push('coverAnalysis:OBJECT_REQUIRED');
    else {
      if (!payload.coverAnalysis.currentCoverMediaId) errors.push('coverAnalysis.currentCoverMediaId:REQUIRED');
      else if (expected.size > 0 && !expected.has(payload.coverAnalysis.currentCoverMediaId)) errors.push('coverAnalysis.currentCoverMediaId:OUT_OF_SCOPE');
      validateScore(payload.coverAnalysis.currentCoverScore, 'coverAnalysis.currentCoverScore', errors);
      if (!Array.isArray(payload.coverAnalysis.bestCoverCandidates)) errors.push('coverAnalysis.bestCoverCandidates:ARRAY_REQUIRED');
      else payload.coverAnalysis.bestCoverCandidates.forEach((candidate, index) => {
        if (!candidate || !candidate.mediaId || typeof candidate.reason !== 'string') errors.push(`coverAnalysis.bestCoverCandidates[${index}]:INVALID`);
        else if (expected.size > 0 && !expected.has(candidate.mediaId)) errors.push(`coverAnalysis.bestCoverCandidates[${index}].mediaId:OUT_OF_SCOPE`);
        validateScore(candidate && candidate.score, `coverAnalysis.bestCoverCandidates[${index}].score`, errors);
      });
    }

    const evaluations = payload.photoEvaluations;
    if (!Array.isArray(evaluations) || evaluations.length === 0) errors.push('photoEvaluations:NONEMPTY_ARRAY_REQUIRED');
    else {
      const seen = new Set();
      evaluations.forEach((item, index) => {
        const path = `photoEvaluations[${index}]`;
        if (!isPlainObject(item) || !item.mediaId || seen.has(item.mediaId)) errors.push(`${path}:MISSING_OR_DUPLICATE_MEDIA_ID`);
        else seen.add(item.mediaId);
        if (!ROOM_CATEGORIES.includes(item.roomCategory)) errors.push(`${path}.roomCategory:INVALID`);
        validateScore(item.technicalScore, `${path}.technicalScore`, errors);
        validateScore(item.commercialScore, `${path}.commercialScore`, errors);
        if (!IMPROVEMENT_TYPES.includes(item.improvementType)) errors.push(`${path}.improvementType:INVALID`);
        validateStringArray(item.issuesDetected || [], `${path}.issuesDetected`, errors);
        validateStringArray(item.actionableRecommendations || [], `${path}.actionableRecommendations`, errors);
        if (!Array.isArray(item.editOperations) || item.editOperations.some(op => !SAFE_EDIT_OPERATIONS.includes(op))) errors.push(`${path}.editOperations:UNSAFE_OR_INVALID`);
        if (!Array.isArray(item.observedFeatures)) errors.push(`${path}.observedFeatures:ARRAY_REQUIRED`);
      });
      if (expected.size > 0 && (seen.size !== expected.size || [...seen].some(id => !expected.has(id)))) errors.push('photoEvaluations:MEDIA_SET_MISMATCH');
    }

    if (!Array.isArray(payload.missingCoverage)) errors.push('missingCoverage:ARRAY_REQUIRED');
    else payload.missingCoverage.forEach((gap, index) => {
      if (!isPlainObject(gap) || !gap.coverageKey || typeof gap.explanation !== 'string') errors.push(`missingCoverage[${index}]:INVALID`);
      validateScore(gap && gap.confidence, `missingCoverage[${index}].confidence`, errors, 1);
    });
    if (!Array.isArray(payload.recommendedStoryOrder)) errors.push('recommendedStoryOrder:ARRAY_REQUIRED');
    else {
      const storyMedia = new Set();
      const storyIndexes = new Set();
      payload.recommendedStoryOrder.forEach((entry, index) => {
        if (!isPlainObject(entry) || !entry.mediaId || !Number.isInteger(entry.suggestedIndex) || entry.suggestedIndex < 1 || typeof entry.roleInStory !== 'string') {
          errors.push(`recommendedStoryOrder[${index}]:INVALID`);
          return;
        }
        if (storyMedia.has(entry.mediaId) || storyIndexes.has(entry.suggestedIndex)) errors.push(`recommendedStoryOrder[${index}]:DUPLICATE`);
        if (expected.size > 0 && !expected.has(entry.mediaId)) errors.push(`recommendedStoryOrder[${index}].mediaId:OUT_OF_SCOPE`);
        storyMedia.add(entry.mediaId);
        storyIndexes.add(entry.suggestedIndex);
      });
    }
    if (!isPlainObject(payload.trustAssessment) || payload.trustAssessment.fabricationSuggested !== false) {
      errors.push('trustAssessment:FABRICATION_MUST_BE_FALSE');
    } else {
      validateStringArray(payload.trustAssessment.uncertainClaims || [], 'trustAssessment.uncertainClaims', errors);
    }
    return { valid: errors.length === 0, errors };
  }

  function normalizedAmenities(property = {}) {
    const source = property.amenities;
    if (Array.isArray(source)) return new Set(source.map(value => String(value).trim().toLowerCase()));
    if (isPlainObject(source)) return new Set(Object.keys(source).filter(key => source[key]).map(key => key.toLowerCase()));
    return new Set();
  }

  function detectCoverageGaps(property = {}, evaluations = []) {
    const amenities = normalizedAmenities(property);
    const observed = evaluations.map(item => ({
      category: item.roomCategory,
      features: new Set((item.observedFeatures || []).map(value => String(value).trim().toUpperCase()))
    }));
    const gaps = [];
    COVERAGE_RULES.forEach(rule => {
      if (!rule.propertyKeys.some(key => amenities.has(key))) return;
      const covered = observed.some(item => item.features.has(rule.coverageKey) || rule.categories.includes(item.category));
      if (!covered) gaps.push({
        code: 'DECLARED_AMENITY_NOT_OBSERVED_IN_GALLERY',
        coverageKey: rule.coverageKey,
        label: rule.label,
        confidenceTier: 'LOW',
        causalClaim: false,
        recommendedCheck: `${rule.label} görsel kapsamasını insan gözüyle doğrulayın.`
      });
    });
    return gaps;
  }

  function confidenceTier(value) {
    const confidence = Number(value);
    if (confidence >= 0.8) return 'HIGH';
    if (confidence >= 0.5) return 'MEDIUM';
    return 'LOW';
  }

  async function buildPhotoFindingDrafts(input = {}) {
    if (!MarketingActionService || typeof MarketingActionService.buildFindingFingerprint !== 'function') {
      throw new Error('MARKETING_ACTION_SERVICE_REQUIRED');
    }
    const tenantId = input.tenantId;
    const propertyId = input.propertyId;
    const analysis = input.analysis || {};
    if (!tenantId || !propertyId || !input.runId) throw new Error('PHOTO_FINDING_SCOPE_REQUIRED');
    const validation = validateAnalysisResult(analysis, {
      runId: input.runId,
      propertyId,
      expectedMediaIds: input.expectedMediaIds || (analysis.photoEvaluations || []).map(item => item.mediaId)
    });
    if (!validation.valid) throw new Error(`INVALID_PHOTO_ANALYSIS_RESULT: ${validation.errors.join(',')}`);

    const drafts = [];
    for (const item of analysis.photoEvaluations) {
      if (item.improvementType === 'NONE') continue;
      const reshoot = item.improvementType === 'RESHOOT';
      const findingCode = reshoot ? 'PHOTO_RESHOOT_REQUIRED' : 'PHOTO_EDIT_RECOMMENDED';
      const identity = {
        tenantId, propertyId, channelListingId: input.channelListingId || null,
        sourceEntityId: item.mediaId, sourceDomain: 'PHOTO_ANALYSIS', findingCode,
        metric: 'PHOTO_COMMERCIAL_SCORE'
      };
      drafts.push({
        tenantId,
        propertyId,
        channelListingId: input.channelListingId || null,
        findingFingerprint: await MarketingActionService.buildFindingFingerprint(identity),
        sourceDomain: 'PHOTO_ANALYSIS',
        findingCode,
        metric: 'PHOTO_COMMERCIAL_SCORE',
        title: reshoot ? 'Fotoğrafın yeniden çekimini değerlendirin' : 'Fotoğraf düzenlemesini değerlendirin',
        evidenceText: `Fotoğraf ${item.mediaId}: ticari skor ${item.commercialScore}/100; bu bir AI gözlemidir.`,
        observation: { runId: input.runId, mediaId: item.mediaId, technicalScore: item.technicalScore, commercialScore: item.commercialScore, issuesDetected: item.issuesDetected },
        hypotheses: [],
        recommendedChecks: ['Öneriyi insan gözüyle doğrulayın', 'İlanın gerçek mekânı doğru yansıttığını kontrol edin'],
        recommendedAction: item.actionableRecommendations.join(' '),
        actionKind: reshoot ? 'RESHOOT' : 'CONTENT_UPDATE',
        confidenceTier: confidenceTier(analysis.confidence),
        impactScore: Math.max(1, Math.min(10, Math.round((100 - Number(item.commercialScore)) / 10))),
        urgencyScore: 4,
        revenueOpportunityAmount: null,
        currency: input.currency || 'TRY'
      });
    }

    const coverageGaps = detectCoverageGaps(input.property || {}, analysis.photoEvaluations);
    for (const gap of coverageGaps) {
      const identity = {
        tenantId, propertyId, channelListingId: input.channelListingId || null,
        sourceEntityId: gap.coverageKey, sourceDomain: 'PHOTO_ANALYSIS',
        findingCode: 'GALLERY_COVERAGE_CHECK', metric: 'PHOTO_COVERAGE'
      };
      drafts.push({
        tenantId,
        propertyId,
        channelListingId: input.channelListingId || null,
        findingFingerprint: await MarketingActionService.buildFindingFingerprint(identity),
        sourceDomain: 'PHOTO_ANALYSIS',
        findingCode: 'GALLERY_COVERAGE_CHECK',
        metric: 'PHOTO_COVERAGE',
        title: `${gap.label} görsel kapsamını doğrulayın`,
        evidenceText: `${gap.label}, mülk olanaklarında kayıtlı ancak analiz edilen galeride doğrulanamadı.`,
        observation: { runId: input.runId, coverageKey: gap.coverageKey },
        hypotheses: ['Olanak galeride olmayabilir', 'Fotoğraf farklı bir kategoriyle etiketlenmiş olabilir'],
        recommendedChecks: [gap.recommendedCheck],
        recommendedAction: gap.recommendedCheck,
        actionKind: 'DIGITAL_REVIEW',
        confidenceTier: 'LOW',
        impactScore: 4,
        urgencyScore: 3,
        revenueOpportunityAmount: null,
        currency: input.currency || 'TRY'
      });
    }
    return drafts;
  }

  return {
    ANALYSIS_SCHEMA_VERSION,
    IMPROVEMENT_TYPES,
    ROOM_CATEGORIES,
    SAFE_EDIT_OPERATIONS,
    buildAnalysisCacheKey,
    planIncrementalAnalysis,
    validateAnalysisResult,
    detectCoverageGaps,
    buildPhotoFindingDrafts
  };
}));
