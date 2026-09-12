/**
 * LEXBNB REZERVASYON SİLME ATOMİKLİĞİ TEST SUITE (PHASE 19)
 *
 * 2026-09-13'te uretimde dogrulanan hata:
 *   deleteBooking() istemcide uc ayri sorgu calistiriyordu. Ucuncusu (rezervasyon
 *   silme) kapanmis donem korumasina takilinca ikincisi (odenmemis temizlik
 *   gorevlerini silme) GERI ALINMIYORDU.
 *
 *   Canli olcum:
 *     temizlik silme : BASARILI
 *     rezervasyon    : ENGELLENDI (42501)
 *     -> rezervasyon 1 adet, temizlik gorevi 0 adet
 *
 *   Kullanici "silinemedi" hatasi goruyor ama temizlikciye olan BORC kaydi
 *   sessizce yok oluyordu. Ayni sey ag kopmasinda da olurdu.
 *
 * Cozum: delete_booking_atomic() - tek transaction.
 *
 * Kapsam:
 *  1. Normal silme calisir ve odenmemis gorevleri temizler
 *  2. Odenmis temizlik gorevi KORUNUR (odeme gecmisi kaybolmaz)
 *  3. Kapanmis donemde silme reddedilir
 *  4. Reddedilen silmede temizlik gorevi de KAYBOLMAZ (atomiklik)
 *  5. Baska isletmenin rezervasyonu silinemez
 *  6. Viewer rolu silemez
 *  7. Olmayan rezervasyon icin net hata
 *  8. Test verileri temizlenir
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/).forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

async function makeUser(label, stamp) {
  const email = `bdel_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'BDel!' + stamp;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label}: ${error.message}`);
  createdUsers.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  return { email, client, id: data.user.id };
}

async function kur(client, ad) {
  const { data: t, error: te } = await client.rpc('create_tenant_and_owner', { p_company_name: ad, p_full_name: 'T' });
  if (te) throw new Error('tenant: ' + te.message);
  createdTenants.push(t.tenant_id);
  const { data: p } = await client.from('properties')
    .insert({ tenant_id: t.tenant_id, name: 'V', slug: 'V', base_price: 1000 }).select().single();
  return { tenantId: t.tenant_id, propertyId: p.id };
}

async function rezervasyonEkle(client, tid, pid, kod, ay, gorevOdenmis) {
  const { data: b, error: be } = await client.from('bookings').insert({
    tenant_id: tid, property_id: pid, booking_code: kod, guest_name: 'G',
    check_in: `2026-${ay}-10`, check_out: `2026-${ay}-14`, gross_amount: 8000
  }).select().single();
  if (be) throw new Error('rezervasyon: ' + be.message);
  const { data: ct } = await client.from('cleaning_tasks').insert({
    tenant_id: tid, property_id: pid, booking_id: b.id, cleaner_name: 'C',
    task_date: `2026-${ay}-14`, amount: 500, is_paid: !!gorevOdenmis
  }).select().single();
  return { booking: b, task: ct };
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB REZERVASYON SİLME ATOMİKLİĞİ TESTLERİ');
  console.log('=============================================================================\n');

  const stamp = Date.now();
  let owner, outsider, viewer;

  try {
    owner = await makeUser('owner', stamp);
    outsider = await makeUser('outsider', stamp);
    const A = await kur(owner.client, 'Silme Testi A');
    const B = await kur(outsider.client, 'Silme Testi B');

    // --- 1 & 2: normal silme -------------------------------------------------
    console.log('--- 1. NORMAL SİLME ---');
    const r1 = await rezervasyonEkle(owner.client, A.tenantId, A.propertyId, 'D-1', '03', false);
    const r1p = await rezervasyonEkle(owner.client, A.tenantId, A.propertyId, 'D-2', '04', true);

    const { data: res1, error: e1 } = await owner.client.rpc('delete_booking_atomic', {
      p_booking_id: r1.booking.id, p_tenant_id: A.tenantId
    });
    check(!e1 && res1 && res1.deleted === true, '1. Normal silme çalışır', e1 ? e1.message : JSON.stringify(res1));

    const { data: kalanB } = await admin.from('bookings').select('id').eq('id', r1.booking.id);
    const { data: kalanT } = await admin.from('cleaning_tasks').select('id').eq('id', r1.task.id);
    check((kalanB || []).length === 0 && (kalanT || []).length === 0,
      '1b. Rezervasyon ve ödenmemiş görevi birlikte silinir',
      `rezervasyon=${(kalanB || []).length} gorev=${(kalanT || []).length}`);

    // Odenmis gorev korunmali
    await owner.client.rpc('delete_booking_atomic', { p_booking_id: r1p.booking.id, p_tenant_id: A.tenantId });
    const { data: odenmis } = await admin.from('cleaning_tasks').select('id,booking_id').eq('id', r1p.task.id);
    check((odenmis || []).length === 1 && odenmis[0].booking_id === null,
      '2. Ödenmiş temizlik görevi korunur, bağlantısı boşalır',
      JSON.stringify(odenmis));

    // --- 3 & 4: kapanmis donem + atomiklik -----------------------------------
    console.log('\n--- 2. KAPANMIŞ DÖNEM & ATOMİKLİK ---');
    const r2 = await rezervasyonEkle(owner.client, A.tenantId, A.propertyId, 'D-3', '05', false);
    const { error: ce } = await owner.client.from('monthly_financial_closes')
      .insert({ tenant_id: A.tenantId, year: 2026, month: 5, status: 'CLOSED' });
    if (ce) throw new Error('donem kapatilamadi: ' + ce.message);

    const { error: e3 } = await owner.client.rpc('delete_booking_atomic', {
      p_booking_id: r2.booking.id, p_tenant_id: A.tenantId
    });
    check(!!e3, '3. Kapanmış dönemde silme reddedilir', 'silme kabul edildi!');

    const { data: hb } = await admin.from('bookings').select('id').eq('id', r2.booking.id);
    const { data: ht } = await admin.from('cleaning_tasks').select('id').eq('id', r2.task.id);
    check((hb || []).length === 1 && (ht || []).length === 1,
      '4. Reddedilen silmede temizlik görevi de KAYBOLMAZ (atomiklik)',
      `rezervasyon=${(hb || []).length} gorev=${(ht || []).length} — gorev 0 ise kismi mutasyon geri geldi`);

    // --- 5: yabanci isletme ---------------------------------------------------
    console.log('\n--- 3. YETKİ ---');
    const rB = await rezervasyonEkle(outsider.client, B.tenantId, B.propertyId, 'D-4', '06', false);
    const { error: e5 } = await owner.client.rpc('delete_booking_atomic', {
      p_booking_id: rB.booking.id, p_tenant_id: B.tenantId
    });
    check(!!e5, '5. Başka işletmenin rezervasyonu silinemez', 'yabanci rezervasyon silinebildi!');

    // --- 6: viewer rolu -------------------------------------------------------
    viewer = await makeUser('viewer', stamp);
    await owner.client.rpc('create_tenant_invitation', {
      p_tenant_id: A.tenantId, p_email: viewer.email, p_role: 'viewer'
    });
    await viewer.client.rpc('accept_pending_invitations');
    const r3 = await rezervasyonEkle(owner.client, A.tenantId, A.propertyId, 'D-5', '08', false);
    const { error: e6 } = await viewer.client.rpc('delete_booking_atomic', {
      p_booking_id: r3.booking.id, p_tenant_id: A.tenantId
    });
    check(!!e6, '6. Viewer rolü rezervasyon silemez', 'viewer silebildi!');

    // --- 7: olmayan kayit -----------------------------------------------------
    const { error: e7 } = await owner.client.rpc('delete_booking_atomic', {
      p_booking_id: '00000000-0000-4000-8000-000000000001', p_tenant_id: A.tenantId
    });
    check(!!e7, '7. Olmayan rezervasyon için hata döner', 'olmayan kayit icin hata donmedi');

  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMİZLİK ---');
    let hata = false;
    for (const c of [owner, outsider, viewer]) {
      if (c && c.client) { try { await c.client.auth.signOut(); } catch (e) {} }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(r => setTimeout(r, a * 400));
      }
    }
    for (const t of createdTenants) if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    for (const u of createdUsers) if (!await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;

    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }

    if (hata) failed++; else ok('8. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
