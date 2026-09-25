/**
 * LEXBNB — DONEM DEFTERI SOZLESMESI (K-04, istemci tarafi)
 *
 * Sunucudaki `compute_month_close_snapshot` / `get_executive_dashboard_snapshot`
 * (phase45) ile AYNI formul. Finans ekrani, kokpit, aylik KPI tablosu ve
 * onceki donem karsilastirmasi bu tek fonksiyondan okur; bir zamanlar her
 * ekran kendi toplamini yapiyordu ve ayni ay icin farkli net kar raporluyordu
 * (CLAUDE.md 3.4).
 *
 *   Brut Oda Geliri = brut - misafirden alinan temizlik ucreti
 *   Net Oda Geliri  = Brut Oda Geliri - indirim              ("konaklama cirosu")
 *   Temizlik Geliri = misafirden alinan temizlik ucreti
 *   Toplam Gelir    = Net Oda Geliri + Temizlik Geliri        (= brut - indirim)
 *   OPEX            = elle giderler + OTA komisyonu + odeme komisyonu
 *                     + YAPILMIS temizliklerin maliyeti
 *   Net Kar         = Toplam Gelir - OPEX - CAPEX
 *   ADR             = Net Oda Geliri / satilan gece
 *
 * Rezervasyondan gelen her kalem (oda geliri, temizlik geliri, indirim, OTA
 * ve odeme komisyonu) gecelere esit bolunur; donem yalniz kendi gecelerinin
 * payini alir (tahakkuk). Pay hesabi cagirandan gelir (`bookingShare`), cunku
 * donem tanimi (ay, yil, ozel aralik) arayuzun filtresidir.
 *
 * Temizlik maliyeti yalniz DURUMU 'DONE' olan gorevlerden gelir ve gorevin
 * tarihine (yapildigi gun) yazilir. Eski istemcinin "Odendi" aninda yazdigi
 * `EXP-CLEAN-<gorev>` gider satiri olan gorev, o satir uzerinden (elle
 * giderlerin icinde) zaten sayildigi icin ikinci kez sayilmaz.
 *
 * Node'da ve tarayicida calisir; yan etkisi yoktur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LedgerContract = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const CLEAN_EXPENSE_PREFIX = 'EXP-CLEAN-';
  const TASK_STATUSES = ['PLANNED', 'DONE', 'SKIPPED'];

  const sayi = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const ilk = (...degerler) => degerler.find(v => v !== undefined && v !== null);

  /** Rezervasyonun para alanlari; eski ve yeni alan adlarini birlikte okur. */
  function bookingAmounts(b) {
    return {
      gross: sayi(ilk(b.gross, b.grossAmount, b.gross_amount)),
      cleanFee: sayi(ilk(b.cleanFee, b.cleaningFee, b.cleaning_fee)),
      discount: sayi(b.discount),
      ota: sayi(ilk(b.otaCommission, b.otaComm, b.ota_commission)),
      payment: sayi(ilk(b.paymentCommission, b.payment_commission))
    };
  }

  /**
   * Gorevin durumu. Durumu olmayan kayit (phase45 oncesi bellek, eski satir)
   * sunucudaki gecmis veri eslemesiyle ayni kurala baglanir: odenmisse
   * yapilmistir, degilse bilinmiyor (PLANNED).
   */
  function taskStatus(t) {
    const s = String((t && t.status) || '').toUpperCase();
    if (TASK_STATUSES.includes(s)) return s;
    return t && (t.paid || t.is_paid) ? 'DONE' : 'PLANNED';
  }

  function cleaningExpenseKeys(expenses) {
    const keys = new Set();
    (expenses || []).forEach(e => {
      [e && e.legacyId, e && e.legacy_id, e && e.id].forEach(k => {
        if (typeof k === 'string' && k.startsWith(CLEAN_EXPENSE_PREFIX)) keys.add(k);
      });
    });
    return keys;
  }

  /** Bu gorevin maliyeti eski bir EXP-CLEAN-* gider satirinda mi duruyor? */
  function hasLegacyCleaningExpense(t, keys) {
    return [t.dbId, t.legacyId, t.legacy_id, t.id]
      .some(k => k && keys.has(CLEAN_EXPENSE_PREFIX + k));
  }

  function computePeriodLedger(opts) {
    const o = opts || {};
    const bookingShare = o.bookingShare || (() => ({ ratio: 1, nights: 0 }));
    const expenseInScope = o.expenseInScope || (() => true);
    const taskInScope = o.taskInScope || (() => true);
    const bookingInScope = o.bookingInScope || (() => true);

    const out = {
      grossRoomRevenue: 0, discount: 0, netRoomRevenue: 0, cleaningRevenue: 0, totalRevenue: 0,
      otaCommission: 0, paymentCommission: 0, cleaningCost: 0, cleaningDebt: 0,
      manualOpex: 0, capex: 0, totalOpex: 0, operatingProfit: 0, netProfit: 0,
      soldNights: 0, bookingCount: 0, adr: null
    };

    (o.bookings || []).forEach(b => {
      if (!b || String(b.status || '').toUpperCase() === 'CANCELLED') return;
      if (!bookingInScope(b)) return;
      const pay = bookingShare(b) || {};
      const ratio = sayi(pay.ratio);
      const nights = sayi(pay.nights);
      if (ratio <= 0 && nights <= 0) return;
      const a = bookingAmounts(b);
      out.grossRoomRevenue += (a.gross - a.cleanFee) * ratio;
      out.discount += a.discount * ratio;
      out.cleaningRevenue += a.cleanFee * ratio;
      out.otaCommission += a.ota * ratio;
      out.paymentCommission += a.payment * ratio;
      out.soldNights += nights;
      out.bookingCount += 1;
    });
    out.netRoomRevenue = out.grossRoomRevenue - out.discount;
    out.totalRevenue = out.netRoomRevenue + out.cleaningRevenue;

    (o.expenses || []).forEach(e => {
      if (!e || !expenseInScope(e)) return;
      const tur = String(e.type || e.expenseType || e.expense_type || 'OPEX').toUpperCase();
      if (tur === 'CAPEX') out.capex += sayi(e.amount);
      else out.manualOpex += sayi(e.amount);
    });

    const keys = cleaningExpenseKeys(o.allExpenses || o.expenses);
    (o.cleaningTasks || []).forEach(t => {
      if (!t || taskStatus(t) !== 'DONE' || !taskInScope(t)) return;
      if (hasLegacyCleaningExpense(t, keys)) return;
      const tutar = sayi(t.amount);
      out.cleaningCost += tutar;
      if (!(t.paid || t.is_paid)) out.cleaningDebt += tutar;
    });

    out.totalOpex = out.manualOpex + out.otaCommission + out.paymentCommission + out.cleaningCost;
    out.operatingProfit = out.totalRevenue - out.totalOpex;
    out.netProfit = out.operatingProfit - out.capex;
    out.adr = out.soldNights > 0 ? out.netRoomRevenue / out.soldNights : null;
    return out;
  }

  /** [start, end] (YYYY-MM-DD, iki uc dahil) araligina dusen gece payi. */
  function nightShareInRange(b, start, end) {
    const ci = b && (b.checkIn || b.check_in);
    const co = b && (b.checkOut || b.check_out);
    const bos = { nights: 0, total: 0, ratio: 0 };
    if (!ci || !co) return bos;
    const gun = 86400000;
    const bas = Date.parse(ci + 'T00:00:00Z');
    const bit = Date.parse(co + 'T00:00:00Z');
    if (!Number.isFinite(bas) || !Number.isFinite(bit)) return bos;
    const toplam = Math.round((bit - bas) / gun);
    if (toplam <= 0) return bos;
    let icerde = 0;
    for (let i = 0; i < toplam; i++) {
      const g = new Date(bas + i * gun).toISOString().slice(0, 10);
      if (g >= start && g <= end) icerde++;
    }
    return { nights: icerde, total: toplam, ratio: icerde / toplam };
  }

  function monthRange(monthKey) {
    if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return null;
    const y = Number(monthKey.slice(0, 4));
    const m = Number(monthKey.slice(5, 7));
    const son = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { start: `${monthKey}-01`, end: `${monthKey}-${String(son).padStart(2, '0')}` };
  }

  return {
    CLEAN_EXPENSE_PREFIX,
    TASK_STATUSES,
    bookingAmounts,
    taskStatus,
    cleaningExpenseKeys,
    hasLegacyCleaningExpense,
    computePeriodLedger,
    nightShareInRange,
    monthRange
  };
}));
