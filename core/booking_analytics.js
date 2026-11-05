/**
 * LEXBNB — REZERVASYON ANALIZI (Analiz sekmesi, hesap katmani)
 *
 * Girilen rezervasyonlardan mulk mulk ve portfoy geneli performans raporu:
 * KPI'lar, karsilastirma donemleri (onceki donem, gecen yil, 2 yil once,
 * portfoy ortalamasi, hedef), aylik trend, mulk tablosu, kanal dagilimi,
 * rezervasyon davranisi, talep donusumu ve ileriye dolu.
 *
 * Para ve gece BU MODULDE HESAPLANMAZ (CLAUDE.md 3.4):
 *   - Ay performansi (ciro, gece, kapasite, doluluk, ADR, RevPAR) cagirandan
 *     gelir: app.js `computeMonthPerformance` — Bugun ekrani ve Finans'in aylik
 *     KPI tablosuyla ayni fonksiyon. Cok aylik donemde ciro/gece/kapasite
 *     toplanir, oranlar toplamdan yeniden hesaplanir (ay oranlarinin
 *     ortalamasi alinmaz).
 *   - Kanal cirosu ve ileriye dolu: `LedgerContract.computePeriodLedger` +
 *     `nightShareInRange` (tahakkuk, gecelere bolunmus pay).
 *
 * Kayit basi metrikler (adet, konaklama suresi, rezervasyon oncesi sure,
 * iptal, giris gunu) donemi GIRIS tarihine gore secer ve toplu aktarim
 * ozetini saymaz (L-103). Olculemeyen her deger `null` doner ve `reasons`
 * icinde nedeni yazilir; ekran "—" gosterir (3.6).
 *
 * Node'da ve tarayicida calisir; yan etkisi yoktur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ledger_contract.js'));
  } else {
    root.BookingAnalytics = factory(root.LedgerContract);
  }
}(typeof self !== 'undefined' ? self : this, function (LedgerContract) {
  const METRICS = ['revenue', 'occupancy', 'adr', 'revpar', 'nights', 'bookings'];
  const COMPARE_KEYS = ['prev', 'yoy1', 'yoy2', 'portfolio', 'target'];
  const LEAD_TIME_BUCKETS = [
    { key: '0-7', min: 0, max: 7 },
    { key: '8-30', min: 8, max: 30 },
    { key: '31-90', min: 31, max: 90 },
    { key: '90+', min: 91, max: Infinity }
  ];
  const STAY_BUCKETS = [
    { key: '1-2', min: 1, max: 2 },
    { key: '3-4', min: 3, max: 4 },
    { key: '5-7', min: 5, max: 7 },
    { key: '8+', min: 8, max: Infinity }
  ];
  const QUOTED_STAGES = ['QUOTE_SENT', 'FOLLOW_UP', 'WON'];
  const GUN = 86400000;

  const sayi = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const yuvarla = (v, basamak = 1) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return null;
    const k = Math.pow(10, basamak);
    return Math.round(v * k) / k;
  };

  // ---------------------------------------------------------------- donem --

  function isMonthKey(v) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));
  }

  function shiftMonth(monthKey, delta) {
    const y = Number(monthKey.slice(0, 4));
    const m = Number(monthKey.slice(5, 7)) - 1 + delta;
    const ny = y + Math.floor(m / 12);
    const nm = ((m % 12) + 12) % 12;
    return `${ny}-${String(nm + 1).padStart(2, '0')}`;
  }

  function monthsBetween(start, end) {
    const out = [];
    if (!isMonthKey(start) || !isMonthKey(end) || start > end) return out;
    let k = start;
    while (k <= end && out.length < 600) {
      out.push(k);
      k = shiftMonth(k, 1);
    }
    return out;
  }

  function normalizePeriod(period) {
    const p = period || {};
    if (!isMonthKey(p.start) || !isMonthKey(p.end) || p.start > p.end) {
      throw new Error('INVALID_ANALYTICS_PERIOD');
    }
    return { start: p.start, end: p.end };
  }

  function shiftPeriod(period, months) {
    return { start: shiftMonth(period.start, months), end: shiftMonth(period.end, months) };
  }

  function periodLength(period) {
    return monthsBetween(period.start, period.end).length;
  }

  /** Karsilastirma donemleri: ayni uzunlukta onceki, 1 ve 2 yil once. */
  function comparisonPeriods(period) {
    const p = normalizePeriod(period);
    const n = periodLength(p);
    return {
      prev: shiftPeriod(p, -n),
      yoy1: shiftPeriod(p, -12),
      yoy2: shiftPeriod(p, -24)
    };
  }

  function periodDateRange(period) {
    const bas = LedgerContract.monthRange(period.start);
    const bit = LedgerContract.monthRange(period.end);
    return { start: bas.start, end: bit.end };
  }

  // ------------------------------------------------------- ay performansi --

  function emptyAgg() {
    return { revenue: 0, nights: 0, available: null, occupancy: null, adr: null, revpar: null };
  }

  /** Aylarin ciro/gece/kapasitesini toplar, oranlari toplamdan hesaplar. */
  function aggregateMonths(perfList) {
    const agg = emptyAgg();
    let kapasiteBilinen = false;
    let kapasite = 0;
    (perfList || []).forEach(p => {
      if (!p) return;
      agg.revenue += sayi(p.roomRevenue !== undefined ? p.roomRevenue : p.ciro);
      agg.nights += sayi(p.nights);
      if (p.available !== null && p.available !== undefined && Number.isFinite(Number(p.available))) {
        kapasiteBilinen = true;
        kapasite += Number(p.available);
      }
    });
    agg.available = kapasiteBilinen ? kapasite : null;
    agg.occupancy = agg.available > 0 ? yuvarla(agg.nights / agg.available * 100, 1) : null;
    agg.adr = agg.nights > 0 ? Math.round(agg.revenue / agg.nights) : null;
    agg.revpar = agg.available > 0 ? Math.round(agg.revenue / agg.available) : null;
    agg.revenue = Math.round(agg.revenue);
    return agg;
  }

  function makePerfCache(monthPerformance) {
    const cache = new Map();
    return function perf(monthKey, villa) {
      const k = `${monthKey}|${villa}`;
      if (!cache.has(k)) cache.set(k, monthPerformance(monthKey, villa) || null);
      return cache.get(k);
    };
  }

  // ------------------------------------------------------ kayit basi ------

  function bookingVillaMatches(b, villa, villaIdByKey) {
    if (villa === 'ALL') return true;
    if (b.villa === villa) return true;
    const id = villaIdByKey[villa];
    return !!id && (b.propertyId === id || b.property_id === id);
  }

  function dateOnly(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  function dayDiff(later, earlier) {
    return Math.round((Date.parse(later + 'T00:00:00Z') - Date.parse(earlier + 'T00:00:00Z')) / GUN);
  }

  function bucketCounts(buckets) {
    const o = {};
    buckets.forEach(b => { o[b.key] = 0; });
    return o;
  }

  function putInBucket(counts, buckets, value) {
    const b = buckets.find(x => value >= x.min && value <= x.max);
    if (b) counts[b.key] += 1;
  }

  /**
   * Giris tarihi [range.start, range.end] icindeki rezervasyonlarin kayit
   * basi metrikleri. Toplu aktarim ozeti sayilmaz.
   */
  function bookingStats(ctx, villa, range) {
    const s = {
      bookings: 0, cancelled: 0, cancelRate: null,
      avgStay: null, avgLeadTime: null, leadTimeSample: 0, leadTimeExcluded: 0,
      leadTimeBuckets: bucketCounts(LEAD_TIME_BUCKETS),
      stayBuckets: bucketCounts(STAY_BUCKETS),
      weekday: [0, 0, 0, 0, 0, 0, 0]
    };
    let geceToplam = 0;
    let geceOrnek = 0;
    let onceToplam = 0;
    ctx.bookings.forEach(b => {
      if (!b || ctx.isBulkSummary(b)) return;
      if (!bookingVillaMatches(b, villa, ctx.villaIdByKey)) return;
      const ci = dateOnly(b.checkIn || b.check_in);
      if (!ci || ci < range.start || ci > range.end) return;
      if (String(b.status || '').toUpperCase() === 'CANCELLED') {
        s.cancelled += 1;
        return;
      }
      s.bookings += 1;
      const co = dateOnly(b.checkOut || b.check_out);
      if (co) {
        const kal = dayDiff(co, ci);
        if (kal > 0) {
          geceToplam += kal;
          geceOrnek += 1;
          putInBucket(s.stayBuckets, STAY_BUCKETS, kal);
        }
      }
      // Pazartesi = 0 ... Pazar = 6
      const gun = new Date(ci + 'T00:00:00Z').getUTCDay();
      s.weekday[(gun + 6) % 7] += 1;

      // Rezervasyon oncesi sure: kaydin sisteme girildigi gun -> giris.
      // Ice aktarilan ya da giristen sonra girilen kayitta bu tarih
      // rezervasyonun yapildigi gun degildir; ornekleme alinmaz.
      const olusma = dateOnly(b.createdAt || b.created_at);
      if (!olusma || ctx.isImported(b) || olusma > ci) {
        s.leadTimeExcluded += 1;
        return;
      }
      const once = dayDiff(ci, olusma);
      onceToplam += once;
      s.leadTimeSample += 1;
      putInBucket(s.leadTimeBuckets, LEAD_TIME_BUCKETS, once);
    });
    const toplam = s.bookings + s.cancelled;
    s.cancelRate = toplam > 0 ? yuvarla(s.cancelled / toplam * 100, 1) : null;
    s.avgStay = geceOrnek > 0 ? yuvarla(geceToplam / geceOrnek, 1) : null;
    s.avgLeadTime = s.leadTimeSample > 0 ? Math.round(onceToplam / s.leadTimeSample) : null;
    return s;
  }

  // ---------------------------------------------------------- metrikler --

  function scopeMetrics(ctx, villa, period) {
    const months = monthsBetween(period.start, period.end);
    const agg = aggregateMonths(months.map(m => ctx.perf(m, villa)));
    const stats = bookingStats(ctx, villa, periodDateRange(period));
    return Object.assign(agg, {
      bookings: stats.bookings,
      cancelled: stats.cancelled,
      cancelRate: stats.cancelRate,
      avgStay: stats.avgStay,
      avgLeadTime: stats.avgLeadTime,
      leadTimeSample: stats.leadTimeSample,
      leadTimeExcluded: stats.leadTimeExcluded
    });
  }

  /** Bir donemde verisi olan mi? (ciro, gece ya da rezervasyon) */
  function hasActivity(m) {
    return !!m && (m.revenue !== 0 || m.nights > 0 || m.bookings > 0 || m.cancelled > 0);
  }

  /**
   * Portfoy ortalamasi (tek mulk secildiginde kiyas): oranlar portfoyun
   * toplamindan; ciro/gece/adet mulk basina — o aylarda kapasitesi olan
   * mulk sayisinin aylik ortalamasina bolunur.
   */
  function portfolioAverage(ctx, period) {
    const all = scopeMetrics(ctx, 'ALL', period);
    const months = monthsBetween(period.start, period.end);
    let mulkAy = 0;
    months.forEach(m => {
      ctx.villas.forEach(v => {
        const p = ctx.perf(m, v.key);
        if (p && Number(p.available) > 0) mulkAy += 1;
      });
    });
    const mulkSayisi = months.length ? mulkAy / months.length : 0;
    if (!(mulkSayisi > 0)) {
      return { revenue: null, nights: null, bookings: null, occupancy: all.occupancy, adr: all.adr, revpar: all.revpar,
        avgStay: all.avgStay, avgLeadTime: all.avgLeadTime, cancelRate: all.cancelRate, propertyCount: 0 };
    }
    return {
      revenue: Math.round(all.revenue / mulkSayisi),
      nights: yuvarla(all.nights / mulkSayisi, 1),
      bookings: yuvarla(all.bookings / mulkSayisi, 1),
      occupancy: all.occupancy,
      adr: all.adr,
      revpar: all.revpar,
      avgStay: all.avgStay,
      avgLeadTime: all.avgLeadTime,
      cancelRate: all.cancelRate,
      propertyCount: yuvarla(mulkSayisi, 1)
    };
  }

  /**
   * Donemin hedefi. Her ayda hedef yoksa o metrik icin hedef yoktur (eksik
   * aylari 0 saymak hedefi oldugundan dusuk gosterirdi). Ciro hedefi aylarin
   * toplami; doluluk/ADR/RevPAR hedefi aylarin ortalamasi. 0 girilmis
   * doluluk/ADR/RevPAR hedefi "girilmemis" sayilir (sutun varsayilani 0).
   */
  function periodTarget(ctx, villa, period) {
    const months = monthsBetween(period.start, period.end);
    const satirlar = months.map(m => ctx.monthTarget(m, villa) || null);
    const hepsi = alan => satirlar.every(t => t && Number(t[alan]) > 0);
    return {
      revenue: hepsi('revenue') ? satirlar.reduce((s, t) => s + Number(t.revenue), 0) : null,
      occupancy: hepsi('occupancy') ? yuvarla(satirlar.reduce((s, t) => s + Number(t.occupancy), 0) / months.length, 1) : null,
      adr: hepsi('adr') ? Math.round(satirlar.reduce((s, t) => s + Number(t.adr), 0) / months.length) : null,
      revpar: hepsi('revpar') ? Math.round(satirlar.reduce((s, t) => s + Number(t.revpar), 0) / months.length) : null
    };
  }

  /** Degisim: oranlarda yuzde puan, tutarlarda yuzde. Kiyas yoksa null. */
  function delta(metric, current, base) {
    if (current === null || current === undefined || base === null || base === undefined) return null;
    if (metric === 'occupancy' || metric === 'cancelRate') {
      return { kind: 'pp', value: yuvarla(current - base, 1) };
    }
    if (!(base > 0)) return null;
    return { kind: 'pct', value: yuvarla((current - base) / base * 100, 1) };
  }

  const KPI_METRICS = ['revenue', 'occupancy', 'adr', 'revpar', 'nights', 'bookings', 'avgStay', 'avgLeadTime'];

  function buildKpis(ctx, villa, period, cmp) {
    const current = scopeMetrics(ctx, villa, period);
    const compare = {};
    const reasons = {};
    const prev = scopeMetrics(ctx, villa, cmp.prev);
    const yoy1 = scopeMetrics(ctx, villa, cmp.yoy1);
    const yoy2 = scopeMetrics(ctx, villa, cmp.yoy2);
    compare.prev = hasActivity(prev) ? prev : null;
    compare.yoy1 = hasActivity(yoy1) ? yoy1 : null;
    compare.yoy2 = hasActivity(yoy2) ? yoy2 : null;
    if (!compare.prev) reasons.prev = 'Önceki dönemde kayıt yok';
    if (!compare.yoy1) reasons.yoy1 = 'Geçen yıl aynı dönemde kayıt yok';
    if (!compare.yoy2) reasons.yoy2 = '2 yıl önce aynı dönemde kayıt yok';
    if (villa === 'ALL') {
      compare.portfolio = null;
      reasons.portfolio = 'Portföy ortalaması tek mülk seçildiğinde karşılaştırılır';
    } else {
      compare.portfolio = portfolioAverage(ctx, period);
    }
    compare.target = periodTarget(ctx, villa, period);
    if (!Object.values(compare.target).some(v => v !== null)) {
      reasons.target = 'Bu dönem için hedef girilmemiş';
    }

    const deltas = {};
    KPI_METRICS.forEach(metric => {
      deltas[metric] = {};
      COMPARE_KEYS.forEach(k => {
        const base = compare[k] ? compare[k][metric] : null;
        deltas[metric][k] = delta(metric, current[metric], base === undefined ? null : base);
      });
    });
    return { current, compare, deltas, reasons };
  }

  // -------------------------------------------------------------- trend --

  function monthMetric(ctx, villa, monthKey, metric) {
    const p = ctx.perf(monthKey, villa);
    if (metric === 'bookings') {
      return bookingStats(ctx, villa, LedgerContract.monthRange(monthKey)).bookings;
    }
    const agg = aggregateMonths([p]);
    return agg[metric];
  }

  /**
   * Aylik trend. Pencere: donem en az 6 aysa donemin kendisi, degilse
   * donemin son ayinda biten 12 ay. Her seri ayni eksene hizalanir; veri
   * olmayan ay null'dir (cizgi orada kopar, 0'a dusmez).
   */
  function buildTrend(ctx, villa, period) {
    const n = periodLength(period);
    const pencere = n >= 6 ? period : { start: shiftMonth(period.end, -11), end: period.end };
    const months = monthsBetween(pencere.start, pencere.end);
    const L = months.length;
    const series = {};
    METRICS.forEach(metric => {
      const cur = months.map(m => monthMetric(ctx, villa, m, metric));
      const kaydir = d => months.map(m => {
        const k = shiftMonth(m, d);
        const p = ctx.perf(k, villa);
        const aktif = (p && (sayi(p.roomRevenue !== undefined ? p.roomRevenue : p.ciro) !== 0 || sayi(p.nights) > 0))
          || bookingStats(ctx, villa, LedgerContract.monthRange(k)).bookings > 0;
        return aktif ? monthMetric(ctx, villa, k, metric) : null;
      });
      const s = {
        current: cur,
        prev: kaydir(-L),
        yoy1: kaydir(-12),
        yoy2: kaydir(-24),
        portfolio: villa === 'ALL' ? null : months.map(m => portfolioAverage(ctx, { start: m, end: m })[metric]),
        target: null
      };
      if (metric === 'revenue' || metric === 'occupancy' || metric === 'adr' || metric === 'revpar') {
        const t = months.map(m => periodTarget(ctx, villa, { start: m, end: m })[metric]);
        s.target = t.some(v => v !== null) ? t : null;
      }
      ['prev', 'yoy1', 'yoy2'].forEach(k => {
        if (s[k] && s[k].every(v => v === null)) s[k] = null;
      });
      series[metric] = s;
    });
    return { months, series };
  }

  // ------------------------------------------------------ mulk tablosu --

  function buildPropertyTable(ctx, period, cmp) {
    const rows = ctx.villas.map(v => {
      const m = scopeMetrics(ctx, v.key, period);
      const ly = scopeMetrics(ctx, v.key, cmp.yoy1);
      return {
        key: v.key,
        name: v.name,
        metrics: m,
        revenueShare: null,
        yoyRevenue: hasActivity(ly) ? delta('revenue', m.revenue, ly.revenue) : null,
        active: hasActivity(m) || m.available > 0
      };
    }).filter(r => r.active);
    const total = scopeMetrics(ctx, 'ALL', period);
    rows.forEach(r => {
      r.revenueShare = total.revenue > 0 ? yuvarla(r.metrics.revenue / total.revenue * 100, 1) : null;
    });
    const ortalama = alan => {
      const vals = rows.map(r => r.metrics[alan]).filter(v => v !== null && v !== undefined);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };
    const average = rows.length ? {
      revenue: Math.round(ortalama('revenue')),
      nights: yuvarla(ortalama('nights'), 1),
      bookings: yuvarla(ortalama('bookings'), 1),
      occupancy: yuvarla(ortalama('occupancy'), 1),
      adr: ortalama('adr') === null ? null : Math.round(ortalama('adr')),
      revpar: ortalama('revpar') === null ? null : Math.round(ortalama('revpar')),
      avgStay: yuvarla(ortalama('avgStay'), 1),
      avgLeadTime: ortalama('avgLeadTime') === null ? null : Math.round(ortalama('avgLeadTime')),
      cancelRate: yuvarla(ortalama('cancelRate'), 1)
    } : null;
    return { rows, total, average };
  }

  // ------------------------------------------------------------ kanal ----

  function channelKey(b) {
    const raw = String((b && b.channel) || '').trim();
    return raw || 'Direct';
  }

  function buildChannels(ctx, villa, period) {
    const range = periodDateRange(period);
    const keys = new Set();
    ctx.bookings.forEach(b => {
      if (!b || !bookingVillaMatches(b, villa, ctx.villaIdByKey)) return;
      if (LedgerContract.nightShareInRange(b, range.start, range.end).nights > 0) keys.add(channelKey(b));
    });
    const stats = bookingStats; // giris tarihine gore adet/iptal
    const rows = Array.from(keys).map(key => {
      const scope = b => bookingVillaMatches(b, villa, ctx.villaIdByKey) && channelKey(b) === key;
      const l = LedgerContract.computePeriodLedger({
        bookings: ctx.bookings,
        bookingInScope: scope,
        bookingShare: b => LedgerContract.nightShareInRange(b, range.start, range.end)
      });
      const sub = Object.assign({}, ctx, { bookings: ctx.bookings.filter(b => b && channelKey(b) === key) });
      const s = stats(sub, villa, range);
      return {
        key,
        label: ctx.channelName(key),
        revenue: Math.round(l.netRoomRevenue),
        nights: l.soldNights,
        adr: l.soldNights > 0 ? Math.round(l.netRoomRevenue / l.soldNights) : null,
        bookings: s.bookings,
        cancelled: s.cancelled,
        cancelRate: s.cancelRate,
        avgLeadTime: s.avgLeadTime
      };
    }).filter(r => r.revenue !== 0 || r.nights > 0 || r.bookings > 0 || r.cancelled > 0);
    const toplam = rows.reduce((s, r) => s + r.revenue, 0);
    rows.forEach(r => { r.share = toplam > 0 ? yuvarla(r.revenue / toplam * 100, 1) : null; });
    rows.sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || a.label.localeCompare(b.label, 'tr'));
    return { rows, totalRevenue: toplam };
  }

  // ------------------------------------------------------------ talep ----

  function buildLeadFunnel(ctx, villa, period) {
    const range = periodDateRange(period);
    const id = ctx.villaIdByKey[villa];
    const leads = ctx.leads.filter(l => {
      if (!l) return false;
      const d = dateOnly(l.date || l.lead_date || l.createdAt || l.created_at);
      if (!d || d < range.start || d > range.end) return false;
      if (villa === 'ALL') return true;
      return l.villa === villa || (!!id && (l.propertyId === id || l.property_id === id));
    });
    const stage = l => String(l.status || l.stage || 'NEW').toUpperCase();
    const total = leads.length;
    const contacted = leads.filter(l => stage(l) !== 'NEW').length;
    const quoted = leads.filter(l => QUOTED_STAGES.includes(stage(l)) || sayi(l.quoteAmount || l.quote) > 0).length;
    const won = leads.filter(l => stage(l) === 'WON').length;
    const lost = leads.filter(l => stage(l) === 'LOST').length;
    const kanallar = new Map();
    leads.forEach(l => {
      const k = String(l.channel || l.source || '').trim() || 'Other';
      if (!kanallar.has(k)) kanallar.set(k, { key: k, label: ctx.leadChannelName(k), total: 0, won: 0 });
      const r = kanallar.get(k);
      r.total += 1;
      if (stage(l) === 'WON') r.won += 1;
    });
    const byChannel = Array.from(kanallar.values()).map(r => Object.assign(r, {
      conversion: r.total > 0 ? yuvarla(r.won / r.total * 100, 1) : null
    })).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'tr'));
    const nedenler = new Map();
    leads.filter(l => stage(l) === 'LOST').forEach(l => {
      const n = String(l.lostReason || l.lost_reason || '').trim() || 'Neden girilmedi';
      nedenler.set(n, (nedenler.get(n) || 0) + 1);
    });
    const lossReasons = Array.from(nedenler.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, 'tr'));
    return {
      total, contacted, quoted, won, lost,
      open: total - won - lost,
      conversion: total > 0 ? yuvarla(won / total * 100, 1) : null,
      closeRate: (won + lost) > 0 ? yuvarla(won / (won + lost) * 100, 1) : null,
      byChannel,
      lossReasons
    };
  }

  // ------------------------------------------------------ ileriye dolu --

  function addYearsToDate(date, years) {
    const y = Number(date.slice(0, 4)) + years;
    const md = date.slice(5);
    if (md === '02-29' && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return `${y}-02-28`;
    return `${y}-${md}`;
  }

  /**
   * Onumuzdeki 3 ayin bugune kadar satilmis gece/cirosu ve gecen yil AYNI
   * TARIHTE elde olan. Gecen yilin kaydi sonradan girildiyse (giristen sonra
   * olusturulmus ya da ice aktarilmis) o gunku tablo bilinemez: kiyas null.
   * Gecen yil o tarihte iptal edilmemis olup sonradan iptal edilen kayit da
   * bilinemez (iptal tarihi tutulmuyor); bu yuzden not dusulur.
   */
  function buildPace(ctx, villa) {
    const today = ctx.today;
    const lyToday = addYearsToDate(today, -1);
    const startMonth = today.slice(0, 7);
    const months = monthsBetween(startMonth, shiftMonth(startMonth, 2));
    const createdOnOrBefore = asOf => b => {
      const c = dateOnly(b.createdAt || b.created_at);
      return !!c && c <= asOf;
    };
    const row = (monthKey, asOf, fromDate) => {
      const r = LedgerContract.monthRange(monthKey);
      const bas = fromDate && fromDate > r.start ? fromDate : r.start;
      const l = LedgerContract.computePeriodLedger({
        bookings: ctx.bookings,
        bookingInScope: b => bookingVillaMatches(b, villa, ctx.villaIdByKey) && createdOnOrBefore(asOf)(b),
        bookingShare: b => LedgerContract.nightShareInRange(b, bas, r.end)
      });
      return { revenue: Math.round(l.netRoomRevenue), nights: l.soldNights };
    };
    const sonradanGirilmis = monthKey => {
      const r = LedgerContract.monthRange(monthKey);
      return ctx.bookings.some(b => {
        if (!b || !bookingVillaMatches(b, villa, ctx.villaIdByKey)) return false;
        if (LedgerContract.nightShareInRange(b, r.start, r.end).nights <= 0) return false;
        const c = dateOnly(b.createdAt || b.created_at);
        const ci = dateOnly(b.checkIn || b.check_in);
        return !c || ctx.isImported(b) || (ci && c > ci);
      });
    };
    const rows = months.map(m => {
      const lyMonth = shiftMonth(m, -12);
      // Bu ayin kalan geceleri; gecmis gunler "ileriye" degildir.
      const now = row(m, today, m === startMonth ? today : null);
      let ly = null;
      let reason = null;
      if (sonradanGirilmis(lyMonth)) {
        reason = 'Geçen yılın kayıtları sonradan girildiği için o günkü doluluk bilinmiyor';
      } else {
        ly = row(lyMonth, lyToday, m === startMonth ? lyToday : null);
        if (ly.nights === 0 && ly.revenue === 0) {
          const herhangi = ctx.bookings.some(b => b && bookingVillaMatches(b, villa, ctx.villaIdByKey)
            && LedgerContract.nightShareInRange(b, LedgerContract.monthRange(lyMonth).start, LedgerContract.monthRange(lyMonth).end).nights > 0);
          if (!herhangi) { ly = null; reason = 'Geçen yıl bu ayda kayıt yok'; }
        }
      }
      return {
        month: m,
        nights: now.nights,
        revenue: now.revenue,
        lastYear: ly,
        lastYearReason: reason,
        nightsDelta: ly ? delta('nights', now.nights, ly.nights) : null,
        revenueDelta: ly ? delta('revenue', now.revenue, ly.revenue) : null
      };
    });
    return { asOf: today, lastYearAsOf: lyToday, rows };
  }

  // -------------------------------------------------------------- rapor --

  /**
   * @param {object} o
   * @param {Array} o.bookings  appData.bookings
   * @param {Array} [o.leads]   appData.leads
   * @param {Array} o.villas    [{ key, name, id }]
   * @param {{start:string,end:string}} o.period  YYYY-MM, iki uc dahil
   * @param {string} [o.villa]  'ALL' ya da mulk anahtari
   * @param {string} o.today    YYYY-MM-DD (getTodayStr)
   * @param {object} o.deps
   *   monthPerformance(monthKey, villa) -> { roomRevenue, nights, available }
   *   monthTarget(monthKey, villa)      -> { revenue, occupancy, adr, revpar } | null
   *   isBulkSummary(booking)            -> boolean
   *   channelName(code)                 -> string (rezervasyon kanali)
   *   leadChannelName(code)             -> string (talep kanali; yoksa channelName)
   *   isImported(booking)               -> boolean (istege bagli)
   */
  function buildReport(o) {
    const opts = o || {};
    const deps = opts.deps || {};
    if (typeof deps.monthPerformance !== 'function') throw new Error('ANALYTICS_MONTH_PERFORMANCE_REQUIRED');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(opts.today || ''))) throw new Error('ANALYTICS_TODAY_REQUIRED');
    const period = normalizePeriod(opts.period);
    const villas = (opts.villas || []).filter(v => v && v.key);
    const villaIdByKey = {};
    villas.forEach(v => { if (v.id) villaIdByKey[v.key] = v.id; });
    const villa = opts.villa && opts.villa !== 'ALL' && villas.some(v => v.key === opts.villa) ? opts.villa : 'ALL';
    const ctx = {
      bookings: (opts.bookings || []).filter(Boolean),
      leads: (opts.leads || []).filter(Boolean),
      villas,
      villaIdByKey,
      today: opts.today,
      perf: makePerfCache(deps.monthPerformance),
      monthTarget: typeof deps.monthTarget === 'function' ? deps.monthTarget : () => null,
      isBulkSummary: typeof deps.isBulkSummary === 'function' ? deps.isBulkSummary : () => false,
      channelName: typeof deps.channelName === 'function' ? deps.channelName : k => k,
      // Talep kanallari ayri kodlar kullanir (Phone, Email, Other): kendi adlandiricisi.
      leadChannelName: typeof deps.leadChannelName === 'function' ? deps.leadChannelName
        : (typeof deps.channelName === 'function' ? deps.channelName : k => k),
      isImported: typeof deps.isImported === 'function' ? deps.isImported : () => false
    };
    const cmp = comparisonPeriods(period);
    const kpis = buildKpis(ctx, villa, period, cmp);
    const behavior = bookingStats(ctx, villa, periodDateRange(period));
    return {
      contractVersion: '1',
      period,
      villa,
      comparisonPeriods: cmp,
      empty: !hasActivity(kpis.current) && ctx.bookings.length === 0,
      kpis,
      trend: buildTrend(ctx, villa, period),
      properties: buildPropertyTable(ctx, period, cmp),
      channels: buildChannels(ctx, villa, period),
      behavior: {
        sample: behavior.bookings,
        leadTimeSample: behavior.leadTimeSample,
        leadTimeExcluded: behavior.leadTimeExcluded,
        leadTimeBuckets: LEAD_TIME_BUCKETS.map(b => ({ key: b.key, count: behavior.leadTimeBuckets[b.key] })),
        stayBuckets: STAY_BUCKETS.map(b => ({ key: b.key, count: behavior.stayBuckets[b.key] })),
        weekday: behavior.weekday
      },
      leads: buildLeadFunnel(ctx, villa, period),
      pace: buildPace(ctx, villa)
    };
  }

  return {
    METRICS,
    COMPARE_KEYS,
    LEAD_TIME_BUCKETS,
    STAY_BUCKETS,
    isMonthKey,
    shiftMonth,
    monthsBetween,
    comparisonPeriods,
    aggregateMonths,
    delta,
    buildReport
  };
}));
