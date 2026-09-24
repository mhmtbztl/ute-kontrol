/**
 * LEXBNB — YEDEK MOTORU TESTI (CEVRIMDISI, SAHTE ISTEMCI)
 *
 * L-42: yedek eksiksiz mi (sayfalama, birincil anahtar sirasi), YALNIZCA
 * okuyor mu (yazma cagrisi sahte istemcide istisna firlatir), okunamayan
 * tablo "bos" sanilmiyor mu (hata olarak raporlanir).
 */

const crypto = require('crypto');
const { runBackup, discoverTables } = require('./backup_engine.js');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function kur({ tables, failTable, users = [], files = [] }) {
  const orders = {};
  const yazmaDenemesi = [];
  const yasak = name => () => { yazmaDenemesi.push(name); throw new Error('YAZMA_YASAK ' + name); };
  const from = name => {
    let from0 = 0, to0 = Infinity; orders[name] = [];
    const q = {
      select: () => q,
      order: col => { orders[name].push(col); return q; },
      range: (a, b) => { from0 = a; to0 = b; return q; },
      insert: yasak('insert'), update: yasak('update'), upsert: yasak('upsert'), delete: yasak('delete'),
      then: (res, rej) => Promise.resolve(failTable === name
        ? { data: null, error: { message: 'permission denied' } }
        : { data: tables[name].rows.slice(from0, to0 + 1), error: null }).then(res, rej)
    };
    return q;
  };
  const store = new Map(files.map(f => [f, Buffer.from('x')]));
  const client = {
    from, rpc: yasak('rpc'),
    auth: { admin: { listUsers: async ({ page, perPage }) => ({ data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null }), deleteUser: yasak('deleteUser') } },
    storage: { from: () => ({
      remove: yasak('remove'), upload: yasak('upload'),
      list: async (prefix, { limit, offset }) => {
        const base = prefix ? prefix + '/' : '';
        const names = new Map();
        for (const f of store.keys()) if (f.startsWith(base)) { const [h, ...t] = f.slice(base.length).split('/'); names.set(h, t.length ? null : 'id'); }
        return { data: [...names].sort().map(([name, id]) => ({ name, id, metadata: id ? { size: 1 } : null })).slice(offset, offset + limit), error: null };
      },
      download: async p => ({ data: { arrayBuffer: async () => store.get(p) }, error: null })
    }) }
  };
  const spec = { definitions: Object.fromEntries(Object.entries(tables).map(([n, t]) => [n, { properties: Object.fromEntries(t.cols.map(c => [c, { description: t.pk.includes(c) ? 'Note:\nThis is a Primary Key.<pk/>' : '' }])) }])) };
  const fetchFn = async () => ({ ok: true, json: async () => spec });
  const written = {};
  return { client, fetchFn, orders, yazmaDenemesi, written, writeFile: async (p, b) => { written[p] = b; } };
}

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const rows = n => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(6, '0'), v: i }));

(async () => {
  console.log('LEXBNB YEDEK MOTORU TESTI\n');
  const tables = {
    bookings: { cols: ['id', 'v'], pk: ['id'], rows: rows(2503) },
    tenant_settings: { cols: ['tenant_id', 'key', 'value'], pk: ['tenant_id', 'key'], rows: [{ tenant_id: 't', key: 'k', value: 1 }] },
    bos: { cols: ['id'], pk: ['id'], rows: [] }
  };
  let k = kur({ tables, users: rows(1500).map(r => ({ id: r.id, email: r.id + '@x.test' })), files: ['t/p/m/original.jpg', 't/p/m/thumb.webp'] });
  const m = await runBackup({ client: k.client, fetchFn: k.fetchFn, url: 'https://abc.supabase.co', key: 'k', writeFile: k.writeFile, sha256, withStorage: true, now: () => new Date('2026-09-24T00:00:00Z') });

  check(m.tables.bookings.rows === 2503 && JSON.parse(k.written['tables/bookings.json']).length === 2503,
    '1. 1000 satirlik sayfa sinirini asan tablo EKSIKSIZ yedeklenir (2503)', JSON.stringify(m.tables.bookings));
  check(JSON.stringify(k.orders.bookings) === '["id"]' && JSON.stringify(k.orders.tenant_settings) === '["tenant_id","key"]',
    '2. Sayfalar birincil anahtara (bilesik dahil) gore siralanir', JSON.stringify(k.orders));
  check(m.tables.bos.rows === 0 && k.written['tables/bos.json'] === '[]', '3. Bos tablo da yedekte yer alir', JSON.stringify(m.tables.bos));
  check(m.tables.bookings.sha256 === sha256(k.written['tables/bookings.json']), '4. Manifest ozeti dosya icerigiyle ayni', m.tables.bookings.sha256);
  check(m.auth_users.rows === 1500, '5. Kullanicilar sayfalanarak eksiksiz (1500)', JSON.stringify(m.auth_users));
  check(m.storage.objects === 2 && m.storage.downloaded === 2 && k.written['storage/property-media/t/p/m/thumb.webp'],
    '6. Depo dosyalari ic ice klasorlerden listelenir ve indirilir', JSON.stringify(m.storage));
  check(k.yazmaDenemesi.length === 0 && m.errors.length === 0, '7. Yedek HICBIR yazma cagrisi yapmaz', JSON.stringify(k.yazmaDenemesi));
  check(!!k.written['manifest.json'] && JSON.parse(k.written['manifest.json']).format === 'lexbnb-backup/1', '8. manifest.json yazilir', 'yok');

  k = kur({ tables, failTable: 'bookings' });
  const m2 = await runBackup({ client: k.client, fetchFn: k.fetchFn, url: 'https://abc.supabase.co', key: 'k', writeFile: k.writeFile, sha256 });
  check(m2.errors.some(e => /TABLE_READ_FAILED bookings/.test(e)) && !m2.tables.bookings && !k.written['tables/bookings.json'],
    '9. Okunamayan tablo BOS sayilmaz; hata olarak raporlanir (betik 1 ile cikar)', JSON.stringify(m2.errors));

  let e3 = null;
  try { await discoverTables(async () => ({ ok: true, json: async () => ({ definitions: {} }) }), 'https://abc.supabase.co', 'k'); } catch (e) { e3 = e; }
  check(!!e3 && /OPENAPI_NO_TABLES/.test(e3.message), '10. Hic tablo gorunmuyorsa (yanlis anahtar) bos yedek yazilmaz, hata verir', e3 ? e3.message : 'hata yok');

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('[FAIL] beklenmedik: ' + e.message); process.exit(1); });
