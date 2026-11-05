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
      errors.push({ line, code: 'PERIOD_TOO_LONG', text: 'Dönem 31 günden uzun. Meta\'da tarih aralığını en fazla 31 gün seçin ya da Döküm → Zaman → Gün ile günlük indirin.' }); return false;
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
  function parseCsv(text, platform) {
    if (platform === 'GOOGLE') return { rows: [], errors: [{ line: 1, code: 'GOOGLE_SAMPLE_REQUIRED', text: 'Google Ads Kampanyalar raporu örneği bekleniyor.' }], warnings: [] };
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

  return { FORMAT_SPEC, META_COLUMNS, NEW_CAMPAIGN, parsePasted, parseCsv, matchCampaigns, compactDaily, planImport, resultType, resultLabel };
});
