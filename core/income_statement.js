/**
 * LEXBNB — GELIR TABLOSU (KAR-ZARAR) DISA AKTARIMI (L-196, kullanici M26)
 *
 * Rezervasyon ve gider defteri indirilebiliyordu; donemin gelir tablosu
 * indirilemiyordu. Bu modul tabloyu EKRANDAKI defterle ayni formulden uretir:
 * rakamlar `ledgerFor(start, end, villa)` ile gelir, o da app.js'te
 * core/ledger_contract.js computePeriodLedger'dir (CLAUDE.md 3.4 — bir ekran
 * kendi toplamini yapmaz). Burada yeni bir toplam formulu YOKTUR; yalniz
 * donem aylara bolunur ve satirlar dizilir.
 *
 *   * Aylik satirlar secili araligi aylara boler (uclar kirpilir); TOPLAM
 *     satiri araligin tamamidir ve Finans ekranindaki rakamla aynidir.
 *   * Gider yoksa kar ve marj "—" (isProfitUnmeasured, L-101); uydurulmaz.
 *   * Mulk bazinda sayfada ortak (portfoy geneli) giderler mulke BOLUNMEZ;
 *     ayri satirda durur (L-187 ile ayni kural).
 *
 * Saf modul: DOM ve ag yok; Node'da test edilir.
 */
(function (kok, fabrika) {
  const modul = fabrika();
  if (typeof module === 'object' && module.exports) module.exports = modul;
  else kok.IncomeStatement = modul;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const SUTUNLAR = [
    ['label', 'Dönem / Mülk'],
    ['soldNights', 'Satılan gece'],
    ['netRoomRevenue', 'Konaklama cirosu (net oda geliri, ₺)'],
    ['cleaningRevenue', 'Temizlik geliri (misafirden, ₺)'],
    ['totalRevenue', 'Toplam gelir (₺)'],
    ['manualOpex', 'Elle girilen giderler (₺)'],
    ['otaCommission', 'OTA komisyonu (₺)'],
    ['paymentCommission', 'Ödeme komisyonu (₺)'],
    ['cleaningCost', 'Temizlik maliyeti (₺)'],
    ['totalOpex', 'Toplam işletme gideri — OPEX (₺)'],
    ['capex', 'Yatırım — CAPEX (₺)'],
    ['netProfit', 'Net kâr (₺)'],
    ['margin', 'Kâr marjı (%)'],
    ['adr', 'ADR — gecelik ortalama (₺)'],
    ['note', 'Not']
  ];

  const OLCULEMEYEN = 'Gider kaydı yok; kâr ölçülemedi';
  const yuvarla = n => Math.round((Number(n) || 0) * 100) / 100;

  function aylar(start, end) {
    const out = [];
    let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
    const sy = Number(end.slice(0, 4)), sm = Number(end.slice(5, 7));
    while (y < sy || (y === sy && m <= sm)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const ayBas = `${key}-01`, aySon = `${key}-${String(son).padStart(2, '0')}`;
      out.push({ key, label: `${AYLAR[m - 1]} ${y}`, start: ayBas < start ? start : ayBas, end: aySon > end ? end : aySon, full: ayBas >= start && aySon <= end });
      m++; if (m > 12) { m = 1; y++; }
    }
    return out;
  }

  function satir(label, l, olculemez, ekNot) {
    const r = { label };
    SUTUNLAR.slice(1, 12).forEach(([k]) => { r[k] = yuvarla(l[k]); });
    r.soldNights = Number(l.soldNights) || 0;
    r.adr = l.adr === null || l.adr === undefined ? null : yuvarla(l.adr);
    const notlar = [];
    if (olculemez) { r.netProfit = null; r.margin = null; notlar.push(OLCULEMEYEN); }
    else r.margin = l.totalRevenue > 0 ? yuvarla((l.netProfit / l.totalRevenue) * 100) : null;
    if (ekNot) notlar.push(ekNot);
    r.note = notlar.join(' · ');
    return r;
  }

  /**
   * girdi: {
   *   range: {start, end} (YYYY-MM-DD, dahil), periodKey (ekrandaki donem anahtari),
   *   villa: 'ALL' | anahtar, villas: [{key, name}],
   *   ledgerFor(start, end, villa) -> computePeriodLedger sonucu,
   *   isUnmeasured(ledger, periodKey) -> bool
   * }
   */
  function buildIncomeStatement(girdi) {
    const g = girdi || {};
    const r = g.range;
    if (!r || !r.start || !r.end || r.start > r.end) throw new Error('Gelir tablosu için geçerli bir dönem seçin.');
    const villa = g.villa || 'ALL';
    const olc = typeof g.isUnmeasured === 'function' ? g.isUnmeasured : () => false;

    const monthly = aylar(r.start, r.end).map(ay => {
      const l = g.ledgerFor(ay.start, ay.end, villa);
      return satir(ay.label, l, olc(l, ay.full ? ay.key : null), ay.full ? '' : `Kısmi ay: ${ay.start} – ${ay.end}`);
    });
    const toplamDefter = g.ledgerFor(r.start, r.end, villa);
    const total = satir('TOPLAM', toplamDefter, olc(toplamDefter, g.periodKey));

    let byProperty = null;
    if (villa === 'ALL' && Array.isArray(g.villas) && g.villas.length) {
      const mulkler = g.villas.map(v => ({ v, l: g.ledgerFor(r.start, r.end, v.key) }));
      byProperty = mulkler.map(({ v, l }) => satir(v.name || v.key, l, olc(l, g.periodKey)));
      // Ortak giderler: toplamdan mulklere yazilanlar dusulunce kalan. Mulke
      // bolunmez; bolmek uydurma bir dagitim anahtari secmek olurdu.
      const ortakOpex = toplamDefter.manualOpex - mulkler.reduce((t, x) => t + x.l.manualOpex, 0);
      const ortakCapex = toplamDefter.capex - mulkler.reduce((t, x) => t + x.l.capex, 0);
      if (Math.abs(ortakOpex) > 0.004 || Math.abs(ortakCapex) > 0.004) {
        const sifir = { soldNights: 0, netRoomRevenue: 0, cleaningRevenue: 0, totalRevenue: 0, otaCommission: 0, paymentCommission: 0, cleaningCost: 0, adr: null };
        const ortak = satir('Portföy geneli (ortak) giderler', { ...sifir, manualOpex: ortakOpex, totalOpex: ortakOpex, capex: ortakCapex, netProfit: -(ortakOpex + ortakCapex) }, false, 'Mülklere bölünmez');
        ortak.margin = null;
        byProperty.push(ortak);
      }
      byProperty.push(total);
    }
    return { columns: SUTUNLAR, monthly, total, byProperty };
  }

  function rowsToAoa(columns, rows) {
    return [columns.map(c => c[1])].concat(rows.map(r => columns.map(([k]) => (r[k] === null || r[k] === undefined ? '—' : r[k]))));
  }

  /** Excel sayfalari: [{name, aoa}] */
  function toSheets(st, meta) {
    const m = meta || {};
    const sayfalar = [{ name: 'Gelir Tablosu', aoa: rowsToAoa(st.columns, st.monthly.concat([st.total])) }];
    if (st.byProperty) sayfalar.push({ name: 'Mülk Bazında', aoa: rowsToAoa(st.columns, st.byProperty) });
    sayfalar.push({
      name: 'Açıklama',
      aoa: [
        ['LEXBNB — GELİR TABLOSU'],
        [`Dönem: ${m.periodLabel || ''}`],
        [`Kapsam: ${m.scopeLabel || 'Tüm portföy'}`],
        [`Hazırlanma: ${m.generatedAt || ''}`],
        [],
        ['Rakamlar Finans ekranıyla aynı defterden gelir. TOPLAM satırı ekrandaki dönem rakamıdır.'],
        ['Konaklama cirosu = brüt − misafirden alınan temizlik ücreti − indirim.'],
        ['Toplam gelir = konaklama cirosu + temizlik geliri.'],
        ['OPEX = elle girilen giderler + OTA komisyonu + ödeme komisyonu + yapılmış temizliklerin maliyeti.'],
        ['Net kâr = toplam gelir − OPEX − CAPEX. Kâr marjı = net kâr / toplam gelir.'],
        ['Ay sınırını kesen rezervasyonun geliri gecelere bölünür; her ay yalnız kendi gecelerinin payını alır.'],
        [`Dönemde gider kaydı yoksa net kâr ve marj "—" yazılır (${OLCULEMEYEN}). Kapatılmış ayda 0 gider gerçek 0'dır.`],
        ['Mülk bazında sayfada portföy geneli giderler mülklere bölünmez; ayrı satırda durur.'],
        ['Bu dosya bir rapordur; içe aktarılamaz. Defterleri düzenlemek için Rezervasyon/Gider Defterini indirin.']
      ]
    });
    return sayfalar;
  }

  return { buildIncomeStatement, toSheets, SUTUNLAR, OLCULEMEYEN };
});
