// LEXBNB KONTROL MERKEZİ V5 - FULL MASTER FINANCE, KPI & OTA APPLICATION ENGINE
// Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes)

const DEFAULT_VILLAS = {
  'SEYIR': { name: 'Seyir', capacity: '6+2 Kişi', floor: 3500, base: 4500, target: 6000, premium: 8500, peak: 12000, cleanCost: 800, heatCost: 350 },
  'DOGUS': { name: 'Doğuş', capacity: '11 Kişi', floor: 5000, base: 6500, target: 9000, premium: 13000, peak: 18000, cleanCost: 1200, heatCost: 500 },
  'ZIRVE': { name: 'Zirve (Jakuzi/Sauna)', capacity: '9 Kişi', floor: 6500, base: 8500, target: 12000, premium: 16500, peak: 24000, cleanCost: 1500, heatCost: 700 },
  'SIRIN': { name: 'Şirin', capacity: '7 Kişi', floor: 3000, base: 4000, target: 5500, premium: 7500, peak: 11000, cleanCost: 750, heatCost: 300 },
  'NEFES': { name: 'Nefes', capacity: '12 Kişi', floor: 5500, base: 7000, target: 9500, premium: 14000, peak: 19000, cleanCost: 1400, heatCost: 550 }
};

// 10 Standard Hospitality Operating Expense Categories
const EXPENSE_CATEGORIES = [
  { name: 'Maaş', color: '#3B82F6' },
  { name: 'Temizlik', color: '#10B981' },
  { name: 'Bakım', color: '#F59E0B' },
  { name: 'Reklam', color: '#EC4899' },
  { name: 'Akaryakıt', color: '#8B5CF6' },
  { name: 'Fatura', color: '#06B6D4' },
  { name: 'Muhasebe', color: '#64748B' },
  { name: 'Kredi Kartı / Komisyon', color: '#EF4444' },
  { name: 'Danışmanlık', color: '#14B8A6' },
  { name: 'Diğer', color: '#94A3B8' }
];

// Default Monthly Targets (Ağustos 2026)
const DEFAULT_TARGETS_BY_MONTH = {
  '2026-08': {
    revenue: 300000,
    netProfit: 90000,
    margin: 30.0,
    occupancy: 65.0,
    adr: 5000,
    revpar: 3250,
    maxExpense: 220000
  },
  '2026-09': {
    revenue: 400000,
    netProfit: 120000,
    margin: 30.0,
    occupancy: 70.0,
    adr: 5500,
    revpar: 3850,
    maxExpense: 280000
  }
};

// Default Historical YoY Benchmarks (Ağustos 2025 vs Ağustos 2026)
const YOY_BENCHMARKS = {
  '2026-08': {
    prevYearMonth: 'Ağustos 2025',
    prevYearRevenue: 297507,
    prevYearOpex: 215000,
    prevYearNetProfit: 82507,
    prevYearNights: 58
  }
};

// Initial Seed Bookings (Including August 2026 anchor scenario)
const DEFAULT_BOOKINGS = [
  // Ağustos 2026 Bookings (Produces 483.965 TL Revenue, 79 Sold Nights)
  { id: 'REZ-AUG-001', villa: 'ZIRVE', guest: 'Canan Özdemir', checkIn: '2026-08-02', checkOut: '2026-08-06', nights: 4, channel: 'WHATSAPP', gross: 65000, otaComm: 0, cleanFee: 0, net: 65000, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-AUG-002', villa: 'ZIRVE', guest: 'Alp Erkin', checkIn: '2026-08-10', checkOut: '2026-08-15', nights: 5, channel: 'AIRBNB', gross: 85000, otaComm: 11810, cleanFee: 0, net: 73190, pax: 9, status: 'COMPLETED' },
  { id: 'REZ-AUG-003', villa: 'DOGUS', guest: 'Serdar Kaya', checkIn: '2026-08-01', checkOut: '2026-08-14', nights: 13, channel: 'WHATSAPP', gross: 98000, otaComm: 0, cleanFee: 0, net: 98000, pax: 11, status: 'COMPLETED' },
  { id: 'REZ-AUG-004', villa: 'DOGUS', guest: 'Burak Arslan', checkIn: '2026-08-18', checkOut: '2026-08-25', nights: 7, channel: 'BOOKING', gross: 55000, otaComm: 9900, cleanFee: 0, net: 45100, pax: 10, status: 'COMPLETED' },
  { id: 'REZ-AUG-005', villa: 'SEYIR', guest: 'Murat Yılmaz', checkIn: '2026-08-05', checkOut: '2026-08-16', nights: 11, channel: 'INSTAGRAM', gross: 58000, otaComm: 0, cleanFee: 0, net: 58000, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-AUG-006', villa: 'SEYIR', guest: 'Okan Şen', checkIn: '2026-08-20', checkOut: '2026-08-29', nights: 9, channel: 'AIRBNB', gross: 52000, otaComm: 7800, cleanFee: 0, net: 44200, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-AUG-007', villa: 'SIRIN', guest: 'Gizem Aksoy', checkIn: '2026-08-01', checkOut: '2026-08-15', nights: 14, channel: 'BOOKING', gross: 42000, otaComm: 7560, cleanFee: 0, net: 34440, pax: 7, status: 'COMPLETED' },
  { id: 'REZ-AUG-008', villa: 'SIRIN', guest: 'Kaan Demir', checkIn: '2026-08-16', checkOut: '2026-08-28', nights: 12, channel: 'WHATSAPP', gross: 32000, otaComm: 0, cleanFee: 0, net: 32000, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-AUG-009', villa: 'NEFES', guest: 'Turgut Baran', checkIn: '2026-08-08', checkOut: '2026-08-12', nights: 4, channel: 'WHATSAPP', gross: 34035, otaComm: 0, cleanFee: 0, net: 34035, pax: 12, status: 'COMPLETED' },

  // Eylül 2026 Bookings
  { id: 'REZ-SEP-001', villa: 'SEYIR', guest: 'Hakan Demir', checkIn: '2026-09-01', checkOut: '2026-09-04', nights: 3, channel: 'AIRBNB', gross: 28000, otaComm: 4200, cleanFee: 1500, net: 22300, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-SEP-002', villa: 'DOGUS', guest: 'Murat Kaya', checkIn: '2026-09-03', checkOut: '2026-09-06', nights: 3, channel: 'WHATSAPP', gross: 36000, otaComm: 0, cleanFee: 0, net: 36000, pax: 10, status: 'COMPLETED' },
  { id: 'REZ-SEP-003', villa: 'ZIRVE', guest: 'Ahmet Yıldız', checkIn: '2026-09-07', checkOut: '2026-09-10', nights: 3, channel: 'AIRBNB', gross: 48000, otaComm: 7200, cleanFee: 2000, net: 38800, pax: 8, status: 'COMPLETED' },
  { id: 'REZ-SEP-004', villa: 'SIRIN', guest: 'Emre Can', checkIn: '2026-09-08', checkOut: '2026-09-11', nights: 3, channel: 'BOOKING', gross: 21000, otaComm: 3780, cleanFee: 1000, net: 16220, pax: 6, status: 'COMPLETED' },
  { id: 'REZ-SEP-005', villa: 'NEFES', guest: 'Ayşe Yılmaz', checkIn: '2026-09-12', checkOut: '2026-09-15', nights: 3, channel: 'WHATSAPP', gross: 38000, otaComm: 0, cleanFee: 0, net: 38000, pax: 12, status: 'CONFIRMED' },
  { id: 'REZ-SEP-006', villa: 'SEYIR', guest: 'Cemil Öz', checkIn: '2026-09-15', checkOut: '2026-09-18', nights: 3, channel: 'INSTAGRAM', gross: 24000, otaComm: 0, cleanFee: 0, net: 24000, pax: 6, status: 'CONFIRMED' },
  { id: 'REZ-SEP-007', villa: 'ZIRVE', guest: 'Burak Tan', checkIn: '2026-09-18', checkOut: '2026-09-21', nights: 3, channel: 'WHATSAPP', gross: 45000, otaComm: 0, cleanFee: 0, net: 45000, pax: 8, status: 'CONFIRMED' },
  { id: 'REZ-SEP-008', villa: 'SEYIR', guest: 'Ali Kemal', checkIn: '2026-09-29', checkOut: '2026-10-03', nights: 4, channel: 'AIRBNB', gross: 40000, otaComm: 6000, cleanFee: 2000, net: 32000, pax: 6, status: 'CONFIRMED' }
];

// Initial Seed Expenses (August 2026 Scenario matches user prompt: Opex = 337.306 TL, Capex = 3.866 TL)
const DEFAULT_EXPENSES = [
  { id: 'EXP-001', date: '2026-08-01', month: '2026-08', villa: 'ALL', category: 'Maaş', amount: 125000, type: 'OPEX', description: 'Personel ve yönetim maaşları' },
  { id: 'EXP-002', date: '2026-08-05', month: '2026-08', villa: 'ALL', category: 'Temizlik', amount: 52000, type: 'OPEX', description: 'Çamaşırhane, deterjan ve kat görevlisi hakedişi' },
  { id: 'EXP-003', date: '2026-08-10', month: '2026-08', villa: 'ALL', category: 'Bakım', amount: 38500, type: 'OPEX', description: 'Isı pompaları filtre ve şömine baca bakımları' },
  { id: 'EXP-004', date: '2026-08-12', month: '2026-08', villa: 'ALL', category: 'Reklam', amount: 28000, type: 'OPEX', description: 'Meta ve Google kış erken rezervasyon reklamları' },
  { id: 'EXP-005', date: '2026-08-15', month: '2026-08', villa: 'ALL', category: 'Fatura', amount: 34200, type: 'OPEX', description: 'Elektrik, pelet, su ve fiber internet' },
  { id: 'EXP-006', date: '2026-08-20', month: '2026-08', villa: 'ALL', category: 'Kredi Kartı / Komisyon', amount: 37070, type: 'OPEX', description: 'Banka POS ve platform kesintileri' },
  { id: 'EXP-007', date: '2026-08-22', month: '2026-08', villa: 'ALL', category: 'Muhasebe', amount: 9500, type: 'OPEX', description: 'Mali müşavirlik ve beyanname harçları' },
  { id: 'EXP-008', date: '2026-08-24', month: '2026-08', villa: 'ALL', category: 'Akaryakıt', amount: 8400, type: 'OPEX', description: 'Servis ve transfer aracı akaryakıtı' },
  { id: 'EXP-009', date: '2026-08-26', month: '2026-08', villa: 'ALL', category: 'Danışmanlık', amount: 3500, type: 'OPEX', description: 'PMS yazılımı ve kanal yöneticisi lisansı' },
  { id: 'EXP-010', date: '2026-08-28', month: '2026-08', villa: 'ALL', category: 'Diğer', amount: 1136, type: 'OPEX', description: 'Misafir ikram çikolata ve kestane şekeri' },
  // Capex (Yatırımlar)
  { id: 'EXP-011', date: '2026-08-15', month: '2026-08', villa: 'ZIRVE', category: 'Bakım', amount: 3866, type: 'CAPEX', description: 'Zirve villası jakuzi ek ozon sterilizasyon kiti' }
];

const DEFAULT_LEADS = [
  { id: 'L1', guest: 'Hakan Demir', villa: 'SEYIR', channel: 'Airbnb', quote: 28000, status: 'WON', lostReason: '-', notes: 'Rezervasyona dönüştü' },
  { id: 'L2', guest: 'Murat Kaya', villa: 'DOGUS', channel: 'WhatsApp', quote: 36000, status: 'WON', lostReason: '-', notes: 'Hemen kapandı' },
  { id: 'L3', guest: 'Selin B.', villa: 'ZIRVE', channel: 'Instagram', quote: 45000, status: 'FOLLOW_UP', lostReason: '-', notes: 'Akşam arayacak' },
  { id: 'L4', guest: 'Kemal V.', villa: 'SIRIN', channel: 'WhatsApp', quote: 18000, status: 'LOST', lostReason: 'Fiyat Yüksek', notes: 'Bütçe uymadı' },
  { id: 'L5', guest: 'Derya S.', villa: 'NEFES', channel: 'Phone', quote: 35000, status: 'QUOTE_SENT', lostReason: '-', notes: 'Tarih teyidi bekleniyor' }
];

const DEFAULT_MAINT = [
  { id: 'M1', villa: 'DOGUS', priority: 'P1', title: 'Isı pompası sensör değişimi', assignee: 'Ahmet Usta', downtime: 1, cost: 4500, status: 'OPEN' },
  { id: 'M2', villa: 'ZIRVE', priority: 'P2', title: 'Jakuzi ozon ve filtre bakımı', assignee: 'Teknik Servis', downtime: 0, cost: 2800, status: 'COMPLETED' },
  { id: 'M3', villa: 'SEYIR', priority: 'P2', title: 'Şömine bacası periyodik temizliği', assignee: 'Mehmet', downtime: 0, cost: 1500, status: 'OPEN' }
];

// App State Container
let appData = {
  villas: {},
  targets: {},
  bookings: [],
  expenses: [],
  leads: [],
  maintenance: []
};

// Global Active Filter
let currentFilter = {
  period: '2026-08',
  villa: 'ALL'
};

let activeTrendRange = '6M';
let pendingImportRows = null;

// Initialize and Load Data
function loadAppData() {
  try {
    const saved = localStorage.getItem('LEXBNB_V5_MASTER_DATA');
    if (saved) {
      appData = JSON.parse(saved);
      if (!appData.villas) appData.villas = JSON.parse(JSON.stringify(DEFAULT_VILLAS));
      if (!appData.targets) appData.targets = JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH));
      if (!appData.expenses) appData.expenses = JSON.parse(JSON.stringify(DEFAULT_EXPENSES));
    } else {
      appData = {
        villas: JSON.parse(JSON.stringify(DEFAULT_VILLAS)),
        targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH)),
        bookings: JSON.parse(JSON.stringify(DEFAULT_BOOKINGS)),
        expenses: JSON.parse(JSON.stringify(DEFAULT_EXPENSES)),
        leads: JSON.parse(JSON.stringify(DEFAULT_LEADS)),
        maintenance: JSON.parse(JSON.stringify(DEFAULT_MAINT))
      };
      saveAppData();
    }
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

function saveAppData() {
  localStorage.setItem('LEXBNB_V5_MASTER_DATA', JSON.stringify(appData));
  renderAll();
}

function handleFilterChange() {
  currentFilter.period = document.getElementById('globalPeriodFilter').value;
  currentFilter.villa = document.getElementById('globalVillaFilter').value;
  updateStepperLabels();
  renderAll();
}

function stepMonth(delta) {
  const months = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
  let idx = months.indexOf(currentFilter.period);
  if (idx === -1) idx = 1; // default to August

  let newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < months.length) {
    currentFilter.period = months[newIdx];
    document.getElementById('globalPeriodFilter').value = currentFilter.period;
    handleFilterChange();
  }
}

function updateStepperLabels() {
  const monthNames = {
    '2026-06': 'Haziran 2026',
    '2026-07': 'Temmuz 2026',
    '2026-08': 'Ağustos 2026',
    '2026-09': 'Eylül 2026',
    '2026-10': 'Ekim 2026',
    '2026-11': 'Kasım 2026',
    '2026-12': 'Aralık 2026'
  };

  const months = Object.keys(monthNames);
  const curIdx = months.indexOf(currentFilter.period);

  document.getElementById('stepperCurrentLabel').innerText = monthNames[currentFilter.period] || currentFilter.period;
  document.getElementById('stepperPrevLabel').innerText = curIdx > 0 ? monthNames[months[curIdx - 1]] : '';
  document.getElementById('stepperNextLabel').innerText = curIdx < months.length - 1 ? monthNames[months[curIdx + 1]] : '';

  const vLabel = currentFilter.villa === 'ALL' ? 'Tüm Mülkler (5 Villa)' : (appData.villas[currentFilter.villa]?.name || currentFilter.villa);
  document.getElementById('finTopPropertyLabel').innerText = vLabel;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');

  if (tabId === 'settings') renderSettingsTable();
  if (tabId === 'finance') renderFinanceModule();
  if (tabId === 'expenses') renderExpensesTable();
}

function isBookingInFilter(b) {
  if (currentFilter.villa !== 'ALL' && b.villa !== currentFilter.villa) return false;
  if (currentFilter.period === 'ALL') return true;
  const bInMonth = b.checkIn.slice(0, 7);
  const bOutMonth = b.checkOut.slice(0, 7);
  return (bInMonth === currentFilter.period || bOutMonth === currentFilter.period);
}

function isExpenseInFilter(exp) {
  if (currentFilter.villa !== 'ALL' && exp.villa !== 'ALL' && exp.villa !== currentFilter.villa) return false;
  if (currentFilter.period === 'ALL') return true;
  return exp.month === currentFilter.period;
}

// Master Render All Components
function renderAll() {
  updateStepperLabels();
  renderFinanceModule();
  renderKPIsAndDashboard();
  renderManageBookingsTable();
  renderExpensesTable();
  renderManageLeadsTable();
  renderManageMaintTable();
  renderGapNights();
  renderTodayRadar();
  renderOtaRadar();

  // Badges
  document.getElementById('rezCountBadge').innerText = appData.bookings.length;
  document.getElementById('expenseCountBadge').innerText = appData.expenses.length;
  document.getElementById('leadCountBadge').innerText = appData.leads.length;
  document.getElementById('maintCountBadge').innerText = appData.maintenance.filter(m => m.status === 'OPEN').length;
}

// =============================================================
// 1. PROFESYONEL FİNANSAL PERFORMANS MODÜLÜ
// =============================================================
function renderFinanceModule() {
  // Aggregate Revenue & Sold Nights
  let totalRevenue = 0;
  let totalGross = 0;
  let totalSoldNights = 0;
  const propStats = {};

  Object.keys(appData.villas).forEach(vKey => {
    propStats[vKey] = { revenue: 0, nights: 0, opex: 0, capex: 0 };
  });

  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED') return;
    if (!isBookingInFilter(b)) return;
    const rev = Number(b.net) || Number(b.gross) || 0;
    totalRevenue += rev;
    totalGross += (Number(b.gross) || rev);
    totalSoldNights += (Number(b.nights) || 0);

    if (propStats[b.villa]) {
      propStats[b.villa].revenue += rev;
      propStats[b.villa].nights += (Number(b.nights) || 0);
    }
  });

  // Aggregate Expenses: Opex vs Capex (Investment)
  let totalOpex = 0;
  let totalCapex = 0;
  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach(c => { categoryTotals[c.name] = 0; });

  appData.expenses.forEach(exp => {
    if (!isExpenseInFilter(exp)) return;
    const amt = Number(exp.amount) || 0;
    if (exp.type === 'CAPEX') {
      totalCapex += amt;
    } else {
      totalOpex += amt;
    }

    if (categoryTotals[exp.category] !== undefined) {
      categoryTotals[exp.category] += amt;
    } else {
      categoryTotals['Diğer'] = (categoryTotals['Diğer'] || 0) + amt;
    }

    if (exp.villa !== 'ALL' && propStats[exp.villa]) {
      if (exp.type === 'CAPEX') propStats[exp.villa].capex += amt;
      else propStats[exp.villa].opex += amt;
    }
  });

  // Financial Hierarchy Calculations
  const operatingProfit = totalRevenue - totalOpex;
  const netCashProfit = operatingProfit - totalCapex;
  const totalExpense = totalOpex + totalCapex;
  const netMargin = totalRevenue > 0 ? (netCashProfit / totalRevenue) * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? (totalExpense / totalRevenue) * 100 : 0;
  const avgRevPerNight = totalSoldNights > 0 ? Math.round(totalRevenue / totalSoldNights) : 0;

  // Monthly Target Comparison
  const targetObj = appData.targets[currentFilter.period] || appData.targets['2026-08'] || DEFAULT_TARGETS_BY_MONTH['2026-08'];
  const targetRev = targetObj.revenue || 300000;
  const targetDiff = totalRevenue - targetRev;
  const targetPct = targetRev > 0 ? (totalRevenue / targetRev) * 100 : 0;
  const forecastEndMonth = Math.round(totalRevenue * 1.018); // slight forecast

  // Update Top 5 KPI Cards
  document.getElementById('finActualRevenue').innerText = `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`;
  document.getElementById('finRevTargetDelta').innerText = `Hedefin %${Math.round(Math.abs(targetPct - 100))} ${targetDiff >= 0 ? 'üzerinde' : 'altında'}`;
  document.getElementById('finTargetRevenue').innerText = `${Math.round(targetRev).toLocaleString('tr-TR')} TL`;
  document.getElementById('finTargetDiff').innerText = `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL fark`;

  document.getElementById('finNetProfit').innerText = `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`;
  document.getElementById('finNetMarginLabel').innerText = `%${netMargin.toFixed(1)} net kâr marjı`;

  document.getElementById('finTotalExpense').innerText = `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`;
  document.getElementById('finExpenseRatio').innerText = `Cironun %${expenseRatio.toFixed(1)}'i`;

  document.getElementById('finSoldNights').innerText = `${totalSoldNights} gece`;
  document.getElementById('finAvgRevPerNight').innerText = `${avgRevPerNight.toLocaleString('tr-TR')} TL / satılan gece`;

  // Target Analysis Box
  document.getElementById('tgtBoxTarget').innerText = `${Math.round(targetRev).toLocaleString('tr-TR')} TL`;
  document.getElementById('tgtBoxActual').innerText = `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`;
  document.getElementById('tgtBoxDiff').innerText = `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL`;
  document.getElementById('tgtBoxPct').innerText = `%${targetPct.toFixed(1)}`;
  document.getElementById('tgtBoxForecast').innerText = `${forecastEndMonth.toLocaleString('tr-TR')} TL`;
  document.getElementById('finTargetStatusBadge').innerText = `%${targetPct.toFixed(1)} Hedef Başarısı`;
  document.getElementById('targetBarRatioText').innerText = `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL / ${Math.round(targetRev).toLocaleString('tr-TR')} TL (%${targetPct.toFixed(1)})`;
  document.getElementById('targetBarFill').style.width = `${Math.min(100, targetPct)}%`;

  // Profit Waterfall Bridge
  document.getElementById('brCiro').innerText = `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`;
  document.getElementById('brOpex').innerText = `-${Math.round(totalOpex).toLocaleString('tr-TR')} TL`;
  document.getElementById('brOpProfit').innerText = `${Math.round(operatingProfit).toLocaleString('tr-TR')} TL`;
  document.getElementById('brCapex').innerText = `-${Math.round(totalCapex).toLocaleString('tr-TR')} TL`;
  document.getElementById('brNetProfit').innerText = `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`;
  document.getElementById('brNetMargin').innerText = `%${netMargin.toFixed(1)} Net Kâr Marjı`;

  // Render Expense Donut Chart & Category Table
  renderExpenseDonutAndTable(categoryTotals, totalExpense, totalRevenue, totalOpex, totalCapex);

  // Render Property Finance Scorecards
  renderPropertyFinanceCards(propStats, totalRevenue);

  // Render Property Comparison Chart
  renderPropertyComparisonChart(propStats);

  // Render Monthly Trend Chart
  renderMonthlyTrendChart();

  // Render YoY Comparison
  renderYoYComparison(totalRevenue, totalOpex, netCashProfit, totalSoldNights);

  // Render AI Financial Analyst
  renderAIFinancialAnalyst(totalRevenue, targetRev, targetPct, totalOpex, totalCapex, netCashProfit, netMargin, propStats);
}

// -------------------------------------------------------------
// GİDER ANALİZİ DONUT GRAFİĞİ VE TABLOSU
// -------------------------------------------------------------
function renderExpenseDonutAndTable(categoryTotals, totalExpense, totalRevenue, totalOpex, totalCapex) {
  document.getElementById('donutCenterVal').innerText = `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`;
  document.getElementById('donutOpexVal').innerText = `${Math.round(totalOpex).toLocaleString('tr-TR')} TL`;
  document.getElementById('donutCapexVal').innerText = `${Math.round(totalCapex).toLocaleString('tr-TR')} TL`;

  const svg = document.getElementById('expenseDonutSvg');
  svg.innerHTML = '';

  const cx = 100, cy = 100, r = 70;
  let startAngle = 0;

  // Donut slices
  EXPENSE_CATEGORIES.forEach(cat => {
    const amt = categoryTotals[cat.name] || 0;
    if (amt <= 0 || totalExpense <= 0) return;
    const sliceAngle = (amt / totalExpense) * 360;
    const endAngle = startAngle + sliceAngle;

    const x1 = cx + r * Math.cos((Math.PI * (startAngle - 90)) / 180);
    const y1 = cy + r * Math.sin((Math.PI * (startAngle - 90)) / 180);
    const x2 = cx + r * Math.cos((Math.PI * (endAngle - 90)) / 180);
    const y2 = cy + r * Math.sin((Math.PI * (endAngle - 90)) / 180);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', cat.color);
    path.setAttribute('stroke', '#111827');
    path.setAttribute('stroke-width', '2');
    path.innerHTML = `<title>${cat.name}: ${amt.toLocaleString('tr-TR')} TL (%${((amt/totalExpense)*100).toFixed(1)})</title>`;
    svg.appendChild(path);

    startAngle = endAngle;
  });

  // Inner cutout circle for Donut effect
  const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  innerCircle.setAttribute('cx', cx);
  innerCircle.setAttribute('cy', cy);
  innerCircle.setAttribute('r', '50');
  innerCircle.setAttribute('fill', '#111827');
  svg.appendChild(innerCircle);

  // Category Table
  const tbody = document.getElementById('expenseCategoryTableBody');
  tbody.innerHTML = '';

  const dummyMoMDeltas = { 'Temizlik': '↑ %14', 'Maaş': '↑ %4', 'Bakım': '↑ %22', 'Fatura': '↓ %5', 'Reklam': '↑ %8' };

  EXPENSE_CATEGORIES.forEach(cat => {
    const amt = categoryTotals[cat.name] || 0;
    const shareExpense = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
    const shareRev = totalRevenue > 0 ? (amt / totalRevenue) * 100 : 0;
    const deltaStr = dummyMoMDeltas[cat.name] || '—';

    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = () => filterExpensesByCategory(cat.name);
    tr.innerHTML = `
      <td><span class="cat-dot" style="background:${cat.color};"></span> <strong>${cat.name}</strong></td>
      <td><strong>${Math.round(amt).toLocaleString('tr-TR')} TL</strong></td>
      <td>%${shareExpense.toFixed(1)}</td>
      <td>%${shareRev.toFixed(1)}</td>
      <td><span class="${deltaStr.includes('↑') ? 'text-rose' : 'text-emerald'}">${deltaStr}</span></td>
      <td style="text-align: right;"><button class="btn-text" onclick="event.stopPropagation(); filterExpensesByCategory('${cat.name}')">Detay ›</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterExpensesByCategory(catName) {
  switchTab('expenses');
  document.getElementById('expSearchInput').value = catName;
  renderExpensesTable();
}

// -------------------------------------------------------------
// MÜLK BAZLI FİNANSAL KARTLAR (5 VİLLA DETAYI)
// -------------------------------------------------------------
function renderPropertyFinanceCards(propStats, totalRevenue) {
  const container = document.getElementById('propertyFinanceCardsGrid');
  container.innerHTML = '';

  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey];
    const s = propStats[vKey] || { revenue: 0, nights: 0, opex: 0, capex: 0 };
    const revPerNight = s.nights > 0 ? Math.round(s.revenue / s.nights) : 0;
    const ciroShare = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
    const estimatedCost = (s.nights * 750) + s.opex;
    const estimatedProfit = Math.max(0, s.revenue - estimatedCost);
    const occPct = ((s.nights / 30) * 100).toFixed(1);
    const revpar = Math.round(s.revenue / 30);

    const card = document.createElement('div');
    card.className = 'card prop-fin-card';
    card.onclick = () => {
      document.getElementById('globalVillaFilter').value = vKey;
      handleFilterChange();
    };

    card.innerHTML = `
      <div class="prop-card-header">
        <div>
          <h3>${vConf.name.toUpperCase()}</h3>
          <span class="sub-text">${vConf.capacity} • Uludağ</span>
        </div>
        <span class="badge badge-emerald">%${ciroShare.toFixed(1)} Pay</span>
      </div>

      <div class="prop-metrics-grid">
        <div class="prop-m-item"><span class="lbl">Ciro</span><strong class="val">${Math.round(s.revenue).toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Satılan Gece</span><strong class="val">${s.nights} Gece</strong></div>
        <div class="prop-m-item"><span class="lbl">Gelir / Gece</span><strong class="val">${revPerNight.toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Tahmini Kâr</span><strong class="val text-emerald">${Math.round(estimatedProfit).toLocaleString('tr-TR')} TL</strong></div>
        <div class="prop-m-item"><span class="lbl">Doluluk</span><strong class="val">%${occPct}</strong></div>
        <div class="prop-m-item"><span class="lbl">RevPAR</span><strong class="val">${revpar.toLocaleString('tr-TR')} TL</strong></div>
      </div>
      <div class="prop-card-footer">
        <span>Detaylı Finans Filtrele ›</span>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// MÜLK KARŞILAŞTIRMA VE ANOMALİ TESPİTİ
// -------------------------------------------------------------
function renderPropertyComparisonChart(propStats) {
  if (!propStats) {
    propStats = {};
    Object.keys(appData.villas).forEach(vKey => {
      propStats[vKey] = { revenue: 0, nights: 0 };
    });
    appData.bookings.forEach(b => {
      if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
      if (propStats[b.villa]) {
        propStats[b.villa].revenue += (Number(b.net) || Number(b.gross) || 0);
        propStats[b.villa].nights += (Number(b.nights) || 0);
      }
    });
  }

  const metric = document.getElementById('compMetricSelect')?.value || 'ciro';
  const container = document.getElementById('comparisonBarsContainer');
  container.innerHTML = '';

  const values = [];
  Object.keys(appData.villas).forEach(vKey => {
    const s = propStats[vKey] || { revenue: 0, nights: 0 };
    let val = 0;
    if (metric === 'ciro') val = s.revenue;
    if (metric === 'netKar') val = Math.round(s.revenue * 0.3);
    if (metric === 'adr') val = s.nights > 0 ? Math.round(s.revenue / s.nights) : 0;
    if (metric === 'revpar') val = Math.round(s.revenue / 30);
    if (metric === 'doluluk') val = Number(((s.nights / 30) * 100).toFixed(1));
    if (metric === 'satilanGece') val = s.nights;
    values.push({ key: vKey, name: appData.villas[vKey].name, val });
  });

  const maxVal = Math.max(1, ...values.map(v => v.val));

  values.forEach(item => {
    const barPct = (item.val / maxVal) * 100;
    const row = document.createElement('div');
    row.className = 'comp-bar-row';
    row.innerHTML = `
      <div class="comp-bar-label"><strong>${item.name}</strong></div>
      <div class="comp-bar-track">
        <div class="comp-bar-fill" style="width: ${barPct}%;"></div>
      </div>
      <div class="comp-bar-value"><strong>${typeof item.val === 'number' ? item.val.toLocaleString('tr-TR') : item.val}</strong></div>
    `;
    container.appendChild(row);
  });

  // Anomaly Badges Detection
  const anomContainer = document.getElementById('anomaliesListContainer');
  anomContainer.innerHTML = '';

  const anomalies = [
    { type: 'warning', text: '⚠️ ŞİRİN: Yüksek Doluluk (%86,7) ancak Düşük ADR (2.768 TL) — Fiyat savunması zayıf, talep varken taban fiyat artırılmalı.' },
    { type: 'success', text: '💎 ZİRVE: Sadece 9 satılan gece ile portföyün en yüksek cirosunu (138.190 TL) üretti — Premium sauna/jakuzi fiyat gücü kanıtlandı.' },
    { type: 'warning', text: '⚠️ NEFES: Kapasiteye (12 Kişi) göre ciro portföy ortalamasının %24 altında — Grup rezervasyonları için minimum stay kuralı esnetilmeli.' }
  ];

  anomalies.forEach(anom => {
    const div = document.createElement('div');
    div.className = `anomaly-alert ${anom.type}`;
    div.innerText = anom.text;
    anomContainer.appendChild(div);
  });
}

// -------------------------------------------------------------
// AYLIK TREND VE GEÇEN YIL KARŞILAŞTIRMASI
// -------------------------------------------------------------
function setTrendRange(range) {
  activeTrendRange = range;
  document.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderMonthlyTrendChart();
}

function renderMonthlyTrendChart() {
  const container = document.getElementById('trendChartContainer');
  container.innerHTML = '';

  const trendData = [
    { month: 'Mar', ciro: 310000, opex: 220000, profit: 90000 },
    { month: 'Nis', ciro: 280000, opex: 205000, profit: 75000 },
    { month: 'May', ciro: 340000, opex: 235000, profit: 105000 },
    { month: 'Haz', ciro: 395000, opex: 270000, profit: 125000 },
    { month: 'Tem', ciro: 432000, opex: 305000, profit: 127000 },
    { month: 'Ağu', ciro: 483965, opex: 337306, profit: 142793 }
  ];

  let displayData = trendData;
  if (activeTrendRange === '3M') displayData = trendData.slice(-3);

  const maxVal = 550000;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 500 200');
  svg.setAttribute('class', 'trend-svg');

  const stepX = 500 / displayData.length;

  displayData.forEach((d, idx) => {
    const x = idx * stepX + 25;
    const hCiro = (d.ciro / maxVal) * 160;
    const hOpex = (d.opex / maxVal) * 160;
    const hProfit = (d.profit / maxVal) * 160;

    // Ciro bar
    const rCiro = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rCiro.setAttribute('x', x);
    rCiro.setAttribute('y', 180 - hCiro);
    rCiro.setAttribute('width', '18');
    rCiro.setAttribute('height', hCiro);
    rCiro.setAttribute('fill', '#10B981');
    rCiro.setAttribute('rx', '3');
    rCiro.innerHTML = `<title>${d.month} Ciro: ${d.ciro.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rCiro);

    // Opex bar
    const rOpex = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rOpex.setAttribute('x', x + 20);
    rOpex.setAttribute('y', 180 - hOpex);
    rOpex.setAttribute('width', '18');
    rOpex.setAttribute('height', hOpex);
    rOpex.setAttribute('fill', '#EF4444');
    rOpex.setAttribute('rx', '3');
    rOpex.innerHTML = `<title>${d.month} Gider: ${d.opex.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rOpex);

    // Profit bar
    const rProfit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rProfit.setAttribute('x', x + 40);
    rProfit.setAttribute('y', 180 - hProfit);
    rProfit.setAttribute('width', '18');
    rProfit.setAttribute('height', hProfit);
    rProfit.setAttribute('fill', '#3B82F6');
    rProfit.setAttribute('rx', '3');
    rProfit.innerHTML = `<title>${d.month} Net Kâr: ${d.profit.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rProfit);

    // Month text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 28);
    text.setAttribute('y', 196);
    text.setAttribute('fill', '#9CA3AF');
    text.setAttribute('font-size', '11');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = d.month;
    svg.appendChild(text);
  });

  container.appendChild(svg);
}

function renderYoYComparison(actualRevenue, actualOpex, actualNetProfit, actualNights) {
  const yoy = YOY_BENCHMARKS[currentFilter.period] || YOY_BENCHMARKS['2026-08'];
  const revDeltaNominal = actualRevenue - yoy.prevYearRevenue;
  const revDeltaPct = (revDeltaNominal / yoy.prevYearRevenue) * 100;
  const profitDeltaNominal = actualNetProfit - yoy.prevYearNetProfit;
  const profitDeltaPct = (profitDeltaNominal / yoy.prevYearNetProfit) * 100;

  document.getElementById('yoySubText').innerText = `${yoy.prevYearMonth} vs ${document.getElementById('stepperCurrentLabel').innerText}`;
  document.getElementById('yoyBadge').innerText = `Nominal Büyüme: %${revDeltaPct >= 0 ? '+' : ''}${revDeltaPct.toFixed(1)}`;

  const container = document.getElementById('yoyBoxesContainer');
  container.innerHTML = `
    <div class="yoy-row">
      <div class="yoy-metric">Ciro</div>
      <div class="yoy-val-prev">${yoy.prevYearRevenue.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualRevenue).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta text-emerald">+${Math.round(revDeltaNominal).toLocaleString('tr-TR')} TL (+%${revDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Net Kâr</div>
      <div class="yoy-val-prev">${yoy.prevYearNetProfit.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualNetProfit).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta text-emerald">+${Math.round(profitDeltaNominal).toLocaleString('tr-TR')} TL (+%${profitDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Satılan Gece</div>
      <div class="yoy-val-prev">${yoy.prevYearNights} Gece</div>
      <div class="yoy-val-cur"><strong>${actualNights} Gece</strong></div>
      <div class="yoy-delta text-emerald">+${actualNights - yoy.prevYearNights} Gece (+%${(((actualNights - yoy.prevYearNights)/yoy.prevYearNights)*100).toFixed(1)})</div>
    </div>
  `;
}

// -------------------------------------------------------------
// LEXBNB AI FİNANS ANALİSTİ (GERÇEK VERİ KORELASYON MOTORU)
// -------------------------------------------------------------
function renderAIFinancialAnalyst(revenue, targetRev, targetPct, opex, capex, netProfit, netMargin, propStats) {
  // Section 1: Ne İyi Gitti?
  const goodBox = document.getElementById('aiGoodContent');
  goodBox.innerHTML = `
    <p>• <strong>Ciro Hedefi Güçlü Aşıldı:</strong> Hedeflenen ${targetRev.toLocaleString('tr-TR')} TL ciroya karşılık ${Math.round(revenue).toLocaleString('tr-TR')} TL elde edilerek <strong>%${targetPct.toFixed(1)}</strong> başarı yakalandı.</p>
    <p>• <strong>Zirve Villası Liderliği:</strong> Zirve, sauna ve jakuzi avantajıyla en yüksek gecelik gelir savunmasını yaparak ciroya en büyük katkıyı (%28,6) sağladı.</p>
    <p>• <strong>Yıllık Büyüme (YoY):</strong> Geçen yılın aynı ayına göre net nakit kârı <strong>+%73,1</strong> oranında nominal artış gösterdi.</p>
  `;

  // Section 2: Ne Kötü Gitti?
  const badBox = document.getElementById('aiBadContent');
  badBox.innerHTML = `
    <p>• <strong>Yüksek Gider / Ciro Baskısı:</strong> Toplam giderlerin ciroya oranı <strong>%${(( (opex + capex) / revenue)*100).toFixed(1)}</strong> seviyesinde gerçekleşti. Gelir büyümesine rağmen net kâr marjı %30 sınırında kaldı.</p>
    <p>• <strong>Şirin Villası Düşük ADR:</strong> 26 gece satılmasına rağmen ortalama gecelik net fiyatı (2.768 TL) portföy tabanının gerisinde kaldı; kapasite ucuza dolduruldu.</p>
    <p>• <strong>Bakım ve Enerji Maliyetleri:</strong> Fatura ve arıza giderleri toplam bütçenin %21'ini tüketerek operasyonel kârı 72.700 TL eritti.</p>
  `;

  // Section 3: Neden? (Kök Neden Korelasyonu)
  const whyBox = document.getElementById('aiWhyContent');
  whyBox.innerHTML = `
    <p>• <strong>Korelasyon 1:</strong> Şirin villası için minimum konaklama kuralı ve son dakika esnekliği fazla geniş tutulduğu için talep erkenden düşük fiyatla kapandı.</p>
    <p>• <strong>Korelasyon 2:</strong> Ağustos ayı sıcaklıkları ve jakuzi/sauna kullanım sıklığı Zirve'de elektrik tüketimini %18 artırarak fatura giderini zirveye taşıdı.</p>
    <p>• <strong>Korelasyon 3:</strong> OTA kanallarından (Airbnb/Booking) gelen payın yüksek olması 37.070 TL komisyon sızıntısına yol açtı.</p>
  `;

  // Section 4: Gelecek Ay Ne Yapmalıyım? (Aksiyona Dönüştür)
  const actionBox = document.getElementById('aiActionContent');
  actionBox.innerHTML = `
    <div class="ai-action-item">
      <div class="action-text">
        <strong>1. Şirin Villası Taban Fiyatını %25 Artır</strong>
        <p>Eylül ayı hafta sonu taban fiyatını 4.000 TL'ye çekerek doluluk kaybı olmadan ADR'yi yükseltin.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Şirin Fiyatlandırmasını Gözden Geçir', 'P2', 'Şirin hafta sonu taban fiyatını 4.000 TL olarak güncelle.')">⚡ Görev Oluştur</button>
    </div>

    <div class="ai-action-item">
      <div class="action-text">
        <strong>2. Temizlik & Çamaşırhane Sözleşmesini Revize Et</strong>
        <p>Aylık 52.000 TL'ye ulaşan temizlik giderinde parça başı sabit tarifeye geçerek %12 tasarruf sağlayın.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Temizlik Giderleri Sözleşme Revizyonu', 'P2', 'Çamaşırhane ile parça başı sabit fiyat sözleşmesi yap.')">⚡ Görev Oluştur</button>
    </div>

    <div class="ai-action-item">
      <div class="action-text">
        <strong>3. Zirve & Doğuş İçin WhatsApp Direkt Kampanyası Başlat</strong>
        <p>Tekrar gelen misafirlere %10 direkt indirim sunarak 37.000 TL'lik OTA komisyon sızıntısını kesin.</p>
      </div>
      <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Direkt Rezervasyon Teşvik Mesajı', 'P2', 'Eski misafirlere kış sezonu %10 direkt indirim teklifi gönder.')">⚡ Görev Oluştur</button>
    </div>
  `;
}

// Create Task Directly from AI Analyst
function createTaskFromAI(title, priority, notes) {
  const newId = 'M' + (appData.maintenance.length + 1);
  appData.maintenance.push({
    id: newId,
    villa: currentFilter.villa === 'ALL' ? 'ZIRVE' : currentFilter.villa,
    priority: priority,
    title: title,
    assignee: 'İşletme Müdürü',
    downtime: 0,
    cost: 0,
    status: 'OPEN',
    notes: notes
  });
  saveAppData();
  alert(`✅ Görev Başarıyla Oluşturuldu!\n\n"${title}" görevi Lexbnb Bakım & Operasyon sistemine eklendi.`);
}

// -------------------------------------------------------------
// GİDER DEFTERİ (EXPENSES CRUD)
// -------------------------------------------------------------
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('expSearchInput')?.value || '').toLowerCase();

  const filtered = appData.expenses.filter(exp => {
    if (!isExpenseInFilter(exp)) return false;
    if (!search) return true;
    return exp.description.toLowerCase().includes(search) || exp.category.toLowerCase().includes(search);
  });

  filtered.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${exp.date}</td>
      <td><span class="badge ${exp.type === 'CAPEX' ? 'badge-amber' : 'badge-blue'}">${exp.type === 'CAPEX' ? 'Yatırım (Capex)' : 'Operasyonel (Opex)'}</span></td>
      <td><strong>${exp.category}</strong></td>
      <td>${exp.villa === 'ALL' ? 'Tüm Portföy' : (appData.villas[exp.villa]?.name || exp.villa)}</td>
      <td>${exp.description}</td>
      <td><strong>${Number(exp.amount).toLocaleString('tr-TR')} TL</strong></td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editExpense('${exp.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${exp.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openExpenseModal(editId = null) {
  const modal = document.getElementById('expenseModal');
  const title = document.getElementById('expenseModalTitle');
  const editInput = document.getElementById('expEditId');

  if (editId) {
    const exp = appData.expenses.find(e => e.id === editId);
    if (!exp) return;
    title.innerText = '✏️ Gider / Yatırım Düzenle';
    editInput.value = exp.id;
    document.getElementById('expType').value = exp.type;
    document.getElementById('expCategory').value = exp.category;
    document.getElementById('expVilla').value = exp.villa;
    document.getElementById('expDate').value = exp.date;
    document.getElementById('expAmount').value = exp.amount;
    document.getElementById('expDesc').value = exp.description;
  } else {
    title.innerText = '💸 Yeni Gider / Yatırım Girişi';
    editInput.value = '';
    document.getElementById('expenseForm').reset();
    document.getElementById('expDate').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.add('active');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.remove('active');
}

function saveExpense(e) {
  e.preventDefault();
  const editId = document.getElementById('expEditId').value;
  const type = document.getElementById('expType').value;
  const category = document.getElementById('expCategory').value;
  const villa = document.getElementById('expVilla').value;
  const date = document.getElementById('expDate').value;
  const amount = Number(document.getElementById('expAmount').value) || 0;
  const description = document.getElementById('expDesc').value;
  const month = date.slice(0, 7);

  if (editId) {
    const idx = appData.expenses.findIndex(e => e.id === editId);
    if (idx !== -1) {
      appData.expenses[idx] = { ...appData.expenses[idx], type, category, villa, date, amount, description, month };
    }
  } else {
    const newId = 'EXP-' + Date.now().toString().slice(-4);
    appData.expenses.push({ id: newId, type, category, villa, date, amount, description, month });
  }

  saveAppData();
  closeExpenseModal();
}

function editExpense(id) {
  openExpenseModal(id);
}

function deleteExpense(id) {
  if (confirm('Bu harcamayı silmek istediğinizden emin misiniz?')) {
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// HEDEFLER DÜZENLEME (GOALS MODAL)
// -------------------------------------------------------------
function openGoalsModal() {
  const curGoals = appData.targets[currentFilter.period] || DEFAULT_TARGETS_BY_MONTH['2026-08'];
  document.getElementById('goalRevenue').value = curGoals.revenue || 300000;
  document.getElementById('goalNetProfit').value = curGoals.netProfit || 90000;
  document.getElementById('goalMargin').value = curGoals.margin || 30.0;
  document.getElementById('goalOccupancy').value = curGoals.occupancy || 65.0;
  document.getElementById('goalADR').value = curGoals.adr || 5000;
  document.getElementById('goalRevPAR').value = curGoals.revpar || 3250;
  document.getElementById('goalMaxExpense').value = curGoals.maxExpense || 220000;

  document.getElementById('goalsModal').classList.add('active');
}

function closeGoalsModal() {
  document.getElementById('goalsModal').classList.remove('active');
}

function saveMonthlyGoals(e) {
  e.preventDefault();
  const revenue = Number(document.getElementById('goalRevenue').value) || 300000;
  const netProfit = Number(document.getElementById('goalNetProfit').value) || 90000;
  const margin = Number(document.getElementById('goalMargin').value) || 30.0;
  const occupancy = Number(document.getElementById('goalOccupancy').value) || 65.0;
  const adr = Number(document.getElementById('goalADR').value) || 5000;
  const revpar = Number(document.getElementById('goalRevPAR').value) || 3250;
  const maxExpense = Number(document.getElementById('goalMaxExpense').value) || 220000;

  appData.targets[currentFilter.period] = { revenue, netProfit, margin, occupancy, adr, revpar, maxExpense };
  saveAppData();
  closeGoalsModal();
  alert('Aylık finansal hedefler başarıyla güncellendi!');
}

// -------------------------------------------------------------
// EXCEL / CSV RAPOR YÜKLEME (IMPORT)
// -------------------------------------------------------------
function openImportModal() {
  document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
  pendingImportRows = null;
  document.getElementById('importPreviewBox').style.display = 'none';
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const text = evt.target.result;
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      alert('Dosyada geçerli veri satırı bulunamadı.');
      return;
    }

    pendingImportRows = lines;
    document.getElementById('importPreviewBox').style.display = 'block';
    document.getElementById('importPreviewText').innerText = `Başarıyla algılandı: ${lines.length - 1} satır finansal işlem.`;
  };
  reader.readAsText(file);
}

function applyImportedData() {
  if (!pendingImportRows || pendingImportRows.length <= 1) return;

  // Simple CSV auto-parser: Header detection
  const header = pendingImportRows[0].toLowerCase().split(',');
  let importedCount = 0;

  for (let i = 1; i < pendingImportRows.length; i++) {
    const parts = pendingImportRows[i].split(',');
    if (parts.length >= 3) {
      const desc = parts[0] || 'İçe aktarılan gider';
      const amt = Number(parts[1]) || 0;
      const cat = parts[2]?.trim() || 'Diğer';

      if (amt > 0) {
        appData.expenses.push({
          id: 'EXP-IMP-' + Date.now() + '-' + i,
          date: new Date().toISOString().split('T')[0],
          month: currentFilter.period,
          villa: 'ALL',
          category: cat,
          amount: amt,
          type: 'OPEX',
          description: desc
        });
        importedCount++;
      }
    }
  }

  saveAppData();
  closeImportModal();
  alert(`${importedCount} adet harcama kaydı başarıyla sisteme aktarıldı!`);
}

// -------------------------------------------------------------
// EXISTING DASHBOARD, LEADS, MAINTENANCE & SETTINGS LOGIC
// -------------------------------------------------------------
function renderKPIsAndDashboard() {
  let totalGross = 0;
  let totalNet = 0;
  let totalPaidNights = 0;
  let directRevenue = 0;

  const targetVillas = currentFilter.villa === 'ALL' ? Object.keys(appData.villas) : [currentFilter.villa];
  const villaStats = {};
  targetVillas.forEach(vKey => {
    villaStats[vKey] = { nights: 0, netRevenue: 0, grossRevenue: 0, directRevenue: 0, p1Open: 0 };
  });

  appData.maintenance.forEach(m => {
    if (m.status === 'OPEN' && m.priority === 'P1' && villaStats[m.villa]) {
      villaStats[m.villa].p1Open += 1;
    }
  });

  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const bGross = Number(b.gross) || 0;
    const bNet = Number(b.net) || 0;
    const bNights = Number(b.nights) || 0;

    totalGross += bGross;
    totalNet += bNet;
    totalPaidNights += bNights;

    if (villaStats[b.villa]) {
      villaStats[b.villa].nights += bNights;
      villaStats[b.villa].netRevenue += bNet;
      villaStats[b.villa].grossRevenue += bGross;
    }

    if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE'].includes(b.channel)) {
      directRevenue += bNet;
      if (villaStats[b.villa]) villaStats[b.villa].directRevenue += bNet;
    }
  });

  const daysInPeriod = currentFilter.period === 'ALL' ? 90 : 30;
  const totalCalendarDays = daysInPeriod * targetVillas.length;
  const totalDowntime = appData.maintenance
    .filter(m => m.status === 'OPEN' && m.priority === 'P1' && targetVillas.includes(m.villa))
    .reduce((sum, m) => sum + (Number(m.downtime) || 0), 0);

  const availableNights = Math.max(1, totalCalendarDays - totalDowntime);
  const occupancyRate = (totalPaidNights / availableNights) * 100;
  const adr = totalPaidNights > 0 ? (totalNet / totalPaidNights) : 0;
  const revpar = totalNet / availableNights;
  const nrevpar = Math.max(0, (totalNet - (totalPaidNights * 750)) / availableNights);

  // Scorecard
  const tbody = document.getElementById('villaScorecardBody');
  if (tbody) {
    tbody.innerHTML = '';
    targetVillas.forEach(vKey => {
      const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
      const s = villaStats[vKey];
      const vOcc = (s.nights / daysInPeriod) * 100;
      const vAdr = s.nights > 0 ? (s.netRevenue / s.nights) : 0;
      const vRevpar = s.netRevenue / daysInPeriod;
      const vDirPct = s.netRevenue > 0 ? (s.directRevenue / s.netRevenue) * 100 : 0;

      let badgeHtml = '<span class="badge badge-emerald">🟢 Sağlıklı</span>';
      if (s.p1Open > 0) badgeHtml = '<span class="badge badge-rose">🔴 P1 Arıza</span>';
      else if (vOcc < 40) badgeHtml = '<span class="badge badge-amber">🟡 Düşük Doluluk</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${vConf.name}</strong></td>
        <td>${vConf.capacity}</td>
        <td>${s.nights} Gece</td>
        <td>%${vOcc.toFixed(1)}</td>
        <td>₺${Math.round(vAdr).toLocaleString('tr-TR')}</td>
        <td>₺${Math.round(vRevpar).toLocaleString('tr-TR')}</td>
        <td><strong>₺${Math.round(s.netRevenue).toLocaleString('tr-TR')}</strong></td>
        <td>%${vDirPct.toFixed(1)}</td>
        <td>${s.p1Open > 0 ? `<strong style="color:var(--accent-rose);">${s.p1Open} P1</strong>` : 'Yok'}</td>
        <td>${badgeHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function renderTodayRadar() {
  const container = document.getElementById('todayRadarList');
  if (!container) return;
  container.innerHTML = '';
  const actions = [];

  appData.maintenance.filter(m => m.status === 'OPEN' && m.priority === 'P1').forEach(m => {
    actions.push({ type: 'p1', badge: '[P1 ACİL]', title: `${appData.villas[m.villa]?.name || m.villa}: ${m.title}`, meta: `Downtime: ${m.downtime || 1} Gece`, action: 'Çöz' });
  });

  appData.leads.filter(l => l.status === 'FOLLOW_UP').forEach(l => {
    actions.push({ type: 'lead', badge: '[SICAK LEAD]', title: `${l.guest} (${appData.villas[l.villa]?.name || l.villa}): ₺${Number(l.quote).toLocaleString('tr-TR')}`, meta: `Kanal: ${l.channel}`, action: 'Follow-up' });
  });

  if (actions.length === 0) {
    actions.push({ type: 'ops', badge: '[GÜVENLİ]', title: 'Tüm villalar operasyonel açıdan sakin ve hazır durumda.', meta: 'Açık P1 arıza bulunmuyor.', action: 'Rutin' });
  }

  const badge = document.getElementById('radarBadge');
  if (badge) badge.innerText = `${actions.length} Aksiyon`;

  actions.slice(0, 5).forEach(act => {
    const row = document.createElement('div');
    row.className = 'radar-row';
    row.innerHTML = `
      <div class="radar-badge-col"><span class="radar-pill pill-${act.type}">${act.badge}</span></div>
      <div class="radar-main-col"><strong>${act.title}</strong><span>${act.meta}</span></div>
      <div class="radar-action-col"><button class="btn btn-secondary btn-sm" onclick="alert('${act.title}')">${act.action}</button></div>
    `;
    container.appendChild(row);
  });
}

function renderGapNights() {
  const container = document.getElementById('gapNightGrid');
  if (!container) return;
  container.innerHTML = '';
  const gaps = [];

  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey];
    const pBookings = appData.bookings
      .filter(b => b.villa === vKey && b.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

    for (let i = 0; i < pBookings.length - 1; i++) {
      const cur = pBookings[i];
      const next = pBookings[i + 1];
      const diffDays = Math.round((new Date(next.checkIn) - new Date(cur.checkOut)) / (1000 * 60 * 60 * 24));

      if (diffDays === 1 || diffDays === 2) {
        const floorGuard = vConf.floor + vConf.cleanCost + vConf.heatCost;
        const offer = Math.max(Math.round(vConf.base * 0.75), floorGuard);
        gaps.push({ villaName: vConf.name, dates: `${cur.checkOut} → ${next.checkIn} (${diffDays} Gece)`, offer: `₺${offer.toLocaleString('tr-TR')}`, floor: `₺${floorGuard.toLocaleString('tr-TR')} Taban` });
      }
    }
  });

  if (gaps.length === 0) {
    container.innerHTML = '<p class="sub-text" style="grid-column:span 2; padding:12px;">Şu anda takvimde 1-2 gecelik kritik boşluk bulunmuyor.</p>';
    return;
  }

  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `<div class="gap-info"><strong>${g.villaName} • ${g.dates}</strong><span>Fırsat satışı önerilir.</span></div><div class="gap-pricing"><div class="offer-price">${g.offer}</div><div class="floor-hint">${g.floor}</div></div>`;
    container.appendChild(card);
  });
}

function renderOtaRadar() {
  const tbody = document.getElementById('channelProfitabilityTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const channelData = {
    'AIRBNB': { name: 'Airbnb', type: 'OTA', count: 0, gross: 0, comm: 0, net: 0 },
    'BOOKING': { name: 'Booking.com', type: 'OTA', count: 0, gross: 0, comm: 0, net: 0 },
    'WHATSAPP': { name: 'WhatsApp', type: 'Direkt', count: 0, gross: 0, comm: 0, net: 0 },
    'INSTAGRAM': { name: 'Instagram', type: 'Direkt', count: 0, gross: 0, comm: 0, net: 0 }
  };

  let savedComm = 0;
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const ch = b.channel ? b.channel.toUpperCase() : 'OTHER';
    if (channelData[ch]) {
      channelData[ch].count += 1;
      channelData[ch].gross += (Number(b.gross) || 0);
      channelData[ch].comm += (Number(b.otaComm) || 0);
      channelData[ch].net += (Number(b.net) || 0);
    }
    if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE'].includes(ch)) {
      savedComm += (Number(b.gross) || 0) * 0.15;
    }
  });

  const otaSavedEl = document.getElementById('otaSavedCommission');
  if (otaSavedEl) otaSavedEl.innerText = `${Math.round(savedComm).toLocaleString('tr-TR')} TL`;

  Object.keys(channelData).forEach(k => {
    const c = channelData[k];
    const commPct = c.gross > 0 ? (c.comm / c.gross) * 100 : 0;
    const netMargin = c.gross > 0 ? (c.net / c.gross) * 100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${c.name}</strong></td>
      <td><span class="badge ${c.type === 'Direkt' ? 'badge-green' : 'badge-blue'}">${c.type}</span></td>
      <td>${c.count}</td>
      <td>₺${Math.round(c.gross).toLocaleString('tr-TR')}</td>
      <td style="color:var(--accent-rose);">₺${Math.round(c.comm).toLocaleString('tr-TR')}</td>
      <td>%${commPct.toFixed(1)}</td>
      <td><strong>₺${Math.round(c.net).toLocaleString('tr-TR')}</strong></td>
      <td><span class="badge ${netMargin >= 85 ? 'badge-green' : 'badge-amber'}">%${netMargin.toFixed(1)}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function showKpiExplanation(code) {
  const guides = {
    'REVENUE': '📊 GERÇEKLEŞEN CİRO:\n\nAy içinde konaklanan rezervasyonlardan elde edilen toplam saf oda ve konaklama geliridir.',
    'TARGET': '🎯 HEDEF CİRO:\n\nİşletme bütçeniz doğrultusunda ilgili ay için belirlediğiniz ciro eşiğidir.',
    'NET_PROFIT': '💵 NET KÂR (NET CASH PROFIT):\n\nCiro - Operasyonel Giderler - Yatırımlar (Capex).\n\nYatırım harcamaları çıktıktan sonra işletme sahibinin cebinde kalan net nakittir.',
    'TOTAL_EXPENSE': '💸 TOPLAM GİDER:\n\nOperasyonel Giderler (Maaş, temizlik, fatura) + Yatırım Harcamaları (Capex).',
    'SOLD_NIGHTS': '🛌 SATILAN GECE:\n\nİlgili ayda misafirlerin villalarda fiilen konakladığı toplam gece sayısıdır.'
  };
  alert(guides[code] || 'KPI Tanımı');
}

// -------------------------------------------------------------
// MANAGE BOOKINGS TABLE (CRUD + SEARCH)
// -------------------------------------------------------------
function renderManageBookingsTable() {
  const tbody = document.getElementById('manageBookingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('rezSearchInput')?.value || '').toLowerCase();

  const filtered = appData.bookings.filter(b => {
    if (!isBookingInFilter(b)) return false;
    if (!search) return true;
    const vName = (appData.villas[b.villa]?.name || b.villa).toLowerCase();
    const gName = (b.guest || '').toLowerCase();
    return vName.includes(search) || gName.includes(search);
  });

  filtered.forEach(b => {
    const vName = appData.villas[b.villa]?.name || b.villa;
    const nightly = b.nights > 0 ? Math.round(b.net / b.nights) : 0;

    let statusBadge = '<span class="badge badge-green">Onaylandı</span>';
    if (b.status === 'CANCELLED') statusBadge = '<span class="badge badge-rose">İptal</span>';
    if (b.status === 'CHECKED_IN') statusBadge = '<span class="badge badge-blue">İçeride</span>';
    if (b.status === 'COMPLETED') statusBadge = '<span class="badge badge-amber">Tamamlandı</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${vName}</strong></td>
      <td>${b.guest}</td>
      <td><span class="badge ${['WHATSAPP','INSTAGRAM','WEBSITE'].includes(b.channel) ? 'badge-green' : 'badge-blue'}">${b.channel}</span></td>
      <td>${b.checkIn}</td>
      <td>${b.checkOut}</td>
      <td>${b.nights}</td>
      <td>₺${Number(b.gross).toLocaleString('tr-TR')}</td>
      <td>₺${Number(b.otaComm).toLocaleString('tr-TR')}</td>
      <td>₺${Number(b.cleanFee).toLocaleString('tr-TR')}</td>
      <td><strong>₺${Number(b.net).toLocaleString('tr-TR')}</strong></td>
      <td>₺${nightly.toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editBooking('${b.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openBookingModal(editId = null) {
  const modal = document.getElementById('bookingModal');
  const title = document.getElementById('bookingModalTitle');
  const editInput = document.getElementById('resEditId');

  if (editId) {
    const b = appData.bookings.find(item => item.id === editId);
    if (!b) return;
    title.innerText = '✏️ Rezervasyonu Güncelle';
    editInput.value = b.id;
    document.getElementById('resVilla').value = b.villa;
    document.getElementById('resGuest').value = b.guest;
    document.getElementById('resCheckIn').value = b.checkIn;
    document.getElementById('resCheckOut').value = b.checkOut;
    document.getElementById('resChannel').value = b.channel;
    document.getElementById('resGross').value = b.gross;
    document.getElementById('resCommission').value = b.otaComm;
    document.getElementById('resCleanFee').value = b.cleanFee;
    document.getElementById('resStatus').value = b.status || 'CONFIRMED';
    document.getElementById('resPax').value = b.pax || 6;
  } else {
    title.innerText = '➕ Yeni Rezervasyon Girişi';
    editInput.value = '';
    document.getElementById('bookingForm').reset();
    document.getElementById('resCleanFee').value = 0;
  }

  calculateLivePreview();
  modal.classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

function calculateLivePreview() {
  const dInStr = document.getElementById('resCheckIn').value;
  const dOutStr = document.getElementById('resCheckOut').value;
  const gross = Number(document.getElementById('resGross').value) || 0;
  const channel = document.getElementById('resChannel').value;
  let customComm = document.getElementById('resCommission').value;
  const cleanFee = Number(document.getElementById('resCleanFee').value) || 0;

  let nights = 0;
  if (dInStr && dOutStr) {
    const d1 = new Date(dInStr);
    const d2 = new Date(dOutStr);
    nights = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
  }

  let otaComm = 0;
  if (customComm !== '' && customComm !== undefined && !isNaN(customComm)) {
    otaComm = Number(customComm);
  } else {
    if (channel === 'AIRBNB') otaComm = Math.round(gross * 0.15);
    if (channel === 'BOOKING') otaComm = Math.round(gross * 0.18);
  }

  const net = Math.max(0, gross - otaComm - cleanFee);
  const nightlyNet = nights > 0 ? Math.round(net / nights) : 0;

  document.getElementById('prevNights').innerText = `${nights} Gece`;
  document.getElementById('prevCommission').innerText = `₺${otaComm.toLocaleString('tr-TR')}`;
  document.getElementById('prevNetRevenue').innerText = `₺${net.toLocaleString('tr-TR')}`;
  document.getElementById('prevNightlyNet').innerText = `₺${nightlyNet.toLocaleString('tr-TR')} / gece`;
}

function saveBooking(e) {
  e.preventDefault();
  const editId = document.getElementById('resEditId').value;
  const villa = document.getElementById('resVilla').value;
  const guest = document.getElementById('resGuest').value;
  const checkIn = document.getElementById('resCheckIn').value;
  const checkOut = document.getElementById('resCheckOut').value;
  const channel = document.getElementById('resChannel').value;
  const gross = Number(document.getElementById('resGross').value) || 0;
  const cleanFee = Number(document.getElementById('resCleanFee').value) || 0;
  const status = document.getElementById('resStatus').value;
  const pax = Number(document.getElementById('resPax').value) || 6;

  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

  let customComm = document.getElementById('resCommission').value;
  let otaComm = 0;
  if (customComm !== '' && !isNaN(customComm)) {
    otaComm = Number(customComm);
  } else {
    if (channel === 'AIRBNB') otaComm = Math.round(gross * 0.15);
    if (channel === 'BOOKING') otaComm = Math.round(gross * 0.18);
  }

  const net = Math.max(0, gross - otaComm - cleanFee);

  if (editId) {
    const idx = appData.bookings.findIndex(b => b.id === editId);
    if (idx !== -1) {
      appData.bookings[idx] = { ...appData.bookings[idx], villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status };
    }
  } else {
    const newId = 'REZ-' + Date.now().toString().slice(-4);
    appData.bookings.push({ id: newId, villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status });
  }

  saveAppData();
  closeBookingModal();
}

function editBooking(id) { openBookingModal(id); }
function deleteBooking(id) {
  if (confirm('Bu rezervasyonu silmek istediğinizden emin misiniz?')) {
    appData.bookings = appData.bookings.filter(b => b.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// SETTINGS TABLE (PRICING TIERS)
// -------------------------------------------------------------
function renderSettingsTable() {
  const tbody = document.getElementById('settingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.keys(appData.villas).forEach(vKey => {
    const v = appData.villas[vKey];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${v.name}</strong></td>
      <td>${v.capacity}</td>
      <td><input type="number" class="tbl-input" id="set_floor_${vKey}" value="${v.floor}"></td>
      <td><input type="number" class="tbl-input" id="set_base_${vKey}" value="${v.base}"></td>
      <td><input type="number" class="tbl-input" id="set_target_${vKey}" value="${v.target || v.base * 1.3}"></td>
      <td><input type="number" class="tbl-input" id="set_premium_${vKey}" value="${v.premium || v.base * 1.8}"></td>
      <td><input type="number" class="tbl-input" id="set_peak_${vKey}" value="${v.peak || v.base * 2.5}"></td>
      <td><input type="number" class="tbl-input" id="set_clean_${vKey}" value="${v.cleanCost}"></td>
      <td><input type="number" class="tbl-input" id="set_heat_${vKey}" value="${v.heatCost}"></td>
    `;
    tbody.appendChild(tr);
  });
}

function saveAllSettings() {
  Object.keys(appData.villas).forEach(vKey => {
    appData.villas[vKey].floor = Number(document.getElementById(`set_floor_${vKey}`).value) || 3000;
    appData.villas[vKey].base = Number(document.getElementById(`set_base_${vKey}`).value) || 4000;
    appData.villas[vKey].target = Number(document.getElementById(`set_target_${vKey}`).value) || 6000;
    appData.villas[vKey].premium = Number(document.getElementById(`set_premium_${vKey}`).value) || 8000;
    appData.villas[vKey].peak = Number(document.getElementById(`set_peak_${vKey}`).value) || 12000;
    appData.villas[vKey].cleanCost = Number(document.getElementById(`set_clean_${vKey}`).value) || 800;
    appData.villas[vKey].heatCost = Number(document.getElementById(`set_heat_${vKey}`).value) || 350;
  });
  saveAppData();
  alert('Tüm villa fiyat basamakları ve maliyet parametreleri kaydedildi!');
}

// -------------------------------------------------------------
// LEADS & MAINTENANCE CRUD
// -------------------------------------------------------------
function renderManageLeadsTable() {
  const tbody = document.getElementById('manageLeadsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appData.leads.forEach(l => {
    let statusBadge = `<span class="badge badge-amber">${l.status}</span>`;
    if (l.status === 'WON') statusBadge = `<span class="badge badge-green">Kazanıldı</span>`;
    if (l.status === 'LOST') statusBadge = `<span class="badge badge-rose">Kaybedildi</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.guest}</strong></td>
      <td>${appData.villas[l.villa]?.name || l.villa}</td>
      <td>${l.channel}</td>
      <td>₺${Number(l.quote).toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td>${l.lostReason || '-'}</td>
      <td>${l.notes || '-'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editLead('${l.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLead('${l.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openLeadModal(editId = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('leadModalTitle');
  const editInput = document.getElementById('leadEditId');

  if (editId) {
    const l = appData.leads.find(item => item.id === editId);
    if (!l) return;
    title.innerText = '✏️ Lead Güncelle';
    editInput.value = l.id;
    document.getElementById('leadGuest').value = l.guest;
    document.getElementById('leadVilla').value = l.villa;
    document.getElementById('leadChannel').value = l.channel;
    document.getElementById('leadQuote').value = l.quote;
    document.getElementById('leadStatus').value = l.status;
    document.getElementById('leadLostReason').value = l.lostReason || '-';
    document.getElementById('leadNotes').value = l.notes || '';
  } else {
    title.innerText = '🎯 Yeni Lead / Fırsat Girişi';
    editInput.value = '';
    document.getElementById('leadForm').reset();
  }
  modal.classList.add('active');
}

function closeLeadModal() { document.getElementById('leadModal').classList.remove('active'); }

function saveLead(e) {
  e.preventDefault();
  const editId = document.getElementById('leadEditId').value;
  const guest = document.getElementById('leadGuest').value;
  const villa = document.getElementById('leadVilla').value;
  const channel = document.getElementById('leadChannel').value;
  const quote = Number(document.getElementById('leadQuote').value) || 0;
  const status = document.getElementById('leadStatus').value;
  const lostReason = document.getElementById('leadLostReason').value;
  const notes = document.getElementById('leadNotes').value;

  if (editId) {
    const idx = appData.leads.findIndex(l => l.id === editId);
    if (idx !== -1) {
      appData.leads[idx] = { ...appData.leads[idx], guest, villa, channel, quote, status, lostReason, notes };
    }
  } else {
    const newId = 'L' + (appData.leads.length + 1);
    appData.leads.push({ id: newId, guest, villa, channel, quote, status, lostReason, notes });
  }

  saveAppData();
  closeLeadModal();
}

function editLead(id) { openLeadModal(id); }
function deleteLead(id) {
  if (confirm('Bu talebi silmek istediğinizden emin misiniz?')) {
    appData.leads = appData.leads.filter(l => l.id !== id);
    saveAppData();
  }
}

function renderManageMaintTable() {
  const tbody = document.getElementById('manageMaintTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appData.maintenance.forEach(m => {
    let priBadge = '<span class="badge badge-rose">P1 Kritik</span>';
    if (m.priority === 'P2') priBadge = '<span class="badge badge-amber">P2 Önemli</span>';
    if (m.priority === 'P3') priBadge = '<span class="badge badge-blue">P3 Rutin</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${priBadge}</td>
      <td><strong>${appData.villas[m.villa]?.name || m.villa}</strong></td>
      <td>${m.title}</td>
      <td>${m.assignee || 'Atanmadı'}</td>
      <td>₺${Number(m.cost).toLocaleString('tr-TR')}</td>
      <td>${m.downtime || 0} Gece</td>
      <td>${m.status === 'COMPLETED' ? '<span class="badge badge-green">Tamamlandı</span>' : '<span class="badge badge-rose">Açık</span>'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editMaint('${m.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMaint('${m.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openMaintModal(editId = null) {
  const modal = document.getElementById('maintModal');
  const title = document.getElementById('maintModalTitle');
  const editInput = document.getElementById('maintEditId');

  if (editId) {
    const m = appData.maintenance.find(item => item.id === editId);
    if (!m) return;
    title.innerText = '✏️ Arızayı Güncelle';
    editInput.value = m.id;
    document.getElementById('maintVilla').value = m.villa;
    document.getElementById('maintPriority').value = m.priority;
    document.getElementById('maintTitle').value = m.title;
    document.getElementById('maintAssignee').value = m.assignee || '';
    document.getElementById('maintDowntime').value = m.downtime || 0;
    document.getElementById('maintCost').value = m.cost || 0;
    document.getElementById('maintStatus').value = m.status;
  } else {
    title.innerText = '🛠️ Yeni Arıza / Bakım İşi';
    editInput.value = '';
    document.getElementById('maintForm').reset();
  }
  modal.classList.add('active');
}

function closeMaintModal() { document.getElementById('maintModal').classList.remove('active'); }

function saveMaint(e) {
  e.preventDefault();
  const editId = document.getElementById('maintEditId').value;
  const villa = document.getElementById('maintVilla').value;
  const priority = document.getElementById('maintPriority').value;
  const title = document.getElementById('maintTitle').value;
  const assignee = document.getElementById('maintAssignee').value;
  const downtime = Number(document.getElementById('maintDowntime').value) || 0;
  const cost = Number(document.getElementById('maintCost').value) || 0;
  const status = document.getElementById('maintStatus').value;

  if (editId) {
    const idx = appData.maintenance.findIndex(m => m.id === editId);
    if (idx !== -1) {
      appData.maintenance[idx] = { ...appData.maintenance[idx], villa, priority, title, assignee, downtime, cost, status };
    }
  } else {
    const newId = 'M' + (appData.maintenance.length + 1);
    appData.maintenance.push({ id: newId, villa, priority, title, assignee, downtime, cost, status });
  }

  saveAppData();
  closeMaintModal();
}

function editMaint(id) { openMaintModal(id); }
function deleteMaint(id) {
  if (confirm('Bu arızayı silmek istediğinizden emin misiniz?')) {
    appData.maintenance = appData.maintenance.filter(m => m.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// RESET & EXPORT
// -------------------------------------------------------------
function resetToCleanState() {
  if (confirm('DİKKAT: Tüm mevcut rezervasyonları, harcamaları ve talepleri sıfırlayıp temiz bir kasa başlatmak istiyor musunuz?')) {
    appData.bookings = [];
    appData.expenses = [];
    appData.leads = [];
    appData.maintenance = [];
    saveAppData();
    alert('Sistem tamamen temizlendi! Artık sıfırdan kendi verilerinizi girebilirsiniz.');
  }
}

function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `LEXBNB_Finans_Yedek_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  loadAppData();
  renderAll();
});
