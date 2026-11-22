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
      errors.push({ line, code: 'PERIOD_TOO_LONG', text: 'Dönem 31 günden uzun. Raporu en fazla 31 günlük (ör. bir aylık) seçin ya da günlük indirin: Meta\'da Döküm → Zaman → Gün, Google Ads\'te Gün sütunu.' }); return false;
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
      if (!['META', 'GOOGLE', 'TIKTOK', 'OTHER'].includes(platform)) errors.push({ line, code: 'INVALID_PLATFORM', text: 'Platform META, GOOGLE, TIKTOK veya OTHER olmalı.' });
      if (!row.resultType) errors.push({ line, code: 'INVALID_RESULT_TYPE', text: 'Sonuç türü MESAJ, ARAMA veya DIGER olmalı.' });
      validatePeriod(periodStart, periodEnd, line, errors); validateNumbers(row, line, errors); rows.push(row);
    });
    return { rows, errors, warnings };
  }
  // Meta Reklam Yöneticisi dışa aktarımının sütunları. Türkçe adlar kullanıcının
  // gerçek dosyasından (Kampanyalar, 1–31 Eki 2026); İngilizceler aynı raporun
  // İngilizce arayüzdeki adlarıdır. Burada olmayan sütun tahmin edilmez.
  const META_COLUMNS = {
    start: ['Rapor Başlangıcı', 'Reporting starts'],
    end: ['Rapor Sonu', 'Reporting ends'],
    day: ['Gün', 'Day'],
    campaign: ['Kampanya Adı', 'Campaign name'],
    delivery: ['Kampanya yayını', 'Campaign delivery'],
    results: ['Sonuçlar', 'Results'],
    indicator: ['Sonuç Göstergesi', 'Result indicator'],
    budget: ['Reklam Seti Bütçesi', 'Ad set budget'],
    budgetType: ['Reklam Seti Bütçe Türü', 'Ad set budget type'],
    impressions: ['Gösterim', 'Impressions'],
    reach: ['Erişim', 'Reach'],
    clicks: ['Bağlantı Tıklamaları', 'Link clicks']
  };
  const COLUMN_LABELS = { start: 'Rapor Başlangıcı', end: 'Rapor Sonu', campaign: 'Kampanya Adı', spend: 'Harcanan Tutar (TRY)' };
  // Türkçe büyük İ küçültülünce U+0307 bırakır; işaretler atılır (§6 Excel/CSV).
  const headerKey = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  const SPEND_HEADER = /^(harcanan tutar|amount spent) \(([a-z]{3})\)$/;
  const RESULT_LABELS = [
    ['messaging_conversation_started', 'Mesajlaşma başlatma'],
    ['click_to_call', 'Arama'],
    ['omni_landing_page_view', 'Açılış sayfası görüntüleme'],
    ['landing_page_view', 'Açılış sayfası görüntüleme'],
    ['profile_visit', 'Profil ziyareti'],
    ['link_click', 'Bağlantı tıklaması'],
    ['lead', 'Potansiyel müşteri'],
    ['reach', 'Erişim'],
    ['thruplay', 'Video izlenme'],
    ['post_engagement', 'Gönderi etkileşimi']
  ];
  function resultLabel(metric) {
    const value = String(metric || '').toLowerCase();
    if (!value) return null;
    const hit = RESULT_LABELS.find(([key]) => value.includes(key));
    return hit ? hit[1] : String(metric);
  }
  function resolveColumns(headers) {
    const byKey = new Map(headers.map(header => [headerKey(header), header]));
    const columns = {};
    Object.entries(META_COLUMNS).forEach(([field, names]) => {
      const hit = names.map(headerKey).find(key => byKey.has(key));
      columns[field] = hit ? byKey.get(hit) : null;
    });
    const spendHeader = headers.find(header => SPEND_HEADER.test(headerKey(header)));
    columns.spend = spendHeader || null;
    columns.currency = spendHeader ? headerKey(spendHeader).match(SPEND_HEADER)[2].toUpperCase() : null;
    return columns;
  }
  // Meta'nın kendi CSV'si virgülle ayrılır ve sayıyı makine biçiminde yazar
  // ("7230.03", "8.01555432"). Orada nokta her zaman ondalıktır: "12.500"
  // 12,5'tir, 12.500 değil. Dosya Excel-TR'de yeniden kaydedildiyse (noktalı
  // virgül) yorum ortak motora (`normalizeAmount`) kalır.
  function metaNumber(value, machine) {
    const raw = String(value ?? '').trim();
    if (raw === '') return null;
    if (machine && /^\d+(\.\d+)?$/.test(raw)) return Number(raw);
    const parsed = finance().normalizeAmount(raw);
    return parsed === null ? NaN : parsed;
  }
  function metaDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return finance().normalizeDate(raw) || raw;
  }
  const COUNT_FIELDS = ['impressions', 'reach', 'clicks', 'results'];
  const SUM_FIELDS = ['spend', 'impressions', 'clicks', 'results'];
  const addMeasured = (left, right) => left === null && right === null ? null : Math.round(((left || 0) + (right || 0)) * 100) / 100;
  function validateMetaNumbers(row, line, errors) {
    ['spend', ...COUNT_FIELDS].forEach(key => {
      const value = row[key];
      if (value === null) return;
      if (!Number.isFinite(value) || value < 0) errors.push({ line, code: 'INVALID_NUMBER', text: `${row.campaignName}: ${key} negatif ya da okunamadı.` });
      else if (key !== 'spend' && !Number.isInteger(value)) errors.push({ line, code: 'INVALID_NUMBER', text: `${row.campaignName}: ${key} tam sayı olmalı.` });
    });
  }
  function parseCsv(text, platform, fileName) {
    if (platform === 'GOOGLE') return parseGoogleCsv(text);
    if (platform === 'TIKTOK') return parseTikTokCsv(text, fileName);
    if (platform !== 'META') return { rows: [], errors: [{ line: 1, code: 'INVALID_PLATFORM', text: 'Yalnız META CSV destekleniyor.' }], warnings: [] };
    const source = String(text || '').replace(/^﻿/, '');
    const parsed = finance().parseCSV(source), errors = [], warnings = [];
    const machine = finance().detectDelimiter(source.split(/\r?\n/, 1)[0]) === ',';
    const columns = resolveColumns(parsed.headers);
    const missing = ['campaign', 'spend'].filter(field => !columns[field]);
    if (!columns.day && !(columns.start && columns.end)) missing.unshift('start', 'end');
    if (missing.length) return { rows: [], errors: [{ line: 1, code: 'INVALID_HEADER', text: `Meta dosyasında bulunamayan sütunlar: ${missing.map(field => COLUMN_LABELS[field]).join(', ')}. Reklam Yöneticisi → Kampanyalar → Dışa aktar → CSV ile indirin.` }], warnings };
    if (columns.currency !== 'TRY') return { rows: [], errors: [{ line: 1, code: 'CURRENCY_NOT_TRY', text: `Harcama ${columns.currency} cinsinden. Lexbnb reklam giderini TL olarak deftere yazar; reklam hesabının para birimi TRY olmalı.` }], warnings };

    const merged = new Map(), order = [], blankResults = [];
    let skippedBlank = 0, mergedCount = 0;
    parsed.rows.forEach((raw, index) => {
      const line = index + 2;
      const cell = field => columns[field] ? raw[columns[field]] : '';
      const campaignName = String(cell('campaign') || '').trim();
      if (!campaignName) { skippedBlank++; return; }
      const day = metaDate(cell('day'));
      const periodStart = day || metaDate(cell('start'));
      const periodEnd = day || metaDate(cell('end'));
      const metric = String(cell('indicator') || '').trim() || null;
      const type = resultType(metric);
      const budgetType = headerKey(cell('budgetType'));
      const budget = metaNumber(cell('budget'), machine);
      const row = {
        campaignId: null, campaignName, platform: 'META', periodStart, periodEnd,
        resultType: type, resultMetric: metric, resultLabel: resultLabel(metric),
        spend: metaNumber(cell('spend'), machine), impressions: metaNumber(cell('impressions'), machine),
        reach: metaNumber(cell('reach'), machine), clicks: metaNumber(cell('clicks'), machine),
        results: metaNumber(cell('results'), machine), messages: null, calls: null,
        dailyBudget: ['gunluk', 'daily'].includes(budgetType) && budget > 0 ? budget : null,
        delivery: String(cell('delivery') || '').trim() || null,
        source: 'CSV', line
      };
      if (!validatePeriod(periodStart, periodEnd, line, errors)) return;
      validateMetaNumbers(row, line, errors);
      const key = `${campaignName}|${periodStart}|${periodEnd}`;
      const previous = merged.get(key);
      if (!previous) { merged.set(key, row); order.push(key); return; }
      if (previous.resultMetric !== row.resultMetric) {
        errors.push({ line, code: 'DUPLICATE_CAMPAIGN_PERIOD', text: `${campaignName} aynı dönemde iki farklı sonuç göstergesiyle geliyor (${previous.resultLabel || '—'} / ${row.resultLabel || '—'}). Kampanya düzeyinde dışa aktarın.` });
        return;
      }
      // Reklam seti düzeyi dosya: aynı kampanyanın satırları toplanır. Erişim
      // tekil kişi sayısıdır, toplanamaz; birleşen satırda ölçülmedi sayılır.
      SUM_FIELDS.forEach(field => { previous[field] = addMeasured(previous[field], row[field]); });
      previous.reach = null;
      previous.dailyBudget = null;
      mergedCount++;
    });

    const rows = order.map(key => merged.get(key)).map(row => {
      if (row.resultType === 'MESSAGE') row.messages = row.results;
      if (row.resultType === 'CALL') row.calls = row.results;
      if (row.results === null && row.spend > 0) blankResults.push(row.campaignName);
      return row;
    });
    const byCampaign = new Map();
    rows.forEach(row => {
      const list = byCampaign.get(row.campaignName) || [];
      const clash = list.find(other => other.periodStart <= row.periodEnd && row.periodStart <= other.periodEnd);
      if (clash) errors.push({ line: row.line, code: 'PERIOD_OVERLAP_IN_FILE', text: `${row.campaignName}: ${clash.periodStart}–${clash.periodEnd} ile ${row.periodStart}–${row.periodEnd} çakışıyor. Dosyada aynı gün iki kez olamaz.` });
      list.push(row); byCampaign.set(row.campaignName, list);
    });
    if (skippedBlank) warnings.push({ code: 'BLANK_CAMPAIGN_SKIPPED', text: `Kampanya adı boş ${skippedBlank} satır atlandı (toplam satırı olabilir).` });
    if (mergedCount) warnings.push({ code: 'ROWS_MERGED', text: `Aynı kampanya ve dönemdeki ${mergedCount} satır toplandı; birleşen kampanyalarda erişim tekil kişi olduğu için toplanmadı.` });
    if (blankResults.length) warnings.push({ code: 'RESULTS_BLANK', text: `Harcaması olup sonuç hücresi boş: ${[...new Set(blankResults)].join(', ')}. Sonuç ölçülmedi sayıldı, 0 yazılmadı.` });
    if (!columns.clicks) warnings.push({ code: 'CLICKS_COLUMN_MISSING', text: 'Dosyada "Bağlantı Tıklamaları" sütunu yok; tıklama, CTR ve tıklama maliyeti ölçülmedi olarak kalır. Meta\'da Sütunlar → Özelleştir ile ekleyebilirsiniz.' });
    return { rows, errors, warnings };
  }
  // Google Ads "Kampanyalar" raporu (Raporlar ya da kampanya tablosu → İndir → CSV).
  // Dosya 1-2 satir baslikla (rapor adi, tarih araligi) baslar, sonra sutun satiri gelir;
  // sonda "Toplam"/"Total" satirlari olur. Turkce ve Ingilizce arayuz adlari kabul edilir.
  // Burada olmayan sutun tahmin edilmez: mesaj sonucu yoktur, arama sutunu varsa sonuc aramadir.
  const GOOGLE_COLUMNS = {
    campaign: ['Kampanya', 'Campaign'],
    day: ['Gün', 'Day', 'Tarih', 'Date'],
    cost: ['Maliyet', 'Cost'],
    impressions: ['Gösterim', 'Gösterimler', 'Göst.', 'Impr.', 'Impressions'],
    clicks: ['Tıklama', 'Tıklamalar', 'Clicks'],
    conversions: ['Dönüşümler', 'Dönüşüm', 'Conversions'],
    calls: ['Telefon aramaları', 'Aramalar', 'Phone calls', 'Calls'],
    currency: ['Para birimi kodu', 'Para birimi', 'Currency code', 'Currency']
  };
  const GOOGLE_MONTHS = { ocak: 1, subat: 2, mart: 3, nisan: 4, mayis: 5, haziran: 6, temmuz: 7, agustos: 8, eylul: 9, ekim: 10, kasim: 11, aralik: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, oca: 1, sub: 2, nis: 4, haz: 6, tem: 7, agu: 8, eyl: 9, eki: 10, kas: 11, ara: 12 };
  const pad2 = n => String(n).padStart(2, '0');
  // "1 Kasım 2026", "November 1, 2026", "Nov 1, 2026", "2026-11-01", "01.11.2026"
  function googleDate(raw) {
    const text = headerKey(raw).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
    if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    m = /^(\d{1,2}) ([a-z]+) (\d{4})$/.exec(text);
    if (m && GOOGLE_MONTHS[m[2]]) return `${m[3]}-${pad2(GOOGLE_MONTHS[m[2]])}-${pad2(m[1])}`;
    m = /^([a-z]+) (\d{1,2}) (\d{4})$/.exec(text);
    if (m && GOOGLE_MONTHS[m[1]]) return `${m[3]}-${pad2(GOOGLE_MONTHS[m[1]])}-${pad2(m[2])}`;
    return null;
  }
  function googleRange(line) {
    const parts = String(line || '').replace(/^"|"$/g, '').split(/\s+[-–]\s+/);
    if (parts.length !== 2) return null;
    const start = googleDate(parts[0]), end = googleDate(parts[1]);
    return start && end ? { start, end } : null;
  }
  // Google sayiyi arayuz diliyle yazar: "1,234.56" ya da "1.234,56"; bos hucre "--".
  // Tek ayirac ve ardindan tam 3 rakamli gruplar binliktir; aksi ondalik.
  function googleNumber(value) {
    let raw = String(value ?? '').trim().replace(/[^\d.,-]/g, '');
    if (raw === '' || raw === '-' || /^-+$/.test(raw)) return null;
    const lastDot = raw.lastIndexOf('.'), lastComma = raw.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? '.' : ',';
      raw = raw.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else if (lastDot >= 0 || lastComma >= 0) {
      const sep = lastDot >= 0 ? '.' : ',';
      raw = new RegExp(`^-?\\d{1,3}(\\${sep}\\d{3})+$`).test(raw) ? raw.split(sep).join('') : raw.replace(sep, '.');
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }
  // TikTok Reklam Yoneticisi kampanya raporu (Kampanyalar → Dışa aktar ya da Analiz → Özel rapor,
  // CSV). Resmi yardim sayfalari disa aktarim sutunlarini birebir listelemiyor; bu yuzden
  // arayuzde gorulen Ingilizce ve Turkce adlarin hepsi kabul edilir ("Cost"/"Spend",
  // "Clicks (destination)"/"Clicks"). Tarih: "Date"/"By Day" sutunu, ust satirdaki aralik ya da
  // dosya adindaki "2026-10-01 to 2026-10-31". Sonuc "Results"/"Conversions" (OTHER).
  const TIKTOK_COLUMNS = {
    campaign: ['Campaign name', 'Campaign Name', 'Kampanya adı', 'Kampanya Adı'],
    day: ['Date', 'By Day', 'Day', 'Stat time', 'Tarih', 'Gün'],
    cost: ['Cost', 'Spend', 'Total cost', 'Maliyet', 'Harcama', 'Toplam maliyet'],
    impressions: ['Impressions', 'Gösterimler', 'Gösterim'],
    clicks: ['Clicks (destination)', 'Clicks (Destination)', 'Clicks', 'Clicks (all)', 'Tıklamalar (hedef)', 'Tıklama (hedef)', 'Tıklamalar', 'Tıklama'],
    conversions: ['Results', 'Conversions', 'Sonuçlar', 'Dönüşümler'],
    calls: [],
    currency: ['Currency', 'Para birimi', 'Para birimi kodu']
  };
  const REPORTS = {
    GOOGLE: { platform: 'GOOGLE', columns: null, name: 'Google Ads', headerHelp: 'Google Ads dosyasında "Kampanya" ve "Maliyet" sütunları bulunamadı. Google Ads → Kampanyalar → İndir → CSV ile indirin.',
      periodHelp: 'Dosyada tarih aralığı yok. Google Ads\'te raporu tarih aralığı seçili olarak indirin ya da "Gün" sütununu ekleyin.', resultLabel: 'Dönüşüm' },
    TIKTOK: { platform: 'TIKTOK', columns: null, name: 'TikTok', headerHelp: 'TikTok dosyasında "Kampanya adı" ve "Maliyet" sütunları bulunamadı. TikTok Reklam Yöneticisi → Kampanyalar → Dışa aktar → CSV ile indirin.',
      periodHelp: 'Dosyada tarih bulunamadı. TikTok\'ta raporu "Gün" kırılımıyla indirin ya da dosya adını değiştirmeden yükleyin (tarih aralığı adında yazar).', resultLabel: 'Sonuç' }
  };
  // Dosya adindaki aralik: "Campaign Report(2026-10-01 to 2026-10-31).csv", "..._20261001-20261031.csv"
  function fileNameRange(name) {
    const text = String(name || '');
    let m = /(\d{4}-\d{2}-\d{2})\s*(?:to|-|~|_|–)\s*(\d{4}-\d{2}-\d{2})/i.exec(text);
    if (m) return { start: m[1], end: m[2] };
    m = /(\d{4})(\d{2})(\d{2})\s*[-_~]\s*(\d{4})(\d{2})(\d{2})/.exec(text);
    return m ? { start: `${m[1]}-${m[2]}-${m[3]}`, end: `${m[4]}-${m[5]}-${m[6]}` } : null;
  }
  function parseGoogleCsv(text) { return parseTableReport(text, REPORTS.GOOGLE, GOOGLE_COLUMNS); }
  function parseTikTokCsv(text, fileName) { return parseTableReport(text, REPORTS.TIKTOK, TIKTOK_COLUMNS, fileName); }
  function parseTableReport(text, cfg, COLUMNS, fileName) {
    const errors = [], warnings = [];
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const keysOf = line => finance().parseCSV(line).headers.map(headerKey);
    const has = (keys, names) => names.some(name => keys.includes(headerKey(name)));
    const headerIndex = lines.slice(0, 8).findIndex(line => { const keys = keysOf(line); return has(keys, COLUMNS.campaign) && has(keys, COLUMNS.cost); });
    if (headerIndex < 0) return { rows: [], errors: [{ line: 1, code: 'INVALID_HEADER', text: cfg.headerHelp }], warnings };
    const range = lines.slice(0, headerIndex).map(googleRange).find(Boolean) || fileNameRange(fileName) || null;
    const parsed = finance().parseCSV(lines.slice(headerIndex).join('\n'));
    const byKey = new Map(parsed.headers.map(header => [headerKey(header), header]));
    const col = field => { const hit = COLUMNS[field].map(headerKey).find(key => byKey.has(key)); return hit ? byKey.get(hit) : null; };
    const columns = Object.fromEntries(Object.keys(COLUMNS).map(field => [field, col(field)]));
    if (!columns.day && !range) return { rows: [], errors: [{ line: 1, code: 'PERIOD_MISSING', text: cfg.periodHelp }], warnings };
    const merged = new Map(), order = [];
    let currencies = new Set(), skipped = 0;
    parsed.rows.forEach((raw, index) => {
      const line = headerIndex + index + 2;
      const campaignName = String(raw[columns.campaign] || '').trim();
      const firstCell = String(Object.values(raw)[0] || '').trim();
      if (!campaignName || campaignName === '--' || /^(toplam|total)\b/i.test(campaignName) || /^(toplam|total)\b/i.test(firstCell)) { skipped++; return; }
      if (columns.currency && raw[columns.currency]) currencies.add(String(raw[columns.currency]).trim().toUpperCase());
      const day = columns.day ? googleDate(raw[columns.day]) : null;
      const periodStart = day || (range && range.start), periodEnd = day || (range && range.end);
      const calls = columns.calls ? googleNumber(raw[columns.calls]) : null;
      const conversions = columns.conversions ? googleNumber(raw[columns.conversions]) : null;
      const isCall = !!columns.calls;
      const row = {
        campaignId: null, campaignName, platform: cfg.platform, periodStart, periodEnd,
        resultType: isCall ? 'CALL' : 'OTHER', resultMetric: isCall ? 'phone_calls' : (columns.conversions ? 'conversions' : null),
        resultLabel: isCall ? 'Arama' : (columns.conversions ? cfg.resultLabel : null),
        spend: googleNumber(raw[columns.cost]), impressions: columns.impressions ? googleNumber(raw[columns.impressions]) : null,
        reach: null, clicks: columns.clicks ? googleNumber(raw[columns.clicks]) : null,
        results: isCall ? calls : conversions, messages: null, calls: isCall ? calls : null,
        dailyBudget: null, delivery: null, source: 'CSV', line
      };
      if (!validatePeriod(periodStart, periodEnd, line, errors)) return;
      ['spend', 'impressions', 'clicks'].forEach(key => {
        if (row[key] !== null && (!Number.isFinite(row[key]) || row[key] < 0)) errors.push({ line, code: 'INVALID_NUMBER', text: `${campaignName}: ${key} negatif ya da okunamadı.` });
      });
      const key = `${campaignName}|${periodStart}|${periodEnd}`;
      const previous = merged.get(key);
      if (!previous) { merged.set(key, row); order.push(key); return; }
      ['spend', 'impressions', 'clicks', 'results', 'calls'].forEach(field => { previous[field] = addMeasured(previous[field], row[field]); });
    });
    const foreign = [...currencies].filter(code => code !== 'TRY');
    if (foreign.length) return { rows: [], errors: [{ line: 1, code: 'CURRENCY_NOT_TRY', text: `Maliyet ${foreign.join(', ')} cinsinden. Lexbnb reklam giderini TL olarak deftere yazar; ${cfg.name} hesabının para birimi TRY olmalı.` }], warnings };
    if (!columns.currency) warnings.push({ code: 'CURRENCY_ASSUMED', text: 'Dosyada para birimi sütunu yok; maliyet TL kabul edildi. Hesabınız TL değilse kaydetmeyin.' });
    if (skipped) warnings.push({ code: 'TOTAL_ROWS_SKIPPED', text: `Toplam ve boş ${skipped} satır atlandı.` });
    if (cfg.platform === 'GOOGLE' && !columns.calls) warnings.push({ code: 'GOOGLE_NO_CALLS', text: columns.conversions ? 'Telefon araması sütunu yok; sonuç olarak dönüşümler alındı.' : 'Arama ve dönüşüm sütunu yok; sonuç ölçülmedi.' });
    if (cfg.platform !== 'GOOGLE' && !columns.conversions) warnings.push({ code: 'RESULTS_COLUMN_MISSING', text: 'Sonuç sütunu yok; sonuç ölçülmedi sayıldı.' });
    return { rows: order.map(key => merged.get(key)), errors, warnings };
  }
  // Dosyanin hangi platformdan geldigi basliktan anlasilir; kullaniciya sorulmaz.
  function detectPlatform(text) {
    const head = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).slice(0, 8);
    const keys = head.map(line => finance().parseCSV(line).headers.map(headerKey));
    if (keys.some(k => k.some(key => SPEND_HEADER.test(key)))) return 'META';
    const any = (k, names) => names.map(headerKey).some(c => k.includes(c));
    if (keys.some(k => any(k, TIKTOK_COLUMNS.campaign) && any(k, TIKTOK_COLUMNS.cost))) return 'TIKTOK';
    if (keys.some(k => any(k, GOOGLE_COLUMNS.campaign) && any(k, GOOGLE_COLUMNS.cost))) return 'GOOGLE';
    return null;
  }
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, ' ').trim();
  function matchCampaigns(rows, campaigns) {
    return (rows || []).map(row => {
      const exact = (campaigns || []).find(item => item.name === row.campaignName && item.platform === row.platform);
      const normalized = exact || (campaigns || []).find(item => normalize(item.name) === normalize(row.campaignName) && item.platform === row.platform);
      return { ...row, campaignId: normalized?.id || null, matchedBy: exact ? 'EXACT' : normalized ? 'NORMALIZED' : null };
    });
  }
  // phase113: Meta'nın günlük dökümü kampanya × takvim ayı başına TEK döneme
  // toplanır, günlük kırılım `daily` dizisinde durur (d, s, i, c, r). 6 kampanyalı
  // bir ay 186 yerine 6 dönem + 6 gider satırı olur. Aynı ayda zaten kayıtlı
  // günlük veri (ay ortası yüklemesi) yeni dosyayla birleşir: dosyadaki gün eskisinin
  // yerine geçer, dosyada olmayan gün korunur. Toplamlar hep günlerden yeniden
  // hesaplanır; grafik ile Finans aynı sayıyı söyler.
  const cents = value => Math.round(value * 100) / 100;
  const dayFromPeriod = period => ({
    d: period.period_start, s: cents(Number(period.spend) || 0),
    i: period.impressions ?? null, c: period.clicks ?? null, r: period.results ?? null
  });
  function existingDays(period) {
    if (Array.isArray(period.daily_metrics)) return period.daily_metrics;
    // phase113 öncesi günlük içe aktarım: tek günlük dönem, kendisi bir gündür.
    if (period.period_start && period.period_start === period.period_end) return [dayFromPeriod(period)];
    return null;
  }
  function compactDaily(rows, existingPeriods = []) {
    const out = [], errors = [], warnings = [], groups = new Map();
    (rows || []).forEach(row => {
      if (row.periodStart !== row.periodEnd) { out.push(row); return; }
      const key = `${row.campaignId || ''}|${row.campaignName}|${row.platform}|${row.periodStart.slice(0, 7)}`;
      if (!groups.has(key)) { groups.set(key, []); out.push(key); }
      groups.get(key).push(row);
    });
    let keptDays = 0;
    const result = out.map(item => {
      if (typeof item !== 'string') return item;
      const days = groups.get(item), first = days[0], month = first.periodStart.slice(0, 7);
      if (days.some(day => day.resultMetric !== first.resultMetric)) {
        errors.push({ line: first.line, code: 'DAILY_RESULT_MIXED', text: `${first.campaignName} (${month}): günler farklı sonuç göstergesiyle geliyor. Kampanyanın hedefi ay içinde değiştiyse ayları ayrı yükleyin.` });
        return null;
      }
      const byDay = new Map();
      if (first.campaignId) {
        (existingPeriods || []).filter(period => period.campaign_id === first.campaignId
          && String(period.period_start).slice(0, 7) === month && String(period.period_end).slice(0, 7) === month)
          .forEach(period => (existingDays(period) || []).forEach(day => { byDay.set(day.d, day); }));
      }
      const before = byDay.size;
      days.forEach(day => byDay.set(day.periodStart, {
        d: day.periodStart, s: cents(day.spend || 0), i: day.impressions ?? null, c: day.clicks ?? null, r: day.results ?? null
      }));
      const fileDays = new Set(days.map(day => day.periodStart));
      const kept = [...byDay.keys()].filter(d => !fileDays.has(d)).length;
      keptDays += kept;
      const daily = [...byDay.values()].sort((a, b) => a.d.localeCompare(b.d));
      const sum = field => daily.reduce((total, day) => addMeasured(total, day[field]), null);
      const results = sum('r');
      return {
        ...first,
        periodStart: daily[0].d, periodEnd: daily[daily.length - 1].d,
        spend: cents(daily.reduce((total, day) => total + day.s, 0)),
        impressions: sum('i'), clicks: sum('c'), results,
        // Günlük erişimler toplanamaz (aynı kişi iki gün sayılır); tek gün dışında ölçülmedi.
        reach: daily.length === 1 && before === 0 ? first.reach : null,
        messages: first.resultType === 'MESSAGE' ? results : null,
        calls: first.resultType === 'CALL' ? results : null,
        dailyBudget: days.find(day => day.dailyBudget)?.dailyBudget || null,
        // Ek metrikler gün gün tutulmaz; korunan eski günlerle birleşen toplamı bilinmez.
        extraMetrics: kept ? null : first.extraMetrics,
        daily, keptDays: kept
      };
    }).filter(Boolean);
    if (keptDays) warnings.push({ code: 'DAILY_MERGED_WITH_EXISTING', text: `Bu ayın daha önce yüklenmiş ${keptDays} günü korunup dosyayla birleştirildi; dosyadaki günler eskisinin yerine geçti.` });
    return { rows: result, errors, warnings };
  }

  // Aşama 3: içe aktarma planı — saf; ekran her değişiklikte yeniden hesaplar.
  // Dosyadaki her kampanya adı mevcut bir kampanyaya eşlenir ya da yeni açılır
  // (kullanıcı kararı 05.11.2026). Sunucunun reddedeceği durumlar (kısmi kapsama,
  // kapanmış ay, iki adın aynı kampanyaya eşlenmesi) burada önceden söylenir;
  // sunucu yine hakemdir.
  const NEW_CAMPAIGN = '__new__';
  const eachDay = (start, end, fn) => {
    for (let t = Date.parse(start + 'T00:00:00Z'), last = Date.parse(end + 'T00:00:00Z'); t <= last; t += 86400000) fn(new Date(t).toISOString().slice(0, 10));
  };
  function planImport({ rows = [], campaigns = [], mapping = {}, existingPeriods = [], closedMonths = [] } = {}) {
    const errors = [], names = [];
    matchCampaigns(rows, campaigns).forEach(row => {
      const key = `${row.platform}|${row.campaignName}`;
      const entry = names.find(item => item.key === key);
      if (entry) { if (!entry.dailyBudget && row.dailyBudget) entry.dailyBudget = row.dailyBudget; return; }
      names.push({ key, name: row.campaignName, platform: row.platform, autoId: row.campaignId, matchedBy: row.matchedBy, dailyBudget: row.dailyBudget || null });
    });
    names.forEach((entry, index) => {
      const chosen = mapping[entry.key];
      const valid = chosen && chosen !== NEW_CAMPAIGN && campaigns.some(item => String(item.id) === String(chosen) && item.platform === entry.platform);
      entry.choice = chosen === NEW_CAMPAIGN ? NEW_CAMPAIGN : valid ? String(chosen) : (entry.autoId ? String(entry.autoId) : NEW_CAMPAIGN);
      entry.newKey = `n${index}`;
    });
    const owners = new Map();
    names.filter(entry => entry.choice !== NEW_CAMPAIGN).forEach(entry => {
      if (owners.has(entry.choice)) errors.push({ code: 'DUPLICATE_MAPPING', text: `"${owners.get(entry.choice)}" ve "${entry.name}" aynı kampanyaya eşlendi. Her dosya kampanyası ayrı bir kampanyaya gitmeli.` });
      else owners.set(entry.choice, entry.name);
    });
    const assigned = rows.map(row => {
      const entry = names.find(item => item.key === `${row.platform}|${row.campaignName}`);
      const isNew = entry.choice === NEW_CAMPAIGN;
      return { ...row, campaignId: isNew ? null : entry.choice, campaignKey: isNew ? entry.newKey : null };
    });
    const compact = compactDaily(assigned, existingPeriods);
    errors.push(...compact.errors);

    // Kayıtlı dönemler: dosya tümünü kapsıyorsa değişir, kısmen kapsıyorsa sunucu durdurur.
    const covered = new Map();
    compact.rows.filter(row => row.campaignId).forEach(row => {
      const set = covered.get(row.campaignId) || new Set();
      eachDay(row.periodStart, row.periodEnd, day => set.add(day));
      covered.set(row.campaignId, set);
    });
    const replaced = [], touchedMonths = new Set();
    (existingPeriods || []).forEach(period => {
      const set = covered.get(period.campaign_id);
      if (!set) return;
      let hit = false, miss = false;
      eachDay(period.period_start, period.period_end, day => { if (set.has(day)) hit = true; else miss = true; });
      if (!hit) return;
      if (miss) {
        const entry = names.find(item => item.choice === String(period.campaign_id));
        errors.push({ code: 'PARTIAL_OVERLAP', text: `${entry ? entry.name : 'Kampanya'}: kayıtlı ${period.period_start} – ${period.period_end} dönemi dosyada tam karşılanmıyor. Meta'dan bu dönemin tamamını kapsayan dosya indirin ya da Kayıtlar'dan eski dönemi silin.` });
        return;
      }
      replaced.push(period);
      eachDay(period.period_start, period.period_end, day => touchedMonths.add(day.slice(0, 7)));
    });
    compact.rows.forEach(row => eachDay(row.periodStart, row.periodEnd, day => touchedMonths.add(day.slice(0, 7))));
    const closed = [...touchedMonths].filter(month => (closedMonths || []).includes(month)).sort();
    if (closed.length) errors.push({ code: 'CLOSED_MONTH', text: `${closed.join(', ')} kapatılmış: reklam gideri o aya yazılamaz. Ayı yeniden açın ya da dosyadan o günleri çıkarın.` });

    const days = new Set();
    compact.rows.forEach(row => eachDay(row.periodStart, row.periodEnd, day => days.add(day)));
    const sorted = [...days].sort();
    const spend = compact.rows.reduce((total, row) => total + (row.spend || 0), 0);
    return {
      names, rows: compact.rows, errors, warnings: compact.warnings,
      newCampaigns: names.filter(entry => entry.choice === NEW_CAMPAIGN)
        .map(entry => ({ key: entry.newKey, name: entry.name, platform: entry.platform, budget: entry.dailyBudget })),
      summary: {
        rangeStart: sorted[0] || null, rangeEnd: sorted[sorted.length - 1] || null, dayCount: days.size,
        campaignCount: names.length, newCampaignCount: names.filter(entry => entry.choice === NEW_CAMPAIGN).length,
        fileRowCount: rows.length, periodCount: compact.rows.length, replacedCount: replaced.length,
        totalSpend: Math.round(spend * 100) / 100
      }
    };
  }

  return { FORMAT_SPEC, META_COLUMNS, GOOGLE_COLUMNS, TIKTOK_COLUMNS, fileNameRange, NEW_CAMPAIGN, parsePasted, parseCsv, detectPlatform, matchCampaigns, compactDaily, planImport, resultType, resultLabel };
});
