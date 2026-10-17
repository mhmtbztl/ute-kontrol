'use strict';

const assert = require('assert');
const {
  normalizeChecklistTemplate,
  checklistCompletionState,
  resolveChecklistSnapshot
} = require('./operations_engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${name}\n       ${error.message}`);
  }
}

test('RC01. Zengin kontrol listesi kanonik bicimde korunur', () => {
  const raw = {
    sections: [{
      title: 'Mutfak',
      items: [{ text: 'Ocak', important: true, subChecks: ['Izgara', 'Firin'] }]
    }],
    supplies: [{ area: 'Mutfak', item: 'Cay' }]
  };
  const normalized = normalizeChecklistTemplate(raw);
  assert.strictEqual(normalized.valid, true);
  assert.strictEqual(normalized.sourceFormat, 'rich');
  assert.deepStrictEqual(normalized.checklist, raw);
  raw.sections[0].items[0].text = 'Degisti';
  assert.strictEqual(normalized.checklist.sections[0].items[0].text, 'Ocak');
});

test('RC02. Eski dizi bicimi veri kaybetmeden kanonik bolume donusur', () => {
  const normalized = normalizeChecklistTemplate([
    { id: 'a', text: 'Klima', completed: false, required: true },
    { id: 'b', text: 'Ikram', completed: true, required: false }
  ]);
  assert.strictEqual(normalized.valid, true);
  assert.strictEqual(normalized.sourceFormat, 'legacy');
  assert.deepStrictEqual(normalized.checklist.sections[0].items, [
    { id: 'a', text: 'Klima', important: true, completed: false, subChecks: [] },
    { id: 'b', text: 'Ikram', important: false, completed: true, subChecks: [] }
  ]);
});

test('RC03. Bozuk kayit sessizce bos liste sayilmaz', () => {
  const normalized = normalizeChecklistTemplate({ sections: [{ title: '', items: [] }] });
  assert.strictEqual(normalized.valid, false);
  assert(normalized.errors.length > 0);
});

test('RC04. Yalniz onemli madde ve alt kontroller tamamlanmayi engeller', () => {
  const checklist = {
    sections: [{ title: 'Giris', items: [
      { text: 'Kapi kodu', important: true, subChecks: ['Kod denendi'] },
      { text: 'Dekor kontrolu', important: false, subChecks: ['Yastiklar'] }
   ] }], supplies: []
  };
  const incomplete = checklistCompletionState(checklist, {
    's0.i0': { z: true },
    's0.i1': { z: false }
  });
  assert.strictEqual(incomplete.canComplete, false);
  assert.deepStrictEqual(incomplete.missingKeys, ['s0.i0.sub0']);

  const complete = checklistCompletionState(checklist, {
    's0.i0': { z: true },
    's0.i0.sub0': { z: true }
  });
  assert.strictEqual(complete.canComplete, true);
});

test('RC05. Portfoy ve mulk zengin sablonlari deterministik anlik goruntude birlesir', () => {
  const templates = [
    {
      id: 'general', property_id: null, task_type: 'CHECKIN_PREP', version: 2,
      items: { sections: [{ title: 'Genel', items: [{ text: 'Su', important: true, subChecks: [] }] }], supplies: [] }
    },
    {
      id: 'property', property_id: 'p1', task_type: 'CHECKIN_PREP', version: 4,
      items: { sections: [{ title: 'Villa', items: [{ text: 'Jakuzi', important: false, subChecks: [] }] }], supplies: [] }
    }
  ];
  const snapshot = resolveChecklistSnapshot('p1', 'CHECKIN_PREP', templates);
  assert.deepStrictEqual(snapshot.checklist.sections.map(section => section.title), ['Genel', 'Villa']);
  assert.strictEqual(snapshot.templateVersion, 4);
  templates[0].items.sections[0].title = 'Degisti';
  assert.strictEqual(snapshot.checklist.sections[0].title, 'Genel');
});

console.log('\n=============================================================================');
console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
console.log('=============================================================================');
if (failed > 0) process.exit(1);
