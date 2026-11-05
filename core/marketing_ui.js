// =============================================================================
// LEXBNB PHASE 17 — MARKETING WORKSPACE UI ADAPTER
// Keeps the large legacy app.js untouched and renders only evidence-backed data.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      MarketingEngine: require('./marketing_engine'),
      MarketingFunnelService: require('./marketing_funnel_service'),
      MarketingPriorityService: require('./marketing_priority_service'),
      LexbnbBusinessDate: require('./business_date'),
      LexbnbGuestCrm: require('./guest_crm_engine'),
      MarketingBenchmarkService: require('./marketing_benchmark_service'),
      MarketingCoverChangeService: require('./marketing_cover_change_service'),
      MarketingHealthResultsService: require('./marketing_health_results_service'),
      AdsMetricsEngine: require('./ads_metrics_engine'),
      AdsImportParser: require('./ads_import_parser'),
      AdsPeriodService: require('./ads_period_service')
    });
  } else {
    root.LexBnBMarketingUI = factory(root);
  }
}(typeof self !== 'undefined' ? self : this, function (services) {
  'use strict';

  const state = {
    view: 'economics',
    snapshotFormOpen: false,
    listingFormOpen: false,
    listingPropertyId: null,
    experimentFormOpen: false,
    benchmarkFormOpen: false,
    listings: [],
    snapshots: [],
    findings: [],
    media: [],
    placements: [],
    benchmarks: [],
    analysisRuns: [],
    experiments: [],
    healthSnapshots: [],
    adsView: 'overview',
    adsImport: null,
    adsImportResult: null,
    adPeriods: [],
    adPeriodsKey: null,
    adPeriodsStatus: 'IDLE',
    adPeriodsError: null,
    remoteScopeKey: null,
    remoteStatus: 'LOCAL',
    remoteErrors: []
  };

  const CHANNEL_LABELS = Object.freeze({
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking.com', VRBO: 'Vrbo', EXPEDIA: 'Expedia',
    // Kanal GRUBU: WhatsApp, telefon, web vb. burada tek satirda toplanir (L-105).
    DIRECT: 'Doğrudan (tüm direkt kanallar)', OTHER_OTA: 'Diğer OTA', UNKNOWN: 'Bilinmeyen'
  });
  const DIRECT_CHANNEL_LABELS = Object.freeze({
    WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', WEBSITE: 'Web sitesi', WEB: 'Web sitesi',
    PHONE: 'Telefon', TELEPHONE: 'Telefon', TELEFON: 'Telefon', DIRECT: 'Doğrudan', REPEAT: 'Tekrar misafir', REPEAT_GUEST: 'Tekrar misafir'
  });

  const BROWSER_DEPENDENCIES = Object.freeze([
    ['LexbnbBusinessDate', 'core/business_date.js?v=a1518391'],
    ['MarketingEngine', 'core/marketing_engine.js?v=2756f4ec'],
    ['MarketingFunnelService', 'core/marketing_funnel_service.js?v=a5ecbdaa'],
    ['MarketingPriorityService', 'core/marketing_priority_service.js?v=f6e216ff'],
    ['MarketingBenchmarkService', 'core/marketing_benchmark_service.js?v=05187d46'],
    ['MarketingCoverChangeService', 'core/marketing_cover_change_service.js?v=81211a39'],
    ['MarketingDataService', 'core/marketing_data_service.js?v=0c6b8c4f'],
    ['MarketingReviewService', 'core/marketing_review_service.js?v=9207dee5'],
    ['MarketingSnapshotService', 'core/marketing_snapshot_service.js?v=04136be1'],
    ['MarketingChannelListingService', 'core/marketing_channel_listing_service.js?v=515fe386'],
    ['MarketingExperimentService', 'core/marketing_experiment_service.js?v=4a2ffb14'],
    ['MarketingHealthResultsService', 'core/marketing_health_results_service.js?v=662edeea'],
    ['AdsMetricsEngine', 'core/ads_metrics_engine.js?v=d8dd5962'],
    ['AdsImportParser', 'core/ads_import_parser.js?v=ceff62b1'],
    ['AdsPeriodService', 'core/ads_period_service.js?v=1b4f5123']
  ]);
  let dependencyPromise = null;

  function loadBrowserScript(globalName, source) {
    if (services[globalName]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-marketing-dependency="${globalName}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`LOAD_FAILED: ${source}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.dataset.marketingDependency = globalName;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`LOAD_FAILED: ${source}`));
      document.head.appendChild(script);
    });
  }

  function ensureBrowserDependencies() {
    if (typeof document === 'undefined') return Promise.resolve();
    if (!dependencyPromise) {
      dependencyPromise = BROWSER_DEPENDENCIES.reduce(
        (chain, [globalName, source]) => chain.then(() => loadBrowserScript(globalName, source)),
        Promise.resolve()
      );
    }
    return dependencyPromise;
  }

  function addUtcDays(dateText, days) {
    if (!dateText) return null;
    const match = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return date.toISOString().slice(0, 10);
  }

  function periodFromFilter(filter = {}) {
    const period = String(filter.period || 'ALL');
    if (period === 'ALL') return { start: null, endExclusive: null, label: 'Tüm dönem' };
    if (period === 'CUSTOM') {
      return {
        start: filter.startDate || null,
        endExclusive: addUtcDays(filter.endDate, 1),
        label: filter.startDate && filter.endDate ? `${filter.startDate} – ${filter.endDate}` : 'Özel dönem'
      };
    }
    const yearMatch = period.match(/^(\d{4})-YEAR$/);
    if (yearMatch) {
      const year = Number(yearMatch[1]);
      return { start: `${year}-01-01`, endExclusive: `${year + 1}-01-01`, label: `${year}` };
    }
    const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const month = Number(monthMatch[2]);
      const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      // Musteriye ham anahtar ('2026-09') degil ay adi gosterilir (L-104).
      const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const label = month >= 1 && month <= 12 ? `${AYLAR[month - 1]} ${year}` : period;
      return { start: `${period}-01`, endExclusive: next, label };
    }
    return { start: null, endExclusive: null, label: period };
  }

  function scopeBookings(bookings, selectedProperty, villas = {}) {
    if (!selectedProperty || selectedProperty === 'ALL') return Array.isArray(bookings) ? bookings : [];
    const propertyId = villas[selectedProperty] && villas[selectedProperty].id;
    return (Array.isArray(bookings) ? bookings : []).filter(booking => {
      const bookingProperty = booking.propertyId ?? booking.property_id ?? booking.villa;
      return bookingProperty === selectedProperty || Boolean(propertyId && bookingProperty === propertyId);
    });
  }

  function buildWorkspaceModel(input = {}) {
    const engine = services.MarketingEngine;
    if (!engine || typeof engine.computeChannelEconomics !== 'function') {
      throw new Error('MARKETING_ENGINE_UNAVAILABLE');
    }
    const filter = input.filter || {};
    const period = periodFromFilter(filter);
    const selectedProperty = filter.villa || 'ALL';
    const bookings = scopeBookings(input.bookings, selectedProperty, input.villas);
    const economics = engine.computeChannelEconomics({
      bookings,
      periodStart: period.start,
      periodEndExclusive: period.endExclusive,
      baseCurrency: input.baseCurrency || 'TRY'
    });
    // Aylik toplu aktarim satiri gelir/gece tasir ama gercek bir rezervasyon
    // degildir. Kanal ekonomisi tutari korur, adet ve pay hesaplarinda saymaz.
    // Yalniz DONEMDE sayilmis ozetler dusulur (L-275): eskiden tum gecmisin
    // ozetleri her doneme dusuluyor, Dogrudan adedi 0'a iniyordu. Tanim tek
    // yerde: guest_crm_engine.isBulkSummaryBooking.
    const bulkSummaries = bookings.filter(item => services.LexbnbGuestCrm.isBulkSummaryBooking(item));
    const bulkEconomics = bulkSummaries.length ? engine.computeChannelEconomics({
      bookings: bulkSummaries,
      periodStart: period.start,
      periodEndExclusive: period.endExclusive,
      baseCurrency: input.baseCurrency || 'TRY'
    }) : null;
    if (bulkEconomics) {
      bulkEconomics.channels.forEach(bulk => {
        const row = economics.channels.find(entry => entry.channel === bulk.channel);
        if (row) row.reservationCount = Math.max(0, row.reservationCount - bulk.reservationCount);
      });
      economics.totals.reservationCount = Math.max(0, economics.totals.reservationCount - bulkEconomics.totals.reservationCount);
    }
    const direct = economics.channels.find(row => row.channel === 'DIRECT');
    economics.mix.directReservationSharePercent = economics.totals.reservationCount > 0
      ? Number((((direct && direct.reservationCount) || 0) / economics.totals.reservationCount * 100).toFixed(2)) : null;
    return {
      period,
      selectedProperty,
      properties: Object.entries(input.villas || {}).map(([slug, property]) => ({
        slug, id: property && property.id, name: property && property.name || slug
      })),
      economics,
      bulkSummaryCount: bulkEconomics ? bulkEconomics.totals.reservationCount : 0,
      financeSummary: input.financeSummary || null,
      listings: Array.isArray(input.listings) ? input.listings.filter(item => String(item.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED') : [],
      snapshots: Array.isArray(input.snapshots) ? input.snapshots : [],
      findings: Array.isArray(input.findings) ? input.findings : [],
      media: Array.isArray(input.media) ? input.media : [],
      placements: Array.isArray(input.placements) ? input.placements : [],
      benchmarks: Array.isArray(input.benchmarks) ? input.benchmarks : [],
      analysisRuns: Array.isArray(input.analysisRuns) ? input.analysisRuns : [],
      experiments: Array.isArray(input.experiments) ? input.experiments : [],
      healthSnapshots: Array.isArray(input.healthSnapshots) ? input.healthSnapshots : [],
      ads: buildAdsModel(input),
      remoteStatus: input.remoteStatus || 'LOCAL',
      remoteErrors: Array.isArray(input.remoteErrors) ? input.remoteErrors : []
    };
  }

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function money(value, currency = 'TRY') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  }

  function number(value, suffix = '') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
  }

  function emptyState(title, detail) {
    return `<div class="card" style="padding:24px;text-align:center;border:1px dashed rgba(148,163,184,.45)"><div style="font-weight:800;margin-bottom:6px">${escapeHtml(title)}</div><div class="sub-text">${escapeHtml(detail)}</div></div>`;
  }

  // Reklam tablosu ve kullanici tanimli metrikler (L-188, kullanici M18).
  // Her reklamci ayni metrigi izlemez: iki olculmus alani bolup/carparak kendi
  // sutununu tanimlar. Olculmemis ya da sifira bolunen deger "—"dir (3.6).
  const AD_METRIC_FIELDS = Object.freeze({
    spend: 'Harcama', impressions: 'Gösterim', clicks: 'Tıklama', messages: 'Mesaj', calls: 'Arama', days: 'Gün'
  });
  const MAX_CUSTOM_METRICS = 8;

  function adPeriodDays(row) {
    const start = Date.parse(String(row && row.periodStart || '') + 'T00:00:00Z');
    const end = Date.parse(String(row && row.periodEnd || '') + 'T00:00:00Z');
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.floor((end - start) / 86400000) + 1;
  }

  function adFieldValue(row, field) {
    if (field === 'days') return adPeriodDays(row);
    const value = row ? row[field] : null;
    return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  }

  function normalizeCustomMetrics(raw) {
    const list = Array.isArray(raw) ? raw : [];
    return list.map(item => ({
      id: String(item && item.id || '').slice(0, 40),
      name: String(item && item.name || '').trim().slice(0, 40),
      num: String(item && item.num || ''),
      op: item && item.op === '*' ? '*' : '/',
      den: String(item && item.den || ''),
      percent: !!(item && item.percent)
    })).filter(item => item.id && item.name && AD_METRIC_FIELDS[item.num] && AD_METRIC_FIELDS[item.den])
      .slice(0, MAX_CUSTOM_METRICS);
  }

  function evaluateCustomMetric(metric, row) {
    const a = adFieldValue(row, metric.num);
    const b = adFieldValue(row, metric.den);
    if (a === null || b === null) return null;
    if (metric.op === '/' && b === 0) return null;
    const value = metric.op === '*' ? a * b : a / b;
    return metric.percent ? value * 100 : value;
  }

  function formatCustomMetric(metric, value) {
    if (value === null || value === undefined) return '—';
    if (metric.percent) return number(Math.round(value * 100) / 100, '%');
    return metric.num === 'spend' || (metric.op === '*' && metric.den === 'spend') ? money(value) : number(Math.round(value * 100) / 100);
  }

  // Kampanya butcesi GUNLUK UST SINIRDIR (kullanici M18): her gun o kadar
  // harcamak zorunlu degil. Kayitli donemlerin ortalama gunluk harcamasi
  // sinirla karsilastirilir; sinir girilmemisse karsilastirma yapilmaz.
  function campaignBudgetView(campaign, periods) {
    const limit = Number(campaign && campaign.budget) > 0 ? Number(campaign.budget) : null;
    const own = (periods || []).filter(row => String(row.campaignId) === String(campaign && campaign.id) && row.spend != null);
    const days = own.reduce((sum, row) => sum + (adPeriodDays(row) || 0), 0);
    const spend = own.reduce((sum, row) => sum + Number(row.spend || 0), 0);
    const avgDaily = days > 0 ? spend / days : null;
    const usagePct = limit !== null && avgDaily !== null ? Math.round(avgDaily / limit * 1000) / 10 : null;
    return { limit, avgDaily, usagePct, days, spend, overLimit: usagePct !== null && usagePct > 100 };
  }

  function kpi(label, value, note) {
    return `<div class="card" style="padding:16px;min-width:170px;flex:1"><div class="sub-text" style="font-size:11px;text-transform:uppercase">${escapeHtml(label)}</div><div style="font-size:24px;font-weight:800;margin:5px 0">${escapeHtml(value)}</div><div class="sub-text" style="font-size:11px">${escapeHtml(note)}</div></div>`;
  }

  function renderMarketingHealth(model) {
    if (!services.MarketingHealthResultsService) return '';
    if (model.selectedProperty === 'ALL') {
      return `<div class="card" style="padding:14px;margin-bottom:12px"><strong>Pazarlama sağlığı</strong><div class="sub-text" style="margin-top:5px">Birleştirilmiş skor üretilmez. Sağlık snapshot’ını görmek için tek bir mülk seçin.</div></div>`;
    }
    const selected = model.properties.find(item => item.slug === model.selectedProperty);
    const view = services.MarketingHealthResultsService.buildHealthView({
      snapshots: model.healthSnapshots, propertyId: selected && selected.id
    });
    if (!view.available) {
      const detail = view.reason === 'INSUFFICIENT_DATA'
        ? `Raporlanabilir skor için veri kapsamı yetersiz (${number(view.coveragePercent, '%')}). Eksik veri puanla doldurulmadı.`
        : view.reason === 'NO_SNAPSHOT'
          ? 'Bu mülk için backend tarafından üretilmiş sağlık snapshot’ı henüz yok.'
          : 'Sağlık snapshot’ı doğrulanamadığı için skor gösterilmiyor.';
      const missing = Array.isArray(view.missingComponents) && view.missingComponents.length
        ? `<div class="sub-text" style="margin-top:6px">Eksik bileşenler: ${escapeHtml(view.missingComponents.map(item => item.key).join(', '))}</div>` : '';
      return `<div class="card" style="padding:14px;margin-bottom:12px"><strong>Pazarlama sağlığı hesaplanamadı</strong><div class="sub-text" style="margin-top:5px">${detail}</div>${missing}</div>`;
    }
    const tier = { HIGH: 'Yüksek', MEDIUM: 'Orta' }[view.confidenceTier] || view.confidenceTier;
    const missing = view.missingComponents.length
      ? `Eksik: ${view.missingComponents.map(item => item.key).join(', ')}` : 'Tüm bileşenler mevcut';
    return `<div class="card" style="padding:14px;margin-bottom:12px"><div style="display:flex;gap:10px;flex-wrap:wrap">${kpi('Pazarlama sağlık skoru', number(view.score, '/100'), 'Değişmez backend snapshot’ı')}${kpi('Veri kapsamı', number(view.coveragePercent, '%'), 'Eksik veri puanlanmadı')}${kpi('Güven', `${escapeHtml(tier)} · ${number(view.confidenceIndex * 100, '%')}`, 'İstatistiksel kesinlik değildir')}</div><div class="sub-text" style="margin-top:8px">${escapeHtml(missing)} · Ölçüm zamanı: ${escapeHtml(view.asOf || 'belirtilmedi')} · Sürüm: ${escapeHtml(view.scoringVersion || 'belirtilmedi')}</div></div>`;
  }

  function renderEconomics(model) {
    const report = model.economics;
    const totals = report.totals;
    const rows = report.channels.map(row => {
      const share = totals.roomRevenueBeforeDistribution > 0
        ? (row.roomRevenueBeforeDistribution / totals.roomRevenueBeforeDistribution) * 100 : null;
      return `<tr>
      <td><strong>${escapeHtml(CHANNEL_LABELS[row.channel] || row.channel)}</strong>${row.rawChannels && row.rawChannels.length && row.channel === 'DIRECT' ? `<div class="sub-text">${escapeHtml(row.rawChannels.map(raw => DIRECT_CHANNEL_LABELS[String(raw).trim().toUpperCase()] || 'Doğrudan').join(', '))}</div>` : ''}${row.channel === 'UNKNOWN' ? '<div class="sub-text">Eşleme gerekli</div>' : ''}</td>
      <td>${number(row.reservationCount)}</td><td>${number(row.bookedNights)}</td>
      <td>${money(row.roomRevenueBeforeDistribution, report.currency)}</td>
      <td>${money(row.distributionCost, report.currency)}</td>
      <td>${money(row.roomRevenueAfterDistribution, report.currency)}</td>
      <td>${number(share, '%')}</td>
    </tr>`;
    }).join('');
    const unknown = report.dataQuality.unknownRawChannels;
    const warnings = [];
    if (unknown.length) warnings.push(`Eşlenmemiş kanal: ${unknown.join(', ')}`);
    if (report.dataQuality.assumedCurrencyReservationCount) warnings.push(`${report.dataQuality.assumedCurrencyReservationCount} rezervasyonda para birimi TRY varsayıldı.`);
    warnings.push('Kanal bazlı müsait gece verilmediği için RevPAR gösterilmiyor.');

    const profitCard = model.financeSummary && Number.isFinite(Number(model.financeSummary.netProfit))
      ? kpi('Net kâr', money(model.financeSummary.netProfit, report.currency), 'Finans defteriyle aynı hesap') : '';
    const bulkNote = model.bulkSummaryCount ? `<div class="card" style="padding:12px;margin-bottom:12px">${number(model.bulkSummaryCount)} toplu aktarım özeti gelir ve geceye dahil, rezervasyon adedine dahil değildir.</div>` : '';
    return `${renderMarketingHealth(model)}${renderBenchmarkPanel(model)}${bulkNote}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpi('Oda geliri', money(totals.roomRevenueBeforeDistribution, report.currency), 'Temizlik hariç, komisyon öncesi')}
      ${kpi('Dağıtım maliyeti', money(totals.distributionCost, report.currency), 'Yalnızca kaydedilmiş komisyon')}
      ${kpi('Size kalan net (komisyon sonrası)', money(totals.roomRevenueAfterDistribution, report.currency), 'Konaklama cirosu eksi dağıtım maliyeti')}
      ${kpi('Net ADR', money(totals.netRoomAdr, report.currency), `${number(totals.bookedNights)} satılmış gece`)}
      ${kpi('Doğrudan rezervasyon', number(report.mix.directReservationSharePercent, '%'), 'Rezervasyon adedi payı')}
      ${profitCard}
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table class="mkt-channel-table" style="width:100%;border-collapse:collapse;min-width:780px"><thead><tr>
        <th>Kanal</th><th>Rezervasyon</th><th>Gece</th><th>Konaklama cirosu</th><th>Komisyon</th><th>Size kalan net</th><th>Pay</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="7" style="padding:24px;text-align:center">Bu dönemde rezervasyon yok.</td></tr>'}</tbody></table>
    </div>
    <div class="card" style="padding:14px;margin-top:12px"><strong>Veri notları</strong><ul style="margin:8px 0 0;padding-left:20px">${warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
  }

  function renderBenchmarkPanel(model) {
    const selected = model.selectedProperty === 'ALL' ? null : model.properties.find(item => item.slug === model.selectedProperty);
    const propertyId = selected && selected.id;
    const current = selectCurrentBenchmark(model.benchmarks, propertyId, services.LexbnbBusinessDate.getBusinessDate());
    const button = `<button type="button" class="btn btn-secondary btn-sm" data-marketing-open-benchmark${propertyId ? '' : ' disabled'}>＋ Referans ekle</button>`;
    const form = state.benchmarkFormOpen ? renderBenchmarkForm(model) : '';
    if (!current) return `<div class="card" style="padding:14px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>Pazarlama referansı yok</strong><div class="sub-text">Karşılaştırma bulguları, kaynağı ve geçerlilik tarihi belirtilmiş bir referans olmadan üretilmez.</div></div>${button}</div>${form}</div>`;
    const values = [
      ['CTR', current.searchToViewCtrPercent ?? current.search_to_view_ctr_percent, '%'],
      ['Dönüşüm', current.viewToBookingConversionPercent ?? current.view_to_booking_conversion_percent, '%'],
      ['Gösterim / ilan-gün', current.normalizedImpressionsPerListingDay ?? current.normalized_impressions_per_listing_day, ''],
      ['Aktif medya', current.recommendedActiveMediaCount ?? current.recommended_active_media_count, ''],
      ['Azami dağıtım maliyeti', current.maxDistributionCostPercent ?? current.max_distribution_cost_percent, '%'],
      ['Asgari direkt pay', current.minimumDirectReservationSharePercent ?? current.minimum_direct_reservation_share_percent, '%']
    ].filter(([, value]) => value !== null && value !== undefined).map(([label, value, suffix]) => `${label}: ${number(value, suffix)}`).join(' · ');
    return `<div class="card" style="padding:14px;margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><strong>Geçerli pazarlama referansı</strong><div class="sub-text">${escapeHtml(current.sourceKind || current.source_kind || 'Kaynak belirtilmedi')} · ${escapeHtml(current.effectiveFrom || current.effective_from || 'Tarih yok')} · güven ${number(Number(current.confidence) * 100, '%')}</div><div style="margin-top:7px;font-size:12px">${escapeHtml(values || 'Sayısal değer yok')}</div></div>${button}</div>${form}</div>`;
  }

  function selectCurrentBenchmark(benchmarks = [], propertyId, asOfDate) {
    return benchmarks.filter(item => (!propertyId || (item.propertyId || item.property_id) === propertyId)
      && String(item.effectiveFrom || item.effective_from || '') <= asOfDate
      && (!(item.effectiveToExclusive || item.effective_to_exclusive) || String(item.effectiveToExclusive || item.effective_to_exclusive) > asOfDate))
      .sort((a, b) => String(b.effectiveFrom || b.effective_from || '').localeCompare(String(a.effectiveFrom || a.effective_from || '')))[0] || null;
  }

  function renderBenchmarkForm(model) {
    const selected = model.properties.find(item => item.slug === model.selectedProperty);
    if (!selected || !selected.id) return '';
    const numeric = (name, label, max = '', step = '0.001') => `<label style="display:grid;gap:5px;font-size:12px">${escapeHtml(label)}<input class="form-control" type="number" min="0"${max ? ` max="${max}"` : ''} step="${step}" name="${escapeHtml(name)}" placeholder="Boş bırakılabilir"></label>`;
    return `<form data-marketing-benchmark-form style="margin-top:14px;border-top:1px solid rgba(148,163,184,.2);padding-top:14px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
      <label style="display:grid;gap:5px;font-size:12px">Kaynak türü<select class="form-control" name="sourceKind" required><option value="PORTFOLIO_HISTORY">Portföy geçmişi</option><option value="MARKET_PROVIDER">Pazar veri sağlayıcısı</option><option value="MANUAL_RESEARCH">Manuel araştırma</option></select></label>
      <label style="display:grid;gap:5px;font-size:12px">Kaynak kaydı<input class="form-control" name="sourceRecordId" maxlength="300" placeholder="Rapor/dosya/sorgu referansı"></label>
      <label style="display:grid;gap:5px;font-size:12px">Geçerlilik başlangıcı<input class="form-control" type="date" name="effectiveFrom" value="${services.LexbnbBusinessDate.getBusinessDate()}" required></label>
      <label style="display:grid;gap:5px;font-size:12px">Geçerlilik bitişi (hariç)<input class="form-control" type="date" name="effectiveToExclusive"></label>
      ${numeric('searchToViewCtrPercent', 'Arama → görüntüleme CTR (%)', '100')}${numeric('viewToBookingConversionPercent', 'Görüntüleme → rezervasyon (%)', '100')}
      ${numeric('normalizedImpressionsPerListingDay', 'Gösterim / ilan-gün')}${numeric('recommendedActiveMediaCount', 'Önerilen aktif medya', '', '1')}
      ${numeric('maxDistributionCostPercent', 'Azami dağıtım maliyeti (%)', '100')}${numeric('minimumDirectReservationSharePercent', 'Asgari direkt rezervasyon payı (%)', '100')}
      <label style="display:grid;gap:5px;font-size:12px">Güven (0–1)<input class="form-control" type="number" min="0" max="1" step="0.05" name="confidence" placeholder="Kanıta göre girin" required></label>
      <label style="display:grid;gap:5px;font-size:12px">Kanıt notu<input class="form-control" name="evidenceNote" maxlength="500"></label>
    </div><div class="sub-text" style="margin-top:9px">En az bir sayısal değer gerekir. Kaydedilen referans geçmişi değiştirilemez.</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-benchmark>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm">Referansı kaydet</button></div></form>`;
  }

  function renderFunnel(model) {
    const selected = model.selectedProperty === 'ALL' ? null : model.properties.find(item => item.slug === model.selectedProperty);
    const selectedId = selected && selected.id;
    const scopedListings = model.listings.filter(item => !selectedId || (item.propertyId || item.property_id) === selectedId);
    const activeMedia = model.media.filter(item => (!selectedId || (item.propertyId || item.property_id) === selectedId)
      && String(item.mediaStatus || item.media_status || '').toUpperCase() === 'ACTIVE');
    const experimentDisabled = !selectedId || !scopedListings.length || activeMedia.length < 2;
    const toolbar = `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-open-listing>＋ Kanal ilanı ekle</button><button type="button" class="btn btn-secondary btn-sm" data-marketing-open-experiment${experimentDisabled ? ' disabled' : ''}>Değişikliği ölç</button><button type="button" class="btn btn-primary btn-sm" data-marketing-open-snapshot>＋ Manuel snapshot ekle</button></div>`;
    const listingApi = services.MarketingChannelListingService;
    const listingNote = scopedListings.length
      ? `<div class="sub-text" style="margin-bottom:10px">Kayıtlı kanal ilanları: ${escapeHtml(scopedListings.map(item => listingApi && listingApi.channelName ? listingApi.channelName(item) : (item.channel_code || item.channelCode)).join(', '))} — Mülkler › profil › Kanallar sekmesinde düzenlenir.</div>` : '';
    const listingForm = (state.listingFormOpen ? renderListingForm(model) : '') + listingNote;
    const form = state.snapshotFormOpen ? renderSnapshotForm(model) : '';
    const experimentForm = state.experimentFormOpen ? renderExperimentForm(model) : '';
    const experimentResults = renderExperiments(model.experiments, selectedId);
    if (!model.snapshots.length) {
      const channel = String((model.listings[0] || {}).channelCode || (model.listings[0] || {}).channel_code || '').toUpperCase();
      const platformNote = channel === 'BOOKING_COM'
        ? 'Booking.com Extranet’te kaydı bulunan aşamalar gösterilir; boş alanlar ölçülmedi sayılır.'
        : 'Airbnb için ilk sayfa görünme → ilan görüntüleme → rezervasyon aşamaları kullanılır; boş alanlar ölçülmedi sayılır.';
      return `${toolbar}${listingForm}${form}${experimentForm}${emptyState('Huni verisi henüz yok', platformNote)}${experimentResults}`;
    }
    const funnel = services.MarketingFunnelService;
    const latest = selectLatestSnapshot(model.snapshots);
    const derived = funnel && funnel.deriveFunnelMetrics ? funnel.deriveFunnelMetrics(latest) : null;
    if (!derived || !derived.validation.valid) {
      return `${toolbar}${listingForm}${form}${experimentForm}${emptyState('Huni snapshot’ı doğrulanamadı', 'Sayaç sıralamasını ve negatif/eksik değerleri kontrol edin.')}${experimentResults}`;
    }
    const c = derived.validation.counters;
    const r = derived.rates;
    const findings = rankFindings(model.findings);
    return `${toolbar}${listingForm}${form}${experimentForm}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpi('Gösterim', number(c.impressions), `Veri tamlığı: 5 sayaçtan ${number(Math.round((derived.validation.coveragePercent || 0) * 5 / 100))} tanesi girildi (${number(derived.validation.coveragePercent, '%')})`)}
      ${kpi('İlan görüntüleme', number(c.listingViews), `Arama → görüntüleme: ${number(r.searchToViewCtrPercent, '%')}`)}
      ${kpi('Rezervasyon denemesi', number(c.bookingAttempts), `Görüntüleme → deneme: ${number(r.viewToAttemptConversionPercent, '%')}`)}
      ${kpi('Platform rezervasyonu', number(c.platformReportedBookings), `Görüntüleme → rezervasyon: ${number(r.viewToBookingConversionPercent, '%')}`)}
    </div>${renderSnapshotList(model)}${renderFindings(findings)}${experimentResults}`;
  }

  // Huni snapshot'lari ve yonetim icin silme (L-281, phase105 DELETE politikasi).
  function renderSnapshotList(model) {
    const rows = (model.snapshots || []).slice(0, 10);
    if (!rows.length) return '';
    const canManage = !!(model.ads && model.ads.canManage);
    return `<div class="card" style="padding:14px;margin-bottom:12px"><strong>Kayıtlı snapshot'lar</strong><div style="display:grid;gap:6px;margin-top:8px">${rows.map(row => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><span>${escapeHtml(row.period_start || row.periodStart || '?')} → ${escapeHtml(row.period_end_exclusive || row.periodEndExclusive || '?')} · gösterim ${number(row.impressions)}${row.notes ? ' · ' + escapeHtml(row.notes) : ''}</span>${canManage ? `<button type="button" class="btn btn-danger btn-sm" data-marketing-delete-snapshot="${escapeHtml(row.id)}">Sil</button>` : ''}</div>`).join('')}</div></div>`;
  }

  async function deleteSnapshot(snapshotId) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !snapshotId) throw new Error('SNAPSHOT_DELETE_UNAVAILABLE');
    if (typeof window !== 'undefined' && !window.confirm('Bu huni snapshot\'ı silinsin mi?')) return false;
    const status = document.getElementById('marketingWorkspaceStatus');
    const { data, error } = await client.from('channel_performance_snapshots').delete()
      .eq('id', snapshotId).eq('tenant_id', scope.tenantId).select('id');
    if (error) {
      if (status) status.textContent = String(error.code) === '23503'
        ? 'Bu snapshot bir değişiklik ölçümünde kullanılıyor; silinemez.'
        : 'Snapshot silinemedi. Lütfen yeniden deneyin.';
      return false;
    }
    if (!data || !data.length) {
      // Politika yoksa satir sessizce filtrelenir (RLS).
      if (status) status.textContent = 'Snapshot silinemedi: veritabanı göçü (phase105) henüz uygulanmadı ya da bu rolün silme yetkisi yok.';
      return false;
    }
    state.remoteStatus = 'LOADING';
    render();
    await hydrateCloudData();
    render();
    if (status) status.textContent = 'Snapshot silindi.';
    return true;
  }

  function selectLatestSnapshot(snapshots = []) {
    return snapshots.slice().sort((a, b) => {
      const aKey = String(a.periodEndExclusive || a.period_end_exclusive || a.createdAt || a.created_at || '');
      const bKey = String(b.periodEndExclusive || b.period_end_exclusive || b.createdAt || b.created_at || '');
      return bKey.localeCompare(aKey);
    })[0] || null;
  }

  function renderListingForm(model) {
    const properties = model.properties.filter(item => item.id);
    if (!properties.length) return emptyState('Mülk kaydı bulunamadı', 'Kanal ilanı eklemek için önce bulut hesabında bir mülk oluşturulmalıdır.');
    const selectedId = state.listingPropertyId || (model.selectedProperty === 'ALL' ? null
      : (properties.find(item => item.slug === model.selectedProperty) || {}).id);
    const propertyOptions = properties.map(item => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    const channelOptions = [
      ['AIRBNB', 'Airbnb'], ['BOOKING_COM', 'Booking.com'], ['VRBO', 'Vrbo'],
      ['EXPEDIA', 'Expedia'], ['DIRECT', 'Doğrudan'], ['OTHER_OTA', 'Diğer OTA (ETS Tur vb.)']
    ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
    return `<form data-marketing-listing-form class="card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px">Kanal ilanı tanımla</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
        <label style="display:grid;gap:5px;font-size:12px">Mülk<select class="form-control" name="propertyId" required>${propertyOptions}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">Kanal<select class="form-control" name="channelCode" required>${channelOptions}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">İlan ID (isteğe bağlı)<input class="form-control" name="externalListingId" maxlength="200" placeholder="Bağlantıdan okunur"><small class="sub-text">Airbnb: adresteki /rooms/ sonrası sayı. Booking.com: tesis numarası.</small></label>
        <label style="display:grid;gap:5px;font-size:12px">Platformdaki ilan adı<input class="form-control" name="displayName" maxlength="200" placeholder="Misafirin gördüğü başlık"></label>
        <label style="display:grid;gap:5px;font-size:12px">İlan URL’si<input class="form-control" type="url" name="externalUrl" placeholder="https://..." inputmode="url"></label>
        <label style="display:grid;gap:5px;font-size:12px">Ödeme para birimi<select class="form-control" name="payoutCurrency" required>${['TRY', 'EUR', 'USD', 'GBP'].map(code => `<option value="${escapeHtml(code)}">${escapeHtml(code)}</option>`).join('')}</select><small class="sub-text">Booking.com EUR ödüyorsa EUR seçin; tutarlar çevrilmez.</small></label>
      </div>
      <div class="sub-text" style="margin-top:10px">ETS Tur gibi listede olmayan bir kanal için “Diğer OTA” seçin ve platform adını yazın. İlan bağlantısını yapıştırmanız yeterli; ID bağlantıdan okunur. Kaydedilen ilanlar Mülkler › profil › Kanallar sekmesinde listelenir ve ChatGPT analizine bağlantı olarak gider. Aynı ilan tekrar kaydedilirse mevcut kayıt güncellenir.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-listing>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm">Kanal ilanını kaydet</button></div>
    </form>`;
  }

  function renderSnapshotForm(model) {
    if (!model.listings.length) return emptyState('Kanal ilanı bulunamadı', 'Snapshot kaydetmeden önce bu mülk için aktif bir kanal ilanı tanımlanmalıdır.');
    const start = model.period.start || '';
    const end = model.period.endExclusive || '';
    const options = model.listings.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name || item.displayName || item.channel_code || item.channelCode || item.id)}</option>`).join('');
    const field = (name, label) => `<label style="display:grid;gap:5px;font-size:12px">${escapeHtml(label)}<input class="form-control" type="number" min="0" step="1" name="${escapeHtml(name)}" placeholder="Bilinmiyorsa boş bırakın"></label>`;
    return `<form data-marketing-snapshot-form class="card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px">Manuel huni snapshot’ı</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        <label style="display:grid;gap:5px;font-size:12px">Kanal ilanı<select class="form-control" name="channelListingId" required>${options}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">Başlangıç<input class="form-control" type="date" name="periodStart" value="${escapeHtml(start)}" required></label>
        <label style="display:grid;gap:5px;font-size:12px">Bitiş (hariç)<input class="form-control" type="date" name="periodEndExclusive" value="${escapeHtml(end)}" required></label>
        ${field('impressions', 'Gösterim')}${field('listingViews', 'İlan görüntüleme')}${field('bookingAttempts', 'Rezervasyon denemesi')}${field('platformReportedBookings', 'Platform rezervasyonu')}${field('wishlistSaves', 'Favoriye kaydetme')}
      </div>
      <label style="display:grid;gap:5px;font-size:12px;margin-top:10px">Not<input class="form-control" type="text" name="notes" maxlength="500"></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-snapshot>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm">Snapshot’ı kaydet</button></div>
    </form>`;
  }

  function rankFindings(findings) {
    const priority = services.MarketingPriorityService;
    if (!findings.length || !priority || !priority.selectTopMarketingActions) return findings.slice(0, 3);
    try { return priority.selectTopMarketingActions(findings); } catch (_) { return findings.slice(0, 3); }
  }

  function renderFindings(findings) {
    if (!findings.length) return emptyState('Açık pazarlama bulgusu yok', 'Yeterli örneklem oluştuğunda kanıta dayalı bulgular burada listelenecek.');
    return `<div class="card" style="padding:16px"><h3 style="margin-top:0">Öncelikli bulgular</h3>${findings.map(item => `<div style="padding:12px 0;border-top:1px solid rgba(148,163,184,.2)"><strong>${escapeHtml(item.title || item.findingCode || item.finding_code || 'Pazarlama bulgusu')}</strong><div class="sub-text">${escapeHtml(item.evidenceText || item.evidence_text || item.observation || 'Kanıt açıklaması bekleniyor.')}</div><div style="margin-top:6px;font-size:12px">Güven: ${escapeHtml(item.confidenceTier || item.confidence_tier || 'BELİRSİZ')}${item.priority ? ` · Öncelik: ${number(item.priority.score)}` : ''}</div>${renderFindingActions(item)}</div>`).join('')}</div>`;
  }

  function renderFindingActions(item) {
    const id = item.id;
    const status = String(item.status || 'OPEN').toUpperCase();
    if (!id || !['OPEN', 'ACKNOWLEDGED'].includes(status)) return '';
    const actionKind = String(item.actionKind || item.action_kind || '').toUpperCase();
    const button = (action, label, className = 'btn-secondary') => `<button type="button" class="btn btn-sm ${className}" data-marketing-action="${action}" data-finding-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
    const actions = [];
    if (status === 'OPEN') actions.push(button('ACKNOWLEDGE', 'İncelendi'));
    if (['RESHOOT', 'ON_SITE_CONTENT'].includes(actionKind) && !item.acceptedForTask && !item.accepted_for_task) {
      actions.push(button('ACCEPT_TASK', 'Operasyon görevi oluştur', 'btn-primary'));
    }
    actions.push(button('RESOLVE', 'Çözüldü'));
    actions.push(button('DISMISS', 'Reddet'));
    return `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">${actions.join('')}</div>`;
  }

  function renderExperimentForm(model) {
    const selected = model.selectedProperty === 'ALL' ? null : model.properties.find(item => item.slug === model.selectedProperty);
    const propertyId = selected && selected.id;
    const listings = model.listings.filter(item => (item.propertyId || item.property_id) === propertyId);
    const media = model.media.filter(item => (item.propertyId || item.property_id) === propertyId
      && String(item.mediaStatus || item.media_status || '').toUpperCase() === 'ACTIVE');
    if (!propertyId || !listings.length || media.length < 2) return emptyState('Kapak değişimi hazır değil', 'Tek bir mülk, kanal ilanı ve en az iki aktif fotoğraf gerekir.');
    const forms = listings.map(listing => {
      const cover = services.MarketingCoverChangeService && services.MarketingCoverChangeService.currentCover(model.placements, listing.id);
      if (!cover) return `<div class="sub-text">${escapeHtml(listing.displayName || listing.display_name || listing.channelCode || listing.channel_code)}: ölçülebilir değişim için önce mevcut kapak yerleşimi tanımlanmalıdır.</div>`;
      const oldMediaId = cover.mediaId || cover.media_id;
      const placedIds = new Set(model.placements.filter(row => (row.channelListingId || row.channel_listing_id) === listing.id && (row.isActive !== undefined ? row.isActive : row.is_active) !== false).map(row => row.mediaId || row.media_id));
      const candidates = media.filter(item => item.id !== oldMediaId && placedIds.has(item.id));
      if (!candidates.length) return `<div class="sub-text">${escapeHtml(listing.displayName || listing.display_name || listing.channelCode || listing.channel_code)}: aktif yerleşimde alternatif kapak yok.</div>`;
      const options = candidates.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.roomCategory || item.room_category || 'Fotoğraf')} · ${escapeHtml(String(item.id).slice(0, 8))}</option>`).join('');
      return `<form data-marketing-experiment-form style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end"><input type="hidden" name="channelListingId" value="${escapeHtml(listing.id)}"><input type="hidden" name="expectedOldMediaId" value="${escapeHtml(oldMediaId)}"><label style="display:grid;gap:5px;font-size:12px">Yeni kapak<select class="form-control" name="newMediaId" required>${options}</select></label><label style="display:grid;gap:5px;font-size:12px">İzlenecek metrik<select class="form-control" name="primaryMetric"><option value="SEARCH_TO_VIEW_CTR_PERCENT">Arama → görüntüleme CTR</option><option value="VIEW_TO_BOOKING_CONVERSION_PERCENT">Görüntüleme → rezervasyon</option></select></label><button type="submit" class="btn btn-primary btn-sm">Değiştir ve 14+14 gün izle</button></form>`;
    }).join('<hr style="border:0;border-top:1px solid rgba(148,163,184,.2);margin:12px 0">');
    return `<div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 6px">Kayıtlı kanal kapağını değiştir</h3><div class="sub-text" style="margin-bottom:12px">Yalnızca Lexbnb yerleşimi değişir; OTA’ya yayın yapılmaz. Eski kapak eşleşmezse işlem durur ve 14+14 günlük gözlemsel ölçüm atomik olarak açılır.</div>${forms}<div style="display:flex;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-experiment>Vazgeç</button></div></div>`;
  }

  function renderExperiments(experiments, propertyId) {
    const scoped = experiments.filter(item => !propertyId || (item.propertyId || item.property_id) === propertyId).slice(0, 5);
    if (!scoped.length) return '';
    const statusLabels = { COLLECTING: 'Veri toplanıyor', READY: 'Değerlendirmeye hazır', PROCESSING: 'Değerlendiriliyor', EVALUATED: 'Değerlendirildi', FAILED: 'Değerlendirme başarısız', CANCELLED: 'İptal' };
    const verdictLabels = { POSITIVE_ASSOCIATION: 'Pozitif ilişki', NEGATIVE_ASSOCIATION: 'Negatif ilişki', NO_CLEAR_CHANGE: 'Belirgin değişim yok', CONFOUNDED: 'Karıştırıcı etken var', INSUFFICIENT_DATA: 'Yetersiz veri' };
    return `<div class="card" style="padding:14px;margin-top:12px"><strong>Gözlemsel değişiklik ölçümleri</strong><div style="display:grid;gap:8px;margin-top:10px">${scoped.map(item => {
      const status = String(item.status || '').toUpperCase();
      const verdict = String(item.verdict || '').toUpperCase();
      const insufficient = verdict === 'INSUFFICIENT_DATA' ? ' · Karar için yetersiz' : '';
      const confounders = item.confounders || item.confounding_factors || [];
      const confounded = (Array.isArray(confounders) && confounders.length) || verdict === 'CONFOUNDED'
        ? '<div class="sub-text">⚠ Aynı dönemde fiyat veya sezon etkisi olabilir.</div>' : '';
      return `<div style="display:flex;justify-content:space-between;gap:12px"><span>${escapeHtml(item.change_date || item.changeDate || 'Tarih yok')} · ${escapeHtml(item.primary_metric || item.primaryMetric || '')}</span><strong>${escapeHtml((verdictLabels[verdict] || statusLabels[status] || status || 'Bilinmiyor') + insufficient)}</strong></div>${confounded}`;
    }).join('')}</div><div class="sub-text" style="margin-top:8px">Bu gerçek A/B değil; yalnız olası etkiyi gösteren gözlemsel önce/sonra ölçümüdür. Sonuç nedensellik kanıtı olarak sunulmaz.</div></div>`;
  }

  function buildAdsModel(input = {}) {
    const engine = services.AdsMetricsEngine;
    if (!engine || typeof engine.campaignMetrics !== 'function') throw new Error('ADS_METRICS_ENGINE_UNAVAILABLE');
    const selectedPeriod = periodFromFilter(input.filter || {});
    const allPeriods = (input.adMetricPeriods || []).map(row => ({
      id: row.id,
      campaignId: row.campaignId || row.campaign_id,
      platform: row.platform,
      resultType: row.resultType || row.result_type,
      periodStart: row.periodStart || row.period_start,
      periodEnd: row.periodEnd || row.period_end,
      spend: row.spend == null ? null : Number(row.spend),
      impressions: row.impressions == null ? null : Number(row.impressions),
      clicks: row.clicks == null ? null : Number(row.clicks),
      messages: row.messages == null ? null : Number(row.messages),
      calls: row.calls == null ? null : Number(row.calls)
    }));
    const measuredFields = ['spend', 'impressions', 'clicks', 'messages', 'calls'];
    const clipPeriods = (rangeStart, rangeEndExclusive) => allPeriods.map(row => {
      const inclusiveEnd = rangeEndExclusive ? addUtcDays(rangeEndExclusive, -1) : null;
      if (!rangeStart || !inclusiveEnd) return row;
      const overlapStart = row.periodStart > rangeStart ? row.periodStart : rangeStart;
      const overlapEnd = row.periodEnd < inclusiveEnd ? row.periodEnd : inclusiveEnd;
      if (!row.periodStart || !row.periodEnd || overlapEnd < overlapStart) return null;
      const totalDays = Math.floor((Date.parse(row.periodEnd + 'T00:00:00Z') - Date.parse(row.periodStart + 'T00:00:00Z')) / 86400000) + 1;
      const overlapDays = Math.floor((Date.parse(overlapEnd + 'T00:00:00Z') - Date.parse(overlapStart + 'T00:00:00Z')) / 86400000) + 1;
      if (!(totalDays > 0) || !(overlapDays > 0)) return null;
      const ratio = overlapDays / totalDays;
      return Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        measuredFields.includes(key) && value !== null ? Math.round(value * ratio * 100) / 100 : value
      ]));
    }).filter(Boolean);
    const periods = clipPeriods(selectedPeriod.start, selectedPeriod.endExclusive);
    let priorPeriods = [];
    if (selectedPeriod.start && selectedPeriod.endExclusive) {
      const durationDays = Math.round((Date.parse(selectedPeriod.endExclusive + 'T00:00:00Z') - Date.parse(selectedPeriod.start + 'T00:00:00Z')) / 86400000);
      priorPeriods = clipPeriods(addUtcDays(selectedPeriod.start, -durationDays), selectedPeriod.start);
    }
    const campaigns = Array.isArray(input.marketingCampaigns) ? input.marketingCampaigns : [];
    const campaignNames = new Map(campaigns.map(item => [String(item.id), item.name || 'Adsız kampanya']));
    const metrics = engine.campaignMetrics(periods, { targets: input.targets || {}, minResults: 10 })
      .map(row => ({ ...row, campaignName: campaignNames.get(String(row.campaignId)) || 'Bilinmeyen kampanya' }));

    const sourceCodes = new Map((input.leadSources || []).map(item => [String(item.id), item.code]));
    const leadsBySource = {};
    (input.leadAcquisitions || []).filter(item => {
      const date = String(item.leadDate || item.lead_date || item.createdAt || item.created_at || '').slice(0, 10);
      return !selectedPeriod.start || (date && date >= selectedPeriod.start && date < selectedPeriod.endExclusive);
    }).forEach(item => {
      const code = sourceCodes.get(String(item.sourceId || item.source_id));
      if (code) leadsBySource[code] = (leadsBySource[code] || 0) + 1;
    });
    const sums = periods.reduce((out, row) => {
      if (row.spend != null) out.spend[row.platform] = (out.spend[row.platform] || 0) + row.spend;
      if (row.messages != null) out.messages[row.platform] = (out.messages[row.platform] || 0) + row.messages;
      return out;
    }, { spend: {}, messages: {} });
    const totalSpend = periods.some(row => row.spend != null)
      ? periods.reduce((sum, row) => sum + (row.spend || 0), 0) : null;
    const priorSpend = priorPeriods.some(row => row.spend != null)
      ? priorPeriods.reduce((sum, row) => sum + (row.spend || 0), 0) : null;
    const spendTrendPct = totalSpend !== null && priorSpend > 0
      ? Math.round(((totalSpend - priorSpend) / priorSpend) * 1000) / 10 : null;
    return {
      metrics,
      campaigns: campaigns.filter(item => ['META', 'GOOGLE'].includes(String(item.platform || '').toUpperCase())),
      allCampaigns: campaigns,
      periods,
      allPeriods,
      customMetrics: normalizeCustomMetrics(input.customMetrics),
      targets: input.targets || {},
      channelLeadCost: engine.channelLeadCost({ spendByPlatform: sums.spend, leadsBySource, messagesByPlatform: sums.messages }),
      adShare: engine.adShare({ adSpend: totalSpend, netRoomRevenue: input.financeSummary && input.financeSummary.netRoomRevenue }),
      totalSpend,
      priorSpend,
      spendTrendPct,
      canManage: input.canManageAds !== false,
      loadStatus: input.adPeriodsStatus || 'OK',
      loadError: input.adPeriodsError || null,
      closedMonths: input.closedMonths || []
    };
  }

  // Aşama 3 — Meta CSV içe aktarma ekranı. Görsel referans 21st.dev (kod değil):
  // File Dropzone (joyco), Configuration Stepper (shadcnspace), Segmented Tabs
  // (micka_design), Import Patchbay (n1m4mz: emin olunmayan eşleşme ayrı işaretlenir).
  // Sınıflar uygulamanın kendi tasarım dilinden: card, badge-*, btn-*, upload-dropzone.
  const ADS_VIEWS = [
    { id: 'overview', label: 'Genel bakış', manage: false },
    { id: 'import', label: 'İçe aktar', manage: true },
    { id: 'campaigns', label: 'Kampanyalar ve hedefler', manage: true },
    { id: 'records', label: 'Kayıtlar', manage: false }
  ];
  const META_RECOMMENDED_COLUMNS = ['Kampanya adı', 'Kampanya yayını', 'Sonuçlar', 'Sonuç göstergesi', 'Harcanan tutar (TRY)', 'Gösterim', 'Erişim', 'Bağlantı tıklamaları', 'Reklam seti bütçesi'];

  function closedMonthKeys(data) {
    return ((data && data.closedPeriods) || []).filter(item => item.status === 'CLOSED')
      .map(item => `${item.year}-${String(item.month).padStart(2, '0')}`);
  }

  function adsImportPlan(importState, campaigns, closedMonths) {
    const parser = services.AdsImportParser;
    if (!parser || !importState) return null;
    return parser.planImport({
      rows: importState.rows || [], campaigns: campaigns || [], mapping: importState.mapping || {},
      existingPeriods: importState.existing || [], closedMonths: closedMonths || []
    });
  }

  function renderAdsSubnav(active, canManage) {
    return `<div class="ads-subnav" role="tablist" aria-label="Reklamlar bölümleri">${ADS_VIEWS.filter(view => canManage || !view.manage).map(view =>
      `<button type="button" role="tab" class="ads-subnav-btn${view.id === active ? ' active' : ''}" aria-selected="${view.id === active ? 'true' : 'false'}" data-ads-view="${view.id}">${escapeHtml(view.label)}</button>`).join('')}</div>`;
  }

  function renderAdsStepper(step) {
    const steps = ['Dosyayı yükle', 'Kampanyaları eşleştir', 'Kontrol et ve kaydet'];
    return `<ol class="ads-stepper" aria-label="İçe aktarma adımları">${steps.map((label, index) => {
      const state = index + 1 < step ? 'is-done' : index + 1 === step ? 'is-current' : '';
      return `<li class="${state}"${index + 1 === step ? ' aria-current="step"' : ''}><span class="ads-step-num">${index + 1 < step ? '✓' : index + 1}</span>${escapeHtml(label)}</li>`;
    }).join('')}</ol>`;
  }

  function renderMetaRecipe(open) {
    return `<details class="card ads-recipe"${open ? ' open' : ''}><summary><strong>Meta'dan dosya nasıl indirilir?</strong> <span class="sub-text">2 dakika</span></summary>
      <ol>
        <li>Reklam Yöneticisi'nde <strong>Kampanyalar</strong> sekmesini açın.</li>
        <li>Sağ üstten tarih aralığını seçin (ör. <em>Geçen ay</em>).</li>
        <li><strong>Döküm → Zaman → Gün</strong> seçin. Grafikler günlük çizilir ve 31 günlük sınır sorun olmaz.</li>
        <li><strong>Sütunlar → Sütunları özelleştir</strong> ile şunları ekleyin:<div class="ads-chip-row">${META_RECOMMENDED_COLUMNS.map(name => `<span class="badge">${escapeHtml(name)}</span>`).join('')}</div></li>
        <li><strong>Dışa aktar → Tablo verilerini dışa aktar → .csv</strong> ile indirin.</li>
        <li>Dosyayı yukarıdaki alana bırakın. Ay ortasında indirip ay sonunda yeniden yüklerseniz günler birleşir, gider iki kez yazılmaz.</li>
      </ol>
      <div class="sub-text">Reklam hesabının para birimi TRY olmalı. Dosya tarayıcınızda okunur; yalnız kampanya başına toplamlar ve günlük harcamalar kaydedilir.</div>
    </details>`;
  }

  function renderAdsDropzone() {
    return `<label class="upload-dropzone ads-dropzone" data-ads-dropzone>
      <input type="file" accept=".csv,.txt,text/csv" class="ads-file-input" data-ads-import-file>
      <span class="dropzone-icon" aria-hidden="true">📄</span>
      <strong>Meta CSV dosyasını buraya bırakın</strong>
      <span class="dropzone-hint">ya da tıklayıp seçin · Kampanyalar düzeyi · TRY · en fazla 5 MB</span>
    </label>`;
  }

  // '2026-10-01'..'2026-10-31' -> '1–31 Eki 2026'; ay/yıl farklıysa iki uç da yazılır.
  function formatAdsRange(start, end) {
    if (!start || !end) return '—';
    const part = (iso, opts) => new Date(iso + 'T00:00:00Z').toLocaleDateString('tr-TR', { timeZone: 'UTC', ...opts });
    const full = { day: 'numeric', month: 'short', year: 'numeric' };
    if (start.slice(0, 7) === end.slice(0, 7)) return `${Number(start.slice(8))}–${part(end, full)}`;
    if (start.slice(0, 4) === end.slice(0, 4)) return `${part(start, { day: 'numeric', month: 'short' })} – ${part(end, full)}`;
    return `${part(start, full)} – ${part(end, full)}`;
  }

  function matchBadge(entry) {
    if (entry.choice === '__new__') return '<span class="badge badge-blue">Yeni kampanya açılacak</span>';
    if (entry.manual) return '<span class="badge badge-emerald">Elle seçildi</span>';
    if (entry.matchedBy === 'EXACT') return '<span class="badge badge-emerald">Birebir eşleşti</span>';
    return '<span class="badge badge-amber ads-badge-dashed">Benzer ad · kontrol edin</span>';
  }

  function renderAdsImportView(importState, campaigns, closedMonths) {
    const head = `<div class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 4px">Meta reklam verisini içe aktar</h3><p class="sub-text" style="margin:0 0 12px">Kampanya başına harcama, gösterim, tıklama ve sonuç Finans giderine aynı işlemde bağlanır.</p>`;
    if (!importState) {
      return `${head}${renderAdsStepper(1)}${renderAdsDropzone()}</div>${renderMetaRecipe(true)}`;
    }
    const fileCard = `<div class="ads-file-card"><span aria-hidden="true">📄</span><div><strong>${escapeHtml(importState.fileName || 'Yapıştırılan veri')}</strong><div class="sub-text">${number((importState.rows || []).length)} satır okundu</div></div><button type="button" class="btn btn-secondary btn-sm" data-ads-import-reset>Başka dosya seç</button></div>`;
    const list = (title, tone, items) => items.length ? `<div class="card ads-notice ads-notice-${tone}"><strong>${escapeHtml(title)}</strong><ul>${items.map(item => `<li>${escapeHtml(item.text)}</li>`).join('')}</ul></div>` : '';
    if ((importState.parseErrors || []).length) {
      return `${head}${renderAdsStepper(1)}${fileCard}${list('Dosya okunamadı', 'rose', importState.parseErrors)}</div>${renderMetaRecipe(true)}`;
    }
    const plan = adsImportPlan(importState, campaigns, closedMonths);
    const loading = importState.status === 'LOADING';
    const saving = importState.status === 'SAVING';
    const blockers = [...plan.errors, ...(importState.loadError ? [{ text: importState.loadError }] : [])];
    const s = plan.summary;
    const kpis = `<div class="ads-kpi-row">
      ${kpi('Dönem', formatAdsRange(s.rangeStart, s.rangeEnd), `${number(s.dayCount)} gün`)}
      ${kpi('Kampanya', number(s.campaignCount), s.newCampaignCount ? `${number(s.newCampaignCount)} yeni açılacak` : 'hepsi kayıtlı')}
      ${kpi('Toplam harcama', money(s.totalSpend), 'Finans giderine yazılır')}
      ${kpi('Kayıt', number(s.periodCount), loading ? 'kayıtlı veri kontrol ediliyor' : s.replacedCount ? `${number(s.replacedCount)} eski kayıt yenisiyle değişecek` : 'yeni kayıt')}
    </div>`;
    const ownCampaigns = platform => (campaigns || []).filter(item => item.platform === platform);
    const mappingRows = plan.names.map(entry => {
      const manual = importState.mapping && importState.mapping[entry.key] !== undefined;
      const options = [`<option value="__new__"${entry.choice === '__new__' ? ' selected' : ''}>+ Yeni kampanya oluştur</option>`,
        ...ownCampaigns(entry.platform).map(item => `<option value="${escapeHtml(item.id)}"${String(item.id) === entry.choice ? ' selected' : ''}>${escapeHtml(item.name)}</option>`)].join('');
      return `<tr><td><strong>${escapeHtml(entry.name)}</strong><span class="sub-text" style="display:block">${escapeHtml(entry.platform)}</span></td><td><select class="form-control" data-ads-map-campaign="${escapeHtml(entry.key)}" aria-label="${escapeHtml(entry.name)} için kampanya">${options}</select></td><td>${matchBadge({ ...entry, manual })}</td></tr>`;
    }).join('');
    const typeLabels = { MESSAGE: 'Mesaj', CALL: 'Arama', OTHER: 'Diğer' };
    const previewRows = plan.rows.map(row => `<tr><td>${escapeHtml(row.campaignName)}</td><td style="white-space:nowrap">${escapeHtml(row.periodStart)} – ${escapeHtml(row.periodEnd)}</td><td>${number(adPeriodDays(row))}</td><td>${escapeHtml(row.resultLabel || typeLabels[row.resultType] || '—')}</td><td>${money(row.spend)}</td><td>${number(row.impressions)}</td><td>${number(row.clicks)}</td><td>${number(row.results)}</td></tr>`).join('');
    const saveNoticeHtml = importState.saveError ? list('Kaydedilemedi', 'rose', [{ text: importState.saveError }]) : '';
    const disabled = blockers.length || loading || saving;
    const reason = loading ? 'Bu aylarda kayıtlı reklam verisi kontrol ediliyor…' : saving ? 'Kaydediliyor…' : blockers.length ? 'Yukarıdaki sorunlar çözülmeden kaydedilemez.' : `${number(s.periodCount)} kayıt tek işlemde yazılır; hata olursa hiçbiri yazılmaz.`;
    return `${head}${renderAdsStepper(blockers.length ? 2 : 3)}${fileCard}</div>
      ${kpis}
      ${list('Kaydetmeden önce düzeltin', 'rose', blockers)}
      ${saveNoticeHtml}
      ${list('Dikkat', 'amber', importState.parseWarnings ? [...importState.parseWarnings, ...plan.warnings] : plan.warnings)}
      <div class="card" style="padding:14px;margin-bottom:14px;overflow:auto"><h3 style="margin:0 0 4px">Kampanyaları eşleştir</h3><p class="sub-text" style="margin:0 0 10px">Dosyadaki her ad kayıtlı bir kampanyaya bağlanır. Eşleşmeyen ad için yeni kampanya açılır; isterseniz listeden mevcut kampanyayı seçin.</p><table class="data-table"><thead><tr><th>Dosyadaki ad</th><th>Lexbnb kampanyası</th><th>Durum</th></tr></thead><tbody>${mappingRows}</tbody></table></div>
      <div class="card" style="padding:14px;margin-bottom:14px;overflow:auto"><h3 style="margin:0 0 10px">Kaydedilecek dönemler</h3><table class="data-table"><thead><tr><th>Kampanya</th><th>Dönem</th><th>Gün</th><th>Sonuç türü</th><th>Harcama</th><th>Gösterim</th><th>Tıklama</th><th>Sonuç</th></tr></thead><tbody>${previewRows}</tbody></table>
        <form data-ads-import-confirm class="ads-confirm-bar"><span class="sub-text">${escapeHtml(reason)}</span><div style="display:flex;gap:8px"><button type="button" class="btn btn-secondary btn-sm" data-ads-import-reset>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm"${disabled ? ' disabled' : ''}>Onayla ve kaydet</button></div></form>
      </div>`;
  }

  function renderAdsAlternativeImports(campaignOptions, manualForm) {
    return `<details class="card ads-recipe"><summary><strong>Diğer yollar</strong> <span class="sub-text">ChatGPT çıktısı yapıştır · elle dönem ekle</span></summary>
      <form data-ads-import-form style="margin-top:10px">
        <p class="sub-text" style="margin:0 0 8px">Reklam ekran görüntüsünü ChatGPT'ye okutun, çıktıyı bu kesin biçimde yapıştırın. Kaydetmeden önce aynı eşleştirme ekranı açılır.</p>
        <code style="display:block;white-space:pre-wrap;margin-bottom:8px">LEXBNB_REKLAM_V2\nplatform;kampanya;baslangic;bitis;sonuc_turu;harcama;gosterim;tiklama;mesaj;arama</code>
        <textarea class="form-control" name="payload" rows="5" required aria-label="ChatGPT çıktısı"></textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button type="submit" class="btn btn-secondary btn-sm">Önizle</button></div>
      </form>
      ${campaignOptions ? manualForm : '<p class="sub-text">Elle dönem eklemek için önce Kampanyalar ve hedefler bölümünde kampanya oluşturun.</p>'}
    </details>`;
  }

  function renderAds(model, view) {
    const active = ADS_VIEWS.some(item => item.id === view && (model.canManage || !item.manage)) ? view : 'overview';
    const statusLabels = { VERIMLI: 'Verimli', PAHALI: 'Pahalı', IZLE: 'İzle' };
    const metricCards = model.metrics.length ? model.metrics.map(row => `
      <article class="card" style="padding:14px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;flex-wrap:wrap">
          <div><strong>${escapeHtml(row.campaignName)}</strong><div class="sub-text">${escapeHtml(row.platform)} · ${row.resultType === 'MESSAGE' ? 'Mesaj' : row.resultType === 'CALL' ? 'Arama' : 'Diğer sonuç'}</div></div>
          <span class="badge ${row.status === 'VERIMLI' ? 'badge-emerald' : row.status === 'PAHALI' ? 'badge-red' : 'badge-amber'}">${escapeHtml(statusLabels[row.status] || 'Hedef gerekli')}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:10px;margin-top:12px">
          <div><span class="sub-text">Harcama</span><strong style="display:block">${money(row.spend)}</strong></div>
          <div><span class="sub-text">CTR</span><strong style="display:block">${number(row.ctr, '%')}</strong></div>
          <div><span class="sub-text">Tıklama maliyeti</span><strong style="display:block">${money(row.cpc)}</strong></div>
          <div><span class="sub-text">Mesaj maliyeti</span><strong style="display:block">${money(row.costPerMessage)}</strong></div>
          <div><span class="sub-text">Arama maliyeti</span><strong style="display:block">${money(row.costPerCall)}</strong></div>
        </div>
        <div class="sub-text" style="margin-top:8px">${escapeHtml(row.statusReason && row.statusReason.text || 'Durum için hedef ve yeterli örnek gerekli.')}</div>
      </article>`).join('')
      : model.loadStatus === 'LOADING' ? emptyState('Reklam verisi yükleniyor', 'Seçili dönemin kayıtları getiriliyor.')
      : model.loadStatus === 'ERROR' ? emptyState('Reklam verisi okunamadı', model.loadError || 'Bağlantıyı kontrol edip sayfayı yenileyin.')
      : emptyState('Henüz reklam dönemi yok', 'İlk gerçek reklam dönemi kaydedildiğinde kampanya maliyetleri burada görünür.');
    const channelRows = model.channelLeadCost.map(row => `<tr><td>${escapeHtml(row.platform)}</td><td>${money(row.spend)}</td><td>${number(row.leads)}</td><td>${money(row.costPerLead)}</td><td>${number(row.messageToLeadRatio)}</td></tr>`).join('');
    const campaignOptions = model.campaigns.map(item => `<option value="${escapeHtml(item.id)}" data-platform="${escapeHtml(item.platform)}">${escapeHtml(item.name)} · ${escapeHtml(item.platform)}</option>`).join('');
    const campaignAdmin = model.canManage ? `
      <form data-ads-campaign-form class="card" style="padding:16px;margin-bottom:14px">
        <h3 style="margin:0 0 6px">Kampanya oluştur</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end">
          <label style="display:grid;gap:5px;font-size:12px">Ad<input class="form-control" name="name" required maxlength="160"></label>
          <label style="display:grid;gap:5px;font-size:12px">Platform<select class="form-control" name="platform" required><option value="META">Meta</option><option value="GOOGLE">Google</option><option value="TIKTOK">TikTok</option><option value="OTHER">Diğer / Influencer</option></select></label>
          <label style="display:grid;gap:5px;font-size:12px">Başlangıç<input class="form-control" type="date" name="startDate"></label>
          <label style="display:grid;gap:5px;font-size:12px">Bitiş<input class="form-control" type="date" name="endDate"></label>
          <label style="display:grid;gap:5px;font-size:12px" title="Üst sınırdır; her gün bu kadar harcamak zorunlu değil">Günlük bütçe sınırı (₺)<input class="form-control" type="number" name="budget" min="0" step="0.01" placeholder="Örn: 500"></label>
          <button class="btn btn-primary btn-sm" type="submit">Kampanyayı kaydet</button>
        </div>
      </form>
      <form data-ads-target-form class="card" style="padding:16px;margin-bottom:14px">
        <h3 style="margin:0 0 6px">Verimlilik hedefleri</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:end">
          <label style="display:grid;gap:5px;font-size:12px">Hedef mesaj maliyeti<input class="form-control" type="number" name="costPerMessage" min="0.01" step="0.01" required value="${escapeHtml(model.targets.costPerMessage ?? '')}"></label>
          <label style="display:grid;gap:5px;font-size:12px">Hedef arama maliyeti<input class="form-control" type="number" name="costPerCall" min="0.01" step="0.01" required value="${escapeHtml(model.targets.costPerCall ?? '')}"></label>
          <button class="btn btn-primary btn-sm" type="submit">Hedefleri kaydet</button>
        </div>
      </form>
      <div class="card" style="padding:14px;margin-bottom:14px"><h3 style="margin:0 0 10px">Kayıtlı kampanyalar</h3>${model.allCampaigns.length ? model.allCampaigns.map(item => { const b = campaignBudgetView(item, model.allPeriods || []); const budgetText = b.limit === null ? 'Günlük sınır girilmedi' : `Günlük sınır ${money(b.limit)} · ort. günlük harcama ${b.avgDaily === null ? '—' : money(b.avgDaily)}${b.usagePct === null ? '' : ` (sınırın %${number(b.usagePct)}'i)`}`; return `<div class="lead-followup-row"><div><strong>${escapeHtml(item.name || 'Adsız kampanya')}</strong><span>${escapeHtml(item.platform || 'OTHER')} · ${escapeHtml(item.startDate || item.start_date || 'Başlangıç yok')} → ${escapeHtml(item.endDate || item.end_date || 'Bitiş yok')}</span><span${b.overLimit ? ' style="color:#F87171"' : ''}>${escapeHtml(budgetText)}${b.overLimit ? ' — sınır aşıldı' : ''}</span></div><button type="button" class="btn btn-danger btn-sm" data-ads-delete-campaign="${escapeHtml(item.id)}">Sil</button></div>`; }).join('') : '<p class="empty-state">Henüz kampanya yok.</p>'}</div>`
      : '';
    const customMetrics = model.customMetrics || [];
    const campaignName = row => (model.allCampaigns.find(item => String(item.id) === String(row.campaignId)) || {}).name || 'Bilinmeyen kampanya';
    const periodRows = model.periods.map(row => {
      const days = adPeriodDays(row);
      const ctr = row.impressions > 0 && row.clicks != null ? row.clicks / row.impressions * 100 : null;
      const custom = customMetrics.map(metric => `<td>${formatCustomMetric(metric, evaluateCustomMetric(metric, row))}</td>`).join('');
      return `<tr><td><strong>${escapeHtml(campaignName(row))}</strong><span class="sub-text" style="display:block">${escapeHtml(row.platform || '—')}</span></td><td style="white-space:nowrap">${escapeHtml(row.periodStart)} → ${escapeHtml(row.periodEnd)}</td><td>${number(days)}</td><td>${money(row.spend)}</td><td>${days && row.spend != null ? money(row.spend / days) : '—'}</td><td>${number(row.impressions)}</td><td>${number(row.clicks)}</td><td>${ctr === null ? '—' : number(Math.round(ctr * 100) / 100, '%')}</td><td>${number(row.messages)}</td><td>${number(row.calls)}</td>${custom}<td>${model.canManage ? `<button type="button" class="btn btn-danger btn-sm" data-ads-delete-period="${escapeHtml(row.id)}">Sil</button>` : ''}</td></tr>`;
    }).join('');
    const customHeaders = customMetrics.map(metric => `<th title="${escapeHtml(AD_METRIC_FIELDS[metric.num])} ${metric.op === '*' ? '×' : '÷'} ${escapeHtml(AD_METRIC_FIELDS[metric.den])}${metric.percent ? ' × 100' : ''}">${escapeHtml(metric.name)}</th>`).join('');
    const periodList = `<div class="card" style="padding:14px;margin-bottom:14px;overflow:auto"><h3 style="margin:0 0 10px">Kayıtlı reklam dönemleri</h3>${model.periods.length ? `<table class="data-table"><thead><tr><th>Kampanya</th><th>Dönem</th><th>Gün</th><th>Harcama</th><th>Günlük ort.</th><th>Gösterim</th><th>Tıklama</th><th>CTR</th><th>Mesaj</th><th>Arama</th>${customHeaders}<th></th></tr></thead><tbody>${periodRows}</tbody></table>` : '<p class="empty-state">Henüz reklam dönemi yok.</p>'}</div>`;
    const fieldOptions = Object.keys(AD_METRIC_FIELDS).map(key => `<option value="${key}">${escapeHtml(AD_METRIC_FIELDS[key])}</option>`).join('');
    const customMetricAdmin = model.canManage ? `<form data-ads-custom-metric-form class="card" style="padding:16px;margin-bottom:14px"><h3 style="margin:0 0 6px">Kendi metriğini ekle</h3><p class="sub-text" style="margin:0 0 10px">İki alanı bölerek ya da çarparak tabloya yeni bir sütun ekleyin (örn. Harcama ÷ Mesaj = mesaj başı maliyet). En fazla ${MAX_CUSTOM_METRICS} metrik.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;align-items:end"><label style="display:grid;gap:5px;font-size:12px">Ad<input class="form-control" name="name" required maxlength="40" placeholder="Örn: Mesaj maliyeti"></label><label style="display:grid;gap:5px;font-size:12px">Alan<select class="form-control" name="num">${fieldOptions}</select></label><label style="display:grid;gap:5px;font-size:12px">İşlem<select class="form-control" name="op"><option value="/">÷ böl</option><option value="*">× çarp</option></select></label><label style="display:grid;gap:5px;font-size:12px">Alan<select class="form-control" name="den">${fieldOptions}</select></label><label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" name="percent" value="1"> Yüzde (×100)</label><button class="btn btn-primary btn-sm" type="submit">Metriği ekle</button></div>${customMetrics.length ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${customMetrics.map(metric => `<span class="badge">${escapeHtml(metric.name)} = ${escapeHtml(AD_METRIC_FIELDS[metric.num])} ${metric.op === '*' ? '×' : '÷'} ${escapeHtml(AD_METRIC_FIELDS[metric.den])}${metric.percent ? ' %' : ''} <button type="button" class="btn-text" data-ads-delete-metric="${escapeHtml(metric.id)}" aria-label="Metriği sil">✕</button></span>`).join('')}</div>` : ''}</form>` : '';
    const manualForm = `
      <form data-ads-manual-form class="card" style="padding:16px;margin-bottom:14px">
        <h3 style="margin:0 0 6px">Reklam dönemi ekle</h3>
        <p class="sub-text" style="margin:0 0 12px">Kaydetme işlemi reklam giderini Finans'a aynı işlem içinde bağlar.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end">
          <label style="display:grid;gap:5px;font-size:12px">Kampanya<select class="form-control" name="campaignId" required>${campaignOptions}</select></label>
          <label style="display:grid;gap:5px;font-size:12px">Platform<select class="form-control" name="platform" required><option value="META">Meta</option><option value="GOOGLE">Google</option></select></label>
          <label style="display:grid;gap:5px;font-size:12px">Başlangıç<input class="form-control" type="date" name="periodStart" required></label>
          <label style="display:grid;gap:5px;font-size:12px">Bitiş<input class="form-control" type="date" name="periodEnd" required></label>
          <label style="display:grid;gap:5px;font-size:12px">Sonuç türü<select class="form-control" name="resultType" required><option value="MESSAGE">Mesaj</option><option value="CALL">Arama</option><option value="OTHER">Diğer</option></select></label>
          <label style="display:grid;gap:5px;font-size:12px">Harcama<input class="form-control" type="number" name="spend" min="0" step="0.01"></label>
          <label style="display:grid;gap:5px;font-size:12px">Gösterim<input class="form-control" type="number" name="impressions" min="0" step="1"></label>
          <label style="display:grid;gap:5px;font-size:12px">Tıklama<input class="form-control" type="number" name="clicks" min="0" step="1"></label>
          <label style="display:grid;gap:5px;font-size:12px">Mesaj<input class="form-control" type="number" name="messages" min="0" step="1"></label>
          <label style="display:grid;gap:5px;font-size:12px">Arama<input class="form-control" type="number" name="calls" min="0" step="1"></label>
          <button class="btn btn-primary btn-sm" type="submit">Dönemi kaydet</button>
        </div>
      </form>`;
    const spendTrend = model.spendTrendPct === null || model.spendTrendPct === undefined
      ? 'Önceki eş dönem karşılaştırması için veri yok'
      : `Önceki eş döneme göre ${model.spendTrendPct > 0 ? '+' : ''}${number(model.spendTrendPct, '%')} (${money(model.priorSpend)} → ${money(model.totalSpend)})`;
    const emptyCta = !model.metrics.length && model.loadStatus !== 'LOADING' && model.canManage
      ? '<div style="display:flex;justify-content:center;margin:-4px 0 14px"><button type="button" class="btn btn-primary btn-sm" data-ads-view="import">Meta CSV yükle</button></div>' : '';
    const resultNote = state.adsImportResult ? `<div class="card ads-notice ads-notice-emerald"><strong>Kaydedildi</strong><div class="sub-text">${escapeHtml(state.adsImportResult)}</div></div>` : '';
    const sections = {
      overview: `${resultNote}
      <div class="card" style="padding:14px;margin-bottom:14px"><strong>Seçili dönem reklam toplamı: ${money(model.totalSpend)}</strong><div class="sub-text">${escapeHtml(spendTrend)}</div></div>
      <div class="card" style="padding:14px;margin-bottom:14px;border-left:4px solid #f59e0b"><strong>Atıf sınırı</strong><div class="sub-text">Talep kaynağı kanal düzeyinde ölçülür; hangi reklamın rezervasyon getirdiği ölçülemez. Kampanya ROAS'ı gösterilmez.</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px">${metricCards}</div>${emptyCta}
      <div class="card" style="padding:14px;overflow:auto"><h3 style="margin:0 0 10px">Kanal → talep maliyeti</h3><table class="data-table"><thead><tr><th>Kanal</th><th>Harcama</th><th>Talep</th><th>Talep maliyeti</th><th>Mesaj→talep</th></tr></thead><tbody>${channelRows}</tbody></table><div class="sub-text" style="margin-top:10px">Toplam reklam harcaması ${money(model.totalSpend)} · net konaklama cirosundaki pay ${number(model.adShare.pct, '%')}</div></div>`,
      import: renderAdsImportView(state.adsImport, model.allCampaigns, model.closedMonths || []) + renderAdsAlternativeImports(campaignOptions, manualForm),
      campaigns: campaignAdmin,
      records: `${customMetricAdmin}${periodList}`
    };
    return `${renderAdsSubnav(active, model.canManage)}<div role="tabpanel" data-ads-panel="${active}">${sections[active]}</div>`;
  }

  function renderWorkspaceHtml(model, view) {
    if (view === 'funnel') return renderFunnel(model);
    if (view === 'ads') return renderAds(model.ads || buildAdsModel(model), state.adsView);
    return renderEconomics(model);
  }

  function browserInput() {
    const data = typeof appData !== 'undefined' ? appData : {};
    const filter = typeof currentFilter !== 'undefined' ? currentFilter : {};
    const financeSummary = typeof computeFilterLedger === 'function' ? computeFilterLedger() : null;
    const settings = data.tenantSettings || {};
    return {
      ...state, bookings: data.bookings || [], villas: data.villas || {}, filter, baseCurrency: 'TRY', financeSummary,
      adMetricPeriods: state.adPeriods, marketingCampaigns: data.marketingCampaigns || [],
      leadSources: data.leadSources || [], leadAcquisitions: data.leadAcquisitions || [],
      targets: { costPerMessage: settings.ads_cost_per_message_target, costPerCall: settings.ads_cost_per_call_target },
      customMetrics: settings.ads_custom_metrics || [],
      closedMonths: closedMonthKeys(data),
      canManageAds: typeof canManageTenantRole !== 'function' || canManageTenantRole(typeof activeTenant !== 'undefined' && activeTenant && activeTenant.role)
    };
  }

  function cloudScope() {
    const tenantId = typeof getActiveTenantId === 'function' ? getActiveTenantId() : null;
    if (!services.MarketingDataService || !services.MarketingDataService.UUID_RE.test(String(tenantId || ''))) return null;
    const data = typeof appData !== 'undefined' ? appData : {};
    const filter = typeof currentFilter !== 'undefined' ? currentFilter : {};
    const selectedProperty = filter.villa || 'ALL';
    if (selectedProperty === 'ALL') return { tenantId, propertyId: null };
    const propertyId = data.villas && data.villas[selectedProperty] && data.villas[selectedProperty].id;
    if (!services.MarketingDataService.UUID_RE.test(String(propertyId || ''))) return null;
    return { tenantId, propertyId };
  }

  // Backend maliyeti (kullanıcı, 05.11.2026): reklam dönemleri her sayfa yüklemesinde
  // değil, yalnız Pazarlama açıldığında ve yalnız seçili dönem + karşılaştırılan önceki
  // eş dönem için çekilir. Aynı aralık ikinci kez istenmez; yazmadan sonra
  // `reloadAdPeriods` önbelleği düşürür.
  function adsWindow(filter) {
    const selected = periodFromFilter(filter || {});
    if (!selected.start || !selected.endExclusive) return {};
    const durationDays = Math.round((Date.parse(selected.endExclusive + 'T00:00:00Z') - Date.parse(selected.start + 'T00:00:00Z')) / 86400000);
    return { from: addUtcDays(selected.start, -durationDays), to: addUtcDays(selected.endExclusive, -1) };
  }

  async function hydrateAdPeriods() {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const tenantId = typeof getActiveTenantId === 'function' ? getActiveTenantId() : null;
    const input = browserInput();
    if (!client || !services.AdsPeriodService || !services.MarketingDataService
      || !services.MarketingDataService.UUID_RE.test(String(tenantId || '')) || !input.canManageAds) {
      state.adPeriods = []; state.adPeriodsKey = null; state.adPeriodsStatus = 'IDLE'; state.adPeriodsError = null;
      return null;
    }
    const range = adsWindow(input.filter);
    const key = `${tenantId}|${range.from || ''}|${range.to || ''}`;
    if (state.adPeriodsKey === key) return null;
    state.adPeriodsKey = key;
    state.adPeriodsStatus = 'LOADING';
    try {
      const rows = await services.AdsPeriodService.loadPeriods(client, tenantId, range);
      if (state.adPeriodsKey !== key) return null;
      state.adPeriods = rows; state.adPeriodsStatus = 'OK'; state.adPeriodsError = null;
    } catch (error) {
      if (state.adPeriodsKey !== key) return null;
      state.adPeriods = []; state.adPeriodsKey = null; state.adPeriodsStatus = 'ERROR';
      state.adPeriodsError = `Reklam kayıtları okunamadı: ${error && error.message || 'bilinmeyen hata'}`;
    }
    return state.adPeriods;
  }

  async function reloadAdPeriods() {
    state.adPeriodsKey = null;
    await hydrateAdPeriods();
  }

  async function hydrateCloudData() {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope) {
      if (state.remoteScopeKey) {
        ['listings', 'snapshots', 'findings', 'media', 'placements', 'benchmarks', 'analysisRuns', 'experiments', 'healthSnapshots'].forEach(key => { state[key] = []; });
      }
      state.remoteScopeKey = null;
      state.remoteStatus = 'LOCAL';
      state.remoteErrors = [];
      return null;
    }
    const scopeKey = `${scope.tenantId}:${scope.propertyId || 'ALL'}`;
    if (state.remoteScopeKey === scopeKey && ['OK', 'PARTIAL', 'UNAVAILABLE'].includes(state.remoteStatus)) return null;
    state.remoteScopeKey = scopeKey;
    ['listings', 'snapshots', 'findings', 'media', 'placements', 'benchmarks', 'analysisRuns', 'experiments', 'healthSnapshots'].forEach(key => { state[key] = []; });
    state.remoteStatus = 'LOADING';
    state.remoteErrors = [];
    const result = await services.MarketingDataService.loadMarketingWorkspaceData(client, scope);
    if (state.remoteScopeKey !== scopeKey) return null;
    ['listings', 'snapshots', 'findings', 'media', 'placements', 'benchmarks', 'analysisRuns', 'experiments', 'healthSnapshots'].forEach(key => { state[key] = result[key]; });
    state.remoteStatus = result.status;
    state.remoteErrors = result.errors;
    return result;
  }

  function render() {
    if (typeof document === 'undefined') return null;
    const content = document.getElementById('marketingWorkspaceContent');
    const status = document.getElementById('marketingWorkspaceStatus');
    if (!content || !status) return null;
    try {
      const model = buildWorkspaceModel(browserInput());
      content.innerHTML = renderWorkspaceHtml(model, state.view);
      const sourceLabel = model.remoteStatus === 'LOADING' ? 'Bulut verisi yükleniyor'
        : model.remoteStatus === 'OK' ? 'Bulut verisi güncel'
          : model.remoteStatus === 'PARTIAL' ? `Kısmi bulut verisi (${model.remoteErrors.length} kaynak kullanılamıyor)`
            : model.remoteStatus === 'UNAVAILABLE' ? 'Bulut pazarlama verisi kullanılamıyor' : 'Yerel rezervasyon verisi';
      status.innerHTML = `<strong>${escapeHtml(model.period.label)}</strong> · ${model.selectedProperty === 'ALL' ? 'Tüm mülkler' : escapeHtml(model.selectedProperty)} · Kalış tarihine göre · ${escapeHtml(sourceLabel)}`;
      status.style.display = '';
      const badge = document.getElementById('marketingDataQualityBadge');
      if (badge) {
        const needsReview = model.economics.dataQuality.status !== 'OK'
          || model.economics.dataQuality.assumedCurrencyReservationCount > 0;
        badge.textContent = needsReview ? 'Veri kontrolü gerekli' : 'Veri kontrolü: uygun';
        badge.className = `badge ${needsReview ? 'badge-amber' : 'badge-emerald'}`;
      }
      document.querySelectorAll('[data-marketing-view]').forEach(button => {
        const active = button.dataset.marketingView === state.view;
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-secondary', !active);
        button.setAttribute('aria-selected', String(active));
      });
      return model;
    } catch (_) {
      status.textContent = 'Pazarlama çalışma alanı açılamadı. Lütfen yeniden deneyin.';
      content.innerHTML = '';
      return null;
    }
  }

  function setData(next = {}) {
    ['listings', 'snapshots', 'findings', 'media', 'placements', 'benchmarks', 'analysisRuns', 'experiments', 'healthSnapshots'].forEach(key => {
      if (Array.isArray(next[key])) state[key] = next[key].slice();
    });
    if (typeof window !== 'undefined' && !services.MarketingEngine && typeof window.renderMarketingModule === 'function') {
      return window.renderMarketingModule();
    }
    return render();
  }

  async function handleFindingAction(button) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const finding = state.findings.find(item => String(item.id) === String(button.dataset.findingId));
    if (!client || !finding || !services.MarketingReviewService) throw new Error('FINDING_REVIEW_UNAVAILABLE');
    const action = button.dataset.marketingAction;
    let reason = null;
    if (action === 'DISMISS') {
      reason = window.prompt('Bu bulguyu neden reddediyorsunuz?');
      if (reason === null) return null;
    }
    button.disabled = true;
    try {
      const result = await services.MarketingReviewService.reviewFinding(client, {
        findingId: finding.id, action, reason, finding
      });
      state.remoteStatus = 'LOADING';
      render();
      await hydrateCloudData();
      render();
      return result;
    } finally {
      button.disabled = false;
    }
  }

  async function handleSnapshotSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !services.MarketingSnapshotService) throw new Error('MANUAL_SNAPSHOT_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      // Gelecek gunleri kapsayan donem kaydedilmez (L-299): sayac henuz olusmadi.
      const result = await services.MarketingSnapshotService.recordManualSnapshot(client, {
        ...values, tenantId: scope.tenantId, today: services.LexbnbBusinessDate.getBusinessDate()
      });
      state.snapshotFormOpen = false;
      state.remoteStatus = 'LOADING';
      render();
      await hydrateCloudData();
      render();
      return result;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleBenchmarkSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !scope.propertyId || !services.MarketingBenchmarkService) throw new Error('MARKETING_BENCHMARK_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await services.MarketingBenchmarkService.recordBenchmark(client, {
        ...values, tenantId: scope.tenantId, propertyId: scope.propertyId,
        evidence: values.evidenceNote ? { note: values.evidenceNote } : {}
      });
      state.benchmarkFormOpen = false;
      state.remoteStatus = 'LOADING'; render(); await hydrateCloudData(); render();
      return result;
    } finally { if (submit) submit.disabled = false; }
  }

  async function handleListingSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !services.MarketingChannelListingService) throw new Error('CHANNEL_LISTING_SETUP_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await services.MarketingChannelListingService.saveChannelListing(client, {
        ...values, tenantId: scope.tenantId
      });
      state.listingFormOpen = false;
      state.remoteStatus = 'LOADING';
      render();
      // Mulk profili ayni listeyi okur; orada da hemen gorunsun (L-214).
      if (typeof reloadChannelListings === 'function') await reloadChannelListings();
      await hydrateCloudData();
      render();
      const status = document.getElementById('marketingWorkspaceStatus');
      if (status) status.textContent = 'Kanal ilanı kaydedildi. Mülkler › profil › Kanallar sekmesinde listelenir.';
      return result;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleExperimentSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !scope.propertyId || !services.MarketingCoverChangeService) throw new Error('COVER_CHANGE_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await services.MarketingCoverChangeService.changeCoverAndMeasure(client, {
        ...values, tenantId: scope.tenantId, propertyId: scope.propertyId
      });
      state.experimentFormOpen = false;
      state.remoteStatus = 'LOADING';
      render();
      await hydrateCloudData();
      render();
      return result;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleAdsPeriodSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !services.AdsPeriodService) throw new Error('ADS_PERIOD_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await services.AdsPeriodService.savePeriod(client, {
        ...values, tenantId: scope.tenantId, source: 'MANUAL'
      });
      if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
      await reloadAdPeriods();
      render();
      return result;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleAdsCampaignSubmit(form) {
    const scope = cloudScope();
    if (!scope || typeof cloudSaveMarketingCampaign !== 'function') throw new Error('ADS_CAMPAIGN_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const saved = await cloudSaveMarketingCampaign({
        name: values.name, platform: values.platform, villa: 'ALL',
        startDate: values.startDate || null, endDate: values.endDate || null,
        budget: values.budget || 0, status: 'ACTIVE'
      });
      if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
      render();
      return saved;
    } finally { if (submit) submit.disabled = false; }
  }

  async function handleAdsTargetSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope) throw new Error('ADS_TARGET_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const rows = [
      { tenant_id: scope.tenantId, key: 'ads_cost_per_message_target', value: Number(values.costPerMessage) },
      { tenant_id: scope.tenantId, key: 'ads_cost_per_call_target', value: Number(values.costPerCall) }
    ];
    if (rows.some(row => !(row.value > 0))) throw new Error('ADS_TARGET_INVALID');
    const { error } = await client.from('tenant_settings').upsert(rows, { onConflict: 'tenant_id,key' });
    if (error) throw error;
    if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
    render();
  }

  async function saveAdsCustomMetrics(list) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope) throw new Error('ADS_METRIC_UNAVAILABLE');
    const { error } = await client.from('tenant_settings').upsert(
      [{ tenant_id: scope.tenantId, key: 'ads_custom_metrics', value: normalizeCustomMetrics(list) }], { onConflict: 'tenant_id,key' });
    if (error) throw error;
    if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
    render();
  }

  function currentCustomMetrics() {
    const data = typeof appData !== 'undefined' ? appData : {};
    return normalizeCustomMetrics((data.tenantSettings || {}).ads_custom_metrics);
  }

  async function handleAdsCustomMetricSubmit(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const list = currentCustomMetrics();
    if (list.length >= MAX_CUSTOM_METRICS) throw new Error('ADS_METRIC_LIMIT');
    const metric = normalizeCustomMetrics([{ id: 'm' + Date.now().toString(36), name: values.name, num: values.num, op: values.op, den: values.den, percent: values.percent === '1' }])[0];
    if (!metric) throw new Error('ADS_METRIC_INVALID');
    await saveAdsCustomMetrics(list.concat(metric));
  }

  async function deleteAdsCustomMetric(metricId) {
    await saveAdsCustomMetrics(currentCustomMetrics().filter(metric => metric.id !== metricId));
  }

  async function deleteAdsPeriod(periodId) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !services.AdsPeriodService || !periodId) throw new Error('ADS_PERIOD_UNAVAILABLE');
    if (typeof window !== 'undefined' && !window.confirm('Bu reklam dönemi ve bağlı Finans gideri silinsin mi?')) return false;
    await services.AdsPeriodService.deletePeriod(client, periodId);
    if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
    await reloadAdPeriods();
    render();
    return true;
  }

  async function deleteAdsCampaign(campaignId) {
    const scope = cloudScope();
    if (!scope || typeof cloudDeleteMarketingCampaign !== 'function' || !campaignId) throw new Error('ADS_CAMPAIGN_UNAVAILABLE');
    if (typeof window !== 'undefined' && !window.confirm('Kampanya ve bağlı reklam dönemleri silinsin mi?')) return false;
    await cloudDeleteMarketingCampaign(campaignId);
    if (typeof loadTenantAppData === 'function') await loadTenantAppData(scope.tenantId);
    await reloadAdPeriods();
    render();
    return true;
  }

  function adsTenantId() {
    const tenantId = typeof getActiveTenantId === 'function' ? getActiveTenantId() : null;
    return services.MarketingDataService && services.MarketingDataService.UUID_RE.test(String(tenantId || '')) ? tenantId : null;
  }

  // Birleştirme ve "değişecek kayıt" hesabı için yalnız dosyanın aylarına değen
  // kayıtlar okunur (backend maliyeti, kullanıcı 05.11.2026).
  async function loadAdsImportContext(importState) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const tenantId = adsTenantId();
    const days = (importState.rows || []).flatMap(row => [row.periodStart, row.periodEnd]).filter(Boolean).sort();
    if (!days.length || (importState.parseErrors || []).length) { importState.status = 'READY'; return; }
    if (!client || !tenantId || !services.AdsPeriodService) {
      importState.status = 'READY';
      importState.loadError = 'Bulut bağlantısı yok; kayıtlı reklam verisi kontrol edilemedi.';
      return;
    }
    const from = `${days[0].slice(0, 7)}-01`;
    const last = days[days.length - 1];
    const to = addUtcDays(`${new Date(Date.UTC(Number(last.slice(0, 4)), Number(last.slice(5, 7)), 1)).toISOString().slice(0, 10)}`, -1);
    try {
      importState.existing = await services.AdsPeriodService.loadPeriods(client, tenantId, { from, to });
      importState.loadError = null;
    } catch (error) {
      importState.existing = [];
      importState.loadError = `Kayıtlı reklam verisi okunamadı: ${error && error.message || 'bilinmeyen hata'}`;
    }
    importState.status = 'READY';
  }

  async function startAdsImport(importState) {
    state.adsImport = importState;
    state.adsImportResult = null;
    state.adsView = 'import';
    render();
    await loadAdsImportContext(importState);
    if (state.adsImport === importState) render();
  }

  const ADS_MAX_FILE_BYTES = 5 * 1024 * 1024;
  async function handleAdsFile(file) {
    const parser = services.AdsImportParser;
    if (!file || !parser) return null;
    const base = { mode: 'CSV_META', fileName: file.name, rows: [], parseWarnings: [], existing: [], mapping: {}, status: 'LOADING' };
    if (file.size > ADS_MAX_FILE_BYTES) {
      return startAdsImport({ ...base, parseErrors: [{ text: 'Dosya 5 MB\'tan büyük. Meta\'da kampanyalar düzeyinde ve en fazla birkaç aylık dönem seçerek indirin.' }] });
    }
    // Excel-TR ile yeniden kaydedilen CSV windows-1254 olur; file.text() onu
    // UTF-8 sanıp kampanya adlarını bozardı. Kod sayfası ortak motorla çözülür.
    const buffer = await file.arrayBuffer();
    const engine = typeof FinanceImportEngine !== 'undefined' ? FinanceImportEngine : null;
    const text = engine ? engine.decodeImportText(new Uint8Array(buffer)) : new TextDecoder('utf-8').decode(buffer);
    const parsed = parser.parseCsv(text, 'META');
    return startAdsImport({ ...base, rows: parsed.rows, parseErrors: parsed.errors, parseWarnings: parsed.warnings || [] });
  }

  function handleAdsImportPreview(form) {
    const parser = services.AdsImportParser;
    if (!parser) throw new Error('ADS_IMPORT_PARSER_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const parsed = parser.parsePasted(values.payload);
    return startAdsImport({ mode: 'CHATGPT', fileName: 'ChatGPT çıktısı', rows: parsed.rows, parseErrors: parsed.errors,
      parseWarnings: parsed.warnings || [], existing: [], mapping: {}, status: 'LOADING' });
  }

  function adsImportErrorText(error) {
    const message = String(error && error.message || '');
    if (error && error.code === 'PHASE111_NOT_APPLIED') return message.replace(/^PHASE111_NOT_APPLIED:\s*/, '');
    if (/ADS_PARTIAL_OVERLAP/.test(message)) return message.replace(/^.*?ADS_PARTIAL_OVERLAP:\s*/, '');
    if (/CLOSED_PERIOD/.test(message)) return 'Dosya kapatılmış bir aya dokunuyor; reklam gideri o aya yazılamaz. Ayı yeniden açın ya da o günleri çıkarın.';
    if (error && error.code === '42501' || /FORBIDDEN_ROLE/.test(message)) return 'Bu işlem için yönetim ve finans yazma izni gerekir (Ayarlar → Ekip → İzinler).';
    return `Kaydedilemedi: ${message || 'bilinmeyen hata'}. Hiçbir satır yazılmadı.`;
  }

  async function handleAdsImportConfirm(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const tenantId = adsTenantId();
    const importState = state.adsImport;
    const data = typeof appData !== 'undefined' ? appData : {};
    const plan = adsImportPlan(importState, data.marketingCampaigns || [], closedMonthKeys(data));
    if (!client || !tenantId || !services.AdsPeriodService || !plan || plan.errors.length
      || (importState.parseErrors || []).length || importState.loadError || importState.status !== 'READY') throw new Error('ADS_IMPORT_NOT_READY');
    importState.status = 'SAVING';
    importState.saveError = null;
    render();
    try {
      const source = importState.mode === 'CSV_META' ? 'CSV' : 'SCREENSHOT_CHATGPT';
      const result = await services.AdsPeriodService.importBatch(client, tenantId, plan.newCampaigns, plan.rows.map(row => ({ ...row, source })));
      const created = (result && result.created_campaigns || []).length;
      const replaced = result && result.replaced_periods || 0;
      state.adsImport = null;
      state.adsView = 'overview';
      state.adsImportResult = `${number(result && result.inserted_periods)} dönem kaydedildi · ${money(result && result.spend_total)} Finans giderine yazıldı`
        + (created ? ` · ${number(created)} yeni kampanya açıldı` : '') + (replaced ? ` · ${number(replaced)} eski kayıt yenisiyle değişti` : '');
      if (typeof loadTenantAppData === 'function') await loadTenantAppData(tenantId);
      await reloadAdPeriods();
    } catch (error) {
      importState.status = 'READY';
      importState.saveError = adsImportErrorText(error);
    }
    render();
    return form;
  }

  function initializeBrowser() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-marketing-view]').forEach(button => button.addEventListener('click', () => {
      state.view = button.dataset.marketingView;
      render();
    }));
    const content = document.getElementById('marketingWorkspaceContent');
    if (content) content.addEventListener('click', event => {
      const adsViewButton = event.target.closest('[data-ads-view]');
      if (adsViewButton) {
        state.adsView = adsViewButton.dataset.adsView;
        if (state.adsView !== 'overview') state.adsImportResult = null;
        render();
        return;
      }
      if (event.target.closest('[data-ads-import-reset]')) {
        state.adsImport = null;
        render();
        return;
      }
      const open = event.target.closest('[data-marketing-open-snapshot]');
      const cancel = event.target.closest('[data-marketing-cancel-snapshot]');
      const openListing = event.target.closest('[data-marketing-open-listing]');
      const cancelListing = event.target.closest('[data-marketing-cancel-listing]');
      const openExperiment = event.target.closest('[data-marketing-open-experiment]');
      const cancelExperiment = event.target.closest('[data-marketing-cancel-experiment]');
      const openBenchmark = event.target.closest('[data-marketing-open-benchmark]');
      const cancelBenchmark = event.target.closest('[data-marketing-cancel-benchmark]');
      if (open) { state.snapshotFormOpen = true; state.listingFormOpen = false; render(); return; }
      if (cancel) { state.snapshotFormOpen = false; render(); return; }
      if (openListing) { state.listingFormOpen = true; state.snapshotFormOpen = false; render(); return; }
      if (cancelListing) { state.listingFormOpen = false; render(); return; }
      if (openExperiment) { state.experimentFormOpen = true; render(); return; }
      if (cancelExperiment) { state.experimentFormOpen = false; render(); return; }
      if (openBenchmark) { state.benchmarkFormOpen = true; render(); return; }
      if (cancelBenchmark) { state.benchmarkFormOpen = false; render(); return; }
      const deleteMetricButton = event.target.closest('[data-ads-delete-metric]');
      if (deleteMetricButton) {
        deleteAdsCustomMetric(deleteMetricButton.dataset.adsDeleteMetric).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Metrik silinemedi. Yetkiyi kontrol edin.';
        });
        return;
      }
      const deleteSnapshotButton = event.target.closest('[data-marketing-delete-snapshot]');
      if (deleteSnapshotButton) {
        deleteSnapshot(deleteSnapshotButton.dataset.marketingDeleteSnapshot).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Snapshot silinemedi. Lütfen yeniden deneyin.';
        });
        return;
      }
      const deletePeriodButton = event.target.closest('[data-ads-delete-period]');
      if (deletePeriodButton) {
        deleteAdsPeriod(deletePeriodButton.dataset.adsDeletePeriod).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Reklam dönemi silinemedi. Yetkiyi ve kapanmış ayları kontrol edin.';
        });
        return;
      }
      const deleteCampaignButton = event.target.closest('[data-ads-delete-campaign]');
      if (deleteCampaignButton) {
        deleteAdsCampaign(deleteCampaignButton.dataset.adsDeleteCampaign).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Kampanya silinemedi. Bağlı dönemleri ve yetkiyi kontrol edin.';
        });
        return;
      }
      const actionButton = event.target.closest('[data-marketing-action][data-finding-id]');
      if (!actionButton) return;
      handleFindingAction(actionButton).catch(() => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = 'Bulgu güncellenemedi. Lütfen yeniden deneyin.';
      });
    });
    if (content) content.addEventListener('submit', event => {
      const campaignForm = event.target.closest('[data-ads-campaign-form]');
      if (campaignForm) {
        event.preventDefault();
        handleAdsCampaignSubmit(campaignForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Kampanya kaydedilemedi. Alanları ve yetkiyi kontrol edin.';
        });
        return;
      }
      const customMetricForm = event.target.closest('[data-ads-custom-metric-form]');
      if (customMetricForm) {
        event.preventDefault();
        handleAdsCustomMetricSubmit(customMetricForm).catch(error => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = error && error.message === 'ADS_METRIC_LIMIT'
            ? 'En fazla 8 metrik tanımlanabilir; önce birini silin.'
            : 'Metrik kaydedilemedi. Ad ve alanları kontrol edin.';
        });
        return;
      }
      const targetForm = event.target.closest('[data-ads-target-form]');
      if (targetForm) {
        event.preventDefault();
        handleAdsTargetSubmit(targetForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Reklam hedefleri kaydedilemedi. Pozitif tutar girin.';
        });
        return;
      }
      const adsConfirm = event.target.closest('[data-ads-import-confirm]');
      if (adsConfirm) {
        event.preventDefault();
        handleAdsImportConfirm(adsConfirm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Reklam satırları kaydedilemedi. Çakışan dönemleri ve yetkiyi kontrol edin.';
        });
        return;
      }
      const adsImport = event.target.closest('[data-ads-import-form]');
      if (adsImport) {
        event.preventDefault();
        Promise.resolve().then(() => handleAdsImportPreview(adsImport)).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Reklam verisi okunamadı. Başlığı kontrol edin.';
        });
        return;
      }
      const adsForm = event.target.closest('[data-ads-manual-form]');
      if (adsForm) {
        event.preventDefault();
        handleAdsPeriodSubmit(adsForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Reklam dönemi kaydedilemedi. Yetkiyi, kampanyayı ve tarih aralığını kontrol edin.';
        });
        return;
      }
      const benchmarkForm = event.target.closest('[data-marketing-benchmark-form]');
      if (benchmarkForm) {
        event.preventDefault();
        handleBenchmarkSubmit(benchmarkForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Pazarlama referansı kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
        });
        return;
      }
      const experimentForm = event.target.closest('[data-marketing-experiment-form]');
      if (experimentForm) {
        event.preventDefault();
        handleExperimentSubmit(experimentForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Değişiklik ölçümü başlatılamadı. Lütfen yeniden deneyin.';
        });
        return;
      }
      const listingForm = event.target.closest('[data-marketing-listing-form]');
      if (listingForm) {
        event.preventDefault();
        handleListingSubmit(listingForm).catch(error => {
          const status = document.getElementById('marketingWorkspaceStatus');
          const api = services.MarketingChannelListingService;
          if (status) status.textContent = api && api.errorMessage ? api.errorMessage(error) : 'Kanal ilanı kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
        });
        return;
      }
      const form = event.target.closest('[data-marketing-snapshot-form]');
      if (!form) return;
      event.preventDefault();
      handleSnapshotSubmit(form).catch(error => {
        const status = document.getElementById('marketingWorkspaceStatus');
        const gelecek = /SNAPSHOT_PERIOD_IN_FUTURE/.test(String(error && error.message || ''));
        if (status) status.textContent = gelecek
          ? 'Snapshot dönemi bugünü geçemez: bitiş (hariç) en geç yarın olabilir. Gelecek günlerin sayacı henüz oluşmadı.'
          : 'Snapshot kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
      });
    });
    const fileReadFailed = () => {
      const status = document.getElementById('marketingWorkspaceStatus');
      if (status) status.textContent = 'Seçilen reklam dosyası okunamadı.';
    };
    if (content) content.addEventListener('change', event => {
      const mapSelect = event.target.closest('[data-ads-map-campaign]');
      if (mapSelect && state.adsImport) {
        state.adsImport.mapping = { ...(state.adsImport.mapping || {}), [mapSelect.dataset.adsMapCampaign]: mapSelect.value };
        render();
        return;
      }
      const input = event.target.closest('[data-ads-import-file]');
      const file = input && input.files && input.files[0];
      if (file) handleAdsFile(file).catch(fileReadFailed);
    });
    if (content) {
      // Bırakma kutunun dışına düşerse tarayıcı dosyayı açıp uygulamadan çıkar (phase33 dersi).
      ['dragenter', 'dragover'].forEach(type => content.addEventListener(type, event => {
        const zone = event.target.closest('[data-ads-dropzone]');
        if (!zone) return;
        event.preventDefault();
        zone.classList.add('dropzone-active');
      }));
      ['dragleave', 'dragend'].forEach(type => content.addEventListener(type, event => {
        const zone = event.target.closest('[data-ads-dropzone]');
        if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('dropzone-active');
      }));
      content.addEventListener('drop', event => {
        const zone = event.target.closest('[data-ads-dropzone]');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('dropzone-active');
        const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
        if (file) handleAdsFile(file).catch(fileReadFailed);
      });
      if (typeof window.addEventListener === 'function') ['dragover', 'drop'].forEach(type => window.addEventListener(type, event => {
        const types = event.dataTransfer && Array.from(event.dataTransfer.types || []);
        if (types && types.includes('Files') && !(event.target.closest && event.target.closest('[data-ads-dropzone], input[type="file"]'))) event.preventDefault();
      }));
    }
    // switchTab() in app.js invokes this global hook. Replacing it prevents the
    // hidden legacy demo from rendering while preserving the existing router.
    window.openMarketingListingManager = function openMarketingListingManager(propertyId) {
      state.view = 'funnel';
      state.listingFormOpen = true;
      state.listingPropertyId = propertyId || null;
      if (typeof switchTab === 'function') switchTab('marketing');
      else render();
    };
    window.renderMarketingModule = function renderMarketingWorkspace() {
      return ensureBrowserDependencies().then(() => {
        render();
        return Promise.all([hydrateCloudData(), hydrateAdPeriods()]);
      }).then(render).catch(() => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = 'Pazarlama verisi yüklenemedi. Lütfen yeniden deneyin.';
        return null;
      });
    };
    if (document.getElementById('tab-marketing')?.classList.contains('active')) window.renderMarketingModule();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') initializeBrowser();

  return { renderSnapshotList, deleteSnapshot, periodFromFilter, adsWindow, scopeBookings, buildWorkspaceModel, getCurrentModel: () => buildWorkspaceModel(browserInput()), buildAdsModel, adsImportPlan, renderAdsImportView, selectLatestSnapshot, selectCurrentBenchmark, renderWorkspaceHtml, renderAds, normalizeCustomMetrics, evaluateCustomMetric, campaignBudgetView, renderMarketingHealth, renderBenchmarkPanel, renderBenchmarkForm, renderFindingActions, renderListingForm, renderSnapshotForm, renderExperimentForm, renderExperiments, escapeHtml, setData, render };
}));
