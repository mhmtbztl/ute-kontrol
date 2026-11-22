'use strict';
// Acilir renk secici (sadelik 4. tur, kullanici 22.11.2026: mulk rengi tek nokta,
// tiklayinca kucuk pencere: renk alani + ton cubugu + son kullanilanlar + Iptal / Sec).
// Saf yardimcilar (HSV <-> #RRGGBB) Node'da test edilir; pencere yalniz tarayicida kurulur.
// CSP: satir ici isleyici yok (addEventListener), stil CSSOM ile (el.style).
(function (root) {
  const HEX = /^#[0-9a-f]{6}$/i;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function isHex(value) { return typeof value === 'string' && HEX.test(value); }

  // h: 0-360, s/v: 0-1 -> '#RRGGBB'
  function hsvToHex(h, s, v) {
    const hh = ((Number(h) % 360) + 360) % 360;
    const ss = clamp(Number(s) || 0, 0, 1);
    const vv = clamp(Number(v) || 0, 0, 1);
    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;
    const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x]
      : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    const to = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
  }

  function hexToHsv(hex) {
    if (!isHex(hex)) return null;
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: (h + 360) % 360, s: max ? d / max : 0, v: max };
  }

  // Son kullanilanlar: gecerli, tekrarsiz, buyuk harf, en fazla `limit`.
  function recentColors(list, limit = 8) {
    const out = [];
    (list || []).forEach(c => {
      const u = String(c || '').toUpperCase();
      if (isHex(u) && !out.includes(u)) out.push(u);
    });
    return out.slice(0, limit);
  }

  let acik = null;

  function close(apply) {
    if (!acik) return;
    const { el, anchor, onKey, onDown } = acik;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    el.remove();
    acik = null;
    if (anchor && typeof anchor.focus === 'function') anchor.focus();
    if (apply) apply();
  }

  function make(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /**
   * open({ anchor, value, recent, title, onSelect(hex) })
   * Ayni anda tek pencere. Esc / disari tiklama = Iptal.
   */
  function open({ anchor = null, value = '#0A84FF', recent = [], title = 'Renk seçin', onSelect } = {}) {
    if (typeof document === 'undefined') return false;
    close();
    const start = hexToHsv(value) || hexToHsv('#0A84FF');
    const st = { h: start.h, s: start.s, v: start.v };

    const el = make('div', 'lex-cp');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    const head = make('div', 'lex-cp__head');
    head.appendChild(make('span', 'lex-cp__title', title));
    const onizleme = make('span', 'lex-cp__preview');
    onizleme.setAttribute('data-lx-literal-color', '');
    head.appendChild(onizleme);
    el.appendChild(head);

    const alan = make('div', 'lex-cp__area');
    alan.setAttribute('role', 'presentation');
    const nokta = make('span', 'lex-cp__thumb');
    alan.appendChild(nokta);
    el.appendChild(alan);

    const tonEtiket = make('label', 'lex-cp__label', 'Ton');
    const ton = make('input', 'lex-cp__hue');
    ton.type = 'range'; ton.min = '0'; ton.max = '359'; ton.step = '1';
    ton.setAttribute('aria-label', 'Ton');
    tonEtiket.appendChild(ton);
    el.appendChild(tonEtiket);

    const parlakEtiket = make('label', 'lex-cp__label', 'Parlaklık');
    const parlak = make('input', 'lex-cp__bright');
    parlak.type = 'range'; parlak.min = '0'; parlak.max = '100'; parlak.step = '1';
    parlak.setAttribute('aria-label', 'Parlaklık');
    parlakEtiket.appendChild(parlak);
    el.appendChild(parlakEtiket);

    const sonlar = recentColors(recent);
    if (sonlar.length) {
      el.appendChild(make('span', 'lex-cp__label', 'Son kullanılanlar'));
      const satir = make('div', 'lex-cp__recent');
      sonlar.forEach(c => {
        const b = make('button', 'lex-cp__swatch');
        b.type = 'button';
        b.setAttribute('data-lx-literal-color', '');
        b.setAttribute('aria-label', c);
        b.title = c;
        b.style.background = c;
        b.addEventListener('click', () => { const x = hexToHsv(c); Object.assign(st, x); ciz(); });
        satir.appendChild(b);
      });
      el.appendChild(satir);
    }

    const alt = make('div', 'lex-cp__actions');
    const kod = make('input', 'lex-cp__hex');
    kod.type = 'text'; kod.maxLength = 7; kod.spellcheck = false;
    kod.setAttribute('aria-label', 'Renk kodu');
    const iptal = make('button', 'lex-btn', 'İptal');
    iptal.type = 'button';
    const sec = make('button', 'lex-btn lex-btn--primary', 'Seç');
    sec.type = 'button';
    alt.appendChild(kod); alt.appendChild(iptal); alt.appendChild(sec);
    el.appendChild(alt);

    function hex() { return hsvToHex(st.h, st.s, st.v); }
    function ciz() {
      const renk = hex();
      alan.style.backgroundColor = hsvToHex(st.h, 1, 1);
      nokta.style.left = `${st.s * 100}%`;
      nokta.style.top = `${(1 - st.v) * 100}%`;
      onizleme.style.background = renk;
      ton.value = String(Math.round(st.h));
      parlak.value = String(Math.round(st.v * 100));
      parlak.style.background = `linear-gradient(to right, #000, ${hsvToHex(st.h, st.s, 1)})`;
      if (document.activeElement !== kod) kod.value = renk;
    }

    function alandan(ev) {
      const r = alan.getBoundingClientRect();
      if (!r.width || !r.height) return;
      st.s = clamp((ev.clientX - r.left) / r.width, 0, 1);
      st.v = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1);
      ciz();
    }
    alan.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      if (alan.setPointerCapture) alan.setPointerCapture(ev.pointerId);
      alandan(ev);
      const hareket = e => alandan(e);
      const birak = () => { alan.removeEventListener('pointermove', hareket); alan.removeEventListener('pointerup', birak); };
      alan.addEventListener('pointermove', hareket);
      alan.addEventListener('pointerup', birak);
    });
    ton.addEventListener('input', () => { st.h = Number(ton.value) || 0; ciz(); });
    parlak.addEventListener('input', () => { st.v = (Number(parlak.value) || 0) / 100; ciz(); });
    kod.addEventListener('input', () => {
      const v = kod.value.trim().startsWith('#') ? kod.value.trim() : `#${kod.value.trim()}`;
      const x = hexToHsv(v);
      if (x) { Object.assign(st, x); ciz(); }
    });
    iptal.addEventListener('click', () => close());
    sec.addEventListener('click', () => { const renk = hex(); close(() => { if (onSelect) onSelect(renk); }); });

    const onKey = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
    const onDown = ev => { if (acik && !el.contains(ev.target) && ev.target !== anchor) close(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);

    document.body.appendChild(el);
    acik = { el, anchor, onKey, onDown };
    ciz();
    // Konum: capanin altinda; ekrandan tasarsa ustte. Telefonda alttan acilan sayfa (CSS).
    if (anchor && anchor.getBoundingClientRect && window.innerWidth > 640) {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth || 280;
      const h = el.offsetHeight || 380;
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 6);
      el.style.top = `${top}px`;
      el.style.left = `${clamp(a.left, 8, window.innerWidth - w - 8)}px`;
    }
    ton.focus();
    return true;
  }

  const api = { hsvToHex, hexToHsv, recentColors, isHex, open, close: () => close() };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexColorPicker = api;
})(typeof window !== 'undefined' ? window : null);
