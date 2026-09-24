const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = require('../app.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const constStart = source.indexOf(`const ${name}`);
  const actualStart = start >= 0 ? start : constStart;
  const end = source.indexOf(nextName ? `function ${nextName}` : '\nfunction ', actualStart + 1);
  return actualStart >= 0 ? source.slice(actualStart, end >= 0 ? end : source.length) : '';
}

test('Yönetici snapshot önbelleği veri değişince geçersizleşir ve hata sonrası yeniden denenebilir', () => {
  assert.strictEqual(typeof app.invalidateExecutiveSnapshotCache, 'function');
  assert.strictEqual(typeof app.shouldRefreshExecutiveSnapshot, 'function');
  assert.strictEqual(app.shouldRefreshExecutiveSnapshot({ key: 'k', status: 'error', retryAt: 50 }, 'k', 49), false);
  assert.strictEqual(app.shouldRefreshExecutiveSnapshot({ key: 'k', status: 'error', retryAt: 50 }, 'k', 50), true);
  assert.match(functionSource('saveAppData', 'isUUID'), /invalidateExecutiveSnapshotCache\(\)/);
});

test('Realtime temizlik olayı sınırsız tablo sorgusu yapmaz', () => {
  const subscribe = functionSource('subscribeTenantRealtime', 'loadOperationalTasks');
  assert.doesNotMatch(subscribe, /from\(['"]cleaning_tasks['"]\)[\s\S]*select\(['"]\*['"]\)/);
  assert.match(subscribe, /applyTenantRealtimePayload\(table, payload\)/);
});

test('Misafir iletişim izinleri açık rıza yokken varsayılan kapalıdır', () => {
  const mapped = app.mapGuestFromDb({ id: 'g1', first_name: 'Ada' });
  assert.strictEqual(mapped.allowEmail, false);
  assert.strictEqual(mapped.allowSms, false);
  assert.strictEqual(mapped.allowWhatsapp, false);
  const payload = app.mapGuestToDb({ firstName: 'Ada' });
  assert.strictEqual(payload.allow_email, false);
  assert.strictEqual(payload.allow_sms, false);
  assert.strictEqual(payload.allow_whatsapp, false);
  ['guestAllowWhatsapp', 'guestAllowSms', 'guestAllowEmail'].forEach(id => {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["'][^>]*\\schecked(?:\\s|>)`, 'i'));
  });
});

test('Görünen yapı sürümü varlık damgasından gelir ve eski PIN vaadi yoktur', () => {
  assert.doesNotMatch(source, /5\.5\.2-20260907/);
  assert.doesNotMatch(source, /Yetkili PIN şifreniz korunacaktır/);
  assert.match(source, /getCurrentAppBuildVersion/);
});

test('Test kancaları klasik script üretim globaline fonksiyon bildirimiyle sızmaz', () => {
  assert.doesNotMatch(source, /function\s+setAppData\s*\(/);
  assert.doesNotMatch(source, /function\s+setSupabaseClient\s*\(/);
  assert.doesNotMatch(source, /window\.(setAppData|setSupabaseClient|setActiveTenantForTests)/);
});

test('Talep dönüşümü kanal, komisyon ve temizlik alanlarını korur', () => {
  assert.strictEqual(typeof app.buildLeadConversionOptions, 'function');
  assert.deepStrictEqual(app.buildLeadConversionOptions({
    channel: 'AIRBNB', otaCommission: 1200, cleaningFee: 900, discount: 100
  }, { grossAmount: 10000 }), {
    grossAmount: 10000,
    channel: 'AIRBNB',
    otaCommission: 1200,
    cleaningFee: 900,
    discount: 100
  });
});

test('Bakım ve aylık hedef kaydetme bağlantı hatalarını kullanıcıya bildirir', () => {
  const maint = functionSource('saveMaint', 'editMaint');
  const goals = functionSource('saveMonthlyGoals', 'openImportModal');
  assert(maint.indexOf('try {') < maint.indexOf("requireCloudForWrite('Bakım kaydı'"));
  assert.match(maint, /catch \(err\)[\s\S]*Bakım kaydı kaydedilemedi/);
  assert(goals.indexOf('try {') < goals.indexOf('await saveMonthlyTarget'));
  assert.match(goals, /catch \(err\)[\s\S]*Hedef kaydedilemedi/);
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed > 0) process.exit(1);
