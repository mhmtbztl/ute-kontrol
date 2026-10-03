// Codex hatalar3 (03.10.2026) duzeltmeleri agi: H3-01, H3-03, H3-04, H3-05.
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
let failed = 0;
function check(cond, name, detail) {
  if (cond) { passed++; console.log(`[PASS] ${name}`); }
  else { failed++; console.error(`[FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
}
const throws = fn => { try { fn(); return false; } catch (_) { return true; } };

try {
  // --- H3-01: Pages derleme betigi yalniz kendi _site klasorunu siler ---
  const pages = require('../scripts/build_pages.js');
  check(typeof pages.assertSafeOutDir === 'function', 'H1. Cikti klasoru denetleyicisi var');
  if (typeof pages.assertSafeOutDir === 'function') {
    const guard = pages.assertSafeOutDir;
    check(throws(() => guard(root)), 'H2. Depo koku reddedilir');
    check(throws(() => guard(os.homedir())), 'H3. Ev klasoru reddedilir');
    check(throws(() => guard(path.parse(root).root)), 'H4. Disk koku reddedilir');
    check(throws(() => guard(path.join(root, 'core'))), 'H5. _site olmayan klasor reddedilir');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lexbnb-pages-'));
    const site = path.join(tmp, '_site');
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, 'package.json'), '{}');
    check(throws(() => guard(site)), 'H6. Icinde proje dosyasi olan _site silinmez');
    fs.rmSync(path.join(site, 'package.json'));
    check(!throws(() => guard(site)), 'H7. Bos/eski cikti _site kabul edilir');
    check(!throws(() => guard(path.join(root, '_site'))), 'H8. Varsayilan depo/_site kabul edilir');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  check(/outDir = assertSafeOutDir\(outDir\);\s*\r?\n\s*fs\.rmSync\(outDir/.test(read('scripts/build_pages.js')), 'H9. Silme denetimden sonra yapilir');

  // --- H3-03: fiyat semasi drift sozlesmesinde; olu fiyat kodu yok ---
  const contract = read('scripts/schema_contract.js');
  check(/const OUT_OF_SCOPE_TABLES = new Set\(\);/.test(contract) && /const OUT_OF_SCOPE_RPCS = new Set\(\);/.test(contract),
    'H10. Fiyat tablolari ve RPC\'leri drift karsilastirmasindan muaf degil');
  check(/save_manual_pricing_override_atomic: \{\s*\r?\n\s*args:/.test(contract), 'H11. Bos gece indiriminin RPC argumanlari sozlesmede');
  const app = read('app.js');
  for (const dead of ['loadPricingProfiles', 'createPricingRule', 'loadPricingEvents', 'loadDailyRates', 'acceptBookingQuote', 'createBookingQuote']) {
    check(!new RegExp(`\\b${dead}\\b`).test(app), `H12. Hic cagrilmayan ${dead} kaldirildi`);
  }
  check(/rpc\('save_manual_pricing_override_atomic'/.test(app), 'H13. Kullanilan fiyat RPC\'si korunuyor');

  // --- H3-04: kayitta ad uydurulmaz; sunucuda bos ad reddedilir ---
  check(!/'Özel Tatil Evleri'|'İşletme Yöneticisi'/.test(app), 'H14. Kayit formu isletme/yonetici adi uydurmuyor');
  check(/if \(!company \|\| !manager \|\| !email \|\| !pass\)/.test(app), 'H15. Isletme ve yonetici adi zorunlu');
  const mig = path.join(root, 'supabase/migration_phase89_tenant_name_not_blank.sql');
  const sql = fs.existsSync(mig) ? fs.readFileSync(mig, 'utf8') : '';
  check(/tenants_name_not_blank\s+CHECK \(btrim\(name\) <> ''\) NOT VALID/.test(sql), 'H16. Sunucu bos isletme adini reddeder (phase89)');
  check(/profiles_full_name_not_blank\s+CHECK \(full_name IS NULL OR btrim\(full_name\) <> ''\)/.test(sql), 'H17. Sunucu bos kisi adini reddeder (phase89)');
  check(/INSERT INTO public\.schema_migrations\(version, name\)\s+VALUES \(89,/.test(sql), 'H18. phase89 kendini kayit defterine yazar');

  // --- H3-05: rezervasyon esleyicisi ad uydurmaz; bellekte olmayan kayit kismi guncellenmez ---
  check(!/booking\.guest_name \|\| 'Misafir'/.test(app), 'H19. Esleyicide "Misafir" varsayimi yok');
  check(/if \(!guestName\) throw new Error\('Misafir adı zorunludur\.'\)/.test(app), 'H20. Adsiz rezervasyon yazilmaz');
  const upd = app.slice(app.indexOf('async function updateBooking'), app.indexOf('mapBookingToDb(', app.indexOf('async function updateBooking')));
  check(/if \(!existing && isCloud\) \{\s*\r?\n\s*throw new Error/.test(upd), 'H21. Bellekte olmayan rezervasyon kismi guncellemeyle ezilmez');
} catch (error) {
  failed++;
  console.error('[FAIL] beklenmeyen hata — ' + (error && error.stack || error));
} finally {
  console.log(`TEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed) process.exit(1);
}
