/** Phase125 — gelir kategorisi (CANLI, YALNIZ TEST PROJESI).
 *  Kullanici 22.11.2026: "gelir kategorileri de eklenmeli". Olculen: kategoriyle kayit,
 *  kategorisiz kayit (eski/sermaye), bos ve 60+ karakter red, yabanci kiraci yazamaz. */
const { createClient } = require('@supabase/supabase-js');
const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
let passed = 0, failed = 0;
const users = [], tenants = [], clients = [];
const check = (c, n, d) => c ? (passed++, console.log(`[PASS] ${n}`)) : (failed++, console.error(`[FAIL] ${n}\n       ${d}`));
const must = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.code || ''} ${r.error.message}`); return r.data; };
const hata = e => e ? `${e.code || ''} ${e.message || ''}`.trim() : '';

async function user(label, s) {
  const email = `p125_${label}_${s}@lexbnb-e2e.test`, password = 'P125!' + s;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  users.push(d.user.id);
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);
  must(await c.auth.signInWithPassword({ email, password }), label);
  clients.push(c);
  return c;
}

async function run() {
  const s = Date.now();
  try {
    const own = await user('own', s), atk = await user('atk', s);
    const A = must(await own.rpc('create_tenant_and_owner', { p_company_name: 'P125 ' + s, p_full_name: 'P125' }), 'A').tenant_id;
    tenants.push(A);
    const B = must(await atk.rpc('create_tenant_and_owner', { p_company_name: 'P125B ' + s, p_full_name: 'P125' }), 'B').tenant_id;
    tenants.push(B);
    const base = { tenant_id: A, income_type: 'OTHER_INCOME', income_date: '2026-08-10', amount: 2500, description: 'Havalimanı transferi' };

    let r = await own.from('income_entries').insert({ ...base, category: 'Transfer' }).select().single();
    check(!r.error && r.data.category === 'Transfer', '1. Gelir kategoriyle kaydedilir', hata(r.error));
    const id = r.data && r.data.id;
    r = await own.from('income_entries').insert({ ...base, income_type: 'CAPITAL', description: 'Ortak girişi' }).select().single();
    check(!r.error && r.data.category === null, '2. Kategorisiz kayit (sermaye / eski) NULL kalir', hata(r.error));
    r = await own.from('income_entries').insert({ ...base, category: '  ' });
    check(!!r.error, '3. Bos kategori reddedilir', 'KAYDEDILDI');
    r = await own.from('income_entries').insert({ ...base, category: 'x'.repeat(61) });
    check(!!r.error, '4. 60 karakterden uzun kategori reddedilir', 'KAYDEDILDI');
    r = await own.from('income_entries').update({ category: 'Ekstra hizmet' }).eq('id', id).select().single();
    check(!r.error && r.data.category === 'Ekstra hizmet', '5. Kategori duzenlenir', hata(r.error));
    r = await atk.from('income_entries').update({ category: 'Saldiri' }).eq('id', id).select();
    const sonra = must(await admin.from('income_entries').select('category').eq('id', id).single(), 'oku');
    check(sonra.category === 'Ekstra hizmet', '6. Yabanci kiraci kategoriyi degistiremez', JSON.stringify({ r: r.data, sonra }));
  } catch (e) {
    failed++; console.error('[FAIL] Beklenmeyen hata\n       ' + (e.stack || e.message));
  } finally {
    for (const c of clients) { try { await c.auth.signOut(); } catch (e) { /* yok */ } }
    let kirli = false;
    for (const t of tenants) { const { error } = await admin.from('tenants').delete().eq('id', t); if (error) kirli = true; }
    for (const u of users) { const { error } = await admin.auth.admin.deleteUser(u); if (error) kirli = true; }
    kirli ? failed++ : (passed++, console.log('[PASS] Z. Test verileri temizlendi'));
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed > 0) process.exit(1);
  }
}

run();
