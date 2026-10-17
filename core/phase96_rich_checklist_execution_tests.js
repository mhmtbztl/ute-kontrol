'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migration_phase96_rich_checklist_execution.sql'), 'utf8');
let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`[PASS] ${name}`); }
  catch (error) { failed++; console.error(`[FAIL] ${name}\n       ${error.message}`); }
}

test('P96-01. Ortak sunucu kapisi zengin ve eski bicimi denetler', () => {
  assert(/fn_checklist_critical_complete/.test(sql));
  assert(/jsonb_typeof\(p_checklist\)\s*=\s*'array'/.test(sql));
  assert(/important/.test(sql) && /subChecks/.test(sql));
});

test('P96-02. Temizlik Z imzasi kritik eksikte sunucuda durur', () => {
  const sign = sql.match(/CREATE OR REPLACE FUNCTION public\.sign_cleaning_done[\s\S]*?\n\$\$;/)?.[0] || '';
  assert(sign.includes('fn_checklist_critical_complete'));
  assert(sign.includes('CHECKLIST_INCOMPLETE'));
});

test('P96-03. Atanan personel icin dar kontrol listesi RPCsi vardir', () => {
  const save = sql.match(/CREATE OR REPLACE FUNCTION public\.save_my_task_checklist[\s\S]*?\n\$\$;/)?.[0] || '';
  assert(save.includes('t.assigned_to = auth.uid()'));
  assert(save.includes('public.is_tenant_member'));
  assert(save.includes('FOR UPDATE'));
  assert(save.includes("jsonb_set(v_task.checklist, '{result}'"));
});

test('P96-04. Eski durum RPCsi DONE ile kritik kapisini atlayamaz', () => {
  const status = sql.match(/CREATE OR REPLACE FUNCTION public\.set_my_task_status[\s\S]*?\n\$\$;/)?.[0] || '';
  assert(status.includes('fn_checklist_critical_complete'));
  assert(status.includes('CHECKLIST_INCOMPLETE'));
  assert(sql.includes('trg_guard_operational_task_checklist_completion'));
  assert(sql.includes('BEFORE UPDATE OF status, checklist ON public.operational_tasks'));
});

test('P96-05. Yeni RPC anon ve PUBLIC icin kapali, authenticated icin aciktir', () => {
  assert(sql.includes('REVOKE ALL ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) FROM PUBLIC'));
  assert(sql.includes('REVOKE ALL ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) FROM anon'));
  assert(sql.includes('GRANT EXECUTE ON FUNCTION public.save_my_task_checklist(UUID, JSONB, TEXT, TEXT) TO authenticated'));
});

console.log('\n=============================================================================');
console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
console.log('=============================================================================');
if (failed > 0) process.exit(1);
