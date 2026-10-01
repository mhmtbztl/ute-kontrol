const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (error) { console.error(`  ❌ ${name}`); throw error; }
}

console.log('\n🧪 A4 Fiyatlandırma UI testleri');

test('30 günlük öneri ve hedef ciro aynı doğrulanmış fiyat çıktısını kullanır', () => {
  const result = App.buildPricingWorkspace({
    property: { id: 'p1', basePrice: 12000, floorPrice: 10000 },
    bookings: [],
    blocks: [],
    rules: {},
    specialDays: [],
    occupancyTarget: null,
    today: '2026-10-05',
    target: 300000,
    soldRevenue: 0,
    expectedOccupancy: 0.55,
    focus: 'BALANCED'
  });

  assert.strictEqual(result.suggestions.days.length, 30);
  assert.strictEqual(result.target.status, 'OK');
  assert(result.target.openNightsTotal > 0);
  assert(result.target.table.length > 0);
  assert(result.suggestions.days.filter(day => day.status === 'OPEN').every(day => day.price >= 10000));
});

test('baz fiyat bilinmiyorsa öneri ve hedef hesabı rakam uydurmaz', () => {
  const result = App.buildPricingWorkspace({
    property: { id: 'p1', basePrice: null, floorPrice: null },
    bookings: [], blocks: [], rules: {}, specialDays: [],
    today: '2026-10-05', target: 300000, soldRevenue: 0
  });
  assert(result.suggestions.days.every(day => day.price === null));
  assert.strictEqual(result.target.status, 'INPUT_MISSING');
  assert.strictEqual(result.target.reason.code, 'PRICES_MISSING');
});

test('tarayıcı fiyat motorlarını app.js öncesinde yükler ve hedef kontrollerini sunar', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appIndex = html.indexOf('<script src="app.js');
  assert(html.indexOf('core/suggested_price_engine.js') > 0 && html.indexOf('core/suggested_price_engine.js') < appIndex);
  assert(html.indexOf('core/target_revenue_calculator.js') > 0 && html.indexOf('core/target_revenue_calculator.js') < appIndex);
  assert(html.indexOf('core/tr_special_days.js') > 0 && html.indexOf('core/tr_special_days.js') < appIndex);
  assert(html.indexOf('core/pricing_research_service.js') > 0 && html.indexOf('core/pricing_research_service.js') < appIndex);
  assert.match(html, /id="pricingPropertySelect"/);
  assert.match(html, /id="pricingTargetInput"/);
  assert.match(html, /id="pricingTargetResult"/);
  assert.match(html, /id="pricingRuleKey"/);
  assert.match(html, /id="pricingResearchUrl"/);
  assert.match(html, /id="pricingChatGptQuestion"/);
  assert.match(html, /id="pricingPhase78Status"/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), /Göç bekleniyor: phase78 ve phase80/);
});

console.log('✅ A4 Fiyatlandırma UI testleri tamamlandı.');
