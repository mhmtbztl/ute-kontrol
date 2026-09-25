/**
 * LEXBNB PHASE 43 — AY KAPANISI, SIFIRLAMA, HESAP KAPATMA (CANLI, YALNIZ TEST PROJESI)
 *
 *   L-08  Devam eden ay kapatilamaz (gun Europe/Istanbul'a gore).
 *   L-09  Sifirlama kendi denetim kaydini, silmeden SONRA ve dogru sutunlarla
 *         yazar; hata yutulmaz.
 *   L-10  financial_transactions satiri sifirlamayi ve hesap kapatmayi
 *         kilitlemez.
 *   L-11  Kapali donemde rezervasyonun kanal/kisi/misafir alanlari ve
 *         temizlik gorevleri degismez; odeme durumu degisebilir.
 *   L-12  Sahibi kalmamis mulk fotograflari depodan silinir
 *         (core/storage_orphan_cleanup.js).
 *
 * phase43 UYGULANMADAN kosulursa kirilir. Oyle olmali (CLAUDE.md 5.5).
 */

const { createClient } = require('@supabase/supabase-js');
const { runOrphanCleanup, listFilesRecursive, BUCKET } = require('./storage_orphan_cleanup.js');

const env = require('./test_env.js').loadTestEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
const newClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, opts);

let passed = 0, failed = 0;
const createdUsers = [];
const createdTenants = [];
const uploaded = [];
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const hataMetni = e => (e && (e.message || e.code)) ? `${e.code || ''} ${e.message || ''}`.trim() : '';
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

// Istanbul gunu: kayitlar bu takvime yazilir (getTodayStr ile ayni kaynak).
const bugunIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
function ayBilgisi() {
  const [y, m] = bugunIst().split('-').map(Number);
  const onceki = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const pad = n => String(n).padStart(2, '0');
  return { cur: { y, m }, prev: onceki, prevDay: d => `${onceki.y}-${pad(onceki.m)}-${pad(d)}` };
}

async function makeUser(label, stamp) {
  const email = `p43_${label}_${stamp}@lexbnb-e2e.test`;
  const password = 'P43!' + stamp;
  const d = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), label);
  createdUsers.push(d.user.id);
  const client = newClient();
  must(await client.auth.signInWithPassword({ email, password }), label + ' giris');
  return { id: d.user.id, email, client };
}
async function makeTenant(u, name) {
  const t = must(await u.client.rpc('create_tenant_and_owner', { p_company_name: name, p_full_name: 'P43' }), 'isletme');
  createdTenants.push(t.tenant_id);
  return t.tenant_id;
}
async function mulk(tid, s, tag) {
  return must(await admin.from('properties').insert({ tenant_id: tid, name: 'Villa ' + tag, slug: 'p43' + tag + s, base_price: 10000 }).select().single(), 'mulk ' + tag);
}
async function rez(tid, pid, code, ci, co) {
  return must(await admin.from('bookings').insert({ tenant_id: tid, property_id: pid, booking_code: code, guest_name: 'Misafir',
    channel: 'Airbnb', check_in: ci, check_out: co, gross_amount: 20000, pax: 4 }).select().single(), 'rezervasyon ' + code);
}
async function ft(tid, pid, bid, by) {
  return must(await admin.from('financial_transactions').insert({ tenant_id: tid, property_id: pid, booking_id: bid,
    transaction_type: 'PAYMENT', amount: 1000, occurred_on: bugunIst(), created_by: by }).select().single(), 'financial_transactions');
}
async function yukle(pathStr) {
  const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  must(await admin.storage.from(BUCKET).upload(pathStr, body, { contentType: 'image/jpeg', upsert: true }), 'yukleme ' + pathStr);
  uploaded.push(pathStr);
}

async function run() {
  console.log('=============================================================================');
  console.log('LEXBNB PHASE 43 — AY KAPANISI / SIFIRLAMA / HESAP KAPATMA (CANLI)');
  console.log('=============================================================================\n');

  const s = Date.now();
  const { cur, prev, prevDay } = ayBilgisi();
  const clients = [];
  try {
    const own = await makeUser('own', s), sh = await makeUser('sh', s), mgr = await makeUser('mgr', s), solo = await makeUser('solo', s), stf = await makeUser('stf', s);
    clients.push(own, sh, mgr, solo, stf);
    const A = await makeTenant(own, 'P43 A ' + s);
    const S = await makeTenant(sh, 'P43 S ' + s);
    const T = await makeTenant(solo, 'P43 T ' + s);
    must(await admin.from('tenant_members').insert({ tenant_id: S, user_id: mgr.id, role: 'manager' }), 'ortak uye');
    must(await admin.from('tenant_members').insert({ tenant_id: S, user_id: stf.id, role: 'staff' }), 'ortak personel');

    const pA = await mulk(A, s, 'a');
    const bkA = await rez(A, pA.id, 'P43A-' + s, prevDay(10), prevDay(13));
    const taskA = must(await admin.from('cleaning_tasks').insert({ tenant_id: A, property_id: pA.id, booking_id: bkA.id,
      task_date: prevDay(13), cleaner_name: 'Ayse', amount: 1200, is_paid: false,
      // phase45: odeme yalniz YAPILMIS temizlige yapilir. Kapanistan once yapilmis
      // bir temizligin odemesi kapanistan sonra serbesttir (2g).
      status: 'DONE' }).select().single(), 'temizlik');

    // -----------------------------------------------------------------------
    console.log('--- 1. L-08: DEVAM EDEN AY ---');
    let r = await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: cur.y, p_month: cur.m, p_snapshot: {} });
    check(!!r.error && /PERIOD_NOT_ENDED/.test(r.error.message),
      `1a. Devam eden ay (${cur.y}-${cur.m}) KAPATILAMAZ`, r.error ? hataMetni(r.error) : 'IZIN VERILDI: ' + JSON.stringify(r.data).slice(0, 120));
    const kapKayit = must(await admin.from('monthly_financial_closes').select('status').eq('tenant_id', A).eq('year', cur.y).eq('month', cur.m), 'kapanis okuma');
    check(kapKayit.length === 0, '1b. Reddedilen kapanis kayit birakmadi', JSON.stringify(kapKayit));
    r = await own.client.rpc('close_monthly_period_atomic', { p_tenant_id: A, p_year: prev.y, p_month: prev.m, p_snapshot: {} });
    check(!r.error && r.data && r.data.success === true, `1c. Bitmis ay (${prev.y}-${prev.m}) kapatilmaya DEVAM EDER`, hataMetni(r.error) || JSON.stringify(r.data));

    // -----------------------------------------------------------------------
    console.log('\n--- 2. L-11: KAPALI DONEM ---');
    const bkOku = async () => must(await admin.from('bookings').select('channel,guest_name,pax,notes').eq('id', bkA.id).single(), 'rez okuma');
    for (const [alan, deger] of [['channel', 'Booking'], ['guest_name', 'Baska Misafir'], ['pax', 9]]) {
      r = await own.client.from('bookings').update({ [alan]: deger }).eq('id', bkA.id).select('id');
      const b = await bkOku();
      check(!!r.error && String(b[alan]) !== String(deger),
        `2a. Kapali donemde rezervasyonun ${alan} alani DEGISMEZ`, `${hataMetni(r.error) || 'hata yok'}; deger=${b[alan]}`);
    }
    r = await own.client.from('bookings').update({ notes: 'kapanistan sonra not' }).eq('id', bkA.id).select('id');
    check(!r.error && (await bkOku()).notes === 'kapanistan sonra not', '2b. Kapali donemde rezervasyon NOTU eklenebilir', hataMetni(r.error));

    const tOku = async () => must(await admin.from('cleaning_tasks').select('amount,is_paid,task_date').eq('id', taskA.id).maybeSingle(), 'temizlik okuma');
    r = await own.client.from('cleaning_tasks').update({ amount: 5000 }).eq('id', taskA.id).select('id');
    check(!!r.error && Number((await tOku()).amount) === 1200, '2c. Kapali donemdeki temizlik TUTARI degismez', hataMetni(r.error) || 'hata yok');
    r = await own.client.from('cleaning_tasks').update({ task_date: bugunIst() }).eq('id', taskA.id).select('id');
    check(!!r.error && (await tOku()).task_date === prevDay(13), '2d. Kapali donemdeki temizlik baska aya TASINAMAZ', hataMetni(r.error) || 'hata yok');
    r = await own.client.from('cleaning_tasks').insert({ tenant_id: A, property_id: pA.id, task_date: prevDay(20), cleaner_name: 'X', amount: 900, is_paid: false }).select('id');
    const sonradan = must(await admin.from('cleaning_tasks').select('id').eq('tenant_id', A).eq('task_date', prevDay(20)), 'temizlik sayim');
    check(!!r.error && sonradan.length === 0, '2e. Kapali doneme yeni temizlik gorevi EKLENEMEZ', hataMetni(r.error) || `${sonradan.length} satir eklendi`);
    r = await own.client.from('cleaning_tasks').delete().eq('id', taskA.id).select('id');
    check(!!(await tOku()), '2f. Kapali donemdeki temizlik gorevi SILINEMEZ', `${hataMetni(r.error)} silindi`);
    r = await own.client.from('cleaning_tasks').update({ is_paid: true }).eq('id', taskA.id).select('id');
    const odeme = await tOku();
    check(!r.error && !!odeme && odeme.is_paid === true, '2g. Kapali donemdeki temizlik ODENDI isaretlenebilir (odeme sonradan olur)', hataMetni(r.error));

    // -----------------------------------------------------------------------
    console.log('\n--- 3. L-09 / L-10: SIFIRLAMA ---');
    await ft(A, pA.id, bkA.id, own.id);
    r = await own.client.rpc('reset_tenant_data', { p_tenant_id: A, p_confirm: 'VERILERI SIFIRLA' });
    const kalanRez = must(await admin.from('bookings').select('id').eq('tenant_id', A), 'rez sayim');
    const kalanFt = must(await admin.from('financial_transactions').select('id').eq('tenant_id', A), 'ft sayim');
    check(!r.error && kalanRez.length === 0 && kalanFt.length === 0,
      '3a. financial_transactions satiri SIFIRLAMAYI KILITLEMEZ', `${hataMetni(r.error) || 'ok'}; rez=${kalanRez.length}, ft=${kalanFt.length}`);
    check(!r.error && r.data && r.data.deleted && r.data.deleted.financial_transactions === 1,
      '3b. Sifirlama raporu financial_transactions sayisini iceriyor', JSON.stringify(r.data && r.data.deleted));
    const iz = must(await admin.from('audit_logs').select('action,user_id,new_data').eq('tenant_id', A), 'audit okuma');
    const resetIz = iz.filter(x => x.action === 'TENANT_DATA_RESET');
    check(resetIz.length === 1 && resetIz[0].user_id === own.id && resetIz[0].new_data && Number(resetIz[0].new_data.total) > 0,
      '3c. Sifirlama KENDI denetim kaydini birakir (kim, ne kadar)', JSON.stringify(iz).slice(0, 300));
    check(iz.length === 1 && iz[0].action === 'TENANT_DATA_RESET', '3d. Denetim kaydi silmeden SONRA yazildi (eski kayitlar gitti, sifirlama izi kaldi)', `audit satirlari=${iz.length}`);

    // -----------------------------------------------------------------------
    console.log('\n--- 4. L-10: HESAP KAPATMA ---');
    const pS = await mulk(S, s, 's');
    const bkS = await rez(S, pS.id, 'P43S-' + s, prevDay(3), prevDay(5));
    const ftS = await ft(S, pS.id, bkS.id, mgr.id);
    // Yonetici kendi oturumuyla kayit girer: created_by = mgr (guard_created_by).
    const bkMgr = must(await mgr.client.from('bookings').insert({ tenant_id: S, property_id: pS.id, booking_code: 'P43M-' + s,
      guest_name: 'Misafir M', channel: 'Direct', check_in: prevDay(15), check_out: prevDay(17), gross_amount: 15000, pax: 2 }).select('id,created_by').single(), 'yonetici rezervasyonu');
    if (bkMgr.created_by !== mgr.id) throw new Error('created_by beklenen kullanici degil');
    const exMgr = must(await mgr.client.from('expenses').insert({ tenant_id: S, property_id: pS.id, expense_date: prevDay(16),
      category: 'Bakim', amount: 750, description: 'p43' }).select('id,created_by').single(), 'yonetici gideri');
    if (exMgr.created_by !== mgr.id) throw new Error('gider created_by beklenen kullanici degil');
    r = await mgr.client.rpc('close_monthly_period_atomic', { p_tenant_id: S, p_year: prev.y, p_month: prev.m, p_snapshot: {} });
    if (r.error) throw new Error('ortak donem kapatma: ' + r.error.message);
    r = await sh.client.rpc('reopen_monthly_period_atomic', { p_tenant_id: S, p_year: prev.y, p_month: prev.m, p_reason: 'Fatura duzeltmesi gerekiyor' });
    if (r.error) throw new Error('ortak donem acma: ' + r.error.message);
    r = await mgr.client.rpc('close_monthly_period_atomic', { p_tenant_id: S, p_year: prev.y, p_month: prev.m, p_snapshot: {} });
    if (r.error) throw new Error('ortak donem yeniden kapatma: ' + r.error.message);

    r = await mgr.client.rpc('delete_my_account', { p_confirmation: 'HESABIMI SIL' });
    const mgrKaldi = (await admin.auth.admin.getUserById(mgr.id)).data?.user;
    check(!r.error && !mgrKaldi,
      '4a. Ortak isletmede kayit olusturmus/donem kapatmis yonetici HESABINI KAPATABILIR', hataMetni(r.error) || 'kullanici hala var');
    const ftSKaldi = must(await admin.from('financial_transactions').select('id').eq('id', ftS.id), 'ft ortak');
    const kapS = must(await admin.from('monthly_financial_closes').select('status').eq('tenant_id', S), 'kapanis ortak');
    const exMgrKaldi = must(await admin.from('expenses').select('id,created_by').eq('id', exMgr.id), 'yonetici gider');
    const bkMgrKaldi = must(await admin.from('bookings').select('id,created_by').eq('id', bkMgr.id), 'yonetici rez');
    check(ftSKaldi.length === 1 && kapS.length === 1 && kapS[0].status === 'CLOSED' && bkMgrKaldi.length === 1 && bkMgrKaldi[0].created_by === null
          && exMgrKaldi.length === 1 && exMgrKaldi[0].created_by === null,
      '4b. Ortak isletmenin finans kaydi, kapanisi, rezervasyonu ve kapali donem gideri YERINDE kalir; created_by bosalir', `ft=${ftSKaldi.length}, kapanis=${JSON.stringify(kapS)}, rez=${JSON.stringify(bkMgrKaldi)}, gider=${JSON.stringify(exMgrKaldi)}`);

    // Yalniz rezervasyon girmis personel (donem islemi yok): created_by tek basina.
    const bkStf = must(await stf.client.from('bookings').insert({ tenant_id: S, property_id: pS.id, booking_code: 'P43F-' + s,
      guest_name: 'Misafir F', channel: 'Direct', check_in: bugunIst(), check_out: '2099-01-02', gross_amount: 1000, pax: 1 }).select('id').single(), 'personel rezervasyonu');
    r = await stf.client.rpc('delete_my_account', { p_confirmation: 'HESABIMI SIL' });
    const stfKaldi = (await admin.auth.admin.getUserById(stf.id)).data?.user;
    const bkStfKaldi = must(await admin.from('bookings').select('id,created_by').eq('id', bkStf.id), 'personel rez');
    check(!r.error && !stfKaldi && bkStfKaldi.length === 1 && bkStfKaldi[0].created_by === null,
      '4d. Ortak isletmede rezervasyon girmis uye hesabini kapatinca rezervasyon kalir, created_by BOSALIR (silinmis kullaniciyi gostermez)',
      hataMetni(r.error) || `kullanici=${!!stfKaldi}, rez=${JSON.stringify(bkStfKaldi)}`);

    const pT = await mulk(T, s, 't');
    const bkT = await rez(T, pT.id, 'P43T-' + s, prevDay(6), prevDay(8));
    await ft(T, pT.id, bkT.id, solo.id);
    const tDosya = `${T}/${pT.id}/p43/original.jpg`;
    const sDosya = `${S}/${pS.id}/p43/original.jpg`;
    await yukle(tDosya);
    await yukle(sDosya);
    r = await solo.client.rpc('delete_my_account', { p_confirmation: 'HESABIMI SIL' });
    const tKaldi = must(await admin.from('tenants').select('id').eq('id', T), 'tenant T');
    check(!r.error && tKaldi.length === 0,
      '4c. financial_transactions olan tek sahipli isletme hesapla birlikte SILINIR', `${hataMetni(r.error) || 'ok'}; tenant=${tKaldi.length}`);

    // -----------------------------------------------------------------------
    console.log('\n--- 5. L-12: SAHIPSIZ FOTOGRAF ---');
    const storage = admin.storage.from(BUCKET);
    const kuru = await runOrphanCleanup(admin, { dryRun: true });
    check(kuru.prefixes.some(p => p.prefix === T && p.reason === 'TENANT_GONE') &&
          (await listFilesRecursive(storage, T)).length === 1,
      '5a. Kuru calisma silinmis isletmeyi bulur ama DOSYAYA DOKUNMAZ', JSON.stringify(kuru.prefixes.slice(0, 5)));
    const gercek = await runOrphanCleanup(admin);
    check((await listFilesRecursive(storage, T)).length === 0,
      '5b. Silinmis isletmenin fotograflari depodan SILINDI', JSON.stringify(gercek).slice(0, 200));
    check((await listFilesRecursive(storage, `${S}/${pS.id}`)).length === 1,
      '5c. Yasayan isletmenin fotografina DOKUNULMADI', 'kontrol dosyasi silindi');

    // "Okuyamadim" "yok" sayilmaz: tenants okumasi hata verirse hic silinmez.
    const bozuk = { storage: admin.storage, from: t => t === 'tenants'
      ? { select: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'simule ag hatasi' } }) }) }) }
      : admin.from(t) };
    await yukle(tDosya);
    let atti = null;
    try { await runOrphanCleanup(bozuk); } catch (e) { atti = e; }
    check(!!atti && (await listFilesRecursive(storage, T)).length === 1,
      '5d. Veritabani okunamazsa HICBIR dosya silinmez', atti ? 'silindi' : 'hata firlatmadi');
  } catch (err) {
    no('Suit beklenmedik hata ile durdu', err && err.message ? err.message : String(err));
  } finally {
    console.log('\n--- TEMIZLIK ---');
    let hata = false;
    for (const c of clients) { try { await c.client.auth.signOut(); } catch (e) {} }
    if (uploaded.length) {
      const { error } = await admin.storage.from(BUCKET).remove(uploaded);
      if (error) { hata = true; console.error('[FAIL] dosyalar silinemedi: ' + error.message); }
    }
    async function retry(l, fn) {
      for (let a = 1; a <= 3; a++) {
        const { error } = await fn();
        if (!error) return true;
        if (a === 3) { console.error(`[FAIL] ${l}: ${error.message}`); return false; }
        await new Promise(res => setTimeout(res, a * 400));
      }
      return false;
    }
    for (const t of createdTenants) {
      await admin.from('financial_transactions').delete().eq('tenant_id', t);
      if (!await retry('Tenant ' + t, () => admin.from('tenants').delete().eq('id', t))) hata = true;
    }
    for (const u of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(u);
      if (data && data.user && !await retry('Kullanici ' + u, () => admin.auth.admin.deleteUser(u))) hata = true;
    }
    const { data: after } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const kalan = (after ? after.users : []).filter(u => createdUsers.includes(u.id));
    if (kalan.length) { hata = true; console.error(`[FAIL] ${kalan.length} test hesabi duruyor`); }
    if (hata) failed++; else ok('6. Test verileri eksiksiz temizlendi');

    console.log('\n=============================================================================');
    console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
    console.log('=============================================================================\n');
    if (failed > 0) process.exit(1);
  }
}

run();
