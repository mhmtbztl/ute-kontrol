const assert = require('assert');
const fs = require('fs');
const path = require('path');
const App = require('../app.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { failed++; console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`); }
}

test('Finans hedef ilerlemesi üst hedef kartındadır; ayrı hedef analizi bölümü yoktur', () => {
  assert.doesNotMatch(html, /CİRO HEDEFİ ANALİZİ/);
  assert.match(html, /id="finTargetRevenue"[\s\S]{0,1200}id="targetBarFill"/);
});

test('Giderler ve aylık gelişim iki açılır bölümde sadeleşir', () => {
  assert.match(html, /<details[^>]+id="financeExpensesDisclosure"/);
  assert.match(html, /<details[^>]+id="financeMonthlyDisclosure"/);
  assert.doesNotMatch(html, /MÜLK KARŞILAŞTIRMA VE STRATEJİK ANOMALİ TESPİTİ/);
});

test('Dönem özeti kendini AI diye tanıtmaz ve kural bazlı olduğunu söyler', () => {
  assert.doesNotMatch(html, /AI FİNANS ANALİSTİ/i);
  assert.match(html, /DÖNEM ÖZETİ/);
  assert.match(html, /Kural bazlı/);
});

test('Önceki ay gider kopyaları seçili aya taşınır ve kaynak ayı notta korunur', () => {
  assert.strictEqual(typeof App.buildPreviousMonthExpenseCopies, 'function');
  const rows = App.buildPreviousMonthExpenseCopies({
    targetMonth: '2026-03',
    selectedIds: ['e1'],
    expenses: [
      { id: 'e1', date: '2026-02-28', category: 'Kira', type: 'OPEX', amount: 12500, villa: 'ALL', description: 'Ofis' },
      { id: 'e2', date: '2026-02-12', category: 'Elektrik', type: 'OPEX', amount: 800 }
    ]
  });
  assert.deepStrictEqual(rows, [{
    date: '2026-03-28', category: 'Kira', type: 'OPEX', amount: 12500,
    villa: 'ALL', propertyId: null, description: 'Ofis · Kaynak dönem: 2026-02'
  }]);
});

test('Önceki ay gider kopyası hedef ayda aynı kaynak satırı zaten varsa mükerrer üretmez', () => {
  const expenses = [
    { id: 'e1', date: '2026-02-28', category: 'Kira', type: 'OPEX', amount: 12500, villa: 'ALL', description: 'Ofis' },
    { id: 'copy1', date: '2026-03-28', category: 'Kira', type: 'OPEX', amount: 12500, villa: 'ALL', description: 'Ofis · Kaynak dönem: 2026-02' }
  ];
  assert.deepStrictEqual(App.buildPreviousMonthExpenseCopies({ targetMonth: '2026-03', selectedIds: ['e1'], expenses }), []);
});

test('Gider kopyalama tek atomik çoklu yazı kullanır', () => {
  assert.match(source, /async function createExpensesBatch/);
  assert.match(source, /\.from\(['"]expenses['"]\)[\s\S]{0,500}\.insert\(payloads\)/);
  assert.doesNotMatch(source.match(/async function confirmCopyPreviousExpenses[\s\S]*?\n}/)?.[0] || '', /for\s*\([^)]*copies[^)]*\)[\s\S]*createExpense/);
});

test('Dönem özeti otomatik komisyon ve temizliği içeren ortak kategori toplamından en büyük gideri seçer', () => {
  assert.strictEqual(typeof App.getTopExpenseCategory, 'function');
  assert.deepStrictEqual(App.getTopExpenseCategory({ Elektrik: 950, Temizlik: 3000, 'Kredi Kartı / Komisyon': 4500 }), ['Kredi Kartı / Komisyon', 4500]);
});

test('Aylık gelişim gelecek boş ayları gizler ve geçen yıl cirosunu tek sütunda taşır', () => {
  assert.match(source, /previousYearCiro/);
  assert.match(source, /d\.key <= currentMonthKey/);
  assert.match(html, /GEÇEN YIL CİROSU/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
