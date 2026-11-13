const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BusinessDate = require('./business_date');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}: ${error.message}`);
  }
}

test('İstanbul iş günü UTC gece sınırında doğru güne geçer', () => {
  assert.strictEqual(BusinessDate.DEFAULT_BUSINESS_TIME_ZONE, 'Europe/Istanbul');
  assert.strictEqual(BusinessDate.getBusinessDate('2026-01-01T20:59:59.999Z'), '2026-01-01');
  assert.strictEqual(BusinessDate.getBusinessDate('2026-01-01T21:00:00.000Z'), '2026-01-02');
});

test('Açıkça verilen farklı saat dilimi aynı kanonik yardımcıdan çözülür', () => {
  assert.strictEqual(BusinessDate.getBusinessDate('2026-01-01T23:30:00.000Z', 'America/New_York'), '2026-01-01');
  assert.throws(() => BusinessDate.getBusinessDate('invalid-date'), /VALID_DATE_REQUIRED/);
});

test('İş günü kullanan servisler UTC ISO gün varsayımı üretmez', () => {
  const files = [
    'guest_crm_engine.js',
    'marketing_economics_worker_service.js',
    'marketing_experiment_worker_service.js',
    'marketing_funnel_worker_service.js',
    'marketing_ui.js',
    'seasonal_marketing_worker_service.js',
  ];
  files.forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.(?:slice\(0,\s*10\)|split\(['"]T['"]\)\[0\])/,
      `${file} hâlâ UTC tabanlı bugün üretiyor`);
  });
});


console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
