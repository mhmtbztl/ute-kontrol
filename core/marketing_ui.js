// =============================================================================
// LEXBNB PHASE 17 — MARKETING WORKSPACE UI ADAPTER
// Keeps the large legacy app.js untouched and renders only evidence-backed data.
// =============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory({
      MarketingEngine: require('./marketing_engine'),
      MarketingFunnelService: require('./marketing_funnel_service'),
      MarketingPriorityService: require('./marketing_priority_service')
    });
  } else {
    root.LexBnBMarketingUI = factory(root);
  }
}(typeof self !== 'undefined' ? self : this, function (services) {
  'use strict';

  const state = {
    view: 'economics',
    snapshots: [],
    findings: [],
    media: [],
    analysisRuns: [],
    experiments: []
  };

  const CHANNEL_LABELS = Object.freeze({
    AIRBNB: 'Airbnb', BOOKING_COM: 'Booking.com', VRBO: 'Vrbo', EXPEDIA: 'Expedia',
    DIRECT: 'Direkt', OTHER_OTA: 'Diğer OTA', UNKNOWN: 'Bilinmeyen'
  });

  const BROWSER_DEPENDENCIES = Object.freeze([
    ['MarketingEngine', 'core/marketing_engine.js?v=2756f4ec'],
    ['MarketingFunnelService', 'core/marketing_funnel_service.js?v=a5ecbdaa'],
    ['MarketingPriorityService', 'core/marketing_priority_service.js?v=f6e216ff']
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
      economics,
      snapshots: Array.isArray(input.snapshots) ? input.snapshots : [],
      findings: Array.isArray(input.findings) ? input.findings : [],
      media: Array.isArray(input.media) ? input.media : [],
      analysisRuns: Array.isArray(input.analysisRuns) ? input.analysisRuns : [],
      experiments: Array.isArray(input.experiments) ? input.experiments : []
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

    return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
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

  function renderFunnel(model) {
    if (!model.snapshots.length) {
      return emptyState('Huni verisi henüz yok', 'Airbnb/OTA panelinden manuel veya API tabanlı bir görünürlük snapshot’ı gelmeden oran üretilmez.');
    }
    const funnel = services.MarketingFunnelService;
    const latest = model.snapshots[model.snapshots.length - 1];
    const derived = funnel && funnel.deriveFunnelMetrics ? funnel.deriveFunnelMetrics(latest) : null;
    if (!derived || !derived.validation.valid) {
      return emptyState('Huni snapshot’ı doğrulanamadı', 'Sayaç sıralamasını ve negatif/eksik değerleri kontrol edin.');
    }
    const c = derived.validation.counters;
    const r = derived.rates;
    const findings = rankFindings(model.findings);
    return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      ${kpi('Gösterim', number(c.impressions), `Kapsama: ${number(derived.validation.coveragePercent, '%')}`)}
      ${kpi('İlan görüntüleme', number(c.listingViews), `Arama → görüntüleme: ${number(r.searchToViewCtrPercent, '%')}`)}
      ${kpi('Rezervasyon denemesi', number(c.bookingAttempts), `Görüntüleme → deneme: ${number(r.viewToAttemptConversionPercent, '%')}`)}
      ${kpi('Platform rezervasyonu', number(c.platformReportedBookings), `Görüntüleme → rezervasyon: ${number(r.viewToBookingConversionPercent, '%')}`)}
    </div>${renderFindings(findings)}`;
  }

  function rankFindings(findings) {
    const priority = services.MarketingPriorityService;
    if (!findings.length || !priority || !priority.selectTopMarketingActions) return findings.slice(0, 3);
    try { return priority.selectTopMarketingActions(findings); } catch (_) { return findings.slice(0, 3); }
  }

  function renderFindings(findings) {
    if (!findings.length) return emptyState('Açık pazarlama bulgusu yok', 'Yeterli örneklem oluştuğunda kanıta dayalı bulgular burada listelenecek.');
    return `<div class="card" style="padding:16px"><h3 style="margin-top:0">Öncelikli bulgular</h3>${findings.map(item => `<div style="padding:12px 0;border-top:1px solid rgba(148,163,184,.2)"><strong>${escapeHtml(item.title || item.findingCode || item.finding_code || 'Pazarlama bulgusu')}</strong><div class="sub-text">${escapeHtml(item.evidenceText || item.evidence_text || item.observation || 'Kanıt açıklaması bekleniyor.')}</div><div style="margin-top:6px;font-size:12px">Güven: ${escapeHtml(item.confidenceTier || item.confidence_tier || 'BELİRSİZ')}${item.priority ? ` · Öncelik: ${number(item.priority.score)}` : ''}</div></div>`).join('')}</div>`;
  }

  function renderGallery(model) {
    if (!model.media.length && !model.analysisRuns.length && !model.experiments.length) {
      return emptyState('Galeri analizi henüz yok', 'Özel medya kaydı ve tamamlanmış analiz işi olmadan kalite puanı veya değişiklik önerisi üretilmez.');
    }
    return `<div style="display:flex;gap:10px;flex-wrap:wrap">
      ${kpi('Medya kaydı', number(model.media.length), 'Yetkili özel medya')}
      ${kpi('Analiz çalışması', number(model.analysisRuns.length), 'Durumu izlenen işler')}
      ${kpi('Gözlemsel deney', number(model.experiments.length), 'A/B testi olarak sunulmaz')}
    </div><div class="card" style="padding:14px;margin-top:12px">Fotoğraf kararları yalnızca yapılandırılmış analiz sonucu ve doğrulanmış kapsam ile gösterilir.</div>`;
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

  function render() {
    if (typeof document === 'undefined') return null;
    const content = document.getElementById('marketingWorkspaceContent');
    const status = document.getElementById('marketingWorkspaceStatus');
    if (!content || !status) return null;
    try {
      const model = buildWorkspaceModel(browserInput());
      content.innerHTML = renderWorkspaceHtml(model, state.view);
      status.innerHTML = `<strong>${escapeHtml(model.period.label)}</strong> · ${model.selectedProperty === 'ALL' ? 'Tüm mülkler' : escapeHtml(model.selectedProperty)} · Kalış tarihine göre`;
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
    } catch (error) {
      status.textContent = `Pazarlama çalışma alanı açılamadı: ${error.message}`;
      content.innerHTML = '';
      return null;
    }
  }

  function setData(next = {}) {
    ['snapshots', 'findings', 'media', 'analysisRuns', 'experiments'].forEach(key => {
      if (Array.isArray(next[key])) state[key] = next[key].slice();
    });
    if (typeof window !== 'undefined' && !services.MarketingEngine && typeof window.renderMarketingModule === 'function') {
      return window.renderMarketingModule();
    }
    return render();
  }

  function initializeBrowser() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-marketing-view]').forEach(button => button.addEventListener('click', () => {
      state.view = button.dataset.marketingView;
      render();
    }));
    // switchTab() in app.js invokes this global hook. Replacing it prevents the
    // hidden legacy demo from rendering while preserving the existing router.
    window.renderMarketingModule = function renderMarketingWorkspace() {
      return ensureBrowserDependencies().then(render).catch(error => {
        const status = document.getElementById('marketingWorkspaceStatus');
        if (status) status.textContent = `Pazarlama bağımlılıkları yüklenemedi: ${error.message}`;
        return null;
      });
    };
    if (document.getElementById('tab-marketing')?.classList.contains('active')) window.renderMarketingModule();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') initializeBrowser();

  return { periodFromFilter, scopeBookings, buildWorkspaceModel, renderWorkspaceHtml, escapeHtml, setData, render };
}));
