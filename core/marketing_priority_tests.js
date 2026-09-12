const assert = require('assert');
const { scoreMarketingFinding, selectTopMarketingActions } = require('./marketing_priority_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try { fn(); passed += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

function finding(id, overrides = {}) {
  return {
    id,
    findingFingerprint: `fp-${id}`,
    status: 'OPEN',
    actionKind: 'DIGITAL_REVIEW',
    impactScore: 7,
    confidenceTier: 'HIGH',
    urgencyScore: 6,
    revenueOpportunityAmount: 0,
    lastSeenAt: '2026-09-12T10:00:00Z',
    ...overrides
  };
}

test('Zero revenue opportunity remains finite and deterministic', () => {
  const result = scoreMarketingFinding(finding('1'));
  assert(Number.isFinite(result.score));
  assert.strictEqual(result.priority, undefined);
  assert.strictEqual(result.factors.revenueMultiplier, 1);
});

test('Revenue opportunity increases priority without logarithm singularities', () => {
  const zero = scoreMarketingFinding(finding('1')).score;
  const positive = scoreMarketingFinding(finding('2', { revenueOpportunityAmount: 10000 })).score;
  assert(positive > zero);
});

test('Effort lowers otherwise identical action priority', () => {
  const easy = scoreMarketingFinding(finding('1', { effortScore: 1 })).score;
  const hard = scoreMarketingFinding(finding('2', { effortScore: 5 })).score;
  assert(easy > hard);
});

test('Action kinds supply conservative default effort', () => {
  const digital = scoreMarketingFinding(finding('1', { actionKind: 'DIGITAL_REVIEW' }));
  const reshoot = scoreMarketingFinding(finding('2', { actionKind: 'RESHOOT' }));
  assert.strictEqual(digital.factors.effort, 1);
  assert.strictEqual(reshoot.factors.effort, 4);
});

test('Invalid numeric factors fail loudly', () => {
  assert.throws(() => scoreMarketingFinding(finding('1', { impactScore: 11 })), /INVALID_IMPACT/);
  assert.throws(() => scoreMarketingFinding(finding('1', { confidenceScore: 2 })), /INVALID_CONFIDENCE/);
  assert.throws(() => scoreMarketingFinding(finding('1', { effortScore: 0 })), /INVALID_EFFORT/);
});

test('Selection returns at most three real actions without filler', () => {
  const result = selectTopMarketingActions([finding('1'), finding('2'), finding('3'), finding('4')]);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(selectTopMarketingActions([finding('1')]).length, 1);
});

test('Terminal and KEEP findings never appear in action selection', () => {
  const result = selectTopMarketingActions([
    finding('open'), finding('resolved', { status: 'RESOLVED' }), finding('keep', { actionKind: 'KEEP' })
  ]);
  assert.deepStrictEqual(result.map(item => item.id), ['open']);
});

test('Duplicate fingerprints select the most recently observed record', () => {
  const old = finding('old', { findingFingerprint: 'same', lastSeenAt: '2026-09-10T00:00:00Z' });
  const recent = finding('recent', { findingFingerprint: 'same', lastSeenAt: '2026-09-12T00:00:00Z' });
  assert.deepStrictEqual(selectTopMarketingActions([old, recent]).map(item => item.id), ['recent']);
});

test('Ties are deterministic by urgency, recency and id', () => {
  const result = selectTopMarketingActions([
    finding('b', { urgencyScore: 5 }), finding('c', { urgencyScore: 7 }), finding('a', { urgencyScore: 5 })
  ]);
  assert.strictEqual(result[0].id, 'c');
  assert.deepStrictEqual(result.slice(1).map(item => item.id), ['a', 'b']);
});

console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
if (passed !== total) process.exit(1);
