const assert = require('assert');
const Service = require('./marketing_review_service');

let totalTests = 0;
let passedTests = 0;
async function runTest(name, fn) {
  totalTests += 1;
  try { await fn(); passedTests += 1; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}`); console.error(`       ${error.stack || error.message}`); }
}

const FINDING_ID = '11111111-1111-4111-8111-111111111111';

(async () => {
  await runTest('Only the four backend review actions are accepted', () => {
    assert.strictEqual(Service.validateReview({ findingId: FINDING_ID, action: 'acknowledge' }).action, 'ACKNOWLEDGE');
    assert.throws(() => Service.validateReview({ findingId: FINDING_ID, action: 'DELETE' }), /INVALID_REVIEW_ACTION/);
  });

  await runTest('Dismissal requires a non-empty reason', () => {
    assert.throws(() => Service.validateReview({ findingId: FINDING_ID, action: 'DISMISS', reason: ' ' }), /DISMISS_REASON_REQUIRED/);
  });

  await runTest('Task acceptance is blocked for digital findings before RPC', () => {
    assert.throws(() => Service.validateReview({ findingId: FINDING_ID, action: 'ACCEPT_TASK', finding: { action_kind: 'PRICE_REVIEW' } }), /NON_PHYSICAL/);
  });

  await runTest('Physical task acceptance calls only the guarded backend RPC', async () => {
    const calls = [];
    const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { taskId: 'T1' }, error: null }; } };
    const result = await Service.reviewFinding(client, { findingId: FINDING_ID, action: 'ACCEPT_TASK', finding: { action_kind: 'RESHOOT' } });
    assert.deepStrictEqual(result, { taskId: 'T1' });
    assert.deepStrictEqual(calls, [{ name: 'review_marketing_finding', args: { p_finding_id: FINDING_ID, p_action: 'ACCEPT_TASK', p_reason: null } }]);
  });

  await runTest('Backend authorization errors are preserved', async () => {
    const denied = Object.assign(new Error('UNAUTHORIZED_MARKETING_REVIEW'), { code: '42501' });
    const client = { rpc: async () => ({ data: null, error: denied }) };
    await assert.rejects(() => Service.reviewFinding(client, { findingId: FINDING_ID, action: 'RESOLVE' }), error => error === denied);
  });

  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
