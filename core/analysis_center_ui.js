// =============================================================================
// LEXBNB ANALYSIS CENTER UI
// Browser controller for the tenant-scoped analysis export service.
// =============================================================================

let latestAnalysisExports = null;

function getAnalysisProperties() {
  return Object.entries((appData && appData.villas) || {})
    .filter(([, property]) => property && property.isActive !== false && !property.archivedAt)
    .map(([key, property]) => ({
      ...property,
      id: property.id || key,
      slug: property.slug || key,
      name: property.name || key
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'tr'));
}

function renderAnalysisCenter() {
  const propertyList = document.getElementById('analysisPropertyList');
  if (!propertyList) return;

  const startInput = document.getElementById('analysisStartDate');
  const endInput = document.getElementById('analysisEndDate');
  if (startInput && !startInput.value) startInput.value = currentFilter.startDate || `${getTodayStr().slice(0, 7)}-01`;
  if (endInput && !endInput.value) endInput.value = currentFilter.endDate || getTodayStr();

  const selectedBeforeRender = new Set(
    Array.from(propertyList.querySelectorAll('input[name="analysisProperty"]:checked')).map(input => input.value)
  );
  const shouldSelectAll = selectedBeforeRender.size === 0 || document.getElementById('analysisAllProperties')?.checked;
  propertyList.replaceChildren();

  const properties = getAnalysisProperties();
  properties.forEach(property => {
    const label = document.createElement('label');
    label.className = 'analysis-check';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'analysisProperty';
    checkbox.value = property.id;
    checkbox.checked = shouldSelectAll || selectedBeforeRender.has(property.id);
    checkbox.addEventListener('change', syncAnalysisAllProperties);

    const text = document.createElement('span');
    text.textContent = property.name;
    label.append(checkbox, text);
    propertyList.appendChild(label);
  });

  const allCheckbox = document.getElementById('analysisAllProperties');
  if (allCheckbox) {
    allCheckbox.disabled = properties.length === 0;
    allCheckbox.checked = properties.length > 0 && properties.every(property => {
      const checkbox = Array.from(propertyList.querySelectorAll('input[name="analysisProperty"]'))
        .find(input => input.value === property.id);
      return checkbox && checkbox.checked;
    });
  }
}

function toggleAnalysisProperties(checked) {
  document.querySelectorAll('input[name="analysisProperty"]').forEach(input => {
    input.checked = checked;
  });
}

function syncAnalysisAllProperties() {
  const checkboxes = Array.from(document.querySelectorAll('input[name="analysisProperty"]'));
  const allCheckbox = document.getElementById('analysisAllProperties');
  if (allCheckbox) allCheckbox.checked = checkboxes.length > 0 && checkboxes.every(input => input.checked);
}

function setAnalysisError(message) {
  const error = document.getElementById('analysisError');
  if (!error) return;
  error.textContent = message || '';
  error.hidden = !message;
}

function setAnalysisStatus(message) {
  const status = document.getElementById('analysisStatus');
  if (status) status.textContent = message;
}

function resetAnalysisOutput() {
  const preview = document.getElementById('analysisPromptPreview');
  const actions = document.getElementById('analysisOutputActions');
  const summary = document.getElementById('analysisSummary');
  const emptyState = document.getElementById('analysisEmptyState');
  if (preview) preview.hidden = true;
  if (actions) actions.hidden = true;
  if (summary) summary.hidden = true;
  if (emptyState) emptyState.hidden = false;
}

function renderAnalysisOutput(exports) {
  const analysisPackage = exports.package;
  const preview = document.getElementById('analysisPromptPreview');
  const emptyState = document.getElementById('analysisEmptyState');
  const actions = document.getElementById('analysisOutputActions');
  const summary = document.getElementById('analysisSummary');
  const meta = document.getElementById('analysisOutputMeta');
  if (preview) {
    preview.value = exports.prompt;
    preview.hidden = false;
  }
  if (emptyState) emptyState.hidden = true;
  if (actions) actions.hidden = false;
  if (summary) summary.hidden = false;

  const hasBookingKpis = analysisPackage.includedSections.includes('BOOKING_KPIS');
  const hasFinancials = analysisPackage.includedSections.some(section => ['FINANCE', 'EXPENSES', 'INVESTMENTS'].includes(section));
  const summaryValues = {
    analysisSummaryProperties: analysisPackage.portfolio.propertyCount,
    analysisSummaryReservations: hasBookingKpis ? analysisPackage.bookingKpis.reservationCount : '—',
    analysisSummaryNights: hasBookingKpis ? analysisPackage.bookingKpis.soldNights : '—',
    analysisSummaryMetrics: hasFinancials
      ? Object.keys(analysisPackage.financials).filter(key => key !== 'dateBasis' && key !== 'expenseCategories').length
      : '—'
  };
  Object.entries(summaryValues).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });
  if (meta) {
    meta.textContent = `${analysisPackage.period.start} – ${analysisPackage.period.end} · Veri kalitesi: ${analysisPackage.dataQuality.status}`;
  }
}

function generateAnalysisExport() {
  setAnalysisError('');
  const button = document.getElementById('analysisGenerateBtn');
  if (button) button.disabled = true;

  try {
    if (typeof AnalysisExportService === 'undefined' || typeof AnalysisExportService.buildAnalysisExports !== 'function') {
      throw new Error('Analiz servisi yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
    }
    if (!isUUID(getActiveTenantId())) {
      const error = new Error('Analiz için aktif ve doğrulanmış bir işletme oturumu gerekir.');
      error.code = 'ANALYSIS_TENANT_REQUIRED';
      throw error;
    }

    const propertyIds = Array.from(document.querySelectorAll('input[name="analysisProperty"]:checked'))
      .map(input => input.value);
    const sections = Array.from(document.querySelectorAll('input[name="analysisSection"]:checked'))
      .map(input => input.value);
    latestAnalysisExports = AnalysisExportService.buildAnalysisExports({
      period: {
        start: document.getElementById('analysisStartDate')?.value,
        end: document.getElementById('analysisEndDate')?.value
      },
      comparison: { mode: document.getElementById('analysisComparison')?.value || 'NONE' },
      propertyIds,
      sections,
      currency: 'TRY',
      business: { name: activeTenant?.name || appData.companyName || null },
      properties: getAnalysisProperties(),
      bookings: appData.bookings || [],
      expenses: appData.expenses || [],
      maintenances: appData.maintenance || []
    });

    renderAnalysisOutput(latestAnalysisExports);
    setAnalysisStatus('Analiz paketi hazır. Promptu kopyalayabilir veya güvenli JSON özetini indirebilirsiniz.');
  } catch (error) {
    latestAnalysisExports = null;
    const knownMessages = {
      ANALYSIS_INVALID_PERIOD: 'Geçerli bir başlangıç ve bitiş tarihi seçin.',
      ANALYSIS_EMPTY_PROPERTY_SCOPE: 'Analiz için en az bir mülk seçin.',
      ANALYSIS_EMPTY_SECTIONS: 'Analiz için en az bir veri bölümü seçin.',
      ANALYSIS_UNKNOWN_PROPERTY: 'Seçilen mülk aktif işletme kapsamında bulunamadı.'
    };
    resetAnalysisOutput();
    setAnalysisError(knownMessages[error.code] || error.message || 'Analiz paketi oluşturulamadı.');
    setAnalysisStatus('Paket oluşturulamadı. Seçimleri kontrol edin.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function copyAnalysisPrompt() {
  if (!latestAnalysisExports) {
    setAnalysisError('Önce bir analiz paketi oluşturun.');
    return;
  }
  setAnalysisError('');
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      throw new Error('CLIPBOARD_UNAVAILABLE');
    }
    await navigator.clipboard.writeText(latestAnalysisExports.prompt);
    setAnalysisStatus('ChatGPT promptu panoya kopyalandı.');
    if (typeof showToast === 'function') showToast('ChatGPT promptu panoya kopyalandı.', 'success');
  } catch (error) {
    const preview = document.getElementById('analysisPromptPreview');
    if (preview) {
      preview.focus();
      preview.select();
    }
    setAnalysisError('Tarayıcı panoya erişimi engelledi. Önizleme seçildi; Ctrl+C ile kopyalayabilirsiniz.');
    setAnalysisStatus('Otomatik kopyalama tamamlanamadı.');
  }
}

function downloadAnalysisJson() {
  if (!latestAnalysisExports) {
    setAnalysisError('Önce bir analiz paketi oluşturun.');
    return;
  }
  const blob = new Blob([latestAnalysisExports.json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lexbnb-analiz-${latestAnalysisExports.package.period.start}-${latestAnalysisExports.package.period.end}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setAnalysisStatus('Güvenli JSON analiz özeti indirildi.');
  if (typeof showToast === 'function') showToast('Güvenli JSON analiz özeti indirildi.', 'success');
}
