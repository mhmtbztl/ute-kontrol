const assert = require('assert');
const App = require('../app.js');
const ExecutiveAIAdvisor = require('./executive_ai_advisor.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

const elements = {
  aiAdvisorPromptInput: { value: '' },
  aiAdvisorOutputBox: { style: { display: 'none' } },
  aiAdvisorResponseContent: { innerHTML: '' }
};

const originalSetTimeout = global.setTimeout;
global.setTimeout = callback => {
  callback();
  return 1;
};
global.document = { getElementById: id => elements[id] || null };
global.ExecutiveAIAdvisor = ExecutiveAIAdvisor;

App.setCurrentFilter({ period: 'ALL', villa: 'ALL' });
App.setActiveTenant({ id: '11111111-1111-4111-8111-111111111111', name: 'Sahil Konaklari' });
App.setAppData({
  bookings: [],
  expenses: [],
  villas: {},
  operationalTasks: [],
  maintenanceTickets: [],
  leads: [],
  targets: {}
});

test('Lexbnb advisor runs the real UI binding and replaces the loading state', () => {
  assert.doesNotThrow(() => App.askExecutiveAdvisor('Genel durum nedir?'));
  assert.strictEqual(elements.aiAdvisorOutputBox.style.display, 'block');
  assert.ok(elements.aiAdvisorResponseContent.innerHTML.includes('Danışman Analizi'));
  assert.ok(!elements.aiAdvisorResponseContent.innerHTML.includes('Analiz ediliyor'));
});

test('Advisor failures replace the loading state with a visible error', () => {
  global.ExecutiveAIAdvisor = {
    ...ExecutiveAIAdvisor,
    answerExecutiveQuery() {
      throw new Error('test failure');
    }
  };

  assert.doesNotThrow(() => App.askExecutiveAdvisor('Ciro nedir?'));
  assert.match(elements.aiAdvisorResponseContent.innerHTML, /yanıt.*oluşturulamadı|tekrar deneyin/i);
  assert.ok(!elements.aiAdvisorResponseContent.innerHTML.includes('Analiz ediliyor'));
});

global.setTimeout = originalSetTimeout;
delete global.document;
delete global.ExecutiveAIAdvisor;
App.setActiveTenant(null);

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
