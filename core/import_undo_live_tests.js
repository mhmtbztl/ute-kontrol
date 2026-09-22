/**
 * PHASE 35 — ICE AKTARIM GERI ALMA (CANLI DAVRANIS TESTI)
 *
 * Kaynak taramasi `undo_finance_import`'un DOSYADA ne yazdigini olcer;
 * veritabaninda ne YAPTIGINI olcemez. Bu suitin varlik sebebi odur.
 *
 * Olculen sekiz davranis:
 *   1. Kontrol grubu — sahip kendi aktarimini geri alabiliyor (her seyi
 *      reddeden bir koruma da "guvenli" gorunur).
 *   2. Sonradan DEGISTIRILMIS kayit silinmiyor, atlaniyor.
 *   3. Kapanmis doneme dusen kayit varsa HICBIR SEY silinmiyor.
 *   4. Yazili onay olmadan calismiyor.
 *   5. Yabanci kiraci baskasinin aktarimini geri alamiyor.
 *   6. viewer/staff rolleri geri alamiyor.
 *   7. `anon` — tarayicida duran anahtar — ne fonksiyonu cagirabiliyor ne
 *      bag tablosunu okuyabiliyor.
 *   8. Kayit baska yoldan silinince bag da gidiyor (sarkik bag kalmiyor).
 *
 * Goc uygulanmamis bir veritabaninda KIRMIZI kalir — beklenen durumdur
 * (CLAUDE.md 4.2: davranis gocleri boyle dogrulanir).
 *
 * YALNIZCA ayri test projesine kosar; uretim `core/test_env.js` icinde
 * kara listededir ve bu reddedilemez.
 */
const { createClient } = require('@supabase/supabase-js');

const env = require('./test_env.js').loadTestEnv();

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

let passed = 0, failed = 0;
const users = [], tenants = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d || 'kosul saglanmadi');

const stamp = Date.now().toString(36);
const ONAY = 'AKTARIMI GERI AL';

async function makeOwner(label) {
  const email = `p35_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P35!' + stamp + 'Aa';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label} kullanici: ${error.message}`);
  users.push(data.user.id);
  const client = newClient();
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`${label} giris: ${e2.message}`);
  const { data: t, error: e3 } = await client.rpc('create_tenant_and_owner', {
    p_company_name: `Phase35 ${label} ${stamp}`, p_full_name: 'P35'
  });
  if (e3) throw new Error(`${label} tenant: ${e3.message}`);
  tenants.push(t.tenant_id);
  const { data: p, error: e4 } = await client.from('properties')
    .insert({ tenant_id: t.tenant_id, name: 'Villa ' + label, slug: `p35${label}${stamp}`, base_price: 12000 })
    .select().single();
  if (e4) throw new Error(`${label} mulk: ${e4.message}`);
  return { client, tenantId: t.tenant_id, propertyId: p.id, userId: data.user.id };
}

async function makeMember(tenantId, label, role) {
  const email = `p35_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P35!' + stamp + 'Aa';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`${label} kullanici: ${error.message}`);
  users.push(data.user.id);
  const { error: me } = await admin.from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: data.user.id, role });
  if (me) throw new Error(`${label} uyelik: ${me.message}`);
  const client = newClient();
  const { error: le } = await client.auth.signInWithPassword({ email, password });
  if (le) throw new Error(`${label} giris: ${le.message}`);
  return client;
}

/** Bir aktarim partisi ve ona bagli kayitlar uretir. */
async function sahteAktarim(sahip, ek) {
  const ayar = ek || {};
  const gun = ayar.gun || 5;
  const { data: parti, error: pe } = await sahip.client.from('finance_import_batches').insert({
    tenant_id: sahip.tenantId,
    file_hash: 'h' + stamp + Math.random().toString(36).slice(2, 10),
    filename: ayar.ad || 'defter.xlsx',
    row_count: 2,
    imported_amount: 50000
  }).select('id').single();
  if (pe) throw new Error('parti: ' + pe.message);

  const { data: rez, error: re } = await sahip.client.from('bookings').insert({
    tenant_id: sahip.tenantId, property_id: sahip.propertyId,
    booking_code: 'P35' + stamp + Math.random().toString(36).slice(2, 7).toUpperCase(),
    guest_name: 'Aktarim Misafiri', channel: 'Direct',
    check_in: `2026-${String(ayar.ay || 11).padStart(2, '0')}-${String(gun).padStart(2, '0')}`,
    check_out: `2026-${String(ayar.ay || 11).padStart(2, '0')}-${String(gun + 2).padStart(2, '0')}`,
    pax: 2, gross_amount: 30000
  }).select('id').single();
  if (re) throw new Error('rezervasyon: ' + re.message);

  const { data: gid, error: ge } = await sahip.client.from('expenses').insert({
    tenant_id: sahip.tenantId, property_id: sahip.propertyId,
    expense_date: `2026-${String(ayar.ay || 11).padStart(2, '0')}-${String(gun).padStart(2, '0')}`,
    category: 'Aktarim Gideri', amount: 20000, expense_type: 'OPEX'
  }).select('id').single();
  if (ge) throw new Error('gider: ' + ge.message);

  const { error: be } = await sahip.client.from('finance_import_batch_rows').insert([
    { tenant_id: sahip.tenantId, batch_id: parti.id, booking_id: rez.id, source_row_num: 2 },
    { tenant_id: sahip.tenantId, batch_id: parti.id, expense_id: gid.id, source_row_num: 3 }
  ]);
  if (be) throw new Error('bag: ' + be.message);

  return { batchId: parti.id, bookingId: rez.id, expenseId: gid.id };
}

async function run() {
  const A = await makeOwner('a');
  const B = await makeOwner('b');
  const viewer = await makeMember(A.tenantId, 'viewer', 'viewer');
  const staff = await makeMember(A.tenantId, 'staff', 'staff');
  const anon = newClient();

  // -------------------------------------------------------------------------
  // 1. KONTROL GRUBU
  // -------------------------------------------------------------------------
  const a1 = await sahteAktarim(A);
  const { data: s1, error: e1 } = await A.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a1.batchId, p_confirm: ONAY
  });
  check(!e1 && s1 && s1.success === true,
    '1. Sahip kendi aktarimini geri alabiliyor', e1 && e1.message);
  check(s1 && s1.deleted_bookings === 1 && s1.deleted_expenses === 1,
    '2. Her iki defterden de kayit siliniyor', JSON.stringify(s1));

  const { data: kalanRez } = await admin.from('bookings').select('id').eq('id', a1.bookingId);
  const { data: kalanGid } = await admin.from('expenses').select('id').eq('id', a1.expenseId);
  check((kalanRez || []).length === 0 && (kalanGid || []).length === 0,
    '3. Kayitlar veritabanindan GERCEKTEN silinmis',
    `rezervasyon=${(kalanRez || []).length} gider=${(kalanGid || []).length}`);

  const { data: kalanParti } = await admin.from('finance_import_batches')
    .select('id').eq('id', a1.batchId);
  check((kalanParti || []).length === 0 && s1 && s1.batch_removed === true,
    '4. Her sey geri alindiysa parti kaydi da siliniyor (dosya yeniden yuklenebilir)',
    `kalan parti=${(kalanParti || []).length}`);

  // -------------------------------------------------------------------------
  // 2. SONRADAN DEGISTIRILMIS KAYIT ATLANIR
  // -------------------------------------------------------------------------
  const a2 = await sahteAktarim(A, { gun: 10, ad: 'duzenlenmis.xlsx' });
  // Kullanici aktarimdan sonra rezervasyonu elle duzeltiyor.
  const { error: ue } = await A.client.from('bookings')
    .update({ guest_name: 'Elle Duzeltilmis Misafir' }).eq('id', a2.bookingId);
  check(!ue, '5. Aktarilan kayit elle duzenlenebiliyor (kurulum)', ue && ue.message);

  const { data: s2, error: e2 } = await A.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a2.batchId, p_confirm: ONAY
  });
  check(!e2 && s2 && s2.skipped_modified === 1 && s2.deleted_expenses === 1,
    '6. Sonradan duzenlenen kayit ATLANIYOR, digeri siliniyor',
    JSON.stringify(s2) + (e2 ? ' | ' + e2.message : ''));

  const { data: duranRez } = await admin.from('bookings')
    .select('guest_name').eq('id', a2.bookingId).maybeSingle();
  check(duranRez && duranRez.guest_name === 'Elle Duzeltilmis Misafir',
    '7. Kullanicinin duzenlemesi KORUNUYOR',
    'Aktarimdan sonra elle duzeltilen kayit artik "aktarilan veri" degil, ' +
    'kullanicinin emegidir. Donen: ' + JSON.stringify(duranRez));

  check(s2 && s2.batch_removed === false,
    '8. Atlanan kayit varsa parti DURUYOR (geride kalanin kaynagi bilinsin)',
    JSON.stringify(s2));

  // -------------------------------------------------------------------------
  // 3. KAPANMIS DONEM — HIC BASLAMAZ
  // -------------------------------------------------------------------------
  const a3 = await sahteAktarim(A, { ay: 8, gun: 12, ad: 'kapali-donem.xlsx' });
  // Servis anahtariyla yazilir: `guard_monthly_close_write` service_role'u
  // bakim/goc icin muaf tutar (phase20). Kapanis kaydinin sutunlari
  // tenant/year/month/status + closed_at'tir; tutar sutunu yoktur, ozet
  // `snapshot_json` icinde durur.
  const { error: ce } = await admin.from('monthly_financial_closes').insert({
    tenant_id: A.tenantId, year: 2026, month: 8, status: 'CLOSED',
    closed_at: new Date().toISOString()
  });
  check(!ce, '9. Donem kapatilabiliyor (kurulum)', ce && ce.message);

  const { error: e3 } = await A.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a3.batchId, p_confirm: ONAY
  });
  check(e3 && String(e3.message || '').indexOf('CLOSED_PERIOD_BLOCK') !== -1,
    '10. Kapanmis doneme dusen aktarim geri ALINAMIYOR', e3 && e3.message);

  const { data: duran } = await admin.from('bookings').select('id').eq('id', a3.bookingId);
  const { data: duranG } = await admin.from('expenses').select('id').eq('id', a3.expenseId);
  check((duran || []).length === 1 && (duranG || []).length === 1,
    '11. Reddedilen geri almada HICBIR kayit silinmemis (yarim is yok)',
    `rezervasyon=${(duran || []).length} gider=${(duranG || []).length}. Yarisini ` +
    'silip yarisini birakmak, duzeltilmek istenen karisikligin daha kotusunu uretirdi.');

  // -------------------------------------------------------------------------
  // 4. ONAY METNI
  // -------------------------------------------------------------------------
  const a4 = await sahteAktarim(A, { gun: 15, ad: 'onaysiz.xlsx' });
  const { error: e4 } = await A.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a4.batchId, p_confirm: 'evet'
  });
  check(e4 && String(e4.message || '').indexOf('CONFIRMATION_REQUIRED') !== -1,
    '12. Yazili onay olmadan geri alma calismiyor', e4 && e4.message);
  const { data: a4Rez } = await admin.from('bookings').select('id').eq('id', a4.bookingId);
  check((a4Rez || []).length === 1, '13. Onaysiz cagri hicbir sey silmemis', 'Kayit gitmis.');

  // -------------------------------------------------------------------------
  // 5. CAPRAZ KIRACI
  // -------------------------------------------------------------------------
  const { error: e5 } = await B.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a4.batchId, p_confirm: ONAY
  });
  check(e5 && String(e5.message || '').indexOf('UNAUTHORIZED') !== -1,
    '14. Yabanci kiraci baskasinin aktarimini geri ALAMIYOR', e5 && e5.message);
  const { data: a4Rez2 } = await admin.from('bookings').select('id').eq('id', a4.bookingId);
  check((a4Rez2 || []).length === 1, '15. Capraz denemede kayit duruyor', 'Kayit silinmis!');

  // Yabanci kiraci bagi OKUYAMAMALI da.
  const { data: yabanciBag } = await B.client.from('finance_import_batch_rows')
    .select('id').eq('tenant_id', A.tenantId);
  check((yabanciBag || []).length === 0,
    '16. Yabanci kiraci bag tablosunu okuyamiyor (RLS)',
    `gorunen satir: ${(yabanciBag || []).length}`);

  // -------------------------------------------------------------------------
  // 6. ROLLER
  // -------------------------------------------------------------------------
  const { error: e6 } = await viewer.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a4.batchId, p_confirm: ONAY
  });
  check(e6 && String(e6.message || '').indexOf('UNAUTHORIZED') !== -1,
    '17. viewer geri alamiyor', e6 && e6.message);

  const { error: e7 } = await staff.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a4.batchId, p_confirm: ONAY
  });
  check(e7 && String(e7.message || '').indexOf('UNAUTHORIZED') !== -1,
    '18. staff geri alamiyor (toplu silme yonetim isidir)', e7 && e7.message);

  // -------------------------------------------------------------------------
  // 7. ANON KAPISI
  //
  // Supabase `public` semasindaki yeni nesnelere varsayilan olarak `anon`
  // yetkisi verir ve `REVOKE ALL ... FROM PUBLIC` bunu KALDIRMAZ (7).
  // -------------------------------------------------------------------------
  const { error: e8 } = await anon.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId, p_batch_id: a4.batchId, p_confirm: ONAY
  });
  check(e8 && (e8.code === '42501' || String(e8.message || '').indexOf('permission denied') !== -1),
    '19. anon geri alma fonksiyonunu CAGIRAMIYOR',
    'Donen: ' + JSON.stringify(e8) + ' — fonksiyonun kendi hata mesaji donduyse ' +
    'anon govdeye kadar girmis demektir.');

  const { error: e9 } = await anon.from('finance_import_batch_rows').select('tenant_id').limit(1);
  check(e9 && (e9.code === '42501' || String(e9.message || '').indexOf('permission denied') !== -1),
    '20. anon bag tablosunu okuyamiyor',
    'Donen: ' + JSON.stringify(e9) + ' — 200 donduyse yetki birakilmis ve ' +
    'koruma tek katliya dusmus demektir.');

  // -------------------------------------------------------------------------
  // 8. SARKIK BAG KALMIYOR
  // -------------------------------------------------------------------------
  const { error: de } = await A.client.from('bookings').delete().eq('id', a4.bookingId);
  check(!de, '21. Aktarilan kayit normal yoldan silinebiliyor (kurulum)', de && de.message);
  const { data: sarkik } = await admin.from('finance_import_batch_rows')
    .select('id').eq('booking_id', a4.bookingId);
  check((sarkik || []).length === 0,
    '22. Kayit silinince bag da gidiyor (ON DELETE CASCADE)',
    `sarkik bag: ${(sarkik || []).length}. Sarkik bag, geri almayi var olmayan ` +
    'kayitlara yoneltirdi.');

  // -------------------------------------------------------------------------
  // 9. OLMAYAN PARTI
  // -------------------------------------------------------------------------
  const { error: e10 } = await A.client.rpc('undo_finance_import', {
    p_tenant_id: A.tenantId,
    p_batch_id: '00000000-0000-4000-8000-000000000000',
    p_confirm: ONAY
  });
  check(e10 && String(e10.message || '').indexOf('NOT_FOUND') !== -1,
    '23. Olmayan parti icin acik hata donuyor', e10 && e10.message);
}

async function cleanup() {
  for (const t of tenants) await admin.from('tenants').delete().eq('id', t);
  for (const u of users) await admin.auth.admin.deleteUser(u);
}

(async () => {
  try {
    await run();
  } catch (e) {
    failed++;
    console.error('[FAIL] calisma hatasi\n       ' + (e && e.message ? e.message : e));
  } finally {
    // Ozet `finally` icinde: `try` icindeki bir `return` ozeti ve cikis
    // kodunu atlar, suit hatali oldugu halde 0 ile cikar (CLAUDE.md 5.2).
    try { await cleanup(); } catch (e) { console.error('temizlik hatasi: ' + e.message); }
    console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED`);
    process.exit(failed ? 1 : 0);
  }
})();
