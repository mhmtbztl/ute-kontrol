/**
 * LEXBNB — YEREL SUNUCU (server.js) GUVENLIK TESTI (CEVRIMDISI)
 *
 * server.js bir zamanlar klasorun tamamini 0.0.0.0 uzerinden sunuyordu;
 * /.env (service_role anahtari), /.git/config ve ust dizin 200 donuyordu.
 * Bu suit gercek HTTP istegi atar; yol OLDUGU GIBI gonderilir (curl
 * --path-as-is gibi), yani istemci tarafinda normallestirme yoktur.
 *
 * Varsayilan: server.js'in createServer()'i 127.0.0.1'de rastgele bir portta
 * baslatilir. LEXBNB_SERVER_URL verilirse o adres olculur (eski surume karsi
 * kirmizi gormek icin).
 */

const http = require('http');
const path = require('path');

let passed = 0, failed = 0;
const ok = n => { passed++; console.log(`[PASS] ${n}`); };
const no = (n, d) => { failed++; console.error(`[FAIL] ${n}\n       ${d}`); };
const check = (c, n, d) => c ? ok(n) : no(n, d);

function get(base, rawPath) {
  const u = new URL(base);
  return new Promise(resolve => {
    const req = http.request({ host: u.hostname, port: u.port, path: rawPath, method: 'GET' }, res => {
      let len = 0;
      res.on('data', c => { len += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, len, type: res.headers['content-type'] || '' }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.end();
  });
}

async function run() {
  console.log('LEXBNB YEREL SUNUCU GUVENLIK TESTI\n');
  let server = null, base = process.env.LEXBNB_SERVER_URL;
  if (!base) {
    const mod = require(path.join(__dirname, '..', 'server.js'));
    check(mod.HOST === '127.0.0.1', '0. Sunucu yalnizca 127.0.0.1\'e baglanir (yerel ag kapali)', `HOST=${mod.HOST}`);
    server = mod.createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  try {
    const yasak = [
      '/.env', '/.env.test', '/.git/config', '/.git/HEAD',
      '/../lexbnb/.env', '/core/../.env', '/%2e%2e/lexbnb/.env', '/%2e%65nv', '/core/%2e%2e/.env',
      '/core/..%5c.env', '/core\\..\\.env', '/.env%00.js',
      '/supabase/schema.sql', '/supabase/migration_manifest.txt', '/scripts/bootstrap_test_project.js',
      '/core/test_env.js', '/core/test_gate_tests.js', '/package.json', '/CLAUDE.md', '/server.js',
      '/apps_script/Code.gs', '/docs/PHASE41_DEPLOY_PACKAGE.md', '/node_modules/pg/package.json'
    ];
    for (const p of yasak) {
      const r = await get(base, p);
      check(r.status === 404 || r.status === 400, `1. ${p} verilmez`, `durum ${r.status}, ${r.len} bayt`);
    }
    const izinli = ['/', '/index.html', '/app.js', '/style.css', '/xlsx.full.min.js', '/core/captcha_gate.js',
      '/core/marketing_ui.js', '/sablonlar/lexbnb-rezervasyon-sablonu.csv', '/index.html?v=abc'];
    for (const p of izinli) {
      const r = await get(base, p);
      check(r.status === 200 && r.len > 0, `2. ${p} uygulama icin verilir`, `durum ${r.status}`);
    }
    const js = await get(base, '/app.js');
    check(/javascript/.test(js.type), '3. JS dogru MIME ile verilir', js.type);
  } finally {
    if (server) await new Promise(r => server.close(r));
  }
  console.log(`\nTEST SUMMARY: ${passed} / ${passed + failed} TESTS PASSED (${failed} FAILED)`);
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('[FAIL] beklenmedik: ' + e.message); process.exit(1); });
