const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const actions = fs.readFileSync(path.join(__dirname, 'action_dispatch.js'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

test('hedef formunda yinelenen alan veya birlestirme isareti yoktur', () => {
  assert.doesNotMatch(html, /^(<<<<<<<|=======|>>>>>>>)/m);
  for (const id of ['goalRevenue', 'goalADR', 'goalNetProfit', 'goalMaxExpense', 'goalOccupancyNights']) {
    assert.strictEqual(html.split(`id="${id}"`).length - 1, 1, id);
  }
});

test('saf hedef motoru app.js dosyasından önce yüklenir', () => {
  const calculator = html.indexOf('core/monthly_goal_calculator.js');
  const app = html.indexOf('app.js?v=');
  assert(calculator > 0 && calculator < app);
});

test('ADR alanı gece hesabına bağlıdır ve eylem izin listesindedir', () => {
  assert.match(html, /id="goalADR"[^>]*data-oninput="autoCalculateGoalNights\(\)"/);
  assert.match(actions, /'autoCalculateGoalNights'/);
});

test('tavan gider planlama değeri olarak salt okunur ve kapasite uyarısı görünürdür', () => {
  assert.match(html, /id="goalMaxExpense"[^>]*readonly/);
  assert.match(html, /id="goalCapacityWarning"/);
  assert.match(html, /gerçekleşen muhasebe gideri değildir/i);
});

test('olay-kaynaklı bağlayıcı son elle düzenlenen ADR ve net kârı korur', () => {
  const elements = {};
  const add = (id, value = '') => {
    elements[id] = { value, textContent: '', innerText: '', style: {}, classList: { add() {}, remove() {} } };
  };
  add('goalRevenue', '100000');
  add('goalOccupancyNights', '10');
  add('goalADR', '6000');
  add('goalMarginPct', '30');
  add('goalNetProfit', '30000');
  add('goalMaxExpense', '70000');
  add('goalPeriodSelect', '2031-05');
  add('goalCalcOccLabel');
  add('goalCapacityWarning');
  add('goalNetProfitHint');
  global.document = { getElementById: id => elements[id] || null, addEventListener() {} };

  const App = require('../app.js');
  assert.strictEqual(typeof App.autoCalculateGoalNights, 'function');
  assert.strictEqual(typeof App.autoCalculateGoalSubmetrics, 'function');

  App.autoCalculateGoalNights();
  assert.strictEqual(Number(elements.goalOccupancyNights.value), 17);

  elements.goalNetProfit.value = '25000';
  App.syncGoalMarginFromProfit();
  elements.goalRevenue.value = '120000';
  App.autoCalculateGoalSubmetrics();

  assert.strictEqual(Number(elements.goalADR.value), 6000, 'elle girilen ADR korunmalı');
  assert.strictEqual(Number(elements.goalOccupancyNights.value), 20);
  assert.strictEqual(Number(elements.goalNetProfit.value), 25000, 'elle girilen net kâr korunmalı');
  assert.strictEqual(Number(elements.goalMarginPct.value), 20.83);
  assert.strictEqual(Number(elements.goalMaxExpense.value), 95000);
});

test('modal yeniden açılınca eski kayıtlı hedefler hesaplanmadan aynen yüklenir', () => {
  const elements = {};
  const add = (id, value = '') => {
    elements[id] = { value, textContent: '', innerText: '', style: {}, classList: { add() {}, remove() {} } };
  };
  ['goalRevenue', 'goalOccupancyNights', 'goalADR', 'goalMarginPct', 'goalNetProfit', 'goalMaxExpense',
    'goalCalcOccLabel', 'goalCapacityWarning', 'goalNetProfitHint', 'goalRevenueHint'].forEach(id => add(id));
  add('goalPeriodSelect', '2031-05');
  global.document = { getElementById: id => elements[id] || null, addEventListener() {} };
  const App = require('../app.js');
  assert.strictEqual(typeof App.loadSelectedPeriodGoal, 'function');
  App.setAppData({
    villas: {},
    targets: [{ year: 2031, month: 5, revenue_target: 100000, sold_nights_target: 19,
      adr_target: 6000, margin_target: 30, net_profit_target: 30000, max_expense_target: 65000 }]
  });

  App.loadSelectedPeriodGoal();

  assert.strictEqual(Number(elements.goalRevenue.value), 100000);
  assert.strictEqual(Number(elements.goalOccupancyNights.value), 19);
  assert.strictEqual(Number(elements.goalADR.value), 6000);
  assert.strictEqual(Number(elements.goalNetProfit.value), 30000);
  assert.strictEqual(Number(elements.goalMaxExpense.value), 65000, 'eski manuel tavan gider modal açılışında düzeltilmemeli');
});

test('kapasiteyi aşan hedef kullanıcıya açıklanır ve kayıt başlamadan durur', () => {
  const elements = {};
  const values = {
    goalRevenue: '100000', goalOccupancyNights: '31', goalADR: '3225.81', goalMarginPct: '30',
    goalNetProfit: '30000', goalMaxExpense: '70000', goalPeriodSelect: '2031-05'
  };
  Object.entries(values).forEach(([id, value]) => {
    elements[id] = { value, textContent: '', innerText: '', style: {}, classList: { add() {}, remove() {} } };
  });
  ['goalCalcOccLabel', 'goalCapacityWarning', 'goalNetProfitHint'].forEach(id => {
    elements[id] = { value: '', textContent: '', innerText: '', style: {}, classList: { add() {}, remove() {} } };
  });
  global.document = { getElementById: id => elements[id] || null, addEventListener() {} };
  global.FinancialMetricsService = { calculateAvailableNights: () => 30 };
  let alertMessage = '';
  global.alert = message => { alertMessage = message; };
  const App = require('../app.js');
  assert.strictEqual(typeof App.saveMonthlyGoals, 'function');

  App.saveMonthlyGoals({ preventDefault() {} });

  assert.match(alertMessage, /30 geceyi aşıyor/);
  assert.strictEqual(elements.goalCapacityWarning.style.display, 'block');
  delete global.FinancialMetricsService;
  delete global.alert;
});

console.log(`\n${passed} geçti, ${failed} başarısız`);
if (failed) process.exit(1);
