const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BusinessDate = require('./business_date');
const PricingEngine = require('./pricing_engine');
const { generateRecurringInstances } = require('./recurring_tasks_service');

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
    'recurring_tasks_service.js',
    'revenue_forecast_service.js',
    'seasonal_marketing_worker_service.js',
    'today_operations_service.js'
  ];
  files.forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.(?:slice\(0,\s*10\)|split\(['"]T['"]\)\[0\])/,
      `${file} hâlâ UTC tabanlı bugün üretiyor`);
  });
});

test('Periyodik görev kimliği İstanbul takvim gününü kullanır', () => {
  const tasks = generateRecurringInstances([{
    id: 'daily-1',
    tenant_id: 'tenant-1',
    property_id: 'property-1',
    is_active: true,
    frequency: 'DAILY',
    title: 'Günlük kontrol'
  }], new Date('2026-01-01T21:00:00.000Z'));
  assert.strictEqual(tasks[0].source_event_id, 'recur:daily-1:2026-01-02');
  assert.strictEqual(tasks[0].metadata.scheduled_date, '2026-01-02');
});

test('UTC tarih dizisi ve timestamp sözleşmeleri değişmeden kalır', () => {
  assert.deepStrictEqual(
    PricingEngine.getDatesBetween('2026-01-31', '2026-02-02'),
    ['2026-01-31', '2026-02-01']
  );
  const instant = new Date('2026-01-01T23:30:00-05:00');
  assert.strictEqual(instant.toISOString(), '2026-01-02T04:30:00.000Z');
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
