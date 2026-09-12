// LEXBNB PHASE 17 — IMMUTABLE MARKETING HEALTH SNAPSHOT WORKER
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./marketing_health_service'), require('./marketing_health_input_service'), require('crypto'));
  } else root.MarketingHealthWorkerService = factory(root.MarketingHealthService, root.MarketingHealthInputService, root.crypto);
}(typeof self !== 'undefined' ? self : this, function (HealthService, InputService, CryptoProvider) {
  'use strict';
  const SCORING_VERSION = 'marketing-health-v1';

  async function sha256(value) {
    if (CryptoProvider && typeof CryptoProvider.createHash === 'function') return CryptoProvider.createHash('sha256').update(value).digest('hex');
    if (CryptoProvider && CryptoProvider.subtle) {
      const digest = await CryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('SHA256_UNAVAILABLE');
  }

  async function evaluateProperty(repository, scope, options = {}) {
    const asOf = options.asOf || new Date().toISOString();
    if (!Number.isFinite(Date.parse(asOf))) throw new Error('VALID_HEALTH_AS_OF_REQUIRED');
    const inputs = await repository.loadCurrentInputs(scope.tenantId, scope.propertyId, asOf);
    const assembled = InputService.buildComponents(inputs, asOf);
    if (!assembled.sourceInputIds.length) return { status: 'SKIPPED', propertyId: scope.propertyId, reason: 'NO_CURRENT_SOURCE_INPUT' };
    const result = HealthService.evaluateMarketingHealth(assembled.components, {
      minimumCoverage: options.minimumCoverage === undefined ? 0.5 : options.minimumCoverage
    });
    const inputFingerprint = await sha256(JSON.stringify({
      scoringVersion: SCORING_VERSION,
      sourceInputIds: assembled.sourceInputIds,
      minimumCoverage: options.minimumCoverage === undefined ? 0.5 : Number(options.minimumCoverage)
    }));
    const snapshotId = await repository.persistSnapshot({
      tenantId: scope.tenantId, propertyId: scope.propertyId, inputFingerprint,
      scoringVersion: SCORING_VERSION, asOf, result, sourceInputIds: assembled.sourceInputIds
    });
    return { status: 'PERSISTED', propertyId: scope.propertyId, snapshotId, healthStatus: result.status, score: result.score };
  }

  async function runHealthSnapshots(repository, options = {}) {
    ['loadCandidateProperties', 'loadCurrentInputs', 'persistSnapshot'].forEach(name => {
      if (!repository || typeof repository[name] !== 'function') throw new Error(`REPOSITORY_${name.toUpperCase()}_REQUIRED`);
    });
    const scopes = await repository.loadCandidateProperties(options.tenantId || null, options.limit || 200);
    const summary = { status: 'COMPLETED', examined: 0, persisted: 0, skipped: 0, errors: [], results: [] };
    for (const scope of scopes) {
      summary.examined += 1;
      try {
        const result = await evaluateProperty(repository, scope, options);
        summary.results.push(result);
        if (result.status === 'PERSISTED') summary.persisted += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.errors.push({ propertyId: scope.propertyId, code: String(error.code || error.message || 'HEALTH_WORKER_FAILED').slice(0, 100) });
      }
    }
    if (summary.errors.length) summary.status = summary.persisted ? 'PARTIAL' : 'FAILED';
    return summary;
  }

  return { SCORING_VERSION, sha256, evaluateProperty, runHealthSnapshots };
}));
