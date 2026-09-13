// LEXBNB PHASE 17 — PROVIDER-NEUTRAL PHOTO ANALYSIS WORKER
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./photo_intelligence_service'),
      require('./marketing_photo_analysis_service')
    );
  } else {
    root.PhotoAnalysisWorkerService = factory(root.PhotoIntelligenceService, root.MarketingPhotoAnalysisService);
  }
}(typeof self !== 'undefined' ? self : this, function (PhotoService, RequestService) {
  'use strict';

  function field(source, camel, snake) {
    return source && (source[camel] !== undefined ? source[camel] : source[snake]);
  }

  function errorCode(error) {
    const raw = String(error && (error.code || (error.name && error.name !== 'Error' ? error.name : null) || error.message) || 'PHOTO_ANALYSIS_FAILED');
    return raw.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 100) || 'PHOTO_ANALYSIS_FAILED';
  }

  function assertDependencies(repository, provider) {
    const repositoryMethods = ['claimRun', 'loadProperty', 'loadActiveMedia', 'loadAnalysisImage', 'loadCachedItems', 'findAggregateCache', 'completeRun', 'failRun', 'persistFinding'];
    repositoryMethods.forEach(name => {
      if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`);
    });
    if (!provider || typeof provider.analyze !== 'function') throw new Error('PHOTO_ANALYSIS_PROVIDER_REQUIRED');
  }

  function completionItems(plan, payload, aggregateCacheHit = false) {
    const cachedIds = new Set(plan.cached.map(item => item.mediaId));
    const planned = new Map([...plan.cached, ...plan.fresh].map(item => [item.mediaId, item]));
    return payload.photoEvaluations.map(evaluation => ({
      mediaId: evaluation.mediaId,
      status: aggregateCacheHit || cachedIds.has(evaluation.mediaId) ? 'CACHED' : 'SUCCEEDED',
      cacheKey: planned.get(evaluation.mediaId).cacheKey,
      resultPayload: evaluation,
      confidence: payload.confidence,
      errorCode: null
    }));
  }

  async function persistFindings(repository, run, property, payload) {
    const drafts = await PhotoService.buildPhotoFindingDrafts({
      tenantId: field(run, 'tenantId', 'tenant_id'),
      propertyId: field(run, 'propertyId', 'property_id'),
      runId: run.id,
      property,
      analysis: payload,
      expectedMediaIds: payload.photoEvaluations.map(item => item.mediaId)
    });
    const persisted = [];
    const errors = [];
    for (const draft of drafts) {
      try { persisted.push(await repository.persistFinding(draft)); }
      catch (error) { errors.push({ findingFingerprint: draft.findingFingerprint, code: errorCode(error) }); }
    }
    return { draftCount: drafts.length, persisted, errors };
  }

  async function runNextAnalysis(repository, provider, options = {}) {
    assertDependencies(repository, provider);
    const run = await repository.claimRun(options.runId || null);
    if (!run) return { status: 'IDLE', runId: null };
    let completed = false;
    try {
      const tenantId = field(run, 'tenantId', 'tenant_id');
      const propertyId = field(run, 'propertyId', 'property_id');
      const propertyContextHash = field(run, 'propertyContextHash', 'property_context_hash');
      const promptVersion = field(run, 'promptVersion', 'prompt_version');
      const schemaVersion = field(run, 'schemaVersion', 'schema_version');
      const leaseToken = field(run, 'leaseToken', 'lease_token');
      if (!leaseToken) throw new Error('WORKER_LEASE_TOKEN_REQUIRED');
      const [property, media] = await Promise.all([
        repository.loadProperty(tenantId, propertyId),
        repository.loadActiveMedia(tenantId, propertyId)
      ]);
      if (!property) throw new Error('ANALYSIS_PROPERTY_NOT_FOUND');
      const rebuilt = await RequestService.buildPropertyContext({ propertyId, property, media });
      if (rebuilt.propertyContextHash !== propertyContextHash) throw new Error('PROPERTY_CONTEXT_CHANGED');
      const now = options.now || new Date().toISOString();
      const emptyPlan = await PhotoService.planIncrementalAnalysis({
        media, cachedItems: [], now, propertyContextHash, promptVersion, schemaVersion
      });
      const cacheKeys = emptyPlan.fresh.map(item => item.cacheKey);
      const cachedItems = await repository.loadCachedItems(tenantId, cacheKeys, now);
      const plan = await PhotoService.planIncrementalAnalysis({
        media, cachedItems, now, propertyContextHash, promptVersion, schemaVersion
      });
      const expectedMediaIds = media.map(item => item.id);
      const aggregate = await repository.findAggregateCache({
        tenantId, propertyId, propertyContextHash, promptVersion, schemaVersion, now
      });

      let providerResult;
      let payload;
      if (aggregate && aggregate.resultPayload) {
        payload = { ...aggregate.resultPayload, runId: run.id, propertyId, schemaVersion };
        providerResult = {
          provider: aggregate.provider || 'CACHE', modelVersion: aggregate.modelVersion || aggregate.model_version || 'cached',
          requestId: null, usageMetadata: { cacheReuse: true, sourceRunId: aggregate.id }
        };
      } else {
        const mediaById = new Map(media.map(item => [item.id, item]));
        const freshMedia = [];
        for (const planned of plan.fresh) {
          freshMedia.push({ ...planned, ...(await repository.loadAnalysisImage(mediaById.get(planned.mediaId))) });
        }
        providerResult = await provider.analyze({
          run: { ...run, tenantId, propertyId, propertyContextHash, promptVersion, schemaVersion },
          property,
          media,
          freshMedia,
          cachedEvaluations: plan.cached.map(item => item.resultPayload),
          schemaVersion
        });
        payload = providerResult && providerResult.payload;
        if (payload && Array.isArray(payload.photoEvaluations) && plan.cached.length) {
          const returned = new Map(payload.photoEvaluations.map(item => [item.mediaId, item]));
          plan.cached.forEach(item => returned.set(item.mediaId, item.resultPayload));
          payload = { ...payload, photoEvaluations: media.map(item => returned.get(item.id)).filter(Boolean) };
        }
      }

      const validation = PhotoService.validateAnalysisResult(payload, { runId: run.id, propertyId, expectedMediaIds });
      if (!validation.valid) throw new Error(`INVALID_PROVIDER_RESULT:${validation.errors.join(',')}`);
      const items = completionItems(plan, payload, Boolean(aggregate));
      const completion = await repository.completeRun({
        runId: run.id,
        leaseToken,
        provider: providerResult.provider,
        modelVersion: providerResult.modelVersion,
        providerRequestId: providerResult.requestId || null,
        usageMetadata: providerResult.usageMetadata || {},
        resultPayload: payload,
        items
      });
      completed = true;
      const findings = await persistFindings(repository, run, property, payload);
      return { status: 'SUCCEEDED', runId: run.id, plan, completion, findings, aggregateCacheHit: Boolean(aggregate) };
    } catch (error) {
      if (!completed) {
        try { await repository.failRun(run.id, field(run, 'leaseToken', 'lease_token'), errorCode(error), String(error && error.message || error).slice(0, 2000)); }
        catch (failureError) {
          return { status: 'FAILED_UNRECORDED', runId: run.id, errorCode: errorCode(error), failureRecordError: errorCode(failureError) };
        }
      }
      return { status: completed ? 'SUCCEEDED_WITH_FINDING_ERRORS' : 'FAILED', runId: run.id, errorCode: errorCode(error) };
    }
  }

  return { errorCode, completionItems, runNextAnalysis };
}));
