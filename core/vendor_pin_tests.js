/**
 * LEXBNB — TARAYICI KUTUPHANELERI SABITLEME TESTI (CEVRIMDISI)
 *
 * L-16: SheetJS 0.18.5 iki bilinen acik tasiyordu (CVE-2023-30533 prototip
 *       kirletme, CVE-2024-22363 ReDoS) ve ice aktarma yolunda kullaniciya
 *       ait dosyayi isliyordu. 0.20.3 depoya gomulu; ozet burada sabit.
 * L-17: Supabase SDK CDN'den `@2` (surumsuz) ve SRI'siz yukleniyordu: CDN'deki
 *       her yeni 2.x, deploy olmadan uretime giriyordu. Artik depoya gomulu ve
 *       testlerin kullandigi npm surumuyle BIREBIR ayni dosya.
 *
 * Kutuphane guncellenecekse: dosyayi iki bagimsiz kaynaktan indirip ozetleri
 * karsilastirin, buradaki sabiti bilerek degistirin.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);
const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const XLSX_SHA256 = 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41'; // SheetJS 0.20.3
const SUPABASE_SHA256 = '84ee9bf45695c1dd3ba1595b6bcfb0f09672434631351ffc8ebe9140545d5ff6'; // supabase-js 2.116.0 UMD

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 1. SheetJS
const xlsxPath = path.join(ROOT, 'xlsx.full.min.js');
const XLSX = require(xlsxPath);
const [maj, min, pat] = String(XLSX.version).split('.').map(Number);
check(maj > 0 || min > 20 || (min === 20 && pat >= 2), '1. SheetJS surumu iki CVE\'nin duzeltildigi 0.20.2 ve ustu', `surum ${XLSX.version}`);
check(sha256(xlsxPath) === XLSX_SHA256, '2. xlsx.full.min.js dogrulanmis 0.20.3 dosyasi', sha256(xlsxPath));

// 2. Supabase SDK
const sbPath = path.join(ROOT, 'supabase.umd.js');
check(fs.existsSync(sbPath) && sha256(sbPath) === SUPABASE_SHA256, '3. supabase.umd.js dogrulanmis 2.116.0 dosyasi', fs.existsSync(sbPath) ? sha256(sbPath) : 'dosya yok');
const npmUmd = path.join(ROOT, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
if (fs.existsSync(npmUmd)) {
  check(sha256(npmUmd) === sha256(sbPath), '4. Tarayici SDK\'si testlerin kullandigi npm surumuyle BIREBIR ayni',
    'npm surumu degismis: supabase.umd.js yeniden gomulmeli ve sabit guncellenmeli');
} else {
  console.log('[ATLANDI] 4. node_modules yok');
}
const sandbox = { self: {}, window: {}, globalThis: {} };
sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window = sandbox;
try { vm.runInNewContext(fs.readFileSync(sbPath, 'utf8'), sandbox, { timeout: 5000 }); } catch (e) { /* asagida olculur */ }
check(sandbox.supabase && typeof sandbox.supabase.createClient === 'function', '5. Gomulu SDK window.supabase.createClient tanimliyor', 'tanimsiz');

// 3. index.html
const ext = [...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map(m => m[1]);
check(ext.length === 0, '6. index.html harici <script src> yuklemiyor', ext.join(', '));
check(/<script src="supabase\.umd\.js\?v=[0-9a-f]{8}"><\/script>/.test(html), '7. SDK yerel dosyadan, damgali yukleniyor', 'etiket bulunamadi');
const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
check(csp && !/jsdelivr/.test(csp), '8. CSP artik cdn.jsdelivr.net\'e izin vermiyor', csp.slice(0, 160));

// 4. Yerel sunucu gomulu dosyalari veriyor
const { isAllowed } = require(path.join(ROOT, 'server.js'));
check(isAllowed('supabase.umd.js') && isAllowed('xlsx.full.min.js'), '9. server.js gomulu kutuphaneleri veriyor', 'izin listesinde yok');

console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
if (failed > 0) process.exit(1);
