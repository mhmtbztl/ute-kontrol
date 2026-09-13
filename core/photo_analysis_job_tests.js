const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('./photo_analysis_job_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

const request = { propertyContextHash: 'a'.repeat(64), promptVersion: 'p1', schemaVersion: 's1' };

test('Identical active requests return the existing run', () => {
  const result = service.decideAnalysisRequest({ request, activeRun: { id: 'R1', status: 'QUEUED', ...request }, now: '2026-09-12T10:00:00Z' });
  assert.deepStrictEqual(result, { decision: 'RETURN_ACTIVE', runId: 'R1', create: false });
});

test('A different context cannot mix with an active property run', () => {
  const result = service.decideAnalysisRequest({ request, activeRun: { id: 'R1', status: 'PROCESSING', ...request, promptVersion: 'p2' }, now: '2026-09-12T10:00:00Z' });
  assert.strictEqual(result.decision, 'BLOCK_DIFFERENT_ACTIVE_CONTEXT');
});

test('A matching recent successful run is reused during cooldown', () => {
  const result = service.decideAnalysisRequest({
    request,
    recentCompletedRun: { id: 'R1', status: 'SUCCEEDED', ...request, completedAt: '2026-09-12T09:58:00Z' },
    now: '2026-09-12T10:00:00Z'
  });
  assert.strictEqual(result.decision, 'REUSE_RECENT');
});

test('An expired cooldown creates a new run', () => {
  const result = service.decideAnalysisRequest({
    request,
    recentCompletedRun: { id: 'R1', status: 'SUCCEEDED', ...request, completedAt: '2026-09-12T09:50:00Z' },
    now: '2026-09-12T10:00:00Z'
  });
  assert.strictEqual(result.decision, 'CREATE_RUN');
});

test('Failed or cancelled work is never reused as a cacheable run', () => {
  const result = service.decideAnalysisRequest({
    request,
    recentCompletedRun: { id: 'R1', status: 'FAILED', ...request, completedAt: '2026-09-12T09:59:00Z' },
    now: '2026-09-12T10:00:00Z'
  });
  assert.strictEqual(result.decision, 'CREATE_RUN');
});

test('Item summaries distinguish success, partial and total failure', () => {
  assert.strictEqual(service.summarizeAnalysisItems(2, [{ mediaId: '1', status: 'CACHED' }, { mediaId: '2', status: 'SUCCEEDED' }]).status, 'SUCCEEDED');
  assert.strictEqual(service.summarizeAnalysisItems(2, [{ mediaId: '1', status: 'SUCCEEDED' }, { mediaId: '2', status: 'FAILED' }]).status, 'PARTIAL');
  assert.strictEqual(service.summarizeAnalysisItems(2, [{ mediaId: '1', status: 'FAILED' }, { mediaId: '2', status: 'FAILED' }]).status, 'FAILED');
});

test('Incomplete item sets remain processing', () => {
  const result = service.summarizeAnalysisItems(2, [{ mediaId: '1', status: 'SUCCEEDED' }]);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.status, 'PROCESSING');
});

test('Queued runs start and processing runs finish deterministically', () => {
  const started = service.transitionAnalysisRun({ id: 'R1', status: 'QUEUED' }, 'START', { now: '2026-09-12T10:00:00Z' });
  const finished = service.transitionAnalysisRun(started, 'FINISH', {
    now: '2026-09-12T10:01:00Z', expectedCount: 1, items: [{ mediaId: '1', status: 'CACHED' }]
  });
  assert.strictEqual(finished.status, 'SUCCEEDED');
  assert.strictEqual(finished.cachedItemCount, 1);
});

test('Terminal runs cannot be resurrected', () => {
  assert.throws(() => service.transitionAnalysisRun({ status: 'SUCCEEDED' }, 'START'), /TERMINAL_ANALYSIS_RUN/);
});

test('Total failure requires an error code', () => {
  assert.throws(() => service.transitionAnalysisRun({ status: 'PROCESSING' }, 'FINISH', {
    expectedCount: 1, items: [{ mediaId: '1', status: 'FAILED' }], now: '2026-09-12T10:00:00Z'
  }), /ERROR_REQUIRED/);
});

test('The database RPC returns identical active or recent work instead of duplicating it', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_photo_job_idempotency.sql'), 'utf8');
  assert.match(sql, /status IN \('QUEUED', 'PROCESSING'\)[\s\S]*?FOR UPDATE/i);
  assert.match(sql, /completed_at >= NOW\(\) - INTERVAL '5 minutes'/i);
  assert.match(sql, /WHEN unique_violation THEN/i);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
