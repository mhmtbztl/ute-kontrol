/**
 * LEXBNB — GERI YUKLEME MOTORU KURALLARI (CEVRIMDISI)
 *
 * Canli tur core/backup_restore_live_tests.js'tedir. Bu suit, motorun
 * dayandigi listelerin semayla uyumlu kalmasini CI'da tutar: yeni bir VIEW
 * ya da baska tabloya satir yazan yeni bir INSERT tetikleyicisi eklenirse
 * burada kirilir — yoksa geri yukleme sessizce gorunume yazmaya calisir ya
 * da (en kotusu) davet e-postasi gibi yan etkileri tekrar uretir.
 */

const fs = require('fs');
const path = require('path');
const { loadOrder, parseSpec, restoreBackup, VIEWS, SIDE_EFFECTS } = require('./restore_engine.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const SUP = path.join(__dirname, '..', 'supabase');
const sqlFiles = ['schema.sql', ...fs.readFileSync(path.join(SUP, 'migration_manifest.txt'), 'utf8').split(/\r?\n/)
  .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0])];
const allSql = sqlFiles.map(f => fs.readFileSync(path.join(SUP, f), 'utf8').replace(/--[^\n]*/g, '')).join('\n');

// 1. Goclerdeki gorunumler VIEWS listesinde
const views = [...new Set([...allSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)/gi)].map(m => m[1]))];
check(views.every(v => VIEWS.includes(v)), '1. Goclerdeki her gorunum geri yuklemede atlaniyor', `eksik: ${views.filter(v => !VIEWS.includes(v)).join(', ')}`);

// 2. Baska tabloya INSERT yapan tetikleyici fonksiyonlari SIDE_EFFECTS'te
// Tum fonksiyon govdeleri; ayni fonksiyon sonraki goclerde yeniden yazilirsa son tanim gecerli.
const fnBodies = new Map();
for (const m of allSql.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)\s*\([\s\S]*?\bAS\s+(\$\w*\$)([\s\S]*?)\2/gi)) fnBodies.set(m[1], m[3]);
const triggerFns = new Set([...allSql.matchAll(/EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+public\.(\w+)\s*\(/gi)].map(m => m[1]));

/** Fonksiyonun (ve cagirdigi fonksiyonlarin) INSERT ettigi tablolar. */
function insertTargets(fn, seen = new Set()) {
  if (seen.has(fn)) return [];
  seen.add(fn);
  const body = fnBodies.get(fn) || '';
  const direct = [...body.matchAll(/INSERT\s+INTO\s+public\.(\w+)/gi)].map(m => m[1]);
  const called = [...body.matchAll(/public\.(\w+)\s*\(/gi)].map(m => m[1]).filter(c => c !== fn && fnBodies.has(c));
  return direct.concat(...called.map(c => insertTargets(c, seen)));
}
const yazanlar = {};
for (const fn of triggerFns) for (const hedef of insertTargets(fn)) (yazanlar[hedef] = yazanlar[hedef] || new Set()).add(fn);
const denetim = ['audit_logs', 'operations_audit_logs', 'rate_change_logs', 'pricing_events', 'message_delivery_logs']; // yedekte zaten var, ayni kimlikle yazilir
const eksik = Object.keys(yazanlar).filter(t => !SIDE_EFFECTS.includes(t) && !denetim.includes(t));
check(eksik.length === 0, '2. Tetikleyicilerin satir yazdigi her tablo SIDE_EFFECTS listesinde',
  eksik.map(t => `${t} <- ${[...yazanlar[t]].join(',')}`).join(' | '));
check(SIDE_EFFECTS.every(t => yazanlar[t]), '3. SIDE_EFFECTS listesinde gercekte tetikleyicisi olmayan tablo yok',
  SIDE_EFFECTS.filter(t => !yazanlar[t]).join(', '));

// 4. Yukleme sirasi
const spec = { definitions: {
  tenants: { properties: { id: { description: '<pk/>' } } },
  properties: { properties: { id: { description: '<pk/>' }, tenant_id: { description: "<fk table='tenants' column='id'/>" } } },
  bookings: { properties: { id: { description: '<pk/>' }, property_id: { description: "<fk table='properties' column='id'/>" } } },
  monthly_financial_closes: { properties: { id: { description: '<pk/>' }, tenant_id: { description: "<fk table='tenants' column='id'/>" } } },
  channel_performance_rates: { properties: { id: { description: '<pk/>' } } }
} };
const order = loadOrder(parseSpec(spec));
check(order.indexOf('tenants') < order.indexOf('properties') && order.indexOf('properties') < order.indexOf('bookings'),
  '4. Ebeveyn tablolar cocuklardan once yuklenir', order.join(' > '));
check(order[order.length - 1] === 'monthly_financial_closes', '5. Ay kapanislari EN SON (kapali donem korumasi)', order.join(' > '));
check(!order.includes('channel_performance_rates'), '6. Gorunum yukleme sirasinda yok', order.join(' > '));

// 7-8. Guvenlik kapilari
(async () => {
  const bozuk = rel => rel === 'manifest.json' ? { format: 'lexbnb-backup/1', errors: ['TABLE_READ_FAILED x'] } : null;
  let e1 = null; try { await restoreBackup({ client: {}, spec, readJson: bozuk, startedAt: new Date() }); } catch (e) { e1 = e; }
  check(!!e1 && /BACKUP_INCOMPLETE/.test(e1.message), '7. Hatali alinmis yedek geri YUKLENMEZ', e1 ? e1.message : 'yuklendi');
  const iyi = rel => rel === 'manifest.json' ? { format: 'lexbnb-backup/1', errors: [] } : [];
  let e2 = null; try { await restoreBackup({ client: { auth: { admin: {} } }, spec, readJson: iyi }); } catch (e) { e2 = e; }
  check(!!e2 && /STARTED_AT_REQUIRED/.test(e2.message), '8. Sunucu saati verilmeden yan etki temizligi yapilmaz', e2 ? e2.message : 'hata yok');

  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run_restore.js'), 'utf8');
  check(/isProductionTarget\(url\)/.test(script) && /RESTORE_GUARD: uretime TUM yedek yuklenemez/.test(script) && /--confirm-production/.test(script),
    '9. Uretime tum yedek yuklenemez; tek isletme icin referans onayi sart', 'koruma yok');

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
})();
