const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('./seasonal_marketing_service');

let total = 0;
let passed = 0;
function test(name, fn) {
  total += 1;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') return result.then(() => { passed += 1; console.log(`[PASS] ${name}`); });
    passed += 1; console.log(`[PASS] ${name}`); return Promise.resolve();
  } catch (error) { console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); return Promise.reject(error); }
}

(async () => {
  await test('Season boundaries follow the explicit Turkey-oriented calendar', () => {
    assert.strictEqual(service.seasonForDate('2026-03-15'), 'WINTER');
    assert.strictEqual(service.seasonForDate('2026-03-16'), 'SPRING');
    assert.strictEqual(service.seasonForDate('2026-05-15'), 'SUMMER');
    assert.strictEqual(service.seasonForDate('2026-09-16'), 'AUTUMN');
    assert.strictEqual(service.seasonForDate('2026-11-15'), 'WINTER');
  });

  await test('Invalid calendar dates are rejected', () => {
    assert.throws(() => service.seasonForDate('2026-02-30'), /INVALID_SEASON_DATE/);
  });

  const input = {
    asOfDate: '2026-12-01', currentCoverMediaId: 'current',
    candidates: [
      { id: 'current', seasonTags: ['ALL_SEASON'], coverScore: 70, confidence: 0.9 },
      { id: 'winter', seasonTags: ['WINTER'], coverScore: 88, confidence: 0.85 }
    ]
  };

  await test('A stronger seasonal image creates review advice but never auto-applies', () => {
    const result = service.recommendSeasonalCover(input);
    assert.strictEqual(result.status, 'REVIEW_RECOMMENDED');
    assert.strictEqual(result.autoApply, false);
    assert.strictEqual(result.recommendation.proposedCoverMediaId, 'winter');
  });

  await test('Low-confidence candidates do not trigger advice', () => {
    const result = service.recommendSeasonalCover({ ...input, candidates: [{ id: 'winter', seasonTags: ['WINTER'], coverScore: 95, confidence: 0.4 }] });
    assert.strictEqual(result.status, 'NO_ELIGIBLE_MEDIA');
  });

  await test('Tiny score differences do not create noisy recommendations', () => {
    const result = service.recommendSeasonalCover({ ...input, candidates: [
      { id: 'current', seasonTags: ['ALL_SEASON'], coverScore: 85, confidence: 0.9 },
      { id: 'winter', seasonTags: ['WINTER'], coverScore: 88, confidence: 0.9 }
    ] });
    assert.strictEqual(result.status, 'IMPROVEMENT_TOO_SMALL');
  });

  await test('Seasonal advice becomes a digital review finding, not a physical task', async () => {
    const finding = await service.buildSeasonalFinding({ ...input, tenantId: 'T1', propertyId: 'P1', channelListingId: 'L1' });
    assert.strictEqual(finding.actionKind, 'DIGITAL_REVIEW');
    assert.match(finding.findingFingerprint, /^[0-9a-f]{64}$/);
    assert.match(finding.recommendedAction, /önce\/sonra ölçüm/i);
  });

  await test('No recommendation means no finding', async () => {
    const finding = await service.buildSeasonalFinding({ ...input, currentCoverMediaId: 'winter', tenantId: 'T1', propertyId: 'P1' });
    assert.strictEqual(finding, null);
  });

  await test('Season tags are constrained without an automatic cover trigger', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase17_seasonal_media.sql'), 'utf8');
    assert.match(sql, /season_tags <@ ARRAY\['ALL_SEASON', 'WINTER', 'SPRING', 'SUMMER', 'AUTUMN'\]/i);
    assert.doesNotMatch(sql, /CREATE TRIGGER/i);
  });

  console.log(`\nTEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  if (passed !== total) process.exit(1);
})().catch(() => process.exit(1));
