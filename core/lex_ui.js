/**
 * LEXBNB — LEX TASARIMI ORTAK BILESENLERI (kullanici karari 21.11.2026)
 *
 * Her ekran ayni parcalardan kurulur: baslik satiri, villa sekmeleri, ozet
 * cumlesi, 3 sutunlu tablo (oran 1.2 / 1 / 1.1), alt satir (renk aciklamasi +
 * [PDF] [Excel]). HTML dondurenler kendi kacisindan sorumludur (...Html, 7).
 * Saf modul: DOM'a dokunmaz; Node'da test edilir.
 *
 * Marker vurgusu karsilastirma degeri YOKSA cizilmez: kiyas uydurulmaz (3.6).
 */
(function (root) {
  'use strict';

  const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

  // Etiket tonlari: keep = yesil, up = mavi, down = kirmizi (Lex talimat etiketleri).
  const TAG_TONES = ['keep', 'up', 'down'];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function parseDay(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), dow: d.getUTCDay() };
  }

  function dayLabel(dateStr) {
    const p = parseDay(dateStr);
    return p ? { day: `${p.d} ${AY[p.m - 1]}`, weekday: GUN[p.dow] } : { day: '—', weekday: '' };
  }

  // Lex: hafta sonu = Cuma ve Cumartesi geceleri; yeni hafta = Pazartesi.
  function isWeekendNight(dateStr) { const p = parseDay(dateStr); return !!p && (p.dow === 5 || p.dow === 6); }
  function isMonday(dateStr) { const p = parseDay(dateStr); return !!p && p.dow === 1; }

  // Fiyat 50 TL'ye yuvarlanir (yalniz fiyat; defter tutari yuvarlanmaz).
  function roundPrice50(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n / 50) * 50 : null;
  }

  function formatTl(value) {
    const n = Number(value);
    if (value === null || value === undefined || !Number.isFinite(n)) return '—';
    const r = Math.round(n);
    return `${r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('tr-TR')} TL`;
  }

  // Ana deger kiyasin ne kadar USTUNDE: %5–15 sari, %15+ kirmizi, alti yok.
  function markLevel(value, reference) {
    const v = Number(value);
    const r = Number(reference);
    if (value === null || value === undefined || reference === null || reference === undefined) return null;
    if (!Number.isFinite(v) || !Number.isFinite(r) || r <= 0) return null;
    const pct = ((v - r) / r) * 100;
    if (pct >= 15) return 'red';
    if (pct >= 5) return 'yellow';
    return null;
  }

  function markHtml(valueText, level) {
    if (level !== 'yellow' && level !== 'red') return escapeHtml(valueText);
    return `<span class="lex-mark lex-mark--${level}">${escapeHtml(valueText)}</span>`;
  }

  function tagHtml(tone, label) {
    const t = TAG_TONES.includes(tone) ? tone : 'up';
    return `<span class="lex-tag lex-tag--${t}">${escapeHtml(label)}</span>`;
  }

  /**
   * rows: [{ date?, c1, c1Html?, c1sub?, c2, c2Attr?, c2sub?, mark?, tone, tag, reason, c3extraHtml?, id? }]
 *  c1Html / c3extraHtml: cagiranin KACISLADIGI hazir HTML (ad ...Html kurali).
   *  c2Attr: hazir eylem ozniteligi. Cagiran sabit fonksiyon
 *   adiyla ve encodeActionArg ile kurar: eylem denetimi (action_dispatch_tests) onu orada ayristirir.
   *  Tarihli satirlarda hafta sonu rengi ve Pazartesi kalin cizgisi kendiliginden.
   */
  function tableHtml({ head = ['Gün', 'Değer', 'Talimat'], rows = [], empty = 'Kayıt yok.', caption = '' } = {}) {
    const cap = caption ? `<caption class="sr-only">${escapeHtml(caption)}</caption>` : '';
    const th = `<thead><tr>${head.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    if (!rows.length) {
      return `<table class="lex-table">${cap}${th}<tbody><tr class="lex-table__empty"><td colspan="3">${escapeHtml(empty)}</td></tr></tbody></table>`;
    }
    let onceki = null;
    const satirlarHtml = rows.map(r => {
      const cls = [];
      if (r.date && isWeekendNight(r.date)) cls.push('is-weekend');
      if (r.date && onceki && r.date !== onceki && isMonday(r.date)) cls.push('is-new-week');
      if (r.date) onceki = r.date;
      if (r.group) return `<tr class="lex-group"><th colspan="3" scope="colgroup">${escapeHtml(r.group)}${r.groupSub ? ` <span class="lex-group__sub">${escapeHtml(r.groupSub)}</span>` : ''}</th></tr>`;
      const c1main = r.c1Attr ? `<button type="button" class="lex-link" ${r.c1Attr}>${r.c1Html || escapeHtml(r.c1)}</button>` : (r.c1Html || escapeHtml(r.c1));
      const c1 = `<span class="lex-cell__main">${c1main}</span>${r.c1sub ? `<span class="lex-cell__sub">${escapeHtml(r.c1sub)}</span>` : ''}`;
      const deger = markHtml(r.c2, r.mark);
      const c2main = r.c2Attr
        ? `<button type="button" class="lex-link" ${r.c2Attr}>${deger}</button>`
        : `<span class="lex-cell__value">${deger}</span>`;
      const c2 = `${c2main}${r.c2sub ? `<span class="lex-cell__sub">${escapeHtml(r.c2sub)}</span>` : ''}`;
      const c3 = `${r.tag ? tagHtml(r.tone, r.tag) : ''}${r.reason ? `<span class="lex-cell__sub">${escapeHtml(r.reason)}</span>` : ''}${r.c3extraHtml || ''}`;
      return `<tr${cls.length ? ` class="${cls.join(' ')}"` : ''}${r.id ? ` data-task-id="${escapeHtml(r.id)}"` : ''}><td data-label="${escapeHtml(head[0])}">${c1}</td><td data-label="${escapeHtml(head[1])}">${c2}</td><td data-label="${escapeHtml(head[2])}">${c3}</td></tr>`;
    }).join('');
    return `<table class="lex-table">${cap}${th}<tbody>${satirlarHtml}</tbody></table>`;
  }

  // Ozet cumlesi parcalari: [{text}|{strong}] -> guvenli HTML.
  function summaryHtml(parts) {
    return (parts || []).map(p => (p.strong !== undefined ? `<strong>${escapeHtml(p.strong)}</strong>` : escapeHtml(p.text))).join('');
  }

  // Sekmeler (villa veya ekip). Her ogenin attr'i cagiranin kurdugu hazir eylem ozniteligidir.
  function tabsHtml(items, selected, { label = '', variant = 'tabs' } = {}) {
    return `<div class="lex-${variant}" role="tablist"${label ? ` aria-label="${escapeHtml(label)}"` : ''}>${(items || []).map(it => {
      const on = it.key === selected;
      const sayi = Number.isFinite(it.count) && it.count > 0 ? ` <span class="lex-tabs__count">${Number(it.count)}</span>` : '';
      return `<button type="button" role="tab" class="lex-tab${on ? ' is-selected' : ''}" aria-selected="${on ? 'true' : 'false'}" ${it.attr || ''}>${escapeHtml(it.label)}${sayi}</button>`;
    }).join('')}</div>`;
  }

  // Acilir isaretli liste (Bugun: mulk ve ekip). type 'radio' tek secim, 'checkbox' coklu.
  // Her ogenin attr'i cagiranin kurdugu hazir eylem ozniteligidir (data-onchange).
  function pickerHtml({ label = '', summary = '', items = [], type = 'checkbox', name = 'lex-picker' } = {}) {
    const tip = type === 'radio' ? 'radio' : 'checkbox';
    const satirlar = (items || []).map(it => {
      const sayi = Number.isFinite(it.count) && it.count > 0 ? `<span class="lex-picker__count">${Number(it.count)}</span>` : '';
      return `<label class="lex-picker__item"><input type="${tip}" name="${escapeHtml(name)}" value="${escapeHtml(it.key)}"${it.checked ? ' checked' : ''} ${it.attr || ''}><span>${escapeHtml(it.label)}</span>${sayi}</label>`;
    }).join('');
    return `<details class="lex-picker"><summary class="lex-picker__btn"><span class="lex-picker__label">${escapeHtml(label)}</span> ${escapeHtml(summary)}</summary><div class="lex-picker__list" role="group" aria-label="${escapeHtml(label)}">${satirlar}</div></details>`;
  }

  function footerHtml({ legend = [], pdfAttr = '', excelAttr = '' } = {}) {
    const lg = legend.map(l => `<span class="lex-legend__item"><span class="lex-legend__swatch lex-legend__swatch--${escapeHtml(l.tone)}" aria-hidden="true"></span>${escapeHtml(l.label)}</span>`).join('');
    const btn = (attr, t) => (attr ? `<button type="button" class="lex-btn" ${attr}>${t}</button>` : '');
    return `<div class="lex-footer"><div class="lex-legend">${lg}</div><div class="lex-footer__actions">${btn(pdfAttr, 'PDF')}${btn(excelAttr, 'Excel')}</div></div>`;
  }

  // Excel: her sayfa ayri calisma sayfasi, ayni 3 sutun, baslik satiri sabit.
  // SheetJS topluluk surumu hucre rengi yazamaz; renk bilgisi "Talimat"
  // hucresinin metninde (Acil / Yap / Tamam) durur.
  function buildWorkbook(XLSX, sheets) {
    const wb = XLSX.utils.book_new();
    (sheets || []).forEach(sheet => {
      const aoa = [sheet.head || ['Gün', 'Değer', 'Talimat', 'Gerekçe']].concat(sheet.rows || []);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 12 }, { wch: 48 }];
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
      const ad = String(sheet.name || 'Sayfa').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sayfa';
      XLSX.utils.book_append_sheet(wb, ws, ad);
    });
    return wb;
  }

  // PDF: A4 yatay, her villa ayri sayfa, ustte ozet, altta tablo, gunduz renkleri.
  const PRINT_CSS = [
    '@page{size:A4 landscape;margin:14mm}',
    'body{font:14px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#2C2C2A;background:#fff;margin:0}',
    'section{page-break-after:always}section:last-child{page-break-after:auto}',
    'h1{font-size:17px;font-weight:500;margin:0 0 6px}p.ozet{font-size:16px;margin:0 0 14px}p.ozet strong{font-weight:500}',
    'table{width:100%;border-collapse:collapse}th{font-size:13px;font-weight:400;color:#5F5E5A;text-align:left;padding:8px 6px;border-bottom:1px solid #D3D1C7}',
    'td{padding:14px 6px;border-bottom:1px solid #D3D1C7;vertical-align:top}col.c1{width:36.4%}col.c2{width:30.3%}col.c3{width:33.3%}',
    'tr.grp th{padding-top:16px;font-size:14px;font-weight:500;color:#2C2C2A}',
    'tr.is-weekend td{background:#F4F8FD}tr.is-new-week td{border-top:2px solid #2C2C2A}',
    '.sub{display:block;font-size:12px;color:#5F5E5A;margin-top:2px}.v{font-size:16px;font-weight:500}.d{font-size:15px}',
    '.tag{display:inline-block;font-size:13px;padding:2px 8px;border-radius:6px}',
    '.tag--keep{background:#EAF3DE;color:#27500A}.tag--up{background:#E6F1FB;color:#0C447C}.tag--down{background:#FCEBEB;color:#791F1F}',
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
  ].join('');

  function printDocumentHtml({ title = 'Rapor', pages = [] } = {}) {
    const sayfalar = pages.map(pg => {
      let onceki = null;
      const satirlar = (pg.rows || []).map(r => {
        if (r.group) return `<tr class="grp"><th colspan="3">${escapeHtml(r.group)}${r.groupSub ? ` · ${escapeHtml(r.groupSub)}` : ''}</th></tr>`;
        const cls = [];
        if (r.date && isWeekendNight(r.date)) cls.push('is-weekend');
        if (r.date && onceki && r.date !== onceki && isMonday(r.date)) cls.push('is-new-week');
        if (r.date) onceki = r.date;
        return `<tr${cls.length ? ` class="${cls.join(' ')}"` : ''}><td><span class="d">${escapeHtml(r.c1)}</span>${r.c1sub ? `<span class="sub">${escapeHtml(r.c1sub)}</span>` : ''}</td><td><span class="v">${escapeHtml(r.c2)}</span>${r.c2sub ? `<span class="sub">${escapeHtml(r.c2sub)}</span>` : ''}</td><td>${r.tag ? `<span class="tag tag--${TAG_TONES.includes(r.tone) ? r.tone : 'up'}">${escapeHtml(r.tag)}</span>` : ''}${r.reason ? `<span class="sub">${escapeHtml(r.reason)}</span>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="3">Kayıt yok.</td></tr>';
      const head = (pg.head || ['Gün', 'Değer', 'Talimat']).map(h => `<th>${escapeHtml(h)}</th>`).join('');
      return `<section><h1>${escapeHtml(pg.title || title)}</h1><p class="ozet">${summaryHtml(pg.summary || [])}</p><table><colgroup><col class="c1"><col class="c2"><col class="c3"></colgroup><thead><tr>${head}</tr></thead><tbody>${satirlar}</tbody></table></section>`;
    }).join('');
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${sayfalar}</body></html>`;
  }

  const api = {
    escapeHtml, dayLabel, isWeekendNight, isMonday, roundPrice50, formatTl, markLevel, markHtml,
    tagHtml, tableHtml, summaryHtml, tabsHtml, pickerHtml, footerHtml, buildWorkbook, printDocumentHtml, PRINT_CSS, TAG_TONES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LexUi = api;
})(typeof window !== 'undefined' ? window : null);
