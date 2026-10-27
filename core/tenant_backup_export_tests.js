/**
 * LEXBNB — UYGULAMA ICI ISLETME YEDEGI (L-42 2. kisim, CEVRIMDISI)
 *
 *   A. Tablo listesi goclerle ayni (yeni tenant_id tablosu yedekten kacmaz).
 *   B. Motor: yalniz bu isletmenin satirlari, sayfalama, okuma hatasi
 *      manifest'e yazilir (eksik yedek "tam" sanilmaz), dosya bicimi.
 *   C. Geri yukleme betigi tek dosyayi kabul eder; baska isletmeye yukletmez.
 *   D. Arayuz: yalniz sahip, dugme ve eylem listesi.
 * Gidis-donusun kendisi canli: tenant_backup_live_tests.
 */
const fs = require('fs');
const path = require('path');
const { exportTenantBackup, readerFromFile, TENANT_TABLES, FORMAT } = require('./tenant_backup_export.js');
const { VIEWS } = require('./restore_engine.js');

const KOK = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(KOK, rel), 'utf8');
let passed = 0, failed = 0;
const check = (c, n, d) => { if (c) { passed++; console.log(`[PASS] ${n}`); } else { failed++; console.error(`[FAIL] ${n}\n       ${d || ''}`); } };

// --- A. Liste goclerle ayni ----------------------------------------------------
function goclerdenIsletmeTablolari() {
  const dosyalar = ['schema.sql', ...read('supabase/migration_manifest.txt').split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)[0])];
  const sql = dosyalar.map(f => read('supabase/' + f)).join('\n').replace(/\r\n/g, '\n').replace(/^﻿/gm, '').replace(/--[^\n]*/g, '');
  const sutun = {};
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    sutun[m[1]] = sutun[m[1]] || new Set();
    m[2].split('\n').forEach(l => { const c = l.trim().match(/^"?(\w+)"?\s+/); if (c) sutun[m[1]].add(c[1]); });
  }
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?public\.(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
    (sutun[m[1]] = sutun[m[1]] || new Set()).add(m[2]);
  }
  const silinen = new Set([...sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.(\w+)/gi)].map(m => m[1]));
  return Object.keys(sutun).filter(n => sutun[n].has('tenant_id') && !silinen.has(n) && !VIEWS.includes(n)).sort();
}
const BILEREK_YOK = ['ad_metric_period_days', 'invitation_delivery_outbox'];
const beklenen = goclerdenIsletmeTablolari().filter(n => !BILEREK_YOK.includes(n));
const eksik = beklenen.filter(n => !TENANT_TABLES.includes(n));
const fazla = TENANT_TABLES.filter(n => !beklenen.includes(n));
check(beklenen.length > 60 && eksik.length === 0, 'A1. Goclerdeki her tenant_id tablosu yedek listesinde (yeni tablo sessizce kacmaz)', 'eksik: ' + eksik.join(', '));
check(fazla.length === 0, 'A2. Listede goclerde olmayan tablo yok', 'fazla: ' + fazla.join(', '));
check(BILEREK_YOK.every(n => !TENANT_TABLES.includes(n)), 'A3. Kullaniciya kapali yan etki tablolari (reklam gunleri, davet kuyrugu) listede yok');

// --- B. Motor ------------------------------------------------------------------
function sahteIstemci(veri, hatali = []) {
  const istekler = [];
  return {
    istekler,
    from(tablo) {
      const kosul = [];
      let aralik = [0, 999];
      const q = {
        select: () => q,
        eq: (c, v) => { kosul.push(r => r[c] === v); istekler.push(`${tablo}.${c}=${v}`); return q; },
        in: (c, vs) => { kosul.push(r => vs.includes(r[c])); return q; },
        order: () => q,
        range: async (a, b) => {
          aralik = [a, b];
          if (hatali.includes(tablo)) return { data: null, error: { message: 'permission denied for table ' + tablo } };
          const satirlar = (veri[tablo] || []).filter(r => kosul.every(k => k(r)));
          return { data: satirlar.slice(aralik[0], aralik[1] + 1), error: null };
        }
      };
      return q;
    }
  };
}

(async () => {
  const T = 'aaaaaaaa-0000-4000-8000-000000000001', Y = 'bbbbbbbb-0000-4000-8000-000000000002';
  const coklu = Array.from({ length: 2345 }, (_, i) => ({ id: `b${String(i).padStart(5, '0')}`, tenant_id: T, gross_amount: 100.5 }));
  const veri = {
    tenants: [{ id: T, name: 'Bizim' }, { id: Y, name: 'Yabanci' }],
    tenant_members: [{ tenant_id: T, user_id: 'u1', role: 'owner' }, { tenant_id: Y, user_id: 'u9', role: 'owner' }],
    profiles: [{ id: 'u1', full_name: 'Sahip' }, { id: 'u9', full_name: 'Yabanci' }],
    bookings: [...coklu, { id: 'yb', tenant_id: Y, gross_amount: 1 }],
    guests: [{ id: 'g1', tenant_id: T, first_name: 'İlker Işık' }]
  };
  const ist = sahteIstemci(veri);
  const y = await exportTenantBackup({ client: ist, tenantId: T, now: '2026-10-27T10:00:00Z' });
  check(y.manifest.format === FORMAT && y.manifest.kind === 'tenant' && y.manifest.tenantId === T && y.manifest.createdAt === '2026-10-27T10:00:00.000Z',
    'B1. Dosya geri yukleme motorunun bicimi (lexbnb-backup/1, tek isletme)', JSON.stringify(y.manifest).slice(0, 200));
  check(y.tables.bookings.length === 2345 && y.manifest.tables.bookings.rows === 2345, 'B2. 1000 satiri asan tablo sayfa sayfa eksiksiz okunur', String(y.tables.bookings.length));
  const metin = JSON.stringify(y);
  check(!metin.includes(Y) && !metin.includes('Yabanci') && y.tables.tenants.length === 1 && y.tables.profiles.length === 1,
    'B3. Yalniz bu isletme: yabanci isletme, uyesi ve profili dosyaya girmez');
  check(y.tables.guests[0].first_name === 'İlker Işık' && y.tables.bookings[0].gross_amount === 100.5, 'B4. Turkce harf ve kurus aynen tasinir');
  check(y.manifest.errors.length === 0, 'B5. Hatasiz yedekte manifest.errors bos');

  const hatali = await exportTenantBackup({ client: sahteIstemci(veri, ['guests']), tenantId: T });
  check(hatali.manifest.errors.some(e => /guests/.test(e)), 'B6. Okunamayan tablo manifest.errors\'a yazilir (geri yukleme eksik yedegi reddeder)', JSON.stringify(hatali.manifest.errors));

  const oku = readerFromFile(JSON.parse(JSON.stringify(y)));
  check(oku('manifest.json').tenantId === T && oku('tables/bookings.json').length === 2345 && oku('tables/olmayan.json') === null && oku('auth_users.json') === null,
    'B7. Tek dosya, restore_engine\'in readJson arayuzuyle okunur');
  let e = null; try { readerFromFile({ manifest: { format: 'baska' } }); } catch (err) { e = err; }
  check(e && /BACKUP_FORMAT_UNKNOWN/.test(e.message), 'B8. Bilinmeyen bicim reddedilir');

  // --- C. Geri yukleme betigi ------------------------------------------------
  const betik = read('scripts/run_restore.js');
  check(/readerFromFile\(tekDosya\)/.test(betik) && /isletmesinin yedegi; --tenant ile baska isletme secilemez/.test(betik),
    'C1. npm run restore tek dosyayi kabul eder ve dosyayi baska isletmeye yuklemez');

  // --- D. Arayuz ---------------------------------------------------------------
  const app = read('app.js');
  const html = read('index.html');
  const govdeBas = app.indexOf('async function downloadTenantBackup(');
  const govde = govdeBas >= 0 ? app.slice(govdeBas, govdeBas + 2500) : '';
  check(/activeTenant\?\.role\s*!==\s*'owner'|activeTenant\.role\s*!==\s*'owner'/.test(govde) && /exportTenantBackup\(/.test(govde) && /manifest\.errors/.test(govde),
    'D1. Yedek yalniz isletme sahibine; eksik yedek "tamam" denmeden kullaniciya soylenir');
  check(/data-owner-only[^>]*data-onclick="downloadTenantBackup\(\)"|data-onclick="downloadTenantBackup\(\)"[^>]*data-owner-only/.test(html),
    'D2. Ayarlar\'da yalniz sahibe gorunen "Isletme yedegini indir" dugmesi');
  check(/'downloadTenantBackup'/.test(read('core/action_dispatch.js')), 'D3. Eylem izin listesinde');
  check(/core\/tenant_backup_export\.js\?v=/.test(html), 'D4. Motor sayfaya yuklenir');

  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
})();
