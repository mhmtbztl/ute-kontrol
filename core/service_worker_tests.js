/**
 * LEXBNB — sw.js (giris hizi 2. asama, 08.11.2026)
 *
 * Service worker sahte self/caches/fetch ile Node vm icinde kosar.
 * Olculenler: yalniz ayni koken + GET ele alinir (Supabase hic onbellege girmez),
 * damgali dosya ikinci kez aga gitmez ve eski damgasi silinir, giris sayfasi
 * once agdan gelir, hatali yanit saklanmaz, eski surum onbellekleri temizlenir.
 *
 * Dis sisteme baglanmaz.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isAllowed } = require('../server.js');

const ROOT = path.join(__dirname, '..');
const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const ORIGIN = 'https://lexbnb.space';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`[PASS] ${name}`); } catch (err) {
    failed++; console.error(`[FAIL] ${name}\n       ${err && err.message}`);
  }
}

function fakeResponse(body, { status = 200, type = 'basic' } = {}) {
  return {
    body, status, type, ok: status >= 200 && status < 300,
    clone() { return fakeResponse(body, { status, type }); },
    async text() { return body; }
  };
}

function makeEnv(files = {}) {
  const net = { calls: [], files: { ...files }, offline: false };
  const stores = new Map();
  const abs = k => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href;
  function openStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      async match(k) { return m.has(abs(k)) ? m.get(abs(k)).clone() : undefined; },
      async put(k, r) { m.set(abs(k), r); },
      async delete(k) { return m.delete(abs(k)); },
      async keys() { return [...m.keys()].map(url => ({ url })); }
    };
  }
  const caches = {
    async open(n) { return openStore(n); },
    async keys() { return [...stores.keys()]; },
    async delete(n) { return stores.delete(n); }
  };
  async function fetch(input) {
    const url = abs(input);
    net.calls.push(url);
    if (net.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const key = u.pathname === '/' ? '/index.html' : u.pathname + u.search;
    const hit = net.files[key] !== undefined ? net.files[key] : net.files[u.pathname];
    if (hit === undefined) return fakeResponse('404', { status: 404 });
    return typeof hit === 'object' ? hit : fakeResponse(hit);
  }
  const listeners = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener(t, fn) { listeners[t] = fn; },
    skipWaiting: async () => {},
    registration: { navigationPreload: { enable: async () => { net.preload = true; } } },
    clients: { claim: async () => { net.claimed = true; } }
  };
  vm.runInNewContext(SW_SRC, { self, caches, fetch, URL, console, Promise, Set });
  async function lifecycle(type) {
    const waits = [];
    listeners[type]({ waitUntil(p) { waits.push(p); } });
    await Promise.all(waits);
  }
  async function request(url, { method = 'GET', mode = 'no-cors' } = {}) {
    const waits = [];
    let responded = null;
    listeners.fetch({
      request: { url: abs(url), method, mode },
      preloadResponse: Promise.resolve(undefined),
      respondWith(p) { responded = p; },
      waitUntil(p) { waits.push(p); }
    });
    if (!responded) return { handled: false };
    let res, error;
    try { res = await responded; } catch (err) { error = err; }
    await Promise.all(waits);
    return { handled: true, res, error };
  }
  return { net, stores, caches, lifecycle, request };
}

const INDEX = '<link rel="stylesheet" href="style.css?v=aaaaaaaa"><script src="app.js?v=bbbbbbbb"></script>'
  + '<script src="core/ledger_contract.js?v=cccccccc"></script><script src="https://challenges.cloudflare.com/x.js"></script>';
const FILES = {
  '/index.html': INDEX,
  '/style.css?v=aaaaaaaa': 'css1',
  '/app.js?v=bbbbbbbb': 'app1',
  '/core/ledger_contract.js?v=cccccccc': 'ledger1',
  '/assets/fonts/inter-latin-wght.woff2': 'font1'
};

(async () => {
  await test('S1. Baska koken (Supabase, Turnstile) ve POST istegi ele alinmaz', async () => {
    const env = makeEnv(FILES);
    for (const u of ['https://kirpcqklyjlrhvdbgdrq.supabase.co/rest/v1/bookings?select=*',
      'https://challenges.cloudflare.com/turnstile/v0/api.js', 'https://static.cloudflareinsights.com/beacon.min.js']) {
      assert.strictEqual((await env.request(u)).handled, false, u);
    }
    assert.strictEqual((await env.request('/app.js?v=bbbbbbbb', { method: 'POST' })).handled, false);
    assert.strictEqual((await env.request('/yasal/kvkk.html', { mode: 'navigate' })).handled, false);
    assert.strictEqual((await env.request('/sablonlar/lexbnb-gider-sablonu.csv')).handled, false);
    assert.strictEqual((await env.request('/app.js')).handled, false, 'damgasiz app.js onbellege girmez');
  });

  await test('S2. Damgali dosya ikinci istekte aga gitmez; yeni damga eskisini siler', async () => {
    const env = makeEnv({ ...FILES, '/app.js?v=dddddddd': 'app2' });
    const a = await env.request('/app.js?v=bbbbbbbb');
    assert.strictEqual(a.res.body, 'app1');
    const before = env.net.calls.length;
    const b = await env.request('/app.js?v=bbbbbbbb');
    assert.strictEqual(b.res.body, 'app1');
    assert.strictEqual(env.net.calls.length, before, 'ikinci istek aga gitti');
    await env.request('/app.js?v=dddddddd');
    const keys = [...env.stores.get('lexbnb-static-v1').keys()];
    assert.ok(keys.includes(ORIGIN + '/app.js?v=dddddddd'));
    assert.ok(!keys.includes(ORIGIN + '/app.js?v=bbbbbbbb'), 'eski damga kaldi');
  });

  await test('S3. Giris sayfasi once agdan; ag yoksa onbellekteki; ?token_hash= ayni anahtar', async () => {
    const env = makeEnv(FILES);
    const first = await env.request('/?token_hash=abc&type=invite', { mode: 'navigate' });
    assert.strictEqual(first.res.body, INDEX);
    env.net.files['/index.html'] = 'yeni-surum';
    const second = await env.request('/', { mode: 'navigate' });
    assert.strictEqual(second.res.body, 'yeni-surum', 'ag varken eski index verildi');
    env.net.offline = true;
    const offline = await env.request('/index.html', { mode: 'navigate' });
    assert.strictEqual(offline.res && offline.res.body, 'yeni-surum');
  });

  await test('S4. Kurulum index.html\'deki damgali dosyalari onden alir; dis adres ve xlsx yok', async () => {
    const env = makeEnv(FILES);
    await env.lifecycle('install');
    const keys = [...env.stores.get('lexbnb-static-v1').keys()];
    ['/index.html', '/style.css?v=aaaaaaaa', '/app.js?v=bbbbbbbb', '/core/ledger_contract.js?v=cccccccc']
      .forEach(k => assert.ok(keys.includes(ORIGIN + k), k));
    assert.ok(!env.net.calls.some(u => !u.startsWith(ORIGIN)), 'dis adrese istek gitti');
    assert.ok(!keys.some(k => /xlsx\.full\.min/.test(k)));
    const calls = env.net.calls.length;
    await env.request('/core/ledger_contract.js?v=cccccccc');
    assert.strictEqual(env.net.calls.length, calls, 'onden alinan dosya yine aga gitti');
  });

  await test('S5. Etkinlesme eski surum onbelleklerini siler, navigation preload acar', async () => {
    const env = makeEnv(FILES);
    await (await env.caches.open('lexbnb-static-v0')).put('/app.js?v=00000000', fakeResponse('eski'));
    await (await env.caches.open('baska-uygulama')).put('/x', fakeResponse('x'));
    await env.caches.open('lexbnb-static-v1');
    await env.lifecycle('activate');
    const names = await env.caches.keys();
    assert.ok(!names.includes('lexbnb-static-v0'));
    assert.ok(names.includes('lexbnb-static-v1') && names.includes('baska-uygulama'));
    assert.ok(env.net.preload && env.net.claimed);
  });

  await test('S6. Hatali ya da opak yanit onbellege girmez', async () => {
    const env = makeEnv({ ...FILES, '/core/kirik.js?v=eeeeeeee': fakeResponse('err', { status: 500 }),
      '/core/opak.js?v=ffffffff': fakeResponse('o', { type: 'opaque' }) });
    await env.request('/core/kirik.js?v=eeeeeeee');
    await env.request('/core/opak.js?v=ffffffff');
    await env.request('/core/yok.js?v=12345678');
    const keys = [...(env.stores.get('lexbnb-static-v1') || new Map()).keys()];
    assert.deepStrictEqual(keys, []);
  });

  await test('S7. Yazi tipi onbellekten verilir, arkada yenilenir', async () => {
    const env = makeEnv(FILES);
    const a = await env.request('/assets/fonts/inter-latin-wght.woff2');
    assert.strictEqual(a.res.body, 'font1');
    env.net.files['/assets/fonts/inter-latin-wght.woff2'] = 'font2';
    const b = await env.request('/assets/fonts/inter-latin-wght.woff2');
    assert.strictEqual(b.res.body, 'font1');
    const c = await env.request('/assets/fonts/inter-latin-wght.woff2');
    assert.strictEqual(c.res.body, 'font2');
  });

  await test('S8. Yayin ve kayit: sw.js izinli; localhost ve tarayici kapisinda kayit yok; temizle dugmesi kaydi siler', async () => {
    assert.ok(isAllowed('sw.js'));
    assert.ok(!/https?:\/\//.test(SW_SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'sw.js dis adres iceriyor');
    const { shouldRegisterServiceWorker: should } = require('../app.js');
    const nav = { serviceWorker: {} };
    const loc = (href) => { const u = new URL(href); return { hostname: u.hostname, search: u.search, protocol: u.protocol }; };
    assert.strictEqual(should(loc('https://lexbnb.space/'), nav), true);
    assert.strictEqual(should(loc('http://localhost:3000/'), nav), false);
    assert.strictEqual(should(loc('http://127.0.0.1:3000/?ci-browser=1&role=owner'), nav), false);
    assert.strictEqual(should(loc('http://localhost:3000/?ci-browser=1&sw=1'), nav), false);
    assert.strictEqual(should(loc('http://localhost:3000/?sw=1'), nav), true);
    assert.strictEqual(should(loc('https://lexbnb.space/'), {}), false);
    const refresh = APP_SRC.slice(APP_SRC.indexOf('async function forceHardRefresh'), APP_SRC.indexOf('const LARGE_TABLE_PAGE_SIZE'));
    assert.match(refresh, /getRegistrations\(\)[\s\S]*unregister\(\)/);
    assert.match(APP_SRC, /navigator\.serviceWorker\.register\('sw\.js'\)/);
  });

  console.log('-----------------------------------------------------------------------------');
  console.log(`Sonuc: ${passed}/${passed + failed} gecti`);
  if (failed > 0) process.exit(1);
})();
