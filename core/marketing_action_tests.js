const assert = require('assert');
const {
  buildFindingFingerprint,
  adaptFindingToExecutiveAction,
  shouldCreateOperationalTask,
  buildOperationalTaskDraft,
  transitionFinding
} = require('./marketing_action_service');

let totalTests = 0;
let passedTests = 0;

async function runTest(name, fn) {
  totalTests += 1;
  try {
    await fn();
    passedTests += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.stack || error.message}`);
  }
}

(async () => {
  await runTest('Finding fingerprints are stable across key order', async () => {
    const a = await buildFindingFingerprint({ tenantId: 'T1', propertyId: 'P1', sourceDomain: 'FUNNEL', findingCode: 'LOW_CTR', metric: 'CTR', periodStart: '2026-09-01' });
    const b = await buildFindingFingerprint({ metric: 'CTR', findingCode: 'LOW_CTR', sourceDomain: 'FUNNEL', propertyId: 'P1', periodStart: '2026-09-01', tenantId: 'T1' });
    assert.strictEqual(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  await runTest('Different periods create different finding identities', async () => {
    const base = { tenantId: 'T1', propertyId: 'P1', sourceDomain: 'FUNNEL', findingCode: 'LOW_CTR', metric: 'CTR' };
    assert.notStrictEqual(
      await buildFindingFingerprint({ ...base, periodStart: '2026-08-01' }),
      await buildFindingFingerprint({ ...base, periodStart: '2026-09-01' })
    );
  });

  await runTest('Marketing findings enter the existing Today revenue bucket', () => {
    const action = adaptFindingToExecutiveAction({
      id: 'F1', propertyId: 'P1', title: 'CTR referansın altında', metric: 'CTR',
      evidenceText: 'CTR %4, referans %8', confidenceTier: 'HIGH', impactScore: 8
    });
    assert.strictEqual(action.domain, 'REVENUE');
    assert.strictEqual(action.category, 'REVENUE_OPPORTUNITY');
    assert.strictEqual(action.sourceDomain, 'MARKETING');
    assert.strictEqual(action.collapseKey, 'MARKETING:P1');
    assert(action.priorityScore >= 40);
  });

  await runTest('Marketing and operations actions for one property do not collapse together', () => {
    const marketing = adaptFindingToExecutiveAction({
      id: 'F2', propertyId: 'P1', title: 'Low CTR', metric: 'CTR', confidenceTier: 'HIGH'
    });
    const operations = {
      id: 'TASK1', propertyId: 'P1', title: 'Urgent cleaning', domain: 'OPERATIONS',
      category: 'OPERATIONS', priorityScore: 80
    };
    const { collapseDuplicateActions } = require('./executive_priority_service');
    const collapsed = collapseDuplicateActions([marketing, operations]);
    assert.strictEqual(collapsed.length, 2);
    assert(collapsed.some(item => item.id === 'marketing-F2'));
    assert(collapsed.some(item => item.id === 'TASK1'));
  });

  await runTest('Executive adapter emits a deterministic deep link and evidence', () => {
    const action = adaptFindingToExecutiveAction({
      id: 'finding/1', propertyId: 'P1', title: 'Gallery gap', metric: 'PHOTO_COVERAGE',
      evidenceText: 'Bathroom coverage missing', confidenceTier: 'MEDIUM'
    });
    assert.strictEqual(action.deepLink, '#marketing?findingId=finding%2F1');
    assert.strictEqual(action.reason, 'Bathroom coverage missing');
  });

  await runTest('Digital recommendations never auto-create operational tasks', () => {
    assert.strictEqual(shouldCreateOperationalTask({ status: 'OPEN', actionKind: 'CONTENT_UPDATE', acceptedForTask: true }), false);
    assert.throws(() => buildOperationalTaskDraft({ status: 'OPEN', actionKind: 'CONTENT_UPDATE', acceptedForTask: true }), /REQUIRES_ACCEPTED_PHYSICAL_ACTION/);
  });

  await runTest('Physical work requires explicit user acceptance', () => {
    assert.strictEqual(shouldCreateOperationalTask({ status: 'OPEN', actionKind: 'RESHOOT', acceptedForTask: false }), false);
    assert.strictEqual(shouldCreateOperationalTask({ status: 'ACKNOWLEDGED', actionKind: 'RESHOOT', acceptedForTask: true }), true);
  });

  await runTest('Accepted reshoot maps to a valid idempotent operations draft', () => {
    const task = buildOperationalTaskDraft({
      id: 'F-123', tenantId: 'T1', propertyId: 'P1', status: 'ACKNOWLEDGED',
      actionKind: 'RESHOOT', acceptedForTask: true, title: 'Banyo fotoğrafını yeniden çek',
      recommendedAction: 'Gündüz doğal ışıkta çekim yap.', impactScore: 8, urgencyScore: 7
    });
    assert.strictEqual(task.task_type, 'GENERAL');
    assert.strictEqual(task.task_subtype, 'MARKETING_CREATIVE');
    assert.strictEqual(task.source, 'MANUAL');
    assert.strictEqual(task.source_event_id, 'MKT:F-123');
    assert.strictEqual(task.priority, 'HIGH');
  });

  await runTest('Accept-for-task transition rejects non-physical findings', () => {
    assert.throws(() => transitionFinding({ status: 'OPEN', actionKind: 'PRICE_REVIEW' }, 'ACCEPT_FOR_TASK'), /NON_PHYSICAL/);
  });

  await runTest('Dismissal requires a reason and becomes terminal', () => {
    assert.throws(() => transitionFinding({ status: 'OPEN' }, 'DISMISS'), /REASON_REQUIRED/);
    const dismissed = transitionFinding({ status: 'OPEN' }, 'DISMISS', { actorId: 'U1', reason: 'Not relevant', now: '2026-09-12T10:00:00Z' });
    assert.strictEqual(dismissed.status, 'DISMISSED');
    assert.throws(() => transitionFinding(dismissed, 'ACKNOWLEDGE'), /TERMINAL_FINDING/);
  });

  await runTest('A rediscovered terminal finding can reopen explicitly', () => {
    const reopened = transitionFinding({ status: 'STALE', resolvedAt: 'old' }, 'REDISCOVER', { now: '2026-09-12T10:00:00Z' });
    assert.strictEqual(reopened.status, 'OPEN');
    assert.strictEqual(reopened.resolvedAt, null);
  });

  await runTest('Task completion requires a linked operations task', () => {
    assert.throws(() => transitionFinding({ status: 'ACKNOWLEDGED' }, 'TASK_COMPLETED'), /TASK_LINK_REQUIRED/);
    const resolved = transitionFinding({ status: 'ACKNOWLEDGED', operationalTaskId: 'TASK1' }, 'TASK_COMPLETED');
    assert.strictEqual(resolved.status, 'RESOLVED');
  });

  console.log(`\nTEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  if (passedTests !== totalTests) process.exit(1);
})();
