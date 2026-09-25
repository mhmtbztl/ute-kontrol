/**
 * LEXBNB PHASE 45 — TEMIZLIK MALIYETI VE ODEME KOMISYONU (CANLI, YALNIZ TEST PROJESI)
 *
 * K-04 kabul senaryolari (docs/DESIGN_K04_CLEANING_COST.md 5. bolum):
 *
 *   A  Misafir odedi, gelmedi: gorev SKIPPED -> ciro var, gider 0, borc 0
 *   B  Yapildi, odenmedi                     -> gider = maliyet, borc = maliyet
 *   C  Yapildi + odendi                      -> gider TEK sefer, borc 0, yeni gider satiri yok
 *   D  31'inde yapildi, ertesi ay odendi     -> gider yapildigi ayda
 *   E  Eski EXP-CLEAN-* satiri olan gorev    -> gider o satirdan, bir kez
 *   G  Ay sinirini kesen rezervasyon         -> oda geliri, temizlik geliri ve odeme komisyonu gecelere dagilir
 *   H  Kapanmis ayda durum degisimi          -> reddedilir; odeme serbest
 *   I  Kapanis snapshot'i = yonetici snapshot'i
 *
 * Ayrica: odenmis-ama-yapilmamis gorev reddi, yabanci kiracinin rezervasyonuna
 * baglanma reddi, anon tablo kapisi.
 *
 * phase45 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const hataMetni = e => (e && (e.message || e.code)) ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const esit = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;

const bugunIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
function oncekiAy() {
  const [y, m] = bugunIst().split('-').map(Number);
  const p = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return { ...p, gun: d => `${p.y}-${String(p.m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

async function makeUser(label, stamp) {
  const email = `p45_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P45!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client };
}
async function makeTenant(u, name) {
  const t = must(await u.client.rpc('create_tenant_and_owner', { p_company_name: name, p_full_name: 'P45' }), 'isletme');
  createdTenants.push(t.tenant_id);
  return t.tenant_id;
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 45 — TEMIZLIK MALIYETI / ODEME KOMISYONU (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const clients = [];
  try {
    const own = await makeUser('own', s);
    const yabanci = await makeUser('yab', s);
    clients.push(own, yabanci);
    const T = await makeTenant(own, 'P45 T ' + s);
    const Y = await makeTenant(yabanci, 'P45 Y ' + s);
    const c = own.client;

    const p = must(await c.from('properties').insert({ tenant_id: T, name: 'Villa P45', slug: 'p45' + s, base_price: 10000,
      activated_on: '2030-01-01' }).select().single(), 'mulk');
    const pY = must(await admin.from('properties').insert({ tenant_id: Y, name: 'Villa Y', slug: 'p45y' + s, base_price: 10000 }).select().single(), 'yabanci mulk');

    const rez = async (kod, ci, co, extra) => must(await c.from('bookings').insert({ tenant_id: T, property_id: p.id,
      booking_code: kod + s, guest_name: 'Misafir ' + kod, channel: 'Airbnb', check_in: ci, check_out: co, pax: 2,
      gross_amount: 20000, cleaning_fee: 1500, ...(extra || {}) }).select().single(), 'rezervasyon ' + kod);
    const gorev = async (alanlar) => c.from('cleaning_tasks').insert({ tenant_id: T, property_id: p.id,
      cleaner_name: 'Ayse', ...alanlar }).select().single();
    const kapanis = async (y, m) => must(await c.rpc('compute_month_close_snapshot', { p_tenant_id: T, p_year: y, p_month: m }), 'kapanis snapshot');
    const yonetici = async (ay) => must(await c.rpc('get_executive_dashboard_snapshot', { p_tenant_id: T, p_target_month: ay }), 'yonetici snapshot');
    const giderSayisi = async () => (must(await admin.from('expenses').select('id').eq('tenant_id', T), 'gider say')).length;

    // -----------------------------------------------------------------------
    console.log('--- 1. DURUM MODELI ---');
    const bA = await rez('A', '2031-01-10', '2031-01-12');
    let r = await gorev({ booking_id: bA.id, task_date: '2031-01-12', amount: 1200 });
    const tA = must(r, 'gorev A');
    check(tA.status === 'PLANNED' && tA.completed_at === null, '1a. Yeni gorev PLANNED, completed_at bos', JSON.stringify({ s: tA.status, c: tA.completed_at }));

    r = await c.from('cleaning_tasks').update({ status: 'SKIPPED', is_paid: true }).eq('id', tA.id).select();
    check(!!r.error, '1b. Yapilmamis (SKIPPED) temizlik ODENDI olamaz', hataMetni(r.error) || 'izin verildi');
    must(await c.from('cleaning_tasks').update({ status: 'SKIPPED' }).eq('id', tA.id), 'gorev A skip');

    const bY = must(await admin.from('bookings').insert({ tenant_id: Y, property_id: pY.id, booking_code: 'Y' + s, guest_name: 'Y',
      channel: 'Airbnb', check_in: '2031-01-10', check_out: '2031-01-12', pax: 2, gross_amount: 1000 }).select().single(), 'yabanci rez');
    r = await gorev({ booking_id: bY.id, task_date: '2031-01-12', amount: 100 });
    check(!!r.error && /CROSS_TENANT/.test(hataMetni(r.error)), '1c. Gorev yabanci kiracinin rezervasyonuna BAGLANAMAZ', hataMetni(r.error) || 'izin verildi');

    // Eski istemci: yalniz is_paid gonderir. Odenen gorev yapilmistir.
    const eski = must(await gorev({ task_date: '2031-01-05', amount: 300 }), 'eski gorev');
    const eskiOdendi = must(await c.from('cleaning_tasks').update({ is_paid: true }).eq('id', eski.id).select().single(), 'eski odeme');
    check(eskiOdendi.status === 'DONE' && !!eskiOdendi.completed_at, '1d. Eski istemcinin "Odendi"si gorevi DONE yapar', JSON.stringify({ s: eskiOdendi.status, c: eskiOdendi.completed_at }));

    // -----------------------------------------------------------------------
    console.log('\n--- 2. KABUL SENARYOLARI (Ocak 2031) ---');
    const tB = must(await gorev({ task_date: '2031-01-15', amount: 1200, status: 'DONE' }), 'gorev B');
    const tD = must(await gorev({ task_date: '2031-01-31', amount: 800, status: 'DONE' }), 'gorev D');
    const tE = must(await gorev({ task_date: '2031-01-20', amount: 900, status: 'DONE', is_paid: true }), 'gorev E');
    must(await c.from('expenses').insert({ tenant_id: T, property_id: p.id, expense_date: '2031-02-03', category: 'Temizlik',
      expense_type: 'OPEX', amount: 900, description: 'eski odeme', legacy_id: 'EXP-CLEAN-' + tE.id }), 'eski gider E');

    let k = await kapanis(2031, 1);
    // Ocak: A (SKIPPED) 0 · eski 300 · B 1200 · D 800 · E eski satirdan (Subat'ta) -> 2300
    check(k.schemaVersion === 4, '2a. Kapanis snapshot surumu 4', String(k.schemaVersion));
    check(esit(k.cleaningCost, 2300), '2b. A+B+D: yapilmayan 0, yapilanlar yapildigi ayda; E ikinci kez sayilmaz (2300)', String(k.cleaningCost));
    check(esit(k.cleaningDebt, 2000), '2c. B: yapilmis ve odenmemis temizlik borctur (1200 + 800)', String(k.cleaningDebt));
    check(esit(k.revenue, 20000) && esit(k.cleaningRevenue, 1500), '2d. A: misafir odedi, gelmedi -> ciro ve temizlik GELIRI yerinde', JSON.stringify({ rev: k.revenue, cr: k.cleaningRevenue }));

    const oncekiGider = await giderSayisi();
    must(await c.from('cleaning_tasks').update({ is_paid: true }).eq('id', tB.id), 'B odeme');
    must(await c.from('cleaning_tasks').update({ is_paid: true }).eq('id', tD.id), 'D odeme');
    k = await kapanis(2031, 1);
    check(esit(k.cleaningCost, 2300) && esit(k.cleaningDebt, 0), '2e. C: odeme gideri DEGISTIRMEZ, borcu kapatir', JSON.stringify({ c: k.cleaningCost, d: k.cleaningDebt }));
    check(await giderSayisi() === oncekiGider, '2f. C: odeme gider defterine YENI SATIR yazmaz', `${oncekiGider} -> ${await giderSayisi()}`);

    const subat = await kapanis(2031, 2);
    check(esit(subat.cleaningCost, 0) && esit(subat.manualOpex, 900), '2g. D/E: Subat\'ta temizlik maliyeti yok; eski E satiri Subat elle giderinde', JSON.stringify({ c: subat.cleaningCost, m: subat.manualOpex }));
    check(esit(k.totalOpex, Number(k.manualOpex) + Number(k.otaCommission) + Number(k.paymentCommission) + Number(k.cleaningCost)),
      '2h. OPEX = elle + OTA + odeme komisyonu + yapilmis temizlik', JSON.stringify(k));

    // -----------------------------------------------------------------------
    console.log('\n--- 3. ODEME KOMISYONU VE TAHAKKUK (G) ---');
    const bG = await rez('G', '2031-03-29', '2031-04-03', { gross_amount: 40000, discount: 2000, cleaning_fee: 1500, ota_commission: 0 });
    r = await c.from('booking_payment_commissions').insert({ booking_id: bG.id, tenant_id: T, amount: 500 }).select().single();
    check(!r.error, '3a. Sahip rezervasyona odeme komisyonu girer', hataMetni(r.error));
    const mart = await kapanis(2031, 3), nisan = await kapanis(2031, 4);
    check(esit(mart.roomRevenue, 21900) && esit(nisan.roomRevenue, 14600), '3b. Net oda geliri gecelere: 21.900 / 14.600', JSON.stringify([mart.roomRevenue, nisan.roomRevenue]));
    check(esit(mart.cleaningRevenue, 900) && esit(nisan.cleaningRevenue, 600), '3c. Temizlik geliri gecelere: 900 / 600', JSON.stringify([mart.cleaningRevenue, nisan.cleaningRevenue]));
    check(esit(mart.paymentCommission, 300) && esit(nisan.paymentCommission, 200), '3d. Odeme komisyonu gecelere: 300 / 200', JSON.stringify([mart.paymentCommission, nisan.paymentCommission]));
    check(esit(mart.revenue, 22800), '3e. Odeme komisyonu CIROYU AZALTMAZ (Toplam gelir 22.800)', String(mart.revenue));
    check(esit(mart.adr, 7300), '3f. ADR = net oda geliri / satilan gece (21.900 / 3)', String(mart.adr));

    r = await c.from('booking_payment_commissions').insert({ booking_id: bY.id, tenant_id: T, amount: 1 }).select();
    check(!!r.error, '3g. Yabanci kiracinin rezervasyonuna odeme komisyonu YAZILAMAZ', hataMetni(r.error) || 'izin verildi');
    r = await yabanci.client.from('booking_payment_commissions').select('booking_id').eq('tenant_id', T);
    check(!r.error && (r.data || []).length === 0, '3h. Baska kiracinin uyesi komisyonlari GOREMEZ', hataMetni(r.error) || JSON.stringify(r.data));
    r = await newClient().from('booking_payment_commissions').select('booking_id').limit(1);
    check(!!r.error && r.error.code === '42501', '3i. anon tabloya hic giremez (42501)', hataMetni(r.error) || 'izin verildi');

    // -----------------------------------------------------------------------
    console.log('\n--- 4. UC YER AYNI RAKAM (I) ---');
    for (const [ay, y, m] of [['2031-01', 2031, 1], ['2031-03', 2031, 3]]) {
      const kk = await kapanis(y, m), yy = await yonetici(ay);
      check(esit(kk.totalOpex, yy.operating_expenses) && esit(kk.netProfit, yy.net_profit) && esit(kk.revenue, yy.total_revenue)
        && esit(kk.cleaningCost, yy.cleaning_cost) && esit(kk.paymentCommission, yy.payment_commission),
        `4. ${ay}: kapanis snapshot'i = yonetici snapshot'i`, JSON.stringify({ kk: [kk.revenue, kk.totalOpex, kk.netProfit], yy: [yy.total_revenue, yy.operating_expenses, yy.net_profit] }));
    }

    // -----------------------------------------------------------------------
    console.log('\n--- 5. KAPANMIS AY (H) ---');
    const o = oncekiAy();
    const bH = await rez('H', o.gun(3), o.gun(5), { gross_amount: 10000, cleaning_fee: 0 });
    const tH = must(await gorev({ booking_id: bH.id, task_date: o.gun(5), amount: 700, status: 'DONE' }), 'gorev H');
    const tP = must(await gorev({ task_date: o.gun(6), amount: 400 }), 'gorev P (planli)');
    r = await c.rpc('close_monthly_period_atomic', { p_tenant_id: T, p_year: o.y, p_month: o.m, p_snapshot: {} });
    check(!r.error && r.data && r.data.success === true, `5a. ${o.y}-${o.m} kapatildi`, hataMetni(r.error) || JSON.stringify(r.data));
    r = await c.from('cleaning_tasks').update({ status: 'SKIPPED' }).eq('id', tH.id).select();
    const hOku = must(await admin.from('cleaning_tasks').select('status,is_paid').eq('id', tH.id).single(), 'H oku');
    check(!!r.error && hOku.status === 'DONE', '5b. Kapanmis ayda "yapildi -> yapilmadi" REDDEDILIR', hataMetni(r.error) || hOku.status);
    r = await c.from('cleaning_tasks').update({ is_paid: true }).eq('id', tH.id).select();
    check(!r.error, '5c. Kapanmis ayda yapilmis temizlik ODENDI isaretlenebilir', hataMetni(r.error));
    r = await c.from('cleaning_tasks').update({ is_paid: true }).eq('id', tP.id).select();
    const pOku = must(await admin.from('cleaning_tasks').select('status,is_paid').eq('id', tP.id).single(), 'P oku');
    check(!!r.error && pOku.status === 'PLANNED' && !pOku.is_paid,
      '5d. Kapanmis ayda PLANLI gorev odenemez (odeme = yapildi, kapanis giderini degistirir)', hataMetni(r.error) || JSON.stringify(pOku));
    r = await c.from('booking_payment_commissions').insert({ booking_id: bH.id, tenant_id: T, amount: 50 }).select();
    check(!!r.error, '5e. Kapanmis aydaki rezervasyona odeme komisyonu EKLENEMEZ', hataMetni(r.error) || 'izin verildi');
  } catch (err) {
    no('Suit beklenmeyen hatayla durdu', err && err.stack ? err.stack : String(err));
  } finally {
    for (const cl of clients) { try { await cl.client.auth.signOut(); } catch (_) { /* yoksay */ } }
    for (const t of createdTenants) {
      const { error } = await admin.from('tenants').delete().eq('id', t);
      if (error) no('Temizlik: isletme ' + t, error.message);
    }
    for (const u of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(u);
      if (error) no('Temizlik: kullanici ' + u, error.message);
    }
    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================');
    if (failed > 0) process.exit(1);
  }
}

run();
