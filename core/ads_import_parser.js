(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AdsImportParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FORMAT_SPEC = 'LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama';
  function finance() {
    if (typeof FinanceImportEngine !== 'undefined') return FinanceImportEngine;
    if (typeof require === 'function') return require('./finance_import_engine');
    return null;
  }
  const resultType = raw => {
    const value = String(raw || '').toLowerCase();
    if (value.includes('messaging_conversation_started')) return 'MESSAGE';
    if (value.includes('click_to_call')) return 'CALL';
    return 'OTHER';
  };
  function validDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  const dayCount = (start, end) => Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  function validatePeriod(start, end, line, errors) {
    if (!validDateKey(start) || !validDateKey(end) || dayCount(start, end) <= 0) {
      errors.push({ line, code: 'INVALID_PERIOD', text: 'Başlangıç/bitiş tarihi geçersiz.' }); return false;
    }
    if (dayCount(start, end) > 31) {
      errors.push({ line, code: 'PERIOD_TOO_LONG', text: 'Dönem 31 günden uzun; haftalık ya da aylık aralıkla indirin.' }); return false;
    }
    return true;
  }
  const numberOrNull = value => String(value ?? '').trim() === '' ? null : finance().normalizeAmount(String(value));
  function validateNumbers(row, line, errors) {
    ['spend', 'impressions', 'reach', 'clicks', 'messages', 'calls'].forEach(key => {
      if (row[key] !== null && (row[key] === null || !Number.isFinite(row[key]) || row[key] < 0)) errors.push({ line, code: 'INVALID_NUMBER', text: `${key} negatif ya da geçersiz.` });
    });
  }
  function parsePasted(text) {
    const errors = [], warnings = [], lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines[0] !== 'LEXBNB_REKLAM_V2' || lines[1] !== 'platform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama') return { rows: [], errors: [{ line: 1, code: 'INVALID_HEADER', text: 'LEXBNB_REKLAM_V2 başlığı birebir eşleşmiyor.' }], warnings };
    const rows = [];
    lines.slice(2).forEach((lineText, index) => {
      const line = index + 3, cells = lineText.split(';');
      if (cells.length !== 10) { errors.push({ line, code: 'COLUMN_COUNT', text: '10 sütun bekleniyor.' }); return; }
      const [platform, campaignName, periodStart, periodEnd, typeRaw, spend, impressions, clicks, messages, calls] = cells;
      const typeMap = { MESAJ: 'MESSAGE', ARAMA: 'CALL', DIGER: 'OTHER', DİĞER: 'OTHER', OTHER: 'OTHER' };
      const row = { campaignId: null, campaignName, platform, periodStart, periodEnd, resultType: typeMap[String(typeRaw).toUpperCase()] || null, resultMetric: null, spend: numberOrNull(spend), impressions: numberOrNull(impressions), reach: null, clicks: numberOrNull(clicks), messages: numberOrNull(messages), calls: numberOrNull(calls), source: 'SCREENSHOT_CHATGPT' };
      if (!String(campaignName || '').trim()) errors.push({ line, code: 'CAMPAIGN_REQUIRED', text: 'Kampanya adı zorunlu.' });
      if (!['META', 'GOOGLE'].includes(platform)) errors.push({ line, code: 'INVALID_PLATFORM', text: 'Platform META veya GOOGLE olmalı.' });
      if (!row.resultType) errors.push({ line, code: 'INVALID_RESULT_TYPE', text: 'Sonuç türü MESAJ, ARAMA veya DIGER olmalı.' });
      validatePeriod(periodStart, periodEnd, line, errors); validateNumbers(row, line, errors); rows.push(row);
    });
    return { rows, errors, warnings };
  }
  function parseCsv(text, platform) {
    if (platform === 'GOOGLE') return { rows: [], errors: [{ line: 1, code: 'GOOGLE_SAMPLE_REQUIRED', text: 'Google Ads Kampanyalar raporu örneği bekleniyor.' }], warnings: [] };
    if (platform !== 'META') return { rows: [], errors: [{ line: 1, code: 'INVALID_PLATFORM', text: 'Yalnız META CSV destekleniyor.' }], warnings: [] };
    const parsed = finance().parseCSV(text), errors = [], warnings = [], required = ['Rapor Başlangıcı', 'Rapor Sonu', 'Kampanya Adı', 'Sonuçlar', 'Sonuç Göstergesi', 'Erişim', 'Harcanan Tutar (TRY)', 'Gösterim', 'Bağlantı Tıklamaları'];
    const missing = required.filter(key => !parsed.headers.includes(key));
    if (missing.length) return { rows: [], errors: [{ line: 1, code: 'INVALID_HEADER', text: `Eksik Meta sütunları: ${missing.join(', ')}` }], warnings };
    const rows = parsed.rows.map((raw, index) => {
      const line = index + 2, metric = raw['Sonuç Göstergesi'], type = resultType(metric), results = numberOrNull(raw.Sonuçlar);
      const row = { campaignId: null, campaignName: raw['Kampanya Adı'], platform: 'META', periodStart: raw['Rapor Başlangıcı'], periodEnd: raw['Rapor Sonu'], resultType: type, resultMetric: metric || null, spend: numberOrNull(raw['Harcanan Tutar (TRY)']), impressions: numberOrNull(raw['Gösterim']), reach: numberOrNull(raw['Erişim']), clicks: numberOrNull(raw['Bağlantı Tıklamaları']), messages: type === 'MESSAGE' ? results : null, calls: type === 'CALL' ? results : null, source: 'CSV' };
      if (!String(row.campaignName || '').trim()) errors.push({ line, code: 'CAMPAIGN_REQUIRED', text: 'Kampanya adı zorunlu.' });
      validatePeriod(row.periodStart, row.periodEnd, line, errors); validateNumbers(row, line, errors); return row;
    });
    return { rows, errors, warnings };
  }
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, ' ').trim();
  function matchCampaigns(rows, campaigns) {
    return (rows || []).map(row => {
      const exact = (campaigns || []).find(item => item.name === row.campaignName && item.platform === row.platform);
      const normalized = exact || (campaigns || []).find(item => normalize(item.name) === normalize(row.campaignName) && item.platform === row.platform);
      return { ...row, campaignId: normalized?.id || null, matchedBy: exact ? 'EXACT' : normalized ? 'NORMALIZED' : null };
    });
  }
  return { FORMAT_SPEC, parsePasted, parseCsv, matchCampaigns, resultType };
});
