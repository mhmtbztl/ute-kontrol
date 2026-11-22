/**
 * LEXBNB — GECE / GUNDUZ TEMASI (Lex Tasarimi, kullanici karari 21.11.2026)
 *
 * 1) Secim: cihaz ayarina uyar (prefers-color-scheme); kisi dugmeyle degistirirse
 *    secimi bu cihazda hatirlanir. Bu bir kisisel goruntu tercihidir, is verisi
 *    degildir (CLAUDE.md 1: "localStorage'a yazip kaydedildi demek" kurali is
 *    kayitlari icindir). Depolama okunamazsa cihaz ayari gecerli kalir.
 *
 * 2) Renk esleme: uygulama yillarca yalniz koyu tema icin yazildi; app.js'in
 *    urettigi HTML'de ve index.html'de yuzlerce sabit renk var (#F5F5F7 yazi,
 *    #1C1C1E zemin...). Butun satir ici stiller zaten tek kapidan gecer
 *    (data-lx-style -> CSSOM, L-15). Bu kapida sabit renk tema degiskenine
 *    cevrilir; boylece ayni HTML iki temada da okunur. style.css ayni fonksiyonla
 *    bir kez donusturuldu (scripts/themeize_css.js).
 *
 * <head> icinde, stil sayfasindan ONCE yuklenir: tema stil uygulanmadan secilir,
 * ekran acilista yanip sonmez. Satir ici betik yoktur (CSP).
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'lexbnb.theme';

  // Koyu tema icin yazilmis sabit renkler -> aile.
  const FAMILIES = {
    text: ['F5F5F7', 'FFFFFF', 'FFF', 'E5E5EA', 'F2F2F7', 'EDE9FE', 'F1F5F9', 'E2E8F0', 'F8FAFC', 'EBEBF5', 'D1D1D6', 'E0E7FF'],
    muted: ['C7C7CC', '98989D', '8E8E93', 'AEAEB2', '6E6E73', '94A3B8', 'CBD5E1', '636366', 'A1A1AA', '9CA3AF', '64748B', '8E8E93'],
    bgMain: ['000000', '000'],
    surface: ['1C1C1E', '111111', '121212', '0F172A', '1E1E1E'],
    elevated: ['2C2C2E', '3A3A3C', '1E293B', '27272A', '48484A'],
    emerald: ['30D158', '34C759', '6EE7B7', '059669', '34D399', '10B981', '22C55E', '4ADE80', '86EFAC', 'A7F3D0', '32D74B'],
    rose: ['FF453A', 'FF6961', 'FCA5A5', 'FF8A82', 'FB7185', 'F87171', 'EF4444', 'DC2626', 'FF3B30', 'FECACA', 'FDA4AF'],
    amber: ['FF9F0A', 'FFB340', 'FDE68A', 'FCD34D', 'FBBF24', 'F59E0B', 'FFD60A', 'FEF3C7', 'FFCC00'],
    blue: ['0A84FF', '409CFF', '64B0FF', '93C5FD', '60A5FA', '3B82F6', '007AFF', 'BFDBFE', '5AC8FA', '64D2FF'],
    purple: ['BF5AF2', 'A78BFA', 'DDD6FE', 'C4B5FD', '8B5CF6', '6366F1', '818CF8', 'DA8FFF', 'C084FC']
  };
  const HEX_FAMILY = {};
  Object.keys(FAMILIES).forEach(f => FAMILIES[f].forEach(h => { HEX_FAMILY[h] = f; }));

  // rgba() icindeki bilinen uclu -> tema degiskeni (saydamlik korunur).
  const RGB_FAMILY = {
    '255,255,255': 'ink',
    // Koyu temadaki siyah golge zemin gunduzde gri kutu olmasin: --shade-k ile hafifler.
    '0,0,0': 'shade',
    '28,28,30': 'surface', '22,22,24': 'surface', '40,40,42': 'surface', '35,30,20': 'surface', '44,44,46': 'elevated',
    '48,209,88': 'emerald', '52,199,89': 'emerald', '16,185,129': 'emerald', '5,150,105': 'emerald', '34,197,94': 'emerald',
    '255,69,58': 'rose', '239,68,68': 'rose', '255,59,48': 'rose', '251,113,133': 'rose', '220,38,38': 'rose',
    '255,159,10': 'amber', '245,158,11': 'amber', '251,191,36': 'amber', '255,214,10': 'amber',
    '10,132,255': 'blue', '59,130,246': 'blue', '0,122,255': 'blue', '96,165,250': 'blue',
    '191,90,242': 'purple', '99,102,241': 'purple', '167,139,250': 'purple', '139,92,246': 'purple'
  };
  const ACCENTS = ['emerald', 'rose', 'amber', 'blue', 'purple'];

  function hexVar(family, kind) {
    if (family === 'text') return kind === 'color' ? 'var(--text-main)' : null;
    if (family === 'muted') return kind === 'color' ? 'var(--text-muted)' : null;
    if (family === 'bgMain') return kind === 'bg' ? 'var(--bg-main)' : null;
    if (family === 'surface') return kind === 'bg' ? 'var(--bg-surface)' : null;
    if (family === 'elevated') return kind === 'bg' ? 'var(--bg-surface-elevated)' : null;
    if (ACCENTS.includes(family)) return kind === 'color' ? `var(--accent-${family}-text)` : `var(--accent-${family})`;
    return null;
  }

  function propKind(prop) {
    const p = String(prop || '').trim().toLowerCase();
    if (p === 'color' || p === '-webkit-text-fill-color' || p === 'caret-color') return 'color';
    if (/^(background|border|outline|fill|stroke|text-decoration|column-rule|accent-color)/.test(p)) return 'bg';
    return null;
  }

  const HEX_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const RGBA_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+%?)\s*)?\)/g;

  function mapValue(value, kind, keepWhite) {
    let out = String(value);
    out = out.replace(HEX_RE, (m, hex) => {
      const h = hex.toUpperCase();
      if (keepWhite && (h === 'FFF' || h === 'FFFFFF')) return m;
      const fam = HEX_FAMILY[h];
      return (fam && hexVar(fam, kind)) || m;
    });
    out = out.replace(RGBA_RE, (m, r, g, b, a) => {
      const fam = RGB_FAMILY[`${Number(r)},${Number(g)},${Number(b)}`];
      if (!fam) return m;
      if (fam === 'ink' && keepWhite && (a === undefined || Number(a) >= 0.9)) return m;
      if (fam === 'shade') return kind === 'bg' ? `rgb(var(--rgb-shade) / calc(${a === undefined ? 1 : a} * var(--shade-k)))` : m;
      return `rgb(var(--rgb-${fam}) / ${a === undefined ? 1 : a})`;
    });
    return out;
  }

  // Lex: yalniz iki kalinlik (400, 500).
  function mapWeight(value) {
    const v = String(value).trim().toLowerCase();
    if (v === 'bold' || v === 'bolder' || /^[6-9]00$/.test(v)) return '500';
    return value;
  }

  // Bir kural blogunun ya da style="" metninin bildirimleri.
  // Ayni blokta vurgu renkli/gradyan zemin varsa beyaz yazi beyaz kalir
  // (mavi dugme uzerindeki beyaz yazi her iki temada dogru).
  function themeizeCss(cssText) {
    const text = String(cssText == null ? '' : cssText);
    if (!text.trim()) return text;
    const parts = text.split(';');
    const hasAccentBg = parts.some(part => {
      const i = part.indexOf(':');
      if (i < 0 || propKind(part.slice(0, i)) !== 'bg' || !/^\s*background/i.test(part)) return false;
      const val = part.slice(i + 1);
      if (/gradient\(/i.test(val)) return true;
      let accent = false;
      val.replace(HEX_RE, (m, hex) => { if (ACCENTS.includes(HEX_FAMILY[hex.toUpperCase()])) accent = true; return m; });
      val.replace(RGBA_RE, (m, r, g, b, a) => {
        if (ACCENTS.includes(RGB_FAMILY[`${Number(r)},${Number(g)},${Number(b)}`]) && (a === undefined || Number(a) >= 0.6)) accent = true;
        return m;
      });
      return accent || /var\(--accent-[a-z]+\)|var\(--accent-primary\)|var\(--border-focus\)/.test(val);
    });
    return parts.map(part => {
      const i = part.indexOf(':');
      if (i < 0) return part;
      const prop = part.slice(0, i);
      const val = part.slice(i + 1);
      if (/^\s*font-weight\s*$/i.test(prop)) return `${prop}:${val.replace(/[^\s!]+/, w => mapWeight(w))}`;
      // font: 600 11px/1.2 ... kisaltmasindaki kalinlik da 500'e iner.
      if (/^\s*font\s*$/i.test(prop)) return `${prop}:${val.replace(/(^|\s)(?:[6-9]00|bold|bolder)(?=\s)/i, '$1500')}`;
      const kind = propKind(prop);
      if (!kind) return part;
      return `${prop}:${mapValue(val, kind, kind === 'color' && hasAccentBg)}`;
    }).join(';');
  }

  function readStored() {
    try {
      const v = root && root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) { return null; }
  }

  function systemTheme() {
    try {
      return root && root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (e) { return 'dark'; }
  }

  function current() { return readStored() || systemTheme(); }

  function apply(theme) {
    const doc = root && root.document;
    if (!doc || !doc.documentElement) return;
    doc.documentElement.setAttribute('data-theme', theme);
    doc.documentElement.style.colorScheme = theme;
    const btns = doc.querySelectorAll ? doc.querySelectorAll('[data-theme-toggle]') : [];
    btns.forEach(btn => {
      const next = theme === 'dark' ? 'Gündüz' : 'Gece';
      btn.setAttribute('aria-label', `${next} görünümüne geç`);
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
      const label = btn.querySelector('[data-theme-label]');
      if (label) label.textContent = theme === 'dark' ? 'Gece' : 'Gündüz';
    });
  }

  function set(theme) {
    if (theme !== 'light' && theme !== 'dark') return current();
    try { if (root && root.localStorage) root.localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* gizli pencere: yalniz bu oturum */ }
    apply(theme);
    return theme;
  }

  function toggle() { return set(current() === 'dark' ? 'light' : 'dark'); }

  const api = { STORAGE_KEY, themeizeCss, mapWeight, current, set, toggle, apply, systemTheme };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.LexTheme = api;
    if (root.document && root.document.documentElement) {
      apply(current());
      // Kisi secim yapmadiysa cihaz ayari degisince tema da degisir.
      try {
        const mq = root.matchMedia && root.matchMedia('(prefers-color-scheme: light)');
        if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (!readStored()) apply(systemTheme()); });
      } catch (e) { /* eski tarayici */ }
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', () => apply(current()), { once: true });
      }
    }
  }
})(typeof window !== 'undefined' ? window : null);
