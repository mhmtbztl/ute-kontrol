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
      MarketingBenchmarkService: require('./marketing_benchmark_service'),
      MarketingCoverChangeService: require('./marketing_cover_change_service'),
      MarketingHealthResultsService: require('./marketing_health_results_service')
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
    mediaFormOpen: false,
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
    remoteScopeKey: null,
    remoteStatus: 'LOCAL',
    remoteErrors: []
  };

  const CHANNEL_LABELS = Object.freeze({
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking.com', VRBO: 'Vrbo', EXPEDIA: 'Expedia',
    DIRECT: 'Direkt', OTHER_OTA: 'Diğer OTA', UNKNOWN: 'Bilinmeyen'
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
    ['MarketingSnapshotService', 'core/marketing_snapshot_service.js?v=184ad517'],
    ['MarketingChannelListingService', 'core/marketing_channel_listing_service.js?v=f3dbce3f'],
    ['MarketingMediaUploadService', 'core/marketing_media_upload_service.js?v=37cc2d13'],
    ['MarketingExperimentService', 'core/marketing_experiment_service.js?v=4a2ffb14'],
    ['MarketingHealthResultsService', 'core/marketing_health_results_service.js?v=662edeea']
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
      return { start: `${period}-01`, endExclusive: next, label: period };
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
    return {
      period,
      selectedProperty,
      properties: Object.entries(input.villas || {}).map(([slug, property]) => ({
        slug, id: property && property.id, name: property && property.name || slug
      })),
      economics,
      listings: Array.isArray(input.listings) ? input.listings.filter(item => String(item.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED') : [],
      snapshots: Array.isArray(input.snapshots) ? input.snapshots : [],
      findings: Array.isArray(input.findings) ? input.findings : [],
      media: Array.isArray(input.media) ? input.media : [],
      placements: Array.isArray(input.placements) ? input.placements : [],
      benchmarks: Array.isArray(input.benchmarks) ? input.benchmarks : [],
      analysisRuns: Array.isArray(input.analysisRuns) ? input.analysisRuns : [],
      experiments: Array.isArray(input.experiments) ? input.experiments : [],
      healthSnapshots: Array.isArray(input.healthSnapshots) ? input.healthSnapshots : [],
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
    const rows = report.channels.map(row => `<tr>
      <td><strong>${escapeHtml(CHANNEL_LABELS[row.channel] || row.channel)}</strong>${row.channel === 'UNKNOWN' ? '<div class="sub-text">Eşleme gerekli</div>' : ''}</td>
      <td>${number(row.reservationCount)}</td><td>${number(row.bookedNights)}</td>
      <td>${money(row.roomRevenueBeforeDistribution, report.currency)}</td>
      <td>${money(row.distributionCost, report.currency)}</td>
      <td>${money(row.roomRevenueAfterDistribution, report.currency)}</td>
      <td>${money(row.netRoomAdr, report.currency)}</td>
    </tr>`).join('');
    const unknown = report.dataQuality.unknownRawChannels;
    const warnings = [];
    if (unknown.length) warnings.push(`Eşlenmemiş kanal: ${unknown.join(', ')}`);
    if (report.dataQuality.assumedCurrencyReservationCount) warnings.push(`${report.dataQuality.assumedCurrencyReservationCount} rezervasyonda para birimi TRY varsayıldı.`);
    warnings.push('Kanal bazlı müsait gece verilmediği için RevPAR gösterilmiyor.');

    return `${renderMarketingHealth(model)}${renderBenchmarkPanel(model)}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpi('Oda geliri', money(totals.roomRevenueBeforeDistribution, report.currency), 'Temizlik hariç, komisyon öncesi')}
      ${kpi('Dağıtım maliyeti', money(totals.distributionCost, report.currency), 'Yalnızca kaydedilmiş komisyon')}
      ${kpi('Net oda geliri', money(totals.roomRevenueAfterDistribution, report.currency), 'Komisyon sonrası')}
      ${kpi('Net ADR', money(totals.netRoomAdr, report.currency), `${number(totals.bookedNights)} satılmış gece`)}
      ${kpi('Direkt rezervasyon', number(report.mix.directReservationSharePercent, '%'), 'Rezervasyon adedi payı')}
    </div>
    <div class="card" style="padding:0;overflow:auto">
      <table style="width:100%;border-collapse:collapse;min-width:780px"><thead><tr>
        <th>Kanal</th><th>Rez.</th><th>Gece</th><th>Oda geliri</th><th>Komisyon</th><th>Net oda geliri</th><th>Net ADR</th>
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
    const numeric = (name, label, max = '', step = '0.001') => `<label style="display:grid;gap:5px;font-size:12px">${label}<input class="form-control" type="number" min="0"${max ? ` max="${max}"` : ''} step="${step}" name="${name}" placeholder="Boş bırakılabilir"></label>`;
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
    const toolbar = `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-open-listing>＋ Kanal ilanı ekle</button><button type="button" class="btn btn-primary btn-sm" data-marketing-open-snapshot>＋ Manuel snapshot ekle</button></div>`;
    const listingForm = state.listingFormOpen ? renderListingForm(model) : '';
    const form = state.snapshotFormOpen ? renderSnapshotForm(model) : '';
    if (!model.snapshots.length) {
      return `${toolbar}${listingForm}${form}${emptyState('Huni verisi henüz yok', 'Airbnb/OTA panelinden manuel veya API tabanlı bir görünürlük snapshot’ı gelmeden oran üretilmez.')}`;
    }
    const funnel = services.MarketingFunnelService;
    const latest = selectLatestSnapshot(model.snapshots);
    const derived = funnel && funnel.deriveFunnelMetrics ? funnel.deriveFunnelMetrics(latest) : null;
    if (!derived || !derived.validation.valid) {
      return `${toolbar}${listingForm}${form}${emptyState('Huni snapshot’ı doğrulanamadı', 'Sayaç sıralamasını ve negatif/eksik değerleri kontrol edin.')}`;
    }
    const c = derived.validation.counters;
    const r = derived.rates;
    const findings = rankFindings(model.findings);
    return `${toolbar}${listingForm}${form}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpi('Gösterim', number(c.impressions), `Kapsama: ${number(derived.validation.coveragePercent, '%')}`)}
      ${kpi('İlan görüntüleme', number(c.listingViews), `Arama → görüntüleme: ${number(r.searchToViewCtrPercent, '%')}`)}
      ${kpi('Rezervasyon denemesi', number(c.bookingAttempts), `Görüntüleme → deneme: ${number(r.viewToAttemptConversionPercent, '%')}`)}
      ${kpi('Platform rezervasyonu', number(c.platformReportedBookings), `Görüntüleme → rezervasyon: ${number(r.viewToBookingConversionPercent, '%')}`)}
    </div>${renderFindings(findings)}`;
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
      ['EXPEDIA', 'Expedia'], ['DIRECT', 'Direkt'], ['OTHER_OTA', 'Diğer OTA (ETS Tur vb.)']
    ].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `<form data-marketing-listing-form class="card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px">Kanal ilanı tanımla</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px">
        <label style="display:grid;gap:5px;font-size:12px">Mülk<select class="form-control" name="propertyId" required>${propertyOptions}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">Kanal<select class="form-control" name="channelCode" required>${channelOptions}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">İlan ID / sabit referans<input class="form-control" name="externalListingId" maxlength="200" required placeholder="Örn. Airbnb ilan ID"></label>
        <label style="display:grid;gap:5px;font-size:12px">Platform / ilan adı<input class="form-control" name="displayName" maxlength="200" placeholder="Platformdaki ilan adı"></label>
        <label style="display:grid;gap:5px;font-size:12px">İlan URL’si<input class="form-control" type="url" name="externalUrl" placeholder="https://..." inputmode="url"></label>
        <label style="display:grid;gap:5px;font-size:12px">Ödeme para birimi<input class="form-control" name="payoutCurrency" value="TRY" minlength="3" maxlength="3" required></label>
      </div>
      <div class="sub-text" style="margin-top:10px">ETS Tur gibi listede olmayan bir kanal için “Diğer OTA” seçin ve platform adını yazın. URL eklerseniz ChatGPT analiz paketine güvenli bağlantı olarak alınır. Sabit referans aynı kanal içinde tekrar gönderilirse mevcut kayıt güncellenir; başka mülke taşınmaz.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-listing>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm">Kanal ilanını kaydet</button></div>
    </form>`;
  }

  function renderSnapshotForm(model) {
    if (!model.listings.length) return emptyState('Kanal ilanı bulunamadı', 'Snapshot kaydetmeden önce bu mülk için aktif bir kanal ilanı tanımlanmalıdır.');
    const start = model.period.start || '';
    const end = model.period.endExclusive || '';
    const options = model.listings.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.display_name || item.displayName || item.channel_code || item.channelCode || item.id)}</option>`).join('');
    const field = (name, label) => `<label style="display:grid;gap:5px;font-size:12px">${label}<input class="form-control" type="number" min="0" step="1" name="${name}" placeholder="Bilinmiyorsa boş bırakın"></label>`;
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
    const button = (action, label, className = 'btn-secondary') => `<button type="button" class="btn btn-sm ${className}" data-marketing-action="${action}" data-finding-id="${escapeHtml(id)}">${label}</button>`;
    const actions = [];
    if (status === 'OPEN') actions.push(button('ACKNOWLEDGE', 'İncelendi'));
    if (['RESHOOT', 'ON_SITE_CONTENT'].includes(actionKind) && !item.acceptedForTask && !item.accepted_for_task) {
      actions.push(button('ACCEPT_TASK', 'Operasyon görevi oluştur', 'btn-primary'));
    }
    actions.push(button('RESOLVE', 'Çözüldü'));
    actions.push(button('DISMISS', 'Reddet'));
    return `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">${actions.join('')}</div>`;
  }

  function renderGallery(model) {
    const selected = model.selectedProperty === 'ALL' ? null : model.properties.find(item => item.slug === model.selectedProperty);
    const selectedId = selected && selected.id;
    const activeMedia = model.media.filter(item => (!selectedId || (item.propertyId || item.property_id) === selectedId)
      && String(item.mediaStatus || item.media_status || '').toUpperCase() === 'ACTIVE');
    const scopedListings = model.listings.filter(item => !selectedId || (item.propertyId || item.property_id) === selectedId);
    const experimentDisabled = !selectedId || !scopedListings.length || activeMedia.length < 2;
    const toolbar = `<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-open-experiment${experimentDisabled ? ' disabled' : ''}>Kapağı değiştir ve ölç</button><button type="button" class="btn btn-primary btn-sm" data-marketing-open-media>＋ Fotoğraf yükle</button></div>`;
    const form = state.mediaFormOpen ? renderMediaUploadForm(model) : '';
    const experimentForm = state.experimentFormOpen ? renderExperimentForm(model) : '';
    if (!model.media.length && !model.experiments.length) {
      return `${toolbar}${form}${experimentForm}${emptyState('Galeri henüz boş', 'Fotoğraf yüklediğinizde kanal kapaklarını kaydedip değişikliklerin etkisini ölçebilirsiniz.')}`;
    }
    return `${toolbar}${form}${experimentForm}<div style="display:flex;gap:10px;flex-wrap:wrap">
      ${kpi('Medya kaydı', number(model.media.length), 'Yetkili özel medya')}
      ${kpi('Gözlemsel deney', number(model.experiments.length), 'A/B testi olarak sunulmaz')}
    </div>${renderExperiments(model.experiments, selectedId)}`;
  }

  function renderMediaUploadForm(model) {
    const properties = model.properties.filter(item => item.id);
    if (!properties.length) return emptyState('Mülk kaydı bulunamadı', 'Fotoğraf yüklemek için önce bulut hesabında bir mülk oluşturulmalıdır.');
    const selectedId = model.selectedProperty === 'ALL' ? null
      : (properties.find(item => item.slug === model.selectedProperty) || {}).id;
    const propertyOptions = properties.map(item => `<option value="${escapeHtml(item.id)}"${item.id === selectedId ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    const categories = [
      ['EXTERIOR', 'Dış mekân'], ['LIVING_ROOM', 'Salon'], ['BEDROOM', 'Yatak odası'],
      ['BATHROOM', 'Banyo'], ['KITCHEN', 'Mutfak'], ['DINING', 'Yemek alanı'],
      ['POOL', 'Havuz'], ['SPA', 'Spa / jakuzi'], ['VIEW_TERRACE', 'Manzara / teras'],
      ['AMENITY', 'Olanak'], ['OTHER', 'Diğer']
    ].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `<form data-marketing-media-form class="card" style="padding:16px;margin-bottom:14px">
      <h3 style="margin:0 0 12px">Özel galeriye fotoğraf yükle</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px">
        <label style="display:grid;gap:5px;font-size:12px">Mülk<select class="form-control" name="propertyId" required>${propertyOptions}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">Alan kategorisi<select class="form-control" name="roomCategory" required>${categories}</select></label>
        <label style="display:grid;gap:5px;font-size:12px">Fotoğraf<input class="form-control" type="file" name="mediaFile" accept="image/jpeg,image/png,image/webp,image/heic" required></label>
      </div>
      <div class="sub-text" style="margin-top:10px">JPEG, PNG, WebP veya HEIC · en fazla 25 MiB · dosya özel bucket’ta tutulur.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-marketing-cancel-media>Vazgeç</button><button type="submit" class="btn btn-primary btn-sm">Fotoğrafı yükle</button></div>
    </form>`;
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
      return `<div style="display:flex;justify-content:space-between;gap:12px"><span>${escapeHtml(item.change_date || item.changeDate || 'Tarih yok')} · ${escapeHtml(item.primary_metric || item.primaryMetric || '')}</span><strong>${escapeHtml(verdictLabels[verdict] || statusLabels[status] || status || 'Bilinmiyor')}</strong></div>`;
    }).join('')}</div><div class="sub-text" style="margin-top:8px">Sonuçlar nedensellik kanıtı olarak sunulmaz.</div></div>`;
  }

  function renderWorkspaceHtml(model, view) {
    if (view === 'funnel') return renderFunnel(model);
    if (view === 'gallery') return renderGallery(model);
    return renderEconomics(model);
  }

  function browserInput() {
    const data = typeof appData !== 'undefined' ? appData : {};
    const filter = typeof currentFilter !== 'undefined' ? currentFilter : {};
    return { ...state, bookings: data.bookings || [], villas: data.villas || {}, filter, baseCurrency: 'TRY' };
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
      const result = await services.MarketingSnapshotService.recordManualSnapshot(client, {
        ...values, tenantId: scope.tenantId
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
      await hydrateCloudData();
      render();
      return result;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleMediaSubmit(form) {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    const scope = cloudScope();
    if (!client || !scope || !services.MarketingMediaUploadService) throw new Error('MEDIA_UPLOAD_UNAVAILABLE');
    const values = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await services.MarketingMediaUploadService.uploadPropertyMedia(client, {
        tenantId: scope.tenantId, propertyId: values.propertyId,
        roomCategory: values.roomCategory, file: values.mediaFile
      });
      state.mediaFormOpen = false;
      state.remoteStatus = 'LOADING';
      render();
      await hydrateCloudData();
      render();
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

  function initializeBrowser() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-marketing-view]').forEach(button => button.addEventListener('click', () => {
      state.view = button.dataset.marketingView;
      render();
    }));
    const content = document.getElementById('marketingWorkspaceContent');
    if (content) content.addEventListener('click', event => {
      const open = event.target.closest('[data-marketing-open-snapshot]');
      const cancel = event.target.closest('[data-marketing-cancel-snapshot]');
      const openListing = event.target.closest('[data-marketing-open-listing]');
      const cancelListing = event.target.closest('[data-marketing-cancel-listing]');
      const openMedia = event.target.closest('[data-marketing-open-media]');
      const cancelMedia = event.target.closest('[data-marketing-cancel-media]');
      const openExperiment = event.target.closest('[data-marketing-open-experiment]');
      const cancelExperiment = event.target.closest('[data-marketing-cancel-experiment]');
      const openBenchmark = event.target.closest('[data-marketing-open-benchmark]');
      const cancelBenchmark = event.target.closest('[data-marketing-cancel-benchmark]');
      if (open) { state.snapshotFormOpen = true; state.listingFormOpen = false; render(); return; }
      if (cancel) { state.snapshotFormOpen = false; render(); return; }
      if (openListing) { state.listingFormOpen = true; state.snapshotFormOpen = false; render(); return; }
      if (cancelListing) { state.listingFormOpen = false; render(); return; }
      if (openMedia) { state.mediaFormOpen = true; state.experimentFormOpen = false; render(); return; }
      if (cancelMedia) { state.mediaFormOpen = false; render(); return; }
      if (openExperiment) { state.experimentFormOpen = true; state.mediaFormOpen = false; render(); return; }
      if (cancelExperiment) { state.experimentFormOpen = false; render(); return; }
      if (openBenchmark) { state.benchmarkFormOpen = true; render(); return; }
      if (cancelBenchmark) { state.benchmarkFormOpen = false; render(); return; }
      const actionButton = event.target.closest('[data-marketing-action][data-finding-id]');
      if (!actionButton) return;
      handleFindingAction(actionButton).catch(() => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = 'Bulgu güncellenemedi. Lütfen yeniden deneyin.';
      });
    });
    if (content) content.addEventListener('submit', event => {
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
      const mediaForm = event.target.closest('[data-marketing-media-form]');
      if (mediaForm) {
        event.preventDefault();
        handleMediaSubmit(mediaForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Fotoğraf yüklenemedi. Dosyayı kontrol edip yeniden deneyin.';
        });
        return;
      }
      const listingForm = event.target.closest('[data-marketing-listing-form]');
      if (listingForm) {
        event.preventDefault();
        handleListingSubmit(listingForm).catch(() => {
          const status = document.getElementById('marketingWorkspaceStatus');
          if (status) status.textContent = 'Kanal ilanı kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
        });
        return;
      }
      const form = event.target.closest('[data-marketing-snapshot-form]');
      if (!form) return;
      event.preventDefault();
      handleSnapshotSubmit(form).catch(() => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = 'Snapshot kaydedilemedi. Alanları kontrol edip yeniden deneyin.';
      });
    });
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
        return hydrateCloudData();
      }).then(render).catch(() => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = 'Pazarlama verisi yüklenemedi. Lütfen yeniden deneyin.';
        return null;
      });
    };
    if (document.getElementById('tab-marketing')?.classList.contains('active')) window.renderMarketingModule();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') initializeBrowser();

  return { periodFromFilter, scopeBookings, buildWorkspaceModel, selectLatestSnapshot, selectCurrentBenchmark, renderWorkspaceHtml, renderMarketingHealth, renderBenchmarkPanel, renderBenchmarkForm, renderFindingActions, renderListingForm, renderSnapshotForm, renderMediaUploadForm, renderExperimentForm, renderExperiments, escapeHtml, setData, render };
}));
