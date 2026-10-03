const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase84_expense_template_generation.sql'), 'utf8');
const phase86 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase86_expense_template_authz.sql'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}\n       ${error.message}`); throw error; }
}

test('1. RPC yalnız yönetici ve oturumlu kullanıcı sınırında çalışır', () => {
  assert.match(sql, /auth\.uid\(\) IS NULL/);
  assert.match(sql, /public\.can_manage_tenant\(v_template\.tenant_id\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM anon/);
});

test('2. Gider ve occurrence aynı transaction içinde yazılır', () => {
  assert.match(sql, /INSERT INTO public\.expenses/);
  assert.match(sql, /INSERT INTO public\.expense_template_occurrences/);
  assert.match(sql, /SABLON_DONEMI_ZATEN_ISLENDI/);
  assert.match(sql, /FOR UPDATE/);
});

test('3. Giderler ekranı şablon oluşturma ve aya işleme yolunu sunar', () => {
  assert.match(html, /id="expenseTemplateForm"/);
  assert.match(html, /id="expenseTemplatesTableBody"/);
  assert.match(app, /function renderExpenseTemplates/);
  assert.match(app, /generate_expense_from_template/);
});

test('4. Phase86 yetkiyi tenant kimliğiyle kayıt kilidinden önce doğrular', () => {
  assert.match(phase86, /generate_expense_from_template\(\s*p_tenant_id UUID,/);
  assert.match(phase86, /can_manage_tenant\(p_tenant_id\)[\s\S]*?SELECT \* INTO v_template[\s\S]*?FOR UPDATE/);
  assert.match(phase86, /REVOKE ALL ON FUNCTION public\.generate_expense_from_template\(UUID, DATE\) FROM authenticated/);
});

test('5. Şablon yazmaları kullanıcıya hata verir ve finans önbelleğini temizler', () => {
  const body = name => (app.match(new RegExp(`async function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`)) || [''])[0];
  for (const name of ['saveExpenseTemplate', 'generateExpenseFromTemplate', 'deleteExpenseTemplate']) {
    assert.match(body(name), /catch \(error\)[\s\S]*showToast/);
  }
  assert.match(body('generateExpenseFromTemplate'), /p_tenant_id:[\s\S]*invalidateExecutiveSnapshotCache\(\)/);
  assert.match(body('deleteExpenseTemplate'), /select\(['"]id['"]\)/);
});

console.log(`TEST SUMMARY: ${passed} / ${passed} TESTS PASSED (0 FAILED)`);
