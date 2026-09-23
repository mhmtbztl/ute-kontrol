/**
 * LEXBNB — TURNSTILE CAPTCHA KAPISI
 *
 * Supabase panelinde CAPTCHA acildiginda belirtec tasimayan her giris, kayit
 * ve sifre sifirlama istegi reddedilir; yani istemcide tek bir eksik baglanti
 * siteyi herkese kilitler. Bu suit o baglantilari ve modulun "Turnstile
 * yuklenemezse formu kilitleme" sozlesmesini olcer.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createCaptchaGate, CAPTCHA_FORMS, TURNSTILE_SITE_KEY } = require('./captcha_gate.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}\n       ${error.stack || error.message}`);
  }
}

// Sahte tarayici: kaplar, <script> ekleme ve zamanlayici.
function fakeEnv({ containers = Object.values(CAPTCHA_FORMS), turnstile = null, scriptLoads = true } = {}) {
  const els = {};
  containers.forEach(id => { els[id] = { id }; });
  const win = {
    turnstile: null,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 30))
  };
  const doc = {
    getElementById: id => els[id] || null,
    createElement: () => ({}),
    head: {
      appendChild: script => {
        setTimeout(() => {
          if (scriptLoads) { win.turnstile = turnstile; script.onload(); } else { script.onerror(); }
        }, 1);
      }
    }
  };
  return { win, doc };
}

function fakeTurnstile({ autoToken = null, delayMs = 0 } = {}) {
  const t = { renders: [], resets: [] };
  t.render = (container, opts) => {
    t.renders.push({ container, opts });
    if (autoToken) setTimeout(() => opts.callback(autoToken), delayMs);
    return 'w' + t.renders.length;
  };
  t.reset = id => t.resets.push(id);
  return t;
}

function fnBody(name) {
  const start = app.indexOf(`async function ${name}(`);
  assert(start >= 0, `${name} bulunamadi`);
  const next = app.indexOf('\nasync function ', start + 10);
  const next2 = app.indexOf('\nfunction ', start + 10);
  const end = Math.min(...[next, next2].filter(i => i > 0));
  return app.slice(start, end);
}

(async () => {
  await test('A1 cozulen kutucuk belirtec dondurur ve dogru anahtarla cizilir', async () => {
    const t = fakeTurnstile({ autoToken: 'tok-1' });
    const { win, doc } = fakeEnv({ turnstile: t });
    const gate = createCaptchaGate({ win, doc });
    assert.strictEqual(await gate.getToken('saasLoginForm'), 'tok-1');
    assert.strictEqual(t.renders.length, 1);
    assert.strictEqual(t.renders[0].opts.sitekey, TURNSTILE_SITE_KEY);
    assert.strictEqual(t.renders[0].opts.action, 'saasLoginForm');
    assert.strictEqual(t.renders[0].container.id, 'captchaLogin');
  });

  await test('A2 gec gelen belirtec beklenir', async () => {
    const t = fakeTurnstile({ autoToken: 'tok-gec', delayMs: 10 });
    const { win, doc } = fakeEnv({ turnstile: t });
    const gate = createCaptchaGate({ win, doc });
    assert.strictEqual(await gate.getToken('saasRegisterForm'), 'tok-gec');
  });

  await test('A3 Turnstile yuklenemezse null doner, hata firlatmaz (form kilitlenmez)', async () => {
    const { win, doc } = fakeEnv({ scriptLoads: false });
    const gate = createCaptchaGate({ win, doc });
    assert.strictEqual(await gate.getToken('saasLoginForm'), null);
  });

  await test('A4 hic cozulmeyen kutucuk sure dolunca null doner', async () => {
    const t = fakeTurnstile();
    const { win, doc } = fakeEnv({ turnstile: t });
    const gate = createCaptchaGate({ win, doc, waitMs: 20 });
    assert.strictEqual(await gate.getToken('saasForgotForm'), null);
  });

  await test('A5 kap yoksa null doner ve cizim denenmez', async () => {
    const t = fakeTurnstile({ autoToken: 'x' });
    const { win, doc } = fakeEnv({ turnstile: t, containers: [] });
    const gate = createCaptchaGate({ win, doc });
    assert.strictEqual(await gate.getToken('saasLoginForm'), null);
    assert.strictEqual(t.renders.length, 0);
  });

  await test('A6 belirtec tek kullanimlik: consume kutucugu sifirlar, eski belirtec tekrar verilmez', async () => {
    const t = fakeTurnstile({ autoToken: 'tok-1' });
    const { win, doc } = fakeEnv({ turnstile: t });
    const gate = createCaptchaGate({ win, doc, waitMs: 20 });
    assert.strictEqual(await gate.getToken('saasLoginForm'), 'tok-1');
    gate.consume('saasLoginForm');
    assert.deepStrictEqual(t.resets, ['w1']);
    assert.strictEqual(await gate.getToken('saasLoginForm'), null);
    assert.strictEqual(t.renders.length, 1, 'ayni form icin ikinci kutucuk cizilmemeli');
  });

  await test('A7 kutucuk hata verirse bekleyen istek null ile birakilir', async () => {
    const t = fakeTurnstile();
    t.render = (c, opts) => { setTimeout(() => opts['error-callback'](), 1); return 'w1'; };
    const { win, doc } = fakeEnv({ turnstile: t });
    const gate = createCaptchaGate({ win, doc, waitMs: 5000 });
    assert.strictEqual(await gate.getToken('saasLoginForm'), null);
  });

  await test('B1 uc Supabase Auth cagrisi da belirteci tasiyor ve sonra tuketiyor', () => {
    const cases = [
      ['handleSaaSLogin', 'saasLoginForm', 'signInWithPassword'],
      ['handleSaaSRegister', 'saasRegisterForm', 'signUp'],
      ['handleSaaSForgotPassword', 'saasForgotForm', 'resetPasswordForEmail']
    ];
    for (const [fn, form, call] of cases) {
      const body = fnBody(fn);
      const get = body.indexOf(`getAuthCaptchaToken('${form}')`);
      const req = body.indexOf(`supabaseClient.auth.${call}(`);
      const use = body.indexOf(`consumeAuthCaptcha('${form}')`);
      assert(get >= 0 && req > get, `${fn}: belirtec istekten once alinmali`);
      assert(use > req, `${fn}: belirtec istekten sonra tuketilmeli`);
      assert(/captchaToken/.test(body.slice(req, use)), `${fn}: istek captchaToken tasimali`);
    }
  });

  await test('B2 her formun gonder dugmesinden once kendi kutucugu var', () => {
    for (const [formId, boxId] of Object.entries(CAPTCHA_FORMS)) {
      const fStart = html.indexOf(`<form id="${formId}"`);
      const fEnd = html.indexOf('</form>', fStart);
      const form = html.slice(fStart, fEnd);
      const box = form.indexOf(`id="${boxId}"`);
      const submit = form.indexOf('type="submit"');
      assert(fStart >= 0 && box >= 0 && box < submit, `${formId}: #${boxId} gonder dugmesinden once olmali`);
    }
  });

  await test('B3 CSP Turnstile betigine ve cercevesine izin veriyor', () => {
    const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
    assert(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp), 'script-src eksik');
    assert(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/.test(csp), 'frame-src eksik');
    assert(!/frame-src[^;]*'none'/.test(csp), "frame-src 'none' Turnstile'i engeller");
  });

  await test('B4 modul app.js\'ten once yukleniyor', () => {
    const gate = html.search(/<script src="core\/captcha_gate\.js/);
    const appTag = html.search(/<script src="app\.js/);
    assert(gate > 0 && gate < appTag);
  });

  await test('B5 sunucu CAPTCHA reddi kullaniciya Turkce aciklaniyor', () => {
    const start = app.indexOf('function getFriendlyAuthErrorMessage');
    const body = app.slice(start, app.indexOf('\n}', start));
    assert(/\/captcha\/i/.test(body));
    assert(/Güvenlik doğrulaması/.test(body));
  });

  await test('B6 site anahtari herkese acik Turnstile anahtari; gizli anahtar kaynakta yok', () => {
    assert(/^0x4[A-Za-z0-9_-]{10,}$/.test(TURNSTILE_SITE_KEY));
    const src = fs.readFileSync(path.join(__dirname, 'captcha_gate.js'), 'utf8');
    assert(!/secret/i.test(src.replace(/gizli anahtar|secret key/gi, '')), 'kaynakta secret gecmemeli');
  });

  await test('C1 sifre alt siniri Supabase paneliyle (10) ayni', () => {
    assert(/const AUTH_MIN_PASSWORD_LENGTH = 10;/.test(app));
    assert(!/\.length < 6\b/.test(app), 'eski 6 karakter kontrolu kalmamali');
    assert(!/en az 6 karakter/i.test(app + html), 'eski 6 karakter metni kalmamali');
    for (const id of ['saasRegPass', 'saasNewPass1', 'saasNewPass2']) {
      assert(new RegExp('id="' + id + '"[^>]*minlength="10"').test(html), id + ' minlength 10 olmali');
    }
    const start = app.indexOf('function getFriendlyAuthErrorMessage');
    const fn = new Function(app.slice(start, app.indexOf('\n}', start) + 2) + '; return getFriendlyAuthErrorMessage;')();
    assert.strictEqual(fn({ message: 'Password should be at least 10 characters.' }), 'Şifreniz en az 10 karakter olmalıdır.');
  });

  console.log(`\nCAPTCHA KAPISI: ${passed} gecti, ${failed} kaldi`);
  if (failed > 0) process.exit(1);
})();
