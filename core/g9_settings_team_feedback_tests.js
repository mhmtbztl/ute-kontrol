'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const actions = fs.readFileSync(path.join(ROOT, 'core', 'action_dispatch.js'), 'utf8');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

test('M30: işletme logosu kaldırılabilir ve eylem izin listesine bağlıdır', () => {
  assert.match(html, /id="businessLogoRemoveBtn"[\s\S]*Logoyu kaldır/);
  assert.match(app, /async function removeBusinessLogo\(/);
  assert(actions.includes("'removeBusinessLogo'"));
});

test('M30: logo başarısı imzalı URL doğrulanmadan ilan edilmez', () => {
  assert.match(app, /const signedUrl = await refreshBusinessLogoUrl\(true\);[\s\S]*if \(!signedUrl\)[\s\S]*return false/);
  assert.match(app, /URL\.createObjectURL\(file\)/);
});

test('M38: viewer için yazma yüzeyleri ortak rol işaretiyle gizlenir', () => {
  assert.match(html, /id="quickAddBtn"[^>]*data-write-action/);
  assert.match(html, /data-onclick="openBookingModal\(\)"[^>]*data-sales-write/);
  assert.match(app, /querySelectorAll\('\[data-write-action\]'\)[\s\S]*element\.hidden = !canWrite/);
  assert.match(app, /querySelectorAll\('\[data-sales-write\]'\)[\s\S]*element\.hidden = !canWriteSalesRole\(role\)/);
});

test('M38: rezervasyon ve talep ayrıntıları viewer için salt okunur olur', () => {
  assert.match(app, /function applyBookingFormAccess\(/);
  assert.match(app, /function applyLeadFormAccess\(/);
  assert.match(app, /applyBookingFormAccess\(editId\)/);
  assert.match(app, /applyLeadFormAccess\(editId\)/);
});

test('M31/M33: kanban kartı teklif tutarını ve yetkili silme aksiyonunu gösterir', () => {
  assert.match(app, /lead-card-quote/);
  assert.match(app, /deleteLeadUI\(decodeURIComponent/);
  assert.match(app, /canWriteSalesRole\(activeTenant\?\.role\)[\s\S]*lead-card/);
});

test('M32: kanban kartından erişilebilir durum değişikliği yapılır', () => {
  assert.match(app, /lead-status-select/);
  assert.match(app, /async function updateLeadStatusFromKanban\(/);
  assert(actions.includes("'updateLeadStatusFromKanban'"));
});

test('M35/M37: şablon türleri kullanım ekranına gider ve arşiv yaşam döngüsünü açık söyler', () => {
  assert.match(html, /Taleplerde kullan →/);
  assert.match(html, /Görevlerde kullan →/);
  assert.match(html, /Temizlikte kullan →/);
  assert.match(app, /Arşivle/);
  assert.match(app, /Yeniden etkinleştir/);
  assert.match(app, /patch\.task_type/);
  assert.match(app, /patch\.priority/);
});

test('M39: rol adları kullanıcı diliyle tekleştirilir', () => {
  assert.match(app, /owner:\s*\{ label: 'İşletme sahibi'/);
  assert.match(app, /manager:\s*\{ label: 'Operasyon yöneticisi'/);
});

console.log(`TEST SUMMARY: ${passed} / ${passed} TESTS PASSED`);
