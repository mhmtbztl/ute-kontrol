/**
 * LEXBNB — SAHIPSIZ FOTOGRAF TEMIZLIGI (CEVRIMDISI, SAHTE ISTEMCI)
 *
 * Canli davranisi phase43_period_reset_live_tests olcer (5a-5d). Bu suit
 * silme kararinin mantigini veritabani olmadan, CI'da tutar. En onemlisi
 * 5. iddia: veritabani okunamazsa hicbir dosya silinmez.
 */

const { planOrphanCleanup, runOrphanCleanup } = require('./storage_orphan_cleanup.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

const T1 = '11111111-1111-4111-8111-111111111111'; // yasiyor
const T2 = '22222222-2222-4222-8222-222222222222'; // silinmis
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; // T1'de yasiyor
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; // T1'den silinmis

function fakeClient({ files, tenants, properties, failTable, failList }) {
  const store = new Set(files);
  const removed = [];
  const list = async (prefix, { limit, offset }) => {
    if (failList) return { data: null, error: { message: 'liste hatasi' } };
    const base = prefix ? prefix + '/' : '';
    const names = new Map();
    for (const f of store) {
      if (!f.startsWith(base)) continue;
      const rest = f.slice(base.length);
      const [head, ...tail] = rest.split('/');
      names.set(head, tail.length ? null : 'file-id');
    }
    const all = [...names.entries()].sort().map(([name, id]) => ({ name, id }));
    return { data: all.slice(offset, offset + limit), error: null };
  };
  const storage = { from: () => ({ list, remove: async paths => { paths.forEach(p => { store.delete(p); removed.push(p); }); return { error: null }; } }) };
  const from = table => {
    const rows = table === 'tenants' ? tenants.map(id => ({ id })) : properties;
    // PostgREST sorgu nesnesi gibi: zincirlenir, await edilince cozulur.
    let filt = rows, from = 0, to = Infinity;
    const q = {
      select: () => q, order: () => q,
      eq: (col, v) => { filt = filt.filter(r => r[col] === v); return q; },
      range: (a, b) => { from = a; to = b; return q; },
      then: (res, rej) => Promise.resolve(failTable === table
        ? { data: null, error: { message: 'simule ag hatasi' } }
        : { data: filt.slice(from, to + 1).map(r => ({ id: r.id })), error: null }).then(res, rej)
    };
    return q;
  };
  return { client: { storage, from }, store, removed };
}

async function run() {
  console.log('LEXBNB SAHIPSIZ FOTOGRAF TEMIZLIGI (CEVRIMDISI)\n');
  const files = [
    `${T1}/${P1}/m1/original.jpg`,
    `${T1}/${P2}/m2/original.jpg`,
    `${T1}/${P2}/m2/thumb.webp`,
    `${T2}/${P1}/m3/original.jpg`,
    'README-not-a-tenant/x.txt',
    `${T1}/not-a-uuid/y.jpg`
  ];
  const base = { files, tenants: [T1], properties: [{ id: P1, tenant_id: T1 }] };

  let f = fakeClient(base);
  const plan = await planOrphanCleanup(f.client);
  const pre = plan.prefixes.map(p => `${p.prefix}:${p.reason}`).sort();
  check(JSON.stringify(pre) === JSON.stringify([`${T1}/${P2}:PROPERTY_GONE`, `${T2}:TENANT_GONE`].sort()),
    '1. Plan yalnizca silinmis isletme ve silinmis mulk klasorlerini secer', JSON.stringify(pre));

  f = fakeClient(base);
  const dry = await runOrphanCleanup(f.client, { dryRun: true });
  check(f.removed.length === 0 && dry.removed === 0, '2. Kuru calisma hicbir dosya silmez', JSON.stringify(f.removed));

  f = fakeClient(base);
  const res = await runOrphanCleanup(f.client);
  check(res.removed === 3 && !f.store.has(`${T2}/${P1}/m3/original.jpg`) && !f.store.has(`${T1}/${P2}/m2/thumb.webp`),
    '3. Sahipsiz 3 dosya (ic ice klasorler dahil) silinir', JSON.stringify(f.removed));
  check(f.store.has(`${T1}/${P1}/m1/original.jpg`), '4. Yasayan mulkun dosyasina dokunulmaz', 'silindi');
  check(f.store.has('README-not-a-tenant/x.txt') && f.store.has(`${T1}/not-a-uuid/y.jpg`),
    '4b. Beklenmeyen yapidaki klasorlere dokunulmaz', 'silindi');

  for (const table of ['tenants', 'properties']) {
    f = fakeClient({ ...base, failTable: table });
    let err = null;
    try { await runOrphanCleanup(f.client); } catch (e) { err = e; }
    check(!!err && f.removed.length === 0,
      `5. ${table} okunamazsa HICBIR dosya silinmez ("okuyamadim" "yok" degildir)`, err ? JSON.stringify(f.removed) : 'hata firlatmadi');
  }

  f = fakeClient({ ...base, failList: true });
  let e2 = null;
  try { await runOrphanCleanup(f.client); } catch (e) { e2 = e; }
  check(!!e2 && f.removed.length === 0, '6. Depo listelenemezse hata firlatir, silmez', e2 ? '' : 'hata firlatmadi');

  // Yetkisiz anahtar: tenants hatasiz ama bos doner -> her sey sahipsiz gorunur.
  f = fakeClient({ ...base, tenants: [] });
  let e3 = null;
  try { await runOrphanCleanup(f.client); } catch (e) { e3 = e; }
  check(!!e3 && /NO_TENANTS_VISIBLE/.test(e3.message) && f.removed.length === 0,
    '6b. Hic isletme gorunmuyorsa (yanlis anahtar) HICBIR dosya silinmez', e3 ? JSON.stringify(f.removed) : 'hata firlatmadi');

  // Sayfalama: 1000'den fazla isletme -> ikinci sayfadaki isletme "yok" sanilmamali
  const many = Array.from({ length: 1500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const last = many[many.length - 1];
  f = fakeClient({ files: [`${last}/${P1}/m/original.jpg`], tenants: many, properties: [{ id: P1, tenant_id: last }] });
  await runOrphanCleanup(f.client);
  check(f.removed.length === 0, '7. Isletme listesi sayfalanir: 1000. siradan sonraki isletme silinmez', JSON.stringify(f.removed));

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('[FAIL] beklenmedik: ' + e.message); process.exit(1); });
