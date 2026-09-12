// =============================================================================
// LEXBNB PHASE 17 — PHOTO ANALYSIS JOB LIFECYCLE
// Request deduplication and deterministic worker-state transitions.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotoAnalysisJobService = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ACTIVE = new Set(['QUEUED', 'PROCESSING']);
  const TERMINAL = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED']);

  function validTime(value, name) {
    const parsed = Date.parse(value || '');
    if (!Number.isFinite(parsed)) throw new Error(`INVALID_${name}`);
    return parsed;
  }

  function sameIdentity(run, request) {
    return (run.propertyContextHash || run.property_context_hash) === request.propertyContextHash
      && (run.promptVersion || run.prompt_version) === request.promptVersion
      && (run.schemaVersion || run.schema_version) === request.schemaVersion;
  }

  function decideAnalysisRequest(input = {}, options = {}) {
    const request = input.request || {};
    if (!request.propertyContextHash || !request.promptVersion || !request.schemaVersion) throw new Error('ANALYSIS_REQUEST_IDENTITY_REQUIRED');
    const now = validTime(input.now, 'NOW');
    const cooldownMinutes = options.cooldownMinutes === undefined ? 5 : Number(options.cooldownMinutes);
    if (!Number.isFinite(cooldownMinutes) || cooldownMinutes < 0) throw new Error('INVALID_COOLDOWN');
    const activeRun = input.activeRun || null;
    if (activeRun && ACTIVE.has(String(activeRun.status || '').toUpperCase())) {
      return sameIdentity(activeRun, request)
        ? { decision: 'RETURN_ACTIVE', runId: activeRun.id, create: false }
        : { decision: 'BLOCK_DIFFERENT_ACTIVE_CONTEXT', runId: activeRun.id, create: false };
    }
    const recent = input.recentCompletedRun || null;
    if (recent && ['SUCCEEDED', 'PARTIAL'].includes(String(recent.status || '').toUpperCase()) && sameIdentity(recent, request)) {
      const completed = validTime(recent.completedAt || recent.completed_at, 'COMPLETED_AT');
      if (completed <= now && (now - completed) <= cooldownMinutes * 60000) {
        return { decision: 'REUSE_RECENT', runId: recent.id, create: false };
      }
    }
    return { decision: 'CREATE_RUN', runId: null, create: true };
  }

  function summarizeAnalysisItems(expectedCount, items = []) {
    if (!Number.isInteger(expectedCount) || expectedCount < 1) throw new Error('INVALID_EXPECTED_ITEM_COUNT');
    if (!Array.isArray(items)) throw new Error('ANALYSIS_ITEMS_ARRAY_REQUIRED');
    const ids = new Set();
    const counts = { cached: 0, succeeded: 0, failed: 0 };
    items.forEach(item => {
      const id = item.mediaId || item.media_id;
      const status = String(item.status || '').toUpperCase();
      if (!id || ids.has(id)) throw new Error('MISSING_OR_DUPLICATE_ANALYSIS_MEDIA');
      if (!['CACHED', 'SUCCEEDED', 'FAILED'].includes(status)) throw new Error('INVALID_ANALYSIS_ITEM_STATUS');
      ids.add(id);
      counts[status.toLowerCase()] += 1;
    });
    if (items.length !== expectedCount) return { complete: false, status: 'PROCESSING', ...counts, processedCount: items.length, expectedCount };
    const successful = counts.cached + counts.succeeded;
    const status = counts.failed === 0 ? 'SUCCEEDED' : successful === 0 ? 'FAILED' : 'PARTIAL';
    return { complete: true, status, ...counts, processedCount: items.length, expectedCount };
  }

  function transitionAnalysisRun(run = {}, event, context = {}) {
    const status = String(run.status || '').toUpperCase();
    const action = String(event || '').toUpperCase();
    const now = context.now || new Date().toISOString();
    validTime(now, 'NOW');
    if (TERMINAL.has(status)) throw new Error(`TERMINAL_ANALYSIS_RUN: ${status}`);
    const next = { ...run };
    if (action === 'START' && status === 'QUEUED') {
      next.status = 'PROCESSING';
      next.startedAt = now;
    } else if (action === 'CANCEL' && ACTIVE.has(status)) {
      next.status = 'CANCELLED';
      next.completedAt = now;
    } else if (action === 'FINISH' && status === 'PROCESSING') {
      const summary = summarizeAnalysisItems(context.expectedCount, context.items);
      if (!summary.complete) throw new Error('ANALYSIS_ITEMS_INCOMPLETE');
      next.status = summary.status;
      next.cachedItemCount = summary.cached;
      next.analyzedItemCount = summary.succeeded + summary.failed;
      next.completedAt = now;
      if (summary.status === 'FAILED' && !context.errorCode) throw new Error('FAILED_ANALYSIS_ERROR_REQUIRED');
      next.errorCode = summary.status === 'FAILED' ? context.errorCode : null;
    } else {
      throw new Error(`INVALID_ANALYSIS_TRANSITION: ${status}->${action}`);
    }
    return next;
  }

  return { decideAnalysisRequest, summarizeAnalysisItems, transitionAnalysisRun };
}));
