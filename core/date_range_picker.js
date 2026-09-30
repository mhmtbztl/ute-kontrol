// =============================================================================
// LEXBNB ORTAK TARIH ARALIGI SECICI (A1-G2, 30 Eylul 2026)
// =============================================================================
//
// Kullanici karari (ENVANTER Rezervasyonlar, 27.09.2026): "Her panelde ve
// filtrede tarih secimi Airbnb/Booking tarzi TEK TAKVIMDE ARALIK secimi olur.
// Rezervasyon formundaki mevcut aralik secici ortak bilesen olarak kullanilir."
//
// O secici tek ornekti: global id'ler (resCalMonths, resDateInLabel...) ve
// global durum (resRangeStart/End). Ikinci bir filtreye koymak kopyalamak
// demekti ve iki kopya ayrisirdi. Burada iki katman var:
//
//   Mantik (saf, Node'da test edilir): secim kurali, ay izgarasi, gece sayisi.
//   Baglayici (tarayici): id KULLANMADAN, verilen kok elemana cizer; sayfada
//     istenen kadar ornek olabilir. Olaylar kok elemana baglidir.
//
// Iki kip:
//   'stay'  konaklama: cikis giristen SONRA olmak zorunda (en az 1 gece).
//   'range' filtre: ayni gun hem baslangic hem bitis olabilir (tek gun).
//
// Rezervasyon formu (app.js) secim kuralini ve ay izgarasini buradan alir;
// kural tek yerde durur.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DateRangePicker = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const DOW_TR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function dateKey(year, monthIndex, day) { return `${year}-${pad(monthIndex + 1)}-${pad(day)}`; }
  function keyParts(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
      ? { year, month, day, date } : null;
  }
  function isKey(value) { return !!keyParts(value); }

  function parseKey(key) {
    const parts = keyParts(key);
    return parts ? parts.date : null;
  }

  function formatHuman(key) {
    const d = parseKey(key);
    return d ? `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}` : '—';
  }

  /** Iki uc arasindaki gece sayisi (cikis gunu dahil degil). Gecersizse 0. */
  function nightsBetween(start, end) {
    const a = parseKey(start);
    const b = parseKey(end);
    if (!a || !b) return 0;
    return Math.max(0, Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
      - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000));
  }

  /**
   * Bir gune tiklandiginda yeni durum. Gecersiz aralik SESSIZCE uretilmez:
   * baslangictan onceki gun yeni baslangic sayilir.
   */
  function pick(state, key, mode) {
    const s = state || {};
    const kip = mode === 'range' ? 'range' : 'stay';
    if (!isKey(key)) return normalizeState(s.start, s.end, kip);
    if (!s.start || (s.start && s.end)) return { start: key, end: null };
    if (kip === 'stay' ? key <= s.start : key < s.start) return { start: key, end: null };
    return { start: s.start, end: key };
  }

  function normalizeState(start, end, mode) {
    const normalizedStart = isKey(start) ? start : null;
    const normalizedEnd = isKey(end) ? end : null;
    if (!normalizedStart || !normalizedEnd) return { start: normalizedStart, end: null };
    const valid = mode === 'range' ? normalizedEnd >= normalizedStart : normalizedEnd > normalizedStart;
    return valid ? { start: normalizedStart, end: normalizedEnd } : { start: normalizedStart, end: null };
  }

  function isComplete(state, mode) {
    const normalized = normalizeState(state && state.start, state && state.end, mode === 'range' ? 'range' : 'stay');
    return !!normalized.end;
  }

  function anchorFrom(key, today) {
    const d = parseKey(key) || parseKey(today) || new Date(2000, 0, 1);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function shiftAnchor(anchor, delta) {
    return new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
  }

  /**
   * Ay izgarasi modeli: Pazartesi ile baslar. Her gun icin siniflar.
   * @returns {{ title, lead, days: [{ key, day, classes: string[] }] }}
   */
  function buildMonth(anchor, state, today) {
    const s = state || {};
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let day = 1; day <= count; day++) {
      const key = dateKey(year, month, day);
      const classes = ['daterange-day'];
      if (key === today) classes.push('is-today');
      if (s.start && key === s.start) classes.push('is-start');
      if (s.end && key === s.end) classes.push('is-end');
      if (s.start && s.end && key > s.start && key < s.end) classes.push('in-range');
      days.push({ key, day, classes });
    }
    return { title: `${MONTHS_TR[month]} ${year}`, lead, days };
  }

  /** Ay izgarasinin HTML'i. `dataAttr` gun dugmesinin veri ozelligi. Icerik kullanici verisi degildir. */
  function monthHtml(model, dataAttr) {
    const attr = dataAttr || 'data-drp-date';
    let cells = DOW_TR.map(d => `<div class="daterange-dow">${d}</div>`).join('');
    for (let i = 0; i < model.lead; i++) cells += '<span class="daterange-day is-empty"></span>';
    model.days.forEach(d => {
      cells += `<button type="button" class="${d.classes.join(' ')}" ${escapeHtml(attr)}="${escapeHtml(d.key)}">${escapeHtml(d.day)}</button>`;
    });
    return `<div><div class="daterange-month-name">${escapeHtml(model.title)}</div><div class="daterange-grid">${cells}</div></div>`;
  }

  function summaryText(state, mode) {
    const s = state || {};
    if (!s.start) return mode === 'range' ? 'Başlangıç tarihini seçin' : 'Giriş tarihini seçin';
    if (!s.end) return mode === 'range' ? 'Bitiş tarihini seçin (aynı gün de olabilir)' : 'Çıkış tarihini seçin';
    if (mode === 'range') {
      const gun = nightsBetween(s.start, s.end) + 1;
      return `${gun} gün seçildi`;
    }
    return `${nightsBetween(s.start, s.end)} gece seçildi`;
  }

  // `paint()` gün düğmelerini aynı tıklama içinde yeniden kurar. Belge
  // dinleyicisi çalıştığında event.target artık DOM'dan ayrılmış olabilir;
  // sabit composedPath yolu tıklamanın yine bu kökten geldiğini kanıtlar.
  function eventCameFromRoot(event, rootEl) {
    const path = event && typeof event.composedPath === 'function' ? event.composedPath() : [];
    return path.includes(rootEl) || !!(event && event.target && rootEl && rootEl.contains(event.target));
  }

  // ---------------------------------------------------------------------------
  // Tarayici baglayicisi
  // ---------------------------------------------------------------------------

  /**
   * Kok elemana bir secici kurar. id kullanmaz; ayni sayfada birden cok ornek.
   * @param {HTMLElement} rootEl  bos bir kapsayici
   * @param {{ mode?: 'stay'|'range', start?: string, end?: string,
   *           today: string, labels?: { start?: string, end?: string },
   *           ariaLabel?: string, onChange?: (state) => void }} options
   * @returns {{ get, set, clear, open, close, destroy }}
   */
  function mount(rootEl, options) {
    if (!rootEl || typeof document === 'undefined') return null;
    const o = options || {};
    const mode = o.mode === 'range' ? 'range' : 'stay';
    const today = o.today;
    const labels = { start: mode === 'range' ? 'Başlangıç' : 'Giriş', end: mode === 'range' ? 'Bitiş' : 'Çıkış', ...(o.labels || {}) };
    let state = normalizeState(o.start, o.end, mode);
    let anchor = anchorFrom(state.start, today);

    rootEl.classList.add('daterange-group');
    rootEl.innerHTML = `
      <button type="button" class="daterange-trigger" data-drp-trigger aria-haspopup="dialog" aria-expanded="false">
        <span class="daterange-leg"><span class="daterange-cap">${escapeHtml(labels.start)}</span><strong data-drp-start>—</strong></span>
        <span class="daterange-arrow">→</span>
        <span class="daterange-leg"><span class="daterange-cap">${escapeHtml(labels.end)}</span><strong data-drp-end>—</strong></span>
        <span class="daterange-nights" data-drp-badge>—</span>
      </button>
      <div class="daterange-panel" role="dialog" hidden>
        <div class="daterange-head">
          <button type="button" class="daterange-nav" data-drp-shift="-1" aria-label="Önceki ay">‹</button>
          <div class="daterange-title" data-drp-title>—</div>
          <button type="button" class="daterange-nav" data-drp-shift="1" aria-label="Sonraki ay">›</button>
        </div>
        <div class="daterange-months" data-drp-months></div>
        <div class="daterange-foot">
          <span data-drp-hint></span>
          <button type="button" class="daterange-clear" data-drp-clear>Temizle</button>
        </div>
      </div>`;
    const q = sel => (typeof rootEl.querySelector === 'function' ? rootEl.querySelector(sel) : null);
    const panel = q('.daterange-panel');
    const trigger = q('[data-drp-trigger]');
    // Sablon kurulamadiysa (HTML ayristirmayan ortam) hicbir sey baglanmaz:
    // secici kullanilamaz kalir ama sayfanin geri kalanini dusurmez.
    const gerekli = ['[data-drp-start]', '[data-drp-end]', '[data-drp-badge]', '[data-drp-hint]', '[data-drp-months]', '[data-drp-title]'];
    if (!panel || !trigger || gerekli.some(sel => !q(sel))) {
      rootEl.innerHTML = '';
      return null;
    }
    if (o.ariaLabel) panel.setAttribute('aria-label', o.ariaLabel);

    function paint() {
      q('[data-drp-start]').textContent = state.start ? formatHuman(state.start) : '—';
      q('[data-drp-end]').textContent = state.end ? formatHuman(state.end) : '—';
      const badge = q('[data-drp-badge]');
      if (mode === 'range') badge.textContent = isComplete(state, mode) ? `${nightsBetween(state.start, state.end) + 1} gün` : '—';
      else { const n = nightsBetween(state.start, state.end); badge.textContent = n > 0 ? `${n} gece` : '—'; }
      q('[data-drp-hint]').textContent = summaryText(state, mode);
      if (!panel.hidden) {
        const second = shiftAnchor(anchor, 1);
        q('[data-drp-months]').innerHTML = monthHtml(buildMonth(anchor, state, today))
          + monthHtml(buildMonth(second, state, today));
        q('[data-drp-title]').textContent = `${buildMonth(anchor, state, today).title} – ${buildMonth(second, state, today).title}`;
      }
    }
    // Panel tetikleyicinin sol kenarindan acilir; ekranin sagindan tasarsa
    // tasan kadar sola kaydirilir (filtre sag kenardaysa takvim kesilmez).
    // Dar ekranda CSS paneli ekrana sabitler; orada kaydirma yapilmaz.
    function fitToViewport() {
      panel.style.left = '';
      if (typeof window === 'undefined' || typeof panel.getBoundingClientRect !== 'function') return;
      if (window.innerWidth <= 640) return;
      const r = panel.getBoundingClientRect();
      const tasma = r.right - (window.innerWidth - 16);
      if (tasma > 0) panel.style.left = `${-Math.min(tasma, Math.max(0, r.left - 16))}px`;
    }
    function setOpen(open) {
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      if (open) anchor = anchorFrom(state.start, today);
      paint();
      if (open) fitToViewport();
    }
    function emit() { if (typeof o.onChange === 'function') o.onChange({ start: state.start, end: state.end }); }

    function onClick(event) {
      const t = event.target;
      if (!t || !t.closest) return;
      if (t.closest('[data-drp-trigger]')) { setOpen(panel.hidden); return; }
      const shift = t.closest('[data-drp-shift]');
      if (shift) { anchor = shiftAnchor(anchor, Number(shift.getAttribute('data-drp-shift'))); paint(); return; }
      if (t.closest('[data-drp-clear]')) { state = { start: null, end: null }; paint(); emit(); return; }
      const day = t.closest('[data-drp-date]');
      if (day) {
        state = pick(state, day.getAttribute('data-drp-date'), mode);
        paint();
        if (isComplete(state, mode)) { setOpen(false); emit(); }
      }
    }
    function onDocClick(event) {
      if (panel.hidden) return;
      if (!eventCameFromRoot(event, rootEl)) setOpen(false);
    }
    function onKey(event) { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); trigger.focus(); } }

    rootEl.addEventListener('click', onClick);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    paint();

    return {
      get: () => ({ start: state.start, end: state.end }),
      set: (start, end) => { state = normalizeState(start, end, mode); anchor = anchorFrom(state.start, today); paint(); },
      clear: () => { state = { start: null, end: null }; paint(); },
      open: () => setOpen(true),
      close: () => setOpen(false),
      destroy: () => {
        rootEl.removeEventListener('click', onClick);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        rootEl.innerHTML = '';
      }
    };
  }

  return {
    MONTHS_TR, DOW_TR,
    dateKey, parseKey, isKey, formatHuman, nightsBetween,
    pick, isComplete, anchorFrom, shiftAnchor, buildMonth, monthHtml, summaryText, eventCameFromRoot,
    mount
  };
}));
