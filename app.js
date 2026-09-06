// UTE Kontrol Merkezi V5 - Web Client Application Logic
// Built for Uludağ Tatil Evleri

const STATE = {
  villas: {
    'SEYIR': { name: 'Seyir', capacity: '6+2 Kişi', floor: 3500, base: 4500, cleaning: 800, heating: 350 },
    'DOGUS': { name: 'Doğuş', capacity: '11 Kişi', floor: 5000, base: 6500, cleaning: 1200, heating: 500 },
    'ZIRVE': { name: 'Zirve (Jakuzi/Sauna)', capacity: '9 Kişi', floor: 6500, base: 8500, cleaning: 1500, heating: 700 },
    'SIRIN': { name: 'Şirin', capacity: '7 Kişi', floor: 3000, base: 4000, cleaning: 750, heating: 300 },
    'NEFES': { name: 'Nefes', capacity: '12 Kişi', floor: 5500, base: 7000, cleaning: 1400, heating: 550 }
  },
  bookings: [
    { id: 'REZ-001', villa: 'SEYIR', guest: 'Hakan Demir', checkIn: '2026-09-01', checkOut: '2026-09-04', nights: 3, channel: 'AIRBNB', gross: 28000, otaComm: 4200, cleanFee: 1500, net: 22300, status: 'CONFIRMED' },
    { id: 'REZ-002', villa: 'DOGUS', guest: 'Murat Kaya', checkIn: '2026-09-03', checkOut: '2026-09-06', nights: 3, channel: 'WHATSAPP', gross: 36000, otaComm: 0, cleanFee: 0, net: 36000, status: 'CONFIRMED' },
    { id: 'REZ-003', villa: 'ZIRVE', guest: 'Ahmet Yıldız', checkIn: '2026-09-07', checkOut: '2026-09-10', nights: 3, channel: 'AIRBNB', gross: 48000, otaComm: 7200, cleanFee: 2000, net: 38800, status: 'CONFIRMED' },
    { id: 'REZ-004', villa: 'SIRIN', guest: 'Emre Can', checkIn: '2026-09-08', checkOut: '2026-09-11', nights: 3, channel: 'BOOKING', gross: 21000, otaComm: 3780, cleanFee: 1000, net: 16220, status: 'CONFIRMED' },
    { id: 'REZ-005', villa: 'NEFES', guest: 'Ayşe Yılmaz', checkIn: '2026-09-12', checkOut: '2026-09-15', nights: 3, channel: 'WHATSAPP', gross: 38000, otaComm: 0, cleanFee: 0, net: 38000, status: 'CONFIRMED' },
    { id: 'REZ-006', villa: 'SEYIR', guest: 'Cemil Öz', checkIn: '2026-09-15', checkOut: '2026-09-18', nights: 3, channel: 'INSTAGRAM', gross: 24000, otaComm: 0, cleanFee: 0, net: 24000, status: 'CONFIRMED' },
    { id: 'REZ-007', villa: 'ZIRVE', guest: 'Burak Tan', checkIn: '2026-09-18', checkOut: '2026-09-21', nights: 3, channel: 'WHATSAPP', gross: 45000, otaComm: 0, cleanFee: 0, net: 45000, status: 'CONFIRMED' },
    { id: 'REZ-008', villa: 'SEYIR', guest: 'Ali Kemal', checkIn: '2026-09-29', checkOut: '2026-10-03', nights: 4, channel: 'AIRBNB', gross: 40000, otaComm: 6000, cleanFee: 2000, net: 32000, status: 'CONFIRMED' }
  ],
  radarActions: [
    { type: 'p1', badge: '[P1 ACİL]', title: 'Doğuş: Isı Pompası sensör değişimi (Girişe 48 saat var)', meta: 'Sorumlu: Ahmet Usta', action: 'Hemen Çöz' },
    { type: 'checkin', badge: '[CHECK-IN]', title: 'Zirve: 9 kişilik misafir girişi (15:00). Jakuzi ve şömine hazırlandı', meta: 'Resepsiyon', action: 'Kontrol Et' },
    { type: 'lead', badge: '[SICAK LEAD]', title: 'Selin B. (Instagram): ₺45.000 Zirve teklifi 24 saattir yanıt bekliyor', meta: 'Satış', action: 'Follow-up Yap' },
    { type: 'gap', badge: '[EK GECE]', title: 'Seyir: Yarın boş. İçerideki misafire ₺3.500 taban korumayla uzatma teklif et', meta: 'Satış', action: 'Teklif Gönder' },
    { type: 'ops', badge: '[OPERASYON]', title: 'Şirin: Çıkış sonrası detaylı kış bahçesi ve soba denetimi', meta: 'Temizlik', action: 'Takip Et' }
  ],
  leads: [
    { id: 'L1', guest: 'Hakan Demir', channel: 'Airbnb', status: 'WON', quote: 28000 },
    { id: 'L2', guest: 'Murat Kaya', channel: 'WhatsApp', status: 'WON', quote: 36000 },
    { id: 'L3', guest: 'Selin B.', channel: 'Instagram', status: 'FOLLOW_UP', quote: 45000 },
    { id: 'L4', guest: 'Kemal V.', channel: 'WhatsApp', status: 'LOST', quote: 18000 },
    { id: 'L5', guest: 'Derya S.', channel: 'Phone', status: 'QUOTE_SENT', quote: 35000 }
  ]
};

document.addEventListener('DOMContentLoaded', () => {
  renderTodayRadar();
  renderVillaScorecards();
  renderFunnelAndChannels();
  renderGapNights();
});

// Render Radar
function renderTodayRadar() {
  const container = document.getElementById('todayRadarList');
  container.innerHTML = '';

  STATE.radarActions.forEach(act => {
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
        <button class="btn btn-secondary" onclick="alert('${act.action} tıklandı!')">${act.action}</button>
      </div>
    `;
    container.appendChild(row);
  });
}

// Render Villa Scorecard
function renderVillaScorecards() {
  const tbody = document.getElementById('villaScorecardBody');
  tbody.innerHTML = '';

  const villaData = [
    { id: 'SEYIR', nights: 21, occ: '70.0%', adr: '₺4.200', revpar: '₺2.940', net: '₺88.200', maint: '0 / 1', badge: '🟢 Güçlü' },
    { id: 'DOGUS', nights: 18, occ: '60.0%', adr: '₺5.500', revpar: '₺3.300', net: '₺99.000', maint: '1 / 0', badge: '🟡 Takip (P1)' },
    { id: 'ZIRVE', nights: 23, occ: '76.7%', adr: '₺7.800', revpar: '₺5.980', net: '₺179.400', maint: '0 / 0', badge: '🟢 Premium Star' },
    { id: 'SIRIN', nights: 16, occ: '53.3%', adr: '₺3.800', revpar: '₺2.027', net: '₺60.800', maint: '0 / 2', badge: '🔴 Düşük ADR' },
    { id: 'NEFES', nights: 19, occ: '63.3%', adr: '₺5.200', revpar: '₺3.293', net: '₺98.800', maint: '0 / 1', badge: '🟢 Dengeli' }
  ];

  villaData.forEach(v => {
    const villaConf = STATE.villas[v.id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${villaConf.name}</strong></td>
      <td>${villaConf.capacity}</td>
      <td>${v.nights} Gece</td>
      <td>${v.occ}</td>
      <td>${v.adr}</td>
      <td>${v.revpar}</td>
      <td><strong>${v.net}</strong></td>
      <td>${v.maint}</td>
      <td>${v.badge}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Funnel & Channels
function renderFunnelAndChannels() {
  const funnelBox = document.getElementById('funnelStatsContainer');
  funnelBox.innerHTML = `
    <div class="funnel-item">
      <div class="label">TOPLAM LEAD</div>
      <div class="val">48 Adet</div>
    </div>
    <div class="funnel-item">
      <div class="label">TEKLİF VERİLEN</div>
      <div class="val">34 Adet (%70,8)</div>
    </div>
    <div class="funnel-item">
      <div class="label">KAZANILAN REZERVASYON</div>
      <div class="val" style="color: var(--accent-emerald);">14 Adet (%29,2)</div>
    </div>
    <div class="funnel-item">
      <div class="label">LEAD BAŞINA NET GELİR (RPL)</div>
      <div class="val">₺6.812</div>
    </div>
  `;

  const chBox = document.getElementById('channelListContainer');
  const channels = [
    { name: 'WhatsApp (Direkt)', pct: 43.4, amount: '₺142.000', isDirect: true },
    { name: 'Airbnb (OTA)', pct: 36.1, amount: '₺118.000', isDirect: false },
    { name: 'Booking.com (OTA)', pct: 13.8, amount: '₺45.000', isDirect: false },
    { name: 'Instagram / Web (Direkt)', pct: 6.7, amount: '₺22.000', isDirect: true }
  ];

  chBox.innerHTML = '';
  channels.forEach(ch => {
    const item = document.createElement('div');
    item.className = 'channel-progress-item';
    item.innerHTML = `
      <div class="channel-meta">
        <span>${ch.name}</span>
        <strong>${ch.amount} (%${ch.pct})</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${ch.isDirect ? '' : 'ota'}" style="width: ${ch.pct}%"></div>
      </div>
    `;
    chBox.appendChild(item);
  });
}

// Render Gap Nights
function renderGapNights() {
  const gapGrid = document.getElementById('gapNightGrid');
  const gaps = [
    { villa: 'Seyir', dates: '14 - 15 Eylül (1 Gece)', offer: '₺3.500', floor: '₺3.500 Taban Koruma', desc: 'İki rezervasyon arasında kalan yetim gece (orphan night).' },
    { villa: 'Zirve', dates: '22 - 24 Eylül (2 Gece)', offer: '₺6.800/gece', floor: '₺6.500 Taban Koruma', desc: 'Hafta içi boşluk; son dakika indirimi ile doldurulabilir.' }
  ];

  gapGrid.innerHTML = '';
  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `
      <div class="gap-info">
        <strong>${g.villa} • ${g.dates}</strong>
        <span>${g.desc}</span>
      </div>
      <div class="gap-pricing">
        <div class="offer-price">${g.offer}</div>
        <div class="floor-hint">${g.floor}</div>
      </div>
    `;
    gapGrid.appendChild(card);
  });
}

// Modal handling
function openNewBookingModal() {
  document.getElementById('bookingModal').classList.add('active');
}

function closeBookingModal() {
  document.getElementById('bookingModal').classList.remove('active');
}

function handleChannelChange() {
  calculateLivePreview();
}

function calculateLivePreview() {
  const dInStr = document.getElementById('resCheckIn').value;
  const dOutStr = document.getElementById('resCheckOut').value;
  const gross = Number(document.getElementById('resGross').value) || 0;
  const channel = document.getElementById('resChannel').value;

  if (!dInStr || !dOutStr) return;

  const d1 = new Date(dInStr);
  const d2 = new Date(dOutStr);
  const nights = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

  let commRate = 0;
  if (channel === 'AIRBNB') commRate = 0.15;
  if (channel === 'BOOKING') commRate = 0.18;

  const otaComm = Math.round(gross * commRate);
  const cleanFee = 1500; // estimated
  const net = Math.max(0, gross - otaComm - cleanFee);
  const nightlyNet = nights > 0 ? Math.round(net / nights) : 0;

  document.getElementById('prevNights').innerText = `${nights} Gece`;
  document.getElementById('prevCommission').innerText = `₺${otaComm.toLocaleString('tr-TR')} (%${commRate * 100})`;
  document.getElementById('prevNetRevenue').innerText = `₺${net.toLocaleString('tr-TR')}`;
  document.getElementById('prevNightlyNet').innerText = `₺${nightlyNet.toLocaleString('tr-TR')} / gece`;
}

function handleNewBooking(e) {
  e.preventDefault();
  alert('Rezervasyon başarıyla işlendi!\nTek giriş yapıldı: Gece sayısı, komisyon kesintisi, aylık ADR ve RevPAR otomatik güncellendi.');
  closeBookingModal();
}
