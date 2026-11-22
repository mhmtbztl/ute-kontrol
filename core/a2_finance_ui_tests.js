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

// Sadelik (21.11.2026): Finans her rakami bir kez gosterir. Hedef ciro karti,
// kar koprusu, donem ozeti, aylik gelisim (Analiz'de) ve kart gorunumu kalkti.
test('Finans kopya bölümleri yok: hedef kartı, kâr köprüsü, dönem özeti, aylık gelişim, kart görünümü', () => {
  ['finTargetRevenue', 'targetBarFill', 'brCiro', 'periodSummaryContent', 'financeMonthlyDisclosure',
    'monthlyKpiTableBody', 'propCardsContainer', 'propViewCardsBtn', 'stepperCurrentLabel', 'ledgerExportMenu']
    .forEach(id => assert.doesNotMatch(html, new RegExp(`id="${id}"`), id));
  assert.doesNotMatch(html, /AI FİNANS ANALİSTİ|Stratejik durum/i);
});

test('Gelirler, giderler ve mülk tablosu duruyor; giderler açılır bölümde', () => {
  assert.match(html, /<details[^>]+id="financeExpensesDisclosure"/);
  assert.match(html, /<details[^>]+id="financeIncomeDisclosure"/);
  assert.match(html, /id="propExecTableBody"/);
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


console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
