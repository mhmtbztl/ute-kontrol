/**
 * LEXBNB — UYGULAMA ICI ISLETME YEDEGI: AL -> SIFIRLA -> GERI YUKLE (CANLI, YALNIZ TEST PROJESI)
 *
 * L-42 (2): sahip yedegi uygulamadan, KENDI OTURUMUYLA indirir. Kabul olcutu
 * tek: o dosya geri yuklenebiliyor mu. Dolu bir isletme kurulur, sahip yedek
 * alir (RLS altinda), isletme yanlislikla sifirlanir (reset_tenant_data),
 * dosya JSON metni olarak gidip gelir ve restore_engine ile yuklenir; her
 * tablo satir satir karsilastirilir.
 */

const { createClient } = require('@supabase/supabase-js');
const { exportTenantBackup, readerFromFile } = require('./tenant_backup_export.js');
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
  const email = `tbk_${label}_${s}@lexbnb-e2e.test`, password = 'Tbk!' + s;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  const oturum = must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client, token: oturum.session.access_token };
}

async function goruntu(spec, tid, uyeler, yalniz) {
  const out = {};
  for (const name of yalniz) {
    const t = spec[name];
    if (!t) continue;
    let q;
    if (name === 'tenants') q = admin.from(name).select('*').eq('id', tid);
    else if (name === 'profiles') q = admin.from(name).select('*').in('id', uyeler);
    else q = admin.from(name).select('*').eq('tenant_id', tid);
    const rows = must(await q, 'okuma ' + name);
    const key = r => (t.pk.length ? t.pk : ['id']).map(c => r[c]).join('|');
    out[name] = rows.sort((a, b) => key(a) < key(b) ? -1 : 1).map(r => JSON.stringify(r));
  }
  return out;
}

(async () => {
  console.log('LEXBNB UYGULAMA ICI YEDEK -> SIFIRLAMA -> GERI YUKLEME (CANLI)\n');
  const s = Date.now();
  const p = onceki();
  try {
    const own = await makeUser('own', s), mgr = await makeUser('mgr', s), yab = await makeUser('yab', s);
    const A = must(await own.client.rpc('create_tenant_and_owner', { p_company_name: 'Tbk ' + s, p_full_name: 'Tbk' }), 'isletme').tenant_id;
    const Y = must(await yab.client.rpc('create_tenant_and_owner', { p_company_name: 'TbkY ' + s, p_full_name: 'TbkY' }), 'yabanci').tenant_id;
    createdTenants.push(A, Y);
    must(await admin.from('tenant_members').insert({ tenant_id: A, user_id: mgr.id, role: 'manager' }), 'uye');
    must(await yab.client.from('properties').insert({ tenant_id: Y, name: 'Yabanci Villa', slug: 'tbky' + s, base_price: 5000 }), 'yabanci mulk');

    const prop = must(await own.client.from('properties').insert({ tenant_id: A, name: 'Villa Tbk', slug: 'tbk' + s, base_price: 12000 }).select().single(), 'mulk');
    const g = must(await own.client.from('guests').insert({ tenant_id: A, first_name: 'Ayşe', last_name: 'Yılmaz', phone: '+905551112233', marketing_opt_in: true }).select().single(), 'misafir');
    const bk = must(await own.client.from('bookings').insert({ tenant_id: A, property_id: prop.id, booking_code: 'TBK-' + s, guest_name: 'Ayşe Yılmaz',
      channel: 'Airbnb', check_in: p.gun(5), check_out: p.gun(9), gross_amount: 48000.5, cleaning_fee: 1500, discount: 2000, pax: 4, primary_guest_id: g.id }).select().single(), 'rezervasyon');
    must(await own.client.from('cleaning_tasks').insert({ tenant_id: A, property_id: prop.id, booking_id: bk.id, task_date: p.gun(9), cleaner_name: 'Fatma', amount: 1200, is_paid: false }), 'temizlik');
    must(await own.client.from('expenses').insert({ tenant_id: A, property_id: prop.id, expense_date: p.gun(12), category: 'Bakim', amount: 850.5, description: 'Havuz' }), 'gider');
    must(await own.client.from('tenant_settings').insert({ tenant_id: A, key: 'ota_pricing_strategy', value: { mode: 'x' } }), 'ayar');
    must(await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: p.y, p_month: p.m, p_snapshot: {} }), 'ay kapanisi');

    // --- YEDEK: sahibin kendi oturumuyla (uygulamadaki dugmenin yaptigi) ---
    const yedek = await exportTenantBackup({ client: own.client, fetchFn: fetch, url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY, accessToken: own.token, tenantId: A });
    check(yedek.manifest.errors.length === 0, '1. Sahip yedegi kendi oturumuyla hatasiz alir (RLS altinda her tablo okunur)', yedek.manifest.errors.join(' | '));
    const dolu = Object.entries(yedek.tables).filter(([, r]) => r.length).map(([n]) => n);
    check(['tenants', 'tenant_members', 'profiles', 'properties', 'guests', 'bookings', 'cleaning_tasks', 'expenses', 'tenant_settings', 'monthly_financial_closes'].every(t => dolu.includes(t)),
      '2. Yedek isletmenin defterlerini tasiyor (kapali ay, temizlik, ayar dahil)', dolu.join(', '));
    const tumu = JSON.stringify(yedek);
    check(!tumu.includes(Y) && !tumu.includes('Yabanci Villa'), '3. Yedekte baska isletmenin hicbir satiri yok', 'yabanci veri sizdi');

    const spec = parseSpec(await (await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Accept: 'application/openapi+json' } })).json());
    const tablolar = Object.keys(yedek.tables);
    const once = await goruntu(spec, A, [own.id, mgr.id], tablolar);

    // --- KAZA: veriler sifirlanir ---
    must(await own.client.rpc('reset_tenant_data', { p_tenant_id: A, p_confirm: 'VERILERI SIFIRLA' }), 'sifirlama');
    const bos = must(await admin.from('bookings').select('id').eq('tenant_id', A), 'bos');
    check(bos.length === 0, '4. Sifirlama: rezervasyonlar silindi', `${bos.length} kaldi`);

    // --- GERI YUKLEME: indirilen dosya metin olarak gidip gelir ---
    const dosya = JSON.parse(JSON.stringify(yedek));
    const rawSpec = await (await fetch(`${env.SUPABASE_URL}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Accept: 'application/openapi+json' } })).json();
    const sunucuSaati = async () => { const r = await fetch(env.SUPABASE_URL + '/rest/v1/', { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY } }); return new Date(new Date(r.headers.get('date')).getTime() - 1000); };
    const rapor = await restoreBackup({ client: admin, spec: rawSpec, readJson: readerFromFile(dosya), tenantId: A, startedAt: await sunucuSaati() });
    check(rapor.errors.length === 0, '5. Uygulama yedegi geri yukleme motorundan hatasiz gecer', rapor.errors.join(' | '));

    const sonra = await goruntu(spec, A, [own.id, mgr.id], tablolar);
    // Sifirlamanin kendi denetim izi (L-09) gercek bir olaydir ve kalir.
    const farkli = tablolar.filter(t => t !== 'audit_logs' && JSON.stringify(once[t]) !== JSON.stringify(sonra[t]));
    check(farkli.length === 0, '6. Her tablo satir satir BIREBIR ayni (kurus, Turkce harf, kapali ay dahil)',
      farkli.map(t => `${t}: once ${(once[t] || []).length} / sonra ${(sonra[t] || []).length}`).join('\n       '));
    const yeniIz = (sonra.audit_logs || []).filter(r => !(once.audit_logs || []).includes(r)).map(r => JSON.parse(r));
    check((once.audit_logs || []).every(r => (sonra.audit_logs || []).includes(r)) && yeniIz.length === 1 && /reset/i.test(JSON.stringify(yeniIz[0])),
      '6b. Denetim defteri: eski izlerin hepsi geri geldi, fazladan yalniz sifirlamanin kendi izi var', JSON.stringify(yeniIz).slice(0, 300));

    const gor = must(await own.client.from('bookings').select('gross_amount').eq('tenant_id', A), 'rez gor');
    check(gor.length === 1 && Number(gor[0].gross_amount) === 48000.5, '7. Sahip geri gelen rezervasyonunu kendi oturumuyla goruyor', JSON.stringify(gor));

    // Yetkisiz: yonetici disi biri baska isletmenin yedegini alamaz
    const yabYedek = await exportTenantBackup({ client: yab.client, fetchFn: fetch, url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY, accessToken: yab.token, tenantId: A });
    const yabSatir = Object.values(yabYedek.tables).reduce((t, r) => t + r.length, 0);
    check(yabSatir === 0, '8. Yabanci isletme sahibi bu isletmenin yedeginde hicbir satir alamaz (RLS)', `${yabSatir} satir`);
    for (const u of [own, mgr, yab]) { try { await u.client.auth.signOut(); } catch (e) {} }
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
    if (hata) failed++; else ok('9. Test verileri temizlendi');
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    setImmediate(() => process.exit(failed > 0 ? 1 : 0));
  }
})();
