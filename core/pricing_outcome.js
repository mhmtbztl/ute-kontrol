/**
 * LEXBNB — FIYAT SONUCU (onaylanan / elle yazilan fiyat -> gerceklesen)
 *
 * Fiyat takviminde kaydedilen gunluk fiyat (phase101 property_daily_prices)
 * referanstir; OTA'ya gitmez. Bu modul, tarihi gecmis kayitli gunlerin
 * sonucunu olcer: gece satildi mi, hangi fiyata satildi.
 *
 * Gerceklesen gece fiyati defter sozlesmesinin oda geliri tanimidir
 * (LedgerContract.bookingAmounts): (brut - temizlik ucreti - indirim) / gece.
 * Yeni para formulu yazilmaz.
 *
 * Atif kurali (uydurma yok, CLAUDE.md 3.6):
 *   - rezervasyon fiyat kaydindan SONRA olusturulduysa "onaydan sonra satildi"
 *     ve karsilastirmaya girer;
 *   - ONCE olusturulduysa fiyat karari satisi etkilememistir: sayilir ama
 *     karsilastirmaya girmez;
 *   - olusturma zamani yoksa ya da kayit ice aktarildiysa (created_at aktarim
 *     anidir) atif yapilamaz: orneklenmez, nedeni sayilir.
 * Iptal edilen rezervasyon ve toplu aktarim ozeti gece satmaz.
 * Ornek yoksa ozet alanlari null'dir, 0 degil.
 *
 * Node'da ve tarayicida calisir; yan etkisi yoktur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ledger_contract.js'));
  else root.PricingOutcome = factory(root.LedgerContract);
}(typeof self !== 'undefined' ? self : this, function (LedgerContract) {
  'use strict';

  const DAY = 86400000;
  const iso = v => {
    const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  };
  const stamp = v => {
    const t = Date.parse(String(v || ''));
    return Number.isFinite(t) ? t : null;
  };
  const round = v => Math.round(v * 100) / 100;

  function propertyMatches(b, propertyId, propertyKey) {
    if (!b) return false;
    if (propertyId && (b.propertyId === propertyId || b.property_id === propertyId)) return true;
    return !!propertyKey && b.villa === propertyKey;
  }

  function isCancelled(b) {
    return String(b?.status || '').toUpperCase() === 'CANCELLED';
  }

  /** Gecenin (date) iptal edilmemis rezervasyonu; yoksa null. */
  function bookingForNight(bookings, date, opts) {
    const o = opts || {};
    const isBulk = typeof o.isBulkSummary === 'function' ? o.isBulkSummary : () => false;
    return (bookings || []).find(b => propertyMatches(b, o.propertyId, o.propertyKey)
      && !isCancelled(b) && !isBulk(b)
      && LedgerContract.nightShareInRange(b, date, date).nights === 1) || null;
  }

  /** Rezervasyonun gece basina oda geliri (defter tanimi). Gece yoksa null. */
  function realizedNightPrice(b) {
    const share = LedgerContract.nightShareInRange(b, '0000-01-01', '9999-12-31');
    if (!share.total) return null;
    const a = LedgerContract.bookingAmounts(b);
    return round((a.gross - a.cleanFee - a.discount) / share.total);
  }

  /**
   * @param {object} o
   *   dailyPrices  property_daily_prices satirlari
   *   bookings     istemci rezervasyonlari
   *   propertyId, propertyKey
   *   today        YYYY-MM-DD (bu gun dahil degil: gece henuz bitmedi)
   *   from         YYYY-MM-DD (istege bagli alt sinir)
   *   isBulkSummary(b), isImported(b)
   */
  function computePricingOutcome(o) {
    const opts = o || {};
    const today = iso(opts.today);
    if (!today) throw new Error('PRICING_OUTCOME_TODAY_REQUIRED');
    const from = iso(opts.from);
    const isImported = typeof opts.isImported === 'function' ? opts.isImported : () => false;
    const rows = (opts.dailyPrices || [])
      .filter(row => row && row.property_id === opts.propertyId)
      .map(row => ({ ...row, date: iso(row.price_date) }))
      .filter(row => row.date && row.date < today && (!from || row.date >= from))
      .sort((a, b) => a.date.localeCompare(b.date));

    const days = rows.map(row => {
      const price = Number(row.price);
      const base = { date: row.date, source: row.source === 'MANUAL' ? 'MANUAL' : 'APPROVED', price, suggested: row.suggested_price == null ? null : Number(row.suggested_price) };
      const b = bookingForNight(opts.bookings, row.date, opts);
      if (!b) return { ...base, outcome: 'UNSOLD', realized: null, diff: null };
      const realized = realizedNightPrice(b);
      const created = stamp(b.createdAt || b.created_at);
      const decided = stamp(row.updated_at || row.created_at);
      let outcome = 'SOLD_AFTER';
      let reason = null;
      if (isImported(b)) { outcome = 'UNATTRIBUTED'; reason = 'IMPORTED'; }
      else if (created == null) { outcome = 'UNATTRIBUTED'; reason = 'NO_CREATED_AT'; }
      else if (decided == null) { outcome = 'UNATTRIBUTED'; reason = 'NO_DECISION_TIME'; }
      else if (created < decided) outcome = 'SOLD_BEFORE';
      return {
        ...base, outcome, reason, realized,
        bookingId: b.id || b.dbId || null,
        diff: outcome === 'SOLD_AFTER' && realized != null && Number.isFinite(price) ? round(realized - price) : null
      };
    });

    const summarize = list => {
      const after = list.filter(d => d.outcome === 'SOLD_AFTER');
      const unsold = list.filter(d => d.outcome === 'UNSOLD').length;
      const measured = after.length + unsold;
      const diffs = after.filter(d => d.diff != null);
      return {
        days: list.length,
        soldAfter: after.length,
        soldBefore: list.filter(d => d.outcome === 'SOLD_BEFORE').length,
        unsold,
        unattributed: list.filter(d => d.outcome === 'UNATTRIBUTED').length,
        // Satilma orani yalniz karari olculebilen gunlerde: onaydan sonra satilan / (o + bos kalan).
        sellRate: measured > 0 ? round(after.length / measured * 100) : null,
        avgDiff: diffs.length ? round(diffs.reduce((s, d) => s + d.diff, 0) / diffs.length) : null,
        avgDiffPct: diffs.length ? round(diffs.reduce((s, d) => s + d.diff / d.price, 0) / diffs.length * 100) : null,
        avgRealized: diffs.length ? round(diffs.reduce((s, d) => s + d.realized, 0) / diffs.length) : null
      };
    };

    return {
      today, from,
      days,
      summary: rows.length ? summarize(days) : null,
      bySource: {
        APPROVED: days.some(d => d.source === 'APPROVED') ? summarize(days.filter(d => d.source === 'APPROVED')) : null,
        MANUAL: days.some(d => d.source === 'MANUAL') ? summarize(days.filter(d => d.source === 'MANUAL')) : null
      }
    };
  }

  /** YYYY-MM-DD'den n gun once. */
  function daysBefore(date, n) {
    return new Date(Date.parse(date + 'T00:00:00Z') - n * DAY).toISOString().slice(0, 10);
  }

  /**
   * Sonuclar sekmesinin govdesi (KPI, notlar, gun tablosu). app.js'te degil
   * burada durur: modul fiyat ekrani acilinca yuklenir (acilis JS butcesi, L-163).
   * h: { windowDays, importsKnown, esc, money, date } — kacis ve bicim app'ten gelir.
   */
  function resultsBodyHtml(outcome, h) {
    const escapeHtml = h.esc, money = h.money;
    const s = outcome.summary;
    const pct = value => value == null ? '—' : `%${Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
    const signed = value => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
    const kpi = (label, value, meta) => `<div class="kpi-card"><span class="kpi-label">${escapeHtml(label)}</span><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-meta">${escapeHtml(meta)}</div></div>`;
    const bySource = key => outcome.bySource[key];
    const sourceMeta = key => { const item = bySource(key); return item ? `${item.days} gün · satılma ${pct(item.sellRate)}` : 'kayıt yok'; };
    const kpisHtml = `<div class="pricing-kpis">${[
      kpi('Kayıtlı gün', `${s.days} gün`, `Son ${h.windowDays} gün · onaylı ${bySource('APPROVED')?.days || 0}, elle ${bySource('MANUAL')?.days || 0}`),
      kpi('Satılma oranı', pct(s.sellRate), s.sellRate == null ? 'Kararı ölçülebilen gün yok' : `${s.soldAfter} satıldı / ${s.soldAfter + s.unsold} gün (fiyat kaydından sonra)`),
      kpi('Ortalama fark', signed(s.avgDiff), s.avgDiff == null ? 'Kayıttan sonra satılan gece yok' : `Gerçekleşen − kayıtlı, gece başına (${pct(s.avgDiffPct)})`),
      kpi('Onaylı / Elle', `${pct(bySource('APPROVED')?.sellRate ?? null)} / ${pct(bySource('MANUAL')?.sellRate ?? null)}`, `Onaylı: ${sourceMeta('APPROVED')} · Elle: ${sourceMeta('MANUAL')}`)
    ].join('')}</div>`;
    const reasons = { IMPORTED: 'içe aktarılmış kayıt', NO_CREATED_AT: 'rezervasyonun oluşturulma zamanı yok', NO_DECISION_TIME: 'fiyat kaydının zamanı yok' };
    const notes = [];
    if (s.soldBefore) notes.push(`${s.soldBefore} gün fiyat kaydından önce satılmıştı; fiyat kararı bu satışı etkilemediği için orana ve farka girmez.`);
    if (s.unattributed) notes.push(`${s.unattributed} gün ölçülemedi (oluşturulma zamanı yok ya da içe aktarılmış rezervasyon).`);
    if (!h.importsKnown) notes.push('İçe aktarılan rezervasyonların listesi henüz okunmadı; içe aktarılmış bir kayıt bu sürede ayırt edilemeyebilir.');
    const notesHtml = notes.length ? `<ul class="pricing-results-notes">${notes.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul>` : '';
    const result = day => {
      if (day.outcome === 'UNSOLD') return { text: 'Boş kaldı', cls: 'is-unsold' };
      if (day.outcome === 'SOLD_BEFORE') return { text: `Önceden satılmıştı (${money(day.realized)})`, cls: 'is-muted' };
      if (day.outcome === 'UNATTRIBUTED') return { text: `Ölçülemedi: ${reasons[day.reason] || 'neden bilinmiyor'}`, cls: 'is-muted' };
      return { text: `Satıldı ${money(day.realized)}`, cls: 'is-sold' };
    };
    const list = outcome.days.slice().reverse();
    const shown = list.slice(0, 90);
    const rowsHtml = shown.map(day => {
      const r = result(day);
      return `<tr><td>${escapeHtml(h.date(day.date))}</td><td>${day.source === 'MANUAL' ? 'Elle' : 'Onaylı'}</td><td class="num">${escapeHtml(money(day.price))}</td><td class="num">${escapeHtml(money(day.suggested))}</td><td class="${escapeHtml(r.cls)}">${escapeHtml(r.text)}</td><td class="num">${escapeHtml(signed(day.diff))}</td></tr>`;
    }).join('');
    const moreHtml = list.length > shown.length ? `<p class="sub-text">En yeni ${shown.length} gün gösteriliyor (toplam ${list.length}).</p>` : '';
    const tableHtml = `<div class="ba-scroll"><table class="ba-table pricing-results-table"><thead><tr><th scope="col">Tarih</th><th scope="col">Kaynak</th><th scope="col" class="num">Kayıtlı</th><th scope="col" class="num">Öneri</th><th scope="col">Sonuç</th><th scope="col" class="num">Fark</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>${moreHtml}`;
    return `${kpisHtml}${notesHtml}${tableHtml}<p class="sub-text">Gerçekleşen gece fiyatı Finans'ın konaklama cirosu tanımıdır: tutar − misafirden alınan temizlik ücreti − indirim, gece sayısına bölünür. İptal edilen rezervasyon gece satmaz.</p>`;
  }

  return { computePricingOutcome, bookingForNight, realizedNightPrice, daysBefore, resultsBodyHtml };
}));
