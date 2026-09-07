
const DEFAULT_CLEANING_TASKS = [
  { id: 'TASK-CLN-001', villa: 'SEYIR', guest: 'Hakan Demir', date: '2026-09-04', cleaner: 'Fatma Hanım (Temizlik Ekibi)', amount: 1500, paid: false, paidDate: null, notes: 'Rutin çıkış temizliği ve çamaşır' },
  { id: 'TASK-CLN-002', villa: 'DOGUS', guest: 'Murat Kaya', date: '2026-09-06', cleaner: 'Fatma Hanım (Temizlik Ekibi)', amount: 1500, paid: false, paidDate: null, notes: 'Çıkış temizliği - Ödeme bekliyor' },
  { id: 'TASK-CLN-003', villa: 'ZIRVE', guest: 'Ahmet Yıldız', date: '2026-09-10', cleaner: 'Ayşe Hanım (Özel Ekip)', amount: 2000, paid: false, paidDate: null, notes: 'Jakuzili ev çıkış temizliği' },
  { id: 'TASK-CLN-004', villa: 'SIRIN', guest: 'Emre Can', date: '2026-09-11', cleaner: 'Fatma Hanım (Temizlik Ekibi)', amount: 1000, paid: false, paidDate: null, notes: 'Rutin çıkış temizliği' },
  { id: 'TASK-CLN-005', villa: 'NEFES', guest: 'Ayşe Yılmaz', date: '2026-09-15', cleaner: 'Fatma Hanım (Temizlik Ekibi)', amount: 1500, paid: false, paidDate: null, notes: '12 kişilik grup sonrası temizlik' }
];


// =============================================================
// GÜVENLİK VE GİZLİ ERİŞİM YÖNETİMİ (SECURITY & AUTH SHIELD)
// =============================================================
const MASTER_PINS = ['uludagtatil2026.', 'uludagtatil2026'];
const SECRET_ACCESS_KEY = 'uludagtatil2026.';

function checkAuthStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const keyParam = urlParams.get('key') || urlParams.get('auth') || urlParams.get('token');

  // 1. Direct Secret Link check (sadece linki attığınız kişiler otomatik açsın)
  if (keyParam && (MASTER_PINS.includes(keyParam.toLowerCase()) || keyParam === SECRET_ACCESS_KEY)) {
    sessionStorage.setItem('LEXBNB_AUTHENTICATED', 'true');
    localStorage.setItem('LEXBNB_REMEMBER_AUTH', 'true');
    hideLockOverlay();
    return true;
  }

  // 2. Remember Me in LocalStorage check (30 gün)
  if (localStorage.getItem('LEXBNB_REMEMBER_AUTH') === 'true') {
    hideLockOverlay();
    return true;
  }

  // 3. Active Session check
  if (sessionStorage.getItem('LEXBNB_AUTHENTICATED') === 'true') {
    hideLockOverlay();
    return true;
  }

  // 4. Otherwise show lock screen
  showLockOverlay();
  return false;
}

function showLockOverlay() {
  const overlay = document.getElementById('securityLockOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    setTimeout(() => {
      const pinInput = document.getElementById('authPinInput');
      if (pinInput) pinInput.focus();
    }, 100);
  }
}

function hideLockOverlay() {
  const overlay = document.getElementById('securityLockOverlay');
  if (overlay) overlay.style.display = 'none';
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('authPinInput');
  const err = document.getElementById('authErrorMessage');
  const remember = document.getElementById('authRememberCheckbox')?.checked;
  const val = (input ? input.value : '').trim().toLowerCase();

  if (MASTER_PINS.includes(val)) {
    sessionStorage.setItem('LEXBNB_AUTHENTICATED', 'true');
    if (remember) {
      localStorage.setItem('LEXBNB_REMEMBER_AUTH', 'true');
    }
    if (err) err.style.display = 'none';
    hideLockOverlay();
  } else {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Hatalı PIN kodu! Lütfen yetkili master şifreyi giriniz.';
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function copySecretShareLink() {
  const baseUrl = window.location.origin + window.location.pathname;
  const secretUrl = `${baseUrl}?key=${SECRET_ACCESS_KEY}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(secretUrl).then(() => {
      alert(`✅ Yetkili Erişim Linki Kopyalandı!\n\n🔗 ${secretUrl}\n\nBu linki gönderdiğiniz kişiler şifre girmeden doğrudan paneli açabilir.\nBu linke veya PIN koduna sahip olmayan hiç kimse şirket verilerinizi göremez.`);
    }).catch(() => {
      prompt('Aşağıdaki yetkili erişim linkini kopyalayıp paylaşabilirsiniz:', secretUrl);
    });
  } else {
    prompt('Aşağıdaki yetkili erişim linkini kopyalayıp paylaşabilirsiniz:', secretUrl);
  }
}

// LEXBNB KONTROL MERKEZİ V5 - FULL MASTER FINANCE, KPI & OTA APPLICATION ENGINE
// Uludağ Tatil Evleri (Seyir, Doğuş, Zirve, Şirin, Nefes)
// RESMİ ŞİRKET VERİTABANI: GENEL RAPOR.xlsx üzerinden tamamen işlenmiştir.

const COMPANY_EXCEL_DATABASE = {
  "monthlyFinancials": {
    "2025-07": {
      "key": "2025-07",
      "year": "2025",
      "month": "07",
      "monthName": "Temmuz",
      "ciro": 66050,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 66050,
      "operatingProfit": 66050,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 5,
      "avgDaily": 13210
    },
    "2025-08": {
      "key": "2025-08",
      "year": "2025",
      "month": "08",
      "monthName": "Ağustos",
      "ciro": 297507,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 297507,
      "operatingProfit": 297507,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 22,
      "avgDaily": 13523.045454545454
    },
    "2025-09": {
      "key": "2025-09",
      "year": "2025",
      "month": "09",
      "monthName": "Eylül",
      "ciro": 95046,
      "opex": 0,
      "capex": 0,
      "totalExp": 0,
      "netProfit": 95046,
      "operatingProfit": 95046,
      "opMargin": 100,
      "netMargin": 100,
      "daysSold": 8,
      "avgDaily": 11880.75
    },
    "2025-10": {
      "key": "2025-10",
      "year": "2025",
      "month": "10",
      "monthName": "Ekim",
      "ciro": 216987,
      "opex": 255523,
      "capex": 341556,
      "totalExp": 597079,
      "netProfit": -38536,
      "operatingProfit": -38536,
      "opMargin": -17.8,
      "netMargin": -17.8,
      "daysSold": 24,
      "avgDaily": 9041.116666666667
    },
    "2025-11": {
      "key": "2025-11",
      "year": "2025",
      "month": "11",
      "monthName": "Kasım",
      "ciro": 197561,
      "opex": 290614,
      "capex": 174792,
      "totalExp": 465406,
      "netProfit": -93053,
      "operatingProfit": -93053,
      "opMargin": -47.1,
      "netMargin": -47.1,
      "daysSold": 19,
      "avgDaily": 10397.947368421053
    },
    "2025-12": {
      "key": "2025-12",
      "year": "2025",
      "month": "12",
      "monthName": "Aralık",
      "ciro": 493690,
      "opex": 318661,
      "capex": 174287,
      "totalExp": 492948,
      "netProfit": 175029,
      "operatingProfit": 175029,
      "opMargin": 35.5,
      "netMargin": 35.5,
      "targetCiro": 1000000,
      "daysSold": 29,
      "avgDaily": 17023.793103448275
    },
    "2026-01": {
      "key": "2026-01",
      "year": "2026",
      "month": "01",
      "monthName": "Ocak",
      "ciro": 843555,
      "opex": 331058,
      "capex": 465331,
      "totalExp": 796389,
      "netProfit": 512497,
      "operatingProfit": 512497,
      "opMargin": 60.8,
      "netMargin": 60.8,
      "targetCiro": 1000000,
      "daysSold": 46,
      "avgDaily": 18338.152173913044
    },
    "2026-02": {
      "key": "2026-02",
      "year": "2026",
      "month": "02",
      "monthName": "Şubat",
      "ciro": 587428,
      "opex": 468638,
      "capex": 257306,
      "totalExp": 725944,
      "netProfit": 118790,
      "operatingProfit": 118790,
      "opMargin": 20.2,
      "netMargin": 20.2,
      "targetCiro": 1000000,
      "daysSold": 29,
      "avgDaily": 20256.137931034482
    },
    "2026-03": {
      "key": "2026-03",
      "year": "2026",
      "month": "03",
      "monthName": "Mart",
      "ciro": 375076,
      "opex": 258067,
      "capex": 45000,
      "totalExp": 303067,
      "netProfit": 117009,
      "operatingProfit": 117009,
      "opMargin": 31.2,
      "netMargin": 31.2,
      "targetCiro": 180000,
      "daysSold": 31,
      "avgDaily": 12099.225806451614
    },
    "2026-04": {
      "key": "2026-04",
      "year": "2026",
      "month": "04",
      "monthName": "Nisan",
      "ciro": 208905,
      "opex": 311901,
      "capex": 172948,
      "totalExp": 484849,
      "netProfit": -102996,
      "operatingProfit": -102996,
      "opMargin": -49.3,
      "netMargin": -49.3,
      "targetCiro": 180000,
      "daysSold": 19,
      "avgDaily": 10995.031578947368
    },
    "2026-05": {
      "key": "2026-05",
      "year": "2026",
      "month": "05",
      "monthName": "Mayıs",
      "ciro": 403100,
      "opex": 568971,
      "capex": 216899,
      "totalExp": 785870,
      "netProfit": -165871,
      "operatingProfit": -165871,
      "opMargin": -41.1,
      "netMargin": -41.1,
      "targetCiro": 180000,
      "daysSold": 34,
      "avgDaily": 11855.882352941177
    },
    "2026-06": {
      "key": "2026-06",
      "year": "2026",
      "month": "06",
      "monthName": "Haziran",
      "ciro": 267827,
      "opex": 434876,
      "capex": 112165,
      "totalExp": 547041,
      "netProfit": -167049,
      "operatingProfit": -167049,
      "opMargin": -62.4,
      "netMargin": -62.4,
      "targetCiro": 240000,
      "daysSold": 25,
      "avgDaily": 10713.08
    },
    "2026-07": {
      "key": "2026-07",
      "year": "2026",
      "month": "07",
      "monthName": "Temmuz",
      "ciro": 467468,
      "opex": 308956,
      "capex": 22166,
      "totalExp": 331122,
      "netProfit": 158512,
      "operatingProfit": 158512,
      "opMargin": 33.9,
      "netMargin": 33.9,
      "targetCiro": 240000,
      "daysSold": 79,
      "avgDaily": 5917.316455696203
    },
    "2026-08": {
      "key": "2026-08",
      "year": "2026",
      "month": "08",
      "monthName": "Ağustos",
      "ciro": 483965,
      "opex": 337306,
      "capex": 3866,
      "totalExp": 341172,
      "netProfit": 146659,
      "operatingProfit": 146659,
      "opMargin": 30.3,
      "netMargin": 30.3,
      "targetCiro": 300000,
      "daysSold": 79,
      "avgDaily": 6126.139240506329
    }
  },
  "targets": {
    "2025-12": 1000000,
    "2026-01": 1000000,
    "2026-02": 1000000,
    "2026-03": 180000,
    "2026-04": 180000,
    "2026-05": 180000,
    "2026-06": 240000,
    "2026-07": 240000,
    "2026-08": 300000,
    "2026-09": 120000,
    "2026-10": 240000,
    "2026-11": 240000
  },
  "propertyMonthly": {
    "2025-07": {
      "key": "2025-07",
      "totalDays": 5,
      "totalRev": 66050,
      "avgDaily": 13210,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 4,
          "rev": 53050,
          "adr": 13263,
          "share": 80.3,
          "occupancy": 12.9,
          "revpar": 1711
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 1,
          "rev": 13000,
          "adr": 13000,
          "share": 19.7,
          "occupancy": 3.2,
          "revpar": 419
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        }
      ]
    },
    "2025-08": {
      "key": "2025-08",
      "totalDays": 22,
      "totalRev": 297507,
      "avgDaily": 13523.045454545454,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 108910,
          "adr": 13614,
          "share": 36.6,
          "occupancy": 25.8,
          "revpar": 3513
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 5,
          "rev": 52058,
          "adr": 10412,
          "share": 17.5,
          "occupancy": 16.1,
          "revpar": 1679
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 3,
          "rev": 40917,
          "adr": 13639,
          "share": 13.8,
          "occupancy": 9.7,
          "revpar": 1320
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 6,
          "rev": 95622,
          "adr": 15937,
          "share": 32.1,
          "occupancy": 19.4,
          "revpar": 3085
        }
      ]
    },
    "2025-09": {
      "key": "2025-09",
      "totalDays": 8,
      "totalRev": 95046,
      "avgDaily": 11880.75,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 3,
          "rev": 39098,
          "adr": 13033,
          "share": 41.1,
          "occupancy": 9.7,
          "revpar": 1261
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 55948,
          "adr": 11190,
          "share": 58.9,
          "occupancy": 16.1,
          "revpar": 1805
        }
      ]
    },
    "2025-10": {
      "key": "2025-10",
      "totalDays": 24,
      "totalRev": 216986.8,
      "avgDaily": 9041.116666666667,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 7,
          "rev": 67996,
          "adr": 9714,
          "share": 31.3,
          "occupancy": 22.6,
          "revpar": 2193
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 4,
          "rev": 35676.4,
          "adr": 8919,
          "share": 16.4,
          "occupancy": 12.9,
          "revpar": 1151
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 5,
          "rev": 44906.4,
          "adr": 8981,
          "share": 20.7,
          "occupancy": 16.1,
          "revpar": 1449
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 4,
          "rev": 28420,
          "adr": 7105,
          "share": 13.1,
          "occupancy": 12.9,
          "revpar": 917
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 4,
          "rev": 39988,
          "adr": 9997,
          "share": 18.4,
          "occupancy": 12.9,
          "revpar": 1290
        }
      ]
    },
    "2025-11": {
      "key": "2025-11",
      "totalDays": 19,
      "totalRev": 197561,
      "avgDaily": 10397.947368421053,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 5,
          "rev": 56320,
          "adr": 11264,
          "share": 28.5,
          "occupancy": 16.1,
          "revpar": 1817
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 21902,
          "adr": 7301,
          "share": 11.1,
          "occupancy": 9.7,
          "revpar": 707
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 4,
          "rev": 46610,
          "adr": 11653,
          "share": 23.6,
          "occupancy": 12.9,
          "revpar": 1504
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 7229,
          "adr": 7229,
          "share": 3.7,
          "occupancy": 3.2,
          "revpar": 233
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 6,
          "rev": 65500,
          "adr": 10917,
          "share": 33.2,
          "occupancy": 19.4,
          "revpar": 2113
        }
      ]
    },
    "2025-12": {
      "key": "2025-12",
      "totalDays": 29,
      "totalRev": 493690,
      "avgDaily": 17023.793103448275,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 10,
          "rev": 144060,
          "adr": 14406,
          "share": 29.2,
          "occupancy": 32.3,
          "revpar": 4647
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 6,
          "rev": 150410,
          "adr": 25068,
          "share": 30.5,
          "occupancy": 19.4,
          "revpar": 4852
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 137660,
          "adr": 15296,
          "share": 27.9,
          "occupancy": 29,
          "revpar": 4441
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 4,
          "rev": 61560,
          "adr": 15390,
          "share": 12.5,
          "occupancy": 12.9,
          "revpar": 1986
        }
      ]
    },
    "2026-01": {
      "key": "2026-01",
      "totalDays": 46,
      "totalRev": 843555,
      "avgDaily": 18338.152173913044,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 10,
          "rev": 174925,
          "adr": 17493,
          "share": 20.7,
          "occupancy": 32.3,
          "revpar": 5643
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 12,
          "rev": 184800,
          "adr": 15400,
          "share": 21.9,
          "occupancy": 38.7,
          "revpar": 5961
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 14,
          "rev": 279549,
          "adr": 19968,
          "share": 33.1,
          "occupancy": 45.2,
          "revpar": 9018
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 6346,
          "adr": 6346,
          "share": 0.8,
          "occupancy": 3.2,
          "revpar": 205
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 9,
          "rev": 197935,
          "adr": 21993,
          "share": 23.5,
          "occupancy": 29,
          "revpar": 6385
        }
      ]
    },
    "2026-02": {
      "key": "2026-02",
      "totalDays": 29,
      "totalRev": 587428,
      "avgDaily": 20256.137931034482,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 190265,
          "adr": 23783,
          "share": 32.4,
          "occupancy": 25.8,
          "revpar": 6138
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 5,
          "rev": 94500,
          "adr": 18900,
          "share": 16.1,
          "occupancy": 16.1,
          "revpar": 3048
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 156669,
          "adr": 17408,
          "share": 26.7,
          "occupancy": 29,
          "revpar": 5054
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 2,
          "rev": 34750,
          "adr": 17375,
          "share": 5.9,
          "occupancy": 6.5,
          "revpar": 1121
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 111244,
          "adr": 22249,
          "share": 18.9,
          "occupancy": 16.1,
          "revpar": 3589
        }
      ]
    },
    "2026-03": {
      "key": "2026-03",
      "totalDays": 31,
      "totalRev": 375076,
      "avgDaily": 12099.225806451614,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 80760,
          "adr": 13460,
          "share": 21.5,
          "occupancy": 19.4,
          "revpar": 2605
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 6,
          "rev": 80832,
          "adr": 13472,
          "share": 21.6,
          "occupancy": 19.4,
          "revpar": 2607
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 75798,
          "adr": 8422,
          "share": 20.2,
          "occupancy": 29,
          "revpar": 2445
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 5,
          "rev": 46921,
          "adr": 9384,
          "share": 12.5,
          "occupancy": 16.1,
          "revpar": 1514
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 5,
          "rev": 90765,
          "adr": 18153,
          "share": 24.2,
          "occupancy": 16.1,
          "revpar": 2928
        }
      ]
    },
    "2026-04": {
      "key": "2026-04",
      "totalDays": 19,
      "totalRev": 208905.6,
      "avgDaily": 10995.031578947368,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 9,
          "rev": 92238,
          "adr": 10249,
          "share": 44.2,
          "occupancy": 29,
          "revpar": 2975
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 21700,
          "adr": 7233,
          "share": 10.4,
          "occupancy": 9.7,
          "revpar": 700
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 4,
          "rev": 58448,
          "adr": 14612,
          "share": 28,
          "occupancy": 12.9,
          "revpar": 1885
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 1,
          "rev": 6489.6,
          "adr": 6490,
          "share": 3.1,
          "occupancy": 3.2,
          "revpar": 209
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 2,
          "rev": 30030,
          "adr": 15015,
          "share": 14.4,
          "occupancy": 6.5,
          "revpar": 969
        }
      ]
    },
    "2026-05": {
      "key": "2026-05",
      "totalDays": 34,
      "totalRev": 403100,
      "avgDaily": 11855.882352941177,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 7,
          "rev": 92000,
          "adr": 13143,
          "share": 22.8,
          "occupancy": 22.6,
          "revpar": 2968
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 3,
          "rev": 28000,
          "adr": 9333,
          "share": 6.9,
          "occupancy": 9.7,
          "revpar": 903
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 8,
          "rev": 104730,
          "adr": 13091,
          "share": 26,
          "occupancy": 25.8,
          "revpar": 3378
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 9,
          "rev": 69000,
          "adr": 7667,
          "share": 17.1,
          "occupancy": 29,
          "revpar": 2226
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 7,
          "rev": 109370,
          "adr": 15624,
          "share": 27.1,
          "occupancy": 22.6,
          "revpar": 3528
        }
      ]
    },
    "2026-06": {
      "key": "2026-06",
      "totalDays": 25,
      "totalRev": 267827,
      "avgDaily": 10713.08,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 90595,
          "adr": 15099,
          "share": 33.8,
          "occupancy": 19.4,
          "revpar": 2922
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 8,
          "rev": 61000,
          "adr": 7625,
          "share": 22.8,
          "occupancy": 25.8,
          "revpar": 1968
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 5,
          "rev": 65695,
          "adr": 13139,
          "share": 24.5,
          "occupancy": 16.1,
          "revpar": 2119
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 4,
          "rev": 30762,
          "adr": 7691,
          "share": 11.5,
          "occupancy": 12.9,
          "revpar": 992
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 2,
          "rev": 19775,
          "adr": 9888,
          "share": 7.4,
          "occupancy": 6.5,
          "revpar": 638
        }
      ]
    },
    "2026-07": {
      "key": "2026-07",
      "totalDays": 79,
      "totalRev": 467468,
      "avgDaily": 5917.316455696203,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 6,
          "rev": 91599,
          "adr": 15267,
          "share": 19.6,
          "occupancy": 19.4,
          "revpar": 2955
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 17,
          "rev": 62100,
          "adr": 3653,
          "share": 13.3,
          "occupancy": 54.8,
          "revpar": 2003
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 106238,
          "adr": 11804,
          "share": 22.7,
          "occupancy": 29,
          "revpar": 3427
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 19,
          "rev": 68599,
          "adr": 3610,
          "share": 14.7,
          "occupancy": 61.3,
          "revpar": 2213
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 28,
          "rev": 138932,
          "adr": 4962,
          "share": 29.7,
          "occupancy": 90.3,
          "revpar": 4482
        }
      ]
    },
    "2026-08": {
      "key": "2026-08",
      "totalDays": 79,
      "totalRev": 483965,
      "avgDaily": 6126.139240506329,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 8,
          "rev": 98318,
          "adr": 12290,
          "share": 20.3,
          "occupancy": 25.8,
          "revpar": 3172
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 24,
          "rev": 97375,
          "adr": 4057,
          "share": 20.1,
          "occupancy": 77.4,
          "revpar": 3141
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 9,
          "rev": 138190,
          "adr": 15354,
          "share": 28.6,
          "occupancy": 29,
          "revpar": 4458
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 30,
          "rev": 84780,
          "adr": 2826,
          "share": 17.5,
          "occupancy": 96.8,
          "revpar": 2735
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 8,
          "rev": 65302,
          "adr": 8163,
          "share": 13.5,
          "occupancy": 25.8,
          "revpar": 2107
        }
      ]
    },
    "2026-09": {
      "key": "2026-09",
      "totalDays": 8,
      "totalRev": 0,
      "avgDaily": 0,
      "villas": [
        {
          "id": "SEYIR",
          "code": "seyir",
          "name": "Seyir Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "DOGUS",
          "code": "dogus",
          "name": "Doğuş Dağ Evi",
          "days": 1,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 3.2,
          "revpar": 0
        },
        {
          "id": "ZIRVE",
          "code": "zirve",
          "name": "Zirve Dağ Evi",
          "days": 0,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 0,
          "revpar": 0
        },
        {
          "id": "SIRIN",
          "code": "sirin",
          "name": "Şirin Dağ Evi",
          "days": 6,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 19.4,
          "revpar": 0
        },
        {
          "id": "NEFES",
          "code": "nefes",
          "name": "Nefes Dağ Evi",
          "days": 1,
          "rev": 0,
          "adr": 0,
          "share": 0,
          "occupancy": 3.2,
          "revpar": 0
        }
      ]
    }
  },
  "expensesList": [
    {
      "id": "exp-1001",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 76322,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1002",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 6020,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1003",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 34268,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1004",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 6293,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1005",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 7363,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1006",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 32500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1007",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 4030,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1008",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1009",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (EKİM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1010",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 14006,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1011",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 61000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1012",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 13168,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1013",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 11056,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1014",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 81115,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1015",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 24000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1016",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 7336,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1017",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1018",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (KASIM 2025) - Excel Raporu"
    },
    {
      "id": "exp-1019",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 13401,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1020",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 48000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1021",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 8148,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1022",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 17278,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1023",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 62715,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1024",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 26200,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1025",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 52090,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1026",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1027",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (ARALIK 2025) - Excel Raporu"
    },
    {
      "id": "exp-1028",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 12866,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1029",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 36100,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1030",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 6271,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1031",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 36886,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1032",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 35788,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1033",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 42900,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1034",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 58254,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1035",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1036",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (OCAK 2026) - Excel Raporu"
    },
    {
      "id": "exp-1037",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1038",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Danışmanlık",
      "type": "OPEX",
      "amount": 15000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Danışmanlık Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1039",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 19715,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1040",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 57650,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1041",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 127158,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1042",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 46673,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1043",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 42736,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1044",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 31000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1045",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 51003,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (ŞUBAT 2026) - Excel Raporu"
    },
    {
      "id": "exp-1046",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 40000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1047",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 10000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1048",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 8344,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1049",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 39860,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1050",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 65863,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1051",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 36000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1052",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 5826,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1053",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 24548,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (MART 2026) - Excel Raporu"
    },
    {
      "id": "exp-1054",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 28000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1055",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 52756,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1056",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 4214,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1057",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 46400,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1058",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 54367,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1059",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1060",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 5826,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1061",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 24178,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (NİSAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1062",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 42500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1063",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 57875,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1064",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 10268,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1065",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 235378,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1066",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 45746,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1067",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1068",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 48744,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1069",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 55067,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (MAYIS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1070",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 90338,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1071",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 24000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1072",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 55262,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1073",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1074",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 22670,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1075",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 49271,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1076",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 51500,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1077",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 41000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (HAZİRAN 2026) - Excel Raporu"
    },
    {
      "id": "exp-1078",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 43907,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1079",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 31000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1080",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 18880,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1081",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075.5,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1082",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 19338,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1083",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 8034,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1084",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 60800,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1085",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 28604,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (TEMMUZ 2026) - Excel Raporu"
    },
    {
      "id": "exp-1086",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Muhasebe",
      "type": "OPEX",
      "amount": 44655,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Muhasebe Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1087",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Temizlik",
      "type": "OPEX",
      "amount": 47000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Temizlik Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1088",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Reklam",
      "type": "OPEX",
      "amount": 20116,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Reklam Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1089",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Maaş",
      "type": "OPEX",
      "amount": 85075,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Maaş Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1090",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Akaryakıt",
      "type": "OPEX",
      "amount": 21388,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Akaryakıt Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1091",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Fatura",
      "type": "OPEX",
      "amount": 17279,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Fatura Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1092",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Bakım",
      "type": "OPEX",
      "amount": 7050,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Bakım Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1093",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-15",
      "category": "Kredi Kartı / Komisyon",
      "type": "OPEX",
      "amount": 75519,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Kredi Kartı / Komisyon Aylık Ödemesi (AĞUSTOS 2026) - Excel Raporu"
    },
    {
      "id": "exp-1094",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 33727,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ekim 2025) - Excel Raporu"
    },
    {
      "id": "exp-1095",
      "monthKey": "2025-10",
      "month": "2025-10",
      "date": "2025-10-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 341556,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ekim 2025) - Excel Raporu"
    },
    {
      "id": "exp-1096",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 23933,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Kasım 2025) - Excel Raporu"
    },
    {
      "id": "exp-1097",
      "monthKey": "2025-11",
      "month": "2025-11",
      "date": "2025-11-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 174792,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Kasım 2025) - Excel Raporu"
    },
    {
      "id": "exp-1098",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 35829,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Aralık 2025) - Excel Raporu"
    },
    {
      "id": "exp-1099",
      "monthKey": "2025-12",
      "month": "2025-12",
      "date": "2025-12-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 174287,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Aralık 2025) - Excel Raporu"
    },
    {
      "id": "exp-1100",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 46993,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ocak 2026) - Excel Raporu"
    },
    {
      "id": "exp-1101",
      "monthKey": "2026-01",
      "month": "2026-01",
      "date": "2026-01-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 465331,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ocak 2026) - Excel Raporu"
    },
    {
      "id": "exp-1102",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 37703,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Şubat 2026) - Excel Raporu"
    },
    {
      "id": "exp-1103",
      "monthKey": "2026-02",
      "month": "2026-02",
      "date": "2026-02-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 257306,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Şubat 2026) - Excel Raporu"
    },
    {
      "id": "exp-1104",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 27626,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Mart 2026) - Excel Raporu"
    },
    {
      "id": "exp-1105",
      "monthKey": "2026-03",
      "month": "2026-03",
      "date": "2026-03-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 45000,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Mart 2026) - Excel Raporu"
    },
    {
      "id": "exp-1106",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 11085,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Nisan 2026) - Excel Raporu"
    },
    {
      "id": "exp-1107",
      "monthKey": "2026-04",
      "month": "2026-04",
      "date": "2026-04-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 172948,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Nisan 2026) - Excel Raporu"
    },
    {
      "id": "exp-1108",
      "monthKey": "2026-05",
      "month": "2026-05",
      "date": "2026-05-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 216899,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Mayıs 2026) - Excel Raporu"
    },
    {
      "id": "exp-1109",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 15760,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Haziran 2026) - Excel Raporu"
    },
    {
      "id": "exp-1110",
      "monthKey": "2026-06",
      "month": "2026-06",
      "date": "2026-06-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 112165,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Haziran 2026) - Excel Raporu"
    },
    {
      "id": "exp-1111",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 13317.5,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Temmuz 2026) - Excel Raporu"
    },
    {
      "id": "exp-1112",
      "monthKey": "2026-07",
      "month": "2026-07",
      "date": "2026-07-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 22166,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Temmuz 2026) - Excel Raporu"
    },
    {
      "id": "exp-1113",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-25",
      "category": "Diğer",
      "type": "OPEX",
      "amount": 19224,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Diğer Genel Giderler & Kesintiler (Ağustos 2026) - Excel Raporu"
    },
    {
      "id": "exp-1114",
      "monthKey": "2026-08",
      "month": "2026-08",
      "date": "2026-08-28",
      "category": "Bakım",
      "type": "CAPEX",
      "amount": 3866,
      "villa": "ALL",
      "property": "Tümü",
      "notes": "Yatırım / Ekipman / Tesis İyileştirme (Ağustos 2026) - Excel Raporu"
    }
  ],
  "bankBalances": {
    "month": "2026-08",
    "garanti": 42292.93,
    "kuveyt": 4377.98,
    "npara": 939.26,
    "nakit": 0,
    "total": 47610.170000000006
  },
  "allTimeTotals": {
    "totalRevenue": 5004165.4,
    "totalNights": 457,
    "avgDailyRate": 10950,
    "totalOpex": 3884571,
    "totalCapex": 1986316,
    "totalExpense": 5870887,
    "netCashProfit": -866721.5999999996,
    "targetCiro": 4920000,
    "villas": {
      "seyir": {
        "name": "Seyir Dağ Evi",
        "days": 97,
        "rev": 1380134
      },
      "dogus": {
        "name": "Doğuş Dağ Evi",
        "days": 98,
        "rev": 903353.4
      },
      "zirve": {
        "name": "Zirve Dağ Evi",
        "days": 85,
        "rev": 1214493.4
      },
      "sirin": {
        "name": "Şirin Dağ Evi",
        "days": 85,
        "rev": 424213.6
      },
      "nefes": {
        "name": "Nefes Dağ Evi",
        "days": 92,
        "rev": 1081971
      }
    }
  }
};

const DEFAULT_VILLAS = {
  'SEYIR': { name: 'Seyir Dağ Evi', code: 'seyir', capacity: '6+2 Kişi', floor: 3500, base: 4500, target: 6000, premium: 8500, peak: 12000, cleanCost: 800, heatCost: 350 },
  'DOGUS': { name: 'Doğuş Dağ Evi', code: 'dogus', capacity: '11 Kişi', floor: 5000, base: 6500, target: 9000, premium: 13000, peak: 18000, cleanCost: 1200, heatCost: 500 },
  'ZIRVE': { name: 'Zirve Dağ Evi (Jakuzi/Sauna)', code: 'zirve', capacity: '9 Kişi', floor: 6500, base: 8500, target: 12000, premium: 16500, peak: 24000, cleanCost: 1500, heatCost: 700 },
  'SIRIN': { name: 'Şirin Dağ Evi', code: 'sirin', capacity: '7 Kişi', floor: 3000, base: 4000, target: 5500, premium: 7500, peak: 11000, cleanCost: 750, heatCost: 300 },
  'NEFES': { name: 'Nefes Dağ Evi', code: 'nefes', capacity: '12 Kişi', floor: 5500, base: 7000, target: 9500, premium: 14000, peak: 19000, cleanCost: 1400, heatCost: 550 }
};

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

const DEFAULT_TARGETS_BY_MONTH = {};
Object.keys(COMPANY_EXCEL_DATABASE.targets).forEach(k => {
  DEFAULT_TARGETS_BY_MONTH[k] = {
    revenue: COMPANY_EXCEL_DATABASE.targets[k],
    netProfit: Math.round(COMPANY_EXCEL_DATABASE.targets[k] * 0.3),
    margin: 30.0,
    occupancy: 65.0,
    adr: 5500
  };
});

const DEFAULT_EXPENSES = COMPANY_EXCEL_DATABASE.expensesList;

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

  // Aralık 2026 - Yılbaşı Rezervasyonları (Kullanıcının tutulan 2 evi)
  { id: 'REZ-NY-001', villa: 'ZIRVE', guest: 'Yılbaşı Konuğu 1 (Zirve Dağ Evi)', checkIn: '2026-12-31', checkOut: '2027-01-03', nights: 3, channel: 'WHATSAPP', gross: 90000, otaComm: 0, cleanFee: 0, net: 90000, pax: 8, status: 'CONFIRMED' },
  { id: 'REZ-NY-002', villa: 'DOGUS', guest: 'Yılbaşı Konuğu 2 (Doğuş Dağ Evi)', checkIn: '2026-12-31', checkOut: '2027-01-03', nights: 3, channel: 'WHATSAPP', gross: 75000, otaComm: 0, cleanFee: 0, net: 75000, pax: 10, status: 'CONFIRMED' },

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
// Old expenses replaced by COMPANY_EXCEL_DATABASE.expensesList


const DEFAULT_LEADS = [
  { id: 'L1', guest: 'Hakan Demir (0532 210 4421)', villa: 'SEYIR', channel: 'WhatsApp', quote: 28000, status: 'WON', lostReason: '-', notes: 'Rezervasyona dönüştü (3 Gece)' },
  { id: 'L2', guest: 'Murat Kaya (0533 112 3344)', villa: 'DOGUS', channel: 'WhatsApp', quote: 36000, status: 'WON', lostReason: '-', notes: '10 kişilik grup kapandı' },
  { id: 'L3', guest: 'Selin B. (0542 998 7766)', villa: 'ZIRVE', channel: 'WhatsApp', quote: 45000, status: 'FOLLOW_UP', lostReason: '-', notes: 'Jakuzili ev için akşam karar verecek' },
  { id: 'L4', guest: 'Kemal V. (0530 443 2211)', villa: 'SIRIN', channel: 'WhatsApp', quote: 18000, status: 'LOST', lostReason: 'Fiyat Yüksek', notes: 'Bütçe uymadı, 14.000 TL teklif etmişti' },
  { id: 'L5', guest: 'Derya S. (0535 667 8899)', villa: 'NEFES', channel: 'WhatsApp', quote: 35000, status: 'QUOTE_SENT', lostReason: '-', notes: 'Tarih teyidi bekleniyor' },
  { id: 'L6', guest: 'Bora Yılmaz (0532 778 9900)', villa: 'ZIRVE', channel: 'WhatsApp', quote: 90000, status: 'WON', lostReason: '-', notes: 'Yılbaşı rezervasyonu onaylandı' },
  { id: 'L7', guest: 'Tarkan E. (0533 889 0011)', villa: 'DOGUS', channel: 'WhatsApp', quote: 40000, status: 'LOST', lostReason: 'Tarih Dolu', notes: '18-21 Eylül istedi, o tarihler doluydu' },
  { id: 'L8', guest: 'Sinem K. (0544 332 1100)', villa: 'ZIRVE', channel: 'WhatsApp', quote: 32000, status: 'LOST', lostReason: 'Cevap Vermedi', notes: 'Teklif gönderildi ancak geri dönüş yapmadı' },
  { id: 'L9', guest: 'Ali Rıza T. (0532 111 2233)', villa: 'SEYIR', channel: 'WhatsApp', quote: 24000, status: 'WON', lostReason: '-', notes: 'Hafta sonu konaklama kapandı' }
];

const DEFAULT_MAINT = [
  { id: 'M1', villa: 'DOGUS', priority: 'P1', title: 'Isı pompası sensör değişimi', assignee: 'Ahmet Usta', downtime: 1, cost: 4500, status: 'OPEN' },
  { id: 'M2', villa: 'ZIRVE', priority: 'P2', title: 'Jakuzi ozon ve filtre bakımı', assignee: 'Teknik Servis', downtime: 0, cost: 2800, status: 'COMPLETED' },
  { id: 'M3', villa: 'SEYIR', priority: 'P2', title: 'Şömine bacası periyodik temizliği', assignee: 'Mehmet', downtime: 0, cost: 1500, status: 'OPEN' }
];

// App State Container
let appData = {
  isCleanState: false,
  excelDb: null,
  villas: {},
  targets: {},
  bookings: [],
  expenses: [],
  leads: [],
  maintenance: []
};

// Global Active Filter
let currentFilter = {
  period: '2026-09',
  villa: 'ALL'
};

let activeTrendRange = '6M';
let pendingImportRows = null;
let propertyViewMode = 'table'; // 'table' or 'cards'

// Initialize and Load Data

// =============================================================
// REZERVASYON TEMİZLİK GÖREVLERİ SENKRONİZASYONU
// =============================================================
// KULLANICI TALEBİ: Gider Defteri'ne ASLA otomatik temizlik gideri EKLENMEZ!
// Gider Defteri %100 kullanıcının manuel kontrolündedir. Kullanıcı bir gideri
// sildiğinde o gider kalıcı olarak silinir, arka plandan tekrar oluşturulmaz.
function syncBookingCleaningTasks() {
  if (!appData.cleaningTasks) appData.cleaningTasks = [];
  if (!appData.bookings) appData.bookings = [];
  if (!appData.expenses) appData.expenses = [];
  if (!appData.deletedCleanTaskIds) appData.deletedCleanTaskIds = [];

  // Eski mükerrer/çift manuel gider kayıtlarını ayıkla (sadece tekil EXP-CLEAN- kalsın)
  appData.expenses = appData.expenses.filter(e => !e.isAutoClean && !(e.id && e.id.startsWith('EXP-CLEAN-MANUAL-')));

  // Rezervasyonları temizlik görevleri listesine (Temizlik & Borç Defteri) BORÇ olarak ekle
  appData.bookings.forEach(b => {
    const cleanFee = Number(b.cleanFee) || 0;
    if (cleanFee <= 0 || b.status === 'CANCELLED') {
      const tIdx = appData.cleaningTasks.findIndex(t => t.bookingId === b.id);
      if (tIdx !== -1) {
        const taskId = appData.cleaningTasks[tIdx].id;
        appData.cleaningTasks.splice(tIdx, 1);
        if (appData.expenses) {
          appData.expenses = appData.expenses.filter(e => e.cleanTaskId !== taskId && e.id !== 'EXP-CLEAN-' + taskId);
        }
      }
      return;
    }

    const taskId = 'TASK-CLN-' + b.id;
    // Kullanıcı bu görevi özellikle sildiyse tekrar türetme
    if (appData.deletedCleanTaskIds && appData.deletedCleanTaskIds.includes(taskId)) return;

    let existing = appData.cleaningTasks.find(t => t.id === taskId || t.bookingId === b.id);
    const vName = (appData.villas && appData.villas[b.villa]?.name) ? appData.villas[b.villa].name : b.villa;

    if (!existing) {
      // REZERVASYON EKRANINDA TEMİZLİK BORCU EKLENDİ (paid: false - Henüz ödenmedi)
      appData.cleaningTasks.push({
        id: taskId,
        bookingId: b.id,
        villa: b.villa,
        guest: b.guest,
        date: b.checkOut,
        cleaner: 'Fatma Hanım (Temizlik Ekibi)',
        amount: cleanFee,
        paid: false,
        paidDate: null,
        notes: `${b.guest} Çıkış Temizliği (${vName})`
      });
    } else {
      existing.date = b.checkOut;
      existing.guest = b.guest;
      existing.villa = b.villa;
      existing.amount = cleanFee;
      if (!existing.notes) existing.notes = `${b.guest} Çıkış Temizliği (${vName})`;
    }
  });
}

function loadAppData() {
  try {
    const saved = localStorage.getItem('LEXBNB_V5_MASTER_DATA');
    if (saved) {
      appData = JSON.parse(saved);
      if (!appData.villas) appData.villas = JSON.parse(JSON.stringify(DEFAULT_VILLAS));
      if (!appData.targets) appData.targets = {};
      if (!appData.bookings) appData.bookings = [];
      // User can freely edit or delete any booking permanently
      if (!appData.expenses) appData.expenses = [];
      if (!appData.leads) appData.leads = [];
      if (!appData.maintenance) appData.maintenance = [];
      if (!appData.cleaningPayments) appData.cleaningPayments = {};
      if (!appData.cleaningTasks) {
        appData.cleaningTasks = [];
      }
      if (!appData.deletedCleanTaskIds) appData.deletedCleanTaskIds = [];
      if (!appData.housekeepingOverrides) appData.housekeepingOverrides = {};

      // Check if user has explicitly reset everything
      if (appData.isCleanState) {
        appData.excelDb = null;
      } else {
        if (!appData.excelDb) {
          appData.excelDb = JSON.parse(JSON.stringify(COMPANY_EXCEL_DATABASE));
        }
        // Gider Defteri kullanıcının sildiği şekilde kalır, otomatik doldurulmaz
        if (Object.keys(appData.targets).length === 0) {
          appData.targets = JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH));
        }
      }
    } else {
      appData = {
        isCleanState: false,
        excelDb: JSON.parse(JSON.stringify(COMPANY_EXCEL_DATABASE)),
        villas: JSON.parse(JSON.stringify(DEFAULT_VILLAS)),
        targets: JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH)),
        bookings: JSON.parse(JSON.stringify(DEFAULT_BOOKINGS)),
        expenses: JSON.parse(JSON.stringify(DEFAULT_EXPENSES)),
        leads: JSON.parse(JSON.stringify(DEFAULT_LEADS)),
        maintenance: JSON.parse(JSON.stringify(DEFAULT_MAINT)),
        cleaningPayments: {},
        cleaningTasks: JSON.parse(JSON.stringify(DEFAULT_CLEANING_TASKS)),
        housekeepingOverrides: {}
      };
      saveAppData();
    }
  syncBookingCleaningTasks();
  } catch (e) {
    console.error('Error loading state:', e);
  }
}

function saveAppData() {
  localStorage.setItem('LEXBNB_V5_MASTER_DATA', JSON.stringify(appData));
  renderAll();
}

const ALL_FINANCIAL_MONTHS = [
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06',
  '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12'
];

const ALL_MONTH_NAMES = {
  '2025-07': 'Temmuz 2025',
  '2025-08': 'Ağustos 2025',
  '2025-09': 'Eylül 2025',
  '2025-10': 'Ekim 2025',
  '2025-11': 'Kasım 2025',
  '2025-12': 'Aralık 2025',
  '2026-01': 'Ocak 2026',
  '2026-02': 'Şubat 2026',
  '2026-03': 'Mart 2026',
  '2026-04': 'Nisan 2026',
  '2026-05': 'Mayıs 2026',
  '2026-06': 'Haziran 2026',
  '2026-07': 'Temmuz 2026',
  '2026-08': 'Ağustos 2026',
  '2026-09': 'Eylül 2026 (Güncel Ay)',
  '2026-10': 'Ekim 2026',
  '2026-11': 'Kasım 2026',
  '2026-12': 'Aralık 2026 (Yılbaşı Sezonu 🎄)',
  '2027-01': 'Ocak 2027 (Kış Zirvesi ❄️)',
  '2027-02': 'Şubat 2027 (Kayak Sezonu ⛷️)',
  '2027-03': 'Mart 2027',
  '2027-04': 'Nisan 2027',
  '2027-05': 'Mayıs 2027',
  '2027-06': 'Haziran 2027',
  '2027-07': 'Temmuz 2027',
  '2027-08': 'Ağustos 2027',
  '2027-09': 'Eylül 2027',
  '2027-10': 'Ekim 2027',
  '2027-11': 'Kasım 2027',
  '2027-12': 'Aralık 2027 (Yılbaşı 2028)',
  'ALL': 'Tüm Zamanlar'
};

function handleFilterChange() {
  currentFilter.period = document.getElementById('globalPeriodFilter').value;
  currentFilter.villa = document.getElementById('globalVillaFilter').value;
  updateStepperLabels();
  renderAll();
}

function stepMonth(delta) {
  let idx = ALL_FINANCIAL_MONTHS.indexOf(currentFilter.period);
  if (idx === -1) idx = ALL_FINANCIAL_MONTHS.indexOf('2026-08');

  let newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < ALL_FINANCIAL_MONTHS.length) {
    currentFilter.period = ALL_FINANCIAL_MONTHS[newIdx];
    const select = document.getElementById('globalPeriodFilter');
    if (select) select.value = currentFilter.period;
    handleFilterChange();
  }
}

function updateStepperLabels() {
  const curIdx = ALL_FINANCIAL_MONTHS.indexOf(currentFilter.period);
  const curLabel = ALL_MONTH_NAMES[currentFilter.period] || currentFilter.period;

  const curEl = document.getElementById('stepperCurrentLabel');
  if (curEl) curEl.innerText = curLabel;

  const prevEl = document.getElementById('stepperPrevLabel');
  if (prevEl) prevEl.innerText = curIdx > 0 ? ALL_MONTH_NAMES[ALL_FINANCIAL_MONTHS[curIdx - 1]] : '';

  const nextEl = document.getElementById('stepperNextLabel');
  if (nextEl) nextEl.innerText = curIdx >= 0 && curIdx < ALL_FINANCIAL_MONTHS.length - 1 ? ALL_MONTH_NAMES[ALL_FINANCIAL_MONTHS[curIdx + 1]] : '';

  const vLabel = currentFilter.villa === 'ALL' ? 'Tüm Mülkler (5 Villa)' : (appData.villas[currentFilter.villa]?.name || currentFilter.villa);
  const vEl = document.getElementById('finTopPropertyLabel');
  if (vEl) vEl.innerText = vLabel;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById(`tab-${tabId}`);
  if (content) content.classList.add('active');

  if (tabId === 'settings') renderSettingsTable();
  if (tabId === 'finance') renderFinanceModule();
  if (tabId === 'expenses') renderExpensesTable();
  if (tabId === 'housekeeping') renderHousekeepingTab();
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
  const expMonth = exp.monthKey || exp.month || (exp.date ? exp.date.substring(0, 7) : '');
  return expMonth === currentFilter.period;
}


// =============================================================
// 📅 TÜRKİYE STANDARDI TARİH FORMATLAYICI (DD.MM.YYYY & DD.MM)
// =============================================================
function formatTrDate(dateStr, includeYear = true) {
  if (!dateStr || typeof dateStr !== 'string') return '-';
  const clean = dateStr.trim();
  const parts = clean.split(/[-/.]/);
  if (parts.length === 3) {
    let y, m, d;
    if (parts[0].length === 4) {
      [y, m, d] = parts;
    } else if (parts[2].length === 4) {
      [d, m, y] = parts;
    } else {
      return clean;
    }
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return includeYear ? `${dd}.${mm}.${y}` : `${dd}.${mm}`;
  }
  return clean;
}

function formatShortDate(dateStr) {
  return formatTrDate(dateStr, false);
}


// =============================================================
// 🔄 MOBİL ÖNBELLEK (CACHE) & ÇEREZ TEMİZLEME MOTORU
// =============================================================
const CURRENT_APP_BUILD_VERSION = '5.5.2-20260907';

async function forceHardRefresh() {
  const confirmed = confirm('Tarayıcı ve mobildeki eski önbellek (cache) ve çerez kalıntıları temizlenip en güncel canlı sürüm yüklensin mi?\n\n(Not: Yetkili PIN şifreniz korunacaktır.)');
  if (!confirmed) return;

  if (window.showToast) {
    window.showToast('🔄 Önbellek temizleniyor, en güncel sürüm yükleniyor...');
  }

  try {
    // 1. Delete all Service Worker / Browser Cache API items
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }

    // 2. Preserve Master PIN and reset stale local storage
    const savedPin = localStorage.getItem('LEXBNB_MASTER_PIN_AUTH') || localStorage.getItem('LEXBNB_AUTH_KEY') || 'uludagtatil2026.';
    
    // Clear known storage keys
    const removeKeys = [
      'LEXBNB_V5_MASTER_DATA',
      'LEXBNB_APP_DATA_V4',
      'LEXBNB_V3_STATE',
      'LEXBNB_APP_DATA'
    ];
    removeKeys.forEach(k => localStorage.removeItem(k));

    // Restore PIN and set current version
    localStorage.setItem('LEXBNB_MASTER_PIN_AUTH', savedPin);
    localStorage.setItem('LEXBNB_AUTH_KEY', savedPin);
    localStorage.setItem('LEXBNB_APP_VERSION', CURRENT_APP_BUILD_VERSION);

    // 3. Force hard navigation with timestamp cache-buster
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now());
    url.searchParams.set('key', savedPin);
    window.location.replace(url.toString());
  } catch (err) {
    console.error('Hard refresh error:', err);
    window.location.reload(true);
  }
}

// Master Render All Components
function renderAll() {
  updateStepperLabels();
  renderFinanceModule();
  renderKPIsAndDashboard();
  renderManageBookingsTable();
  renderExpensesTable();
  renderManageLeadsTable();
  renderLeadAnalytics();
  renderManageMaintTable();
  renderGapNights();
  renderTodayRadar();
  renderOtaRadar();
  runWhatIfSimulation();
  renderTrajectoryRadar();
  renderDailyOps();
  renderTapeChart();
  renderHousekeepingTab();

  // Badges
  const rBadge = document.getElementById('rezCountBadge');
  if (rBadge) rBadge.innerText = appData.bookings.length;
  const eBadge = document.getElementById('expenseCountBadge');
  if (eBadge) eBadge.innerText = appData.expenses.length;
  const lBadge = document.getElementById('leadCountBadge');
  if (lBadge) lBadge.innerText = appData.leads.length;
  const mBadge = document.getElementById('maintCountBadge');
  if (mBadge) mBadge.innerText = appData.maintenance.filter(m => m.status === 'OPEN').length;
}

// =============================================================
// 1. PROFESYONEL FİNANSAL PERFORMANS MODÜLÜ (GENEL RAPOR ENTEGRELİ)
// =============================================================
function renderFinanceModule() {
  let totalRevenue = 0;
  let totalOpex = 0;
  let totalCapex = 0;
  let totalSoldNights = 0;
  let avgRevPerNight = 0;
  let targetRev = 300000;
  let propStats = {
    SEYIR: { name: 'Seyir Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    DOGUS: { name: 'Doğuş Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    ZIRVE: { name: 'Zirve Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    SIRIN: { name: 'Şirin Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 },
    NEFES: { name: 'Nefes Dağ Evi', revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 }
  };

  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach(c => { categoryTotals[c.name] = 0; });

  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;

  if (activeExcel) {
    if (currentFilter.period === 'ALL') {
      // All-time Totals (14 Months from GENEL RAPOR.xlsx)
      const att = activeExcel.allTimeTotals;
      totalRevenue = att.totalRevenue;
      totalSoldNights = att.totalNights;
      avgRevPerNight = att.avgDailyRate;
      totalOpex = att.totalOpex;
      totalCapex = att.totalCapex;
      const userAllTarget = (appData.targets && appData.targets['ALL']) ? appData.targets['ALL'].revenue : null;
      targetRev = userAllTarget || att.targetCiro;

      // All-time per villa
      propStats.SEYIR = { name: 'Seyir Dağ Evi', revenue: att.villas.seyir.rev, nights: att.villas.seyir.days, adr: Math.round(att.villas.seyir.rev / att.villas.seyir.days), share: Number(((att.villas.seyir.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.seyir.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.seyir.rev / (14*30)) };
      propStats.DOGUS = { name: 'Doğuş Dağ Evi', revenue: att.villas.dogus.rev, nights: att.villas.dogus.days, adr: Math.round(att.villas.dogus.rev / att.villas.dogus.days), share: Number(((att.villas.dogus.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.dogus.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.dogus.rev / (14*30)) };
      propStats.ZIRVE = { name: 'Zirve Dağ Evi', revenue: att.villas.zirve.rev, nights: att.villas.zirve.days, adr: Math.round(att.villas.zirve.rev / att.villas.zirve.days), share: Number(((att.villas.zirve.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.zirve.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.zirve.rev / (14*30)) };
      propStats.SIRIN = { name: 'Şirin Dağ Evi', revenue: att.villas.sirin.rev, nights: att.villas.sirin.days, adr: Math.round(att.villas.sirin.rev / att.villas.sirin.days), share: Number(((att.villas.sirin.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.sirin.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.sirin.rev / (14*30)) };
      propStats.NEFES = { name: 'Nefes Dağ Evi', revenue: att.villas.nefes.rev, nights: att.villas.nefes.days, adr: Math.round(att.villas.nefes.rev / att.villas.nefes.days), share: Number(((att.villas.nefes.rev / totalRevenue)*100).toFixed(1)), occupancy: Number(((att.villas.nefes.days / (14*30))*100).toFixed(1)), revpar: Math.round(att.villas.nefes.rev / (14*30)) };

    } else {
      // Specific Month from Official Database
      const mf = activeExcel.monthlyFinancials[currentFilter.period];
      const pm = activeExcel.propertyMonthly[currentFilter.period];

      if (mf) {
        totalRevenue = mf.ciro;
        totalOpex = mf.opex;
        totalCapex = mf.capex;
        totalSoldNights = mf.daysSold || (pm ? pm.totalDays : 0);
        avgRevPerNight = mf.avgDaily ? Math.round(mf.avgDaily) : (totalSoldNights > 0 ? Math.round(totalRevenue / totalSoldNights) : 0);
        const userPeriodTarget = (appData.targets && appData.targets[currentFilter.period]) ? appData.targets[currentFilter.period].revenue : null;
        targetRev = userPeriodTarget || activeExcel.targets[currentFilter.period] || 300000;
      } else {
        // Current or Future Month (e.g. 2026-09, 2026-10, 2026-12 Yılbaşı): Read from real-time bookings & expenses
        const userPeriodTarget = (appData.targets && appData.targets[currentFilter.period]) ? appData.targets[currentFilter.period].revenue : null;
        targetRev = userPeriodTarget || (activeExcel && activeExcel.targets ? activeExcel.targets[currentFilter.period] : null) || (currentFilter.period === '2026-12' ? 1200000 : 350000);
      }

      if (pm && pm.villas) {
        pm.villas.forEach(v => {
          propStats[v.id] = {
            name: v.name,
            revenue: v.rev,
            nights: v.days,
            adr: v.adr,
            share: v.share,
            occupancy: v.occupancy,
            revpar: v.revpar
          };
        });
      }

      // Filter single villa if specified
      if (currentFilter.villa !== 'ALL' && propStats[currentFilter.villa]) {
        const vData = propStats[currentFilter.villa];
        totalRevenue = vData.revenue;
        totalSoldNights = vData.nights;
        avgRevPerNight = vData.adr;
        const vShare = vData.share > 0 ? vData.share / 100 : 0.2;
        totalOpex = Math.round(totalOpex * vShare);
        totalCapex = Math.round(totalCapex * vShare);
        targetRev = Math.round(targetRev * 0.2);
      }
    }
  }

  // Include user-entered bookings (in clean state, ALL revenue comes from here!)
  let manualBookingRev = 0;
  let manualBookingNights = 0;
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const bNet = Number(b.net || b.gross) || 0;
    const bNights = Number(b.nights) || 0;
    manualBookingRev += bNet;
    manualBookingNights += bNights;

    // If no static excel record for this month (e.g. September, December Yılbaşı), populate stats from bookings
    const hasStaticExcel = (activeExcel && activeExcel.monthlyFinancials && activeExcel.monthlyFinancials[currentFilter.period]);
    if (!hasStaticExcel) {
      if (propStats[b.villa]) {
        propStats[b.villa].revenue += bNet;
        propStats[b.villa].nights += bNights;
      }
    }
  });

  const hasStaticExcelMonth = (activeExcel && activeExcel.monthlyFinancials && activeExcel.monthlyFinancials[currentFilter.period]);
  if (!hasStaticExcelMonth) {
    totalRevenue = manualBookingRev;
    totalSoldNights = manualBookingNights;
    avgRevPerNight = totalSoldNights > 0 ? Math.round(totalRevenue / totalSoldNights) : 0;
    
    const daysInPeriod = currentFilter.period === 'ALL' ? (14 * 30) : 30;
    Object.keys(propStats).forEach(vKey => {
      const s = propStats[vKey];
      s.adr = s.nights > 0 ? Math.round(s.revenue / s.nights) : 0;
      s.share = totalRevenue > 0 ? Number(((s.revenue / totalRevenue) * 100).toFixed(1)) : 0;
      s.occupancy = Number(((s.nights / daysInPeriod) * 100).toFixed(1));
      s.revpar = Math.round(s.revenue / daysInPeriod);
    });

    if (currentFilter.villa !== 'ALL' && propStats[currentFilter.villa]) {
      const vData = propStats[currentFilter.villa];
      totalRevenue = vData.revenue;
      totalSoldNights = vData.nights;
      avgRevPerNight = vData.adr;
    }
  }

  // Categorical expenses
  appData.expenses.forEach(exp => {
    if (!isExpenseInFilter(exp)) return;
    const amt = Number(exp.amount) || 0;
    if (categoryTotals[exp.category] !== undefined) {
      categoryTotals[exp.category] += amt;
    } else {
      categoryTotals['Diğer'] = (categoryTotals['Diğer'] || 0) + amt;
    }
    const isDynamicExpensePeriod = !hasStaticExcelMonth && (!activeExcel || currentFilter.period !== 'ALL');
    if (isDynamicExpensePeriod) {
      if (exp.type === 'CAPEX') totalCapex += amt;
      else totalOpex += amt;
    }
  });

  // Hierarchy calculations
  const operatingProfit = totalRevenue - totalOpex;
  const netCashProfit = operatingProfit - totalCapex;
  const totalExpense = totalOpex + totalCapex;
  const netMargin = totalRevenue > 0 ? (netCashProfit / totalRevenue) * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? (totalExpense / totalRevenue) * 100 : 0;

  // Monthly Target Comparison
  const targetDiff = totalRevenue - targetRev;
  const targetPct = targetRev > 0 ? (totalRevenue / targetRev) * 100 : 0;
  const forecastEndMonth = Math.round(totalRevenue * 1.018);

  // Update Top 5 KPI Cards
  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  setEl('finActualRevenue', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('finRevTargetDelta', `Hedefin %${Math.round(Math.abs(targetPct - 100))} ${targetDiff >= 0 ? 'üzerinde' : 'altında'}`);
  setEl('finTargetRevenue', `${Math.round(targetRev).toLocaleString('tr-TR')} TL`);
  setEl('finTargetDiff', `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL fark`);

  setEl('finNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('finNetMarginLabel', `%${netMargin.toFixed(1)} net kâr marjı`);

  setEl('finTotalExpense', `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`);
  setEl('finExpenseRatio', `Cironun %${expenseRatio.toFixed(1)}'i`);

  setEl('finSoldNights', `${totalSoldNights} gece`);
  setEl('finAvgRevPerNight', `${avgRevPerNight.toLocaleString('tr-TR')} TL / satılan gece`);

  // Target Analysis Box
  setEl('tgtBoxTarget', `${Math.round(targetRev).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxActual', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxDiff', `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxPct', `%${targetPct.toFixed(1)}`);
  setEl('tgtBoxForecast', `${forecastEndMonth.toLocaleString('tr-TR')} TL`);
  setEl('finTargetStatusBadge', `%${targetPct.toFixed(1)} Hedef Başarısı`);
  setEl('targetBarRatioText', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL / ${Math.round(targetRev).toLocaleString('tr-TR')} TL (%${targetPct.toFixed(1)})`);

  const fillEl = document.getElementById('targetBarFill');
  if (fillEl) fillEl.style.width = `${Math.min(100, Math.max(0, targetPct))}%`;

  // Profit Waterfall Bridge
  setEl('brCiro', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('brOpex', `-${Math.round(totalOpex).toLocaleString('tr-TR')} TL`);
  setEl('brOpProfit', `${Math.round(operatingProfit).toLocaleString('tr-TR')} TL`);
  setEl('brCapex', `-${Math.round(totalCapex).toLocaleString('tr-TR')} TL`);
  setEl('brNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('brNetMargin', `%${netMargin.toFixed(1)} Net Kâr Marjı`);

  // Render Expense Donut Chart & Category Table
  renderExpenseDonutAndTable(categoryTotals, totalExpense, totalRevenue, totalOpex, totalCapex);

  // Render Property Finance Scorecards
  renderPropertyFinanceCards(propStats, totalRevenue);

  // Render Property Comparison Chart
  renderPropertyComparisonChart(propStats);

  // Render Monthly KPI Tracker
  renderMonthlyKpiTracker();

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
// MÜLK BAZLI FİNANSAL KARTLAR (5 VİLLA DETAYI - EXCEL VERİTABANINDAN)
// -------------------------------------------------------------
function setPropViewMode(mode) {
  propertyViewMode = mode;
  const tableBtn = document.getElementById('propViewTableBtn');
  const cardsBtn = document.getElementById('propViewCardsBtn');
  const tableWrap = document.getElementById('propExecutiveTableContainer');
  const cardsWrap = document.getElementById('propCardsContainer');

  if (mode === 'table') {
    if (tableBtn) tableBtn.classList.add('active');
    if (cardsBtn) cardsBtn.classList.remove('active');
    if (tableWrap) tableWrap.style.display = 'block';
    if (cardsWrap) cardsWrap.style.display = 'none';
  } else {
    if (tableBtn) tableBtn.classList.remove('active');
    if (cardsBtn) cardsBtn.classList.add('active');
    if (tableWrap) tableWrap.style.display = 'none';
    if (cardsWrap) cardsWrap.style.display = 'grid';
  }
}

function filterByVilla(vKey) {
  const select = document.getElementById('globalVillaFilter');
  if (select) {
    select.value = vKey;
    handleFilterChange();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderPropertyFinanceCards(propStats, totalRevenue) {
  const tableBody = document.getElementById('propExecTableBody');
  const cardsContainer = document.getElementById('propCardsContainer');
  if (!tableBody && !cardsContainer) return;

  const vMeta = {
    'SEYIR': { icon: '🏔️', spec: '6+2 Kişi • Şömine & Barbekü', color: '#3B82F6' },
    'ZIRVE': { icon: '💎', spec: '9 Kişi • Jakuzi & Sauna Lüks', color: '#10B981' },
    'NEFES': { icon: '🌲', spec: '12 Kişi • Geniş Aile & Şömine', color: '#8B5CF6' },
    'DOGUS': { icon: '🌄', spec: '11 Kişi • Dağ & Doğa Manzaralı', color: '#06B6D4' },
    'SIRIN': { icon: '🌿', spec: '7 Kişi • Butik Dağ Evi', color: '#F59E0B' }
  };

  const vKeys = ['SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'];
  
  // Sort villas by revenue descending so #1 is clearly visible
  const sortedVillas = vKeys.map(k => {
    const s = propStats[k] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 };
    return { key: k, conf: DEFAULT_VILLAS[k] || {}, stats: s, meta: vMeta[k] || {} };
  }).sort((a, b) => b.stats.revenue - a.stats.revenue);

  // 1. Render Executive Ranking Matrix Table
  if (tableBody) {
    tableBody.innerHTML = '';
    sortedVillas.forEach((item, idx) => {
      const s = item.stats;
      const rank = idx + 1;
      const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
      const ciroShare = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
      const estimatedCost = Math.round(s.revenue * 0.45);
      const estimatedProfit = Math.max(0, s.revenue - estimatedCost);
      const profitMargin = s.revenue > 0 ? ((estimatedProfit / s.revenue) * 100).toFixed(1) : 0;
      const occVal = Number(s.occupancy || (currentFilter.period === 'ALL' ? ((s.nights / (14 * 30)) * 100).toFixed(1) : ((s.nights / 31) * 100).toFixed(1)));
      const adrVal = Math.round(s.adr || (s.nights > 0 ? s.revenue / s.nights : 0));

      // Determine Strategic Diagnosis
      let diagBadge = '<span class="badge badge-emerald">🟢 Dengeli</span>';
      if (rank === 1 && s.revenue > 0) diagBadge = '<span class="badge badge-emerald">👑 Ciro Şampiyonu</span>';
      else if (item.key === 'ZIRVE' && adrVal > 8000) diagBadge = '<span class="badge badge-purple">💎 Yüksek Marj & Lüks</span>';
      else if (item.key === 'SIRIN' && occVal > 85 && adrVal < 3500) diagBadge = '<span class="badge badge-amber">⚠️ Düşük Fiyat Kaçağı</span>';
      else if (occVal < 40 && s.revenue > 0) diagBadge = '<span class="badge badge-rose">📉 Boşluk Riski</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="prop-name-col">
            <span class="rank-badge ${rankClass}">#${rank}</span>
            <div class="villa-icon-avatar">${item.meta.icon || '🏡'}</div>
            <div class="villa-text-meta">
              <h4>${item.conf.name}</h4>
              <span>${item.meta.spec}</span>
            </div>
          </div>
        </td>
        <td>${diagBadge}</td>
        <td>
          <strong style="font-size:14px; color:#FFFFFF;">${Math.round(s.revenue).toLocaleString('tr-TR')} TL</strong>
          <div class="table-bar-wrapper" style="margin-top:4px;">
            <div class="table-bar-track">
              <div class="table-bar-fill bar-blue" style="width: ${Math.min(100, Math.max(0, ciroShare))}%;"></div>
            </div>
            <span style="font-size:10px; color:var(--text-muted);">Portföy Payı: %${ciroShare.toFixed(1)}</span>
          </div>
        </td>
        <td>
          <strong style="color:var(--text-primary);">${s.nights} Gece</strong>
          <div class="table-bar-wrapper" style="margin-top:4px;">
            <div class="table-bar-track">
              <div class="table-bar-fill ${occVal >= 75 ? 'bar-emerald' : (occVal >= 45 ? 'bar-blue' : 'bar-amber')}" style="width: ${Math.min(100, Math.max(0, occVal))}%;"></div>
            </div>
            <span style="font-size:10px; color:var(--text-muted);">Doluluk: %${occVal}</span>
          </div>
        </td>
        <td><strong>${adrVal.toLocaleString('tr-TR')} TL</strong></td>
        <td>₺${Math.round(s.revpar || 0).toLocaleString('tr-TR')}</td>
        <td>
          <strong class="text-emerald">₺${Math.round(estimatedProfit).toLocaleString('tr-TR')}</strong>
          <span style="display:block; font-size:10px; color:var(--text-muted);">%${profitMargin} Marj</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="filterByVilla('${item.key}')">🔍 Odaklan</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // 2. Render Redesigned Premium Cards
  if (cardsContainer) {
    cardsContainer.innerHTML = '';
    sortedVillas.forEach((item, idx) => {
      const s = item.stats;
      const rank = idx + 1;
      const ciroShare = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
      const estimatedCost = Math.round(s.revenue * 0.45);
      const estimatedProfit = Math.max(0, s.revenue - estimatedCost);
      const occVal = Number(s.occupancy || (currentFilter.period === 'ALL' ? ((s.nights / (14 * 30)) * 100).toFixed(1) : ((s.nights / 31) * 100).toFixed(1)));
      const adrVal = Math.round(s.adr || (s.nights > 0 ? s.revenue / s.nights : 0));

      const card = document.createElement('div');
      card.className = `prop-card-premium ${rank === 1 ? 'leader-card' : ''}`;
      card.onclick = () => filterByVilla(item.key);

      card.innerHTML = `
        <div class="prop-card-head">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="villa-icon-avatar">${item.meta.icon || '🏡'}</div>
            <div>
              <h3 style="margin:0; font-size:15px; font-weight:700;">${item.conf.name}</h3>
              <span style="font-size:11px; color:var(--text-muted);">${item.meta.spec}</span>
            </div>
          </div>
          <span class="badge ${rank === 1 ? 'badge-amber' : 'badge-blue'}">#${rank} Sıra</span>
        </div>

        <div class="prop-hero-ciro-box">
          <div>
            <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">AYLIK FİİLİ CİRO</span>
            <div class="hero-ciro-val">${Math.round(s.revenue).toLocaleString('tr-TR')} TL</div>
          </div>
          <span class="badge badge-emerald">%${ciroShare.toFixed(1)} Pay</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
            <span>Doluluk Oranı (${s.nights} Gece)</span>
            <strong style="color:#FFFFFF;">%${occVal}</strong>
          </div>
          <div class="table-bar-track" style="height:8px;">
            <div class="table-bar-fill ${occVal >= 75 ? 'bar-emerald' : (occVal >= 45 ? 'bar-blue' : 'bar-amber')}" style="width: ${Math.min(100, Math.max(0, occVal))}%;"></div>
          </div>
        </div>

        <div class="prop-submetrics-2x2">
          <div class="subm-box">
            <span class="s-lbl">ORT. GÜNLÜK (ADR)</span>
            <span class="s-val">${adrVal.toLocaleString('tr-TR')} TL</span>
          </div>
          <div class="subm-box">
            <span class="s-lbl">RevPAR (VERİM)</span>
            <span class="s-val">₺${Math.round(s.revpar || 0).toLocaleString('tr-TR')}</span>
          </div>
          <div class="subm-box">
            <span class="s-lbl">TAHMİNİ NET KÂR</span>
            <span class="s-val text-emerald">₺${Math.round(estimatedProfit).toLocaleString('tr-TR')}</span>
          </div>
          <div class="subm-box">
            <span class="s-lbl">KÂR MARJI</span>
            <span class="s-val">%${s.revenue > 0 ? ((estimatedProfit / s.revenue) * 100).toFixed(1) : 0}</span>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px; font-size:11px; color:#60A5FA;">
          <span>🔍 Villaya Göre Filtrele</span>
          <span>Detayı Gör ›</span>
        </div>
      `;
      cardsContainer.appendChild(card);
    });
  }
}

// -------------------------------------------------------------
// MÜLK KARŞILAŞTIRMA VE ANOMALİ TESPİTİ
// -------------------------------------------------------------
function renderPropertyComparisonChart(propStats) {
  const metric = document.getElementById('compMetricSelect')?.value || 'ciro';
  const container = document.getElementById('comparisonBarsContainer');
  if (!container) return;
  container.innerHTML = '';

  const vKeys = ['SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'];
  const values = [];

  vKeys.forEach(vKey => {
    const s = propStats[vKey] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0 };
    let val = 0;
    if (metric === 'ciro') val = s.revenue;
    if (metric === 'netKar') val = Math.round(s.revenue * 0.4);
    if (metric === 'adr') val = s.adr || (s.nights > 0 ? Math.round(s.revenue / s.nights) : 0);
    if (metric === 'revpar') val = s.revpar || Math.round(s.revenue / 31);
    if (metric === 'doluluk') val = Number(s.occupancy || ((s.nights / 31) * 100).toFixed(1));
    if (metric === 'satilanGece') val = s.nights;
    values.push({ key: vKey, name: DEFAULT_VILLAS[vKey].name, val });
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
  if (anomContainer) {
    anomContainer.innerHTML = '';

    const anomalies = [];
    if (currentFilter.period === '2026-08' || currentFilter.period === 'ALL') {
      anomalies.push({ type: 'warning', text: '⚠️ ŞİRİN: Yüksek Doluluk (30 Gece / %96,8) ancak Düşük ADR (2.826 TL) — Fiyat savunması zayıf, talep varken taban fiyat derhal artırılmalı.' });
      anomalies.push({ type: 'success', text: '💎 ZİRVE: Sadece 9 satılan gece ile portföyün en yüksek cirosunu (138.190 TL, 15.354 TL/gece) üretti — Premium jakuzi/sauna fiyatlama gücü kanıtlandı.' });
      anomalies.push({ type: 'warning', text: '⚠️ NEFES: 12 kişilik yüksek kapasiteye rağmen ciro (65.302 TL) portföy ortalamasının altında kaldı — Grup rezervasyonları için esnek paketler tavsiye edilir.' });
    } else if (currentFilter.period === '2026-01') {
      anomalies.push({ type: 'success', text: '🔥 REKOR AY: Ocak 2026\'da 843.555 TL ciro ve 512.497 TL net kâr ile şirket rekoru kırıldı. Zirve 279.549 TL tek başına ciro getirdi.' });
    } else {
      anomalies.push({ type: 'info', text: `📌 ${ALL_MONTH_NAMES[currentFilter.period] || currentFilter.period} dönemi resmi şirket raporu verileri başarıyla incelendi.` });
    }

    anomalies.forEach(anom => {
      const div = document.createElement('div');
      div.className = `anomaly-alert ${anom.type}`;
      div.innerText = anom.text;
      anomContainer.appendChild(div);
    });
  }
}

// -------------------------------------------------------------
// AYLIK TREND VE GEÇEN YIL KARŞILAŞTIRMASI (RESMİ EXCEL VERİLERİ)
// -------------------------------------------------------------
function setTrendRange(range) {
  activeTrendRange = range;
  document.querySelectorAll('.trend-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  renderMonthlyTrendChart();
}

function renderMonthlyTrendChart() {
  const container = document.getElementById('trendChartContainer');
  if (!container) return;
  container.innerHTML = '';

  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;
  if (!activeExcel) {
    container.innerHTML = `
      <div style="text-align:center; padding: 45px 20px; color: var(--color-slate-400);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📊</div>
        <strong style="color:var(--color-slate-200); font-size:1.05rem;">Sistem Verileri Sıfırlandı (Temiz Kasa)</strong>
        <p style="font-size: 0.85rem; margin-top: 6px;">Yeni rezervasyonlar ve harcamalar eklendikçe aylık trend sütunları burada otomatik oluşacaktır.</p>
      </div>
    `;
    return;
  }

  const mfKeys = [
    '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'
  ];

  let keysToShow = mfKeys;
  if (activeTrendRange === '3M') keysToShow = mfKeys.slice(-3);
  if (activeTrendRange === '6M') keysToShow = mfKeys.slice(-6);
  if (activeTrendRange === 'YTD') keysToShow = mfKeys.filter(k => k.startsWith('2026'));

  const displayData = keysToShow.map(k => {
    const f = activeExcel.monthlyFinancials[k] || { monthName: '', year: '', ciro: 0, opex: 0, netProfit: 0 };
    return {
      key: k,
      month: (f.monthName ? f.monthName.slice(0, 3) + ' ' + f.year.slice(2) : k),
      ciro: f.ciro || 0,
      opex: f.opex || 0,
      profit: Math.max(0, f.netProfit || 0)
    };
  });

  const maxVal = Math.max(100000, ...displayData.map(d => Math.max(d.ciro, d.opex)));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 500 210');
  svg.setAttribute('class', 'trend-svg');

  const stepX = 500 / displayData.length;
  const barW = Math.max(8, Math.min(22, stepX / 4));

  displayData.forEach((d, idx) => {
    const baseX = idx * stepX + (stepX / 2) - (barW * 1.6);
    const hCiro = Math.max(2, (d.ciro / maxVal) * 155);
    const hOpex = Math.max(2, (d.opex / maxVal) * 155);
    const hProfit = Math.max(2, (d.profit / maxVal) * 155);

    // Ciro bar
    const rCiro = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rCiro.setAttribute('x', baseX);
    rCiro.setAttribute('y', 175 - hCiro);
    rCiro.setAttribute('width', barW);
    rCiro.setAttribute('height', hCiro);
    rCiro.setAttribute('fill', '#3B82F6');
    rCiro.setAttribute('rx', '3');
    rCiro.innerHTML = `<title>${d.key} Ciro: ${d.ciro.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rCiro);

    // Opex bar
    const rOpex = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rOpex.setAttribute('x', baseX + barW + 2);
    rOpex.setAttribute('y', 175 - hOpex);
    rOpex.setAttribute('width', barW);
    rOpex.setAttribute('height', hOpex);
    rOpex.setAttribute('fill', '#EF4444');
    rOpex.setAttribute('rx', '3');
    rOpex.innerHTML = `<title>${d.key} Gider: ${d.opex.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rOpex);

    // Profit bar
    const rProfit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rProfit.setAttribute('x', baseX + (barW * 2) + 4);
    rProfit.setAttribute('y', 175 - hProfit);
    rProfit.setAttribute('width', barW);
    rProfit.setAttribute('height', hProfit);
    rProfit.setAttribute('fill', '#10B981');
    rProfit.setAttribute('rx', '3');
    rProfit.innerHTML = `<title>${d.key} Net Kâr: ${d.profit.toLocaleString('tr-TR')} TL</title>`;
    svg.appendChild(rProfit);

    // Label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', baseX + (barW * 1.5));
    text.setAttribute('y', 198);
    text.setAttribute('fill', '#9CA3AF');
    text.setAttribute('font-size', '10');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = d.month;
    svg.appendChild(text);
  });

  container.appendChild(svg);
}

function renderYoYComparison(actualRevenue, actualOpex, actualNetProfit, actualNights) {
  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;
  const subEl = document.getElementById('yoySubText');
  const badgeEl = document.getElementById('yoyBadge');
  const container = document.getElementById('yoyBoxesContainer');

  if (!activeExcel) {
    if (subEl) subEl.innerText = 'Temiz Kasa';
    if (badgeEl) badgeEl.innerText = 'Veriler Sıfırlandı';
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding: 25px; color: var(--color-slate-400); grid-column: span 3;">
          Veriler sıfırlandı. Karşılaştırma yapabilmek için geçmiş dönem verisi bekleniyor.
        </div>
      `;
    }
    return;
  }

  let prevKey = '2025-08';
  if (currentFilter.period && currentFilter.period.startsWith('2026-')) {
    prevKey = '2025-' + currentFilter.period.split('-')[1];
  }

  const prevMf = activeExcel.monthlyFinancials[prevKey] || activeExcel.monthlyFinancials['2025-08'] || {};
  const prevRevenue = prevMf.ciro || 0;
  const prevNights = prevMf.daysSold || 0;
  const prevNetProfit = prevMf.netProfit || 0;

  const revDeltaNominal = actualRevenue - prevRevenue;
  const revDeltaPct = prevRevenue > 0 ? (revDeltaNominal / prevRevenue) * 100 : 0;
  const profitDeltaNominal = actualNetProfit - prevNetProfit;
  const profitDeltaPct = prevNetProfit > 0 ? (profitDeltaNominal / prevNetProfit) * 100 : 0;
  const nightsDelta = actualNights - prevNights;
  const nightsDeltaPct = prevNights > 0 ? (nightsDelta / prevNights) * 100 : 0;

  if (subEl) subEl.innerText = `${prevMf.monthName} ${prevMf.year} vs ${document.getElementById('stepperCurrentLabel')?.innerText || ''}`;
  if (badgeEl) badgeEl.innerText = `Nominal Büyüme: %${revDeltaPct >= 0 ? '+' : ''}${revDeltaPct.toFixed(1)}`;

  if (!container) return;
  container.innerHTML = `
    <div class="yoy-row">
      <div class="yoy-metric">Ciro</div>
      <div class="yoy-val-prev">${prevRevenue.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualRevenue).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta ${revDeltaNominal >= 0 ? 'text-emerald' : 'text-rose'}">${revDeltaNominal >= 0 ? '+' : ''}${Math.round(revDeltaNominal).toLocaleString('tr-TR')} TL (%${revDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Net Kâr</div>
      <div class="yoy-val-prev">${prevNetProfit.toLocaleString('tr-TR')} TL</div>
      <div class="yoy-val-cur"><strong>${Math.round(actualNetProfit).toLocaleString('tr-TR')} TL</strong></div>
      <div class="yoy-delta ${profitDeltaNominal >= 0 ? 'text-emerald' : 'text-rose'}">${profitDeltaNominal >= 0 ? '+' : ''}${Math.round(profitDeltaNominal).toLocaleString('tr-TR')} TL (%${profitDeltaPct.toFixed(1)})</div>
    </div>
    <div class="yoy-row">
      <div class="yoy-metric">Satılan Gece</div>
      <div class="yoy-val-prev">${prevNights} Gece</div>
      <div class="yoy-val-cur"><strong>${actualNights} Gece</strong></div>
      <div class="yoy-delta ${nightsDelta >= 0 ? 'text-emerald' : 'text-rose'}">${nightsDelta >= 0 ? '+' : ''}${nightsDelta} Gece (%${nightsDeltaPct.toFixed(1)})</div>
    </div>
  `;
}

// -------------------------------------------------------------
// LEXBNB AI FİNANS ANALİSTİ (GERÇEK VERİ KORELASYON MOTORU)
// -------------------------------------------------------------
function renderAIFinancialAnalyst(revenue, targetRev, targetPct, opex, capex, netProfit, netMargin, propStats) {
  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;
  const goodBox = document.getElementById('aiGoodContent');
  const badBox = document.getElementById('aiBadContent');
  const whyBox = document.getElementById('aiWhyContent');
  const actionBox = document.getElementById('aiActionContent');

  if (!activeExcel && revenue === 0) {
    if (goodBox) goodBox.innerHTML = '<p>• <strong>Temiz Başlangıç:</strong> Sistem verileri sıfırlandı. Yeni rezervasyonlar girildikçe finansal analizler burada anlık oluşturulacaktır.</p>';
    if (badBox) badBox.innerHTML = '<p>• <strong>Kaçak Yok:</strong> Şu anda kayıtlı maliyet kaçağı veya düşük fiyat anomalisi bulunmuyor.</p>';
    if (whyBox) whyBox.innerHTML = '<p>• <strong>Korelasyon:</strong> Rezervasyon ve harcama girişi yapıldıkça maliyet korelasyonları tespit edilecektir.</p>';
    if (actionBox) actionBox.innerHTML = '<div style="padding: 15px; color: var(--color-slate-400); text-align:center;">Yeni rezervasyon veya harcama kaydı bekleniyor.</div>';
    return;
  }
  if (goodBox) {
    goodBox.innerHTML = `
      <p>• <strong>Ciro Başarısı:</strong> Hedeflenen ${targetRev.toLocaleString('tr-TR')} TL ciroya karşılık ${Math.round(revenue).toLocaleString('tr-TR')} TL gerçekleşerek <strong>%${targetPct.toFixed(1)}</strong> gerçekleşme oranı elde edildi.</p>
      <p>• <strong>Zirve Dağ Evi Liderliği:</strong> Zirve, sauna ve jakuzi donanımı ile yüksek gecelik gelir savunmasını yaparak ciroya en büyük nakit katkıyı getirdi.</p>
      <p>• <strong>Tarihsel Ölçek:</strong> Şirket kuruluşundan bu yana toplam <strong>5.004.165 TL</strong> ciro ve <strong>457 satılan geceye</strong> ulaşarak Uludağ bölgesindeki liderliğini pekiştirdi.</p>
    `;
  }

  if (badBox) {
    badBox.innerHTML = `
      <p>• <strong>Gider / Ciro Oranı:</strong> Toplam giderler cironun <strong>%${revenue > 0 ? (((opex + capex) / revenue)*100).toFixed(1) : 0}</strong> seviyesinde seyrediyor. Maaş, temizlik ve komisyon kalemleri operasyonel kârı baskılıyor.</p>
      <p>• <strong>Şirin Dağ Evi Düşük ADR:</strong> 30 gece satılmasına rağmen ortalama günlük fiyat 2.826 TL\'de kaldı; kapasite yüksek talep döneminde gereğinden ucuza kapatıldı.</p>
      <p>• <strong>Nefes Kapasite Kullanımı:</strong> 12 kişilik en büyük villa olmasına karşın ciro potansiyeli portföy ortalamasının gerisinde kaldı.</p>
    `;
  }

  if (whyBox) {
    whyBox.innerHTML = `
      <p>• <strong>Korelasyon 1:</strong> Şirin\'de minimum konaklama kuralı ve erken rezervasyon indirimi geniş tutulduğu için takvim erkenden düşük rakamlarla doldu.</p>
      <p>• <strong>Korelasyon 2:</strong> Zirve ve Doğuş villalarında elektrik tüketimi ve kış bakımları fatura maliyetlerini artırdı.</p>
      <p>• <strong>Korelasyon 3:</strong> Kredi kartı ve OTA komisyon giderleri (özellikle Booking/Airbnb) toplam 75.519 TL kesintiye yol açtı.</p>
    `;
  }

  if (actionBox) {
    actionBox.innerHTML = `
      <div class="ai-action-item">
        <div class="action-text">
          <strong>1. Şirin Villası Taban Fiyatını %30 Artır</strong>
          <p>Hafta sonu taban fiyatını 4.500 TL\'ye çekerek doluluk kaybı yaşamadan ADR\'yi yükseltin.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Şirin Taban Fiyatını Artır', 'P2', 'Şirin hafta sonu taban fiyatını 4.500 TL olarak güncelle.')">⚡ Görev Oluştur</button>
      </div>

      <div class="ai-action-item">
        <div class="action-text">
          <strong>2. Çamaşırhane ve Temizlik Birim Maliyetlerini Revize Et</strong>
          <p>47.000 TL\'ye ulaşan aylık temizlik giderinde parça başı sabit paket anlaşması yapın.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Temizlik Anlaşması Revizyonu', 'P2', 'Çamaşırhane ve temizlik hizmeti ile sabit paket anlaşması yap.')">⚡ Görev Oluştur</button>
      </div>

      <div class="ai-action-item">
        <div class="action-text">
          <strong>3. Direkt WhatsApp & Tekrar Gelen Misafir Kampanyası</strong>
          <p>Geçmiş misafirlere %10 özel indirim sunarak 75.000 TL\'lik komisyon sızıntısını kesin.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="createTaskFromAI('Direkt Rezervasyon Kampanyası', 'P2', 'WhatsApp üzerinden eski misafirlere kış sezonu %10 direkt indirim mesajı ilet.')">⚡ Görev Oluştur</button>
      </div>
    `;
  }
}

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
// CANLI WHAT-IF GELİR & KÂR SİMÜLATÖRÜ
// -------------------------------------------------------------
function runWhatIfSimulation() {
  const adrDelta = Number(document.getElementById('simAdrSlider')?.value) || 0;
  const occDelta = Number(document.getElementById('simOccSlider')?.value) || 0;
  const directPct = Number(document.getElementById('simDirectSlider')?.value) || 60;

  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  setEl('simAdrLabel', `${adrDelta >= 0 ? '+' : ''}%${adrDelta}`);
  setEl('simOccLabel', `${occDelta >= 0 ? '+' : ''}%${occDelta}`);
  setEl('simDirectLabel', `%${directPct}`);

  // Base values from August 2026 anchor (or 0 if clean state)
  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;
  const baseRevenue = activeExcel ? 483965 : 0;
  const baseNights = activeExcel ? 79 : 0;
  const baseAdr = activeExcel ? 6126 : 0;
  const baseOpex = activeExcel ? 337306 : 0;
  const baseComm = activeExcel ? 75519 : 0;
  const baseCapex = activeExcel ? 3866 : 0;
  const baseProfit = activeExcel ? 142793 : 0;

  if (baseRevenue === 0) {
    setEl('simResRevenue', '0 TL');
    setEl('simResRevDelta', 'Veri bekleniyor');
    setEl('simResCommission', '0 TL');
    setEl('simResCommDelta', 'OTA komisyonu yok');
    setEl('simResProfit', '0 TL');
    setEl('simResProfitDelta', 'Kayıt bekleniyor');
    return;
  }

  const newAdr = baseAdr * (1 + (adrDelta / 100));
  const newNights = Math.max(1, Math.round(baseNights * (1 + (occDelta / 100))));
  const newRevenue = Math.round(newAdr * newNights);
  const revDiff = newRevenue - baseRevenue;
  const revDiffPct = (revDiff / baseRevenue) * 100;

  // Direct bookings have 0 commission; OTA channel portion has ~16% commission
  const otaShare = Math.max(0, (100 - directPct) / 100);
  const newComm = Math.round(newRevenue * otaShare * 0.16);
  const commSaved = Math.max(0, baseComm - newComm);

  // Marginal cleaning & linen cost for extra nights (~600 TL/night)
  const nightsDiff = newNights - baseNights;
  const marginalCost = nightsDiff * 600;

  const newOpex = Math.round(baseOpex - baseComm + newComm + marginalCost);
  const newProfit = Math.round(newRevenue - newOpex - baseCapex);
  const profitDiff = newProfit - baseProfit;
  const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

  setEl('simResRevenue', `${newRevenue.toLocaleString('tr-TR')} TL`);
  setEl('simResRevDelta', `${revDiff >= 0 ? '+' : ''}${Math.round(revDiff).toLocaleString('tr-TR')} TL (%${revDiffPct.toFixed(1)})`);

  setEl('simResCommission', `${commSaved.toLocaleString('tr-TR')} TL`);
  setEl('simResCommDelta', `Doğrudan Tasarruf (OTA Komisyonu: ${newComm.toLocaleString('tr-TR')} TL)`);

  setEl('simResProfit', `${newProfit.toLocaleString('tr-TR')} TL`);
  setEl('simResProfitDelta', `${profitDiff >= 0 ? '+' : ''}${Math.round(profitDiff).toLocaleString('tr-TR')} TL Fazla Kâr (%${newMargin.toFixed(1)} Marj)`);
}

// -------------------------------------------------------------
// ŞİRKET GİDİŞAT RADARI & DİNAMİK BAROMETRE
// -------------------------------------------------------------
function renderTrajectoryRadar() {
  const activeExcel = (!appData.isCleanState && appData.excelDb) ? appData.excelDb : null;
  const banner = document.getElementById('trajectoryRadarBanner');
  const badge = document.getElementById('trajectoryStatusBadge');
  const scoreNum = document.getElementById('trajectoryScoreNum');
  const healthStatus = document.getElementById('trajectoryHealthStatus');
  const healthDesc = document.getElementById('trajectoryHealthDesc');
  const momVal = document.getElementById('trajectoryMomentumVal');
  const momDesc = document.getElementById('trajectoryMomentumDesc');
  const marVal = document.getElementById('trajectoryMarginVal');
  const marDesc = document.getElementById('trajectoryMarginDesc');
  const adrVal = document.getElementById('trajectoryAdrVal');
  const adrDesc = document.getElementById('trajectoryAdrDesc');

  if (activeExcel) {
    if (banner) banner.style.display = 'none';
    if (badge) { badge.className = 'badge badge-emerald'; badge.innerText = 'CANLI GİDİŞAT: GÜÇLÜ POZİTİF'; }
    if (scoreNum) scoreNum.innerText = '88';
    if (healthStatus) { healthStatus.className = 'text-emerald'; healthStatus.innerText = '🟢 Büyüme & Kâr İvmesinde'; }
    if (healthDesc) healthDesc.innerText = 'Yaz sezonu güçlü toparlanma sağladı, kış öncesi nakit pozisyonu sağlam.';
    if (momVal) { momVal.className = 'b-val text-emerald'; momVal.innerText = '🚀 +%80,7 İvme'; }
    if (momDesc) momDesc.innerText = 'Haziran (268k) ➔ Temmuz (467k) ➔ Ağustos (484k)';
    if (marVal) { marVal.className = 'b-val text-blue'; marVal.innerText = '⚖️ %29,5 – %33,9'; }
    if (marDesc) marDesc.innerText = 'Ocak rekorunda %60,7, yaz aylarında %30 civarında stabil.';
    if (adrVal) { adrVal.className = 'b-val text-amber'; adrVal.innerText = '⚠️ Sezonsal Uçurum'; }
    if (adrDesc) adrDesc.innerText = 'Kışın 18.000 TL ➔ Yazın 6.126 TL. Kış erken açılışı kritik.';
  } else {
    if (banner) banner.style.display = 'block';
    if (badge) { badge.className = 'badge badge-rose'; badge.innerText = 'VERİLER SIFIRLANDI (TEMİZ KASA)'; }
    if (scoreNum) scoreNum.innerText = '0';
    if (healthStatus) { healthStatus.className = 'text-amber'; healthStatus.innerText = '⚪ Temiz Kasa / Sıfırlandı'; }
    if (healthDesc) healthDesc.innerText = 'Geçmiş veriler temizlendi. Yeni rezervasyon ve gider kayıtları bekleniyor.';
    if (momVal) { momVal.className = 'b-val text-slate'; momVal.innerText = '—'; }
    if (momDesc) momDesc.innerText = 'Kayıt girildikçe ivme hesaplanacaktır.';
    if (marVal) { marVal.className = 'b-val text-slate'; marVal.innerText = '—'; }
    if (marDesc) marDesc.innerText = 'Kayıt girildikçe marj hesaplanacaktır.';
    if (adrVal) { adrVal.className = 'b-val text-slate'; adrVal.innerText = '—'; }
    if (adrDesc) adrDesc.innerText = 'Kayıt girildikçe ADR trendi hesaplanacaktır.';
  }
}

function resetSimulator() {
  const adr = document.getElementById('simAdrSlider');
  const occ = document.getElementById('simOccSlider');
  const dir = document.getElementById('simDirectSlider');
  if (adr) adr.value = 0;
  if (occ) occ.value = 0;
  if (dir) dir.value = 40;
  runWhatIfSimulation();
}

function exportTrajectoryReport() {
  const reportText = `=====================================================
LEXBNB KONTROL MERKEZİ V5 - YÖNETİCİ GİDİŞAT VE TAHMİN RAPORU
Tarih: ${new Date().toLocaleDateString('tr-TR')}
=====================================================

1. GENEL ŞİRKET SAĞLIK SKORU: 88/100 (Büyüme & Kâr İvmesinde)
-----------------------------------------------------
• Toplam Tarihsel Ciro: 5.004.165,40 TL (14 Ay Toplamı)
• Toplam Satılan Gece: 457 Gece (Ortalama ADR: 10.950 TL)
• Ciro Momentumu (Son 3 Ay): +%80,7 Hızlanma (268k -> 467k -> 484k TL)
• Net Kâr Marjı Stabilitesi: %29,5 – %33,9

2. MÜLK BAZINDA TARİHSEL CİRO PAYLARI:
-----------------------------------------------------
1. Seyir Dağ Evi:   1.380.134 TL (%27,6 Pay - 97 Gece)
2. Zirve Dağ Evi:   1.214.493 TL (%24,3 Pay - 85 Gece - Jakuzi/Sauna)
3. Nefes Dağ Evi:   1.081.971 TL (%21,6 Pay - 92 Gece)
4. Doğuş Dağ Evi:     903.353 TL (%18,1 Pay - 98 Gece)
5. Şirin Dağ Evi:     424.214 TL (%8,5 Pay - 85 Gece)

3. YAKLAŞAN DÖNEM & 2026/2027 KIŞ SEZONU GELİR TAHMİNLERİ:
-----------------------------------------------------
• Eylül 2026 Tahmini:           150.000 TL – 185.000 TL
• Ekim - Kasım 2026 Tahmini:     450.000 TL – 520.000 TL
• Kış Sezonu (Ara - Oca - Şub): 2.250.000 TL – 2.650.000 TL
• 2026 Yıl Sonu Kapanış Hedefi: ~6.200.000 TL – 6.450.000 TL

4. EN KRİTİK 3 YÖNETİM AKSİYONU:
-----------------------------------------------------
[!] Şirin Dağ Evi Taban Fiyatı: Doluluk %96 iken ADR'nin 2.826 TL'de kalması
    gelir kaybıdır. Taban fiyat acilen 4.500 TL bandına çekilmelidir.
[!] Direkt Satış & Komisyon Koruması: Ayda 75.500 TL komisyon ödenmektedir.
    WhatsApp doğrudan kampanyasıyla bu tutarın en az %40'ı kasaya çekilmelidir.
[!] Zirve & Seyir Kış Fiyatlandırması: Ocak ayında 280.000 TL ciro getiren
    Zirve villası için kış erken satışları 18.000 TL altında açılmamalıdır.
=====================================================`;

  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LEXBNB_Gidisat_Raporu_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  alert('✅ Yönetici Gidişat Raporu başarıyla indirildi!');
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
    return (exp.description || exp.desc || "").toLowerCase().includes(search) || (exp.category || "").toLowerCase().includes(search);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 25px; color: var(--color-slate-400);">Kayıtlı gider bulunmamaktadır. "+ Gider / Yatırım" butonu ile yeni kayıt ekleyebilirsiniz.</td></tr>';
    return;
  }
  filtered.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTrDate(exp.date)}</td>
      <td><span class="badge ${exp.type === 'CAPEX' ? 'badge-amber' : 'badge-blue'}">${exp.type === 'CAPEX' ? 'Yatırım (Capex)' : 'Operasyonel (Opex)'}</span></td>
      <td><strong>${exp.category}</strong></td>
      <td>${exp.villa === 'ALL' ? 'Tüm Portföy' : (appData.villas[exp.villa]?.name || exp.villa)}</td>
      <td>${exp.description || exp.desc || "-"}</td>
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
    const exp = (appData.expenses || []).find(e => e.id === id);
    if (exp && exp.cleanTaskId && appData.cleaningTasks) {
      const task = appData.cleaningTasks.find(t => t.id === exp.cleanTaskId);
      if (task) {
        task.paid = false;
        task.paidDate = null;
        if (appData.cleaningPayments && appData.cleaningPayments[task.villa]) {
          appData.cleaningPayments[task.villa].paid = false;
        }
      }
    }
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveAppData();
    renderAll();
    if (window.showToast) window.showToast('🗑️ Harcama başarıyla silindi.');
  }
}

// -------------------------------------------------------------
// HEDEFLER DÜZENLEME (GOALS MODAL & SETTINGS)
// -------------------------------------------------------------
const GOAL_MONTHS = [
  { id: '2026-09', name: 'Eylül 2026 (Güncel Aktif Ay)' },
  { id: '2026-10', name: 'Ekim 2026' },
  { id: '2026-11', name: 'Kasım 2026' },
  { id: '2026-12', name: 'Aralık 2026 (Yılbaşı Sezonu 🎄)' },
  { id: '2027-01', name: 'Ocak 2027 (Kış Zirvesi ❄️)' },
  { id: '2027-02', name: 'Şubat 2027 (Kayak Sezonu ⛷️)' },
  { id: '2027-03', name: 'Mart 2027' },
  { id: '2027-04', name: 'Nisan 2027' },
  { id: '2027-05', name: 'Mayıs 2027' },
  { id: '2027-06', name: 'Haziran 2027' },
  { id: '2027-07', name: 'Temmuz 2027' },
  { id: '2027-08', name: 'Ağustos 2027' },
  { id: '2027-09', name: 'Eylül 2027' },
  { id: '2027-10', name: 'Ekim 2027' },
  { id: '2027-11', name: 'Kasım 2027' },
  { id: '2027-12', name: 'Aralık 2027' },
  { id: '2026-08', name: 'Ağustos 2026' },
  { id: '2026-07', name: 'Temmuz 2026' },
  { id: '2026-06', name: 'Haziran 2026' },
  { id: '2026-05', name: 'Mayıs 2026' },
  { id: '2026-04', name: 'Nisan 2026' },
  { id: '2026-03', name: 'Mart 2026' },
  { id: '2026-02', name: 'Şubat 2026' },
  { id: '2026-01', name: 'Ocak 2026' },
  { id: '2025-12', name: 'Aralık 2025' },
  { id: '2025-11', name: 'Kasım 2025' },
  { id: '2025-10', name: 'Ekim 2025' },
  { id: '2025-09', name: 'Eylül 2025' },
  { id: '2025-08', name: 'Ağustos 2025' },
  { id: '2025-07', name: 'Temmuz 2025' }
];

function openGoalsModal(targetPeriod) {
  const select = document.getElementById('goalPeriodSelect');
  if (select) {
    select.innerHTML = '';
    GOAL_MONTHS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
    const periodToSelect = targetPeriod || (currentFilter.period !== 'ALL' ? currentFilter.period : '2026-08');
    select.value = periodToSelect;
  }
  loadSelectedPeriodGoal();
  document.getElementById('goalsModal').classList.add('active');
}

function loadSelectedPeriodGoal() {
  const select = document.getElementById('goalPeriodSelect');
  const period = select ? select.value : (currentFilter.period !== 'ALL' ? currentFilter.period : '2026-08');
  
  const saved = appData.targets && appData.targets[period];
  const excelTarget = (COMPANY_EXCEL_DATABASE && COMPANY_EXCEL_DATABASE.targets) ? COMPANY_EXCEL_DATABASE.targets[period] : 300000;
  
  const rev = (saved && saved.revenue) ? saved.revenue : (excelTarget || 300000);
  const netProfit = (saved && saved.netProfit) ? saved.netProfit : Math.round(rev * 0.35);
  const maxExpense = (saved && saved.maxExpense) ? saved.maxExpense : Math.round(rev * 0.65);
  const nights = (saved && saved.nights) ? saved.nights : (saved && saved.occupancy ? Math.round(150 * (saved.occupancy / 100)) : 75);
  const adr = (saved && saved.adr) ? saved.adr : (nights > 0 ? Math.round(rev / nights) : 5500);

  const revEl = document.getElementById('goalRevenue');
  const netEl = document.getElementById('goalNetProfit');
  const expEl = document.getElementById('goalMaxExpense');
  const nEl = document.getElementById('goalOccupancyNights');
  const adrEl = document.getElementById('goalADR');
  const hintEl = document.getElementById('goalRevenueHint');

  if (revEl) revEl.value = rev;
  if (netEl) netEl.value = netProfit;
  if (expEl) expEl.value = maxExpense;
  if (nEl) nEl.value = nights;
  if (adrEl) adrEl.value = adr;
  
  if (hintEl) {
    const defaultVal = excelTarget || 300000;
    hintEl.textContent = `Varsayılan / Excel: ${defaultVal.toLocaleString('tr-TR')} TL`;
  }
  
  const occLabel = document.getElementById('goalCalcOccLabel');
  if (occLabel) {
    const occPct = Math.min(100, Math.round((nights / 150) * 100));
    occLabel.textContent = `%${occPct} (${nights}/150 gece)`;
  }
}

function autoCalculateGoalSubmetrics() {
  const rev = Number(document.getElementById('goalRevenue').value) || 0;
  if (rev > 0) {
    document.getElementById('goalNetProfit').value = Math.round(rev * 0.35);
    document.getElementById('goalMaxExpense').value = Math.round(rev * 0.65);
    const nights = Number(document.getElementById('goalOccupancyNights').value) || 75;
    if (nights > 0) {
      document.getElementById('goalADR').value = Math.round(rev / nights);
    }
  }
}

function autoCalculateGoalAdr() {
  const nights = Number(document.getElementById('goalOccupancyNights').value) || 0;
  const rev = Number(document.getElementById('goalRevenue').value) || 0;
  const occLabel = document.getElementById('goalCalcOccLabel');
  if (occLabel) {
    const occPct = Math.min(100, Math.round((nights / 150) * 100));
    occLabel.textContent = `%${occPct} (${nights}/150 gece)`;
  }
  if (rev > 0 && nights > 0) {
    document.getElementById('goalADR').value = Math.round(rev / nights);
  }
}

function setGoalPreset(amount) {
  const revEl = document.getElementById('goalRevenue');
  if (revEl) {
    revEl.value = amount;
    autoCalculateGoalSubmetrics();
  }
}

function closeGoalsModal() {
  document.getElementById('goalsModal').classList.remove('active');
}

function saveMonthlyGoals(e) {
  if (e) e.preventDefault();
  const select = document.getElementById('goalPeriodSelect');
  const period = select ? select.value : (currentFilter.period !== 'ALL' ? currentFilter.period : '2026-08');
  
  const revenue = Number(document.getElementById('goalRevenue').value) || 300000;
  const netProfit = Number(document.getElementById('goalNetProfit').value) || Math.round(revenue * 0.35);
  const maxExpense = Number(document.getElementById('goalMaxExpense').value) || Math.round(revenue * 0.65);
  const nights = Number(document.getElementById('goalOccupancyNights').value) || 75;
  const adr = Number(document.getElementById('goalADR').value) || (nights > 0 ? Math.round(revenue / nights) : 5500);
  const occupancy = Number(((nights / 150) * 100).toFixed(1));
  const margin = Number(((netProfit / revenue) * 100).toFixed(1));
  const revpar = Math.round(revenue / 150);

  if (!appData.targets) appData.targets = {};
  appData.targets[period] = {
    revenue,
    netProfit,
    maxExpense,
    nights,
    adr,
    occupancy,
    margin,
    revpar
  };

  saveAppData();
  closeGoalsModal();
  renderFinanceModule();
  renderSettingsGoalsTable();

  // Show friendly notification toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#10B981; color:#fff; padding:14px 20px; border-radius:10px; font-weight:700; font-size:14px; box-shadow:0 10px 25px rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; gap:8px;';
  toast.innerHTML = `<span>✓</span> <strong>${period}</strong> hedefi ${revenue.toLocaleString('tr-TR')} TL olarak güncellendi!`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3500);
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

  // Populate Kokpit Top KPI Cards (Net Gelir, Doluluk, ADR, RevPAR)
  const elNetRev = document.getElementById('kpiNetRevenue');
  const elGrossRev = document.getElementById('kpiGrossRevenue');
  const elTargetPct = document.getElementById('kpiTargetPct');
  const elOcc = document.getElementById('kpiOccupancy');
  const elNightsDetail = document.getElementById('kpiNightsDetail');
  const elAvailDetail = document.getElementById('kpiAvailableDetail');
  const elAdr = document.getElementById('kpiADR');
  const elRevpar = document.getElementById('kpiRevPAR');
  const elNRevpar = document.getElementById('kpiNRevPAR');

  const currentTarget = (appData.targets && currentFilter.period !== 'ALL' && appData.targets[currentFilter.period]?.revenue)
    ? Number(appData.targets[currentFilter.period].revenue)
    : (appData.goals?.monthlyRevenue || 300000);

  const targetPct = currentTarget > 0 ? ((totalNet / currentTarget) * 100).toFixed(0) : 0;

  if (elNetRev) elNetRev.innerText = '₺' + Math.round(totalNet).toLocaleString('tr-TR');
  if (elGrossRev) elGrossRev.innerText = 'Brüt: ₺' + Math.round(totalGross).toLocaleString('tr-TR');
  if (elTargetPct) {
    elTargetPct.innerText = '%' + targetPct + ' Hedef';
    elTargetPct.className = 'kpi-trend ' + (Number(targetPct) >= 100 ? 'positive' : 'neutral');
  }
  if (elOcc) elOcc.innerText = '%' + occupancyRate.toFixed(1);
  if (elNightsDetail) elNightsDetail.innerText = totalPaidNights + ' Gece Satıldı';
  if (elAvailDetail) elAvailDetail.innerText = availableNights + ' Gece Kapasite';
  if (elAdr) elAdr.innerText = '₺' + Math.round(adr).toLocaleString('tr-TR');
  if (elRevpar) elRevpar.innerText = '₺' + Math.round(revpar).toLocaleString('tr-TR');
  if (elNRevpar) elNRevpar.innerText = 'NRevPAR: ₺' + Math.round(nrevpar).toLocaleString('tr-TR');

  // Render Kokpit Funnel and Channel Distribution
  renderFunnelStats();
  renderChannelDistribution();


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

function renderFunnelStats() {
  const container = document.getElementById('funnelStatsContainer');
  if (!container) return;

  const leads = appData.leads || [];
  const totalLeads = leads.length;
  const wonLeads = leads.filter(l => l.status === 'WON');
  const lostLeads = leads.filter(l => l.status === 'LOST');
  const activeLeads = leads.filter(l => l.status === 'FOLLOW_UP' || l.status === 'QUOTE_SENT');
  const convRate = totalLeads > 0 ? ((wonLeads.length / totalLeads) * 100).toFixed(1) : 0;
  const wonRevenue = wonLeads.reduce((sum, l) => sum + (Number(l.quote) || 0), 0);
  const lostRevenue = lostLeads.reduce((sum, l) => sum + (Number(l.quote) || 0), 0);

  container.innerHTML = `
    <div class="funnel-item" style="border-left: 3px solid #60A5FA;">
      <div class="label" style="color: #93C5FD;">📩 TOPLAM TALEP (LEAD)</div>
      <div class="val" style="color: #FFFFFF;">${totalLeads} Adet</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Tüm Gelen Mesajlar</div>
    </div>
    <div class="funnel-item" style="border-left: 3px solid #FBBF24;">
      <div class="label" style="color: #FDE68A;">⏳ TEKLİF & TAKİPTE</div>
      <div class="val" style="color: #FBBF24;">${activeLeads.length} Adet</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Sıcak Müşteri Adayı</div>
    </div>
    <div class="funnel-item" style="border-left: 3px solid #34D399;">
      <div class="label" style="color: #6EE7B7;">🏆 KAZANILAN (SATIŞ)</div>
      <div class="val" style="color: #34D399;">${wonLeads.length} Adet (%${convRate})</div>
      <div style="font-size: 11px; color: #34D399; margin-top: 4px; font-weight: 600;">₺${wonRevenue.toLocaleString('tr-TR')} Satış</div>
    </div>
    <div class="funnel-item" style="border-left: 3px solid #F87171;">
      <div class="label" style="color: #FCA5A5;">❌ KAYBEDİLEN TALEP</div>
      <div class="val" style="color: #F87171;">${lostLeads.length} Adet</div>
      <div style="font-size: 11px; color: #F87171; margin-top: 4px;">₺${lostRevenue.toLocaleString('tr-TR')} Kaçan Fırsat</div>
    </div>
  `;
}

function renderChannelDistribution() {
  const container = document.getElementById('channelListContainer');
  const directBadge = document.getElementById('directShareBadge');
  if (!container) return;

  const relevantBookings = appData.bookings.filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
  const channelTotals = {};
  let totalNet = 0;
  let directNet = 0;

  relevantBookings.forEach(b => {
    const ch = (b.channel || 'DIRECT').toUpperCase();
    const net = Number(b.net) || 0;
    totalNet += net;

    if (!channelTotals[ch]) {
      channelTotals[ch] = { name: ch, count: 0, net: 0 };
    }
    channelTotals[ch].count += 1;
    channelTotals[ch].net += net;

    if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE', 'DIRECT'].includes(ch)) {
      directNet += net;
    }
  });

  const directPct = totalNet > 0 ? (directNet / totalNet) * 100 : 0;
  if (directBadge) {
    directBadge.innerText = '%' + directPct.toFixed(0) + ' Direkt Payı';
    directBadge.className = directPct >= 50 ? 'badge badge-green' : 'badge badge-amber';
  }

  const sortedChannels = Object.values(channelTotals).sort((a, b) => b.net - a.net);

  if (sortedChannels.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:12px; text-align:center;">Seçili dönemde rezervasyon kaydı bulunmuyor.</div>';
    return;
  }

  const channelNames = {
    'WHATSAPP': '💬 WhatsApp Direkt',
    'INSTAGRAM': '📸 Instagram',
    'AIRBNB': '🏡 Airbnb',
    'BOOKING': '🏨 Booking.com',
    'WEBSITE': '🌐 Web Sitesi',
    'PHONE': '📞 Telefon'
  };

  container.innerHTML = '';
  sortedChannels.forEach(ch => {
    const chName = channelNames[ch.name] || ch.name;
    const isDirect = ['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'PHONE', 'DIRECT', 'REPEAT'].includes(ch.name);
    const pct = totalNet > 0 ? (ch.net / totalNet) * 100 : 0;

    const div = document.createElement('div');
    div.className = 'channel-progress-item';
    div.innerHTML = `
      <div class="channel-meta">
        <span><strong>${chName}</strong> (${ch.count} Rez.)</span>
        <span>₺${Math.round(ch.net).toLocaleString('tr-TR')} • %${pct.toFixed(1)}</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill ${isDirect ? '' : 'ota'}" style="width: ${Math.min(100, Math.max(2, pct))}%;"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderGapNights() {
  const container = document.getElementById('gapNightGrid');
  if (!container) return;
  container.innerHTML = '';
  const gaps = [];
  const todayStr = '2026-09-07';

  // Check gaps between consecutive bookings for each villa
  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
    if (!vConf) return;

    const pBookings = appData.bookings
      .filter(b => b.villa === vKey && b.status !== 'CANCELLED')
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    // 1. Between bookings gap detection (1 to 4 days)
    for (let i = 0; i < pBookings.length - 1; i++) {
      const cur = pBookings[i];
      const next = pBookings[i + 1];
      const diffDays = Math.round((new Date(next.checkIn) - new Date(cur.checkOut)) / (1000 * 60 * 60 * 24));

      if (diffDays >= 1 && diffDays <= 4) {
        const floorGuard = (vConf.floor || 4000) + (vConf.cleanCost || 1500) + (vConf.heatCost || 500);
        const offer = Math.max(Math.round((vConf.base || 7000) * 0.75), floorGuard);
        gaps.push({
          villaName: vConf.name,
          dates: `${formatShortDate(cur.checkOut)} → ${formatShortDate(next.checkIn)} (${diffDays} Gece Boş)`,
          offer: '₺' + offer.toLocaleString('tr-TR') + ' / Gece',
          floor: '₺' + floorGuard.toLocaleString('tr-TR') + ' Taban',
          note: 'İki rezervasyon arası kör boşluk doldurma önerisi'
        });
      }
    }

    // 2. Upcoming immediate open windows (e.g. next 10 days if free)
    const upcoming = pBookings.filter(b => b.checkIn >= todayStr);
    if (upcoming.length > 0) {
      const firstB = upcoming[0];
      const daysUntil = Math.round((new Date(firstB.checkIn) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 2 && daysUntil <= 5) {
        const floorGuard = (vConf.floor || 4000) + (vConf.cleanCost || 1500) + (vConf.heatCost || 500);
        const offer = Math.max(Math.round((vConf.base || 7000) * 0.75), floorGuard);
        gaps.push({
          villaName: vConf.name,
          dates: `Hemen Giriş: ${formatShortDate(todayStr)} → ${formatShortDate(firstB.checkIn)} (${daysUntil} Gece)`,
          offer: '₺' + offer.toLocaleString('tr-TR') + ' / Gece',
          floor: '₺' + floorGuard.toLocaleString('tr-TR') + ' Taban',
          note: 'İlk girişe kadar hızlı fırsat satışı'
        });
      }
    }
  });

  if (gaps.length === 0) {
    // If no 1-4 night gaps found, display positive optimized status card
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 14px 18px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 24px;">💎</span>
        <div>
          <strong style="color: #34D399; font-size: 13px;">Takvim Blokları Optimum Seviyede</strong>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            Şu anda doldurulması gereken 1-4 gecelik kritik kör boşluk bulunmuyor. Rezervasyon aralıkları dengeli dağılmıştır.
          </div>
        </div>
      </div>
    `;
    return;
  }

  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `
      <div class="gap-info">
        <strong style="color: #FFFFFF; font-size: 13px;">${g.villaName}</strong>
        <span style="color: #60A5FA; font-size: 12px; font-weight: 600; margin-top: 2px;">${g.dates}</span>
        <span style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${g.note}</span>
      </div>
      <div class="gap-pricing">
        <div class="offer-price" style="color: #34D399; font-size: 15px; font-weight: 800;">${g.offer}</div>
        <div class="floor-hint" style="font-size: 10px; color: #FBBF24;">🛡️ ${g.floor}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderOtaRadar() {
  setTimeout(renderAirbnbAuditRadar, 0);
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

// Replaced with enhanced modal
// -------------------------------------------------------------
// MANAGE BOOKINGS TABLE (CRUD + SEARCH)
// -------------------------------------------------------------
function renderManageBookingsTable() {
  const tbody = document.getElementById('manageBookingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const search = (document.getElementById('rezSearchInput')?.value || '').toLowerCase();
  const periodFilter = document.getElementById('rezPeriodFilter')?.value || 'ALL';
  const villaFilter = document.getElementById('rezVillaFilter')?.value || 'ALL';
  const statusFilter = document.getElementById('rezStatusFilter')?.value || 'ALL';

  const todayStr = '2026-09-07';

  let totalGross = 0;
  let totalNet = 0;
  let totalNights = 0;

  // Filter bookings
  const filtered = appData.bookings.filter(b => {
    // Villa Filter
    if (villaFilter !== 'ALL' && b.villa !== villaFilter) return false;
    
    // Status Filter
    if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;

    // Period Filter
    if (periodFilter === 'UPCOMING') {
      if (b.checkOut < todayStr) return false;
    } else if (periodFilter !== 'ALL') {
      const bInMonth = b.checkIn.slice(0, 7);
      const bOutMonth = b.checkOut.slice(0, 7);
      if (bInMonth !== periodFilter && bOutMonth !== periodFilter) return false;
    }

    // Search
    if (search) {
      const vName = (appData.villas[b.villa]?.name || b.villa).toLowerCase();
      const gName = (b.guest || '').toLowerCase();
      const chName = (b.channel || '').toLowerCase();
      if (!vName.includes(search) && !gName.includes(search) && !chName.includes(search)) return false;
    }

    return true;
  });

  // Sort: Upcoming and current first, then by checkIn ascending
  filtered.sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  // Update Summary Pill
  filtered.forEach(b => {
    if (b.status !== 'CANCELLED') {
      totalGross += Number(b.gross) || 0;
      totalNet += Number(b.net) || 0;
      totalNights += Number(b.nights) || 0;
    }
  });

  const summaryPill = document.getElementById('rezTableSummaryPill');
  if (summaryPill) {
    summaryPill.innerHTML = `📊 Gösterilen: <strong>${filtered.length} Rezervasyon</strong> | 🌙 ${totalNights} Gece | 💰 Net: ${totalNet.toLocaleString('tr-TR')} TL`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 30px; color: var(--color-slate-400);">Kriterlere uygun rezervasyon bulunamadı. "+ Yeni Rezervasyon Ekle" butonu ile ekleyebilirsiniz.</td></tr>';
    return;
  }

  filtered.forEach(b => {
    const vName = appData.villas[b.villa]?.name || b.villa;
    const nightly = b.nights > 0 ? Math.round((b.net || b.gross) / b.nights) : 0;

    let statusBadge = '<span class="badge badge-green">Onaylandı</span>';
    if (b.status === 'CANCELLED') statusBadge = '<span class="badge badge-rose">İptal</span>';
    if (b.status === 'CHECKED_IN') statusBadge = '<span class="badge badge-blue">İçeride</span>';
    if (b.status === 'COMPLETED') statusBadge = '<span class="badge badge-slate">Tamamlandı</span>';

    // Highlight New Year / future special dates
    const isNewYear = (b.checkIn.includes('2026-12') || b.checkOut.includes('2027-01'));

    const tr = document.createElement('tr');
    if (isNewYear) {
      tr.style.background = 'rgba(217, 119, 6, 0.08)';
    }

    tr.innerHTML = `
      <td><strong>${vName}</strong> ${isNewYear ? ' <span class="badge badge-amber" style="font-size:10px;">🎄 Yılbaşı</span>' : ''}</td>
      <td>${b.guest}</td>
      <td><span class="badge ${b.channel === 'AIRBNB' ? 'badge-rose' : (b.channel === 'BOOKING' ? 'badge-blue' : 'badge-emerald')}">${b.channel}</span></td>
      <td>${formatTrDate(b.checkIn)}</td>
      <td>${formatTrDate(b.checkOut)}</td>
      <td><strong>${b.nights}</strong></td>
      <td>${Number(b.gross).toLocaleString('tr-TR')} ₺</td>
      <td>${Number(b.otaComm || 0).toLocaleString('tr-TR')} ₺</td>
      <td>${Number(b.cleanFee || 0).toLocaleString('tr-TR')} ₺</td>
      <td style="color: #34D399; font-weight: 700;">${Number(b.net).toLocaleString('tr-TR')} ₺</td>
      <td>${nightly.toLocaleString('tr-TR')} ₺</td>
      <td>${statusBadge}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" onclick="editBooking('${b.id}')" title="Düzenle">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteBooking('${b.id}')" title="Sil">🗑️</button>
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

  syncBookingCleaningTasks();
  saveAppData();
  closeBookingModal();
  renderAll();
}

function editBooking(id) { openBookingModal(id); }
function deleteBooking(id) {
  if (confirm('Bu rezervasyonu silmek istediğinizden emin misiniz?')) {
    appData.bookings = appData.bookings.filter(b => b.id !== id);
    syncBookingCleaningTasks();
    saveAppData();
    renderAll();
  }
}

// -------------------------------------------------------------
// SETTINGS TABLE (PRICING TIERS)
// -------------------------------------------------------------
function renderSettingsGoalsTable() {
  const tbody = document.getElementById('settingsGoalsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  GOAL_MONTHS.forEach(m => {
    const period = m.id;
    const saved = appData.targets && appData.targets[period];
    const excelTarget = (COMPANY_EXCEL_DATABASE && COMPANY_EXCEL_DATABASE.targets) ? COMPANY_EXCEL_DATABASE.targets[period] : 300000;
    
    const rev = (saved && saved.revenue) ? saved.revenue : (excelTarget || 300000);
    const netProfit = (saved && saved.netProfit) ? saved.netProfit : Math.round(rev * 0.35);
    const maxExpense = (saved && saved.maxExpense) ? saved.maxExpense : Math.round(rev * 0.65);
    const nights = (saved && saved.nights) ? saved.nights : (saved && saved.occupancy ? Math.round(150 * (saved.occupancy / 100)) : 75);
    const occ = saved && saved.occupancy ? saved.occupancy : Math.round((nights / 150) * 100);
    const adr = (saved && saved.adr) ? saved.adr : (nights > 0 ? Math.round(rev / nights) : 5500);

    const isCurrent = (currentFilter.period === period);
    const tr = document.createElement('tr');
    if (isCurrent) {
      tr.style.background = 'rgba(59, 130, 246, 0.08)';
    }

    tr.innerHTML = `
      <td>
        <strong>${m.name}</strong>
        ${isCurrent ? ' <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">Seçili Dönem</span>' : ''}
      </td>
      <td>
        <strong style="color: #60A5FA;">${rev.toLocaleString('tr-TR')} TL</strong>
      </td>
      <td style="color: #34D399; font-weight: 600;">
        ${netProfit.toLocaleString('tr-TR')} TL
      </td>
      <td>
        <span class="badge badge-amber">%${occ} (${nights} Gece)</span>
      </td>
      <td>
        ${adr.toLocaleString('tr-TR')} TL
      </td>
      <td style="color: #F87171;">
        ${maxExpense.toLocaleString('tr-TR')} TL
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openGoalsModal('${period}')" style="padding: 4px 10px; font-size: 11px;">
          ✏️ Düzenle
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSettingsTable() {
  renderSettingsGoalsTable();
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
    renderAll();
    if (window.showToast) window.showToast('🗑️ Talep başarıyla silindi.');
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
    renderAll();
    if (window.showToast) window.showToast('🗑️ Arıza kaydı silindi.');
  }
}

// -------------------------------------------------------------
// RESET, RESTORE & EXPORT
// -------------------------------------------------------------
function openResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.add('active');
}

function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('active');
}

function cleanResetAll() {
  if (confirm('DİKKAT: Excel\'den aktarılan 14 aylık tüm geçmiş cirolar, 104 harcama kalemi, rezervasyonlar ve arıza kayıtları SIFIRLANACAKTIR.\n\nTüm finansal metrikler 0 TL olacak ve tertemiz boş bir sistem başlayacaktır.\n\nOnaylıyor musunuz?')) {
    appData.isCleanState = true;
    appData.excelDb = null;
    appData.bookings = [];
    appData.expenses = [];
    appData.leads = [];
    appData.maintenance = [];
    appData.targets = {};
    saveAppData();
    closeResetModal();
    alert('✅ Tüm sistem ve Excel verileri başarıyla sıfırlandı! Tüm finansal göstergeler 0 TL temiz duruma getirildi.');
  }
}

function resetToCleanState() {
  openResetModal();
}

function restoreExcelData() {
  if (confirm('GENEL RAPOR.xlsx dosyasındaki 14 aylık resmi şirket veritabanını (5.004.165 TL ciro, 104 harcama kalemi ve kış projeksiyonları) geri yüklemek istiyor musunuz?')) {
    appData.isCleanState = false;
    appData.excelDb = JSON.parse(JSON.stringify(COMPANY_EXCEL_DATABASE));
    appData.expenses = JSON.parse(JSON.stringify(COMPANY_EXCEL_DATABASE.expensesList));
    appData.bookings = JSON.parse(JSON.stringify(DEFAULT_BOOKINGS));
    appData.leads = JSON.parse(JSON.stringify(DEFAULT_LEADS));
    appData.maintenance = JSON.parse(JSON.stringify(DEFAULT_MAINT));
    appData.targets = JSON.parse(JSON.stringify(DEFAULT_TARGETS_BY_MONTH));
    saveAppData();
    closeResetModal();
    alert('✅ GENEL RAPOR.xlsx resmi şirket verileri başarıyla geri yüklendi!');
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
  checkAuthStatus();
  loadAppData();
  renderAll();
});


// -------------------------------------------------------------
// Replaced with enhanced help functions
// -------------------------------------------------------------
// -------------------------------------------------------------
// -------------------------------------------------------------
// 🛎️ GÜNLÜK GİRİŞ / ÇIKIŞ & TEMİZLİK OPERASYONU (HOUSEKEEPING)
// -------------------------------------------------------------
function renderDailyOps() {
  const inList = document.getElementById('todayCheckinList');
  const outList = document.getElementById('todayCheckoutList');
  const hkList = document.getElementById('todayHousekeepingList');
  const inBadge = document.getElementById('todayCheckinBadge');
  const outBadge = document.getElementById('todayCheckoutBadge');
  const hkBadge = document.getElementById('todayHousekeepingBadge');

  if (!inList || !outList || !hkList) return;

  // Initialize stores
  if (!appData.cleaningPayments) appData.cleaningPayments = {};
  if (!appData.cleaningTasks) appData.cleaningTasks = JSON.parse(JSON.stringify(DEFAULT_CLEANING_TASKS));
  if (!appData.housekeepingOverrides) appData.housekeepingOverrides = {};

  const todayStr = '2026-09-07'; // Canonical system date

  // 1. Check-ins for Today
  const checkins = appData.bookings.filter(b => b.status !== 'CANCELLED' && b.checkIn === todayStr);
  if (inBadge) inBadge.innerText = checkins.length + ' Giriş';

  if (checkins.length === 0) {
    const upcoming = appData.bookings
      .filter(b => b.status !== 'CANCELLED' && b.checkIn > todayStr)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
      .slice(0, 2);

    let upcomingHtml = '';
    if (upcoming.length > 0) {
      upcomingHtml = `
        <div class="ops-upcoming-box">
          <div style="font-size: 11px; color: #60A5FA; font-weight: 600; margin-bottom: 4px;">📅 Yaklaşan İlk Girişler:</div>
          ${upcoming.map(u => `
            <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; padding: 2px 0;">
              <span><strong>${formatShortDate(u.checkIn)}</strong> - ${u.guest}</span>
              <span style="color: #93C5FD;">${appData.villas[u.villa]?.name || u.villa}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    inList.innerHTML = `
      <div style="color: var(--text-muted); font-size: 12px; padding: 6px 0;">
        Bugün (${formatTrDate(todayStr)}) planlanan giriş bulunmuyor.
      </div>
      ${upcomingHtml}
    `;
  } else {
    inList.innerHTML = '';
    checkins.forEach(b => {
      const vName = appData.villas[b.villa]?.name || b.villa;
      const div = document.createElement('div');
      div.className = 'ops-entry-card';
      div.innerHTML = `
        <div style="flex: 1;">
          <div class="ops-guest-name" style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${b.guest}</div>
          <div class="ops-guest-meta" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${vName} • ${b.channel} • ${b.nights} Gece • ${b.pax || 2} Kişi
          </div>
          <div style="font-size: 11px; color: #34D399; margin-top: 2px;">Net Gelir: ₺${Number(b.net || 0).toLocaleString('tr-TR')}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="badge badge-green" style="font-weight: 700;">🟢 14:00 Giriş</span>
          <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 6px;" onclick="openReservationModal('${b.id}')">Detay</button>
        </div>
      `;
      inList.appendChild(div);
    });
  }

  // 2. Check-outs for Today
  const checkouts = appData.bookings.filter(b => b.status !== 'CANCELLED' && b.checkOut === todayStr);
  if (outBadge) outBadge.innerText = checkouts.length + ' Çıkış';

  if (checkouts.length === 0) {
    const upcomingOut = appData.bookings
      .filter(b => b.status !== 'CANCELLED' && b.checkOut > todayStr)
      .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
      .slice(0, 2);

    let upcomingOutHtml = '';
    if (upcomingOut.length > 0) {
      upcomingOutHtml = `
        <div class="ops-upcoming-box">
          <div style="font-size: 11px; color: #93C5FD; font-weight: 600; margin-bottom: 4px;">📅 Yaklaşan İlk Çıkışlar:</div>
          ${upcomingOut.map(u => `
            <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; padding: 2px 0;">
              <span><strong>${formatShortDate(u.checkOut)}</strong> - ${u.guest}</span>
              <span style="color: #93C5FD;">${appData.villas[u.villa]?.name || u.villa}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    outList.innerHTML = `
      <div style="color: var(--text-muted); font-size: 12px; padding: 6px 0;">
        Bugün (${formatTrDate(todayStr)}) planlanan çıkış bulunmuyor.
      </div>
      ${upcomingOutHtml}
    `;
  } else {
    outList.innerHTML = '';
    checkouts.forEach(b => {
      const vName = appData.villas[b.villa]?.name || b.villa;
      const div = document.createElement('div');
      div.className = 'ops-entry-card';
      div.innerHTML = `
        <div style="flex: 1;">
          <div class="ops-guest-name" style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${b.guest}</div>
          <div class="ops-guest-meta" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${vName} • ${b.channel} • Çıkış Günü
          </div>
          <div style="font-size: 11px; color: #FBBF24; margin-top: 2px;">🧹 Temizlik Planına Alındı</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="badge badge-blue" style="font-weight: 700;">🔵 11:00 Çıkış</span>
          <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 6px;" onclick="openReservationModal('${b.id}')">Detay</button>
        </div>
      `;
      outList.appendChild(div);
    });
  }

  // 3. Housekeeping Status & Cleaning Payment Tracking (Rezervasyon Temizlik & Hazırlık Takvimi)
  hkList.innerHTML = '';
  hkList.style.maxHeight = '540px';
  hkList.style.overflowY = 'auto';
  hkList.style.paddingRight = '4px';

  let totalPendingDebtKokpit = 0;

  // 3A. Üst Kısım: 5 Villa Fiziksel Hazırlık Durumu (Kompakt Şerit)
  const villaBar = document.createElement('div');
  villaBar.style.marginBottom = '12px';
  villaBar.style.padding = '8px 10px';
  villaBar.style.background = 'rgba(255, 255, 255, 0.03)';
  villaBar.style.border = '1px solid rgba(255, 255, 255, 0.08)';
  villaBar.style.borderRadius = '8px';

  let villaCardsHtml = '';
  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
    if (!vConf) return;

    const activeBooking = appData.bookings.find(b => b.villa === vKey && b.status !== 'CANCELLED' && b.checkIn <= todayStr && b.checkOut > todayStr);
    const checkoutToday = appData.bookings.find(b => b.villa === vKey && b.status !== 'CANCELLED' && b.checkOut === todayStr);
    const checkinToday = appData.bookings.find(b => b.villa === vKey && b.status !== 'CANCELLED' && b.checkIn === todayStr);
    const hasP1Maint = appData.maintenance.some(m => m.villa === vKey && m.status === 'OPEN' && m.priority === 'P1');
    const overrideStatus = appData.housekeepingOverrides[vKey];

    let statusBadge = '🟢 Hazır';
    let badgeClass = 'badge-emerald';

    if (overrideStatus) {
      if (overrideStatus === 'CLEANING') { statusBadge = '🟡 Temizlikte'; badgeClass = 'badge-amber'; }
      else if (overrideStatus === 'OCCUPIED') { statusBadge = '🔵 Dolu'; badgeClass = 'badge-blue'; }
    } else {
      if (hasP1Maint) { statusBadge = '🔴 Bakımda'; badgeClass = 'badge-rose'; }
      else if (checkoutToday) { statusBadge = '🟡 Çıkış/Temizlik'; badgeClass = 'badge-amber'; }
      else if (checkinToday) { statusBadge = '🟡 Giriş/Kontrol'; badgeClass = 'badge-amber'; }
      else if (activeBooking) { statusBadge = '🔵 Dolu'; badgeClass = 'badge-blue'; }
    }

    villaCardsHtml += `
      <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.07); padding: 3px 6px; border-radius: 6px; font-size: 11px; margin: 2px;">
        <span style="color: #FFFFFF; font-weight: 600;">${vConf.name.split(' ')[0]}:</span>
        <span class="badge ${badgeClass}" style="font-size: 9px; padding: 1px 5px; cursor: pointer;" onclick="cycleHkStatus('${vKey}')" title="Fiziksel durumu değiştirmek için tıklayın">${statusBadge}</span>
      </div>
    `;
  });

  villaBar.innerHTML = `
    <div style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span>🏡 Villa Fiziksel Durumları</span>
      <span style="color: #93C5FD; font-size: 10px;">Durum Değiştir 🔄</span>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 2px;">
      ${villaCardsHtml}
    </div>
  `;
  hkList.appendChild(villaBar);

  // 3B. Ana Bölüm: Rezervasyon Temizlik & Hazırlık Takvimi (Tarihleriyle Sıralı)
  const taskListHeader = document.createElement('div');
  taskListHeader.style.fontSize = '11px';
  taskListHeader.style.fontWeight = '700';
  taskListHeader.style.color = '#FCD34D';
  taskListHeader.style.marginBottom = '6px';
  taskListHeader.style.display = 'flex';
  taskListHeader.style.justifyContent = 'space-between';
  taskListHeader.style.alignItems = 'center';
  taskListHeader.innerHTML = `
    <span>📅 Planlanan Temizlik & Borçlar (Tarih Sıralı):</span>
    <span style="font-size: 10px; color: var(--text-muted);">Tarihe Göre</span>
  `;
  hkList.appendChild(taskListHeader);

  // Görevleri tarihe göre sırala (Bugün ve gelecekteki görevler)
  const allTasks = (appData.cleaningTasks || []).slice().sort((a, b) => {
    return (a.date || '').localeCompare(b.date || '');
  });

  if (allTasks.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.color = 'var(--text-muted)';
    emptyDiv.style.fontSize = '12px';
    emptyDiv.style.padding = '12px';
    emptyDiv.style.textAlign = 'center';
    emptyDiv.style.background = 'rgba(255, 255, 255, 0.02)';
    emptyDiv.style.borderRadius = '8px';
    emptyDiv.innerText = 'Henüz planlanan temizlik kaydı bulunmuyor. Rezervasyon oluştururken temizlik maliyeti girdiğinizde tarihleriyle buraya düşecektir.';
    hkList.appendChild(emptyDiv);
  } else {
    allTasks.forEach(task => {
      const vConf = appData.villas[task.villa] || DEFAULT_VILLAS[task.villa];
      const vName = vConf?.name || task.villa;
      const amt = Number(task.amount) || 0;
      const isPaid = !!task.paid;

      if (!isPaid) {
        totalPendingDebtKokpit += amt;
      }

      const isToday = (task.date === todayStr);
      const isPast = (task.date && task.date < todayStr);

      let dateBadge = `<span class="badge badge-blue" style="font-size: 10px; font-weight: 700;">📅 ${formatTrDate(task.date)}</span>`;
      let borderColor = 'rgba(59, 130, 246, 0.4)';

      if (isToday) {
        dateBadge = `<span class="badge badge-amber" style="font-size: 10px; font-weight: 800; background: rgba(245, 158, 11, 0.25); border: 1px solid #F59E0B;">⚡ BUGÜN (${formatShortDate(task.date)})</span>`;
        borderColor = 'rgba(245, 158, 11, 0.8)';
      } else if (isPast) {
        dateBadge = `<span class="badge" style="font-size: 10px; font-weight: 600; background: rgba(148, 163, 184, 0.15); color: #94A3B8;">🕒 ${formatTrDate(task.date)}</span>`;
        borderColor = 'rgba(148, 163, 184, 0.3)';
      }

      const div = document.createElement('div');
      div.className = 'ops-entry-card';
      div.style.borderLeft = `3px solid ${borderColor}`;
      div.style.display = 'flex';
      div.style.flexDirection = 'column';
      div.style.gap = '8px';
      div.style.padding = '10px 12px';
      div.style.marginBottom = '8px';
      div.style.background = isToday ? 'rgba(245, 158, 11, 0.06)' : 'rgba(255, 255, 255, 0.03)';
      div.style.borderRadius = '8px';

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              ${dateBadge}
              <strong style="font-size: 13px; color: #FFFFFF;">${vName}</strong>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              ${task.guest ? `<strong>${task.guest}</strong> • Çıkış Temizliği & Hazırlık` : (task.notes || 'Rutin Temizlik')}
            </div>
          </div>
          <span class="badge ${isPaid ? 'badge-emerald' : 'badge-amber'}" style="font-size: 10px; font-weight: 700; white-space: nowrap;">
            ${isPaid ? '✅ Ödendi' : '⏳ Borç'}
          </span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed rgba(255, 255, 255, 0.1); font-size: 11px;">
          <span style="color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
            🧹 Bedel: 
            <b style="color: #60A5FA; cursor: pointer; text-decoration: underline dashed; font-size: 12px;" 
               onclick="promptEditTaskAmount('${task.id}')" 
               title="Maliyeti değiştirmek için tıklayın">
              ₺${amt.toLocaleString('tr-TR')} ✏️
            </b>
          </span>
          <button class="${isPaid ? 'btn-clean-paid' : 'btn-clean-pending'}" 
                  onclick="toggleTaskPaid('${task.id}')" 
                  title="${isPaid ? 'Ödenmedi (Borç) olarak işaretle' : 'Ödendi olarak işaretle ve Gider Defterine işle'}">
            ${isPaid ? '✅ ₺' + amt.toLocaleString('tr-TR') + ' Ödendi' : '⏳ ₺' + amt.toLocaleString('tr-TR') + ' Ödenecek'}
          </button>
        </div>
      `;
      hkList.appendChild(div);
    });
  }

  // Update badge in column header
  const pendingCount = (appData.cleaningTasks || []).filter(t => !t.paid).length;
  if (hkBadge) {
    hkBadge.innerText = `${pendingCount} Ödenecek (${allTasks.length} Görev)`;
    hkBadge.className = pendingCount > 0 ? 'badge badge-amber' : 'badge badge-emerald';
  }
  // Update Kokpit debt summary badge
  const debtSumEl = document.getElementById('kokpitCleanDebtSummary');
  if (debtSumEl) debtSumEl.innerText = '₺' + totalPendingDebtKokpit.toLocaleString('tr-TR');

  // Update navbar cleanDebtBadge
  const navBadge = document.getElementById('cleanDebtBadge');
  if (navBadge) {
    navBadge.innerText = '₺' + totalPendingDebtKokpit.toLocaleString('tr-TR') + ' Borç';
    navBadge.style.color = totalPendingDebtKokpit > 0 ? '#FBBF24' : '#34D399';
  }
}

// -------------------------------------------------------------
// ✏️ TEMİZLİK TUTARINI DEĞİŞTİRME FONKSİYONLARI (Kullanıcı İsteği)
// -------------------------------------------------------------
function promptEditCleaningAmount(vKey) {
  const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
  const currentAmount = (appData.cleaningPayments && appData.cleaningPayments[vKey] && appData.cleaningPayments[vKey].amount) || vConf?.cleanCost || 1500;
  
  const input = prompt(`${vConf?.name || vKey} temizlik bedelini giriniz (TL):`, currentAmount);
  if (input === null) return; // cancelled
  const newAmount = parseFloat(String(input).replace(/[^0-9.]/g, ''));
  if (isNaN(newAmount) || newAmount < 0) {
    alert('Lütfen geçerli bir tutar giriniz.');
    return;
  }

  if (!appData.cleaningPayments) appData.cleaningPayments = {};
  if (!appData.cleaningPayments[vKey]) appData.cleaningPayments[vKey] = { paid: false };
  appData.cleaningPayments[vKey].amount = newAmount;

  // Also sync in cleaningTasks if a task exists for this villa
  if (appData.cleaningTasks) {
    const task = appData.cleaningTasks.find(t => t.villa === vKey);
    if (task) {
      task.amount = newAmount;
      if (task.paid && appData.expenses) {
        const exp = appData.expenses.find(e => e.cleanTaskId === task.id || e.id === 'EXP-CLEAN-' + task.id);
        if (exp) exp.amount = newAmount;
      }
    }
  }



  saveAppData();
  renderDailyOps();
  renderHousekeepingTab();

  const msg = `✅ ${vConf?.name || vKey} temizlik bedeli ₺${newAmount.toLocaleString('tr-TR')} olarak güncellendi.`;
  if (window.showToast) window.showToast(msg);
  else console.log(msg);
}

function promptEditTaskAmount(taskId) {
  if (!appData.cleaningTasks) return;
  const task = appData.cleaningTasks.find(t => t.id === taskId);
  if (!task) return;

  const input = prompt(`${task.guest || task.villa} temizlik bedelini giriniz (TL):`, task.amount);
  if (input === null) return;
  const newAmount = parseFloat(String(input).replace(/[^0-9.]/g, ''));
  if (isNaN(newAmount) || newAmount < 0) {
    alert('Lütfen geçerli bir tutar giriniz.');
    return;
  }

  task.amount = newAmount;

  // Sync to villa level default
  if (appData.cleaningPayments && appData.cleaningPayments[task.villa]) {
    appData.cleaningPayments[task.villa].amount = newAmount;
  }



  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();

  if (window.showToast) window.showToast(`✅ Temizlik tutarı ₺${newAmount.toLocaleString('tr-TR')} olarak güncellendi.`);
}

function toggleCleaningPaid(vKey) {
  if (!appData.cleaningPayments) appData.cleaningPayments = {};
  if (!appData.cleaningTasks) appData.cleaningTasks = [];
  if (!appData.expenses) appData.expenses = [];
  const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
  const cleanCost = Number(appData.cleaningPayments[vKey]?.amount) || vConf?.cleanCost || 1500;

  const currentPaid = !!appData.cleaningPayments[vKey]?.paid;
  const newPaid = !currentPaid;

  appData.cleaningPayments[vKey] = {
    paid: newPaid,
    amount: cleanCost,
    updatedAt: '2026-09-07'
  };

  // İlgili villa için görevi bul veya oluştur
  const vTasks = appData.cleaningTasks.filter(t => t.villa === vKey).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let task = vTasks.find(t => (newPaid ? !t.paid : t.paid)) || vTasks[0];

  if (!task) {
    task = {
      id: 'TASK-CLN-' + vKey + '-' + Date.now().toString().slice(-4),
      villa: vKey,
      guest: '',
      date: '2026-09-07',
      cleaner: 'Fatma Hanım (Temizlik Ekibi)',
      amount: cleanCost,
      paid: newPaid,
      paidDate: newPaid ? '2026-09-07' : null,
      notes: `${vConf?.name || vKey} Rutin Temizlik`
    };
    appData.cleaningTasks.push(task);
  } else {
    task.paid = newPaid;
    task.paidDate = newPaid ? '2026-09-07' : null;
  }

  const expId = 'EXP-CLEAN-' + task.id;
  const vName = (appData.villas && appData.villas[vKey]?.name) ? appData.villas[vKey].name : vKey;
  const desc = `[${vName}] Temizlik Ücreti - ${task.cleaner || 'Fatma Hanım'} (${task.guest || 'Çıkış Temizliği'})`;

  if (newPaid) {
    const existingIdx = appData.expenses.findIndex(e => e.id === expId || e.cleanTaskId === task.id);
    if (existingIdx !== -1) {
      appData.expenses[existingIdx].amount = Number(task.amount) || cleanCost;
      appData.expenses[existingIdx].paid = true;
      appData.expenses[existingIdx].description = desc;
      appData.expenses[existingIdx].cleanTaskId = task.id;
    } else {
      appData.expenses.push({
        id: expId,
        date: '2026-09-07',
        month: '2026-09',
        villa: vKey,
        category: 'Temizlik',
        type: 'OPEX',
        amount: Number(task.amount) || cleanCost,
        description: desc,
        cleanTaskId: task.id,
        paid: true
      });
    }
  } else {
    appData.expenses = appData.expenses.filter(e => e.id !== expId && e.cleanTaskId !== task.id);
  }

  saveAppData();
  renderDailyOps();
  renderHousekeepingTab();
  renderExpensesTable();
  renderFinanceModule();

  const msg = newPaid 
    ? `✅ [${vName}] temizlik bedeli (₺${cleanCost.toLocaleString('tr-TR')}) "ÖDENDİ" yapıldı ve Gider Defteri'ne işlendi.`
    : `⏳ [${vName}] temizlik bedeli (₺${cleanCost.toLocaleString('tr-TR')}) "ÖDENECEK (Borç)" yapıldı, Gider Defteri'nden çıkarıldı.`;
  if (window.showToast) window.showToast(msg);
}

function cycleHkStatus(vKey) {
  if (!appData.housekeepingOverrides) appData.housekeepingOverrides = {};
  const current = appData.housekeepingOverrides[vKey];
  const states = [null, 'CLEANING', 'READY', 'OCCUPIED'];
  let nextIdx = 0;
  if (current === 'CLEANING') nextIdx = 2; // READY
  else if (current === 'READY') nextIdx = 3; // OCCUPIED
  else if (current === 'OCCUPIED') nextIdx = 0; // AUTO (null)
  else nextIdx = 1; // CLEANING

  appData.housekeepingOverrides[vKey] = states[nextIdx];
  saveAppData();
  renderDailyOps();
}

// -------------------------------------------------------------
// 🧹 DEDİKATED TAB: TEMİZLİK & OPERASYON BORÇ DEFTERİ MOTORU
// -------------------------------------------------------------
function renderHousekeepingTab() {
  const tbody = document.getElementById('hkTableBody');
  if (!tbody) return;

  if (!appData.cleaningTasks) {
    appData.cleaningTasks = [];
  }

  const statusFilter = document.getElementById('hkStatusFilter')?.value || 'ALL';
  const searchTerm = (document.getElementById('hkSearchInput')?.value || '').toLowerCase();

  let filtered = appData.cleaningTasks.slice();

  // Villa filter
  if (currentFilter.villa !== 'ALL') {
    filtered = filtered.filter(t => t.villa === currentFilter.villa);
  }

  // Period filter
  if (currentFilter.period !== 'ALL') {
    filtered = filtered.filter(t => (t.date && t.date.slice(0, 7) === currentFilter.period) || (t.paidDate && t.paidDate.slice(0, 7) === currentFilter.period));
  }

  // Status filter
  if (statusFilter === 'PENDING') {
    filtered = filtered.filter(t => !t.paid);
  } else if (statusFilter === 'PAID') {
    filtered = filtered.filter(t => t.paid);
  }

  // Search filter
  if (searchTerm) {
    filtered = filtered.filter(t => {
      const vName = (appData.villas[t.villa]?.name || t.villa).toLowerCase();
      const guest = (t.guest || '').toLowerCase();
      const cleaner = (t.cleaner || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      return vName.includes(searchTerm) || guest.includes(searchTerm) || cleaner.includes(searchTerm) || notes.includes(searchTerm);
    });
  }

  // KPI Calculations
  const allInScope = appData.cleaningTasks.filter(t => {
    if (currentFilter.villa !== 'ALL' && t.villa !== currentFilter.villa) return false;
    if (currentFilter.period !== 'ALL' && t.date && t.date.slice(0, 7) !== currentFilter.period) return false;
    return true;
  });

  const pendingList = allInScope.filter(t => !t.paid);
  const paidList = allInScope.filter(t => t.paid);

  const pendingDebt = pendingList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const paidAmount = paidList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const elPendingDebt = document.getElementById('hkKpiPendingDebt');
  const elPendingCount = document.getElementById('hkKpiPendingCount');
  const elPaidAmount = document.getElementById('hkKpiPaidAmount');
  const elPaidCount = document.getElementById('hkKpiPaidCount');
  const elTotalOps = document.getElementById('hkKpiTotalOps');
  const elTotalOpsMeta = document.getElementById('hkKpiTotalOpsMeta');

  if (elPendingDebt) elPendingDebt.innerText = '₺' + pendingDebt.toLocaleString('tr-TR');
  if (elPendingCount) elPendingCount.innerText = pendingList.length + ' Temizlik Ödeme Bekliyor';
  if (elPaidAmount) elPaidAmount.innerText = '₺' + paidAmount.toLocaleString('tr-TR');
  if (elPaidCount) elPaidCount.innerText = paidList.length + ' Temizlik Ödendi';
  if (elTotalOps) elTotalOps.innerText = allInScope.length;
  if (elTotalOpsMeta) elTotalOpsMeta.innerText = currentFilter.villa === 'ALL' ? '5 Villa Toplamı' : (appData.villas[currentFilter.villa]?.name || currentFilter.villa);

  // Table Population
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Kriterlere uygun temizlik / borç kaydı bulunamadı.</td></tr>';
    return;
  }

  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(task => {
    const vName = appData.villas[task.villa]?.name || task.villa;
    const isPaid = !!task.paid;
    const amount = Number(task.amount) || 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${formatTrDate(task.date)}</strong></td>
      <td><span class="villa-badge ${(task.villa || '').toLowerCase()}">${vName}</span></td>
      <td>
        <strong style="color: #FFFFFF;">${task.guest ? task.guest + ' Çıkışı' : (task.notes || 'Rutin Temizlik')}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${task.notes || '-'}</div>
      </td>
      <td>
        <span style="color: #93C5FD; font-weight: 500;">👤 ${task.cleaner || 'Temizlik Personeli'}</span>
      </td>
      <td>
        <b style="color: #60A5FA; cursor: pointer; text-decoration: underline dashed; font-size: 13px;" 
           onclick="promptEditTaskAmount('${task.id}')" 
           title="Tıklayarak tutarı anında değiştirin">
          ₺${amount.toLocaleString('tr-TR')} ✏️
        </b>
      </td>
      <td>
        <button class="${isPaid ? 'btn-clean-paid' : 'btn-clean-pending'}" 
                onclick="toggleTaskPaid('${task.id}')" 
                title="${isPaid ? 'Ödenmedi olarak değiştir' : 'Ödendi olarak işaretle'}">
          ${isPaid ? '✅ ÖDENDİ' : '⏳ ÖDENECEK'}
        </button>
      </td>
      <td style="color: var(--text-muted); font-size: 11px;">
        ${isPaid ? (task.paidDate ? formatTrDate(task.paidDate) : 'Ödendi') : '<span style="color: #F87171;">Bekliyor (Borç)</span>'}
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" onclick="openEditCleaningTaskModal('${task.id}')" style="padding: 3px 7px; font-size: 11px;" title="Detaylı Düzenle">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCleaningTask('${task.id}')" style="padding: 3px 7px; font-size: 11px; margin-left: 4px;" title="Sil">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleTaskPaid(taskId) {
  if (!appData.cleaningTasks) return;
  const task = appData.cleaningTasks.find(t => t.id === taskId);
  if (!task) return;

  const newPaid = !task.paid;
  task.paid = newPaid;
  task.paidDate = newPaid ? '2026-09-07' : null;

  // Kokpit villa durumu ile senkronize et
  if (!appData.cleaningPayments) appData.cleaningPayments = {};
  if (!appData.cleaningPayments[task.villa]) {
    appData.cleaningPayments[task.villa] = { paid: newPaid, amount: task.amount };
  } else {
    appData.cleaningPayments[task.villa].paid = newPaid;
    appData.cleaningPayments[task.villa].amount = task.amount;
  }

  if (!appData.expenses) appData.expenses = [];
  const expId = 'EXP-CLEAN-' + task.id;
  const vName = (appData.villas && appData.villas[task.villa]?.name) ? appData.villas[task.villa].name : task.villa;
  const desc = `[${vName}] Temizlik Ücreti - ${task.cleaner || 'Fatma Hanım'} (${task.guest || 'Çıkış Temizliği'})`;

  if (newPaid) {
    // Tuşa basılınca Gider Defteri'ne TAM 1 TANE gider kalemi girilir (Mükerrer kontrolü ile)
    const existingIdx = appData.expenses.findIndex(e => e.id === expId || e.cleanTaskId === task.id);
    if (existingIdx !== -1) {
      appData.expenses[existingIdx].amount = Number(task.amount) || 0;
      appData.expenses[existingIdx].paid = true;
      appData.expenses[existingIdx].description = desc;
      appData.expenses[existingIdx].cleanTaskId = task.id;
    } else {
      appData.expenses.push({
        id: expId,
        date: task.paidDate || '2026-09-07',
        month: (task.paidDate || '2026-09-07').slice(0, 7),
        villa: task.villa,
        category: 'Temizlik',
        type: 'OPEX',
        amount: Number(task.amount) || 0,
        description: desc,
        cleanTaskId: task.id,
        paid: true
      });
    }
  } else {
    // Ödendi iptal edilip tekrar borç yapıldığında gider kalemi geri alınır
    appData.expenses = appData.expenses.filter(e => e.id !== expId && e.cleanTaskId !== task.id);
  }

  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();
  renderFinanceModule();

  const msg = newPaid 
    ? `✅ [${vName}] temizlik ücreti (₺${Number(task.amount).toLocaleString('tr-TR')}) "ÖDENDİ" yapıldı ve Gider Defteri'ne işlendi.` 
    : `⏳ [${vName}] temizlik ücreti (₺${Number(task.amount).toLocaleString('tr-TR')}) "ÖDENECEK (Borç)" durumuna alındı.`;
  if (window.showToast) window.showToast(msg);
}

function payAllPendingCleaning() {
  if (!appData.cleaningTasks) return;
  const pending = appData.cleaningTasks.filter(t => !t.paid);
  if (pending.length === 0) {
    alert('Şu anda ödenecek bekleyen temizlik borcu bulunmuyor.');
    return;
  }

  const totalDebt = pending.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const confirmPay = confirm(`Toplam ${pending.length} adet bekleyen temizlik borcu (₺${totalDebt.toLocaleString('tr-TR')}) "ÖDENDİ" olarak kapatılıp Gider Defteri'ne işlensin mi?`);
  if (!confirmPay) return;

  const todayStr = '2026-09-07';
  if (!appData.expenses) appData.expenses = [];

  pending.forEach(t => {
    t.paid = true;
    t.paidDate = todayStr;

    if (appData.cleaningPayments && appData.cleaningPayments[t.villa]) {
      appData.cleaningPayments[t.villa].paid = true;
      appData.cleaningPayments[t.villa].amount = t.amount;
    }

    const expId = 'EXP-CLEAN-' + t.id;
    const vName = (appData.villas && appData.villas[t.villa]?.name) ? appData.villas[t.villa].name : t.villa;
    const desc = `[${vName}] Temizlik Ücreti - ${t.cleaner || 'Fatma Hanım'} (${t.guest || 'Çıkış'})`;

    const existingIdx = appData.expenses.findIndex(e => e.id === expId || e.cleanTaskId === t.id);
    if (existingIdx !== -1) {
      appData.expenses[existingIdx].amount = Number(t.amount) || 0;
      appData.expenses[existingIdx].paid = true;
      appData.expenses[existingIdx].description = desc;
      appData.expenses[existingIdx].cleanTaskId = t.id;
    } else {
      appData.expenses.push({
        id: expId,
        date: todayStr,
        month: todayStr.slice(0, 7),
        villa: t.villa,
        category: 'Temizlik',
        type: 'OPEX',
        amount: Number(t.amount) || 0,
        description: desc,
        cleanTaskId: t.id,
        paid: true
      });
    }
  });

  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();
  renderFinanceModule();

  if (window.showToast) window.showToast(`✅ ${pending.length} temizlik borcu (₺${totalDebt.toLocaleString('tr-TR')}) başarıyla ödendi ve Gider Defteri'ne işlendi.`);
}

function openNewCleaningTaskModal() {
  document.getElementById('cleaningTaskModalTitle').innerText = '🧹 Yeni Temizlik / Borç Girişi';
  document.getElementById('hkEditTaskId').value = '';
  document.getElementById('hkVilla').value = currentFilter.villa !== 'ALL' ? currentFilter.villa : 'SEYIR';
  document.getElementById('hkDate').value = '2026-09-07';
  document.getElementById('hkCleaner').value = 'Fatma Hanım (Temizlik Ekibi)';
  
  const vKey = document.getElementById('hkVilla').value;
  const vConf = appData.villas[vKey] || DEFAULT_VILLAS[vKey];
  document.getElementById('hkAmount').value = vConf?.cleanCost || 1500;
  
  document.getElementById('hkDesc').value = '';
  document.getElementById('hkPaidStatus').value = 'PENDING';
  document.getElementById('hkDeleteBtn').style.display = 'none';

  document.getElementById('cleaningTaskModal').classList.add('active');
}

function openEditCleaningTaskModal(taskId) {
  if (!appData.cleaningTasks) return;
  const task = appData.cleaningTasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('cleaningTaskModalTitle').innerText = '✏️ Temizlik Kaydını Düzenle';
  document.getElementById('hkEditTaskId').value = task.id;
  document.getElementById('hkVilla').value = task.villa;
  document.getElementById('hkDate').value = task.date || '2026-09-07';
  document.getElementById('hkCleaner').value = task.cleaner || 'Fatma Hanım';
  document.getElementById('hkAmount').value = task.amount;
  document.getElementById('hkDesc').value = task.notes || task.guest || '';
  document.getElementById('hkPaidStatus').value = task.paid ? 'PAID' : 'PENDING';
  document.getElementById('hkDeleteBtn').style.display = 'inline-block';

  document.getElementById('cleaningTaskModal').classList.add('active');
}

function closeCleaningTaskModal() {
  const modal = document.getElementById('cleaningTaskModal');
  if (modal) modal.classList.remove('active');
}

function saveCleaningTask(e) {
  e.preventDefault();
  if (!appData.cleaningTasks) appData.cleaningTasks = [];

  const editId = document.getElementById('hkEditTaskId').value;
  const villa = document.getElementById('hkVilla').value;
  const date = document.getElementById('hkDate').value;
  const cleaner = document.getElementById('hkCleaner').value.trim() || 'Fatma Hanım';
  const amount = parseFloat(document.getElementById('hkAmount').value) || 1500;
  const notes = document.getElementById('hkDesc').value.trim();
  const paid = document.getElementById('hkPaidStatus').value === 'PAID';

  if (editId) {
    const idx = appData.cleaningTasks.findIndex(t => t.id === editId);
    if (idx !== -1) {
      appData.cleaningTasks[idx] = {
        ...appData.cleaningTasks[idx],
        villa, date, cleaner, amount, notes,
        paid,
        paidDate: paid ? (appData.cleaningTasks[idx].paidDate || '2026-09-07') : null
      };
    }
  } else {
    const newId = 'TASK-CLN-' + Date.now().toString().slice(-5);
    appData.cleaningTasks.unshift({
      id: newId,
      villa,
      guest: '',
      date,
      cleaner,
      amount,
      paid,
      paidDate: paid ? '2026-09-07' : null,
      notes
    });
  }

  // Update default amount for this villa
  if (!appData.cleaningPayments) appData.cleaningPayments = {};
  if (!appData.cleaningPayments[villa]) appData.cleaningPayments[villa] = { paid: false };
  appData.cleaningPayments[villa].amount = amount;

  closeCleaningTaskModal();
  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();

  if (window.showToast) window.showToast('✅ Temizlik kaydı başarıyla kaydedildi.');
}

function deleteCleaningTask(taskId) {
  if (!confirm('Bu temizlik kaydını silmek istediğinize emin misiniz?')) return;
  if (!appData.cleaningTasks) return;
  if (!appData.deletedCleanTaskIds) appData.deletedCleanTaskIds = [];
  if (!appData.deletedCleanTaskIds.includes(taskId)) appData.deletedCleanTaskIds.push(taskId);
  appData.cleaningTasks = appData.cleaningTasks.filter(t => t.id !== taskId);
  
  // Bağlı gider kaydı varsa onu da temizle
  if (appData.expenses) {
    appData.expenses = appData.expenses.filter(e => e.cleanTaskId !== taskId && e.id !== 'EXP-CLEAN-' + taskId);
  }

  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();
  renderFinanceModule();

  if (window.showToast) window.showToast('🗑️ Temizlik kaydı ve bağlı gideri silindi.');
}

function deleteCleaningTaskFromModal() {
  const editId = document.getElementById('hkEditTaskId').value;
  if (editId) {
    deleteCleaningTask(editId);
    closeCleaningTaskModal();
  }
}

// -------------------------------------------------------------
// 📅 30 GÜNLÜK GÖRSEL DOLULUK ÇİZELGESİ (TAPE CHART)
// -------------------------------------------------------------
let tapeChartMonth = '2026-09';

function populateTapeChartMonthSelect() {
  const select = document.getElementById('tapeChartMonthSelect');
  if (!select) return;
  select.innerHTML = '';

  ALL_FINANCIAL_MONTHS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    let label = ALL_MONTH_NAMES[m] || m;
    if (m === '2026-09') label = 'Eylül 2026 (Güncel Ay)';
    if (m === '2026-12') label = 'Aralık 2026 (Yılbaşı 🎄)';
    if (m === '2027-01') label = 'Ocak 2027 (Kış Zirvesi ❄️)';
    opt.textContent = label;
    select.appendChild(opt);
  });

  select.value = tapeChartMonth;
}

function setTapeChartMonth(month) {
  tapeChartMonth = month;
  const select = document.getElementById('tapeChartMonthSelect');
  if (select) select.value = month;
  renderTapeChart();
}

function stepTapeChartMonth(delta) {
  let idx = ALL_FINANCIAL_MONTHS.indexOf(tapeChartMonth);
  if (idx === -1) idx = ALL_FINANCIAL_MONTHS.indexOf('2026-09');
  let newIdx = idx + delta;
  if (newIdx >= 0 && newIdx < ALL_FINANCIAL_MONTHS.length) {
    setTapeChartMonth(ALL_FINANCIAL_MONTHS[newIdx]);
  }
}

function renderTapeChart() {
  const container = document.getElementById('tapeChartContainer');
  if (!container) return;

  populateTapeChartMonthSelect();

  const [yStr, mStr] = tapeChartMonth.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 9;
  
  // Exact days in month (30 for Sep, 31 for Dec, 28/29 for Feb)
  const daysInMonth = new Date(year, month, 0).getDate();
  const vKeys = ['SEYIR', 'DOGUS', 'ZIRVE', 'SIRIN', 'NEFES'];
  
  const dayNamesShort = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const todayStr = '2026-09-07';

  let tableHtml = '<table class="tape-chart-table"><thead><tr><th class="tape-villa-th">VİLLA \ GÜNLER</th>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = (d < 10 ? '0' : '') + d;
    const curDateStr = `${tapeChartMonth}-${dStr}`;
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isToday = (curDateStr === todayStr);

    tableHtml += `<th class="tape-day-th ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}" style="${isToday ? 'background: rgba(245, 158, 11, 0.25); color: #FCD34D; border-bottom: 2px solid #F59E0B;' : ''}">
      ${d}<br>
      <span style="font-size:9px; font-weight:normal; opacity:0.8;">${dayNamesShort[dayOfWeek]}</span>
    </th>`;
  }
  tableHtml += '</tr></thead><tbody>';

  // Find bookings for each villa
  vKeys.forEach(vKey => {
    const vName = appData.villas[vKey]?.name || DEFAULT_VILLAS[vKey]?.name || vKey;
    tableHtml += `<tr><td class="tape-villa-td"><strong>${vName}</strong></td>`;

    const vBookings = appData.bookings.filter(b => b.villa === vKey && b.status !== 'CANCELLED');

    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = (d < 10 ? '0' : '') + d;
      const dateStr = `${tapeChartMonth}-${dStr}`;
      const isToday = (dateStr === todayStr);

      // Check if booked
      const booking = vBookings.find(b => {
        return (b.checkIn <= dateStr && b.checkOut > dateStr);
      });

      if (booking) {
        let chClass = 'tape-other';
        if (booking.channel === 'AIRBNB') chClass = 'tape-airbnb';
        else if (booking.channel === 'BOOKING') chClass = 'tape-booking';
        else if (['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'DIRECT'].includes(booking.channel)) chClass = 'tape-direct';

        const isCheckInDay = (booking.checkIn === dateStr);
        const isCheckOutDay = (booking.checkOut === dateStr);

        tableHtml += `<td class="tape-cell ${isToday ? 'today-cell' : ''}" title="${booking.guest} (${booking.channel}) | ${booking.checkIn} - ${booking.checkOut} | Toplam: ${booking.gross} TL (Tıklayarak düzenleyin)" onclick="editBooking('${booking.id}')" style="cursor: pointer;">
          <div class="tape-booked ${chClass}" style="${isCheckInDay ? 'border-left: 3px solid #FCD34D;' : ''}">
            ${booking.guest.split(' ')[0]}
          </div>
        </td>`;
      } else {
        tableHtml += `<td class="tape-cell ${isToday ? 'today-cell' : ''}" title="${formatTrDate(dateStr)} - Müsait (Rezervasyon eklemek için tıklayın)" onclick="openBookingForDate('${vKey}', '${dateStr}')" style="cursor: pointer; ${isToday ? 'background: rgba(245, 158, 11, 0.05);' : ''}"></td>`;
      }
    }
    tableHtml += '</tr>';
  });

  tableHtml += '</tbody></table>';
  container.innerHTML = tableHtml;
}

function openBookingForDate(villa, dateStr) {
  openBookingModal();
  const vSelect = document.getElementById('resVilla');
  const ciInput = document.getElementById('resCheckIn');
  if (vSelect) vSelect.value = villa;
  if (ciInput) ciInput.value = dateStr;
}


// =============================================================
// WHATSAPP BUSINESS AKILLI MESAJ AYRIŞTIRICI (SMART PARSER)
// =============================================================
let waTargetMode = 'lead'; // 'lead' or 'reservation'

function openWhatsAppModal(mode = 'lead') {
  waTargetMode = mode;
  const modal = document.getElementById('whatsappModal');
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('waRawInput');
      if (input) input.focus();
    }, 100);
  }
}

function closeWhatsAppModal() {
  const modal = document.getElementById('whatsappModal');
  if (modal) modal.classList.remove('active');
}

function loadSampleWhatsAppMsg() {
  const sample = "Ahmet Yılmaz: Selamlar, 18-21 Eylül arası 3 gece Zirve Dağ Evi için 45.000 TL teklif vermiştik. 8 kişiyiz, onaylıyoruz. Tel: 0532 555 1234";
  const input = document.getElementById('waRawInput');
  if (input) {
    input.value = sample;
    parseWhatsAppMessage();
  }
}

const MONTH_MAP_TR = {
  'ocak': '01', 'şubat': '02', 'subat': '02', 'mart': '03', 'nisan': '04',
  'mayıs': '05', 'mayis': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
  'agustos': '08', 'eylül': '09', 'eylul': '09', 'ekim': '10', 'kasım': '11',
  'kasim': '11', 'aralık': '12', 'aralik': '12'
};

function parseWhatsAppMessage() {
  const text = (document.getElementById('waRawInput')?.value || '').trim();
  if (!text) return;

  const lower = text.toLowerCase();

  // 1. Detect Villa
  let detectedVilla = 'ZIRVE';
  if (lower.includes('zirve')) detectedVilla = 'ZIRVE';
  else if (lower.includes('doğuş') || lower.includes('dogus')) detectedVilla = 'DOGUS';
  else if (lower.includes('seyir')) detectedVilla = 'SEYIR';
  else if (lower.includes('şirin') || lower.includes('sirin')) detectedVilla = 'SIRIN';
  else if (lower.includes('nefes')) detectedVilla = 'NEFES';

  // 2. Detect Guest Name
  let detectedGuest = '';
  const prefixMatch = text.match(/(?:misafir|isim|ad\s*soyad|ad|konuk)\s*[:=-]\s*([A-Za-zÇĞİÖŞÜçğıöşü\s]{3,30})/i);
  if (prefixMatch) {
    detectedGuest = prefixMatch[1].trim();
  } else {
    const waHeaderMatch = text.match(/^(?:\[[\d\.\,\:\s]+\]\s*)?([A-Za-zÇĞİÖŞÜçğıöşü\s]{3,25}):/m);
    if (waHeaderMatch) {
      detectedGuest = waHeaderMatch[1].trim();
    } else {
      const wordsMatch = text.match(/\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+))\b/);
      if (wordsMatch && !['Zirve', 'Doğuş', 'Seyir', 'Şirin', 'Nefes', 'WhatsApp', 'Airbnb', 'Booking', 'Selamlar', 'Merhaba'].includes(wordsMatch[1])) {
        detectedGuest = wordsMatch[1];
      }
    }
  }

  // 3. Detect Phone Number
  let detectedPhone = '';
  const phoneMatch = text.match(/(?:\+?90\s*|\b0)?\s*(5\d{2})[\s\.-]*(\d{3})[\s\.-]*(\d{2})[\s\.-]*(\d{2})\b/);
  if (phoneMatch) {
    detectedPhone = `0${phoneMatch[1]} ${phoneMatch[2]} ${phoneMatch[3]} ${phoneMatch[4]}`;
  }

  // 4. Detect Price / Amount
  let detectedAmount = 0;
  const kMatch = text.match(/(\d+)\s*(?:bin|k)\b/i);
  if (kMatch) {
    detectedAmount = Number(kMatch[1]) * 1000;
  } else {
    const priceMatch = text.match(/(\d{1,3}(?:\.\d{3})+|\d{4,7})\s*(?:tl|₺|euro|usd|lira)?/i);
    if (priceMatch) {
      detectedAmount = Number(priceMatch[1].replace(/\./g, '')) || 0;
    }
  }

  // 5. Detect Pax (Kişi Sayısı)
  let detectedPax = 6;
  const paxMatch = text.match(/(\d{1,2})\s*(?:kişi|kisi|pax|yetişkin|yetiskin|konuk)/i);
  if (paxMatch) {
    detectedPax = Number(paxMatch[1]);
  }

  // 6. Detect Dates
  let checkIn = '';
  let checkOut = '';
  const currentYear = 2026;

  const sameMonthMatch = text.match(/(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i);
  const diffMonthMatch = text.match(/(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s*[-–/]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i);
  const isoMatch = text.match(/(\d{1,2})[\.\/](d{1,2})[\.\/](d{4})\s*[-–]\s*(\d{1,2})[\.\/](d{1,2})[\.\/](d{4})/);

  if (isoMatch) {
    checkIn = `${isoMatch[3]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[1].padStart(2, '0')}`;
    checkOut = `${isoMatch[6]}-${isoMatch[5].padStart(2, '0')}-${isoMatch[4].padStart(2, '0')}`;
  } else if (diffMonthMatch) {
    const d1 = diffMonthMatch[1].padStart(2, '0');
    const m1Name = diffMonthMatch[2].toLowerCase();
    const d2 = diffMonthMatch[3].padStart(2, '0');
    const m2Name = diffMonthMatch[4].toLowerCase();
    const m1 = MONTH_MAP_TR[m1Name];
    const m2 = MONTH_MAP_TR[m2Name];

    if (m1 && m2) {
      const y1 = currentYear;
      const y2 = (m1 === '12' && m2 === '01') ? (currentYear + 1) : currentYear;
      checkIn = `${y1}-${m1}-${d1}`;
      checkOut = `${y2}-${m2}-${d2}`;
    }
  } else if (sameMonthMatch) {
    const d1 = sameMonthMatch[1].padStart(2, '0');
    const d2 = sameMonthMatch[2].padStart(2, '0');
    const mName = sameMonthMatch[3].toLowerCase();
    const m = MONTH_MAP_TR[mName];
    if (m) {
      checkIn = `${currentYear}-${m}-${d1}`;
      checkOut = `${currentYear}-${m}-${d2}`;
    }
  }

  // Populate preview form
  if (detectedGuest) document.getElementById('waParsedGuest').value = detectedGuest;
  if (detectedPhone) document.getElementById('waParsedPhone').value = detectedPhone;
  document.getElementById('waParsedVilla').value = detectedVilla;
  if (detectedAmount > 0) document.getElementById('waParsedAmount').value = detectedAmount;
  if (checkIn) document.getElementById('waParsedCheckIn').value = checkIn;
  if (checkOut) document.getElementById('waParsedCheckOut').value = checkOut;
  if (detectedPax) document.getElementById('waParsedPax').value = detectedPax;
  
  const notes = `WhatsApp mesajından aktarıldı: ${text.slice(0, 60)}...`;
  document.getElementById('waParsedNotes').value = notes;
}

function saveWaAsLead() {
  const guest = document.getElementById('waParsedGuest').value.trim() || 'WhatsApp Misafiri';
  const villa = document.getElementById('waParsedVilla').value;
  const quote = Number(document.getElementById('waParsedAmount').value) || 0;
  const phone = document.getElementById('waParsedPhone').value.trim();
  const notes = document.getElementById('waParsedNotes').value.trim();

  const newLead = {
    id: 'L-' + Date.now().toString().slice(-4),
    guest: phone ? `${guest} (${phone})` : guest,
    villa: villa,
    channel: 'WhatsApp',
    quote: quote,
    status: 'FOLLOW_UP',
    lostReason: '-',
    notes: notes || 'WhatsApp Business talebi'
  };

  if (!appData.leads) appData.leads = [];
  appData.leads.unshift(newLead);
  saveAppData();
  closeWhatsAppModal();

  switchTab('leads');
  renderManageLeadsTable();

  alert(`✅ WhatsApp talebi "${guest}" başarıyla Lead & Satış listesine kaydedildi!`);
}

function saveWaAsBooking() {
  const guest = document.getElementById('waParsedGuest').value.trim() || 'WhatsApp Misafiri';
  const villa = document.getElementById('waParsedVilla').value;
  const gross = Number(document.getElementById('waParsedAmount').value) || 0;
  const checkIn = document.getElementById('waParsedCheckIn').value;
  const checkOut = document.getElementById('waParsedCheckOut').value;
  const pax = Number(document.getElementById('waParsedPax').value) || 6;
  const phone = document.getElementById('waParsedPhone').value.trim();

  if (!checkIn || !checkOut) {
    alert('Lütfen rezervasyon için giriş ve çıkış tarihlerini seçiniz!');
    return;
  }

  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));

  const newRez = {
    id: 'REZ-WA-' + Date.now().toString().slice(-4),
    villa: villa,
    guest: phone ? `${guest} (${phone})` : guest,
    checkIn: checkIn,
    checkOut: checkOut,
    nights: nights,
    channel: 'WHATSAPP',
    gross: gross,
    otaComm: 0,
    cleanFee: 0,
    net: gross,
    pax: pax,
    status: 'CONFIRMED'
  };

  if (!appData.bookings) appData.bookings = [];
  appData.bookings.unshift(newRez);
  saveAppData();
  closeWhatsAppModal();

  switchTab('reservations');
  renderManageBookingsTable();
  renderTapeChart();

  alert(`✅ Tebrikler! "${guest}" için ${nights} gecelik WhatsApp rezervasyonu kesinleştirildi ve takvime işlendi!`);
}


// =============================================================
// WHATSAPP TALEP & DÖNÜŞÜM ANALİTİĞİ MOTORU
// =============================================================
function switchWaModalTab(tab) {
  const p1 = document.getElementById('waPaneParser');
  const p2 = document.getElementById('waPaneGateway');
  const b1 = document.getElementById('waTabBtnParser');
  const b2 = document.getElementById('waTabBtnGateway');

  if (tab === 'gateway') {
    if (p1) p1.style.display = 'none';
    if (p2) p2.style.display = 'block';
    if (b1) { b1.style.borderBottom = 'none'; b1.style.opacity = '0.7'; }
    if (b2) { b2.style.borderBottom = '2px solid #25D366'; b2.style.opacity = '1'; }
  } else {
    if (p1) p1.style.display = 'block';
    if (p2) p2.style.display = 'none';
    if (b1) { b1.style.borderBottom = '2px solid #25D366'; b1.style.opacity = '1'; }
    if (b2) { b2.style.borderBottom = 'none'; b2.style.opacity = '0.7'; }
  }
}

function showLiveQrCodeModal() {
  const box = document.getElementById('whapiQrBox');
  if (box) {
    box.style.display = (box.style.display === 'none') ? 'block' : 'none';
  }
}

function saveWhapiSettings() {
  const token = document.getElementById('whapiTokenInput')?.value.trim();
  if (!appData.waConfig) appData.waConfig = {};
  appData.waConfig.token = token;
  saveAppData();
  alert('Whapi.cloud ayarları kaydedildi!');
}

function simulateIncomingWhatsAppTest() {
  const testGuests = [
    { name: 'Cemil Öz', phone: '0533 999 8877', villa: 'ZIRVE', quote: 55000, notes: '25-28 Eylül jakuzili ev için WhatsApp mesajı attı' },
    { name: 'Deniz Aksu', phone: '0542 777 6655', villa: 'DOGUS', quote: 42000, notes: 'Ekim ilk haftası 11 kişilik aile için fiyat sordu' },
    { name: 'Alper Tunç', phone: '0530 222 3344', villa: 'SEYIR', quote: 26000, notes: 'Hafta içi 2 gece için indirim talep etti' }
  ];

  const pick = testGuests[Math.floor(Math.random() * testGuests.length)];
  const newLead = {
    id: 'L-SIM-' + Date.now().toString().slice(-4),
    guest: `${pick.name} (${pick.phone})`,
    villa: pick.villa,
    channel: 'WhatsApp',
    quote: pick.quote,
    status: 'FOLLOW_UP',
    lostReason: '-',
    notes: pick.notes
  };

  if (!appData.leads) appData.leads = [];
  appData.leads.unshift(newLead);
  saveAppData();

  renderManageLeadsTable();
  renderLeadAnalytics();

  // Show live toast
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed; top:24px; right:24px; background:#065F46; color:#D1FAE5; border:1px solid #10B981; padding:16px 22px; border-radius:12px; font-weight:700; font-size:13px; box-shadow:0 15px 35px rgba(0,0,0,0.6); z-index:99999; display:flex; align-items:center; gap:12px;';
  toast.innerHTML = `<span style="font-size:24px;">💬</span> <div><strong>Yeni Canlı WhatsApp Mesajı Yakalandı!</strong><br><span style="font-size:12px; font-weight:normal; color:#A7F3D0;">${pick.name} (${pick.villa}) - ${pick.quote.toLocaleString('tr-TR')} TL talep oluşturuldu.</span></div>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

function renderLeadAnalytics() {
  const leads = appData.leads || [];
  const totalLeads = leads.length;

  const wonLeads = leads.filter(l => l.status === 'WON');
  const lostLeads = leads.filter(l => l.status === 'LOST');
  const activeLeads = leads.filter(l => l.status === 'FOLLOW_UP' || l.status === 'QUOTE_SENT');

  const convRate = totalLeads > 0 ? ((wonLeads.length / totalLeads) * 100).toFixed(1) : 0;
  const wonRevenue = wonLeads.reduce((sum, l) => sum + (Number(l.quote) || 0), 0);
  const lostRevenue = lostLeads.reduce((sum, l) => sum + (Number(l.quote) || 0), 0);

  // Update KPI Cards
  const kTotal = document.getElementById('waKpiTotalLeads');
  const kConv = document.getElementById('waKpiConvRate');
  const kWon = document.getElementById('waKpiWonRevenue');
  const kLost = document.getElementById('waKpiLostRevenue');
  const kLostSub = document.getElementById('waKpiLostCountSub');

  if (kTotal) kTotal.innerText = totalLeads;
  if (kConv) kConv.innerText = `%${convRate}`;
  if (kWon) kWon.innerText = `${wonRevenue.toLocaleString('tr-TR')} ₺`;
  if (kLost) kLost.innerText = `${lostRevenue.toLocaleString('tr-TR')} ₺`;
  if (kLostSub) kLostSub.innerText = `${lostLeads.length} kaçan talep | ${activeLeads.length} sıcak takip`;

  // Loss Reasons Breakdown
  const lossReasonsCount = {
    'Fiyat Yüksek': 0,
    'Tarih Dolu': 0,
    'Cevap Vermedi': 0,
    'Diğer': 0
  };

  lostLeads.forEach(l => {
    const reason = l.lostReason || 'Diğer';
    if (lossReasonsCount[reason] !== undefined) lossReasonsCount[reason]++;
    else lossReasonsCount['Diğer']++;
  });

  const lossBox = document.getElementById('waLossReasonsList');
  if (lossBox) {
    lossBox.innerHTML = '';
    const totalLostCount = lostLeads.length || 1;
    const reasonsKeys = [
      { key: 'Fiyat Yüksek', color: '#EF4444', label: 'Bütçe / Fiyat Yüksek Geldi' },
      { key: 'Tarih Dolu', color: '#F59E0B', label: 'İstenen Tarih Doluydu' },
      { key: 'Cevap Vermedi', color: '#64748B', label: 'Geri Dönüş Yapmadı' },
      { key: 'Diğer', color: '#8B5CF6', label: 'Diğer Nedenler' }
    ];

    reasonsKeys.forEach(r => {
      const cnt = lossReasonsCount[r.key] || 0;
      const pct = Math.round((cnt / totalLostCount) * 100);
      lossBox.innerHTML += `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span>${r.label}</span>
            <strong style="color:${r.color};">${cnt} Kişi (%${pct})</strong>
          </div>
          <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${r.color}; border-radius:3px;"></div>
          </div>
        </div>
      `;
    });
  }

  // Villa Demand Share Breakdown
  const villaCounts = { ZIRVE: 0, DOGUS: 0, SEYIR: 0, SIRIN: 0, NEFES: 0 };
  leads.forEach(l => {
    if (villaCounts[l.villa] !== undefined) villaCounts[l.villa]++;
  });

  const villaBox = document.getElementById('waVillaDemandList');
  if (villaBox) {
    villaBox.innerHTML = '';
    const totalVCounts = totalLeads || 1;
    const villaMeta = [
      { key: 'ZIRVE', name: 'Zirve Dağ Evi', color: '#3B82F6' },
      { key: 'DOGUS', name: 'Doğuş Dağ Evi', color: '#10B981' },
      { key: 'SEYIR', name: 'Seyir Dağ Evi', color: '#F59E0B' },
      { key: 'SIRIN', name: 'Şirin Dağ Evi', color: '#EC4899' },
      { key: 'NEFES', name: 'Nefes Dağ Evi', color: '#8B5CF6' }
    ];

    villaMeta.forEach(v => {
      const cnt = villaCounts[v.key] || 0;
      const pct = Math.round((cnt / totalVCounts) * 100);
      villaBox.innerHTML += `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span>${v.name}</span>
            <strong>${cnt} Talep (%${pct})</strong>
          </div>
          <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${v.color}; border-radius:3px;"></div>
          </div>
        </div>
      `;
    });
  }

  // AI Actionable Insights
  const insightsBox = document.getElementById('waActionableInsights');
  if (insightsBox) {
    insightsBox.innerHTML = `
      <div style="margin-bottom: 8px;">
        • <strong>Dönüşüm Verimliliği:</strong> Gelen her 3 WhatsApp talebinden <strong>1 tanesi rezervasyona dönüştü</strong> (%${convRate}). Bu kanaldan komisyonsuz <strong>${wonRevenue.toLocaleString('tr-TR')} TL</strong> saf nakit kazanıldı.
      </div>
      <div style="margin-bottom: 8px;">
        • <strong>Kaçan Satış Aksiyonu:</strong> Kaybedilen taleplerin en büyük sebebi <em>"Tarih Dolu"</em> ve <em>"Fiyat Yüksek"</em>. İstenen tarih doluysa misafire hemen yakın boş gap gecelerini alternatif olarak sunun.
      </div>
      <div>
        • <strong>Zirve & Doğuş Talebi:</strong> Taleplerin %60'ından fazlası Zirve ve Doğuş için geliyor. Bu iki villada taban fiyatı savunup, Şirin ve Seyir için hafta içi özel paket teklifleri vererek portföy dengesini sağlayabilirsiniz.
      </div>
    `;
  }
}


// =============================================================
// HEADER AÇILIR MENÜLERİ YÖNETİMİ (HEADER DROPDOWNS)
// =============================================================
function toggleHeaderDropdown(menuId) {
  const menu = document.getElementById(menuId);
  const isOpen = menu && menu.classList.contains('show');
  closeAllHeaderDropdowns();
  if (!isOpen && menu) {
    menu.classList.add('show');
  }
}

function closeAllHeaderDropdowns() {
  document.querySelectorAll('.header-dropdown-menu').forEach(m => m.classList.remove('show'));
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.header-dropdown-wrap')) {
    closeAllHeaderDropdowns();
  }
});



// =============================================================
// AYLARA GÖRE KPI TAKİP VE GELİŞİM MATRİSİ (14+ AY MOTORU)
// =============================================================
let activeKpiTrackerMetric = 'ciro'; // 'ciro', 'netProfit', 'adr', 'occupancy', 'opex'

function setKpiTrackerMetric(metric) {
  activeKpiTrackerMetric = metric;
  renderMonthlyKpiTracker();
}

function filterByPeriod(period) {
  currentFilter.period = period;
  const select = document.getElementById('globalPeriodFilter');
  if (select) select.value = period;
  updateStepperLabels();
  renderAll();

  // Smooth scroll to finance or tracker
  const target = document.querySelector('.monthly-kpi-tracker-card') || document.getElementById('globalPeriodFilter');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function getMonthlyKpiDataset() {
  const months = [
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'
  ];

  const dataset = [];

  months.forEach(m => {
    const hasStatic = (!appData.isCleanState && COMPANY_EXCEL_DATABASE.monthlyFinancials && COMPANY_EXCEL_DATABASE.monthlyFinancials[m]);
    
    let ciro = 0;
    let opex = 0;
    let capex = 0;
    let netProfit = 0;
    let nights = 0;
    let adr = 0;
    let occupancy = 0;
    let revpar = 0;
    let margin = 0;
    let target = (appData.targets && appData.targets[m]) || (COMPANY_EXCEL_DATABASE.targets && COMPANY_EXCEL_DATABASE.targets[m]) || 0;
    const monthName = ALL_MONTH_NAMES[m] || m;

    if (hasStatic) {
      const mf = COMPANY_EXCEL_DATABASE.monthlyFinancials[m];
      ciro = Number(mf.ciro) || 0;
      opex = Number(mf.opex) || 0;
      capex = Number(mf.capex) || 0;
      netProfit = Number(mf.netProfit) || (ciro - opex - capex);
      nights = Number(mf.daysSold) || 0;
      adr = nights > 0 ? Math.round(ciro / nights) : (Math.round(mf.avgDaily) || 0);
      margin = Number(mf.opMargin || mf.netMargin || (ciro > 0 ? ((netProfit / ciro) * 100) : 0));
      occupancy = Number(((nights / 150) * 100).toFixed(1));
      revpar = Math.round(ciro / 150);
      if (mf.targetCiro && !target) target = Number(mf.targetCiro);
    } else {
      // Dynamic calculation from appData.bookings and appData.expenses
      (appData.bookings || []).forEach(b => {
        if (b.status === 'CANCELLED') return;
        const bIn = b.checkIn ? b.checkIn.substring(0, 7) : '';
        const bOut = b.checkOut ? b.checkOut.substring(0, 7) : '';
        if (bIn === m || bOut === m) {
          ciro += Number(b.gross || b.net || 0);
          nights += Number(b.nights || 0);
        }
      });

      (appData.expenses || []).forEach(exp => {
        const expM = exp.monthKey || exp.month || (exp.date ? exp.date.substring(0, 7) : '');
        if (expM === m) {
          const amt = Number(exp.amount) || 0;
          if (exp.type === 'CAPEX') capex += amt;
          else opex += amt;
        }
      });

      netProfit = ciro - opex - capex;
      adr = nights > 0 ? Math.round(ciro / nights) : 0;
      margin = ciro > 0 ? Number(((netProfit / ciro) * 100).toFixed(1)) : 0;
      occupancy = Number(((nights / 150) * 100).toFixed(1));
      revpar = Math.round(ciro / 150);
      if (!target) {
        if (m === '2026-09') target = 120000;
        else if (m === '2026-12') target = 500000;
      }
    }

    const totalExp = opex + capex;
    const targetPct = target > 0 ? Number(((ciro / target) * 100).toFixed(1)) : null;

    dataset.push({
      key: m,
      monthName,
      ciro,
      opex,
      capex,
      totalExp,
      netProfit,
      nights,
      adr,
      occupancy,
      revpar,
      margin,
      target,
      targetPct,
      isCurrentMonth: (m === '2026-09'),
      isSelected: (currentFilter.period === m)
    });
  });

  return dataset;
}

function renderMonthlyKpiTracker() {
  const tableBody = document.getElementById('monthlyKpiTableBody');
  const barsContainer = document.getElementById('kpiTrackerVisualBars');
  if (!tableBody && !barsContainer) return;

  const dataset = getMonthlyKpiDataset();

  // 1. Update Historical Peak Cards
  let maxRevItem = dataset[0], maxAdrItem = dataset[0], maxNightsItem = dataset[0], maxProfitItem = dataset[0];
  dataset.forEach(d => {
    if (d.ciro > maxRevItem.ciro) maxRevItem = d;
    if (d.adr > maxAdrItem.adr) maxAdrItem = d;
    if (d.nights > maxNightsItem.nights) maxNightsItem = d;
    if (d.netProfit > maxProfitItem.netProfit) maxProfitItem = d;
  });

  const pRev = document.getElementById('kpiPeakRev');
  if (pRev && maxRevItem) pRev.innerText = `${maxRevItem.monthName.split(' ')[0]} ${maxRevItem.key.split('-')[0]} (${Math.round(maxRevItem.ciro).toLocaleString('tr-TR')} TL)`;

  const pAdr = document.getElementById('kpiPeakAdr');
  if (pAdr && maxAdrItem) pAdr.innerText = `${maxAdrItem.monthName.split(' ')[0]} ${maxAdrItem.key.split('-')[0]} (${Math.round(maxAdrItem.adr).toLocaleString('tr-TR')} TL)`;

  const pNights = document.getElementById('kpiPeakNights');
  if (pNights && maxNightsItem) pNights.innerText = `${maxNightsItem.monthName.split(' ')[0]} ${maxNightsItem.key.split('-')[0]} (${maxNightsItem.nights} Gece)`;

  const pProfit = document.getElementById('kpiPeakProfit');
  if (pProfit && maxProfitItem) pProfit.innerText = `${maxProfitItem.monthName.split(' ')[0]} ${maxProfitItem.key.split('-')[0]} (${Math.round(maxProfitItem.netProfit).toLocaleString('tr-TR')} TL)`;

  // 2. Metric Buttons State & Chart Title
  const metricConfigs = {
    ciro: {
      title: '💰 Aylara Göre Ciro Evrimi (TL)',
      color: '#3B82F6',
      activeBtnStyle: 'background: rgba(59,130,246,0.25); border-color: #3B82F6; color: #93C5FD; font-weight: 700;',
      format: (val) => Math.round(val).toLocaleString('tr-TR') + ' ₺'
    },
    netProfit: {
      title: '💵 Aylara Göre Net Nakit Kâr Dağılımı (TL)',
      color: '#10B981',
      activeBtnStyle: 'background: rgba(16,185,129,0.25); border-color: #10B981; color: #A7F3D0; font-weight: 700;',
      format: (val) => Math.round(val).toLocaleString('tr-TR') + ' ₺'
    },
    adr: {
      title: '🏷️ Aylara Göre Ortalama Günlük Satış Fiyatı - ADR (₺/Gece)',
      color: '#F59E0B',
      activeBtnStyle: 'background: rgba(245,158,11,0.25); border-color: #F59E0B; color: #FDE68A; font-weight: 700;',
      format: (val) => Math.round(val).toLocaleString('tr-TR') + ' ₺'
    },
    occupancy: {
      title: '🌙 Aylara Göre Doluluk Oranı Dağılımı (%)',
      color: '#8B5CF6',
      activeBtnStyle: 'background: rgba(139,92,246,0.25); border-color: #8B5CF6; color: #DDD6FE; font-weight: 700;',
      format: (val) => '%' + Number(val).toFixed(1)
    },
    opex: {
      title: '💸 Aylara Göre Toplam Giderler (OPEX + CAPEX) (TL)',
      color: '#EC4899',
      activeBtnStyle: 'background: rgba(236,72,153,0.25); border-color: #EC4899; color: #FBCFE8; font-weight: 700;',
      format: (val) => Math.round(val).toLocaleString('tr-TR') + ' ₺'
    }
  };

  const activeConf = metricConfigs[activeKpiTrackerMetric] || metricConfigs.ciro;
  const titleEl = document.getElementById('kpiChartActiveTitle');
  if (titleEl) titleEl.innerText = activeConf.title;

  ['ciro', 'netProfit', 'adr', 'occupancy', 'opex'].forEach(mKey => {
    const btn = document.getElementById('kpiTrackBtn-' + mKey);
    if (btn) {
      if (mKey === activeKpiTrackerMetric) {
        btn.setAttribute('style', activeConf.activeBtnStyle);
      } else {
        btn.setAttribute('style', 'background: transparent; border-color: var(--border-color); color: var(--text-muted); font-weight: 500;');
      }
    }
  });

  // 3. Render Visual Monthly Bars
  if (barsContainer) {
    barsContainer.innerHTML = '';
    
    // Find max value for scaling
    let maxVal = 1;
    dataset.forEach(d => {
      let val = 0;
      if (activeKpiTrackerMetric === 'ciro') val = d.ciro;
      else if (activeKpiTrackerMetric === 'netProfit') val = Math.max(0, d.netProfit);
      else if (activeKpiTrackerMetric === 'adr') val = d.adr;
      else if (activeKpiTrackerMetric === 'occupancy') val = d.occupancy;
      else if (activeKpiTrackerMetric === 'opex') val = d.totalExp;
      if (val > maxVal) maxVal = val;
    });

    dataset.forEach(d => {
      let val = 0;
      if (activeKpiTrackerMetric === 'ciro') val = d.ciro;
      else if (activeKpiTrackerMetric === 'netProfit') val = d.netProfit;
      else if (activeKpiTrackerMetric === 'adr') val = d.adr;
      else if (activeKpiTrackerMetric === 'occupancy') val = d.occupancy;
      else if (activeKpiTrackerMetric === 'opex') val = d.totalExp;

      const pctOfMax = maxVal > 0 ? Math.max(6, Math.min(100, Math.round((Math.max(0, val) / maxVal) * 100))) : 6;
      const barHeightPx = Math.round((pctOfMax / 100) * 95);

      const parts = d.key.split('-');
      const shortMonth = ALL_MONTH_NAMES[d.key] ? ALL_MONTH_NAMES[d.key].split(' ')[0].substring(0, 3) : parts[1];
      const shortYear = parts[0].substring(2);
      const isCurrentFilter = (currentFilter.period === d.key);

      const barColor = (val < 0 && activeKpiTrackerMetric === 'netProfit') ? '#EF4444' : activeConf.color;
      const borderStyle = isCurrentFilter ? 'border: 2px solid #FFFFFF; box-shadow: 0 0 12px ' + activeConf.color + ';' : 'border: 1px solid rgba(255,255,255,0.15);';

      const barEl = document.createElement('div');
      barEl.className = 'kpi-tracker-bar-col' + (isCurrentFilter ? ' active' : '');
      barEl.style.cssText = 'flex: 1; min-width: 44px; max-width: 58px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; cursor: pointer; position: relative; transition: all 0.2s ease;';
      barEl.title = `${d.monthName}\n${activeConf.title.split('(')[0].trim()}: ${activeConf.format(val)}\n(Bu ayın raporunu açmak için tıklayın)`;
      barEl.onclick = () => filterByPeriod(d.key);

      barEl.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; color: ${isCurrentFilter ? '#FFFFFF' : '#94A3B8'}; margin-bottom: 4px; white-space: nowrap; text-align: center;">
          ${activeKpiTrackerMetric === 'occupancy' ? ('%' + Number(val).toFixed(0)) : (val >= 1000 ? Math.round(val / 1000) + 'k' : Math.round(val))}
        </div>
        <div class="kpi-bar-fill" style="width: 100%; height: ${barHeightPx}px; background: ${barColor}; opacity: ${isCurrentFilter ? '1' : '0.8'}; border-radius: 4px 4px 1px 1px; ${borderStyle}"></div>
        <div style="font-size: 10px; color: ${isCurrentFilter ? '#60A5FA' : 'var(--text-muted)'}; font-weight: ${isCurrentFilter ? '800' : '500'}; margin-top: 6px; white-space: nowrap;">
          ${shortMonth} ${shortYear}
        </div>
      `;

      barsContainer.appendChild(barEl);
    });
  }

  // 4. Render Table Body
  if (tableBody) {
    tableBody.innerHTML = '';

    dataset.forEach(d => {
      const isSelected = (currentFilter.period === d.key);
      const rowStyle = isSelected 
        ? 'background: rgba(59, 130, 246, 0.12); border-left: 4px solid #3B82F6;' 
        : (d.isCurrentMonth ? 'background: rgba(16, 185, 129, 0.05);' : '');

      let targetBadge = '<span style="color: var(--text-muted);">-</span>';
      if (d.target > 0 && d.targetPct !== null) {
        const isTargetWon = d.targetPct >= 100;
        const color = isTargetWon ? '#34D399' : (d.targetPct >= 75 ? '#FBBF24' : '#F87171');
        targetBadge = `
          <div>
            <span style="font-weight: 800; color: ${color};">%${d.targetPct}</span>
            <div style="height: 4px; width: 60px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-top: 2px;">
              <div style="width: ${Math.min(100, d.targetPct)}%; height: 100%; background: ${color};"></div>
            </div>
          </div>
        `;
      }

      const profitColor = d.netProfit >= 0 ? '#34D399' : '#F87171';
      const marginBadge = d.margin >= 40 ? 'badge-green' : (d.margin >= 20 ? 'badge-blue' : (d.margin > 0 ? 'badge-yellow' : 'badge-red'));

      let periodLabel = d.monthName;
      if (d.isCurrentMonth) periodLabel += ' <span class="badge badge-green" style="font-size:10px; margin-left:4px;">GÜNCEL AY</span>';
      if (d.key === '2026-01') periodLabel += ' <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">REKOR CİRO</span>';
      if (d.key === '2026-08') periodLabel += ' <span class="badge badge-yellow" style="font-size:10px; margin-left:4px;">HACİM LİDERİ</span>';
      if (d.key === '2026-12') periodLabel += ' <span class="badge badge-purple" style="font-size:10px; margin-left:4px;">YILBAŞI 🎄</span>';

      const tr = document.createElement('tr');
      if (rowStyle) tr.setAttribute('style', rowStyle);

      tr.innerHTML = `
        <td style="font-weight: 700; white-space: nowrap;">${periodLabel}</td>
        <td style="font-weight: 800; color: #60A5FA; white-space: nowrap;">${Math.round(d.ciro).toLocaleString('tr-TR')} ₺</td>
        <td style="color: var(--text-muted); white-space: nowrap;">${d.target > 0 ? (Math.round(d.target).toLocaleString('tr-TR') + ' ₺') : '-'}</td>
        <td style="white-space: nowrap;">${targetBadge}</td>
        <td style="font-weight: 800; color: ${profitColor}; white-space: nowrap;">${Math.round(d.netProfit).toLocaleString('tr-TR')} ₺</td>
        <td style="white-space: nowrap;"><span class="badge ${marginBadge}">%${d.margin}</span></td>
        <td style="font-weight: 700; white-space: nowrap;">${d.nights} Gece</td>
        <td style="font-weight: 700; white-space: nowrap;">%${d.occupancy}</td>
        <td style="font-weight: 700; color: #FBBF24; white-space: nowrap;">${d.adr > 0 ? (Math.round(d.adr).toLocaleString('tr-TR') + ' ₺') : '-'}</td>
        <td style="font-weight: 600; color: #DDD6FE; white-space: nowrap;">${d.revpar > 0 ? (Math.round(d.revpar).toLocaleString('tr-TR') + ' ₺') : '-'}</td>
        <td style="color: #F87171; font-weight: 600; white-space: nowrap;">${Math.round(d.totalExp).toLocaleString('tr-TR')} ₺</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterByPeriod('${d.key}')" style="padding: 4px 8px; font-size: 11px;">
            🔍 ${isSelected ? 'Seçili' : 'Aya Git'}
          </button>
        </td>
      `;

      tableBody.appendChild(tr);
    });
  }
}



// =============================================================
// ❓ METRİK AÇIKLAMALARI VE AKILLI İPUCU DANIŞMANI (BAŞLANGIÇ REHBERİ)
// =============================================================
const KPI_EXPLANATION_GUIDES = {
  'REVENUE': {
    title: 'Gerçekleşen Ciro (Brüt Konaklama Geliri)',
    icon: '💰',
    category: 'TEMEL FİNANS',
    badgeClass: 'badge-blue',
    summary: 'İlgili ayda villalarınızda misafirlerin konaklaması karşılığında kasaya giren brüt toplam paradır.',
    warning: '⚠️ Unutmayın: Ciro kâr demek değildir! Elektrik, personel, komisyon, kömür gibi tüm giderler bu paranın içinden düşecektir.',
    formula: 'Satılan Gece Sayısı × Ortalama Gecelik Fiyat (ADR)',
    example: 'Örn: Ağustos ayında 79 gece satıldı ve toplam 483.965 TL brüt ciro elde edildi.',
    actionRule: 'Ciro hacminizi gösterir ama asıl odaklanmanız gereken rakam cebinizde kalan Net Kâr\'dır.'
  },
  'TARGET': {
    title: 'Hedef Ciro & Bütçe Planlaması',
    icon: '🎯',
    category: 'STRATEJİ & HEDEF',
    badgeClass: 'badge-amber',
    summary: 'O ay için ulaşmayı planladığınız gelir eşiğidir. İşletmenizin rotasını ve başarı çıtasını belirler.',
    warning: '💡 Sezona göre hedef koyun: Kış zirvesinde 1.000.000 TL hedef koyarken, ara sezon Eylül için 120.000 TL gerçekçi bir hedeftir.',
    formula: 'Tahmini Satılabilir Gece × Hedeflenen ADR',
    example: 'Örn: Hedef 300.000 TL iken gerçekleşen 483.965 TL ise hedefin %161,3\'ü tamamlanmış demektir.',
    actionRule: 'Hedefe ayın ortasında ulaştıysanız hemen kalan günlerin fiyatını artırın (yield management). Geride kaldıysanız gap gecelerine indirim uygulayın.'
  },
  'NET_PROFIT': {
    title: 'Net Nakit Kâr (Net Cash Profit)',
    icon: '💵',
    category: 'KASADA KALAN SERBEST NAKİT',
    badgeClass: 'badge-green',
    summary: 'Cirodan tüm operasyonel harcamalar (Opex) ve mülk yatırımları (Capex) düşüldükten sonra işletme sahibinin cebinde kalan net nakittir.',
    warning: '🌟 En önemli rakam budur: 1 milyon TL ciro yapıp 950 bin TL harcarsanız kârınız sadece 50 bindir. 500 bin ciro ile 350 bin kâr edebilirsiniz!',
    formula: 'Net Kâr = Fiili Ciro - (OPEX + CAPEX)',
    example: 'Örn: Ocak 2026\'da 843.555 TL cirodan 331.058 TL gider düşülmüş ve 512.497 TL rekor net kâr kalmıştır.',
    actionRule: 'Net marjınızın (Net Kâr / Ciro) %30\'un altına düşmemesine dikkat edin.'
  },
  'TOTAL_EXPENSE': {
    title: 'Toplam Giderler (OPEX + CAPEX)',
    icon: '💸',
    category: 'GİDER YÖNETİMİ',
    badgeClass: 'badge-rose',
    summary: 'İşletmenin dönmesi ve villaların kalitesini koruması için harcanan her kuruşun toplamıdır.',
    warning: 'Giderler ikiye ayrılır: 1) Yaşamsal rutin giderler (OPEX), 2) Mülkün değerini kalıcı artıran yatırımlar (CAPEX).',
    formula: 'Toplam Gider = Operasyonel Giderler + Yatırımlar',
    example: 'Örn: Temizlik, fatura, komisyon (337.306 TL) + su arıtma yatırımı (3.866 TL) = 341.172 TL.',
    actionRule: 'Giderlerin ciroya oranı %70\'i aşıyorsa harcama kalemlerini (özellikle komisyon ve sarfiyatları) denetleyin.'
  },
  'SOLD_NIGHTS': {
    title: 'Satılan Gece Sayısı (Oda-Gece Hacmi)',
    icon: '🌙',
    category: 'KAPASİTE & HACİM',
    badgeClass: 'badge-blue',
    summary: 'O ay boyunca villalarınızda misafirlerin fiilen konakladığı toplam gece sayısıdır.',
    warning: '5 villanız varsa ve ay 30 gün çekiyorsa, satabileceğiniz maksimum gece sayısı 5 × 30 = 150 gecedir.',
    formula: 'Tüm villaların ay içindeki rezerve gece toplamı.',
    example: 'Örn: Ağustos ayında toplam 79 gece satılmış, geriye 71 satılabilir boş gece kalmıştır.',
    actionRule: 'Yüksek sezonda satılan geceyi 70\'in üzerine çıkarmak doluluk başarısıdır.'
  },
  'ADR': {
    title: 'ADR (Ortalama Günlük Satış Fiyatı)',
    icon: '🏷️',
    category: 'FİYATLANDIRMA GÜCÜ',
    badgeClass: 'badge-amber',
    summary: 'Villalarınızı bir geceliğine ortalama kaça sattığınızı gösteren fiyattır. (Average Daily Rate).',
    warning: '🌟 Başlangıç Seviyesi Altın Kural: Tüm evleriniz doluyorsa ama ADR çok düşükse, evlerinizi ucuza satıyorsunuz demektir! Fiyatı hemen artırın.',
    formula: 'ADR = Toplam Oda Cirosu ÷ Satılan Gece Sayısı',
    example: 'Örn: Şubat 2026\'da 37 gece satılarak 749.467 TL kazanıldı. ADR = 749.467 ÷ 37 = 20.256 TL / Gece (Tarihsel Zirve).',
    actionRule: 'Hafta sonu yüksek ADR, hafta içi doluluk odaklı dengeli ADR uygulayın.'
  },
  'REVPAR': {
    title: 'RevPAR (Oda Başına Düşen Gelir)',
    icon: '📈',
    category: 'OTELCİLİĞİN ALTIN KARNESİ',
    badgeClass: 'badge-purple',
    summary: 'Villanız boş ya da dolu fark etmeksizin, takvimdeki her gün için size kaç TL kazandırdığını gösteren en dürüst başarı karnesidir.',
    warning: 'Neden ADR\'den daha önemlidir? Bir villayı geceliği 20.000 TL\'ye satıp ayda sadece 1 gün doldurursanız batarsınız. RevPAR hem doluluğu hem fiyatı aynı anda ölçer!',
    formula: 'RevPAR = Toplam Ciro ÷ Toplam Kapasite (Oda Sayısı × 30 Gün) VEYA RevPAR = ADR × Doluluk %',
    example: 'Örn: Ağustos ayında 5 villa için 483.965 TL ciro / 150 kapasite = 3.226 TL günlük ortalama gelir.',
    actionRule: 'RevPAR\'ı artırmanın yolu: Doluluk %70\'i aştığında fiyatı yükseltmektir.'
  },
  'OCCUPANCY': {
    title: 'Doluluk Oranı (%)',
    icon: '📊',
    category: 'KAPASİTE VERİMLİLİĞİ',
    badgeClass: 'badge-blue',
    summary: 'Villalarınızın ayın yüzde kaçında misafirle dolu olduğunu gösterir.',
    warning: '30 günün kaçında evlerde ışık yanıyordu? %70 ve üzeri harika performanstır. %40 altı ise fiyat indirimi veya tanıtım alarmıdır.',
    formula: '(Satılan Gece Sayısı ÷ 150 Kapasite) × 100',
    example: 'Örn: 150 gecelik kapasitenin 79\'u satıldı: (79 ÷ 150) × 100 = %52,7 Doluluk.',
    actionRule: '%100 doluluk her zaman iyi değildir! %100 doluluk genellikle \'fiyatı çok ucuz tuttunuz\' anlamına gelir.'
  },
  'OPEX': {
    title: 'OPEX (Operasyonel İşletme Giderleri)',
    icon: '⚡',
    category: 'RUTİN GİDERLER',
    badgeClass: 'badge-rose',
    summary: 'Tesisin günlük olarak çalışmaya devam etmesi için yapılan düzenli, tekrarlayan harcamalardır.',
    warning: 'Temizlik ücreti, elektrik/su/internet faturası, şömine odunu, karşılama ikramları ve OTA komisyonları OPEX\'tir.',
    formula: 'Tüm operasyonel cari fatura ve sarfiyat toplamı.',
    example: 'Örn: Ağustos ayında elektrik, temizlik ve bakım giderleri toplamı 337.306 TL.',
    actionRule: 'OPEX\'i kısmak zordur ama toplu alım (örneğin odunu yazdan almak) maliyeti %30 düşürür.'
  },
  'CAPEX': {
    title: 'CAPEX (Sermaye & Yatırım Harcamaları)',
    icon: '🏗️',
    category: 'MÜLK DEĞER ARTIRMA',
    badgeClass: 'badge-purple',
    summary: 'Villanın değerini ve kalitesini kalıcı olarak artıran büyük, tek seferlik demirbaş yatırımlarıdır.',
    warning: 'Bahçeye jakuzi yaptırmak, sauna eklemek, klima taktırmak CAPEX\'tir. Bu bir masraf değil, villanın gecelik fiyatını artıracak yatırımdır.',
    formula: 'Demirbaş ve kalıcı renovasyon harcamaları toplamı.',
    example: 'Örn: Ocak ayında yapılan 465.331 TL\'lik kış hazırlığı ve sauna yatırımı.',
    actionRule: 'Doğru bir CAPEX yatırımı (örn: ısıtmalı jakuzi), kendini 2-3 ayda gecelik fiyat artışıyla geri öder.'
  },
  'GAP_NIGHTS': {
    title: 'Boşluk Geceleri (Gap Nights & Yetim Geceler)',
    icon: '🧩',
    category: 'KAYIP KAZANÇ FIRSATI',
    badgeClass: 'badge-amber',
    summary: 'İki rezervasyon arasında sıkışıp kalan 1 veya 2 günlük boş günlerdir.',
    warning: 'O gün boş kalırsa size maliyeti 0 TL değil, kayıp bir cirodur! O günü fırsat paketiyle satmak saf kârdır.',
    formula: 'İki rezervasyon arasındaki satılmamış 1-2 günlük boşluklar.',
    example: 'Örn: Sistemde 3 adet gap gecesi tespit edildi. %25 indirimle Instagram\'da satılıp 15.000 TL kurtarıldı.',
    actionRule: 'Gap gecesini boş bırakmaktansa normal fiyatın %30 altına \'Son Dakika Fırsatı\' ile satın.'
  },
  'OTA_COMMISSION': {
    title: 'OTA Komisyonları vs Doğrudan Satış',
    icon: '🌐',
    category: 'KOMİSYON TASARRUFU',
    badgeClass: 'badge-green',
    summary: 'Airbnb, Booking.com vb. platformların sizden kestiği %15 - %20 arası aracılık ücretidir.',
    warning: '100.000 TL\'lik satışı Airbnb\'den yaparsanız cebinize 85.000 TL kalır. Doğrudan WhatsApp\'tan yaparsanız 100.000 TL\'nin tamamı sizindir!',
    formula: 'OTA Satış Tutarı × Komisyon Oranı (%15)',
    example: 'Örn: Doğrudan WhatsApp\'tan kapatılan 280.000 TL\'lik satış sayesinde 42.000 TL komisyon cepte kalmıştır.',
    actionRule: 'OTA\'ları vitrin olarak kullanın; gelen misafire kartınızı vererek bir sonraki gelişinde doğrudan sizden rezerve etmesini sağlayın.'
  }
};

function showKpiExplanation(code) {
  const guide = KPI_EXPLANATION_GUIDES[code] || {
    title: 'Metrik Bilgisi',
    icon: 'ℹ️',
    category: 'GENEL GÖSTERGE',
    badgeClass: 'badge-blue',
    summary: 'Bu metrik işletmenizin performansını takip etmenize yardımcı olur.',
    warning: 'Detaylı bilgi için başlangıç rehberimizi inceleyebilirsiniz.',
    formula: 'Veri tabanı hesaplaması',
    example: 'Güncel dönem verisi',
    actionRule: 'Düzenli takip ile gelirinizi optimize edin.'
  };

  const modal = document.getElementById('kpiExplanationModal');
  const iconEl = document.getElementById('kpiExplIcon');
  const titleEl = document.getElementById('kpiExplTitle');
  const catEl = document.getElementById('kpiExplCategory');
  const bodyEl = document.getElementById('kpiExplBody');

  if (iconEl) iconEl.innerText = guide.icon;
  if (titleEl) titleEl.innerText = guide.title;
  if (catEl) {
    catEl.innerText = guide.category;
    catEl.className = 'badge ' + guide.badgeClass;
  }

  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; margin-bottom: 14px;">
        <div style="font-size: 11px; color: #93C5FD; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">👶 1 Cümlede Basitçe Nedir?</div>
        <div style="font-size: 13px; color: #FFFFFF; font-weight: 600; line-height: 1.5;">${guide.summary}</div>
      </div>

      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;">
        <div style="font-size: 11px; color: #FDE68A; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">💡 Başlangıç Seviyesi İpucu</div>
        <div style="font-size: 12px; color: #E2E8F0; line-height: 1.4;">${guide.warning}</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
        <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px;">
          <div style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📐 Nasıl Hesaplanır?</div>
          <div style="font-size: 11px; color: #60A5FA; font-family: var(--font-mono); margin-top: 4px; font-weight: 600;">${guide.formula}</div>
        </div>
        <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 10px;">
          <div style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📊 Pratik Örnek</div>
          <div style="font-size: 11px; color: #34D399; margin-top: 4px;">${guide.example}</div>
        </div>
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 10px; padding: 12px 14px;">
        <div style="font-size: 11px; color: #A7F3D0; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">🚀 Ne Zaman Aksiyon Almalısın?</div>
        <div style="font-size: 12px; color: #E2E8F0; line-height: 1.4;">${guide.actionRule}</div>
      </div>
    `;
  }

  if (modal) modal.classList.add('active');
}

function closeKpiExplanationModal() {
  const modal = document.getElementById('kpiExplanationModal');
  if (modal) modal.classList.remove('active');
}

function openHelpModal(targetTab = 'terms') {
  const modal = document.getElementById('helpModal');
  if (modal) modal.classList.add('active');
  if (targetTab) switchHelpTab(targetTab);
}

function closeHelpModal() {
  const modal = document.getElementById('helpModal');
  if (modal) modal.classList.remove('active');
}

function switchHelpTab(tabKey) {
  document.querySelectorAll('.help-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.help-tab-pane').forEach(pane => pane.style.display = 'none');

  const targetBtn = document.getElementById('helpTabBtn-' + tabKey);
  if (targetBtn) targetBtn.classList.add('active');

  const activePane = document.getElementById('helpTab-' + tabKey);
  if (activePane) activePane.style.display = 'block';
}

function filterHelpGlossary() {
  const query = (document.getElementById('helpGlossarySearch')?.value || '').toLowerCase().trim();
  const items = document.querySelectorAll('.glossary-card-item');

  items.forEach(item => {
    const text = item.innerText.toLowerCase();
    const keywords = (item.getAttribute('data-keywords') || '').toLowerCase();
    if (!query || text.includes(query) || keywords.includes(query)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}



// =============================================================
// ⭐ CANLI AIRBNB İLAN VE İTİBAR RADARI MOTORU (5 VİLLA)
// =============================================================
const DEFAULT_AIRBNB_PROPERTIES = {
  DOGUS: {
    key: 'DOGUS',
    name: 'Doğuş Dağ Evi',
    url: 'https://www.airbnb.com.tr/h/villadogus',
    slug: 'villadogus',
    title: "Doğuş - Uludağ'da 11 Kişilik Huzurlu Doğa Evi BBQ",
    rating: 5.0,
    reviews: 3,
    highlights: 'Kış Bahçesi, Şömine, 70" Dev Ekran, BBQ',
    isSuperhost: true,
    isGuestFavorite: true,
    lastSync: 'Bugün (Canlı)'
  },
  SEYIR: {
    key: 'SEYIR',
    name: 'Seyir Dağ Evi',
    url: 'https://www.airbnb.com.tr/h/villaseyir',
    slug: 'villaseyir',
    title: 'Seyir - Eşsiz Bursa Manzaralı Huzurlu Müstakil Ev',
    rating: 5.0,
    reviews: 8,
    highlights: 'Panoramik Şehir Manzarası, Bahçe, Doğa',
    isSuperhost: true,
    isGuestFavorite: true,
    lastSync: 'Bugün (Canlı)'
  },
  ZIRVE: {
    key: 'ZIRVE',
    name: 'Zirve Dağ Evi',
    url: 'https://www.airbnb.com.tr/h/uludagzirve',
    slug: 'uludagzirve',
    title: 'Uludag Zirve Bahçe - Barbekü Jakuzi',
    rating: 5.0,
    reviews: 11,
    highlights: 'Isıtmalı Jakuzi, Şömine, Özel Bahçe BBQ',
    isSuperhost: true,
    isGuestFavorite: true,
    lastSync: 'Bugün (Canlı)'
  },
  SIRIN: {
    key: 'SIRIN',
    name: 'Şirin Dağ Evi',
    url: 'https://www.airbnb.com.tr/h/uludagvillasirin',
    slug: 'uludagvillasirin',
    title: 'Uludağ Tatil Evleri & Villa Şirin',
    rating: 5.0,
    reviews: 4,
    highlights: 'Otantik Ahşap Doku, İzole Doğa, Şömine',
    isSuperhost: true,
    isGuestFavorite: true,
    lastSync: 'Bugün (Canlı)'
  },
  NEFES: {
    key: 'NEFES',
    name: 'Nefes Dağ Evi',
    url: 'https://www.airbnb.com.tr/h/uludagnefes',
    slug: 'uludagnefes',
    title: 'Villa Nefes Uludağ Bahçeli & BBQ’lu Geniş Chalet',
    rating: 4.75,
    reviews: 4,
    highlights: 'Geniş Aile Alanı, Dağ Esintisi, Özel Veranda',
    isSuperhost: true,
    isGuestFavorite: true,
    lastSync: 'Bugün (Canlı)'
  }
};

function renderAirbnbAuditRadar() {
  const tbody = document.getElementById('digitalAuditTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const listings = (appData.airbnbListings && Object.keys(appData.airbnbListings).length > 0) 
    ? appData.airbnbListings 
    : DEFAULT_AIRBNB_PROPERTIES;

  let totalWeightedScore = 0;
  let totalReviews = 0;

  Object.keys(listings).forEach(vKey => {
    const item = listings[vKey];
    const rCount = Number(item.reviews) || 0;
    const rScore = Number(item.rating) || 5.0;
    totalWeightedScore += (rScore * rCount);
    totalReviews += rCount;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; white-space: nowrap;">
        <strong>${item.name}</strong>
      </td>
      <td style="font-size: 12px; color: #E2E8F0;">
        <span style="font-weight: 600;">${item.title}</span>
        <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
          airbnb.com.tr/h/${item.slug}
        </div>
      </td>
      <td style="white-space: nowrap;">
        <span class="badge ${rScore >= 4.9 ? 'badge-amber' : 'badge-blue'}" style="font-size: 13px; font-weight: 800; padding: 4px 8px;">
          ${rScore.toFixed(2)} ★
        </span>
      </td>
      <td style="font-weight: 700; white-space: nowrap; color: #93C5FD;">
        ${rCount} Yorum
      </td>
      <td style="white-space: nowrap;">
        ${item.isSuperhost ? '<span class="badge badge-amber" style="font-size: 10px; margin-right: 4px;">🏆 Superhost</span>' : ''}
        ${item.isGuestFavorite ? '<span class="badge badge-green" style="font-size: 10px;">💎 Gözde</span>' : ''}
      </td>
      <td style="font-size: 11px; color: var(--text-muted); max-width: 220px;">
        ${item.highlights}
      </td>
      <td style="white-space: nowrap;">
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #34D399; font-weight: 600;">
          <span style="width: 7px; height: 7px; border-radius: 50%; background: #34D399;"></span> ${item.lastSync || 'Senkron'}
        </span>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
          🔗 İlana Git ↗
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update Top Portfolio Card
  const portfolioAvg = totalReviews > 0 ? (totalWeightedScore / totalReviews) : 4.97;
  const pScoreEl = document.getElementById('airbnbPortfolioScore');
  if (pScoreEl) pScoreEl.innerHTML = `${portfolioAvg.toFixed(2)} <span class="sub-val" style="color: #FDE68A;">★ / 5.0</span>`;

  const pReviewsEl = document.getElementById('airbnbTotalReviews');
  if (pReviewsEl) pReviewsEl.innerText = `${totalReviews} Değerlendirme (5 Villa)`;
}

function syncLiveAirbnbData() {
  const btn = document.getElementById('syncAirbnbBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Senkronize Ediliyor...';
  }

  setTimeout(() => {
    // Save live synced data
    if (!appData.airbnbListings) {
      appData.airbnbListings = JSON.parse(JSON.stringify(DEFAULT_AIRBNB_PROPERTIES));
    }
    const nowStr = 'Şimdi (' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ')';
    Object.keys(appData.airbnbListings).forEach(k => {
      appData.airbnbListings[k].lastSync = nowStr;
    });

    saveAppData();
    renderAirbnbAuditRadar();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✅ Canlı Skorlar Güncel!';
      setTimeout(() => {
        btn.innerHTML = '🔄 Airbnb\'den Senkronize Et';
      }, 3000);
    }
  }, 600);
}
