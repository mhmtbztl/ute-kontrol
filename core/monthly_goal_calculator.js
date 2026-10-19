(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MonthlyGoalCalculator = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const present = value => value !== null && value !== undefined && value !== '';
  const finite = value => present(value) && Number.isFinite(Number(value));
  const positive = value => finite(value) && Number(value) > 0;
  const nonNegative = value => finite(value) && Number(value) >= 0;
  const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const ceilMoney = value => Math.ceil((Number(value) - Number.EPSILON) * 100) / 100;

  function recalculate(input, source, options) {
    const values = { ...(input || {}) };
    const updates = {};
    const set = (key, value) => {
      values[key] = value;
      updates[key] = value;
    };
    const revenueOk = positive(values.revenue);
    const opts = options || {};

    if (source === 'adr' && revenueOk && positive(values.adr)) {
      set('nights', Math.ceil(Number(values.revenue) / Number(values.adr)));
    } else if (source === 'nights' && revenueOk && positive(values.nights) && Number.isInteger(Number(values.nights))) {
      set('adr', ceilMoney(Number(values.revenue) / Number(values.nights)));
    } else if (source === 'margin' && revenueOk && nonNegative(values.margin) && Number(values.margin) <= 100) {
      set('profit', roundMoney(Number(values.revenue) * Number(values.margin) / 100));
    } else if (source === 'profit' && revenueOk && nonNegative(values.profit) && Number(values.profit) <= Number(values.revenue)) {
      set('margin', roundMoney(Number(values.profit) / Number(values.revenue) * 100));
    } else if (source === 'revenue' && revenueOk) {
      const rateDriver = opts.rateDriver || (positive(values.nights) ? 'nights' : 'adr');
      if (rateDriver === 'adr' && positive(values.adr)) {
        set('nights', Math.ceil(Number(values.revenue) / Number(values.adr)));
      } else if (positive(values.nights) && Number.isInteger(Number(values.nights))) {
        set('adr', ceilMoney(Number(values.revenue) / Number(values.nights)));
      }

      const profitDriver = opts.profitDriver || (nonNegative(values.margin) ? 'margin' : 'profit');
      if (profitDriver === 'profit' && nonNegative(values.profit) && Number(values.profit) <= Number(values.revenue)) {
        set('margin', roundMoney(Number(values.profit) / Number(values.revenue) * 100));
      } else if (nonNegative(values.margin) && Number(values.margin) <= 100) {
        set('profit', roundMoney(Number(values.revenue) * Number(values.margin) / 100));
      }
    }

    if (['revenue', 'margin', 'profit'].includes(source)
        && positive(values.revenue)
        && nonNegative(values.profit)
        && Number(values.profit) <= Number(values.revenue)) {
      set('maxExpense', roundMoney(Number(values.revenue) - Number(values.profit)));
    }

    return { values, updates };
  }

  function evaluateCapacity(nights, capacity) {
    if (!nonNegative(nights) || !positive(capacity)) {
      return { occupancy: null, exceeds: false, available: positive(capacity) ? Number(capacity) : null };
    }
    const available = Number(capacity);
    const occupancy = roundMoney(Number(nights) / available * 100);
    return { occupancy, exceeds: Number(nights) > available, available };
  }

  function validateForSave(input, capacity) {
    const values = input || {};
    const errors = [];
    const add = (code, message) => errors.push({ code, message });

    if (!positive(values.revenue)) add('REVENUE_INVALID', 'Aylık hedef ciro sıfırdan büyük olmalıdır.');
    if (present(values.adr) && !positive(values.adr)) add('ADR_INVALID', 'Hedef ADR sıfırdan büyük, geçerli bir tutar olmalıdır.');
    if (present(values.nights) && (!positive(values.nights) || !Number.isInteger(Number(values.nights)))) {
      add('NIGHTS_INVALID', 'Hedef gece sayısı sıfırdan büyük bir tam sayı olmalıdır.');
    }
    if (present(values.margin) && (!nonNegative(values.margin) || Number(values.margin) > 100)) {
      add('MARGIN_INVALID', 'Hedef kâr marjı 0 ile 100 arasında olmalıdır.');
    }
    if (present(values.profit) && (!nonNegative(values.profit) || (positive(values.revenue) && Number(values.profit) > Number(values.revenue)))) {
      add('PROFIT_INVALID', 'Hedef net kâr geçerli olmalı ve hedef ciroyu aşmamalıdır.');
    }
    if (present(values.maxExpense) && !nonNegative(values.maxExpense)) {
      add('MAX_EXPENSE_INVALID', 'Hedef gider bütçesi negatif olamaz.');
    }

    const capacityResult = evaluateCapacity(values.nights, capacity);
    if (capacityResult.exceeds) {
      add('CAPACITY_EXCEEDED', `Hedef gece sayısı kullanılabilir ${capacityResult.available} geceyi aşıyor.`);
    }
    return { valid: errors.length === 0, errors, capacity: capacityResult };
  }

  return { recalculate, evaluateCapacity, validateForSave, roundMoney, ceilMoney };
}));
