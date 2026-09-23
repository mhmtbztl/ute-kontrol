// =============================================================================
// LEXBNB — CLOUDFLARE TURNSTILE (GIRIS / KAYIT / SIFRE SIFIRLAMA)
//
// Supabase Auth panelinde CAPTCHA acildiginda her signInWithPassword,
// signUp ve resetPasswordForEmail cagrisi bir `captchaToken` tasimak
// zorundadir; tasimazsa sunucu istegi reddeder.
//
// Karar: istemci ASLA formu kendisi kilitlemez. Turnstile yuklenemezse
// (reklam engelleyici, ag, CSP) istek belirtecsiz gider ve hakem sunucudur.
// Panelde CAPTCHA kapaliyken bu, girisin hicbir kosulda bozulmamasi demektir;
// aciksa kullanici anlasilir bir hata gorur (getFriendlyAuthErrorMessage).
//
// Kutucuk form ilk kez odaklandiginda cizilir: oturumu zaten acik olan
// kullaniciya bosuna dogrulama calistirilmaz. Belirtecler tek kullanimliktir;
// her gonderimden sonra `consume` kutucugu sifirlar.
// =============================================================================

const TURNSTILE_SITE_KEY = '0x4AAAAAAFA8hopApnoIWZyo';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Form id -> kutucugun cizilecegi kap id.
const CAPTCHA_FORMS = {
  saasLoginForm: 'captchaLogin',
  saasRegisterForm: 'captchaRegister',
  saasForgotForm: 'captchaForgot'
};

function createCaptchaGate(options) {
  const win = options.win;
  const doc = options.doc;
  const siteKey = options.siteKey || TURNSTILE_SITE_KEY;
  const waitMs = options.waitMs == null ? 8000 : options.waitMs;
  const loadTimeoutMs = options.loadTimeoutMs == null ? 10000 : options.loadTimeoutMs;
  const widgets = {};
  let loading = null;

  function loadTurnstile() {
    if (win.turnstile) return Promise.resolve(win.turnstile);
    if (loading) return loading;
    loading = new Promise(resolve => {
      const done = () => resolve(win.turnstile || null);
      const script = doc.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = done;
      script.onerror = done;
      win.setTimeout(done, loadTimeoutMs);
      doc.head.appendChild(script);
    });
    return loading;
  }

  function settle(w, token) {
    w.token = token;
    const waiters = w.waiters.splice(0);
    waiters.forEach(fn => fn(token));
  }

  async function ensure(formId) {
    const existing = widgets[formId];
    if (existing) return existing.ready;
    const containerId = CAPTCHA_FORMS[formId];
    const container = containerId ? doc.getElementById(containerId) : null;
    if (!container) return null;

    const w = { widgetId: null, token: null, waiters: [], ready: null };
    widgets[formId] = w;
    w.ready = loadTurnstile().then(turnstile => {
      if (!turnstile) return null;
      try {
        w.widgetId = turnstile.render(container, {
          sitekey: siteKey,
          action: formId,
          theme: 'dark',
          size: 'flexible',
          language: 'tr',
          callback: token => settle(w, token),
          'expired-callback': () => { w.token = null; },
          'error-callback': () => settle(w, null)
        });
      } catch (e) {
        w.widgetId = null;
      }
      return w.widgetId;
    });
    return w.ready;
  }

  // Belirteci dondurur; kutucuk yoksa ya da zamaninda cozulmezse null.
  async function getToken(formId) {
    await ensure(formId);
    const w = widgets[formId];
    if (!w || w.widgetId == null) return null;
    if (w.token) return w.token;
    return new Promise(resolve => {
      let finished = false;
      const finish = token => { if (!finished) { finished = true; resolve(token || null); } };
      w.waiters.push(finish);
      win.setTimeout(() => finish(null), waitMs);
    });
  }

  // Belirtec tek kullanimliktir: gonderimden sonra (basarili ya da degil) yenilenir.
  function consume(formId) {
    const w = widgets[formId];
    if (!w || w.widgetId == null) return;
    w.token = null;
    try { win.turnstile && win.turnstile.reset(w.widgetId); } catch (e) { /* kutucuk kaldirilmis */ }
  }

  function attach() {
    Object.keys(CAPTCHA_FORMS).forEach(formId => {
      const form = doc.getElementById(formId);
      if (form) form.addEventListener('focusin', () => { ensure(formId); }, { once: true });
    });
  }

  return { ensure, getToken, consume, attach };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.LexbnbCaptcha = createCaptchaGate({ win: window, doc: document });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.LexbnbCaptcha.attach());
  } else {
    window.LexbnbCaptcha.attach();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCaptchaGate, CAPTCHA_FORMS, TURNSTILE_SITE_KEY, TURNSTILE_SCRIPT_URL };
}
