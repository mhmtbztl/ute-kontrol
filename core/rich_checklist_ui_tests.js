'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'core', 'action_dispatch.js'), 'utf8');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { failed++; console.error(`[FAIL] ${name}\n       ${error.message}`); }
}

function body(name) {
  const start = app.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, `${name} bulunamadi`);
  let depth = 0;
  for (let index = app.indexOf('{', start); index < app.length; index++) {
    if (app[index] === '{') depth++;
    if (app[index] === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} kapanmiyor`);
}

test('RCUI01. Ayarlar formu tur, mulk kapsami ve gorsel duzenleyici sunar', () => {
  assert(html.includes('id="settingsChecklistTemplateForm"'));
  assert(html.includes('name="task_type"'));
  assert(html.includes('name="property_id"'));
  assert(html.includes('id="settingsChecklistBuilder"'));
  assert(!/<textarea[^>]+name="items"/.test(html), 'teknik metin DSL alani kaldi');
});

test('RCUI02. Bolum, madde, alt kontrol ve malzeme islemleri izinli eylemlerdir', () => {
  for (const name of [
    'addChecklistBuilderSection', 'addChecklistBuilderItem', 'addChecklistBuilderSubCheck',
    'addChecklistBuilderSupply', 'removeChecklistBuilderNode', 'moveChecklistBuilderNode'
  ]) {
    assert(app.includes(`function ${name}(`), `${name} app.js icinde yok`);
    assert(actions.includes(`'${name}'`), `${name} eylem izin listesinde yok`);
  }
});

test('RCUI03. Kayit gorsel alanlardan okunur ve tur/kapsam veritabanina gider', () => {
  const create = body('createSettingsChecklistTemplate');
  assert(create.includes('readSettingsChecklistBuilder('));
  assert(create.includes('form.elements.task_type.value'));
  assert(create.includes('form.elements.property_id.value'));
  assert(!create.includes('checklistTextToItems('));
});

test('RCUI04. Duzenleme prompt yerine ayni gorsel forma yuklenir', () => {
  const edit = body('editSettingsTemplate');
  assert(edit.includes('startEditingSettingsChecklist('));
  const start = body('startEditingSettingsChecklist');
  assert(start.includes('renderSettingsChecklistBuilder('));
  assert(start.includes('settingsChecklistEditorId'));
});

test('RCUI05. Duzenleyici mobilde tek sutuna iner', () => {
  assert(/@media\s*\(max-width:\s*768px\)[\s\S]*?\.checklist-builder-item\s*\{[^}]*grid-template-columns:\s*1fr/m.test(style));
});

test('RCUI06. Personel zengin gorevi isaretler, kaydeder ve kritik eksikte bitiremez', () => {
  const render = body('renderStaffFieldWork');
  const save = body('saveMyOperationalTaskChecklist');
  assert(render.includes('renderStaffOperationalChecklist('));
  assert(app.includes('function setStaffTaskChecklistMark('));
  assert(save.includes("rpc('save_my_task_checklist'"));
  assert(save.includes('checklistCompletionState'));
});

console.log('\n=============================================================================');
console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
console.log('=============================================================================');
if (failed > 0) process.exit(1);
