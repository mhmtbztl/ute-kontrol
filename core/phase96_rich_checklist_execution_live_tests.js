'use strict';

const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, options);

let passed = 0;
let failed = 0;
const users = [];
const tenants = [];
const check = (condition, name, detail) => condition
  ? (passed++, console.log(`[PASS] ${name}`))
  : (failed++, console.error(`[FAIL] ${name}\n       ${detail}`));
const must = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const message = error => error ? `${error.code || ''} ${error.message || ''}`.trim() : '';

async function makeUser(label, stamp) {
  const email = `p96_${label}_${stamp}@lexbnb-e2e.test`;
  const password = `P96!${stamp}`;
  const data = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(data.user.id);
  const session = client();
  must(await session.auth.signInWithPassword({ email, password }), `${label} giriş`);
  return { id: data.user.id, client: session };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 96 — ZENGIN KONTROL LISTESI (CANLI TEST PROJESI)');
  console.log('=============================================================================\n');
  const stamp = Date.now();
  const sessions = [];
  try {
    const owner = await makeUser('owner', stamp);
    const staff = await makeUser('staff', stamp);
    const other = await makeUser('other', stamp);
    sessions.push(owner, staff, other);
    const tenantId = must(await owner.client.rpc('create_tenant_and_owner', {
      p_company_name: `P96 ${stamp}`, p_full_name: 'P96 Owner'
    }), 'tenant').tenant_id;
    tenants.push(tenantId);
    must(await admin.from('tenant_members').insert([
      { tenant_id: tenantId, user_id: staff.id, role: 'staff' },
      { tenant_id: tenantId, user_id: other.id, role: 'staff' }
    ]), 'members');
    const property = must(await owner.client.from('properties').insert({
      tenant_id: tenantId, name: 'P96 Villa', slug: `p96-${stamp}`, base_price: 1000, clean_cost: 500
    }).select().single(), 'property');

    const richChecklist = {
      sections: [{ title: 'Giriş', items: [
        { text: 'Kapı kodu', important: true, subChecks: ['Kod denendi'] },
        { text: 'Dekor', important: false, subChecks: ['Yastıklar'] }
      ] }], supplies: []
    };
    const richTask = must(await owner.client.from('operational_tasks').insert({
      tenant_id: tenantId, property_id: property.id, task_type: 'CHECKIN_PREP',
      title: 'Misafir öncesi', assigned_to: staff.id, checklist: richChecklist
    }).select().single(), 'rich task');

    let result = await staff.client.rpc('set_my_task_status', {
      p_task_id: richTask.id, p_status: 'DONE', p_note: null
    });
    check(!!result.error && /CHECKLIST_INCOMPLETE/.test(message(result.error)),
      'A1. Eski durum RPCsi kritik listeyi atlayamaz', message(result.error) || 'tamamlandı');

    result = await other.client.rpc('save_my_task_checklist', {
      p_task_id: richTask.id, p_result: { 's0.i0': { z: true } }, p_status: 'IN_PROGRESS', p_note: null
    });
    check(!!result.error && /FORBIDDEN/.test(message(result.error)),
      'A2. Atanmamış personel ilerleme yazamaz', message(result.error) || 'yazdı');

    result = await staff.client.rpc('save_my_task_checklist', {
      p_task_id: richTask.id, p_result: { 's0.i0': { z: true } }, p_status: 'DONE', p_note: null
    });
    check(!!result.error && /CHECKLIST_INCOMPLETE/.test(message(result.error)),
      'A3. Önemli maddenin alt kontrolü eksikse DONE reddedilir', message(result.error) || 'tamamlandı');

    result = await staff.client.rpc('save_my_task_checklist', {
      p_task_id: richTask.id,
      p_result: { 's0.i0': { z: true }, 's0.i0.sub0': { z: true } },
      p_status: 'DONE', p_note: 'hazır'
    });
    const richSaved = must(await admin.from('operational_tasks').select('status, checklist, completed_by').eq('id', richTask.id).single(), 'rich saved');
    check(!result.error && richSaved.status === 'DONE' && richSaved.completed_by === staff.id
      && richSaved.checklist.result['s0.i0.sub0'].z === true,
      'A4. Atanan personel kritik ana+alt kontrollerle görevi tamamlar', message(result.error) || JSON.stringify(richSaved));

    const legacyTask = must(await owner.client.from('operational_tasks').insert({
      tenant_id: tenantId, task_type: 'GENERAL', title: 'Eski liste', assigned_to: staff.id,
      checklist: [{ id: 'old', text: 'Sayaç', required: true, completed: false }]
    }).select().single(), 'legacy task');
    result = await staff.client.rpc('save_my_task_checklist', {
      p_task_id: legacyTask.id, p_result: { 's0.i0': { z: true } }, p_status: 'DONE', p_note: null
    });
    const legacySaved = must(await admin.from('operational_tasks').select('status, checklist').eq('id', legacyTask.id).single(), 'legacy saved');
    check(!result.error && legacySaved.status === 'DONE' && legacySaved.checklist[0].completed === true,
      'B1. Eski dizi biçimi yeni dar RPC ile çalışmayı sürdürür', message(result.error) || JSON.stringify(legacySaved));

    const cleaner = must(await owner.client.from('operational_people').insert({
      tenant_id: tenantId, kind: 'CLEANER', full_name: 'P96 Cleaner', user_id: staff.id
    }).select().single(), 'cleaner');
    const cleaning = must(await owner.client.from('cleaning_tasks').insert({
      tenant_id: tenantId, property_id: property.id, task_date: '2026-10-16',
      cleaner_name: 'P96 Cleaner', amount: 500, is_paid: false, status: 'PLANNED'
    }).select().single(), 'cleaning');
    const template = must(await owner.client.from('property_checklist_templates').insert({
      tenant_id: tenantId, property_id: property.id, task_type: 'CLEANING', template_name: 'P96 Critical',
      items: { sections: [{ title: 'Banyo', items: [{ text: 'Hijyen', important: true, subChecks: ['Duş'] }] }], supplies: [] }
    }).select().single(), 'template');
    const assigned = must(await owner.client.rpc('assign_cleaning_task', {
      p_cleaning_task_id: cleaning.id, p_person_id: cleaner.id, p_template_id: template.id
    }), 'assign');
    result = await staff.client.rpc('sign_cleaning_done', { p_execution_id: assigned.execution_id });
    check(!!result.error && /CHECKLIST_INCOMPLETE/.test(message(result.error)),
      'C1. Temizlik Z imzası kritik eksikte sunucuda reddedilir', message(result.error) || 'imzalandı');
    must(await staff.client.rpc('save_cleaning_progress', {
      p_execution_id: assigned.execution_id,
      p_checklist_result: { 's0.i0': { z: true }, 's0.i0.sub0': { z: true } },
      p_supplies_result: {}, p_note: null
    }), 'clean progress');
    result = await staff.client.rpc('sign_cleaning_done', { p_execution_id: assigned.execution_id });
    check(!result.error && result.data.status === 'CLEANED',
      'C2. Kritik temizlik kontrolleri bitince Z imzası kabul edilir', message(result.error));
  } catch (error) {
    failed++;
    console.error(`[FAIL] Beklenmeyen hata\n       ${error.stack || error.message}`);
  } finally {
    for (const session of sessions) { try { await session.client.auth.signOut(); } catch (error) {} }
    for (const tenantId of tenants) await admin.from('tenants').delete().eq('id', tenantId);
    for (const userId of users) await admin.auth.admin.deleteUser(userId);
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================');
    if (failed > 0) process.exit(1);
  }
}

run();
