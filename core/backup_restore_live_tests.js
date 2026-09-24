/**
 * LEXBNB — YEDEK -> FELAKET -> GERI YUKLEME TURU (CANLI, YALNIZ TEST PROJESI)
 *
 * L-42'nin tek kabul olcutu: yedek GERI YUKLENEBILIYOR mu. Dolu bir isletme
 * kurulur (kapali ay, temizlik, gider, finans kaydi, bilesik anahtarli ayar),
 * yedek alinir, isletme ve kullanicilari TAMAMEN silinir, yedekten yuklenir
 * ve her tablo satir satir karsilastirilir. Sonra kullanici giris yapip
 * verisini gorebiliyor mu bakilir (uyelik + RLS gercekten calisiyor mu).
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { runBackup } = require('./backup_engine.js');
const { restoreBackup, parseSpec } = require('./restore_engine.js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [], createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const bugun = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
function onceki() {
  const [y, m] = bugun().split('-').map(Number);
  const p = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return { ...p, gun: d => `${p.y}-${String(p.m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

async function makeUser(label, s) {
  const email = `bkp_${label}_${s}@lexbnb-e2e.test`, password = 'Bkp!' + s;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client };
}

async function isletmeGoruntusu(spec, tid, uyeler) {
  const out = {};
  for (const [name, t] of Object.entries(spec)) {
    let q = null;
    if (name === 'tenants') q = admin.from(name).select('*').eq('id', tid);
    else if (name === 'profiles') q = admin.from(name).select('*').in('id', uyeler);
    else if (t.columns.includes('tenant_id') && name !== 'channel_performance_rates') q = admin.from(name).select('*').eq('tenant_id', tid);
    if (!q) continue;
    const rows = must(await q, 'okuma ' + name);
    const key = r => (t.pk.length ? t.pk : ['id']).map(c => r[c]).join('|');
    out[name] = rows.sort((a, b) => key(a) < key(b) ? -1 : 1).map(r => JSON.stringify(r));
  }
  return out;
}

(async () => {
  console.log('LEXBNB YEDEK -> FELAKET -> GERI YUKLEME (CANLI)\n');
  const s = Date.now();
  const p = onceki();
  try {
    const own = await makeUser('own', s), mgr = await makeUser('mgr', s);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'Bkp ' + s, p_full_name: 'Bkp' }), 'isletme').tenant_id;
    createdTenants.push(A);
    must(await admin.from('tenant_members').insert({ tenant_id: A, user_id: mgr.id, role: 'manager' }), 'uye');

    const prop = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa Bkp', slug: 'bkp' + s, base_price: 12000 }).select().single(), 'mulk');
    const g = must(await own.client.from('guests').insert({ tenant_id: A, first_name: 'Ayse', last_name: 'Yilmaz', phone: '+905551112233', marketing_opt_in: true }).select().single(), 'misafir');
    must(await own.client.rpc('create_tenant_invitation', { p_tenant_id: A, p_email: 'bkp_davet_' + s + '@lexbnb-e2e.test', p_role: 'viewer' }), 'davet');
    const bk = must(await own.client.from('bookings').insert({ tenant_id: A, property_id: prop.id, booking_code: 'BKP-' + s, guest_name: 'Ayse Yilmaz',
      channel: 'Airbnb', check_in: p.gun(5), check_out: p.gun(9), gross_amount: 48000, cleaning_fee: 1500, discount: 2000, pax: 4, primary_guest_id: g.id }).select().single(), 'rezervasyon');
    must(await own.client.from('cleaning_tasks').insert({ tenant_id: A, property_id: prop.id, booking_id: bk.id, task_date: p.gun(9), cleaner_name: 'Fatma', amount: 1200, is_paid: false }), 'temizlik');
    must(await own.client.from('expenses').insert({ tenant_id: A, property_id: prop.id, expense_date: p.gun(12), category: 'Bakim', amount: 850.5, description: 'Havuz' }), 'gider');
    must(await admin.from('financial_transactions').insert({ tenant_id: A, property_id: prop.id, booking_id: bk.id, transaction_type: 'PAYMENT', amount: 48000, occurred_on: p.gun(5), created_by: own.id }), 'finans');
    must(await own.client.from('tenant_settings').insert({ tenant_id: A, key: 'ota_pricing_strategy', value: { mode: 'x' } }), 'ayar');
    must(await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: p.y, p_month: p.m, p_snapshot: {} }), 'ay kapanisi');

    const specRes = await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Accept: 'application/openapi+json' } });
    const rawSpec = await specRes.json();
    const spec = parseSpec(rawSpec);
    const once = await isletmeGoruntusu(spec, A, [own.id, mgr.id]);
    const doluTablo = Object.entries(once).filter(([, r]) => r.length).map(([n]) => n);
    check(['bookings', 'cleaning_tasks', 'expenses', 'financial_transactions', 'monthly_financial_closes', 'tenant_settings', 'guests', 'audit_logs', 'tenant_invitations', 'invitation_delivery_outbox', 'tenant_booking_channels'].every(t => doluTablo.includes(t)),
      '1. Kurulum: isletme 11+ tabloda veri tasiyor (davet kuyrugu, sistem kanallari dahil)', doluTablo.join(', '));

    // --- YEDEK (bellekte) ---
    const dosya = new Map();
    const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
    const manifest = await runBackup({ client: admin, fetchFn: fetch, url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY,
      writeFile: async (rel, body) => { dosya.set(rel, body); }, sha256 });
    check(manifest.errors.length === 0, '2. Yedek hatasiz alindi', JSON.stringify(manifest.errors));

    // --- FELAKET: isletme ve kullanicilar tamamen gider ---
    must(await admin.from('financial_transactions').delete().eq('tenant_id', A), 'felaket ft');
    must(await admin.from('tenants').delete().eq('id', A), 'felaket isletme');
    for (const u of [own, mgr]) must(await admin.auth.admin.deleteUser(u.id), 'felaket kullanici');
    const bos = must(await admin.from('bookings').select('id').eq('tenant_id', A), 'bos');
    check(bos.length === 0, '3. Felaket: isletme ve verisi silindi', `${bos.length} rez kaldi`);

    // --- GERI YUKLEME ---
    const readJson = rel => dosya.has(rel) ? JSON.parse(dosya.get(rel)) : null;
    const sunucuSaati = async () => { const r = await fetch(env.SUPABASE_URL + '/rest/v1/', { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY } }); return new Date(new Date(r.headers.get('date')).getTime() - 1000); };
    const rapor = await restoreBackup({ client: admin, spec: rawSpec, readJson, tenantId: A, startedAt: await sunucuSaati() });
    check(rapor.errors.length === 0, '4. Geri yukleme hatasiz', rapor.errors.join(' | '));
    check((rapor.sideEffectsRemoved.invitation_delivery_outbox || 0) >= 1 && (rapor.sideEffectsRemoved.tenant_booking_channels || 0) >= 1,
      '4b. Tetikleyicilerin urettigi kopyalar temizlendi (davet e-postasi YENIDEN gonderilmez)', JSON.stringify(rapor.sideEffectsRemoved));
    check(rapor.users.created === 2, '5. Iki kullanici AYNI kimlikle yeniden acildi', JSON.stringify(rapor.users));

    const sonra = await isletmeGoruntusu(spec, A, [own.id, mgr.id]);
    const farkli = Object.keys(once).filter(t => JSON.stringify(once[t]) !== JSON.stringify(sonra[t]));
    check(farkli.length === 0, '6. Her tablo satir satir BIREBIR ayni (kapali ay dahil)',
      farkli.map(t => `${t}: once ${once[t].length} / sonra ${(sonra[t] || []).length}` + (once[t].length === (sonra[t] || []).length ? ` ilk fark: ${once[t].find((r, i) => r !== sonra[t][i])}`.slice(0, 300) : '')).join('\n       '));

    // Ikinci kez: tekrar yuklemek cogaltmaz
    const rapor2 = await restoreBackup({ client: admin, spec: rawSpec, readJson, tenantId: A, startedAt: await sunucuSaati() });
    const sonra2 = await isletmeGoruntusu(spec, A, [own.id, mgr.id]);
    check(rapor2.errors.length === 0 && JSON.stringify(sonra2) === JSON.stringify(sonra), '7. Ikinci geri yukleme hicbir sey cogaltmaz', rapor2.errors.join(' | '));

    // Guncel veri ezilmez
    must(await admin.from('guests').update({ phone: '+905559998877' }).eq('id', g.id), 'guncelleme');
    await restoreBackup({ client: admin, spec: rawSpec, readJson, tenantId: A, startedAt: await sunucuSaati() });
    const gs = must(await admin.from('guests').select('phone').eq('id', g.id).single(), 'misafir oku');
    check(gs.phone === '+905559998877', '8. Geri yukleme guncel veriyi eski yedekle EZMEZ', `telefon=${gs.phone}`);

    // Kullanici sifre yeniler ve verisini gorur (uyelik + RLS)
    must(await admin.auth.admin.updateUserById(own.id, { password: 'Yeni!' + s }), 'sifre');
    const c = newClient();
    must(await c.auth.signInWithPassword({ email: own.email, password: 'Yeni!' + s }), 'yeniden giris');
    const gor = must(await c.from('bookings').select('id,gross_amount').eq('tenant_id', A), 'rez gor');
    check(gor.length === 1 && Number(gor[0].gross_amount) === 48000, '9. Sahip yeni sifreyle girip rezervasyonunu goruyor', JSON.stringify(gor));
    try { await c.auth.signOut(); } catch (e) {}
  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const t of createdTenants) {
      await admin.from('financial_transactions').delete().eq('tenant_id', t);
      const { error } = await admin.from('tenants').delete().eq('id', t);
      if (error) { hata = true; console.error('[FAIL] tenant: ' + error.message); }
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user) { const { error } = await admin.auth.admin.deleteUser(u); if (error) { hata = true; console.error('[FAIL] kullanici: ' + error.message); } }
    }
    if (hata) failed++; else ok('10. Test verileri temizlendi');
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    if (failed > 0) process.exit(1);
  }
})();
