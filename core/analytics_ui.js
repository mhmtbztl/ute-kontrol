/**
 * LEXBNB — ANALIZ SEKMESI ARAYUZU
 *
 * core/booking_analytics.js raporunu bir kap elemanina cizer: KPI kartlari,
 * aylik trend (karsilastirma cizgileriyle), mulk tablosu, kanal dagilimi,
 * rezervasyon davranisi, talep donusumu ve ileriye dolu.
 *
 * Guvenlik ve CSP (CLAUDE.md 7):
 *   - innerHTML KULLANILMAZ. Her dugum DOM API'siyle kurulur, metin
 *     textContent ile yazilir; kullanici verisi (mulk/kanal adi, kayip nedeni)
 *     HTML olarak yorumlanmaz. innerHTML guvenlik siniri <svg> etiketini
 *     sildigi icin grafikler de createElementNS ile kurulur.
 *   - Satir ici style= ve on* yoktur; gorunum analytics.css siniflarindan,
 *     olaylar kapta tek bir dinleyiciden (data-ba-* oznitelikleri) gelir.
 *
 * Uydurma yok (3.6): rapor null dondurdugu her yerde "—" ve neden yazilir.
 *
 * Kullanim:
 *   const ui = AnalyticsUI.mount(el, {
 *     getData: () => ({ bookings, leads, villas, today }),
 *     deps: { monthPerformance, monthTarget, isBulkSummary, channelName, isImported },
 *     monthOptions: () => ['2025-01', ...],     // secilebilir aylar
 *     canReadLeads: () => true,
 *     canSeeTargets: () => true,               // false: Hedef kiyasi hic gosterilmez
 *     initialVilla: 'ALL',
 *     onVillaChange: villa => {}                 // istege bagli
 *   });
 *   ui.render();
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./booking_analytics.js'));
  } else {
    root.AnalyticsUI = factory(root.BookingAnalytics);
  }
}(typeof self !== 'undefined' ? self : this, function (BookingAnalytics) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const AYLAR_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const AYLAR_UZUN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const BOS = '—';

  const PRESETS = [
    { key: 'month', label: 'Ay' },
    { key: '3m', label: '3 ay' },
    { key: '6m', label: '6 ay' },
    { key: '12m', label: '12 ay' },
    { key: 'ytd', label: 'Yılbaşından' }
  ];

  // Seri kimligi sabittir: filtre bir seriyi kapatinca digerlerinin rengi
  // degismez. Sira koyu yuzeyde (#1C1C1E) renk korlugu dogrulamasindan gecti.
  const COMPARES = [
    { key: 'yoy1', label: 'Geçen yıl', short: 'geçen yıla göre', slot: 2 },
    { key: 'yoy2', label: '2 yıl önce', short: '2 yıl öncesine göre', slot: 3 },
    { key: 'prev', label: 'Önceki dönem', short: 'önceki döneme göre', slot: 4 },
    { key: 'portfolio', label: 'Portföy ortalaması', short: 'portföy ortalamasına göre', slot: 5 },
    { key: 'target', label: 'Hedef', short: 'hedefe göre', slot: 'target' }
  ];

  const METRIC_DEFS = {
    revenue: { label: 'Konaklama cirosu', fmt: 'money', good: 'up', hint: 'Net oda geliri, gecelere bölünmüş pay' },
    occupancy: { label: 'Doluluk', fmt: 'pct', good: 'up', hint: 'Satılan gece / satılabilir gece' },
    adr: { label: 'ADR', fmt: 'money', good: 'up', hint: 'Gecelik ortalama fiyat' },
    revpar: { label: 'RevPAR', fmt: 'money', good: 'up', hint: 'Satılabilir gece başına ciro' },
    nights: { label: 'Satılan gece', fmt: 'num', good: 'up' },
    bookings: { label: 'Rezervasyon', fmt: 'num', good: 'up', hint: 'Girişi bu dönemde olan, iptal hariç' },
    avgStay: { label: 'Ort. konaklama', fmt: 'nights', good: 'neutral' },
    avgLeadTime: { label: 'Rezervasyon öncesi süre', fmt: 'days', good: 'neutral', hint: 'Kaydın girildiği gün ile giriş arası' }
  };
  const KPI_ORDER = ['revenue', 'occupancy', 'adr', 'revpar', 'nights', 'bookings', 'avgStay', 'avgLeadTime'];
  const TREND_METRICS = ['revenue', 'occupancy', 'adr', 'revpar', 'nights', 'bookings'];

  // ------------------------------------------------------------ bicim --

  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const nfc = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

  function fmt(v, kind) {
    if (v === null || v === undefined || !Number.isFinite(Number(v))) return BOS;
    const n = Number(v);
    switch (kind) {
      case 'money': return '₺' + nf0.format(Math.round(n));
      case 'pct': return '%' + nf1.format(n);
      case 'nights': return nf1.format(n) + ' gece';
      case 'days': return nf0.format(n) + ' gün';
      default: return nf1.format(n);
    }
  }

  function fmtAxis(v, kind) {
    if (!Number.isFinite(v)) return '';
    if (kind === 'money') return '₺' + nfc.format(v);
    if (kind === 'pct') return '%' + nf0.format(v);
    return nfc.format(v);
  }

  function monthShort(k) {
    return `${AYLAR_KISA[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
  }

  function monthLong(k) {
    return `${AYLAR_UZUN[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
  }

  function periodLabel(p) {
    if (p.start === p.end) return monthLong(p.start);
    if (p.start.slice(0, 4) === p.end.slice(0, 4)) {
      return `${AYLAR_UZUN[Number(p.start.slice(5, 7)) - 1]} – ${monthLong(p.end)}`;
    }
    return `${monthLong(p.start)} – ${monthLong(p.end)}`;
  }

  // ------------------------------------------------------------- DOM ----

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    setAttrs(el, attrs);
    append(el, children);
    return el;
  }

  function s(tag, attrs, children) {
    const el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs);
    append(el, children);
    return el;
  }

  function setAttrs(el, attrs) {
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = String(v);
      else if (k === 'class') el.setAttribute('class', v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }

  function append(el, children) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) append(el, c);
      else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
  }

  function card(title, subtitle, actions, body, extraClass) {
    return h('section', { class: 'ba-card' + (extraClass ? ' ' + extraClass : '') }, [
      h('header', { class: 'ba-card-head' }, [
        h('div', { class: 'ba-card-titles' }, [
          h('h3', { class: 'ba-card-title', text: title }),
          subtitle ? h('p', { class: 'ba-card-sub', text: subtitle }) : null
        ]),
        actions || null
      ]),
      body
    ]);
  }

  function segmented(name, options, value, label) {
    return h('div', { class: 'ba-seg', role: 'group', 'aria-label': label },
      options.map(o => h('button', {
        type: 'button',
        class: 'ba-seg-btn' + (o.key === value ? ' is-on' : ''),
        'aria-pressed': o.key === value ? 'true' : 'false',
        'data-ba-set': name,
        'data-ba-value': o.key,
        text: o.label
      })));
  }

  function srTable(caption, head, rows) {
    // Sarmalayici div gizlenir: uygulamanin genel tablo kurallari (genislik)
    // tablonun kendisindeki 1px kuralini ezebiliyor.
    return h('div', { class: 'ba-sr-only' }, h('table', {}, [
      h('caption', { text: caption }),
      h('thead', {}, h('tr', {}, head.map(c => h('th', { scope: 'col', text: c })))),
      h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => i === 0 ? h('th', { scope: 'row', text: c }) : h('td', { text: c })))))
    ]));
  }

  function deltaChip(d, good, suffix) {
    if (!d) return null;
    const v = d.value;
    const yukari = v > 0;
    const asagi = v < 0;
    let ton = 'ba-delta-flat';
    if (good !== 'neutral' && (yukari || asagi)) {
      const iyi = (yukari && good === 'up') || (asagi && good === 'down');
      ton = iyi ? 'ba-delta-good' : 'ba-delta-bad';
    }
    const ok = yukari ? '▲' : asagi ? '▼' : '■';
    const deger = d.kind === 'pp'
      ? `${nf1.format(Math.abs(v))} puan`
      : `%${nf1.format(Math.abs(v))}`;
    const yon = yukari ? 'arttı' : asagi ? 'azaldı' : 'değişmedi';
    return h('span', { class: 'ba-delta ' + ton }, [
      h('span', { class: 'ba-delta-val' }, [
        h('span', { 'aria-hidden': 'true', class: 'ba-delta-arrow', text: ok }),
        h('span', { class: 'ba-sr-only', text: yon + ' ' }),
        deger
      ]),
      suffix ? h('span', { class: 'ba-delta-ctx', text: suffix }) : null
    ]);
  }

  // ------------------------------------------------------------ grafik --

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const adim = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return adim * p;
  }

  function seriesClass(slot) {
    return slot === 'target' ? 'ba-s-target' : 'ba-s' + slot;
  }

  /**
   * Cok serili cizgi grafigi. Tek y ekseni. null degerde cizgi kopar.
   * Imlecle ya da ok tuslariyla ay secilir; ipucu her serinin degerini yazar.
   */
  function lineChart(opts) {
    const { months, series, kind, width, height = 240, title } = opts;
    const W = Math.max(280, Math.floor(width || 640));
    const H = height;
    const pad = { t: 12, r: 12, b: 26, l: kind === 'money' ? 56 : 40 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const tum = [];
    series.forEach(sr => sr.values.forEach(v => { if (v !== null && Number.isFinite(v)) tum.push(v); }));
    const ymax = niceMax(Math.max(0, ...tum) * 1.05 || 1);
    const x = i => pad.l + (months.length === 1 ? iw / 2 : (i / (months.length - 1)) * iw);
    const y = v => pad.t + ih - (v / ymax) * ih;

    const wrap = h('div', { class: 'ba-chart' });
    const svg = s('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ba-svg', role: 'img',
      'aria-label': title, focusable: 'false'
    });
    // Izgara + y ekseni etiketleri (4 aralik)
    for (let i = 0; i <= 4; i++) {
      const v = ymax * i / 4;
      const yy = y(v);
      svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: i === 0 ? 'ba-axis' : 'ba-grid' }));
      svg.appendChild(s('text', { x: pad.l - 8, y: yy + 4, class: 'ba-tick', 'text-anchor': 'end', text: fmtAxis(v, kind) }));
    }
    // x etiketleri: en fazla ~7
    const adim = Math.max(1, Math.ceil(months.length / 7));
    months.forEach((m, i) => {
      // Sondan geriye esit aralik: son ay hep yazilir, etiketler cakismaz.
      if ((months.length - 1 - i) % adim !== 0) return;
      svg.appendChild(s('text', { x: x(i), y: H - 6, class: 'ba-tick', 'text-anchor': 'middle', text: monthShort(m) }));
    });
    // Seriler: once kiyaslar, en ustte secili donem
    series.slice().reverse().forEach(sr => {
      let d = '';
      let acik = false;
      sr.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) { acik = false; return; }
        d += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
        acik = true;
      });
      if (!d) return;
      svg.appendChild(s('path', { d: d.trim(), class: 'ba-line ' + seriesClass(sr.slot) + (sr.primary ? ' is-primary' : '') }));
      // Tek noktalik parcalar gorunsun diye nokta
      sr.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) return;
        const once = i > 0 ? sr.values[i - 1] : null;
        const sonra = i < sr.values.length - 1 ? sr.values[i + 1] : null;
        if ((once === null || !Number.isFinite(once)) && (sonra === null || !Number.isFinite(sonra))) {
          svg.appendChild(s('circle', { cx: x(i), cy: y(v), r: 3, class: 'ba-dot ' + seriesClass(sr.slot) }));
        }
      });
    });
    const cursor = s('line', { x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih, class: 'ba-cursor', visibility: 'hidden' });
    svg.appendChild(cursor);
    const marks = series.map(sr => {
      const c = s('circle', { r: 4.5, class: 'ba-active-dot ' + seriesClass(sr.slot), visibility: 'hidden' });
      svg.appendChild(c);
      return c;
    });
    const hit = s('rect', { x: pad.l, y: pad.t, width: iw, height: ih, class: 'ba-hit' });
    svg.appendChild(hit);
    wrap.appendChild(svg);

    // Ipucu yalniz gorseldir: degerler gizli veri tablosunda (srTable) okunur;
    // her imlec hareketinde ekran okuyucuya anons edilmez.
    const tip = h('div', { class: 'ba-tip', 'aria-hidden': 'true', hidden: true });
    wrap.appendChild(tip);
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', title + '. Ayları ok tuşlarıyla gezin.');

    let aktif = -1;
    function goster(i) {
      if (i < 0 || i >= months.length) return;
      aktif = i;
      const xx = x(i);
      cursor.setAttribute('x1', xx);
      cursor.setAttribute('x2', xx);
      cursor.setAttribute('visibility', 'visible');
      series.forEach((sr, k) => {
        const v = sr.values[i];
        if (v === null || !Number.isFinite(v)) { marks[k].setAttribute('visibility', 'hidden'); return; }
        marks[k].setAttribute('cx', xx);
        marks[k].setAttribute('cy', y(v));
        marks[k].setAttribute('visibility', 'visible');
      });
      tip.textContent = '';
      tip.appendChild(h('p', { class: 'ba-tip-title', text: monthLong(months[i]) }));
      tip.appendChild(h('ul', { class: 'ba-tip-list' }, series.map(sr => h('li', {}, [
        h('span', { class: 'ba-tip-key' }, [h('span', { class: 'ba-swatch ' + seriesClass(sr.slot), 'aria-hidden': 'true' }), sr.label]),
        h('span', { class: 'ba-tip-val', text: fmt(sr.values[i], kind) })
      ]))));
      tip.hidden = false;
      const oran = W > 0 ? xx / W : 0;
      tip.classList.toggle('is-left', oran > 0.6);
      tip.dataset.x = String(Math.round(oran * 100));
      positionTip(tip, wrap, oran);
    }
    function gizle() {
      aktif = -1;
      cursor.setAttribute('visibility', 'hidden');
      marks.forEach(m => m.setAttribute('visibility', 'hidden'));
      tip.hidden = true;
    }
    function indexFromEvent(ev) {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / (r.width || W));
      if (months.length === 1) return 0;
      return Math.max(0, Math.min(months.length - 1, Math.round((px - pad.l) / iw * (months.length - 1))));
    }
    hit.addEventListener('pointermove', ev => goster(indexFromEvent(ev)));
    // Telefonda dokunus pointermove uretmez; ipucu dokunulan ayda acilir.
    // Parmak kalkinca gelen pointerleave ipucunu kapatmasin: yalniz fare.
    hit.addEventListener('pointerdown', ev => goster(indexFromEvent(ev)));
    hit.addEventListener('pointerleave', ev => { if (!ev || ev.pointerType === 'mouse') gizle(); });
    wrap.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowRight') { goster(Math.min(months.length - 1, aktif + 1)); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { goster(Math.max(0, aktif < 0 ? months.length - 1 : aktif - 1)); ev.preventDefault(); }
      else if (ev.key === 'Escape') gizle();
    });
    wrap.addEventListener('blur', gizle);
    // Grafik disina dokunus ipucunu kapatir (mount'taki belge dinleyicisi cagirir).
    wrap.__baGizle = gizle;
    return wrap;
  }

  // Ipucunun konumu CSSOM ile (CSP style= ozniteligini reddeder, CSSOM'u degil).
  function positionTip(tip, wrap, oran) {
    if (!tip.style) return;
    tip.style.left = oran > 0.6 ? '' : `calc(${(oran * 100).toFixed(1)}% + 12px)`;
    tip.style.right = oran > 0.6 ? `calc(${(100 - oran * 100).toFixed(1)}% + 12px)` : '';
  }

  function sparkline(values) {
    const W = 96;
    const H = 30;
    const v = values.map(x => (x === null || !Number.isFinite(x) ? null : x));
    const dolu = v.filter(x => x !== null);
    if (dolu.length < 2) return null;
    const max = Math.max(...dolu);
    const min = Math.min(0, ...dolu);
    const span = max - min || 1;
    const x = i => 2 + (i / (v.length - 1)) * (W - 4);
    const y = val => H - 3 - ((val - min) / span) * (H - 6);
    let d = '';
    let acik = false;
    v.forEach((val, i) => {
      if (val === null) { acik = false; return; }
      d += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)} `;
      acik = true;
    });
    return s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ba-spark', 'aria-hidden': 'true', focusable: 'false' },
      [s('path', { d: d.trim(), class: 'ba-line ba-s1' })]);
  }

  /** Dikey cubuk grafik (tek seri). Her cubugun ustunde adet. */
  function barChart(labels, values, title, width) {
    const W = Math.max(200, Math.floor(width || 300));
    const H = 150;
    const pad = { t: 18, r: 4, b: 22, l: 4 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const max = Math.max(1, ...values);
    const step = iw / labels.length;
    const bw = Math.min(28, step * 0.6);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'ba-svg', role: 'img', 'aria-label': title, focusable: 'false' });
    svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih, class: 'ba-axis' }));
    labels.forEach((lab, i) => {
      const v = values[i] || 0;
      const bh = (v / max) * ih;
      const cx = pad.l + step * i + step / 2;
      if (v > 0) {
        const r = Math.min(4, bw / 2, bh);
        const x0 = cx - bw / 2;
        const y0 = pad.t + ih - bh;
        // Yalniz ust koseler yuvarlak, taban eksene oturur
        const d = `M${x0},${pad.t + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${pad.t + ih} Z`;
        svg.appendChild(s('path', { d, class: 'ba-bar ba-s1' }, [s('title', { text: `${lab}: ${nf0.format(v)}` })]));
      }
      svg.appendChild(s('text', { x: cx, y: pad.t + ih - bh - 5, class: 'ba-bar-label', 'text-anchor': 'middle', text: v > 0 ? nf0.format(v) : '' }));
      svg.appendChild(s('text', { x: cx, y: H - 6, class: 'ba-tick', 'text-anchor': 'middle', text: lab }));
    });
    return svg;
  }

  /** Halka grafik. Dilimler arasinda 2px yuzey boslugu. */
  function donut(slices, centerTop, centerBottom, title) {
    const size = 168;
    const r = 80;
    const ri = 56;
    const c = size / 2;
    const toplam = slices.reduce((t, sl) => t + Math.max(0, sl.value), 0);
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'ba-svg ba-donut', role: 'img', 'aria-label': title, focusable: 'false' });
    if (!(toplam > 0)) {
      svg.appendChild(s('circle', { cx: c, cy: c, r: (r + ri) / 2, class: 'ba-donut-empty' }));
    } else {
      let a0 = -Math.PI / 2;
      slices.forEach(sl => {
        const a = (Math.max(0, sl.value) / toplam) * Math.PI * 2;
        if (a <= 0) return;
        const a1 = a0 + a;
        if (a >= Math.PI * 2 - 1e-6) {
          svg.appendChild(s('circle', { cx: c, cy: c, r: (r + ri) / 2, class: 'ba-donut-ring ' + sl.cls }, [s('title', { text: sl.title })]));
        } else {
          const p = (rad, ang) => `${(c + rad * Math.cos(ang)).toFixed(2)},${(c + rad * Math.sin(ang)).toFixed(2)}`;
          const buyuk = a > Math.PI ? 1 : 0;
          const d = `M${p(r, a0)} A${r},${r} 0 ${buyuk} 1 ${p(r, a1)} L${p(ri, a1)} A${ri},${ri} 0 ${buyuk} 0 ${p(ri, a0)} Z`;
          svg.appendChild(s('path', { d, class: 'ba-slice ' + sl.cls }, [s('title', { text: sl.title })]));
        }
        a0 = a1;
      });
    }
    svg.appendChild(s('text', { x: c, y: c - 4, class: 'ba-donut-k', 'text-anchor': 'middle', text: centerTop }));
    svg.appendChild(s('text', { x: c, y: c + 16, class: 'ba-donut-v', 'text-anchor': 'middle', text: centerBottom }));
    return svg;
  }

  // ------------------------------------------------------------ durum ----

  function presetPeriod(preset, anchor) {
    const sm = BookingAnalytics.shiftMonth;
    switch (preset) {
      case '3m': return { start: sm(anchor, -2), end: anchor };
      case '6m': return { start: sm(anchor, -5), end: anchor };
      case '12m': return { start: sm(anchor, -11), end: anchor };
      case 'ytd': return { start: anchor.slice(0, 4) + '-01', end: anchor };
      default: return { start: anchor, end: anchor };
    }
  }

  function mount(rootEl, options) {
    if (!rootEl) throw new Error('ANALYTICS_ROOT_REQUIRED');
    const opt = options || {};
    const state = {
      villa: opt.initialVilla || 'ALL',
      preset: 'month',
      anchor: null,
      compare: { yoy1: true, yoy2: false, prev: true, portfolio: true, target: true },
      metric: 'revenue',
      sort: { key: 'revenue', dir: 'desc' }
    };
    let lastReport = null;
    let resizeTimer = null;

    function data() {
      const d = (typeof opt.getData === 'function' ? opt.getData() : null) || {};
      return {
        bookings: d.bookings || [],
        leads: d.leads || [],
        villas: d.villas || [],
        today: d.today
      };
    }

    function months() {
      const list = typeof opt.monthOptions === 'function' ? (opt.monthOptions() || []) : [];
      return list.filter(BookingAnalytics.isMonthKey).slice().sort();
    }

    function onClick(ev) {
      const t = ev.target && ev.target.closest ? ev.target.closest('[data-ba-set],[data-ba-toggle],[data-ba-sort],[data-ba-villa]') : null;
      if (!t || !rootEl.contains(t)) return;
      if (t.hasAttribute('data-ba-set')) {
        const k = t.getAttribute('data-ba-set');
        const v = t.getAttribute('data-ba-value');
        if (k === 'preset') state.preset = v;
        if (k === 'metric') state.metric = v;
        render();
      } else if (t.hasAttribute('data-ba-toggle')) {
        const k = t.getAttribute('data-ba-toggle');
        state.compare[k] = !state.compare[k];
        render();
      } else if (t.hasAttribute('data-ba-sort')) {
        const k = t.getAttribute('data-ba-sort');
        state.sort = state.sort.key === k ? { key: k, dir: state.sort.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: k === 'name' ? 'asc' : 'desc' };
        render();
      } else if (t.hasAttribute('data-ba-villa')) {
        setVilla(t.getAttribute('data-ba-villa'));
      }
    }

    function onChange(ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-ba-select') === 'villa') setVilla(t.value);
      if (t.getAttribute('data-ba-select') === 'anchor') { state.anchor = t.value; render(); }
    }

    function setVilla(v) {
      state.villa = v || 'ALL';
      if (typeof opt.onVillaChange === 'function') opt.onVillaChange(state.villa);
      render();
    }

    // Yalniz GENISLIK degisince yeniden ciz: telefonda kaydirirken adres cubugu
    // gizlenip gorununce yukseklik degisir; o zaman cizmek sayfayi ziplatirdi.
    let sonGenislik = typeof window !== 'undefined' ? window.innerWidth : 0;
    function onResize() {
      const w = typeof window !== 'undefined' ? window.innerWidth : 0;
      if (w === sonGenislik) return;
      sonGenislik = w;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (lastReport) render(); }, 150);
    }

    // Telefonda acik ipucu, grafigin disina dokununca kapanir.
    function onDocPointerDown(ev) {
      Array.from(rootEl.querySelectorAll('.ba-chart')).forEach(c => {
        if (typeof c.__baGizle === 'function' && !c.contains(ev.target)) c.__baGizle();
      });
    }

    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('change', onChange);
    if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('pointerdown', onDocPointerDown);
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', onResize);

    // Yeniden cizim tum dugumleri degistirir; klavye odagi ayni kontrole
    // (ayni data-ba-* kimligine) geri verilir, sayfanin basina dusmez.
    const FOCUS_KEYS = ['data-ba-set', 'data-ba-toggle', 'data-ba-sort', 'data-ba-select', 'data-ba-villa'];
    function focusKey() {
      const a = typeof document !== 'undefined' ? document.activeElement : null;
      if (!a || !a.getAttribute || !rootEl.contains(a)) return null;
      const k = FOCUS_KEYS.find(x => a.hasAttribute(x));
      if (!k) return null;
      const v = a.getAttribute('data-ba-value');
      return { k, id: a.getAttribute(k), v };
    }
    function restoreFocus(fk) {
      if (!fk) return;
      const el = Array.from(rootEl.querySelectorAll('[' + fk.k + ']'))
        .find(n => n.getAttribute(fk.k) === fk.id && (fk.v === null || n.getAttribute('data-ba-value') === fk.v));
      if (el && typeof el.focus === 'function') el.focus();
    }

    function render() {
      const fk = focusKey();
      draw();
      restoreFocus(fk);
    }

    function draw() {
      const d = data();
      const ayListesi = months();
      const bugunAy = typeof d.today === 'string' ? d.today.slice(0, 7) : null;
      if (!state.anchor || (ayListesi.length && !ayListesi.includes(state.anchor))) {
        // Varsayilan: son TAMAMLANAN ay. Suren ay tam bir gecen yil ayiyla
        // kiyaslanirsa her rozet yaniltici bicimde "dusus" der.
        const gecenAy = bugunAy ? BookingAnalytics.shiftMonth(bugunAy, -1) : null;
        const uygun = ayListesi.filter(m => !gecenAy || m <= gecenAy);
        state.anchor = ayListesi.length
          ? (uygun.includes(gecenAy) ? gecenAy : (uygun[uygun.length - 1] || ayListesi[0]))
          : gecenAy;
      }
      if (state.villa !== 'ALL' && !d.villas.some(v => v.key === state.villa)) state.villa = 'ALL';
      rootEl.textContent = '';
      rootEl.classList.add('ba-root');
      if (!state.anchor) {
        rootEl.appendChild(emptyState('Dönem seçilemedi', 'Bugünün tarihi okunamadı; sayfayı yenileyin.'));
        return;
      }
      const period = presetPeriod(state.preset, state.anchor);
      let report;
      try {
        report = BookingAnalytics.buildReport({
          bookings: d.bookings, leads: d.leads, villas: d.villas, today: d.today,
          period, villa: state.villa, deps: opt.deps || {}
        });
      } catch (err) {
        rootEl.appendChild(emptyState('Analiz hesaplanamadı', String(err && err.message || err)));
        return;
      }
      lastReport = report;
      rootEl.appendChild(renderHeader(report, d, ayListesi));
      if (report.empty) {
        rootEl.appendChild(emptyState('Henüz rezervasyon yok',
          'Rezervasyon ekledikçe ciro, doluluk, kanal ve davranış analizleri burada kendiliğinden oluşur.'));
        return;
      }
      rootEl.appendChild(renderKpis(report));
      rootEl.appendChild(renderTrend(report));
      const grid = h('div', { class: 'ba-grid-2' });
      grid.appendChild(renderChannels(report));
      grid.appendChild(renderPace(report));
      rootEl.appendChild(grid);
      if (report.villa === 'ALL') rootEl.appendChild(renderProperties(report));
      rootEl.appendChild(renderBehavior(report));
      const leadsOk = typeof opt.canReadLeads === 'function' ? opt.canReadLeads() : true;
      if (leadsOk) rootEl.appendChild(renderLeads(report));
      if (report.villa !== 'ALL') rootEl.appendChild(renderProperties(report));
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(markOverflow);
    }

    // Kendi kutusunda yana kayan tablo: ustune ipucu, kenarlarina golge (CSS).
    function markOverflow() {
      Array.from(rootEl.querySelectorAll('.ba-scroll')).forEach(el => {
        const tasar = el.scrollWidth > el.clientWidth + 1;
        el.classList.toggle('is-overflowing', tasar);
        const onceki = el.previousElementSibling;
        const var_ = onceki && onceki.classList && onceki.classList.contains('ba-scroll-note');
        if (tasar && !var_ && el.parentNode) {
          el.parentNode.insertBefore(h('p', { class: 'ba-scroll-note', text: 'Tablonun devamı için sağa kaydırın →' }), el);
        } else if (!tasar && var_) {
          onceki.parentNode.removeChild(onceki);
        }
      });
    }

    function width(el, fallback) {
      const w = el && el.clientWidth;
      return w && w > 0 ? w : fallback;
    }

    // --------------------------------------------------------- baslik --
    function renderHeader(report, d, ayListesi) {
      const villaName = report.villa === 'ALL'
        ? 'Tüm mülkler'
        : ((d.villas.find(v => v.key === report.villa) || {}).name || report.villa);
      const yoy = report.kpis.deltas.revenue.yoy1;
      const ozet = [periodLabel(report.period), villaName];
      const bugunAy = typeof d.today === 'string' ? d.today.slice(0, 7) : null;
      const suruyor = bugunAy && report.period.start <= bugunAy && report.period.end >= bugunAy;
      if (yoy) ozet.push(`ciro geçen yıla göre ${yoy.value >= 0 ? '+' : '−'}%${nf1.format(Math.abs(yoy.value))}`);

      const anchorSel = h('select', { class: 'ba-select', 'data-ba-select': 'anchor', 'aria-label': 'Dönemin son ayı' },
        (ayListesi.length ? ayListesi : [state.anchor]).slice().reverse().map(m => h('option', {
          value: m, selected: m === state.anchor, text: monthLong(m)
        })));
      const villaSel = h('select', { class: 'ba-select', 'data-ba-select': 'villa', 'aria-label': 'Mülk' },
        [h('option', { value: 'ALL', selected: report.villa === 'ALL', text: 'Tüm mülkler' })].concat(
          d.villas.map(v => h('option', { value: v.key, selected: report.villa === v.key, text: v.name || v.key }))));

      const chips = h('div', { class: 'ba-chips', role: 'group', 'aria-label': 'Karşılaştır' }, [
        h('span', { class: 'ba-chips-label', text: 'Karşılaştır' }),
        // Portfoy ortalamasi yalniz tek mulkte anlamlidir; tum mulklerde
        // devre disi bir dugme yerine hic gosterilmez.
        COMPARES.filter(c => visibleCompare(c, report)).map(c => {
          return h('button', {
            type: 'button',
            class: 'ba-chip' + (state.compare[c.key] ? ' is-on' : ''),
            'aria-pressed': state.compare[c.key] ? 'true' : 'false',
            'data-ba-toggle': c.key
          }, [h('span', { class: 'ba-swatch ' + seriesClass(c.slot), 'aria-hidden': 'true' }), c.label]);
        })
      ]);

      return h('header', { class: 'ba-head' }, [
        h('div', { class: 'ba-head-top' }, [
          h('div', {}, [
            h('h2', { class: 'ba-title', text: 'Analiz' }),
            h('p', { class: 'ba-subtitle', text: ozet.join(' · ') }),
            suruyor ? h('p', { class: 'ba-running', text: `${monthLong(bugunAy)} sürüyor: rakamlar bugüne kadar girilmiş rezervasyonlardır, karşılaştırmalar tamamlanmış dönemlerle yapılır.` }) : null
          ]),
          h('div', { class: 'ba-filters' }, [villaSel, anchorSel, segmented('preset', PRESETS, state.preset, 'Dönem uzunluğu')])
        ]),
        chips
      ]);
    }

    // Portfoy ortalamasi yalniz tek mulkte; hedef yalniz hedefleri okuyabilen
    // rolde (satis rolune hedefler yuklenmez, 'hedef girilmemis' demek yanlis olur).
    function visibleCompare(c, report) {
      if (c.key === 'portfolio' && report.villa === 'ALL') return false;
      if (c.key === 'target' && typeof opt.canSeeTargets === 'function' && !opt.canSeeTargets()) return false;
      return true;
    }

    function activeCompares(report) {
      return COMPARES.filter(c => state.compare[c.key] && visibleCompare(c, report));
    }

    // ----------------------------------------------------------- KPI ---
    function renderKpis(report) {
      const k = report.kpis;
      const trend = report.trend.series;
      const aktif = activeCompares(report);
      return h('div', { class: 'ba-kpis' }, KPI_ORDER.map(metric => {
        const def = METRIC_DEFS[metric];
        const deger = k.current[metric];
        const satirlar = aktif.map(c => {
          const dd = k.deltas[metric] && k.deltas[metric][c.key];
          if (!dd) return null;
          let ek = c.short;
          // Kismi hedef: fark yalniz hedefi olan aylarin gerceklesenine gore.
          const kap = c.key === 'target' && k.compare.target && k.compare.target.coverage
            ? k.compare.target.coverage[metric] : null;
          if (kap && kap.months.length < kap.total) ek += ` · hedefli ay ${kap.months.length}/${kap.total}`;
          return h('li', {}, deltaChip(dd, def.good, ek));
        }).filter(Boolean);
        let neden = null;
        if (deger === null) neden = nullReason(metric, k.current);
        const spark = trend[metric] ? sparkline(trend[metric].current) : null;
        return h('article', { class: 'ba-kpi' }, [
          h('p', { class: 'ba-kpi-label', text: def.label, title: def.hint || null }),
          h('div', { class: 'ba-kpi-row' }, [
            h('p', { class: 'ba-kpi-value', text: fmt(deger, def.fmt) }),
            spark
          ]),
          neden ? h('p', { class: 'ba-kpi-note', text: neden }) : null,
          satirlar.length ? h('ul', { class: 'ba-kpi-deltas' }, satirlar)
            : (aktif.length ? h('p', { class: 'ba-kpi-note', text: 'Karşılaştırılacak veri yok' }) : null)
        ]);
      }));
    }

    function nullReason(metric, cur) {
      if (metric === 'occupancy' || metric === 'revpar') {
        return cur.available === 0 ? 'Bu dönemde satılabilir gece yok' : 'Kapasite ölçülemedi';
      }
      if (metric === 'adr') return 'Satılan gece yok';
      if (metric === 'avgStay') return 'Rezervasyon yok';
      if (metric === 'avgLeadTime') {
        return cur.leadTimeExcluded > 0
          ? 'Kayıtlar sonradan ya da içe aktarımla girilmiş; ölçülemedi'
          : 'Rezervasyon yok';
      }
      return null;
    }

    // ---------------------------------------------------------- trend --
    function renderTrend(report) {
      const def = METRIC_DEFS[state.metric];
      const sr = report.trend.series[state.metric];
      const months = report.trend.months;
      const villaLabel = report.villa === 'ALL' ? 'Tüm mülkler' : 'Seçili mülk';
      const seriler = [{ key: 'current', label: villaLabel, slot: 1, values: sr.current, primary: true }];
      const notlar = [];
      activeCompares(report).forEach(c => {
        // 12 aylik pencerede onceki donem = gecen yil; ayni cizgi iki kez cizilmez.
        if (c.key === 'prev' && months.length === 12) {
          notlar.push('Önceki dönem 12 aylık pencerede geçen yılla aynıdır');
          return;
        }
        const vals = sr[c.key];
        if (vals) seriler.push({ key: c.key, label: c.label, slot: c.slot, values: vals });
        else if (c.key === 'target') notlar.push(`${def.label} için hedef girilmemiş`);
        else notlar.push(`${c.label}: kayıt yok`);
      });
      const segs = segmented('metric', TREND_METRICS.map(m => ({ key: m, label: METRIC_DEFS[m].label })), state.metric, 'Gösterilen ölçü');
      const body = h('div', { class: 'ba-trend' });
      const legend = seriler.length > 1 ? h('ul', { class: 'ba-legend' }, seriler.map(x => h('li', {}, [
        h('span', { class: 'ba-legend-line ' + seriesClass(x.slot), 'aria-hidden': 'true' }), x.label
      ]))) : null;
      append(body, [legend]);
      const chartHost = h('div', { class: 'ba-chart-host' });
      body.appendChild(chartHost);
      const title = `${def.label}, ${monthLong(months[0])} – ${monthLong(months[months.length - 1])}`;
      // Genislik kart eklendikten sonra bilinir; once tahmini, sonra olculen.
      const draw = () => {
        chartHost.textContent = '';
        chartHost.appendChild(lineChart({ months, series: seriler, kind: def.fmt === 'nights' || def.fmt === 'days' ? 'num' : def.fmt, width: width(chartHost, 720), title }));
      };
      draw();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (chartHost.isConnected && chartHost.clientWidth) draw(); });
      if (notlar.length) body.appendChild(h('p', { class: 'ba-footnote', text: notlar.join(' · ') }));
      body.appendChild(srTable(title, ['Ay'].concat(seriler.map(x => x.label)),
        months.map((m, i) => [monthLong(m)].concat(seriler.map(x => fmt(x.values[i], def.fmt))))));
      const sub = months.length > BookingAnalytics.monthsBetween(report.period.start, report.period.end).length
        ? 'Son 12 ay, aylık' : 'Seçili dönem, aylık';
      return card('Aylık trend', sub, segs, body, 'ba-card-wide');
    }

    // ---------------------------------------------------------- kanal --
    function renderChannels(report) {
      const ch = report.channels;
      if (!ch.rows.length) {
        return card('Kanal dağılımı', 'Konaklama cirosu payı', null, h('p', { class: 'ba-empty-line', text: 'Bu dönemde kanal verisi yok' }));
      }
      // Halkada her dilim her dilimin yanina gelebilir: tum ciftlerde
      // ayristigi dogrulanan yalniz 3 renk var. 3 ya da daha az kanal varsa
      // hepsi renkli; fazlasi ilk 3 + "Diger" (gri). Renk, gosterilen
      // kanallarin alfabetik sirasindan gelir: her kanal ayri renk alir.
      const ilk = ch.rows.slice(0, 3);
      const kalan = ch.rows.slice(ilk.length);
      const renkliKodlar = ilk.map(r => r.key).sort((a, b) => a.localeCompare(b, 'tr'));
      const slotOf = key => renkliKodlar.indexOf(key) + 1;
      const slices = ilk.map(r => ({ value: r.revenue, cls: 'ba-s' + slotOf(r.key), title: `${r.label}: ${fmt(r.revenue, 'money')}`, row: r }));
      if (kalan.length) {
        const top = kalan.reduce((t, r) => t + r.revenue, 0);
        slices.push({ value: top, cls: 'ba-s-other', title: `Diğer: ${fmt(top, 'money')}`, row: null });
      }
      const title = `Kanal dağılımı, ${periodLabel(report.period)}`;
      const list = h('table', { class: 'ba-table ba-table-compact' }, [
        h('thead', {}, h('tr', {}, ['Kanal', 'Ciro', 'Pay', 'Rez.', 'ADR', 'İptal'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : null, text: t })))),
        h('tbody', {}, ch.rows.map((r, i) => h('tr', {}, [
          h('th', { scope: 'row' }, [h('span', { class: 'ba-swatch ' + (i < ilk.length ? 'ba-s' + slotOf(r.key) : 'ba-s-other'), 'aria-hidden': 'true' }), r.label]),
          h('td', { class: 'num', text: fmt(r.revenue, 'money') }),
          h('td', { class: 'num', text: fmt(r.share, 'pct') }),
          h('td', { class: 'num', text: fmt(r.bookings, 'num') }),
          h('td', { class: 'num', text: fmt(r.adr, 'money') }),
          h('td', { class: 'num', text: fmt(r.cancelRate, 'pct') })
        ])))
      ]);
      const body = h('div', { class: 'ba-donut-wrap' }, [donut(slices, 'Toplam', fmtAxis(ch.totalRevenue, 'money'), title), h('div', { class: 'ba-scroll' }, list)]);
      return card('Kanal dağılımı', 'Konaklama cirosu payı · rezervasyon ve iptal girişe göre', null, body);
    }

    // ------------------------------------------------------- ileriye --
    function renderPace(report) {
      const p = report.pace;
      const rows = p.rows;
      const max = Math.max(1, ...rows.map(r => Math.max(r.nights, r.lastYear ? r.lastYear.nights : 0)));
      const body = h('div', { class: 'ba-pace' }, rows.map(r => {
        const bar = (val, cls, label) => {
          const yuzde = Math.round((val / max) * 100);
          const b = h('div', { class: 'ba-pace-bar' }, [
            h('span', { class: 'ba-pace-key', text: label }),
            h('div', { class: 'ba-pace-track' }, [h('div', { class: 'ba-pace-fill ' + cls, 'data-w': yuzde })]),
            h('span', { class: 'ba-pace-val', text: `${nf0.format(val)} gece` })
          ]);
          return b;
        };
        return h('div', { class: 'ba-pace-row' }, [
          h('div', { class: 'ba-pace-head' }, [
            h('span', { class: 'ba-pace-month', text: monthLong(r.month) }),
            h('span', { class: 'ba-pace-rev', text: fmt(r.revenue, 'money') }),
            r.revenueDelta ? deltaChip(r.revenueDelta, 'up', 'geçen yıl bu tarihe göre') : null
          ]),
          bar(r.nights, 'ba-s1', 'Bu yıl'),
          r.lastYear ? bar(r.lastYear.nights, 'ba-s2', 'Geçen yıl') : h('p', { class: 'ba-kpi-note', text: r.lastYearReason || 'Geçen yıl verisi yok' })
        ]);
      }));
      const c = card('İleriye dolu', `Bugüne kadar satılmış · geçen yıl ${formatDay(p.lastYearAsOf)} itibarıyla`, null, body);
      applyWidths(c);
      return c;
    }

    function formatDay(dt) {
      const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${Number(m[3])} ${AYLAR_UZUN[Number(m[2]) - 1]} ${m[1]}` : BOS;
    }

    // Cubuk genislikleri CSSOM ile (CSP style= ozniteligini reddeder).
    function applyWidths(scope) {
      scope.querySelectorAll('[data-w]').forEach(el => {
        if (el.style) el.style.width = Math.max(0, Math.min(100, Number(el.getAttribute('data-w')) || 0)) + '%';
      });
    }

    // ----------------------------------------------------- mulk tablo --
    function renderProperties(report) {
      const P = report.properties;
      const cols = [
        { key: 'name', label: 'Mülk', get: r => r.name || r.key, kind: 'text' },
        { key: 'revenue', label: 'Ciro', kind: 'money' },
        { key: 'revenueShare', label: 'Pay', kind: 'pct', get: r => r.revenueShare },
        { key: 'yoy', label: 'Geçen yıla göre', kind: 'delta', get: r => r.yoyRevenue ? r.yoyRevenue.value : null },
        { key: 'occupancy', label: 'Doluluk', kind: 'pct' },
        { key: 'adr', label: 'ADR', kind: 'money' },
        { key: 'revpar', label: 'RevPAR', kind: 'money' },
        { key: 'nights', label: 'Gece', kind: 'num' },
        { key: 'bookings', label: 'Rez.', kind: 'num' },
        { key: 'avgStay', label: 'Ort. konaklama', kind: 'nights' },
        { key: 'avgLeadTime', label: 'Öncesi süre', kind: 'days' },
        { key: 'cancelRate', label: 'İptal', kind: 'pct' }
      ];
      const val = (r, c) => (c.get ? c.get(r) : r.metrics[c.key]);
      const rows = P.rows.slice().sort((a, b) => {
        const c = cols.find(x => x.key === state.sort.key) || cols[1];
        const va = val(a, c);
        const vb = val(b, c);
        if (c.kind === 'text') return state.sort.dir === 'asc' ? String(va).localeCompare(String(vb), 'tr') : String(vb).localeCompare(String(va), 'tr');
        const na = va === null || va === undefined ? -Infinity : va;
        const nb = vb === null || vb === undefined ? -Infinity : vb;
        return state.sort.dir === 'asc' ? na - nb : nb - na;
      });
      const head = h('tr', {}, cols.map(c => {
        const on = state.sort.key === c.key;
        return h('th', { scope: 'col', class: c.kind === 'text' ? null : 'num', 'aria-sort': on ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
          h('button', { type: 'button', class: 'ba-sort' + (on ? ' is-on' : ''), 'data-ba-sort': c.key }, [
            c.label, h('span', { 'aria-hidden': 'true', class: 'ba-sort-ico', text: on ? (state.sort.dir === 'asc' ? '↑' : '↓') : '↕' })
          ]));
      }));
      const cell = (r, c) => {
        if (c.kind === 'text') {
          return h('th', { scope: 'row' }, h('button', {
            type: 'button', class: 'ba-link', 'data-ba-villa': r.key, title: 'Bu mülkün analizini aç'
          }, r.name || r.key));
        }
        if (c.kind === 'delta') return h('td', { class: 'num' }, r.yoyRevenue ? deltaChip(r.yoyRevenue, 'up') : BOS);
        return h('td', { class: 'num', text: fmt(val(r, c), c.kind) });
      };
      const body = rows.map(r => h('tr', { class: r.key === report.villa ? 'is-selected' : null }, cols.map(c => cell(r, c))));
      const totalRow = (label, m, cls) => h('tr', { class: cls }, cols.map(c => {
        if (c.kind === 'text') return h('th', { scope: 'row', text: label });
        if (c.key === 'revenueShare') return h('td', { class: 'num', text: cls === 'ba-total' && P.total.revenue > 0 ? '%100' : BOS });
        if (c.kind === 'delta') return h('td', { class: 'num', text: BOS });
        return h('td', { class: 'num', text: fmt(m ? m[c.key] : null, c.kind) });
      }));
      const tfoot = h('tfoot', {}, [
        totalRow('Portföy toplamı', P.total, 'ba-total'),
        P.average ? totalRow('Mülk ortalaması', P.average, 'ba-avg') : null
      ]);
      const table = h('table', { class: 'ba-table' }, [
        h('caption', { class: 'ba-sr-only', text: `Mülk karşılaştırması, ${periodLabel(report.period)}` }),
        h('thead', {}, head), h('tbody', {}, body), tfoot
      ]);
      const sub = 'Satıra tıklayınca o mülkün analizi açılır · oranlar toplamdan, ortalama mülklerin ortalaması';
      return card('Mülk karşılaştırması', sub, null, h('div', { class: 'ba-scroll' }, table), 'ba-card-wide');
    }

    // ---------------------------------------------------- davranis ----
    function renderBehavior(report) {
      const b = report.behavior;
      if (!b.sample) {
        return card('Rezervasyon davranışı', null, null, h('p', { class: 'ba-empty-line', text: 'Bu dönemde girişi olan rezervasyon yok' }), 'ba-card-wide');
      }
      const ltLabels = { '0-7': '0–7 gün', '8-30': '8–30', '31-90': '31–90', '90+': '90+' };
      const stLabels = { '1-2': '1–2 gece', '3-4': '3–4', '5-7': '5–7', '8+': '8+' };
      const mini = (title, note, labels, values) => {
        const host = h('div', { class: 'ba-mini' }, [h('h4', { class: 'ba-mini-title', text: title }), h('p', { class: 'ba-mini-note', text: note })]);
        host.appendChild(barChart(labels, values, `${title}: ` + labels.map((l, i) => `${l} ${values[i]}`).join(', '), 300));
        return host;
      };
      const ltNote = b.leadTimeSample
        ? `n = ${nf0.format(b.leadTimeSample)} rezervasyon` + (b.leadTimeExcluded ? ` · ${nf0.format(b.leadTimeExcluded)} kayıt sonradan girildiği için dahil değil` : '')
        : 'Ölçülemedi: kayıtlar sonradan ya da içe aktarımla girilmiş';
      const body = h('div', { class: 'ba-mini-grid' }, [
        b.leadTimeSample
          ? mini('Rezervasyon öncesi süre', ltNote, b.leadTimeBuckets.map(x => ltLabels[x.key]), b.leadTimeBuckets.map(x => x.count))
          : h('div', { class: 'ba-mini' }, [h('h4', { class: 'ba-mini-title', text: 'Rezervasyon öncesi süre' }), h('p', { class: 'ba-mini-note', text: ltNote })]),
        mini('Konaklama süresi', `n = ${nf0.format(b.sample)} rezervasyon`, b.stayBuckets.map(x => stLabels[x.key]), b.stayBuckets.map(x => x.count)),
        mini('Giriş günü', `n = ${nf0.format(b.sample)} rezervasyon`, GUNLER, b.weekday)
      ]);
      return card('Rezervasyon davranışı', 'Girişi bu dönemde olan rezervasyonlar · iptal ve toplu aktarım hariç', null, body, 'ba-card-wide');
    }

    // ------------------------------------------------------- talep ----
    function renderLeads(report) {
      const L = report.leads;
      if (!L.total) {
        return card('Talep → rezervasyon dönüşümü', null, null,
          h('p', { class: 'ba-empty-line', text: 'Bu dönemde talep kaydı yok. Talepler Misafirler ve Satış sayfasından girilir.' }), 'ba-card-wide');
      }
      const steps = [
        { label: 'Gelen talep', value: L.total },
        { label: 'İletişime geçildi', value: L.contacted },
        { label: 'Teklif verildi', value: L.quoted },
        { label: 'Rezervasyona döndü', value: L.won }
      ];
      const funnel = h('ol', { class: 'ba-funnel' }, steps.map(st => {
        const yuzde = L.total > 0 ? Math.round(st.value / L.total * 100) : 0;
        return h('li', { class: 'ba-funnel-step' }, [
          h('div', { class: 'ba-funnel-head' }, [
            h('span', { class: 'ba-funnel-label', text: st.label }),
            h('span', { class: 'ba-funnel-val', text: `${nf0.format(st.value)} · %${nf0.format(yuzde)}` })
          ]),
          h('div', { class: 'ba-pace-track' }, [h('div', { class: 'ba-pace-fill ba-s1', 'data-w': yuzde })])
        ]);
      }));
      const kpis = h('div', { class: 'ba-lead-kpis' }, [
        h('div', {}, [h('p', { class: 'ba-kpi-label', text: 'Toplam dönüşüm' }), h('p', { class: 'ba-kpi-value', text: fmt(L.conversion, 'pct') })]),
        h('div', {}, [h('p', { class: 'ba-kpi-label', text: 'Kapanan taleplerde kazanma' }), h('p', { class: 'ba-kpi-value', text: fmt(L.closeRate, 'pct') }),
          L.closeRate === null ? h('p', { class: 'ba-kpi-note', text: 'Henüz kazanılan ya da kaybedilen talep yok' }) : null]),
        h('div', {}, [h('p', { class: 'ba-kpi-label', text: 'Açık talep' }), h('p', { class: 'ba-kpi-value', text: nf0.format(L.open) })])
      ]);
      const chTable = h('table', { class: 'ba-table ba-table-compact' }, [
        h('thead', {}, h('tr', {}, ['Kanal', 'Talep', 'Kazanılan', 'Dönüşüm'].map((t, i) => h('th', { scope: 'col', class: i ? 'num' : null, text: t })))),
        h('tbody', {}, L.byChannel.map(r => h('tr', {}, [
          h('th', { scope: 'row', text: r.label }),
          h('td', { class: 'num', text: nf0.format(r.total) }),
          h('td', { class: 'num', text: nf0.format(r.won) }),
          h('td', { class: 'num', text: fmt(r.conversion, 'pct') })
        ])))
      ]);
      const reasons = L.lossReasons.length
        ? h('ul', { class: 'ba-reasons' }, L.lossReasons.map(r => h('li', {}, [h('span', { text: r.reason }), h('span', { class: 'num', text: nf0.format(r.count) })])))
        : h('p', { class: 'ba-empty-line', text: 'Kaybedilen talep yok' });
      const bagsizNot = L.wonUnlinked > 0
        ? h('p', { class: 'ba-footnote', text: `${nf0.format(L.wonUnlinked)} talep "kazanıldı" işaretli ama bir rezervasyona bağlı değil; dönüşüme sayılmadı, kapanan taleplerde kazanmaya sayıldı.` })
        : null;
      const body = h('div', { class: 'ba-leads' }, [
        h('div', {}, [kpis, funnel, bagsizNot]),
        h('div', {}, [h('h4', { class: 'ba-mini-title', text: 'Kanala göre' }), h('div', { class: 'ba-scroll' }, chTable),
          h('h4', { class: 'ba-mini-title', text: 'Kayıp nedenleri' }), reasons])
      ]);
      const c = card('Talep → rezervasyon dönüşümü', 'Talep tarihi bu dönemde olan kayıtlar', null, body, 'ba-card-wide');
      applyWidths(c);
      return c;
    }

    function emptyState(title, text) {
      return h('div', { class: 'ba-empty' }, [h('p', { class: 'ba-empty-title', text: title }), h('p', { class: 'ba-empty-text', text: text })]);
    }

    function destroy() {
      rootEl.removeEventListener('click', onClick);
      rootEl.removeEventListener('change', onChange);
      if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('pointerdown', onDocPointerDown);
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('resize', onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
      rootEl.textContent = '';
    }

    return { render, destroy, getState: () => JSON.parse(JSON.stringify(state)), getReport: () => lastReport };
  }

  return { mount, presetPeriod, fmt, PRESETS, COMPARES };
}));
