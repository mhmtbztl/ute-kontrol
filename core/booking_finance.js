(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BookingFinance = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function amount(value, label) {
    if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 99999999.99) throw new Error(label + ': 0–99.999.999,99 arasında tutar girin.');
    return money(Number(value));
  }
  function validateProfile(p) {
    if (!p || !['checkIn', 'checkOut', 'invoiceDate'].includes(p.dateBasis)) throw new Error('Vergi oranının tarih kaynağını seçin.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.validFrom || '') || !/^\d{4}-\d{2}-\d{2}$/.test(p.validTo || '') || p.validFrom > p.validTo) throw new Error('Vergi profilinin geçerlilik aralığını girin.');
    for (const key of ['vat', 'accommodation']) {
      const t = p[key];
      if (!t || amount(t.rate, 'Vergi oranı') > 100 || ['room', 'cleaning', 'includesOther'].some(k => typeof t[k] !== 'boolean')) throw new Error('Vergi oranı ve matrah seçimlerini tamamlayın.');
    }
    if (p.vat.includesOther && p.accommodation.includesOther) throw new Error('İki vergi karşılıklı olarak birbirinin matrahına eklenemez.');
    return p;
  }
  function coefficients(p, component) {
    const vr = money(Number(p.vat.rate)) / 100, ar = money(Number(p.accommodation.rate)) / 100;
    let v = p.vat[component] ? vr : 0;
    let a = p.accommodation[component] ? ar : 0;
    if (p.vat.includesOther) v += a * vr;
    if (p.accommodation.includesOther) a += v * ar;
    return { v, a };
  }
  function portion(value, total, label) {
    const n = value === 'all' ? total : value === 'none' ? 0 : amount(value, label);
    if (n > total) throw new Error(label + ' vergi toplamını aşamaz.');
    return n;
  }
  function calculate(input) {
    const base = amount(input.amount, 'Rezervasyon tutarı');
    const discount = amount(input.discount ?? 0, 'İndirim');
    const cleanFee = amount(input.cleanFee ?? 0, 'Temizlik geliri');
    if (discount + cleanFee > base) throw new Error('Temizlik geliri ve indirim rezervasyon tutarını aşamaz.');
    const t = input.tax || { enabled: false };
    let room = money(base - cleanFee - discount), cleaning = cleanFee, vat = 0, accommodation = 0, cleaningTax = 0;
    let gross = money(base - discount);
    if (t.enabled) {
      if (!['inclusive', 'exclusive', 'manual'].includes(t.mode)) throw new Error('Vergi yöntemini seçin.');
      if (t.mode === 'manual') {
        vat = amount(t.vat?.amount, 'KDV'); accommodation = amount(t.accommodation?.amount, 'Konaklama vergisi');
        const cv = amount(t.vat?.cleaningAmount, 'Temizlik KDV payı');
        const ca = amount(t.accommodation?.cleaningAmount, 'Temizlik konaklama vergisi payı');
        if (cv > vat || ca > accommodation) throw new Error('Temizlik vergi payı ilgili vergiyi aşamaz.');
        cleaningTax = money(cv + ca); cleaning = money(cleanFee - cleaningTax);
        room = money(room - vat - accommodation + cleaningTax);
      } else {
        const p = validateProfile(t.profile);
        const date = input[p.dateBasis];
        if (!date || date < p.validFrom || date > p.validTo) throw new Error('Seçilen vergi profili işlem tarihi için geçerli değil.');
        const r = coefficients(p, 'room'), c = coefficients(p, 'cleaning');
        if (t.mode === 'inclusive') { room /= 1 + r.v + r.a; cleaning /= 1 + c.v + c.a; }
        const cv = money(cleaning * c.v), ca = money(cleaning * c.a);
        vat = money(money(room * r.v) + cv); accommodation = money(money(room * r.a) + ca);
        cleaningTax = money(cv + ca);
        if (t.mode === 'exclusive') gross = money(gross + vat + accommodation);
        // Reconcile cents to guest total; never lose a cent in inverse calculations.
        cleaning = t.mode === 'exclusive' ? cleanFee : money(cleanFee - cleaningTax);
        room = money(gross - vat - accommodation - cleaning);
      }
    }
    if (room < 0 || cleaning < 0) throw new Error('Vergiler oda veya temizlik gelirini aşamaz.');
    const taxTotal = money(vat + accommodation);
    let platformTax = 0, businessLiability = 0, businessTaxCash = 0;
    for (const [key, total] of [['vat', vat], ['accommodation', accommodation]]) {
      if (!t.enabled || total === 0) continue;
      const collected = portion(t[key]?.platformCollected, total, 'Platform tahsilatı');
      const liability = portion(t[key]?.businessLiability, total, 'İşletme ödeme yükümlülüğü');
      platformTax += collected; businessLiability += liability;
      // Reserve all tax exactly once, including tax to be transferred to a platform.
      // The legal debtor is separate; collection is NOT proof of discharge.
      businessTaxCash += total - collected;
    }
    platformTax = money(platformTax); businessLiability = money(businessLiability); businessTaxCash = money(businessTaxCash);
    const commission = amount(input.commission ?? 0, 'OTA komisyonu');
    const payment = amount(input.paymentCommission ?? 0, 'POS kesintisi');
    const cleanCost = input.cleanCost === null || input.cleanCost === undefined || input.cleanCost === '' ? null : amount(input.cleanCost, 'Temizlik maliyeti');
    const extras = input.extras || [];
    if (!Array.isArray(extras) || extras.length > 50) throw new Error('En fazla 50 ek gider eklenebilir.');
    const ids = new Set();
    const otherExpenses = money(extras.reduce((sum, e) => {
      if (!/^[a-zA-Z0-9-]{1,36}$/.test(e.id || '') || ids.has(e.id) || !String(e.name || '').trim() || String(e.name).length > 100) throw new Error('Her giderin benzersiz kimliği ve adı olmalı.');
      ids.add(e.id); return sum + amount(e.amount, 'Ek gider');
    }, 0));
    const afterCommission = money(gross - commission - payment);
    const afterTax = money(afterCommission - platformTax - businessTaxCash);
    const afterCleaning = money(afterTax - (cleanCost ?? 0));
    return { gross, vat, accommodation, taxTotal, cleaningTax, cleaningRevenue: cleaning,
      netRoomRevenue: room, adr: Number(input.nights) > 0 ? money(room / Number(input.nights)) : null,
      platformTax, businessLiability, businessTaxCash, commission, paymentCommission: payment,
      cleanCost, otherExpenses, afterCommission, afterTax, afterCleaning, remaining: money(afterCleaning - otherExpenses) };
  }
  return { calculate, validateProfile, money };
}));
