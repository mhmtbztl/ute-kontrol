// UTE KONTROL MERKEZİ V5 - FULL INTERACTIVE APPLICATION ENGINE
// Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes)

const VILLAS_CONFIG = {
  'SEYIR': { name: 'Seyir', capacity: '6+2 Kişi', floor: 3500, base: 4500, cleanCost: 800, heatCost: 350 },
  'DOGUS': { name: 'Doğuş', capacity: '11 Kişi', floor: 5000, base: 6500, cleanCost: 1200, heatCost: 500 },
  'ZIRVE': { name: 'Zirve (Jakuzi/Sauna)', capacity: '9 Kişi', floor: 6500, base: 8500, cleanCost: 1500, heatCost: 700 },
  'SIRIN': { name: 'Şirin', capacity: '7 Kişi', floor: 3000, base: 4000, cleanCost: 750, heatCost: 300 },
  'NEFES': { name: 'Nefes', capacity: '12 Kişi', floor: 5500, base: 7000, cleanCost: 1400, heatCost: 550 }
};

// Default seed data if local storage is empty
const SEED_DATA = {
  bookings: [
    { id: 'REZ-001', villa: 'SEYIR', guest: 'Hakan Demir', checkIn: '2026-09-01', checkOut: '2026-09-04', nights: 3, channel: 'AIRBNB', gross: 28000, otaComm: 4200, cleanFee: 1500, net: 22300, pax: 6, status: 'COMPLETED' },
    { id: 'REZ-002', villa: 'DOGUS', guest: 'Murat Kaya', checkIn: '2026-09-03', checkOut: '2026-09-06', nights: 3, channel: 'WHATSAPP', gross: 36000, otaComm: 0, cleanFee: 0, net: 36000, pax: 10, status: 'COMPLETED' },
    { id: 'REZ-003', villa: 'ZIRVE', guest: 'Ahmet Yıldız', checkIn: '2026-09-07', checkOut: '2026-09-10', nights: 3, channel: 'AIRBNB', gross: 48000, otaComm: 7200, cleanFee: 2000, net: 38800, pax: 8, status: 'COMPLETED' },
    { id: 'REZ-004', villa: 'SIRIN', guest: 'Emre Can', checkIn: '2026-09-08', checkOut: '2026-09-11', nights: 3, channel: 'BOOKING', gross: 21000, otaComm: 3780, cleanFee: 1000, net: 16220, pax: 6, status: 'COMPLETED' },
    { id: 'REZ-005', villa: 'NEFES', guest: 'Ayşe Yılmaz', checkIn: '2026-09-12', checkOut: '2026-09-15', nights: 3, channel: 'WHATSAPP', gross: 38000, otaComm: 0, cleanFee: 0, net: 38000, pax: 12, status: 'CONFIRMED' },
    { id: 'REZ-006', villa: 'SEYIR', guest: 'Cemil Öz', checkIn: '2026-09-15', checkOut: '2026-09-18', nights: 3, channel: 'INSTAGRAM', gross: 24000, otaComm: 0, cleanFee: 0, net: 24000, pax: 6, status: 'CONFIRMED' },
    { id: 'REZ-007', villa: 'ZIRVE', guest: 'Burak Tan', checkIn: '2026-09-18', checkOut: '2026-09-21', nights: 3, channel: 'WHATSAPP', gross: 45000, otaComm: 0, cleanFee: 0, net: 45000, pax: 8, status: 'CONFIRMED' },
    { id: 'REZ-008', villa: 'SEYIR', guest: 'Ali Kemal', checkIn: '2026-09-29', checkOut: '2026-10-03', nights: 4, channel: 'AIRBNB', gross: 40000, otaComm: 6000, cleanFee: 2000, net: 32000, pax: 6, status: 'CONFIRMED' }
  ],
  leads: [
    { id: 'L1', guest: 'Hakan Demir', villa: 'SEYIR', channel: 'Airbnb', quote: 28000, status: 'WON', lostReason: '-', notes: 'Rezervasyona dönüştü' },
    { id: 'L2', guest: 'Murat Kaya', villa: 'DOGUS', channel: 'WhatsApp', quote: 36000, status: 'WON', lostReason: '-', notes: 'Hemen kapandı' },
    { id: 'L3', guest: 'Selin B.', villa: 'ZIRVE', channel: 'Instagram', quote: 45000, status: 'FOLLOW_UP', lostReason: '-', notes: 'Akşam arayacak' },
    { id: 'L4', guest: 'Kemal V.', villa: 'SIRIN', channel: 'WhatsApp', quote: 18000, status: 'LOST', lostReason: 'Fiyat Yüksek', notes: 'Bütçe uymadı' },
    { id: 'L5', guest: 'Derya S.', villa: 'NEFES', channel: 'Phone', quote: 35000, status: 'QUOTE_SENT', lostReason: '-', notes: 'Tarih teyidi bekleniyor' }
  ],
  maintenance: [
    { id: 'M1', villa: 'DOGUS', priority: 'P1', title: 'Isı pompası sensör değişimi', assignee: 'Ahmet Usta', downtime: 1, cost: 4500, status: 'OPEN' },
    { id: 'M2', villa: 'ZIRVE', priority: 'P2', title: 'Jakuzi ozon ve filtre bakımı', assignee: 'Teknik Servis', downtime: 0, cost: 2800, status: 'COMPLETED' },
    { id: 'M3', villa: 'SEYIR', priority: 'P2', title: 'Şömine bacası periyodik temizliği', assignee: 'Mehmet', downtime: 0, cost: 1500, status: 'OPEN' }
  ]
};

// Application State
let appData = {
  bookings: [],
  leads: [],
  maintenance: []
};

// Load from LocalStorage
function loadAppData() {
  try {
    const saved = localStorage.getItem('UTE_V5_DATA');
    if (saved) {
      appData = JSON.parse(saved);
    } else {
      appData = JSON.parse(JSON.stringify(SEED_DATA));
      saveAppData();
    }
  } catch (e) {
    console.error('Data load error:', e);
    appData = JSON.parse(JSON.stringify(SEED_DATA));
  }
}

// Save to LocalStorage
function saveAppData() {
  localStorage.setItem('UTE_V5_DATA', JSON.stringify(appData));
  renderAll();
}

// Switch navigation tabs
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

// Master Render Function
function renderAll() {
  renderKPIsAndDashboard();
  renderManageBookingsTable();
  renderManageLeadsTable();
  renderManageMaintTable();
  renderGapNights();
  renderTodayRadar();

  // Badges
  document.getElementById('rezCountBadge').innerText = appData.bookings.length;
  document.getElementById('leadCountBadge').innerText = appData.leads.length;
  document.getElementById('maintCountBadge').innerText = appData.maintenance.filter(m => m.status === 'OPEN').length;
}

// -------------------------------------------------------------
// 1. KPI & DASHBOARD CALCULATIONS
// -------------------------------------------------------------
function renderKPIsAndDashboard() {
  let totalGross = 0;
  let totalNet = 0;
  let totalPaidNights = 0;
  let directRevenue = 0;

  // Track per-villa stats
  const villaStats = {};
  Object.keys(VILLAS_CONFIG).forEach(vKey => {
    villaStats[vKey] = {
      nights: 0,
      netRevenue: 0,
      p1Open: 0
    };
  });

  // Calculate open P1s per villa
  appData.maintenance.forEach(m => {
    if (m.status === 'OPEN' && m.priority === 'P1' && villaStats[m.villa]) {
      villaStats[m.villa].p1Open += 1;
    }
  });

  // Calculate booking contributions
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED') return;
    const bGross = Number(b.gross) || 0;
    const bNet = Number(b.net) || 0;
    const bNights = Number(b.nights) || 0;

    totalGross += bGross;
    totalNet += bNet;
    totalPaidNights += bNights;

    if (villaStats[b.villa]) {
      villaStats[b.villa].nights += bNights;
      villaStats[b.villa].netRevenue += bNet;
    }

    const isDirect = ['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE'].includes(b.channel);
    if (isDirect) {
      directRevenue += bNet;
    }
  });

  // Total available nights (5 villas * 30 days = 150 nights in September)
  const totalCalendarDays = 150;
  const totalDowntime = appData.maintenance
    .filter(m => m.status === 'OPEN' && m.priority === 'P1')
    .reduce((sum, m) => sum + (Number(m.downtime) || 0), 0);

  const availableNights = Math.max(1, totalCalendarDays - totalDowntime);
  const occupancyRate = (totalPaidNights / availableNights) * 100;
  const adr = totalPaidNights > 0 ? (totalNet / totalPaidNights) : 0;
  const revpar = totalNet / availableNights;
  const nrevpar = Math.max(0, (totalNet - (totalPaidNights * 750)) / availableNights);

  // Update Big 4 Cards
  document.getElementById('kpiNetRevenue').innerText = `₺${Math.round(totalNet).toLocaleString('tr-TR')}`;
  document.getElementById('kpiGrossRevenue').innerText = `Brüt: ₺${Math.round(totalGross).toLocaleString('tr-TR')}`;
  
  document.getElementById('kpiOccupancy').innerText = `%${occupancyRate.toFixed(1)}`;
  document.getElementById('kpiNightsDetail').innerText = `${totalPaidNights} / ${availableNights} Gece`;

  document.getElementById('kpiADR').innerText = `₺${Math.round(adr).toLocaleString('tr-TR')}`;
  document.getElementById('kpiRevPAR').innerText = `₺${Math.round(revpar).toLocaleString('tr-TR')}`;
  document.getElementById('kpiNRevPAR').innerText = `Net RevPAR: ₺${Math.round(nrevpar).toLocaleString('tr-TR')}`;

  // Render Villa Scorecard Table
  const tbody = document.getElementById('villaScorecardBody');
  tbody.innerHTML = '';

  Object.keys(VILLAS_CONFIG).forEach(vKey => {
    const vConf = VILLAS_CONFIG[vKey];
    const s = villaStats[vKey];
    const vOcc = (s.nights / 30) * 100;
    const vAdr = s.nights > 0 ? (s.netRevenue / s.nights) : 0;
    const vRevpar = s.netRevenue / 30;

    let badgeHtml = '<span class="badge badge-emerald">🟢 Sağlıklı</span>';
    if (s.p1Open > 0) {
      badgeHtml = '<span class="badge badge-rose">🔴 P1 Arıza Var</span>';
    } else if (vOcc < 40) {
      badgeHtml = '<span class="badge badge-amber">🟡 Düşük Doluluk</span>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${vConf.name}</strong></td>
      <td>${vConf.capacity}</td>
      <td>${s.nights} Gece</td>
      <td>%${vOcc.toFixed(1)}</td>
      <td>₺${Math.round(vAdr).toLocaleString('tr-TR')}</td>
      <td>₺${Math.round(vRevpar).toLocaleString('tr-TR')}</td>
      <td><strong>₺${Math.round(s.netRevenue).toLocaleString('tr-TR')}</strong></td>
      <td>${s.p1Open > 0 ? `<strong style="color:var(--accent-rose);">${s.p1Open} P1 Açık</strong>` : 'Yok'}</td>
      <td>${badgeHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  // Funnel & Channels
  renderFunnelAndChannels(directRevenue, totalNet);
}

// -------------------------------------------------------------
// 2. FUNNEL & CHANNEL CALCULATIONS
// -------------------------------------------------------------
function renderFunnelAndChannels(directRev, totalNet) {
  const totalLeads = appData.leads.length;
  const wonLeads = appData.leads.filter(l => l.status === 'WON').length;
  const convRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
  const rpl = totalLeads > 0 ? totalNet / totalLeads : 0;

  const funnelBox = document.getElementById('funnelStatsContainer');
  funnelBox.innerHTML = `
    <div class="funnel-item">
      <div class="label">TOPLAM LEAD (TALEP)</div>
      <div class="val">${totalLeads} Adet</div>
    </div>
    <div class="funnel-item">
      <div class="label">KAZANILAN REZERVASYON</div>
      <div class="val" style="color: var(--accent-emerald);">${wonLeads} Adet</div>
    </div>
    <div class="funnel-item">
      <div class="label">DÖNÜŞÜM ORANI</div>
      <div class="val">%${convRate.toFixed(1)}</div>
    </div>
    <div class="funnel-item">
      <div class="label">LEAD BAŞINA NET GELİR</div>
      <div class="val">₺${Math.round(rpl).toLocaleString('tr-TR')}</div>
    </div>
  `;

  // Channels
  const directPct = totalNet > 0 ? (directRev / totalNet) * 100 : 0;
  document.getElementById('directShareBadge').innerText = `%${directPct.toFixed(1)} Direkt Payı`;

  // Aggregate channel breakdown
  const chBreakdown = {};
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED') return;
    const ch = b.channel || 'Diğer';
    if (!chBreakdown[ch]) chBreakdown[ch] = 0;
    chBreakdown[ch] += (Number(b.net) || 0);
  });

  const chContainer = document.getElementById('channelListContainer');
  chContainer.innerHTML = '';

  Object.keys(chBreakdown).forEach(ch => {
    const amt = chBreakdown[ch];
    const pct = totalNet > 0 ? (amt / totalNet) * 100 : 0;
    const isDirect = ['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE'].includes(ch);

    const item = document.createElement('div');
    item.className = 'channel-progress-item';
    item.innerHTML = `
      <div class="channel-meta">
        <span>${ch} ${isDirect ? '(Direkt)' : '(OTA)'}</span>
        <strong>₺${Math.round(amt).toLocaleString('tr-TR')} (%${pct.toFixed(1)})</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${isDirect ? '' : 'ota'}" style="width: ${pct}%"></div>
      </div>
    `;
    chContainer.appendChild(item);
  });
}

// -------------------------------------------------------------
// 3. TODAY RADAR ENGINE
// -------------------------------------------------------------
function renderTodayRadar() {
  const container = document.getElementById('todayRadarList');
  container.innerHTML = '';
  const actions = [];

  // P1 Maintenance Actions (Top Critical)
  appData.maintenance
    .filter(m => m.status === 'OPEN' && m.priority === 'P1')
    .forEach(m => {
      actions.push({
        type: 'p1',
        badge: '[P1 ACİL]',
        title: `${VILLAS_CONFIG[m.villa]?.name || m.villa}: ${m.title}`,
        meta: `Downtime: ${m.downtime || 1} Gece | Sorumlu: ${m.assignee || 'Atanmadı'}`,
        action: 'Çöz'
      });
    });

  // Hot Leads
  appData.leads
    .filter(l => l.status === 'FOLLOW_UP')
    .forEach(l => {
      actions.push({
        type: 'lead',
        badge: '[SICAK LEAD]',
        title: `${l.guest} (${VILLAS_CONFIG[l.villa]?.name || l.villa}): ₺${Number(l.quote).toLocaleString('tr-TR')} teklif bekliyor.`,
        meta: `Kanal: ${l.channel} | ${l.notes || 'Yanıt bekleniyor'}`,
        action: 'Follow-up'
      });
    });

  // Check today's check-ins / outs
  const todayStr = new Date().toISOString().split('T')[0];
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED') return;
    if (b.checkIn === todayStr) {
      actions.push({
        type: 'checkin',
        badge: '[BUGÜN GİRİŞ]',
        title: `${VILLAS_CONFIG[b.villa]?.name || b.villa}: ${b.guest} (${b.pax || 2} kişi) giriş yapacak.`,
        meta: `Şömine ve karşılama hazır olmalı.`,
        action: 'Kontrol'
      });
    }
    if (b.checkOut === todayStr) {
      actions.push({
        type: 'ops',
        badge: '[BUGÜN ÇIKIŞ]',
        title: `${VILLAS_CONFIG[b.villa]?.name || b.villa}: ${b.guest} çıkış yapacak.`,
        meta: `Temizlik ve denetim başlatılmalı.`,
        action: 'Takip'
      });
    }
  });

  // Fallback items if calm
  if (actions.length === 0) {
    actions.push({
      type: 'ops',
      badge: '[GÜVENLİ]',
      title: 'Tüm villalar operasyonel açıdan sakin ve hazır durumda.',
      meta: 'Açık P1 arıza veya cevapsız kritik talep bulunmuyor.',
      action: 'Rutin'
    });
  }

  document.getElementById('radarBadge').innerText = `${actions.length} Aksiyon`;

  actions.slice(0, 5).forEach(act => {
    const row = document.createElement('div');
    row.className = 'radar-row';
    row.innerHTML = `
      <div class="radar-badge-col">
        <span class="radar-pill pill-${act.type}">${act.badge}</span>
      </div>
      <div class="radar-main-col">
        <strong>${act.title}</strong>
        <span>${act.meta}</span>
      </div>
      <div class="radar-action-col">
        <button class="btn btn-secondary btn-sm" onclick="alert('${act.title} - İşleme alındı')">${act.action}</button>
      </div>
    `;
    container.appendChild(row);
  });
}

// -------------------------------------------------------------
// 4. GAP NIGHT DETECTOR
// -------------------------------------------------------------
function renderGapNights() {
  const container = document.getElementById('gapNightGrid');
  container.innerHTML = '';

  const gaps = [];
  Object.keys(VILLAS_CONFIG).forEach(vKey => {
    const vConf = VILLAS_CONFIG[vKey];
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

        gaps.push({
          villaName: vConf.name,
          dates: `${cur.checkOut} → ${next.checkIn} (${diffDays} Gece)`,
          offer: `₺${offer.toLocaleString('tr-TR')}`,
          floor: `₺${floorGuard.toLocaleString('tr-TR')} Taban Koruma`,
          desc: `İki rezervasyon arasında yetim gece. ${diffDays} gecelik boşluk doldurulabilir.`
        });
      }
    }
  });

  if (gaps.length === 0) {
    container.innerHTML = '<p class="sub-text" style="grid-column:span 2; padding:12px;">Şu anda takvimde 1-2 gecelik kritik boşluk bulunmuyor. Takvim doluluğu dengeli.</p>';
    return;
  }

  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `
      <div class="gap-info">
        <strong>${g.villaName} • ${g.dates}</strong>
        <span>${g.desc}</span>
      </div>
      <div class="gap-pricing">
        <div class="offer-price">${g.offer}</div>
        <div class="floor-hint">${g.floor}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// 5. MANAGE BOOKINGS TABLE (FULL CRUD)
// -------------------------------------------------------------
function renderManageBookingsTable() {
  const tbody = document.getElementById('manageBookingsTableBody');
  tbody.innerHTML = '';

  appData.bookings.forEach((b, idx) => {
    const vName = VILLAS_CONFIG[b.villa]?.name || b.villa;
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
        <button class="btn btn-secondary btn-sm" onclick="editBooking('${b.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')">🗑️ Sil</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Open Booking Modal (Add / Edit)
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

// Live Calculation in Modal
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

// Save Booking (Add or Update)
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
    // Update existing
    const idx = appData.bookings.findIndex(b => b.id === editId);
    if (idx !== -1) {
      appData.bookings[idx] = {
        ...appData.bookings[idx],
        villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status
      };
    }
  } else {
    // Add new
    const newId = 'REZ-' + Date.now().toString().slice(-4);
    appData.bookings.push({
      id: newId,
      villa, guest, checkIn, checkOut, channel, gross, otaComm, cleanFee, net, nights, pax, status
    });
  }

  saveAppData();
  closeBookingModal();
}

function editBooking(id) {
  openBookingModal(id);
}

function deleteBooking(id) {
  if (confirm('Bu rezervasyonu silmek istediğinizden emin misiniz?')) {
    appData.bookings = appData.bookings.filter(b => b.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// 6. MANAGE LEADS (CRUD)
// -------------------------------------------------------------
function renderManageLeadsTable() {
  const tbody = document.getElementById('manageLeadsTableBody');
  tbody.innerHTML = '';

  appData.leads.forEach(l => {
    let statusBadge = `<span class="badge badge-amber">${l.status}</span>`;
    if (l.status === 'WON') statusBadge = `<span class="badge badge-green">Kazanıldı</span>`;
    if (l.status === 'LOST') statusBadge = `<span class="badge badge-rose">Kaybedildi</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${l.id}</td>
      <td><strong>${l.guest}</strong></td>
      <td>${VILLAS_CONFIG[l.villa]?.name || l.villa}</td>
      <td>${l.channel}</td>
      <td>₺${Number(l.quote).toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td>${l.lostReason || '-'}</td>
      <td>${l.notes || '-'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editLead('${l.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLead('${l.id}')">🗑️ Sil</button>
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

function closeLeadModal() {
  document.getElementById('leadModal').classList.remove('active');
}

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

function editLead(id) {
  openLeadModal(id);
}

function deleteLead(id) {
  if (confirm('Bu talebi silmek istediğinizden emin misiniz?')) {
    appData.leads = appData.leads.filter(l => l.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// 7. MANAGE MAINTENANCE (CRUD)
// -------------------------------------------------------------
function renderManageMaintTable() {
  const tbody = document.getElementById('manageMaintTableBody');
  tbody.innerHTML = '';

  appData.maintenance.forEach(m => {
    let priBadge = '<span class="badge badge-rose">P1 Kritik</span>';
    if (m.priority === 'P2') priBadge = '<span class="badge badge-amber">P2 Önemli</span>';
    if (m.priority === 'P3') priBadge = '<span class="badge badge-blue">P3 Rutin</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${priBadge}</td>
      <td><strong>${VILLAS_CONFIG[m.villa]?.name || m.villa}</strong></td>
      <td>${m.title}</td>
      <td>${m.assignee || 'Atanmadı'}</td>
      <td>₺${Number(m.cost).toLocaleString('tr-TR')}</td>
      <td>₺${Number(m.cost).toLocaleString('tr-TR')}</td>
      <td>${m.downtime || 0} Gece</td>
      <td>${m.status === 'COMPLETED' ? '<span class="badge badge-green">Tamamlandı</span>' : '<span class="badge badge-rose">Açık</span>'}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editMaint('${m.id}')">✏️ Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="deleteMaint('${m.id}')">🗑️ Sil</button>
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
    document.getElementById('maintDowntime').value = 0;
    document.getElementById('maintCost').value = 0;
  }

  modal.classList.add('active');
}

function closeMaintModal() {
  document.getElementById('maintModal').classList.remove('active');
}

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

function editMaint(id) {
  openMaintModal(id);
}

function deleteMaint(id) {
  if (confirm('Bu arızayı silmek istediğinizden emin misiniz?')) {
    appData.maintenance = appData.maintenance.filter(m => m.id !== id);
    saveAppData();
  }
}

// -------------------------------------------------------------
// 8. DATA EXPORT / BACKUP (JSON)
// -------------------------------------------------------------
function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `UTE_Kontrol_Yedek_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadAppData();
  renderAll();
});
