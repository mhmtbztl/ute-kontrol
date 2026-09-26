
const DEFAULT_CLEANING_TASKS = [];

// -----------------------------------------------------------------------------
// CENTRAL HTML SINK HARDENING
// -----------------------------------------------------------------------------
// Legacy modules still build trusted layout fragments with innerHTML. Install a
// narrow sanitizer at the browser boundary so values coming from Supabase can
// never introduce executable markup while those layouts are migrated to DOM APIs.
function installInnerHtmlSecurityBoundary() {
  if (typeof Element === 'undefined' || typeof document === 'undefined') return;
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  if (!descriptor || !descriptor.set || Element.prototype.__lexbnbHtmlGuard) return;

  const forbiddenTags = new Set([
    'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'BASE', 'META', 'LINK', 'FORM',
    'MATH', 'SVG', 'TEMPLATE'
  ]);
  // L-15 adim 3: uygulama satir ici isleyici kullanmaz; dugmeler data-on*
  // ozniteligi ve core/action_dispatch.js yetkilendiricisiyle calisir (govde
  // ayristirilir, izinli eylem listesi disinda hicbir sey cagrilamaz). Bu
  // yuzden HER on* ozniteligi silinir. CSP de satir ici betigi reddeder;
  // bu ikinci kattir (ornegin CSP'yi desteklemeyen bir gomulu goruntuleyici).
  function sanitizeHtml(value) {
    const template = document.createElement('template');
    descriptor.set.call(template, String(value == null ? '' : value));
    template.content.querySelectorAll('*').forEach(node => {
      if (forbiddenTags.has(node.tagName)) {
        node.remove();
        return;
      }
      Array.from(node.attributes || []).forEach(attr => {
        const name = attr.name.toLowerCase();
        const val = String(attr.value || '').trim();
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
          return;
        }
        if (['href', 'src', 'xlink:href', 'formaction'].includes(name) &&
            /^(?:javascript|vbscript|data):/i.test(val)) node.removeAttribute(attr.name);
        if (name === 'srcdoc' || (name === 'style' && /(?:url\s*\(|expression\s*\(|@import)/i.test(val))) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return descriptor.get.call(template);
  }

  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) { descriptor.set.call(this, sanitizeHtml(value)); }
  });
  Object.defineProperty(Element.prototype, '__lexbnbHtmlGuard', { value: true });
}

installInnerHtmlSecurityBoundary();

// data-on* isleyicisine giren dize (L-15 adim 3, core/action_dispatch.js).
// encodeURIComponent tek tirnagi kodlamaz; sablonlar bunu kullanir.
function getLexbnbActions() {
  if (typeof window !== 'undefined' && window.LexbnbActions) return window.LexbnbActions;
  if (typeof require === 'function') {
    try { return require('./core/action_dispatch.js'); } catch (e) { /* tarayici */ }
  }
  return null;
}

function encodeActionArg(deger) {
  const A = getLexbnbActions();
  if (!A) throw new Error('core/action_dispatch.js yuklenmedi');
  return A.encodeActionArg(deger);
}


// =============================================================
// GÜVENLİK VE GİZLİ ERİŞİM YÖNETİMİ (SECURITY & AUTH SHIELD)
// =============================================================
// NOT: Sabit kodlu master PIN'ler ve '?key=' ile paylasilan gizli erisim linki
// kaldirildi. Kimlik dogrulamanin tek kaynagi Supabase Auth'tur.

// Supabase Auth panelindeki "Minimum password length" ile ayni olmali (uretim: 10).
// Istemci daha dusuk sorarsa 6-9 karakterlik sifre on kontrolden gecip sunucuda reddedilir.
const AUTH_MIN_PASSWORD_LENGTH = 10;

// Kullaniciya giden hata metni (L-22, core/user_facing_errors.js).
function getUserFacingErrors() {
  if (typeof UserFacingErrors !== 'undefined') return UserFacingErrors;
  if (typeof window !== 'undefined' && window.UserFacingErrors) return window.UserFacingErrors;
  if (typeof require === 'function') {
    try { return require('./core/user_facing_errors.js'); } catch (e) { /* tarayici */ }
  }
  return null;
}

function kullaniciMesaji(metin) {
  const U = getUserFacingErrors();
  return U ? U.sanitizeUserMessage(metin) : metin;
}

function getFriendlyAuthErrorMessage(err) {
  if (!err) return 'Bir hata oluştu. Lütfen tekrar deneyin.';
  const msg = typeof err === 'string' ? err : (err.message || '');
  if (msg.includes('Invalid login credentials')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'E-posta adresinizi doğrulamanız gerekiyor. Lütfen gelen kutunuzdaki aktivasyon bağlantısına tıklayın.';
  }
  if (msg.includes('User already registered') || msg.includes('already registered')) {
    return 'Bu e-posta adresi ile kayıtlı bir hesap zaten var. Lütfen giriş yapın.';
  }
  const minLen = msg.match(/at least (\d+) characters/);
  if (minLen) {
    return `Şifreniz en az ${minLen[1]} karakter olmalıdır.`;
  }
  if (/captcha/i.test(msg)) {
    return 'Güvenlik doğrulaması tamamlanamadı. Formun altındaki doğrulama kutusunun onaylanmasını bekleyip tekrar deneyin. Reklam engelleyici kullanıyorsanız challenges.cloudflare.com adresine izin verin.';
  }
  if (msg.includes('rate limit') || msg.includes('Too many requests') || msg.includes('over_email_send_rate_limit')) {
    return 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('NetworkError') || msg.includes('FetchError')) {
    return 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.';
  }
  if (msg.includes('tenant') || msg.includes('create_tenant_and_owner')) {
    return 'İşletme kurulumu tamamlanamadı. Lütfen tekrar deneyin.';
  }
  // Taninmayan sunucu mesaji ham gosterilmez (L-22): ayrinti konsola, ekrana
  // anlasilir cumle ve basvuru kodu.
  if (!msg) return 'İşlem sırasında bir hata oluştu.';
  const U = getUserFacingErrors();
  if (U && U.isTechnical(msg)) return U.sanitizeUserMessage(msg);
  if (/^[\x00-\x7F]*$/.test(msg)) {
    // Supabase Auth'un Ingilizce ve taninmayan mesaji: ayrinti konsola.
    console.error('[Lexbnb giris hatasi]', msg);
    return 'İşlem tamamlanamadı. Lütfen bilgilerinizi kontrol edip tekrar deneyin.';
  }
  return msg;
}

// Turnstile belirteci (core/captcha_gate.js). Modul ya da kutucuk yoksa null
// doner ve istek belirtecsiz gider: hakem Supabase'dir, istemci formu kilitlemez.
async function getAuthCaptchaToken(formId) {
  if (typeof window === 'undefined' || !window.LexbnbCaptcha) return null;
  try {
    return await window.LexbnbCaptcha.getToken(formId);
  } catch (e) {
    return null;
  }
}

// Belirtec tek kullanimliktir; her gonderimden sonra kutucuk yenilenir.
function consumeAuthCaptcha(formId) {
  if (typeof window === 'undefined' || !window.LexbnbCaptcha) return;
  window.LexbnbCaptcha.consume(formId);
}

async function checkAuthStatus() {
  // 0. Sifre sifirlama linkiyle gelindiyse: recovery session'i uygulamaya
  //    sokma, once yeni sifre belirlet.
  if (isPasswordRecoveryRedirect()) {
    if (typeof getBlankTenantData === 'function') {
      appData = getBlankTenantData('guest');
    }
    showNewPasswordForm();
    return false;
  }

  // 1. Supabase Cloud Session'i geri yukle (Source of Truth)
  if (supabaseClient && window.checkCloudSession) {
    const restored = await window.checkCloudSession();
    if (restored) return true;
  }

  // 2. Authenticated session yoksa LocalStorage'dan sahte/eski veri yükleme
  if (typeof getBlankTenantData === 'function') {
    appData = getBlankTenantData('guest');
  }
  showLockOverlay();
  return false;
}

function showLockOverlay() {
  const overlay = document.getElementById('securityLockOverlay');
  if (overlay) {
    setApplicationInert(true);
    overlay.style.display = 'flex';
    setTimeout(() => {
      const emailInput = document.getElementById('saasLoginUser');
      if (emailInput) emailInput.focus();
    }, 100);
  }
}

function hideLockOverlay() {
  const overlay = document.getElementById('securityLockOverlay');
  if (overlay) overlay.style.display = 'none';
  setApplicationInert(false);
}

function setApplicationInert(locked) {
  if (typeof document === 'undefined' || !document.body) return;
  const overlay = document.getElementById('securityLockOverlay');
  Array.from(document.body.children).forEach(element => {
    if (element !== overlay && 'inert' in element) element.inert = !!locked;
  });
  if (overlay && 'inert' in overlay) overlay.inert = false;
}

function wireAccessibleFormLabels() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.form-group').forEach(group => {
    const label = group.querySelector('label');
    const control = group.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (!label || !control || !control.id || label.contains(control)) return;
    if (!label.htmlFor) label.htmlFor = control.id;
  });
}

// LEXBNB KONTROL MERKEZİ - EXECUTIVE STR CONTROL & REVENUE MANAGEMENT ENGINE
// Çok kiracılı (multi-tenant) ticari SaaS. Portföy her müşteriye özeldir ve
// Supabase'den yüklenir; uygulamada sabit villa listesi bulunmaz.

// Backwards compatibility aliases for tests and internal keys

// OTA ilan analizi modulu eskiden 5 villalik demo portfoyu gosteriyordu.
// Ilan verisi (airbnbListings) tenant bazlidir; uygulamada sabit ilan sozlugu
// bulunmaz. Eskiden DEFAULT_AIRBNB_PROPERTIES bes uydurma villanin ilan
// puanini/siralamasini tasiyordu.

/**
 * Serbest yazilmis bir gider kategorisini bilinen kategorilerden birine esler.
 *
 * Karsilastirma buyuk-kucuk harf ve Turkce karakter duyarsizdir: dosyadan
 * gelen "TEMİZLİK", "temizlik", "Temizlik" hepsi ayni kovaya duser.
 * Eslesme yoksa "Diğer".
 */
function eslesenGiderKategorisi(ham) {
  const t = String(ham || '').trim();
  if (!t) return 'Diğer';
  const sadelestir = s => String(s).toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
  const hedef = sadelestir(t);
  const bulunan = EXPENSE_CATEGORIES.find(c => sadelestir(c.name) === hedef);
  if (bulunan) return bulunan.name;
  // Yaygin kisaltmalar
  if (hedef === 'kkarti' || hedef === 'kredikarti' || hedef === 'komisyon') return 'Kredi Kartı / Komisyon';
  return 'Diğer';
}

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


// App State Container
let appData = {
  isCleanState: false,
  villas: {},
  targets: {},
  bookings: [],
  expenses: [],
  leads: [],
  maintenance: []
};

// Global Active Filter
// Baslangic donemi: icinde bulunulan ay. Sabit '2026-09' yaziliydi; takvim
// ilerledikce uygulama gecmis bir ayi "guncel" gostermeye devam ederdi.
// Tarayicinin yerel saati DEGIL getTodayStr() kullanilir: kayitlar
// Europe/Istanbul gunune yaziliyor, filtre baska bir gune bakarsa ay
// sinirinda kullanici az once girdigi kaydi goremez.
let currentFilter = (() => {
  const bugun = getTodayStr();
  const y = Number(bugun.slice(0, 4));
  const ay = Number(bugun.slice(5, 7));
  const donem = bugun.slice(0, 7);
  const sonGun = new Date(Date.UTC(y, ay, 0)).getUTCDate();
  return {
    period: donem,
    villa: 'ALL',
    startDate: `${donem}-01`,
    endDate: `${donem}-${String(sonGun).padStart(2, '0')}`
  };
})();

let activeTrendRange = '6M';
let propertyViewMode = 'table'; // 'table' or 'cards'

// Initialize and Load Data

// =============================================================
// REZERVASYON TEMİZLİK GÖREVLERİ SENKRONİZASYONU
// =============================================================
function normalizeCleaningTask(source, villasOrPropertyMap) {
  const task = source || {};
  const propertyId = task.propertyId || task.property_id || null;
  const rawId = task.id || task.legacyId || task.legacy_id || '';
  const dbIdCandidate = task.dbId || task.db_id || rawId;
  const dbId = isUUID(dbIdCandidate) ? dbIdCandidate : (isUUID(rawId) ? rawId : null);
  const legacyId = task.legacyId || task.legacy_id || (!isUUID(rawId) ? rawId : null);
  const context = villasOrPropertyMap || {};

  let villa = task.villa || '';
  if (!villa && propertyId) {
    if (typeof context[propertyId] === 'string') {
      villa = context[propertyId];
    } else {
      const match = Object.entries(context).find(([, property]) => property && property.id === propertyId);
      if (match) villa = match[0];
    }
  }

  const property = villa && context[villa] && typeof context[villa] === 'object'
    ? context[villa]
    : null;
  const paid = Object.prototype.hasOwnProperty.call(task, 'paid')
    ? !!task.paid
    : !!task.is_paid;
  const notes = task.notes ?? task.desc ?? task.description ?? '';
  // Durum (K-04, phase45): planlandi / yapildi / yapilmadi. Durumu olmayan
  // kayit sunucunun gecmis veri eslemesiyle ayni kurala baglanir: odenmisse
  // yapilmistir, degilse bilinmiyor (PLANNED) — uydurulmaz.
  const rawStatus = String(task.status || '').toUpperCase();
  const status = ['PLANNED', 'DONE', 'SKIPPED'].includes(rawStatus) ? rawStatus : (paid ? 'DONE' : 'PLANNED');

  return {
    id: dbId || rawId || legacyId || '',
    dbId: dbId || null,
    legacyId: legacyId || null,
    bookingId: task.bookingId || task.booking_id || null,
    propertyId,
    villa,
    propertyName: task.propertyName || property?.name || villa || 'Mülk belirtilmedi',
    guest: task.guest || '',
    date: task.date || task.task_date || '',
    cleaner: task.cleaner ?? task.cleaner_name ?? '',
    amount: Number(task.amount) || 0,
    paid,
    paidDate: task.paidDate || task.paid_date || null,
    status,
    completedAt: task.completedAt || task.completed_at || null,
    notes,
    paymentLabel: paid ? 'Ödendi' : (status === 'DONE' ? 'Ödenecek' : (status === 'SKIPPED' ? 'Yapılmadı' : 'Planlandı'))
  };
}

// KULLANICI TALEBİ: Gider Defteri'ne ASLA otomatik temizlik gideri EKLENMEZ!
// Gider Defteri %100 kullanıcının manuel kontrolündedir. Kullanıcı bir gideri
// sildiğinde o gider kalıcı olarak silinir, arka plandan tekrar oluşturulmaz.
function syncBookingCleaningTasks() {
  if (!appData.cleaningTasks) appData.cleaningTasks = [];
  if (!appData.bookings) appData.bookings = [];
  // Bos bir gider defteri BOS KALIR (eskiden 271.900 TL demo gideri enjekte
  // ediliyordu, bkz. git gecmisi).
  if (!appData.expenses) appData.expenses = [];

  // Eski mükerrer/çift manuel gider kayıtlarını ayıkla (sadece tekil EXP-CLEAN- kalsın)
  appData.expenses = appData.expenses.filter(e => !e.isAutoClean && !(e.id && e.id.startsWith('EXP-CLEAN-MANUAL-')));

  // Bir zamanlar bu fonksiyon her rezervasyon icin BELLEKTE bir temizlik
  // gorevi uyduruyordu: maliyet girilmemisse misafirden alinan UCRETI maliyet
  // sayiyor (1.500 TL alip 1.200 odeyen isletmede kar ve borc ayni anda
  // yanlis) ve gorevi veritabanina hic yazmiyordu. Odendi denince booking_id'siz
  // yazilan gorev yeniden yuklemede rezervasyonla eslesmiyor, ayni temizlik
  // yeniden borc doguyordu (L-27, L-28).
  //
  // Artik gorev rezervasyon KAYDEDILIRKEN veritabanina yazilir
  // (syncBookingCleaningTaskToCloud). Burada yalniz formda gosterilecek
  // maliyet bagli gorevden geri okunur; gorev yoksa maliyet BILINMIYOR.
  appData.bookings.forEach(b => {
    const bagli = findBookingCleaningTask(b);
    if (b.cleanCost === undefined || b.cleanCost === null) {
      b.cleanCost = bagli && Number(bagli.amount) > 0 ? Number(bagli.amount) : null;
    }
  });

  appData.cleaningTasks = appData.cleaningTasks.map(task => normalizeCleaningTask(task, appData.villas));
}

/**
 * Rezervasyonun odeme komisyonu (POS / sanal POS). Ayri tablo:
 * booking_payment_commissions (phase45). 0 girilirse satir silinir.
 * Donus: kullaniciya gosterilecek uyari metni ('' = sorun yok).
 */
async function saveBookingPaymentCommission(booking, amount) {
  if (!booking || !isUUID(booking.id) || !isCloudTenant(getActiveTenantId())) return '';
  const tutar = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100);
  const onceki = Number(booking.paymentCommission) || 0;
  if (tutar === onceki) return '';
  const tenantId = getActiveTenantId();
  try {
    requireCloudForWrite('Ödeme komisyonu', tenantId);
    const sorgu = tutar > 0
      ? supabaseClient.from('booking_payment_commissions')
          .upsert({ booking_id: booking.id, tenant_id: tenantId, amount: tutar }, { onConflict: 'booking_id' })
      : supabaseClient.from('booking_payment_commissions').delete()
          .match({ booking_id: booking.id, tenant_id: tenantId });
    const { error } = await sorgu;
    if (error) {
      if (isMissingSchemaError(error)) {
        return '\n\nRezervasyon kaydedildi; ödeme komisyonu için veritabanı güncellemesi (phase45) henüz uygulanmamış.';
      }
      throw error;
    }
    booking.paymentCommission = tutar;
    const bellek = (appData.bookings || []).find(b => b.id === booking.id);
    if (bellek) bellek.paymentCommission = tutar;
    return '';
  } catch (err) {
    return '\n\nRezervasyon kaydedildi; ancak ödeme komisyonu yazılamadı: ' + (err?.message || 'veritabanı hatası');
  }
}

/** Rezervasyonun temizlik gorevi: booking_id ya da rezervasyondan tureyen yerel anahtar. */
function findBookingCleaningTask(b) {
  if (!b) return null;
  const anahtar = 'TASK-CLN-' + b.id;
  return (appData.cleaningTasks || []).find(t =>
    (t.bookingId && t.bookingId === b.id) || t.legacyId === anahtar || t.id === anahtar) || null;
}

/**
 * Rezervasyon kaydinin temizlik gorevini veritabanina yazar (L-27, L-28).
 *
 * Gider YAZMAZ (K-04): gorev PLANNED acilir; gider temizlik "yapildi"
 * denince dogar. Maliyet girilmemisse gorev tutarsiz acilir; misafirden
 * alinan ucret maliyet diye KOPYALANMAZ.
 *
 *   iptal edilen rezervasyon   -> planli gorev YAPILMADI olur
 *   yapilmis gorev             -> tarih/tutar degistirilmez, kullaniciya soylenir
 *   diger                      -> tarih = cikis gunu, tutar = girilen maliyet
 *
 * Donus: kullaniciya gosterilecek uyari metni ('' = sorun yok). Hata
 * firlatmaz; rezervasyon zaten kaydedildi, gorev yazilamadiysa bu soylenir.
 */
async function syncBookingCleaningTaskToCloud(booking, cleanCost) {
  if (!booking || !isUUID(booking.id) || !isCloudTenant(getActiveTenantId())) return '';
  const maliyet = cleanCost === null || cleanCost === undefined || cleanCost === '' ? null : Number(cleanCost);
  const mevcut = findBookingCleaningTask(booking);
  const iptal = String(booking.status || '').toUpperCase() === 'CANCELLED';
  try {
    if (mevcut) {
      if (mevcut.status === 'DONE') {
        const tutarFarkli = maliyet !== null && Number(mevcut.amount) !== maliyet;
        if (iptal) return '\n\nNot: Bu rezervasyonun temizliği yapıldı olarak işaretli; iptal temizlik giderini değiştirmedi.';
        return tutarFarkli
          ? '\n\nNot: Temizlik yapıldı olarak işaretli; maliyeti temizlik defterinden değiştirin.'
          : '';
      }
      if (iptal) {
        if (mevcut.status === 'PLANNED') {
          mevcut.status = 'SKIPPED';
          await persistCleaningLedgerEntry(mevcut);
        }
        return '';
      }
      mevcut.bookingId = booking.id;
      mevcut.villa = booking.villa;
      mevcut.guest = booking.guest;
      mevcut.date = booking.checkOut;
      if (maliyet !== null) mevcut.amount = maliyet;
      // Yeniden etkinlesen rezervasyonun "yapilmadi" gorevi yeniden planlanir.
      if (mevcut.status === 'SKIPPED') mevcut.status = 'PLANNED';
      await persistCleaningLedgerEntry(mevcut);
      upsertCleaningTaskInMemory(mevcut);
      return '';
    }
    if (iptal) return '';
    const vName = appData.villas?.[booking.villa]?.name || booking.villa;
    const gorev = normalizeCleaningTask({
      id: 'TASK-CLN-' + booking.id,
      bookingId: booking.id,
      villa: booking.villa,
      guest: booking.guest,
      date: booking.checkOut,
      cleaner: '',
      amount: maliyet || 0,
      paid: false,
      status: 'PLANNED',
      notes: `${booking.guest} Çıkış Temizliği (${vName})`
    }, appData.villas || {});
    await persistCleaningLedgerEntry(gorev);
    upsertCleaningTaskInMemory(gorev);
    return '';
  } catch (err) {
    return '\n\nRezervasyon kaydedildi; ancak temizlik görevi yazılamadı: ' + (err?.message || 'veritabanı hatası');
  }
}

function saveAppData() {
  invalidateExecutiveSnapshotCache();
  if (typeof localStorage === 'undefined') return;
  const uId = (activeSaaSUser && activeSaaSUser.id) ? activeSaaSUser.id : 'usr_ute_master';
  try {
    // Postgres is the sole business-data source. Remove legacy caches containing
    // guest PII and financial records instead of refreshing them indefinitely.
    localStorage.removeItem('LEXBNB_DATA_' + uId);
    localStorage.removeItem('LEXBNB_V5_MASTER_DATA');
  } catch (err) {
    console.error('Error removing legacy tenant cache:', err);
  }
}

// -------------------------------------------------------------
// 🌐 ENTITY-BASED SUPABASE CLOUD MUTATIONS & CRUD (PHASE 4)
// -------------------------------------------------------------
function isUUID(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// Bulut yolu YALNIZCA gercek bir Supabase UUID tenant'i icin acilir (whitelist).
// 'usr_*' demo ve 'ten_*' gibi yerel kimlikler asla Postgres'e gonderilmez.
function isCloudTenant(tenantId) {
  return !!(supabaseClient && isUUID(tenantId));
}

function clearLexbnbBrowserStorage() {
  if (typeof localStorage !== 'undefined') {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('LEXBNB_')) localStorage.removeItem(key);
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('LEXBNB_')) sessionStorage.removeItem(key);
    }
  }
}

const CLOUD_PAGE_SIZE = 500;

async function fetchAllCloudRows(buildQuery, pageSize = CLOUD_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

const DEFAULT_BOOKING_CHANNELS = Object.freeze([
  { code: 'WHATSAPP', displayName: 'WhatsApp', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true, isSystem: true },
  { code: 'AIRBNB', displayName: 'Airbnb', channelType: 'OTA', defaultCommissionRate: 15, isActive: true, isSystem: true },
  { code: 'BOOKING', displayName: 'Booking.com', channelType: 'OTA', defaultCommissionRate: 18, isActive: true, isSystem: true },
  { code: 'INSTAGRAM', displayName: 'Instagram', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true, isSystem: true },
  { code: 'WEBSITE', displayName: 'Website', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true, isSystem: true },
  { code: 'REPEAT', displayName: 'Tekrar Misafir', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true, isSystem: true },
  { code: 'PHONE', displayName: 'Telefon', channelType: 'DIRECT', defaultCommissionRate: 0, isActive: true, isSystem: true }
]);

function mapBookingChannelFromDb(row) {
  return {
    id: row.id || null,
    tenantId: row.tenant_id || null,
    code: String(row.code || '').toUpperCase(),
    displayName: row.display_name || row.code || 'Kanal',
    channelType: row.channel_type === 'OTA' ? 'OTA' : 'DIRECT',
    defaultCommissionRate: Math.max(0, Math.min(100, Number(row.default_commission_rate) || 0)),
    isActive: row.is_active !== false,
    isSystem: row.is_system === true,
    persisted: true
  };
}

function getFallbackBookingChannels() {
  return DEFAULT_BOOKING_CHANNELS.map(channel => ({ ...channel, id: null, persisted: false }));
}

/**
 * "Bu tablo/sutun henuz yok" hatasi mi?
 *
 * GitHub Pages push ile ANINDA yayina alir, gocler Supabase panelinden ELLE
 * uygulanir (AGENTS.md). Yani yeni bir tabloya bagli istemci kodu her zaman
 * gocten once canliya cikabilir. Bu esnada okuma tarafi sessizce bos donmeli
 * (ekran calismaya devam eder), yazma tarafi ise kullaniciya ACIKCA soylemeli
 * — "kaydedildi" deyip kaybetmek 3.3'un yasakladigi seydir.
 */
function isMissingSchemaError(error) {
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(String(error?.code || ''));
}

function isMissingBookingChannelSchema(error) {
  return isMissingSchemaError(error);
}

async function loadTenantBookingChannels(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return { rows: getFallbackBookingChannels(), schemaReady: false };
  try {
    const rows = await fetchAllCloudRows(() => supabaseClient
      .from('tenant_booking_channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('is_system', { ascending: false })
      .order('display_name', { ascending: true }));
    return { rows: rows.map(mapBookingChannelFromDb), schemaReady: true };
  } catch (error) {
    if (isMissingBookingChannelSchema(error)) {
      return { rows: getFallbackBookingChannels(), schemaReady: false };
    }
    throw error;
  }
}

async function saveTenantBookingChannel(input = {}) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Kanal ayarı', tenantId);
  const type = String(input.channelType || '').toUpperCase();
  const rate = type === 'DIRECT' ? 0 : Number(input.defaultCommissionRate);
  if (!input.displayName || !String(input.displayName).trim()) throw new Error('Kanal adı zorunludur.');
  if (!['OTA', 'DIRECT'].includes(type)) throw new Error('Kanal türü geçersiz.');
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Komisyon oranı 0 ile 100 arasında olmalıdır.');
  const { data, error } = await supabaseClient.rpc('save_tenant_booking_channel', {
    p_tenant_id: tenantId,
    p_channel_id: input.id || null,
    p_display_name: String(input.displayName).trim(),
    p_channel_type: type,
    p_default_commission_rate: rate,
    p_is_active: input.isActive !== false
  });
  if (error) throw error;
  return mapBookingChannelFromDb(data);
}

// -------------------------------------------------------------
// BULUT YAZMA KORUMASI (Asama 2)
// Demo kaldirildiktan sonra isCloudTenant() yalnizca baglanti kopuk oldugunda
// false doner. Eskiden bu durumda kayit sessizce localStorage'a yaziliyordu:
// kullanici veriyi girdi saniyor, sayfayi yenileyince kaybediyordu. Artik
// yazma islemleri acik bir hatayla durur; okuma ekranlari calismaya devam eder.
// -------------------------------------------------------------
function requireCloudForWrite(islem, tenantId) {
  // Node (regresyon testleri) tarayici degildir: orada yerel yol, kayit
  // katmanindan bagimsiz olarak dogrulama mantiginin test yuzeyidir.
  // Koruma yalnizca gercek kullanicinin oturumunu ilgilendirir.
  if (typeof window === 'undefined') return;
  if (isCloudTenant(tenantId !== undefined ? tenantId : getActiveTenantId())) return;
  throw new Error(
    (islem ? islem + ' kaydedilemedi. ' : '') +
    'Bulut bağlantısı kurulamadı. Değişiklikleriniz kaydedilmez — ' +
    'internet bağlantınızı kontrol edip sayfayı yenileyin.'
  );
}

function mapPropertyFromDb(row) {
  if (!row) return null;
  const basePrice = Number(row.base_price) || 0;
  const cleanCost = Number(row.clean_cost) || 0;
  return {
    id: row.id, // Primary Supabase UUID
    tenantId: row.tenant_id,
    slug: row.slug,
    name: row.name,
    capacity: row.capacity || '',
    basePrice: basePrice,
    adr: basePrice,
    cleanCost: cleanCost,
    amenities: row.amenities || '',
    url: row.url || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active !== false && !row.archived_at,
    activationDate: row.activated_on || (row.created_at || '').slice(0, 10),
    deactivationDate: row.deactivated_on || null,
    archivedAt: row.archived_at || null
  };
}

function mapPropertyToDb(property, tenantId) {
  const activeTId = tenantId || getActiveTenantId();
  const basePrice = Number(property.basePrice !== undefined ? property.basePrice : property.adr) || 0;
  const cleanCost = Number(property.cleanCost) || 0;
  const payload = {
    tenant_id: activeTId,
    slug: (property.slug || property.name || 'VILLA').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
    name: (property.name || property.slug || '').trim(),
    capacity: property.capacity || '',
    base_price: basePrice,
    clean_cost: cleanCost,
    amenities: property.amenities || '',
    url: property.url || ''
  };
  if (property.id) {
    payload.id = property.id;
  }
  if (typeof activeSaaSUser !== 'undefined' && activeSaaSUser?.id) {
    payload.created_by = activeSaaSUser.id;
  }
  return payload;
}

async function loadProperties(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    return (typeof appData !== 'undefined' && appData.villas) ? appData.villas : {};
  }
  try {
    const data = await fetchAllCloudRows(() => supabaseClient
      .from('properties').select('*').eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }));

    const villas = {};
    (data || []).forEach(row => {
      const mapped = mapPropertyFromDb(row);
      if (mapped) {
        villas[mapped.slug] = mapped;
      }
    });

    if (typeof appData !== 'undefined') {
      if (!appData) appData = {};
      appData.villas = villas;
    }
    return villas;
  } catch (err) {
    console.error('Failed to load properties from cloud:', err);
    throw new Error('Mülkler yüklenemedi. Tekrar deneyin.');
  }
}

async function createProperty(propInput) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    requireCloudForWrite('Mülk', tenantId);
    // Demo / offline fallback
    const name = (propInput.name || '').trim();
    if (!name) throw new Error('Mülk adı boş bırakılamaz.');
    let slug = (propInput.slug || name).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!slug) slug = 'VILLA_' + (Object.keys(appData.villas || {}).length + 1);
    if (appData && !appData.villas) appData.villas = {};
    const localProp = {
      id: 'local_' + Date.now(),
      slug,
      name,
      capacity: propInput.capacity || '',
      basePrice: Number(propInput.basePrice || propInput.adr) || 0,
      adr: Number(propInput.basePrice || propInput.adr) || 0,
      cleanCost: Number(propInput.cleanCost) || 0,
      amenities: propInput.amenities || '',
      url: propInput.url || ''
    };
    if (appData) {
      appData.villas[slug] = localProp;
      if (typeof saveAppData === 'function') saveAppData();
    }
    return localProp;
  }

  // 1. Validation
  const name = (propInput.name || '').trim();
  if (!name) throw new Error('Mülk adı boş bırakılamaz.');

  const basePrice = Number(propInput.basePrice !== undefined ? propInput.basePrice : propInput.adr) || 0;
  if (basePrice < 0) throw new Error('Gecelik taban fiyat negatif olamaz.');

  const cleanCost = Number(propInput.cleanCost) || 0;
  if (cleanCost < 0) throw new Error('Temizlik maliyeti negatif olamaz.');

  let slug = (propInput.slug || name).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (!slug) slug = 'VILLA_' + (Object.keys(appData?.villas || {}).length + 1);

  // Check duplicate slug in active tenant memory state
  if (appData?.villas && appData.villas[slug]) {
    slug = slug + '_' + Math.floor(100 + Math.random() * 900);
  }

  // 2. Map payload (tenant_id is strictly activeTenantId, forged tenant_id in propInput is ignored)
  const dbPayload = mapPropertyToDb({ ...propInput, slug }, tenantId);
  delete dbPayload.id; // DB generates UUID

  // 3. Awaited DB mutation
  const { data, error } = await supabaseClient
    .from('properties')
    .insert(dbPayload)
    .select()
    .single();

  if (error) {
    console.error('createProperty DB error:', error);
    if (error.code === '23505') {
      throw new Error('Bu ada veya koda sahip bir mülk zaten mevcut.');
    }
    throw new Error('Mülk kaydedilemedi: ' + (error.message || 'Veritabanı hatası'));
  }

  // 4. Update local state ONLY on DB success
  const createdProp = mapPropertyFromDb(data);
  if (typeof appData !== 'undefined') {
    if (!appData.villas) appData.villas = {};
    appData.villas[createdProp.slug] = createdProp;
    if (typeof saveAppData === 'function') saveAppData();
  }

  return createdProp;
}

async function updateProperty(propIdOrSlug, propInput) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    requireCloudForWrite('Mülk güncellemesi', tenantId);
    // Offline / demo fallback
    let existing = null;
    let oldSlug = null;
    if (typeof appData !== 'undefined' && appData.villas) {
      if (appData.villas[propIdOrSlug]) {
        existing = appData.villas[propIdOrSlug];
        oldSlug = propIdOrSlug;
      } else {
        for (const [s, p] of Object.entries(appData.villas)) {
          if (p.id === propIdOrSlug) { existing = p; oldSlug = s; break; }
        }
      }
    }
    if (!existing && (!appData?.villas || !appData.villas[propIdOrSlug])) {
      throw new Error('Güncellenecek mülk bulunamadı.');
    }
    const name = (propInput.name || existing?.name || '').trim();
    if (!name) throw new Error('Mülk adı boş bırakılamaz.');
    const updated = {
      ...(existing || {}),
      name,
      capacity: propInput.capacity !== undefined ? propInput.capacity : existing?.capacity,
      basePrice: Number(propInput.basePrice !== undefined ? propInput.basePrice : existing?.basePrice) || 0,
      adr: Number(propInput.basePrice !== undefined ? propInput.basePrice : existing?.basePrice) || 0,
      cleanCost: Number(propInput.cleanCost !== undefined ? propInput.cleanCost : existing?.cleanCost) || 0,
      amenities: propInput.amenities !== undefined ? propInput.amenities : existing?.amenities,
      url: propInput.url !== undefined ? propInput.url : existing?.url
    };
    if (appData?.villas) {
      appData.villas[oldSlug || propIdOrSlug] = updated;
      if (typeof saveAppData === 'function') saveAppData();
    }
    return updated;
  }

  // Find existing property in state
  let existing = null;
  let oldSlug = null;
  if (typeof appData !== 'undefined' && appData.villas) {
    if (appData.villas[propIdOrSlug]) {
      existing = appData.villas[propIdOrSlug];
      oldSlug = propIdOrSlug;
    } else {
      for (const [s, p] of Object.entries(appData.villas)) {
        if (p.id === propIdOrSlug) {
          existing = p;
          oldSlug = s;
          break;
        }
      }
    }
  }

  const propId = existing?.id || (isUUID(propIdOrSlug) ? propIdOrSlug : null);
  if (!propId) {
    throw new Error('Güncellenecek mülkün veritabanı kaydı bulunamadı.');
  }

  const name = (propInput.name || existing?.name || '').trim();
  if (!name) throw new Error('Mülk adı boş bırakılamaz.');

  const basePrice = Number(propInput.basePrice !== undefined ? propInput.basePrice : (propInput.adr !== undefined ? propInput.adr : (existing?.basePrice || 0)));
  if (basePrice < 0) throw new Error('Gecelik taban fiyat negatif olamaz.');

  const cleanCost = Number(propInput.cleanCost !== undefined ? propInput.cleanCost : (existing?.cleanCost || 0));
  if (cleanCost < 0) throw new Error('Temizlik maliyeti negatif olamaz.');

  const dbPayload = {
    name: name,
    capacity: propInput.capacity !== undefined ? propInput.capacity : (existing?.capacity || ''),
    base_price: basePrice,
    clean_cost: cleanCost,
    amenities: propInput.amenities !== undefined ? propInput.amenities : (existing?.amenities || ''),
    url: propInput.url !== undefined ? propInput.url : (existing?.url || ''),
    updated_at: new Date().toISOString()
  };

  // Awaited DB update scoped to tenant_id and id
  const { data, error } = await supabaseClient
    .from('properties')
    .update(dbPayload)
    .eq('id', propId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('updateProperty DB error:', error);
    throw new Error('Mülk güncellenemedi: ' + (error.message || 'Veritabanı hatası'));
  }

  // Update local state ONLY on DB success
  const updatedProp = mapPropertyFromDb(data);
  if (typeof appData !== 'undefined' && appData.villas) {
    if (oldSlug && oldSlug !== updatedProp.slug) {
      delete appData.villas[oldSlug];
    }
    appData.villas[updatedProp.slug] = updatedProp;
    if (typeof saveAppData === 'function') saveAppData();
  }

  return updatedProp;
}

async function deleteProperty(propIdOrSlug) {
  let existing = null;
  let targetSlug = null;
  if (typeof appData !== 'undefined' && appData.villas) {
    if (appData.villas[propIdOrSlug]) {
      existing = appData.villas[propIdOrSlug];
      targetSlug = propIdOrSlug;
    } else {
      for (const [s, p] of Object.entries(appData.villas)) {
        if (p.id === propIdOrSlug) {
          existing = p;
          targetSlug = s;
          break;
        }
      }
    }
  }

  const vName = existing ? existing.name : propIdOrSlug;
  const tenantId = getActiveTenantId();
  const isCloud = isCloudTenant(tenantId);
  const propId = [existing?.id, propIdOrSlug].find(id => isUUID(id)) || null;

  // Fail closed: a tenant-only UPDATE would archive every property. An exact
  // property id or a slug resolved from the current tenant state is required.
  if (!propId && !targetSlug) {
    throw new Error('Arşivlenecek mülk bulunamadı; geçerli mülk kimliği gereklidir.');
  }
  if (!isCloud && !existing) {
    throw new Error('Arşivlenecek mülk bulunamadı.');
  }

  if (typeof confirm === 'function') {
    if (!confirm(vName + ' kaydını arşivlemek istediğinize emin misiniz? Geçmiş finans ve rezervasyon kayıtları korunacaktır.')) {
      return false;
    }
  }

  // Physical deletion is intentionally unavailable. Archiving preserves every
  // historical booking, expense and closed-period report.
  if (isCloud) {
    const archivedAt = new Date().toISOString();
    let deleteQuery = supabaseClient.from('properties').update({
      is_active: false,
      deactivated_on: archivedAt.slice(0, 10),
      archived_at: archivedAt,
      updated_at: archivedAt
    }).eq('tenant_id', tenantId);
    deleteQuery = propId
      ? deleteQuery.eq('id', propId)
      : deleteQuery.eq('slug', targetSlug);

    const { data, error } = await deleteQuery.select('id, slug').maybeSingle();
    if (error) {
      console.error('archiveProperty DB error:', error);
      const msg = 'Mülk arşivlenemedi: ' + (error.message || 'Veritabanı hatası');
      throw new Error(msg);
    }
    if (!data) {
      throw new Error('Arşivlenecek mülk bulunamadı; hiçbir kayıt değiştirilmedi.');
    }
    if (!targetSlug && data.slug) targetSlug = data.slug;
  }

  // 2. Update local state ONLY on DB success
  if (targetSlug && typeof appData !== 'undefined' && appData.villas) {
    appData.villas[targetSlug] = {
      ...appData.villas[targetSlug],
      isActive: false,
      deactivationDate: getTodayStr(),
      archivedAt: new Date().toISOString()
    };
    if (typeof saveAppData === 'function') saveAppData();
  }

  // 3. Reset dependent filters safely
  if (typeof currentFilter !== 'undefined' && (currentFilter.villa === targetSlug || currentFilter.villa === propId)) {
    currentFilter.villa = 'ALL';
  }
  if (typeof document !== 'undefined') {
    const globalFilterEl = document.getElementById('globalVillaFilter');
    if (globalFilterEl && (globalFilterEl.value === targetSlug || globalFilterEl.value === propId)) {
      globalFilterEl.value = 'ALL';
    }
    if (typeof closePropertyModal === 'function') closePropertyModal();
    if (typeof updateAllVillaDropdowns === 'function') updateAllVillaDropdowns();
    if (typeof renderAll === 'function') renderAll();
    if (typeof alert === 'function') alert('📦 ' + vName + ' arşivlendi; geçmiş kayıtları korundu.');
  }

  return true;
}

async function deletePropertyUI(propIdOrSlug) {
  try {
    return await deleteProperty(propIdOrSlug);
  } catch (error) {
    if (typeof alert === 'function') alert(error?.message || 'Mülk arşivlenemedi.');
    return false;
  }
}

// Backwards compatibility wrappers
async function cloudUpsertProperty(slug, prop) {
  if (typeof appData !== 'undefined' && appData.villas && appData.villas[slug]) {
    return await updateProperty(slug, prop);
  } else {
    return await createProperty({ slug, ...prop });
  }
}

async function cloudDeleteProperty(slug) {
  return await deleteProperty(slug);
}

async function getPropertyIdBySlug(slug, tenantId) {
  if (typeof appData !== 'undefined' && appData?.villas?.[slug]?.id) {
    return appData.villas[slug].id;
  }
  if (!supabaseClient || !tenantId) return null;
  try {
    const { data } = await supabaseClient.from('properties')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .maybeSingle();
    return data ? data.id : null;
  } catch (err) {
    console.warn('Property id lookup notice:', err);
    return null;
  }
}

// -------------------------------------------------------------
// 📅 MERKEZİ BOOKING / REZERVASYON CRUD & MAPPER (PHASE 5)
// -------------------------------------------------------------
const ALLOWED_BOOKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'];

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBookingStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  return ALLOWED_BOOKING_STATUSES.includes(status) ? status : null;
}

function generateSafeBookingCode(checkInDate) {
  const prefix = checkInDate ? checkInDate.replace(/[^0-9]/g, '').slice(2, 6) : getTodayStr().slice(2, 7).replace('-', '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `BK-${prefix}-${rand}${suffix}`;
}

function calculateNightsBetween(checkInStr, checkOutStr) {
  if (!checkInStr || !checkOutStr) return 0;
  const [y1, m1, d1] = checkInStr.split('-').map(Number);
  const [y2, m2, d2] = checkOutStr.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((utc2 - utc1) / (1000 * 60 * 60 * 24)));
}

function mapBookingFromDb(row, propertyMap = {}) {
  if (!row) return null;
  const gross = Number(row.gross_amount) || 0;
  const otaComm = Number(row.ota_commission) || 0;
  const cleanFee = Number(row.cleaning_fee) || 0;
  const discount = Number(row.discount) || 0;
  const net = Number(row.net_room_revenue) || Math.max(0, gross - otaComm - cleanFee - discount);
  const nights = calculateNightsBetween(row.check_in, row.check_out);

  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  let villaSlug = row.property_id;
  if (propertyMap && propertyMap[row.property_id]) {
    villaSlug = propertyMap[row.property_id];
  } else if (currentAppData && currentAppData.villas) {
    for (const [slug, p] of Object.entries(currentAppData.villas)) {
      if (p.id === row.property_id) {
        villaSlug = slug;
        break;
      }
    }
  }

  const status = normalizeBookingStatus(row.status);

  return {
    id: row.id, // Primary Supabase UUID
    dbId: row.id,
    code: row.booking_code,
    bookingCode: row.booking_code,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    villa: villaSlug,
    guest: row.guest_name,
    phone: row.guest_phone || '',
    primaryGuestId: row.primary_guest_id || null,
    channel: row.channel || 'Direct',
    checkIn: row.check_in,
    checkOut: row.check_out,
    pax: normalizePositiveInteger(row.pax),
    gross: gross,
    grossAmount: gross,
    otaComm: otaComm,
    otaCommission: otaComm,
    cleanFee: cleanFee,
    cleaningFee: cleanFee,
    // cleanCost BILEREK yok: temizlik maliyeti bookings'te degil, temizlik
    // borc defterinde (cleaning_tasks.amount) durur. syncBookingCleaningTasks()
    // yuklemeden sonra bu alani oradan doldurur.
    discount: discount,
    net: net,
    netRoomRev: net,
    netRoomRevenue: net,
    nights: nights,
    status: status,
    notes: row.notes || '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Mulkler ve rezervasyonlar ilk acilista paralel yuklenir. Rezervasyon
 * mapper'i mulklerden once biterse villa alaninda slug yerine property UUID
 * kalir. Iki sorgu da tamamlandiktan sonra UUID -> slug bagini kesinlestirir.
 */
function attachBookingVillaSlugs(bookings = [], villas = {}) {
  const slugByPropertyId = {};
  Object.entries(villas || {}).forEach(([key, property]) => {
    if (property && property.id) slugByPropertyId[property.id] = property.slug || key;
  });
  return (bookings || []).map(booking => {
    const propertyId = booking && (booking.propertyId || booking.property_id);
    const slug = propertyId ? slugByPropertyId[propertyId] : null;
    return slug && booking.villa !== slug ? { ...booking, villa: slug } : booking;
  });
}

function mapBookingToDb(booking, tenantId) {
  const activeTId = tenantId || getActiveTenantId();

  let propId = booking.propertyId || booking.property_id;
  if (!propId && booking.villa) {
    if (isUUID(booking.villa)) {
      propId = booking.villa;
    } else if (typeof appData !== 'undefined' && appData.villas && appData.villas[booking.villa]) {
      propId = appData.villas[booking.villa].id;
    }
  }

  const gross = Number(booking.gross !== undefined ? booking.gross : booking.grossAmount) || 0;
  const otaComm = Number(booking.otaComm !== undefined ? booking.otaComm : booking.otaCommission) || 0;
  const cleanFee = Number(booking.cleanFee !== undefined ? booking.cleanFee : booking.cleaningFee) || 0;
  const cleanCost = Math.max(0, Number(booking.cleanCost) || 0);
  const discount = Number(booking.discount) || 0;
  // Tek tanim, yukleyiciyle (mapBookingFromDb) ayni: brut - OTA - temizlik
  // ucreti - indirim. Eskiden formun gonderdigi `net` (indirimsiz) bunu
  // eziyordu; hicbir alani degismeyen bir duzenleme saklanan degeri
  // sessizce degistiriyordu (L-33). Brut yoksa (eski ice aktarim) verilen
  // net korunur.
  const verilenNet = Number(booking.net !== undefined ? booking.net : (booking.netRoomRev || booking.netRoomRevenue)) || 0;
  const net = gross > 0 ? Math.max(0, gross - otaComm - cleanFee - discount) : verilenNet;

  const status = normalizeBookingStatus(booking.status);
  const pax = normalizePositiveInteger(booking.pax);
  const checkIn = booking.checkIn || booking.check_in;
  const checkOut = booking.checkOut || booking.check_out;

  const payload = {
    tenant_id: activeTId,
    property_id: propId,
    booking_code: (booking.bookingCode || booking.code || generateSafeBookingCode(checkIn)).trim(),
    guest_name: (booking.guest || booking.guest_name || 'Misafir').trim(),
    guest_phone: booking.phone || booking.guest_phone || '',
    channel: booking.channel || 'Direct',
    check_in: checkIn,
    check_out: checkOut,
    pax: pax,
    gross_amount: gross,
    ota_commission: otaComm,
    cleaning_fee: cleanFee,
    // Temizlik MALIYETI bookings tablosunda durmaz; dogal yeri temizlik borc
    // defteridir (cleaning_tasks.amount). Ayni sayiyi iki tabloda tutmak,
    // hangisinin dogru oldugu sorusunu aciyordu.
    discount: discount,
    net_room_revenue: net,
    status: status,
    notes: booking.notes || ''
  };

  if (booking.id && isUUID(booking.id)) {
    payload.id = booking.id;
  }
  if (typeof activeSaaSUser !== 'undefined' && activeSaaSUser?.id) {
    payload.created_by = activeSaaSUser.id;
  }
  const primaryGuestId = booking.primaryGuestId || booking.primary_guest_id;
  if (primaryGuestId) payload.primary_guest_id = primaryGuestId;

  return payload;
}

function checkBookingOverlap(propertyId, checkIn, checkOut, excludeBookingId = null, bookingsList = null) {
  if (!propertyId || !checkIn || !checkOut) return null;
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  const bookings = bookingsList || (currentAppData?.bookings ? currentAppData.bookings : []);

  for (const b of bookings) {
    if (b.status === 'CANCELLED') continue;
    if (excludeBookingId && (b.id === excludeBookingId || b.code === excludeBookingId || b.bookingCode === excludeBookingId)) continue;

    const bPropId = b.propertyId || (currentAppData?.villas?.[b.villa]?.id);
    if (bPropId !== propertyId && b.villa !== propertyId) continue;

    // Check overlap: checkIn < b.checkOut && checkOut > b.checkIn
    // Same-day boundary (checkIn === b.checkOut or checkOut === b.checkIn) is NOT an overlap.
    if (checkIn < b.checkOut && checkOut > b.checkIn) {
      return b;
    }
  }
  return null;
}

async function loadBookings(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    return (typeof appData !== 'undefined' && appData.bookings) ? appData.bookings : [];
  }
  try {
    const data = await fetchAllCloudRows(() => supabaseClient
      .from('bookings').select('*').eq('tenant_id', tenantId)
      .order('check_in', { ascending: true }));

    const bookings = (data || []).map(row => mapBookingFromDb(row));
    if (typeof appData !== 'undefined') {
      if (!appData) appData = {};
      appData.bookings = bookings;
    }
    return bookings;
  } catch (err) {
    console.error('Failed to load bookings from cloud:', err);
    throw new Error('Rezervasyonlar yüklenemedi. Tekrar deneyin.');
  }
}

async function createBooking(bookingInput) {
  const tenantId = getActiveTenantId() || bookingInput?.tenantId;
  const isCloud = isCloudTenant(tenantId);
  requireCloudForWrite('Rezervasyon', tenantId);

  // 1. Validation
  const checkIn = bookingInput.checkIn || bookingInput.check_in;
  const checkOut = bookingInput.checkOut || bookingInput.check_out;
  if (!checkIn || !checkOut) {
    throw new Error('Giriş ve çıkış tarihleri zorunludur.');
  }
  if (checkOut <= checkIn) {
    throw new Error('Çıkış tarihi giriş tarihinden sonra olmalıdır.');
  }
  if (isStayPeriodClosed(checkIn, checkOut)) {
    throw new Error('Bu konaklama kapatılmış bir döneme denk geliyor. Rezervasyon eklenemez. Önce dönemi yeniden açın.');
  }

  const guest = (bookingInput.guest || bookingInput.guest_name || '').trim();
  if (!guest) {
    throw new Error('Misafir adı boş bırakılamaz.');
  }

  const pax = normalizePositiveInteger(bookingInput.pax);
  if (pax === null) {
    throw new Error('Kişi sayısı pozitif bir tam sayı olmalıdır.');
  }
  const status = normalizeBookingStatus(bookingInput.status);
  if (!status) {
    throw new Error('Geçerli bir rezervasyon durumu seçilmelidir.');
  }

  const gross = Number(bookingInput.gross !== undefined ? bookingInput.gross : bookingInput.grossAmount) || 0;
  if (gross < 0) {
    throw new Error('Toplam tutar negatif olamaz.');
  }

  // Resolve property UUID and verify active tenant ownership
  let propId = bookingInput.propertyId || bookingInput.property_id;
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  if (!propId && bookingInput.villa) {
    if (isUUID(bookingInput.villa)) {
      propId = bookingInput.villa;
    } else if (currentAppData && currentAppData.villas && currentAppData.villas[bookingInput.villa]) {
      propId = currentAppData.villas[bookingInput.villa].id;
    }
  }

  if (currentAppData && currentAppData.villas) {
    const validPropertyIds = Object.values(currentAppData.villas).map(p => p.id).filter(Boolean);
    if (validPropertyIds.length > 0 && propId && !validPropertyIds.includes(propId)) {
      throw new Error('Seçilen mülk aktif işletmenize ait değildir.');
    }
  }

  // 2. Overbooking overlap validation
  const overlap = checkBookingOverlap(propId, checkIn, checkOut);
  if (overlap) {
    throw new Error(`Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor (${overlap.guest}: ${overlap.checkIn} - ${overlap.checkOut}).`);
  }

  // Offline / demo fallback
  if (!isCloud) {
    const newId = 'local_rez_' + Date.now();
    const localRecord = {
      id: newId,
      dbId: newId,
      code: bookingInput.bookingCode || bookingInput.code || generateSafeBookingCode(checkIn),
      tenantId: tenantId || 'usr_ute_master',
      propertyId: propId,
      villa: bookingInput.villa || 'VILLA',
      guest,
      phone: bookingInput.phone || '',
      channel: bookingInput.channel || 'Direct',
      checkIn,
      checkOut,
      pax,
      gross,
      otaComm: Number(bookingInput.otaComm) || 0,
      cleanFee: Number(bookingInput.cleanFee) || 0,
      cleanCost: Number(bookingInput.cleanCost) || 0,
      discount: Number(bookingInput.discount) || 0,
      net: Number(bookingInput.net) || gross,
      nights: calculateNightsBetween(checkIn, checkOut),
      status,
      notes: bookingInput.notes || ''
    };
    if (typeof appData !== 'undefined') {
      if (!appData.bookings) appData.bookings = [];
      appData.bookings.push(localRecord);
      if (typeof syncBookingCleaningTasks === 'function') syncBookingCleaningTasks();
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
    }
    return localRecord;
  }

  // 3. Awaited DB write with collision retry (max 3 attempts)
  const payload = mapBookingToDb({ ...bookingInput, pax, status }, tenantId);
  delete payload.id; // Let DB generate gen_random_uuid()

  let attempts = 0;
  let lastError = null;
  let createdRow = null;

  while (attempts < 3) {
    attempts++;
    let data = null, error = null;
    try {
      const rpcRes = await supabaseClient.rpc('create_booking_atomic', {
        p_tenant_id: payload.tenant_id,
        p_property_id: payload.property_id,
        p_booking_code: payload.booking_code,
        p_guest_name: payload.guest_name,
        p_guest_phone: payload.guest_phone,
        p_channel: payload.channel,
        p_check_in: payload.check_in,
        p_check_out: payload.check_out,
        p_pax: payload.pax,
        p_gross_amount: payload.gross_amount,
        p_ota_commission: payload.ota_commission,
        p_cleaning_fee: payload.cleaning_fee,
        p_discount: payload.discount,
        p_net_room_revenue: payload.net_room_revenue,
        p_status: payload.status,
        p_notes: payload.notes
      });
      if (!rpcRes.error && rpcRes.data) {
        data = rpcRes.data;
      } else if (rpcRes.error) {
        // RPC BILINCLI olarak reddettiyse (yetki, kapali donem, dogrulama)
        // onun mesaji kullaniciya gider. Eskiden HER hatada ayni satir
        // dogrudan insert ile yeniden deneniyordu: ikinci bir yurutme yolu ve
        // kullaniciya RPC'nin gercek sebebi yerine ikinci yolun hatasi (L-34).
        // Yalniz fonksiyon HENUZ YOKSA (goc uygulanmamissa) yedege dusulur;
        // updateBooking ile ayni kural.
        const fonksiyonYok = rpcRes.error.code === 'PGRST202'
          || (rpcRes.error.message || '').includes('Could not find the function');
        if (!fonksiyonYok) {
          error = rpcRes.error;
        } else {
          const insRes = await supabaseClient.from('bookings').insert(payload).select().single();
          data = insRes.data;
          error = insRes.error;
        }
      } else {
        error = new Error('Rezervasyon kaydedilemedi: sunucudan boş yanıt döndü.');
      }
    } catch (e) {
      // Beklenmedik istisna (ag vb.): zayif yola dusulmez, hata bildirilir.
      error = e;
    }

    if (!error && data) {
      createdRow = data;
      break;
    }

    lastError = error;
    if (error?.code === '23505' && (error.message?.includes('booking_code') || error.details?.includes('booking_code'))) {
      console.warn(`Booking code collision (${payload.booking_code}), retrying attempt ${attempts}/3...`);
      payload.booking_code = generateSafeBookingCode(payload.check_in);
      continue;
    } else {
      break;
    }
  }

  if (!createdRow) {
    console.error('createBooking DB error:', lastError);
    if (lastError?.code === '23505') {
      throw new Error('Bu rezervasyon kodu ile kayıtlı bir işlem zaten mevcut.');
    }
    if (lastError?.code === '23P01' ||
        lastError?.message?.includes('exclude_overlapping_bookings') ||
        lastError?.message?.includes('OVERBOOKING_CONFLICT') ||
        lastError?.message?.includes('çakışıyor') ||
        lastError?.details?.includes('conflicting key')) {
      throw new Error('Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.');
    }
    throw new Error('Rezervasyon kaydedilemedi: ' + (lastError?.message || 'Veritabanı hatası'));
  }

  // 4. Update local state ONLY on DB success
  const createdBooking = mapBookingFromDb(createdRow);
  if (typeof appData !== 'undefined') {
    if (!appData.bookings) appData.bookings = [];
    const exists = appData.bookings.some(b => b.id === createdBooking.id);
    if (!exists) {
      appData.bookings.push(createdBooking);
    }
    // Kayit VERITABANINA YAZILDI. Bundan sonraki ekran hatasi kaydi basarisiz
    // gostermemeli: eskiden renderAll firlatirsa kullanici "kaydedilemedi"
    // goruyor, tekrar deneyince cakisma hatasi aliyordu (L-35).
    refreshAfterPersistedWrite();
  }

  return createdBooking;
}

async function updateBooking(bookingId, bookingInput) {
  const tenantId = getActiveTenantId();
  const isCloud = isCloudTenant(tenantId);

  // Resolve target booking in state
  let existing = null;
  let existingIdx = -1;
  if (typeof appData !== 'undefined' && appData.bookings) {
    existingIdx = appData.bookings.findIndex(b => b.id === bookingId || b.code === bookingId || b.dbId === bookingId);
    if (existingIdx !== -1) {
      existing = appData.bookings[existingIdx];
    }
  }

  const propBookingId = existing?.id || (isUUID(bookingId) ? bookingId : null);
  if (!propBookingId && isCloud) {
    throw new Error('Güncellenecek rezervasyonun kimliği bulunamadı.');
  }

  // Validation
  const checkIn = bookingInput.checkIn || bookingInput.check_in || existing?.checkIn;
  const checkOut = bookingInput.checkOut || bookingInput.check_out || existing?.checkOut;
  if (checkIn && checkOut && checkOut <= checkIn) {
    throw new Error('Çıkış tarihi giriş tarihinden sonra olmalıdır.');
  }
  // Hem kaydin BULUNDUGU donem hem de TASINMAK ISTENEN donem acik olmali.
  // Yalnizca yeniyi kontrol etmek, kaydi kapali aydan kacirmaya izin verirdi.
  if (existing && isStayPeriodClosed(existing.checkIn, existing.checkOut)) {
    throw new Error('Bu rezervasyonun konakladığı dönem kapatılmıştır. Değiştirilemez. Önce dönemi yeniden açın.');
  }
  if (isStayPeriodClosed(checkIn, checkOut)) {
    throw new Error('Yeni tarihler kapatılmış bir döneme denk geliyor. Rezervasyon buraya taşınamaz.');
  }

  const gross = Number(bookingInput.gross !== undefined ? bookingInput.gross : (bookingInput.grossAmount !== undefined ? bookingInput.grossAmount : existing?.gross)) || 0;
  if (gross < 0) {
    throw new Error('Toplam tutar negatif olamaz.');
  }

  let propId = bookingInput.propertyId || bookingInput.property_id || existing?.propertyId;
  if (!propId && bookingInput.villa) {
    if (isUUID(bookingInput.villa)) {
      propId = bookingInput.villa;
    } else if (typeof appData !== 'undefined' && appData.villas && appData.villas[bookingInput.villa]) {
      propId = appData.villas[bookingInput.villa].id;
    }
  }

  if (typeof appData !== 'undefined' && appData.villas && propId) {
    const validPropertyIds = Object.values(appData.villas).map(p => p.id).filter(Boolean);
    if (validPropertyIds.length > 0 && !validPropertyIds.includes(propId)) {
      throw new Error('Seçilen mülk aktif işletmenize ait değildir.');
    }
  }

  // Overlap validation excluding current booking
  const overlap = checkBookingOverlap(propId, checkIn, checkOut, propBookingId);
  if (overlap) {
    throw new Error(`Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor (${overlap.guest}: ${overlap.checkIn} - ${overlap.checkOut}).`);
  }

  // Offline / demo fallback
  if (!isCloud) {
    const updated = {
      ...(existing || {}),
      ...bookingInput,
      checkIn,
      checkOut,
      gross,
      nights: calculateNightsBetween(checkIn, checkOut)
    };
    if (existingIdx !== -1) {
      appData.bookings[existingIdx] = updated;
    }
    if (typeof syncBookingCleaningTasks === 'function') syncBookingCleaningTasks();
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    return updated;
  }

  // Awaited DB update
  const payload = mapBookingToDb({ ...(existing || {}), ...bookingInput, checkIn, checkOut, propertyId: propId }, tenantId);
  delete payload.id;
  payload.updated_at = new Date().toISOString();

  let data = null, error = null;
  try {
    const rpcRes = await supabaseClient.rpc('update_booking_atomic', {
      p_booking_id: propBookingId,
      p_tenant_id: tenantId,
      p_property_id: propId,
      p_guest_name: payload.guest_name,
      p_guest_phone: payload.guest_phone,
      p_channel: payload.channel,
      p_check_in: payload.check_in,
      p_check_out: payload.check_out,
      p_pax: payload.pax,
      p_gross_amount: payload.gross_amount,
      p_ota_commission: payload.ota_commission,
      p_cleaning_fee: payload.cleaning_fee,
      p_discount: payload.discount,
      p_net_room_revenue: payload.net_room_revenue,
      p_status: payload.status,
      p_notes: payload.notes
    });
    if (!rpcRes.error && rpcRes.data) {
      data = rpcRes.data;
    } else if (rpcRes.error) {
      // RPC BILINCLI olarak reddettiyse onun mesajini koru. Onceden buradan
      // dogrudan tablo guncellemesine dusuluyordu. RLS ayni rolleri zaten
      // engelledigi icin veri guvendeydi (canli dogrulandi: viewer denemesinde
      // kayit degismedi), ama kullanici RPC'nin net mesaji yerine
      // "PGRST116 Cannot coerce the result to a single JSON object" goruyordu.
      // Yalnizca fonksiyon HENUZ YOKSA (goc uygulanmamissa) yedege dus.
      const fonksiyonYok = rpcRes.error.code === 'PGRST202'
        || (rpcRes.error.message || '').includes('Could not find the function');

      if (!fonksiyonYok) {
        error = rpcRes.error;
      } else {
        const updRes = await supabaseClient
          .from('bookings')
          .update(payload)
          .eq('id', propBookingId)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        data = updRes.data;
        error = updRes.error;
      }
    } else {
      error = new Error('Rezervasyon güncellenemedi: sunucudan boş yanıt döndü.');
    }
  } catch (e) {
    // Beklenmedik istisna: sessizce zayif yola dusme, hatayi oldugu gibi bildir.
    error = e;
  }

  if (error) {
    console.error('updateBooking DB error:', error);
    if (error.code === '23P01' ||
        error.message?.includes('exclude_overlapping_bookings') ||
        error.message?.includes('OVERBOOKING_CONFLICT') ||
        error.message?.includes('çakışıyor') ||
        error.details?.includes('conflicting key')) {
      throw new Error('Bu mülk seçilen tarihlerde başka bir rezervasyonla çakışıyor.');
    }
    throw new Error('Rezervasyon güncellenemedi: ' + (error.message || 'Veritabanı hatası'));
  }

  // Update local state ONLY on DB success
  const updatedBooking = mapBookingFromDb(data);
  // Odeme komisyonu ayri tabloda durur (phase45); bookings satirindan
  // gelmez, bellekteki deger korunur.
  if (existing && existing.paymentCommission !== undefined) updatedBooking.paymentCommission = existing.paymentCommission;
  if (typeof appData !== 'undefined' && appData.bookings) {
    const idx = appData.bookings.findIndex(b => b.id === updatedBooking.id);
    if (idx !== -1) {
      appData.bookings[idx] = updatedBooking;
    } else {
      appData.bookings.push(updatedBooking);
    }
    refreshAfterPersistedWrite();
  }

  return updatedBooking;
}

/**
 * Veritabani yazmasi BASARILI olduktan sonra bellek esitlemesi ve ekran.
 * Buradaki bir hata kaydi geri almaz ve cagirana firlatilmaz: kullanici
 * "kaydedilemedi" gorup tekrar denerse ayni kaydi ikinci kez yazmaya
 * calisir (L-35). Hata konsola ve yakalanmamis hata kanalina gider.
 */
function refreshAfterPersistedWrite() {
  try {
    if (typeof syncBookingCleaningTasks === 'function') syncBookingCleaningTasks();
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
  } catch (err) {
    console.error('Kayit yazildi; ekran yenilenirken hata:', err);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Kayıt kaydedildi, ancak ekran yenilenemedi. Sayfayı yenileyin.', 'error');
    }
  }
}

async function deleteBooking(bookingId) {
  const tenantId = getActiveTenantId();
  const isCloud = isCloudTenant(tenantId);

  let existing = null;
  if (typeof appData !== 'undefined' && appData.bookings) {
    existing = appData.bookings.find(b => b.id === bookingId || b.code === bookingId || b.dbId === bookingId);
  }

  const propBookingId = [existing?.id, existing?.dbId, bookingId].find(id => isUUID(id)) || null;
  const guestName = existing?.guest || 'bu';

  if (isCloud && !propBookingId) {
    throw new Error('Rezervasyonun geçerli bulut kimliği (UUID) bulunamadı; silme işlemi yapılmadı.');
  }

  if (existing && isStayPeriodClosed(existing.checkIn, existing.checkOut)) {
    throw new Error('Bu rezervasyonun konakladığı dönem kapatılmıştır. Silinemez. Önce dönemi yeniden açın.');
  }

  if (typeof confirm === 'function') {
    if (!confirm(`${guestName} rezervasyonunu silmek istediğinize emin misiniz?`)) {
      return false;
    }
  }

  if (isCloud && propBookingId) {
    try {
      // Tek transaction. Onceden burada UC ayri sorgu vardi: odenmisleri ayir,
      // odenmemisleri sil, rezervasyonu sil. Ucuncu adim kapanmis donem korumasina
      // takilirsa ikinci adim GERI ALINMIYORDU - kullanici "silinemedi" hatasi
      // aliyor ama temizlikciye olan borc kaydini kaybediyordu (canli dogrulandi).
      // Odenmis gorevlerin baglantisini FK zaten ON DELETE SET NULL ile bosaltir.
      const { error } = await supabaseClient.rpc('delete_booking_atomic', {
        p_booking_id: propBookingId,
        p_tenant_id: tenantId
      });

      if (error) {
        console.error('deleteBooking DB error:', error);
        throw error;
      }
    } catch (err) {
      const msg = 'Rezervasyon silinemedi: ' + (err.message || 'Veritabanı hatası');
      throw new Error(msg);
    }
  }

  // 4. Update local state ONLY on DB success
  if (typeof appData !== 'undefined') {
    // Yapilmis ya da odenmis temizlik gercek bir gider/borctur ve kalir
    // (bagi bosalir); yalniz planli/yapilmamis gorev rezervasyonla gider.
    if (appData.cleaningTasks) {
      appData.cleaningTasks = appData.cleaningTasks.map(t => {
        if (t.bookingId === propBookingId || t.bookingId === bookingId) {
          if (t.paid || t.is_paid || t.status === 'DONE') return { ...t, bookingId: null };
          return null;
        }
        return t;
      }).filter(Boolean);
    }

    if (appData.bookings) {
      appData.bookings = appData.bookings.filter(b => b.id !== propBookingId && b.id !== bookingId && b.code !== bookingId);
    }

    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    if (typeof closeBookingModal === 'function') closeBookingModal();
    if (typeof alert === 'function') alert('🗑️ Rezervasyon başarıyla silindi.');
  }

  return true;
}

async function deleteBookingUI(bookingId) {
  try {
    return await deleteBooking(bookingId);
  } catch (error) {
    if (typeof alert === 'function') alert(error?.message || 'Rezervasyon silinemedi.');
    return false;
  }
}

// Backwards compatibility wrappers
async function cloudUpsertBooking(bookingRecord) {
  if (bookingRecord && bookingRecord.id && isUUID(bookingRecord.id)) {
    return await updateBooking(bookingRecord.id, bookingRecord);
  } else {
    return await createBooking(bookingRecord);
  }
}

async function cloudDeleteBooking(id) {
  return await deleteBooking(id);
}

// =============================================================
// 💰 FINANCE & EXPENSES MANAGEMENT (SUPABASE POSTGRESQL SOURCE OF TRUTH)
// =============================================================

function roundMoney(val) {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function mapExpenseFromDb(row) {
  if (!row) return null;
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  // Resolve villa slug from property_id
  let villaSlug = 'ALL';
  if (row.property_id && currentAppData && currentAppData.villas) {
    const foundProp = Object.values(currentAppData.villas).find(p => p.id === row.property_id);
    if (foundProp) villaSlug = foundProp.slug || foundProp.name || row.property_id;
    else villaSlug = row.property_id;
  }

  const dateStr = (typeof row.expense_date === 'string') ? row.expense_date.substring(0, 10) : '';

  return {
    id: row.id,
    dbId: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id || null,
    villa: villaSlug,
    date: dateStr,
    month: dateStr ? dateStr.substring(0, 7) : '',
    category: row.category || 'Diğer',
    type: row.expense_type || (row.category === 'Tadilat' || row.category === 'Yatırım' ? 'CAPEX' : 'OPEX'),
    amount: roundMoney(row.amount),
    description: row.description || '',
    bookingId: row.booking_id || null,
    legacyId: row.legacy_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapExpenseToDb(expense, targetTenantId) {
  if (!expense) return null;
  const tenantId = targetTenantId || getActiveTenantId();
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  // Resolve property UUID
  let propertyId = null;
  if (expense.propertyId && isUUID(expense.propertyId)) {
    propertyId = expense.propertyId;
  } else if (expense.property_id && isUUID(expense.property_id)) {
    propertyId = expense.property_id;
  } else if (expense.villa && expense.villa !== 'ALL') {
    if (isUUID(expense.villa)) {
      propertyId = expense.villa;
    } else if (currentAppData && currentAppData.villas && currentAppData.villas[expense.villa]) {
      propertyId = currentAppData.villas[expense.villa].id;
    }
  }

  // Resolve date safely
  let dateStr = expense.date || expense.expense_date || getTodayStr();
  if (typeof dateStr === 'string') dateStr = dateStr.substring(0, 10);

  // Booking ID validation
  let bookingId = null;
  if (expense.bookingId && isUUID(expense.bookingId)) {
    bookingId = expense.bookingId;
  } else if (expense.booking_id && isUUID(expense.booking_id)) {
    bookingId = expense.booking_id;
  }

  const payload = {
    tenant_id: tenantId,
    property_id: propertyId,
    expense_date: dateStr,
    category: (expense.category || 'Diğer').trim(),
    expense_type: (expense.type === 'CAPEX' || expense.expense_type === 'CAPEX') ? 'CAPEX' : 'OPEX',
    amount: roundMoney(expense.amount),
    description: (expense.description || expense.desc || '').trim(),
    updated_at: new Date().toISOString()
  };

  if (bookingId) {
    payload.booking_id = bookingId;
  }

  if (expense.id && isUUID(expense.id)) {
    payload.id = expense.id;
  }

  // legacy_id ONLY for migration idempotency
  if (expense.legacyId) {
    payload.legacy_id = expense.legacyId;
  } else if (expense.legacy_id) {
    payload.legacy_id = expense.legacy_id;
  }

  return payload;
}

async function loadExpenses(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    return (typeof appData !== 'undefined' && appData.expenses) ? appData.expenses : [];
  }
  try {
    const data = await fetchAllCloudRows(() => supabaseClient
      .from('expenses').select('*').eq('tenant_id', tenantId)
      .order('expense_date', { ascending: false }));

    const mapped = (data || []).map(mapExpenseFromDb).filter(Boolean);
    if (typeof appData !== 'undefined') {
      appData.expenses = mapped;
      if (typeof renderExpensesTable === 'function') renderExpensesTable();
      if (typeof renderFinance === 'function') renderFinance();
    }
    return mapped;
  } catch (err) {
    // Hata YUTULMAZ (L-38). Eskiden onceki isletmenin/oturumun eski gider
    // listesi donuyor ve yukleme durumu yine READY yaziliyordu: kullanici
    // "yuklenemedi" yerine yanlis veriyi dogru saniyordu.
    console.error('loadExpenses error:', err);
    throw err;
  }
}

// =============================================================
// PHASE 8: FINANCIAL INTELLIGENCE & MONTHLY TARGETS / CLOSES
// =============================================================

function isPeriodClosed(dateOrYearMonth) {
  if (!dateOrYearMonth) return false;
  const ym = String(dateOrYearMonth).substring(0, 7);
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  const list = (currentAppData && currentAppData.closedPeriods) ? currentAppData.closedPeriods : [];
  return list.some(cp => cp.year === y && cp.month === m && cp.status === 'CLOSED');
}

/**
 * Bir konaklamanin gecelerinden HERHANGI BIRI kapali bir aya dusuyor mu?
 *
 * Yalnizca giris ayina bakmak yetmez: 04-28 -> 05-03 rezervasyonu Mayis
 * kapaliyken de kapali doneme 2 gece ciro ekler. Sunucudaki
 * fn_range_touches_closed_period() ile ayni kurali uygular.
 */
function isStayPeriodClosed(checkIn, checkOut) {
  if (!checkIn) return false;
  if (!checkOut) return isPeriodClosed(checkIn);

  const gun = 86400000;
  const bas = Date.parse(String(checkIn).substring(0, 10) + 'T00:00:00Z');
  const bit = Date.parse(String(checkOut).substring(0, 10) + 'T00:00:00Z');
  if (!isFinite(bas) || !isFinite(bit) || bit <= bas) return isPeriodClosed(checkIn);

  // Geceler [checkIn, checkOut-1]. Ay ay ilerlemek yeterli; tum gunleri
  // dolasmaya gerek yok.
  const sonGece = bit - gun;
  let imlec = Date.UTC(new Date(bas).getUTCFullYear(), new Date(bas).getUTCMonth(), 1);
  while (imlec <= sonGece) {
    const d = new Date(imlec);
    const ym = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    if (isPeriodClosed(ym)) return true;
    imlec = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return false;
}

async function loadMonthlyTargets(year, month) {
  const tenantId = getActiveTenantId();
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  if (!isCloudTenant(tenantId)) {
    return (currentAppData && Array.isArray(currentAppData.targets)) ? currentAppData.targets : [];
  }
  try {
    let q = supabaseClient.from('monthly_targets').select('*').eq('tenant_id', tenantId);
    if (year) q = q.eq('year', year);
    if (month) q = q.eq('month', month);
    const { data, error } = await q;
    if (!error && data) {
      if (currentAppData) currentAppData.targets = data;
      return data;
    }
  } catch (err) {
    console.error('loadMonthlyTargets error:', err);
  }
  return (currentAppData && Array.isArray(currentAppData.targets)) ? currentAppData.targets : [];
}

function hedefDegeri(a, b) {
  const v = a !== undefined ? a : b;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function saveMonthlyTarget(targetInput) {
  const tenantId = getActiveTenantId();
  if (!targetInput || !targetInput.year || !targetInput.month) {
    throw new Error('Hedef yılı ve ayı zorunludur.');
  }
  const isCloud = !!(isCloudTenant(tenantId));
  const payload = {
    tenant_id: tenantId,
    property_id: targetInput.propertyId || targetInput.property_id || null,
    year: Number(targetInput.year),
    month: Number(targetInput.month),
    // Girilmemis hedef null kalir (sutunlar bos olabilir); 0'a cevrilmez.
    revenue_target: hedefDegeri(targetInput.revenueTarget, targetInput.revenue_target),
    net_profit_target: hedefDegeri(targetInput.netProfitTarget, targetInput.net_profit_target),
    margin_target: hedefDegeri(targetInput.marginTarget, targetInput.margin_target),
    occupancy_target: hedefDegeri(targetInput.occupancyTarget, targetInput.occupancy_target),
    adr_target: hedefDegeri(targetInput.adrTarget, targetInput.adr_target),
    revpar_target: hedefDegeri(targetInput.revparTarget, targetInput.revpar_target),
    max_expense_target: hedefDegeri(targetInput.maxExpenseTarget, targetInput.max_expense_target),
    updated_at: new Date().toISOString()
  };

  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  if (!isCloud) {
    if (currentAppData) {
      if (!Array.isArray(currentAppData.targets)) currentAppData.targets = [];
      const idx = currentAppData.targets.findIndex(t => t.year === payload.year && t.month === payload.month && t.property_id === payload.property_id);
      if (idx !== -1) {
        currentAppData.targets[idx] = { ...currentAppData.targets[idx], ...payload };
      } else {
        payload.id = 'target_' + Date.now();
        currentAppData.targets.push(payload);
      }
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
    }
    return payload;
  }

  let query;
  if (!payload.property_id) {
    query = supabaseClient.from('monthly_targets')
      .upsert(payload, { onConflict: 'tenant_id, year, month' });
  } else {
    query = supabaseClient.from('monthly_targets')
      .upsert(payload, { onConflict: 'tenant_id, property_id, year, month' });
  }
  const { data, error } = await query.select().single();
  if (error) {
    throw new Error('Hedef kaydedilemedi: ' + (error.message || 'Veritabanı hatası'));
  }
  await loadMonthlyTargets();
  invalidateExecutiveSnapshotCache();
  if (typeof renderAll === 'function') renderAll();
  return data;
}

async function loadMonthlyCloses() {
  const tenantId = getActiveTenantId();
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  if (!isCloudTenant(tenantId)) {
    return (currentAppData && currentAppData.closedPeriods) ? currentAppData.closedPeriods : [];
  }
  try {
    const { data, error } = await supabaseClient.from('monthly_financial_closes').select('*').eq('tenant_id', tenantId);
    if (!error && data) {
      if (currentAppData) currentAppData.closedPeriods = data;
      return data;
    }
  } catch (err) {
    console.error('loadMonthlyCloses error:', err);
  }
  return (currentAppData && currentAppData.closedPeriods) ? currentAppData.closedPeriods : [];
}

async function closeMonthlyPeriod(year, month) {
  const tenantId = getActiveTenantId();
  let fms = (typeof FinancialMetricsService !== 'undefined') ? FinancialMetricsService : null;
  if (!fms && typeof require !== 'undefined') {
    try { fms = require('./core/financial_metrics_service'); } catch (e) {}
  }
  if (!fms && typeof window !== 'undefined') fms = window.FinancialMetricsService;

  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  const metrics = fms ? fms.computeFinancialMetrics({
    year,
    month,
    propertyId: null,
    bookings: currentAppData?.bookings || [],
    expenses: currentAppData?.expenses || [],
    properties: Object.values(currentAppData?.villas || {}),
    targets: currentAppData?.targets || [],
    maintenances: currentAppData?.maintenance || []
  }) : { financial: {}, operations: {}, targets: {}, reconciliation: {} };

  const snapshot = {
    schemaVersion: 1,
    period: `${year}-${String(month).padStart(2, '0')}`,
    closedAt: new Date().toISOString(),
    closedBy: null,
    financial: metrics.financial,
    operations: metrics.operations,
    targets: metrics.targets,
    reconciliation: metrics.reconciliation
  };

  const isCloud = !!(isCloudTenant(tenantId));
  if (!isCloud) {
    if (currentAppData) {
      if (!currentAppData.closedPeriods) currentAppData.closedPeriods = [];
      const idx = currentAppData.closedPeriods.findIndex(cp => cp.year === year && cp.month === month);
      const closeRec = {
        id: 'close_' + Date.now(),
        tenant_id: tenantId,
        year,
        month,
        status: 'CLOSED',
        closed_at: snapshot.closedAt,
        snapshot_json: snapshot
      };
      if (idx !== -1) currentAppData.closedPeriods[idx] = closeRec;
      else currentAppData.closedPeriods.push(closeRec);
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
      return closeRec;
    }
    return { success: true };
  }

  const { data, error } = await supabaseClient.rpc('close_monthly_period_atomic', {
    p_tenant_id: tenantId,
    p_year: Number(year),
    p_month: Number(month),
    p_snapshot: snapshot
  });

  if (error) {
    if (/PERIOD_NOT_ENDED/.test(String(error.message || ''))) {
      throw new Error('Dönem kapatılamadı: ay henüz bitmedi. Ayın son gününden sonra kapatabilirsiniz.');
    }
    throw new Error('Dönem kapatılamadı: ' + (error.message || 'Veritabanı hatası'));
  }
  await loadMonthlyCloses();
  if (typeof renderAll === 'function') renderAll();
  return data;
}

/**
 * Kapatilmis bir donemi yeniden acar.
 *
 * Kapatmaktan daha agir bir islemdir: yalnizca owner/admin yapabilir ve
 * gerekce zorunludur. Kapanis kaydi SILINMEZ; anlik goruntu korunur ve
 * islem history_json'a islenir. Yetki ve gerekce denetimi sunucudadir
 * (reopen_monthly_period_atomic); buradaki kontroller yalnizca kullaniciyi
 * bosuna bekletmemek icin.
 */
async function reopenMonthlyPeriod(year, month, reason) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Dönem açma', tenantId);

  const gerekce = (reason || '').trim();
  if (gerekce.length < 10) {
    throw new Error('Dönemi yeniden açmak için en az 10 karakterlik bir gerekçe yazmalısınız. Bu gerekçe denetim kaydına işlenir.');
  }

  const { data, error } = await supabaseClient.rpc('reopen_monthly_period_atomic', {
    p_tenant_id: tenantId,
    p_year: Number(year),
    p_month: Number(month),
    p_reason: gerekce
  });

  if (error) {
    throw new Error('Dönem yeniden açılamadı: ' + (error.message || 'Veritabanı hatası'));
  }
  await loadMonthlyCloses();
  if (typeof renderAll === 'function') renderAll();
  return data;
}

/** AI aksiyonundan uretilen gorevin kaynagini kayitta isaretleyen satir. */
const AI_AKSIYON_ETIKETI = 'AI-AKSIYON:';

function buildAiActionDescription(actionKey, metric) {
  // `maintenance_tickets` tablosunda metadata sutunu yok ve yeni sutun
  // acmiyoruz (3.4'teki gerekce: gocler elle uygulaniyor, GitHub Pages
  // aninda yayinliyor). Mukerrer kontrolunun dayanagi olan anahtar bu
  // yuzden aciklama alaninda, makine tarafindan okunabilir bir satirda
  // tasinir — boylece yeniden yuklemeden SONRA da calisir.
  return `Sorumlu: Finans Yöneticisi\n${AI_AKSIYON_ETIKETI}${actionKey}` +
    (metric ? `\nMetrik: ${metric}` : '');
}

/**
 * AI finans onerisini operasyonel bakim kaydina cevirir.
 *
 * Bir zamanlar kaydi yalnizca `appData.maintenance`'a itip saveAppData()
 * cagiriyordu; hicbir sey yazilmiyordu ve gorev sayfa yenilenince
 * kayboluyordu. Ayrica mukerrer kontrolu bellekteki `metadata.actionKey`'e
 * bakiyordu — o alan da yenilemede yok oldugu icin ayni oneri her oturumda
 * yeniden goreve donusturulebiliyordu.
 */
async function convertAiActionToTask(actionTitle, propertyId, priority, metric) {
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  if (!currentAppData) return false;
  if (!currentAppData.maintenance) currentAppData.maintenance = [];

  const period = (typeof currentFilter !== 'undefined' && currentFilter.period) ? currentFilter.period : getCurrentMonthKey();
  const actionKey = `${actionTitle}|${propertyId || 'ALL'}|${period}`;
  const isDup = currentAppData.maintenance.some(t =>
    (t.metadata && t.metadata.actionKey === actionKey) ||
    (typeof t.description === 'string' && t.description.includes(AI_AKSIYON_ETIKETI + actionKey))
  );
  if (isDup) {
    if (typeof showToast === 'function') showToast('Bu öneri için zaten görev oluşturulmuş.', 'info');
    return false;
  }

  const tenantId = (typeof getActiveTenantId === 'function') ? getActiveTenantId() : null;
  if (typeof window !== 'undefined' && isCloudTenant(tenantId)) {
    // `maintenance_tickets.property_id` NOT NULL: portfoy geneli bir oneri
    // kayda donusturulemez. Rastgele bir mulke yazmak yerine soylenir.
    const propUuid = (currentAppData.villas && currentAppData.villas[propertyId]?.id)
      || (isUUID(propertyId) ? propertyId : null);
    if (!propUuid) {
      if (typeof showToast === 'function') {
        showToast('Bu öneri portföy geneli. Göreve dönüştürmek için önce bir mülk seçin.', 'info');
      }
      return false;
    }
    try {
      await createMaintenanceTicket({
        property_id: propUuid,
        category: 'FINANCE_AI',
        severity: priority === 'HIGH' ? 'CRITICAL' : 'HIGH',
        title: String(actionTitle).slice(0, 255),
        description: buildAiActionDescription(actionKey, metric),
        status: 'OPEN',
        estimated_cost: 0
      });
      await loadTenantAppData(tenantId);
    } catch (err) {
      if (typeof showToast === 'function') {
        showToast('⚠️ Görev kaydedilemedi: ' + (err?.message || 'veritabanı hatası'), 'error');
      }
      return false;
    }
    if (typeof showToast === 'function') showToast('AI finansal aksiyonu başarıyla operasyonel göreve dönüştürüldü.', 'success');
    return true;
  }

  const newTask = {
    id: 'M-AI-' + (currentAppData.maintenance.length + 1),
    villa: propertyId || 'ALL',
    priority: priority === 'HIGH' ? 'P1' : 'P2',
    title: actionTitle,
    assignee: 'Finans Yöneticisi',
    downtime: 0,
    cost: 0,
    status: 'OPEN',
    description: buildAiActionDescription(actionKey, metric),
    metadata: {
      source: 'FINANCE_AI',
      propertyId: propertyId || null,
      financialPeriod: period,
      sourceMetric: metric || null,
      actionKey
    }
  };

  currentAppData.maintenance.unshift(newTask);
  if (typeof renderAll === 'function') renderAll();
  if (typeof showToast === 'function') showToast('AI finansal aksiyonu başarıyla operasyonel göreve dönüştürüldü.', 'success');
  return true;
}

async function createExpense(expenseInput) {
  if (!expenseInput) throw new Error('Gider bilgisi girilmedi.');
  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));
  requireCloudForWrite('Gider', tenantId);

  // 1. Validation
  const amt = roundMoney(expenseInput.amount);
  if (isNaN(amt) || amt <= 0) {
    throw new Error('Gider tutarı 0 veya negatif olamaz.');
  }

  const dateStr = expenseInput.date || expenseInput.expense_date;
  if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    throw new Error('Geçerli bir gider tarihi (YYYY-MM-DD) zorunludur.');
  }
  if (isPeriodClosed(dateStr)) {
    throw new Error(`Bu dönem (${dateStr.substring(0, 7)}) kapatılmıştır (Closed Period). Gider eklenemez.`);
  }

  const category = (expenseInput.category || '').trim();
  if (!category) {
    throw new Error('Gider kategorisi zorunludur.');
  }

  const expType = (expenseInput.type === 'CAPEX' || expenseInput.expense_type === 'CAPEX') ? 'CAPEX' : 'OPEX';

  // Resolve property UUID and verify active tenant ownership
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  let propId = expenseInput.propertyId || expenseInput.property_id;
  if (!propId && expenseInput.villa && expenseInput.villa !== 'ALL') {
    if (isUUID(expenseInput.villa)) {
      propId = expenseInput.villa;
    } else if (currentAppData?.villas?.[expenseInput.villa]) {
      propId = currentAppData.villas[expenseInput.villa].id;
    }
  }

  if (currentAppData?.villas && propId) {
    const validPropertyIds = Object.values(currentAppData.villas).map(p => p.id).filter(Boolean);
    if (validPropertyIds.length > 0 && !validPropertyIds.includes(propId)) {
      throw new Error('Seçilen mülk aktif işletmenize ait değildir.');
    }
  }

  // Resolve booking UUID and verify active tenant ownership
  let bookingId = expenseInput.bookingId || expenseInput.booking_id;
  if (bookingId && !isUUID(bookingId)) bookingId = null;
  if (currentAppData?.bookings && bookingId) {
    const validBookingIds = currentAppData.bookings.map(b => b.id || b.dbId).filter(Boolean);
    if (validBookingIds.length > 0 && !validBookingIds.includes(bookingId)) {
      throw new Error('Seçilen rezervasyon aktif işletmenize ait değildir.');
    }
  }

  // 2. Offline / demo fallback
  if (!isCloud) {
    const newId = 'local_exp_' + Date.now();
    const localRecord = {
      id: newId,
      dbId: newId,
      tenantId: tenantId || 'usr_ute_master',
      propertyId: propId || null,
      villa: expenseInput.villa || 'ALL',
      date: dateStr.substring(0, 10),
      month: dateStr.substring(0, 7),
      category,
      type: expType,
      amount: amt,
      description: (expenseInput.description || expenseInput.desc || '').trim(),
      bookingId: bookingId || null,
      legacyId: null
    };
    if (currentAppData) {
      if (!currentAppData.expenses) currentAppData.expenses = [];
      currentAppData.expenses.push(localRecord);
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
    }
    return localRecord;
  }

  // 3. Awaited DB write
  const payload = mapExpenseToDb({
    ...expenseInput,
    propertyId: propId,
    bookingId: bookingId,
    amount: amt,
    category,
    type: expType,
    date: dateStr.substring(0, 10)
  }, tenantId);
  delete payload.id; // DB generates gen_random_uuid()

  if (!expenseInput.legacyId && !expenseInput.legacy_id) {
    delete payload.legacy_id;
  }

  const { data, error } = await supabaseClient
    .from('expenses')
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    console.error('createExpense DB error:', error);
    if (error?.code === '42501' || error?.message?.includes('CROSS_TENANT')) {
      throw new Error(error.message || 'Seçilen mülk veya rezervasyon aktif işletmenize ait değildir.');
    }
    if (error?.code === '23514') {
      throw new Error('Gider tutarı, kategorisi veya tipi geçersizdir (DB Constraint).');
    }
    throw new Error('Gider kaydedilemedi: ' + (error?.message || 'Veritabanı hatası'));
  }

  // 4. Update local state ONLY on DB success
  const mapped = mapExpenseFromDb(data);
  if (currentAppData) {
    if (!currentAppData.expenses) currentAppData.expenses = [];
    currentAppData.expenses.push(mapped);
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderExpensesTable === 'function') renderExpensesTable();
    if (typeof renderFinance === 'function') renderFinance();
  }

  return mapped;
}

async function updateExpense(expenseId, expenseInput) {
  if (!expenseId) throw new Error('Güncellenecek gider ID belirtilmedi.');
  if (!expenseInput) throw new Error('Gider güncelleme bilgisi girilmedi.');
  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));

  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
  let existing = null;
  let existingIdx = -1;
  if (currentAppData?.expenses) {
    existingIdx = currentAppData.expenses.findIndex(e => e.id === expenseId || e.dbId === expenseId);
    if (existingIdx !== -1) existing = currentAppData.expenses[existingIdx];
  }

  const propExpenseId = existing?.id || (isUUID(expenseId) ? expenseId : null);
  if (!propExpenseId && isCloud) {
    throw new Error('Güncellenecek giderin kimliği bulunamadı.');
  }

  // 1. Validation
  const amt = expenseInput.amount !== undefined ? roundMoney(expenseInput.amount) : existing?.amount;
  if (amt !== undefined && (isNaN(amt) || amt <= 0)) {
    throw new Error('Gider tutarı 0 veya negatif olamaz.');
  }

  const dateStr = expenseInput.date || expenseInput.expense_date || existing?.date;
  if (dateStr && (!/^\d{4}-\d{2}-\d{2}/.test(dateStr))) {
    throw new Error('Geçerli bir gider tarihi (YYYY-MM-DD) zorunludur.');
  }
  if (dateStr && isPeriodClosed(dateStr)) {
    throw new Error(`Bu dönem (${dateStr.substring(0, 7)}) kapatılmıştır (Closed Period). Gider güncellenemez.`);
  }

  const category = expenseInput.category !== undefined ? (expenseInput.category || '').trim() : existing?.category;
  if (category !== undefined && !category) {
    throw new Error('Gider kategorisi zorunludur.');
  }

  const expType = expenseInput.type ? (expenseInput.type === 'CAPEX' ? 'CAPEX' : 'OPEX') : (existing?.type || 'OPEX');

  // Verify property ownership
  let propId = expenseInput.propertyId || expenseInput.property_id || existing?.propertyId;
  if (!propId && expenseInput.villa && expenseInput.villa !== 'ALL') {
    if (isUUID(expenseInput.villa)) {
      propId = expenseInput.villa;
    } else if (currentAppData?.villas?.[expenseInput.villa]) {
      propId = currentAppData.villas[expenseInput.villa].id;
    }
  }

  if (currentAppData?.villas && propId) {
    const validPropertyIds = Object.values(currentAppData.villas).map(p => p.id).filter(Boolean);
    if (validPropertyIds.length > 0 && !validPropertyIds.includes(propId)) {
      throw new Error('Seçilen mülk aktif işletmenize ait değildir.');
    }
  }

  // 2. Offline / demo fallback
  if (!isCloud) {
    if (!existing) {
      throw new Error('Güncellenecek gider bulunamadı.');
    }
    const updated = {
      ...(existing || {}),
      propertyId: propId || null,
      villa: expenseInput.villa || existing?.villa || 'ALL',
      date: dateStr ? dateStr.substring(0, 10) : existing?.date,
      month: dateStr ? dateStr.substring(0, 7) : existing?.month,
      category: category || existing?.category || 'Diğer',
      type: expType,
      amount: amt !== undefined ? amt : existing?.amount,
      description: expenseInput.description !== undefined ? expenseInput.description : existing?.description
    };
    if (existingIdx !== -1 && currentAppData?.expenses) {
      currentAppData.expenses[existingIdx] = updated;
    }
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    return updated;
  }

  // 3. Awaited DB update
  const payload = {
    property_id: propId || null,
    expense_date: dateStr ? dateStr.substring(0, 10) : undefined,
    category: category,
    expense_type: expType,
    amount: amt,
    description: expenseInput.description !== undefined ? expenseInput.description.trim() : undefined,
    updated_at: new Date().toISOString()
  };
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const { data, error } = await supabaseClient
    .from('expenses')
    .update(payload)
    .eq('id', propExpenseId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error || !data) {
    console.error('updateExpense DB error:', error);
    if (error?.code === '42501' || error?.message?.includes('CROSS_TENANT')) {
      throw new Error(error.message || 'Seçilen mülk veya rezervasyon aktif işletmenize ait değildir.');
    }
    if (error?.code === '23514') {
      throw new Error('Gider tutarı, kategorisi veya tipi geçersizdir (DB Constraint).');
    }
    throw new Error('Gider güncellenemedi: ' + (error?.message || 'Veritabanı hatası'));
  }

  // 4. Update local state ONLY on DB success
  const mapped = mapExpenseFromDb(data);
  if (currentAppData?.expenses) {
    const idx = currentAppData.expenses.findIndex(e => e.id === propExpenseId || e.dbId === propExpenseId);
    if (idx !== -1) {
      currentAppData.expenses[idx] = mapped;
    }
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderExpensesTable === 'function') renderExpensesTable();
    if (typeof renderFinance === 'function') renderFinance();
  }

  return mapped;
}

async function deleteExpense(expenseId, skipConfirm = false) {
  if (!expenseId) throw new Error('Silinecek gider ID belirtilmedi.');
  if (!skipConfirm && typeof confirm === 'function') {
    const ok = confirm('Bu harcamayı silmek istediğinizden emin misiniz?');
    if (!ok) return false;
  }

  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  const existing = currentAppData?.expenses ? currentAppData.expenses.find(e => e.id === expenseId || e.dbId === expenseId) : null;
  const propExpenseId = existing?.id || (isUUID(expenseId) ? expenseId : null);

  const expDate = existing?.date || existing?.expense_date;
  if (expDate && isPeriodClosed(expDate)) {
    throw new Error(`Bu dönem (${expDate.substring(0, 7)}) kapatılmıştır (Closed Period). Gider silinemez.`);
  }

  // 1. Awaited DB delete
  if (isCloud && propExpenseId) {
    const { error } = await supabaseClient
      .from('expenses')
      .delete()
      .eq('id', propExpenseId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('deleteExpense DB error:', error);
      const msg = 'Gider silinemedi: ' + (error.message || 'Veritabanı hatası');
      if (typeof alert === 'function') alert(msg);
      throw new Error(msg);
    }
  }

  // 2. Update local state ONLY on DB success
  if (currentAppData) {
    // Eski bir EXP-CLEAN-* satiri silindiginde gorevin odeme durumu
    // DEGISMEZ: eskiden yalniz bellekte "odenmedi" yapiliyor, veritabaninda
    // odenmis kaliyordu (L-30). K-04'ten beri maliyet gorevden okunur.
    if (currentAppData.expenses) {
      currentAppData.expenses = currentAppData.expenses.filter(e => e.id !== propExpenseId && e.id !== expenseId && e.dbId !== expenseId);
    }
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
    if (typeof renderExpensesTable === 'function') renderExpensesTable();
    if (typeof renderFinance === 'function') renderFinance();
    if (typeof window !== 'undefined' && window.showToast) window.showToast('🗑️ Harcama başarıyla silindi.');
  }

  return true;
}

// Backwards compatibility wrappers
async function cloudUpsertExpense(exp) {
  if (exp && exp.id && isUUID(exp.id)) {
    return await updateExpense(exp.id, exp);
  } else {
    return await createExpense(exp);
  }
}

async function cloudDeleteExpense(expId) {
  return await deleteExpense(expId, true);
}

/**
 * Bir temizlik gorevini Postgres'e yazar.
 *
 * ID'nin iki hali vardir ve BIRBIRINE KARISTIRILAMAZ:
 *   • Bulut yuklemesinden gelen gorevin `id`'si satirin UUID'sidir
 *     (bkz. loadAppData -> cleaningTasks esleyicisi).
 *   • Arayuzde yeni yaratilan gorevin `id`'si `TASK-CLN-...` gibi bir
 *     yerel anahtardir; satirin `legacy_id`'si olur.
 *
 * Bir zamanlar her iki hal de `legacy_id`'ye yaziliyordu. Sonuc: kullanici
 * "Ödendi" deyip sayfayi yeniledikten sonra AYNI goreve ikinci kez
 * dokundugunda, artik elindeki UUID `legacy_id` olarak gonderiliyor,
 * `tenant_id + legacy_id` benzersizligi tutmuyor ve Postgres MUKERRER bir
 * gorev satiri aciyordu — temizlik borcu iki kez gorunuyordu.
 */
async function cloudUpsertCleaningTask(task) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return null;
  requireCloudForWrite('Temizlik görevi', tenantId);
  const propId = await getPropertyIdBySlug(task.villa, tenantId);
  if (!propId) {
    throw new Error('Temizlik görevi kaydedilemedi: "' + (task.villa || '—') + '" mülkü bulunamadı.');
  }
  const satir = {
    tenant_id: tenantId,
    property_id: propId,
    task_date: task.date || getTodayStr(),
    cleaner_name: task.cleaner || 'Temizlik Ekibi',
    amount: Number(task.amount) || 0,
    description: task.notes || task.desc || '',
    is_paid: !!task.paid,
    // Ödenmis ama yapilmamis temizlik olmaz (phase45 CHECK).
    status: task.paid ? 'DONE' : (task.status || 'PLANNED'),
    created_by: activeSaaSUser?.id
  };
  // Rezervasyon bagi (L-28). Yazilmadiginda odenmis gorev yeniden yuklemede
  // rezervasyonuyla eslesmiyor ve ayni temizlik yeniden borc doguyordu.
  const rezId = task.bookingId && isUUID(task.bookingId) ? task.bookingId : null;
  if (rezId) satir.booking_id = rezId;

  let sorgu;
  const knownDbId = task.dbId && isUUID(task.dbId)
    ? task.dbId
    : (task.id && isUUID(task.id) ? task.id : null);
  if ((task.id && isUUID(task.id)) || (knownDbId && isUUID(knownDbId))) {
    // Bilinen satir: birincil anahtardan guncelle.
    satir.id = knownDbId;
    if (task.legacyId) satir.legacy_id = task.legacyId;
    sorgu = supabaseClient.from('cleaning_tasks').upsert(satir, { onConflict: 'id' });
  } else {
    satir.legacy_id = task.id || ('TASK-' + Date.now().toString());
    sorgu = supabaseClient.from('cleaning_tasks').upsert(satir, { onConflict: 'tenant_id, legacy_id' });
  }

  const { data, error } = await sorgu
    .select('id, legacy_id, property_id, booking_id, task_date, cleaner_name, amount, description, is_paid, status, completed_at')
    .single();
  if (error) {
    // GitHub Pages kodu gocten once yayinlar (CLAUDE.md 3.4). Durum sutunu
    // yoksa kullaniciya ham PostgREST mesaji degil, sebep soylenir.
    if (isMissingSchemaError(error) || /status|completed_at/.test(String(error.message || ''))) {
      throw new Error('Temizlik görevi kaydedilemedi: veritabanı güncellemesi (phase45) henüz uygulanmamış.');
    }
    throw new Error('Temizlik görevi kaydedilemedi: ' + (error.message || 'veritabanı hatası'));
  }
  return data;
}

async function cloudDeleteCleaningTask(taskId) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return;
  requireCloudForWrite('Temizlik görevi silme', tenantId);
  const eslesme = isUUID(taskId)
    ? { tenant_id: tenantId, id: taskId }
    : { tenant_id: tenantId, legacy_id: taskId };
  const { error } = await supabaseClient.from('cleaning_tasks').delete().match(eslesme);
  if (error) {
    throw new Error('Temizlik görevi silinemedi: ' + (error.message || 'veritabanı hatası'));
  }
}

// -------------------------------------------------------------
// TEMIZLIK GIDERI — K-04 (phase45)
// -------------------------------------------------------------
// Temizlik gideri "yapildi" aninda dogar ve temizlik defterinden okunur
// (core/ledger_contract.js). "Odendi" yalniz odeme durumudur; gider defterine
// satir YAZMAZ. Bir zamanlar yaziyordu: gider odeme gununun ayina dusuyor,
// odenmemis ama yapilmis temizlik hic gider sayilmiyordu.
//
// O donemden kalan `EXP-CLEAN-<gorev>` satirlari silinmez (kapanmis aylarda
// durabilirler). Defter formulu satiri olan gorevi ikinci kez saymaz.

/** Eski istemcinin bu gorev icin yazdigi gider satirinin anahtari. */
function cleaningExpenseKey(task) {
  // Gorevin VERITABANI kimligi, yeniden yuklemeden sonra da ayni kalan tek
  // anahtardir; eski satirlarin cogu bununla yazildi.
  return 'EXP-CLEAN-' + (task.dbId || task.id);
}

/** Bu gorevin eski bir EXP-CLEAN-* gider satiri var mi (bellekte)? */
function findLegacyCleaningExpense(task) {
  const adaylar = new Set([task.dbId, task.id, task.legacyId].filter(Boolean).map(k => 'EXP-CLEAN-' + k));
  return ((typeof appData !== 'undefined' && appData.expenses) || [])
    .find(e => adaylar.has(e.legacyId) || adaylar.has(e.id)) || null;
}

async function cloudDeleteCleaningExpense(legacyId) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return;
  requireCloudForWrite('Temizlik gideri silme', tenantId);
  const { error } = await supabaseClient.from('expenses').delete().match({
    tenant_id: tenantId,
    legacy_id: legacyId
  });
  if (error) {
    throw new Error('Temizlik gideri silinemedi: ' + (error.message || 'veritabanı hatası'));
  }
}

/**
 * Bir temizlik gorevini kalici hale getirir: yalniz gorev satiri.
 *
 * Eski bir EXP-CLEAN-* satiri olan gorev "odenmedi" ya da "yapilmadi"ya
 * cekilirse o satir silinir; maliyet artik gorevden (yapildiysa) okunur.
 * Aksi halde eski satir odemeyi gider gibi gostermeye devam ederdi.
 *
 * Bu fonksiyon HATA YUTMAZ: cagiran taraf yazmanin gerceklestigini
 * varsayamaz, basarisizlik kullaniciya soylenir (3.3).
 */
async function persistCleaningLedgerEntry(task) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return { yazildi: false, sebep: 'YEREL' };

  const eskiGider = findLegacyCleaningExpense(task);
  const satir = await cloudUpsertCleaningTask(task);
  if (satir && satir.id) {
    Object.assign(task, normalizeCleaningTask({
      ...task,
      ...satir,
      dbId: satir.id,
      legacyId: satir.legacy_id || task.legacyId || (!isUUID(task.id) ? task.id : null)
    }, (typeof appData !== 'undefined' && appData.villas) || {}));
  }

  if (eskiGider && (!task.paid || task.status !== 'DONE')) {
    await cloudDeleteCleaningExpense(eskiGider.legacyId || eskiGider.id);
    if (typeof appData !== 'undefined' && appData.expenses) {
      appData.expenses = appData.expenses.filter(e => e !== eskiGider);
    }
  }
  return { yazildi: true, satir };
}

/**
 * Temizlik defteri yazmalarini arayuz tarafinda tek bicimde raporlar.
 * Basarisizlikta kullaniciya "kaydedilmedi" denir — sessizce gecilmez (3.3).
 */
async function reportCleaningPersist(gorevler, basariMesaji) {
  const liste = Array.isArray(gorevler) ? gorevler : [gorevler];
  try {
    for (const t of liste) await persistCleaningLedgerEntry(t);
    const tutarsiz = liste.filter(t => t.status === 'DONE' && !(Number(t.amount) > 0)).length;
    let mesaj = basariMesaji;
    if (tutarsiz > 0) {
      mesaj += ` (${tutarsiz} yapılmış temizlikte tutar girilmedi; maliyet bilinmiyor.)`;
    }
    if (typeof window !== 'undefined' && window.showToast) window.showToast(mesaj);
    return true;
  } catch (err) {
    const mesaj = '⚠️ ' + (err && err.message ? err.message : 'Kayıt veritabanına yazılamadı.');
    if (typeof window !== 'undefined' && window.showToast) window.showToast(mesaj, 'error');
    else console.error(mesaj);
    // Bellekteki degisiklik ekranda duruyor ama veritabaninda yok. Ekrani
    // gercege geri cek: yoksa kullanici "Ödendi" gorur, defterde yoktur.
    if (typeof loadTenantAppData === 'function' && isCloudTenant(getActiveTenantId())) {
      try { await loadTenantAppData(getActiveTenantId()); } catch (_) { /* yeniden yukleme de dustu */ }
    }
    return false;
  }
}

async function persistCleaningTaskDraft(taskRecord, options) {
  const opts = options || {};
  const write = opts.write || (async task => {
    const sonuc = await persistCleaningLedgerEntry(task);
    if (!sonuc?.yazildi || !sonuc?.satir?.id) {
      throw new Error('Temizlik görevi etkin bir bulut bağlantısı olmadan kaydedilemez.');
    }
    return sonuc.satir;
  });
  const reload = opts.reload || (async () => {
    if (typeof loadTenantAppData === 'function' && isCloudTenant(getActiveTenantId())) {
      await loadTenantAppData(getActiveTenantId());
    }
  });
  const notify = opts.notify || ((message, type) => {
    if (typeof window !== 'undefined' && window.showToast) window.showToast(message, type);
    else if (type === 'error') console.error(message);
  });

  try {
    const dbRow = await write(taskRecord);
    const savedTask = normalizeCleaningTask({
      ...taskRecord,
      ...(dbRow || {}),
      dbId: dbRow?.id || taskRecord.dbId,
      legacyId: dbRow?.legacy_id || taskRecord.legacyId
        || (!isUUID(taskRecord.id) ? taskRecord.id : null)
    }, (typeof appData !== 'undefined' && appData.villas) || {});
    notify(opts.successMessage || '✅ Temizlik kaydı başarıyla kaydedildi.', 'success');
    return { ok: true, task: savedTask, dbRow: dbRow || null };
  } catch (err) {
    notify('⚠️ ' + (err?.message || 'Temizlik kaydı veritabanına yazılamadı.'), 'error');
    try { await reload(); } catch (_) { /* yeniden yukleme de dustu */ }
    return { ok: false, error: err };
  }
}

function upsertCleaningTaskInMemory(task, previousId) {
  if (!appData.cleaningTasks) appData.cleaningTasks = [];
  const identities = new Set([
    previousId,
    task.id,
    task.dbId,
    task.legacyId
  ].filter(Boolean));
  const matches = current => [current.id, current.dbId, current.legacyId]
    .filter(Boolean)
    .some(id => identities.has(id));
  const index = appData.cleaningTasks.findIndex(matches);
  const remaining = appData.cleaningTasks.filter(current => !matches(current));
  remaining.splice(index === -1 ? 0 : Math.min(index, remaining.length), 0, task);
  appData.cleaningTasks = remaining;
}

// =============================================================
// 🎯 LEADS & SALES CRM PIPELINE (SUPABASE POSTGRESQL SOURCE OF TRUTH) - PHASE 7
// =============================================================

const ALLOWED_LEAD_STAGES = ['NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP', 'WON', 'LOST'];
const ALLOWED_LEAD_SOURCES = ['WHATSAPP', 'INSTAGRAM', 'META', 'AIRBNB', 'BOOKING', 'DIRECT', 'PHONE', 'OTHER'];
const ALLOWED_LOST_REASONS = ['Fiyat Yüksek', 'Tarih Dolu', 'Cevap Vermedi', 'Başka Yer Seçti', 'Diğer'];

function mapLeadFromDb(row) {
  if (!row) return null;
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  // Resolve villa slug from property_id
  let villaSlug = 'ALL';
  if (row.property_id && currentAppData && currentAppData.villas) {
    const foundProp = Object.values(currentAppData.villas).find(p => p.id === row.property_id);
    if (foundProp) villaSlug = foundProp.slug || foundProp.name || row.property_id;
    else villaSlug = row.property_id;
  }

  const guestName = (row.guest_name || '').trim();
  const guestPhone = (row.guest_phone || '').trim();
  const guestEmail = (row.guest_email || '').trim();
  const rawStatus = (row.status || 'NEW').toUpperCase();
  const status = ALLOWED_LEAD_STAGES.includes(rawStatus) ? rawStatus : 'NEW';

  return {
    id: row.id,
    dbId: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id || null,
    villa: villaSlug,
    guest: guestPhone ? `${guestName} (${guestPhone})` : (guestName || 'Misafir Talebi'),
    guestName: guestName,
    phone: guestPhone,
    email: guestEmail,
    channel: row.channel || 'WhatsApp',
    source: (row.channel || 'WHATSAPP').toUpperCase(),
    date: row.lead_date || '',
    checkIn: row.requested_check_in || '',
    checkOut: row.requested_check_out || '',
    pax: normalizePositiveInteger(row.pax),
    quote: Number(row.quote_amount) || 0,
    quoteAmount: Number(row.quote_amount) || 0,
    status: status,
    stage: status,
    lostReason: row.lost_reason || '',
    notes: row.notes || '',
    convertedBookingId: row.converted_booking_id || null,
    converted_booking_id: row.converted_booking_id || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapLeadToDb(lead, targetTenantId) {
  if (!lead) return null;
  const tenantId = targetTenantId || getActiveTenantId();
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  // Resolve property UUID
  let propertyId = null;
  if (lead.propertyId && isUUID(lead.propertyId)) {
    propertyId = lead.propertyId;
  } else if (lead.property_id && isUUID(lead.property_id)) {
    propertyId = lead.property_id;
  } else if (lead.villa && lead.villa !== 'ALL' && currentAppData && currentAppData.villas) {
    const foundProp = currentAppData.villas[lead.villa] || Object.values(currentAppData.villas).find(p => p.slug === lead.villa || p.id === lead.villa);
    if (foundProp && foundProp.id) propertyId = foundProp.id;
  }

  // Parse guestName and guestPhone
  let gName = (lead.guestName || lead.guest_name || '').trim();
  let gPhone = (lead.phone || lead.guestPhone || lead.guest_phone || '').trim();
  if (!gName && lead.guest) {
    const m = String(lead.guest).match(/^(.*?)(?:\s*\((.*?)\))?$/);
    if (m) {
      gName = (m[1] || '').trim();
      if (!gPhone && m[2]) gPhone = m[2].trim();
    }
  }
  if (!gName && !gPhone) {
    gName = 'Misafir Talebi';
  }

  // Normalize status/stage
  const rawStatus = (lead.status || lead.stage || 'NEW').toUpperCase();
  const status = ALLOWED_LEAD_STAGES.includes(rawStatus) ? rawStatus : 'NEW';

  // Normalize dates
  const checkIn = lead.checkIn || lead.requested_check_in || null;
  const checkOut = lead.checkOut || lead.requested_check_out || null;

  const payload = {
    tenant_id: tenantId,
    property_id: propertyId,
    converted_booking_id: lead.convertedBookingId || lead.converted_booking_id || null,
    guest_name: gName,
    guest_phone: gPhone,
    guest_email: (lead.email || lead.guestEmail || lead.guest_email || '').trim() || null,
    channel: lead.channel || lead.source || 'WhatsApp',
    lead_date: lead.date || lead.lead_date || getTodayStr(),
    requested_check_in: checkIn,
    requested_check_out: checkOut,
    pax: normalizePositiveInteger(lead.pax),
    quote_amount: Number(lead.quote ?? lead.quoteAmount ?? 0) >= 0 ? Number(lead.quote ?? lead.quoteAmount ?? 0) : 0,
    status: status,
    lost_reason: (status === 'LOST' ? (lead.lostReason || lead.lost_reason || 'Diğer') : null),
    notes: (lead.notes || '').trim()
  };

  if (lead.id && isUUID(lead.id)) {
    payload.id = lead.id;
  }

  return payload;
}

function buildLeadEditPayload(editId, changes) {
  const definedChanges = Object.fromEntries(
    Object.entries(changes || {}).filter(([, value]) => value !== undefined)
  );
  if (!editId) return definedChanges;

  const existingLead = (appData.leads || []).find(
    lead => lead.id === editId || lead.dbId === editId
  );
  if (!existingLead) return definedChanges;

  return { ...existingLead, ...definedChanges };
}

function validateLeadInput(leadInput, targetTenantId) {
  if (!leadInput) throw new Error('Lead bilgisi boş olamaz.');
  const tenantId = targetTenantId || getActiveTenantId();
  const currentAppData = (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);

  // 1. Identity validation
  let gName = (leadInput.guestName || leadInput.guest_name || '').trim();
  let gPhone = (leadInput.phone || leadInput.guestPhone || leadInput.guest_phone || '').trim();
  if (!gName && leadInput.guest) {
    const m = String(leadInput.guest).match(/^(.*?)(?:\s*\((.*?)\))?$/);
    if (m) {
      gName = (m[1] || '').trim();
      if (!gPhone && m[2]) gPhone = m[2].trim();
    }
  }
  if (!gName && !gPhone) {
    throw new Error('Misafir adı veya telefon numarasından en az biri belirtilmelidir.');
  }

  // 2. Property isolation validation
  const propId = leadInput.propertyId || leadInput.property_id;
  if (propId && isUUID(propId) && currentAppData && currentAppData.villas) {
    const isOwned = Object.values(currentAppData.villas).some(p => p.id === propId);
    if (!isOwned && currentAppData.tenantId && currentAppData.tenantId === tenantId) {
      throw new Error('Seçilen mülk aktif işletmenize ait değildir.');
    }
  }

  // 3. Dates validation
  const checkIn = leadInput.checkIn || leadInput.requested_check_in;
  const checkOut = leadInput.checkOut || leadInput.requested_check_out;
  if (checkIn && checkOut) {
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
      throw new Error('Geçersiz tarih formatı.');
    }
    if (d2 <= d1) {
      throw new Error('Çıkış tarihi giriş tarihinden sonra olmalıdır.');
    }
  }

  // 4. Pax & Amount validation
  if (leadInput.pax !== undefined && leadInput.pax !== null && Number(leadInput.pax) <= 0) {
    throw new Error('Kişi sayısı 0 veya negatif olamaz.');
  }
  const quote = leadInput.quote ?? leadInput.quoteAmount;
  if (quote !== undefined && quote !== null && Number(quote) < 0) {
    throw new Error('Teklif tutarı negatif olamaz.');
  }

  // 5. Stage validation
  const rawStatus = (leadInput.status || leadInput.stage || 'NEW').toUpperCase();
  if (rawStatus && !ALLOWED_LEAD_STAGES.includes(rawStatus)) {
    throw new Error(`Tanımsız lead durumu: ${rawStatus}`);
  }

  return true;
}

async function loadLeads(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    return (typeof appData !== 'undefined' && appData.leads) ? appData.leads : [];
  }

  const data = await fetchAllCloudRows(() => supabaseClient
    .from('leads').select('*').eq('tenant_id', tenantId)
    .order('created_at', { ascending: false }));

  const mapped = (data || []).map(mapLeadFromDb);
  if (typeof appData !== 'undefined') {
    appData.leads = mapped;
    if (typeof saveAppData === 'function') saveAppData();
  }
  return mapped;
}

async function createLead(leadInput) {
  const tenantId = getActiveTenantId();
  validateLeadInput(leadInput, tenantId);

  const isCloud = !!(isCloudTenant(tenantId));
  requireCloudForWrite('Talep', tenantId);

  if (!isCloud) {
    const localId = 'local_lead_' + Date.now();
    const localRecord = {
      id: localId,
      dbId: localId,
      tenantId: tenantId || 'usr_ute_master',
      propertyId: leadInput.propertyId || null,
      villa: leadInput.villa || 'ALL',
      guest: leadInput.guest || leadInput.guestName || 'Misafir Talebi',
      guestName: leadInput.guestName || leadInput.guest || 'Misafir Talebi',
      phone: leadInput.phone || '',
      email: leadInput.email || '',
      channel: leadInput.channel || 'WhatsApp',
      source: (leadInput.channel || 'WHATSAPP').toUpperCase(),
      date: leadInput.date || getTodayStr(),
      checkIn: leadInput.checkIn || '',
      checkOut: leadInput.checkOut || '',
      pax: normalizePositiveInteger(leadInput.pax),
      quote: Number(leadInput.quote) || 0,
      quoteAmount: Number(leadInput.quote) || 0,
      status: (leadInput.status || 'NEW').toUpperCase(),
      stage: (leadInput.status || 'NEW').toUpperCase(),
      lostReason: leadInput.lostReason || '',
      notes: leadInput.notes || '',
      convertedBookingId: null,
      converted_booking_id: null
    };
    if (typeof appData !== 'undefined') {
      if (!appData.leads) appData.leads = [];
      appData.leads.unshift(localRecord);
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
    }
    return localRecord;
  }

  const payload = mapLeadToDb(leadInput, tenantId);
  delete payload.id; // Let DB generate UUID

  const { data, error } = await supabaseClient
    .from('leads')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('createLead error:', error);
    throw error;
  }

  const created = mapLeadFromDb(data);
  if (typeof appData !== 'undefined') {
    if (!appData.leads) appData.leads = [];
    appData.leads.unshift(created);
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
  }
  return created;
}

async function updateLead(leadId, patch) {
  if (!leadId) throw new Error('Güncellenecek lead kimliği gereklidir.');
  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));
  const completePatch = buildLeadEditPayload(leadId, patch);

  if (!isCloud) {
    if (typeof appData !== 'undefined' && appData.leads) {
      const idx = appData.leads.findIndex(l => l.id === leadId || l.dbId === leadId);
      if (idx !== -1) {
        appData.leads[idx] = { ...appData.leads[idx], ...completePatch };
        if (typeof saveAppData === 'function') saveAppData();
        if (typeof renderAll === 'function') renderAll();
        return appData.leads[idx];
      }
    }
    throw new Error('Lokal lead kaydı bulunamadı.');
  }

  if (!isUUID(leadId)) {
    throw new Error('Geçersiz UUID formatı.');
  }

  // Pre-validate patch if relevant fields exist
  validateLeadInput({
    guestName: completePatch.guestName || completePatch.guest || 'Misafir',
    phone: completePatch.phone || '',
    ...completePatch
  }, tenantId);

  const payload = mapLeadToDb({ ...completePatch, id: leadId }, tenantId);
  delete payload.tenant_id; // Never mutate tenant_id

  const { data, error } = await supabaseClient
    .from('leads')
    .update(payload)
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('updateLead error:', error);
    throw error;
  }

  const updated = mapLeadFromDb(data);
  if (typeof appData !== 'undefined' && appData.leads) {
    const idx = appData.leads.findIndex(l => l.id === leadId || l.dbId === leadId);
    if (idx !== -1) {
      appData.leads[idx] = updated;
    } else {
      appData.leads.unshift(updated);
    }
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
  }
  return updated;
}

async function deleteLead(leadId, options = {}) {
  if (!leadId) throw new Error('Silinecek lead kimliği gereklidir.');
  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));

  // Historical safety check: WON leads contain critical conversion and financial records
  if (typeof appData !== 'undefined' && appData.leads) {
    const target = appData.leads.find(l => l.id === leadId || l.dbId === leadId);
    if (target && (target.status === 'WON' || target.stage === 'WON') && !options.allowWonDelete) {
      throw new Error('Kazanılmış ve rezervasyona dönüştürülmüş bir talep doğrudan silinemez (tarihsel veri bütünlüğü koruması).');
    }
  }

  if (!isCloud) {
    if (typeof appData !== 'undefined' && appData.leads) {
      appData.leads = appData.leads.filter(l => l.id !== leadId && l.dbId !== leadId);
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
    }
    return true;
  }

  if (!isUUID(leadId)) {
    throw new Error('Geçersiz UUID formatı.');
  }

  const { error } = await supabaseClient
    .from('leads')
    .delete()
    .eq('id', leadId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('deleteLead error:', error);
    throw error;
  }

  if (typeof appData !== 'undefined' && appData.leads) {
    appData.leads = appData.leads.filter(l => l.id !== leadId && l.dbId !== leadId);
    if (typeof saveAppData === 'function') saveAppData();
    if (typeof renderAll === 'function') renderAll();
  }
  return true;
}

function buildLeadConversionOptions(lead = {}, overrides = {}) {
  const value = (overrideKey, ...leadKeys) => {
    if (overrides[overrideKey] !== undefined && overrides[overrideKey] !== null) return overrides[overrideKey];
    for (const key of leadKeys) {
      if (lead[key] !== undefined && lead[key] !== null) return lead[key];
    }
    return null;
  };
  return {
    grossAmount: value('grossAmount', 'quote', 'quoteAmount', 'quote_amount'),
    channel: value('channel', 'channel', 'source'),
    otaCommission: value('otaCommission', 'otaCommission', 'otaComm', 'ota_commission'),
    cleaningFee: value('cleaningFee', 'cleaningFee', 'cleanFee', 'cleaning_fee'),
    discount: value('discount', 'discount')
  };
}

async function convertLeadToBooking(leadId, options = {}) {
  if (!leadId) throw new Error('Dönüştürülecek lead kimliği gereklidir.');
  const tenantId = getActiveTenantId();
  const isCloud = !!(isCloudTenant(tenantId));

  // Friendly error mapping helper
  function mapFriendlyError(err) {
    const msg = err?.message || String(err);
    const code = err?.code || '';
    if (code === '23505' || msg.includes('ALREADY_CONVERTED') || msg.includes('zaten bir rezervasyona')) {
      return new Error('Bu talep zaten bir rezervasyona dönüştürülmüş.');
    }
    if (code === '23P01' || msg.includes('OVERBOOKING_CONFLICT') || msg.includes('çakışıyor') || msg.includes('dolu')) {
      return new Error('Seçilen tarihlerde bu mülk için başka bir rezervasyon bulunuyor.');
    }
    if (code === '42501' || msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN') || msg.includes('yetkiniz yok')) {
      return new Error('Bu talep üzerinde işlem yapma yetkiniz yok.');
    }
    if (msg.includes('INVALID_PROPERTY') || msg.includes('mülk seçilmelidir')) {
      return new Error('Lütfen rezervasyon için geçerli bir mülk seçiniz.');
    }
    if (msg.includes('INVALID_DATES') || msg.includes('tarihleri zorunludur')) {
      return new Error('Rezervasyon için giriş ve çıkış tarihleri zorunludur.');
    }
    return new Error(msg);
  }

  if (!isCloud) {
    // Local fallback simulation
    if (typeof appData !== 'undefined' && appData.leads) {
      const l = appData.leads.find(x => x.id === leadId || x.dbId === leadId);
      if (!l) throw new Error('Talep bulunamadı.');
      if (l.status === 'WON' || l.convertedBookingId) {
        throw mapFriendlyError({ code: '23505', message: 'ALREADY_CONVERTED' });
      }
      const bId = 'REZ-' + Date.now();
      const newBooking = {
        id: bId,
        dbId: bId,
        code: options.bookingCode || generateSafeBookingCode(options.checkIn || l.checkIn),
        tenantId: tenantId || 'usr_ute_master',
        propertyId: options.propertyId || l.propertyId || null,
        villa: options.villa || l.villa || 'VILLA',
        guest: l.guest || 'Misafir',
        phone: l.phone || '',
        checkIn: options.checkIn || l.checkIn,
        checkOut: options.checkOut || l.checkOut,
        gross: Number(options.grossAmount ?? l.quote ?? 0),
        pax: normalizePositiveInteger(options.pax ?? l.pax),
        channel: (options.channel || l.channel || 'Direct').toUpperCase(),
        otaComm: Number(options.otaCommission ?? l.otaCommission ?? l.otaComm ?? 0),
        cleaningFee: Number(options.cleaningFee ?? l.cleaningFee ?? l.cleanFee ?? 0),
        discount: Number(options.discount ?? l.discount ?? 0),
        status: 'CONFIRMED'
      };
      if (!appData.bookings) appData.bookings = [];
      appData.bookings.unshift(newBooking);
      l.status = 'WON';
      l.stage = 'WON';
      l.convertedBookingId = bId;
      l.converted_booking_id = bId;
      if (typeof saveAppData === 'function') saveAppData();
      if (typeof renderAll === 'function') renderAll();
      return { success: true, booking: newBooking, leadId };
    }
  }

  if (!isUUID(leadId)) {
    throw new Error('Geçersiz UUID formatı.');
  }

  // Resolve property UUID if slug was provided
  let targetPropertyId = options.propertyId || null;
  if (!targetPropertyId && options.villa && typeof appData !== 'undefined' && appData.villas) {
    const foundProp = appData.villas[options.villa] || Object.values(appData.villas).find(p => p.slug === options.villa || p.id === options.villa);
    if (foundProp && foundProp.id) targetPropertyId = foundProp.id;
  }

  try {
    const { data, error } = await supabaseClient.rpc('convert_lead_to_booking_atomic', {
      p_lead_id: leadId,
      p_tenant_id: tenantId,
      p_property_id: targetPropertyId,
      p_booking_code: options.bookingCode || null,
      p_check_in: options.checkIn || null,
      p_check_out: options.checkOut || null,
      p_pax: options.pax ? Number(options.pax) : null,
      p_gross_amount: options.grossAmount ? Number(options.grossAmount) : null,
      p_ota_commission: options.otaCommission == null ? null : Number(options.otaCommission),
      p_cleaning_fee: options.cleaningFee == null ? null : Number(options.cleaningFee),
      p_discount: options.discount == null ? null : Number(options.discount),
      p_notes: options.notes || null
    });

    if (error) {
      throw mapFriendlyError(error);
    }

    // Success: Update in-memory state
    if (data && data.booking) {
      const createdBooking = mapBookingFromDb(data.booking);
      if (typeof appData !== 'undefined') {
        if (!appData.bookings) appData.bookings = [];
        const existsB = appData.bookings.some(b => b.id === createdBooking.id);
        if (!existsB) appData.bookings.unshift(createdBooking);

        if (appData.leads) {
          const lIdx = appData.leads.findIndex(l => l.id === leadId);
          if (lIdx !== -1) {
            appData.leads[lIdx].status = 'WON';
            appData.leads[lIdx].stage = 'WON';
            appData.leads[lIdx].convertedBookingId = data.converted_booking_id;
            appData.leads[lIdx].converted_booking_id = data.converted_booking_id;
          }
        }
        if (typeof saveAppData === 'function') saveAppData();
        if (typeof renderAll === 'function') renderAll();
      }
    }

    return data;
  } catch (err) {
    throw mapFriendlyError(err);
  }
}

// Backwards compatibility wrappers
async function cloudUpsertLead(leadRecord) {
  if (leadRecord && leadRecord.id && isUUID(leadRecord.id)) {
    return await updateLead(leadRecord.id, leadRecord);
  } else {
    return await createLead(leadRecord);
  }
}

async function cloudDeleteLead(id) {
  return await deleteLead(id, { allowWonDelete: true });
}

/**
 * Uygulamanin calisma ay araligi.
 *
 * Sabit bir 2025-07 ... 2027-12 listesiydi ve ay adlari ilk musterinin
 * takvimini anlatiyordu ("Agustos 2026 (Son Kapanan Ay)", "Aralik 2027
 * (Yilbasi 2028)"). Bu liste ay adimlayiciyi, hedef ekranini, tape chart'i ve
 * trend grafiklerini besliyor. Sonuc: 2024 verisiyle gelen musteri o aylara
 * hic ulasamiyor, 2028'e gelindiginde de liste bitiyordu.
 *
 * Artik musterinin kendi verisinden uretiliyor; refreshPeriodSelectors() her
 * render'da tazeler.
 */
function computeFinancialMonthRange() {
  const tarihler = [];
  const ekle = d => { if (d && /^\d{4}-\d{2}/.test(String(d))) tarihler.push(String(d).slice(0, 7)); };
  const veri = (typeof appData !== 'undefined') ? appData
             : (typeof global !== 'undefined' ? global.appData : null);
  if (veri) {
    (veri.bookings || []).forEach(b => { ekle(b.checkIn); ekle(b.checkOut); });
    (veri.expenses || []).forEach(e => ekle(e.date || e.expense_date));
    (veri.cleaningTasks || []).forEach(t => ekle(t.date));
  }

  const ayNo = ym => parseInt(ym.slice(0, 4), 10) * 12 + parseInt(ym.slice(5, 7), 10) - 1;
  const ymStr = n => Math.floor(n / 12) + '-' + String((n % 12) + 1).padStart(2, '0');
  const bugunAy = ayNo(getTodayStr().slice(0, 7));

  let bas = tarihler.length ? Math.min(...tarihler.map(ayNo)) : bugunAy - 11;
  let bit = tarihler.length ? Math.max(...tarihler.map(ayNo), bugunAy + 12) : bugunAy + 12;
  if (bit - bas > 180) bas = bit - 180;   // bozuk tarih listeyi sismesin

  const liste = [];
  for (let n = bas; n <= bit; n++) liste.push(ymStr(n));
  return liste;
}

let ALL_FINANCIAL_MONTHS = computeFinancialMonthRange();

/**
 * Bir donem anahtarinin ekranda gorunen adi.
 * Sabit bir sozlukten geliyordu; artik hesaplaniyor.
 */
function getPeriodDisplayName(key) {
  if (!key) return '';
  if (key === 'ALL') return 'Tüm Zamanlar';
  if (key === 'CUSTOM') return 'Özel Tarih Aralığı';
  const yil = /^(\d{4})-YEAR$/.exec(key);
  if (yil) return yil[1] + ' Yılı Tamamı';
  return formatPeriodLabel(key);
}

function handleFilterChange() {
  const periodVal = document.getElementById('globalPeriodFilter') ? document.getElementById('globalPeriodFilter').value : getCurrentMonthKey();
  currentFilter.period = periodVal;
  const villaSelect = document.getElementById('globalVillaFilter');
  if (villaSelect) currentFilter.villa = villaSelect.value;

  const customWrap = document.getElementById('customDateRangeWrap');
  if (periodVal === 'CUSTOM') {
    if (customWrap) customWrap.style.display = 'inline-flex';
    const sInput = document.getElementById('customFilterStart');
    const eInput = document.getElementById('customFilterEnd');
    // Varsayilan ozel aralik: icinde bulunulan ay. '2026-08-01' / '2026-09-30'
    // sabit yaziliydi.
    currentFilter.startDate = (sInput && sInput.value) ? sInput.value : getTodayStr().slice(0, 7) + '-01';
    currentFilter.endDate = (eInput && eInput.value) ? eInput.value : getTodayStr();
  } else {
    if (customWrap) customWrap.style.display = 'none';
    // Yil secenekleri artik musterinin veri araligindan uretiliyor; yalnizca
    // '2026-YEAR' ve '2025-YEAR' taninirsa 2024 verisi olan bir musteride
    // "2024 Yili Tamami" secildiginde startDate '2024-YEAR-01' oluyordu.
    const yilEslesme = /^(\d{4})-YEAR$/.exec(periodVal);
    if (yilEslesme) {
      currentFilter.startDate = yilEslesme[1] + '-01-01';
      currentFilter.endDate = yilEslesme[1] + '-12-31';
    } else if (periodVal === 'ALL') {
      currentFilter.startDate = null;
      currentFilter.endDate = null;
    } else {
      currentFilter.startDate = `${periodVal}-01`;
      const parts = periodVal.split('-').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const lastDay = new Date(parts[0], parts[1], 0).getDate();
        currentFilter.endDate = `${periodVal}-${String(lastDay).padStart(2, '0')}`;
      } else {
        currentFilter.endDate = null;
      }
    }
  }

  updateStepperLabels();
  renderAll();
}

function stepMonth(delta) {
  let idx = ALL_FINANCIAL_MONTHS.indexOf(currentFilter.period);
  if (idx === -1) idx = ALL_FINANCIAL_MONTHS.indexOf(getTodayStr().slice(0, 7));

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
  let curLabel = getPeriodDisplayName(currentFilter.period);
  if (currentFilter.period === 'CUSTOM') {
    const s = currentFilter.startDate ? formatTrDate(currentFilter.startDate) : 'Başlangıç';
    const e = currentFilter.endDate ? formatTrDate(currentFilter.endDate) : 'Bitiş';
    curLabel = `📅 ${s} – ${e}`;
  }

  const curEl = document.getElementById('stepperCurrentLabel');
  if (curEl) curEl.innerText = curLabel;

  const prevEl = document.getElementById('stepperPrevLabel');
  if (prevEl) prevEl.innerText = curIdx > 0 ? getPeriodDisplayName(ALL_FINANCIAL_MONTHS[curIdx - 1]) : '';

  const nextEl = document.getElementById('stepperNextLabel');
  if (nextEl) nextEl.innerText = curIdx >= 0 && curIdx < ALL_FINANCIAL_MONTHS.length - 1 ? getPeriodDisplayName(ALL_FINANCIAL_MONTHS[curIdx + 1]) : '';

  const vLabel = currentFilter.villa === 'ALL' ? ('Tüm Mülkler (' + portfolioLabel() + ')') : (appData.villas[currentFilter.villa]?.name || currentFilter.villa);
  const vEl = document.getElementById('finTopPropertyLabel');
  if (vEl) vEl.innerText = vLabel;
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[data-onclick*="${tabId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById(`tab-${tabId}`);
  if (content) content.classList.add('active');

  if (tabId === 'executive') renderExecutiveControlCenter();
  if (tabId === 'properties') renderPropertiesTab();
  if (tabId === 'operations') renderOperationsTab();
  if (tabId === 'operations') renderOperationsKpiStrip();
  if (tabId === 'guests') renderGuestsTab();
  if (tabId === 'pricing') renderPricingTab();
  if (tabId === 'pricing') renderPricingKpiStrip();
  if (tabId === 'reports') renderReportsTab();
  if (tabId === 'analysis') renderAnalysisCenter();
  if (tabId === 'settings') renderSettingsTable();
  if (tabId === 'settings') renderTeamManagement();
  if (tabId === 'settings') loadDeletionImpact();
  if (tabId === 'finance') renderFinanceModule();
  if (tabId === 'dashboard') {
    renderKPIsAndDashboard();
    renderGapNights();
    renderTodayRadar();
    renderOtaRadar();
    runWhatIfSimulation();
    renderTrajectoryRadar();
    renderTrajectoryInsights();
    renderCriticPresets();
    renderDailyOps();
  }
  if (tabId === 'reservations') {
    renderManageBookingsTable();
    renderTapeChart();
  }
  if (tabId === 'expenses') renderExpensesTable();
  if (tabId === 'leads') {
    renderManageLeadsTable();
    renderLeadAnalytics();
  }
  if (tabId === 'maintenance') renderManageMaintTable();
  if (tabId === 'housekeeping') renderHousekeepingTab();
  if (tabId === 'marketing') renderMarketingModule();
  if (tabId === 'channels') renderOtaRadar();
}

function isBookingInFilter(b) {
  if (currentFilter.villa !== 'ALL') {
    const vPropId = (typeof appData !== 'undefined' && appData.villas?.[currentFilter.villa]?.id);
    if (b.villa !== currentFilter.villa && b.propertyId !== currentFilter.villa && (!vPropId || b.propertyId !== vPropId)) {
      return false;
    }
  }
  if (currentFilter.period === 'ALL') return true;

  const bIn = b.checkIn || '';
  const bOut = b.checkOut || b.checkIn || '';

  // Konaklama araligi secili ay/yil/ozel aralikla kesisiyor mu?
  // Onceki hal yalnizca GIRIS ve CIKIS ayina bakiyordu. 04-28 -> 06-02
  // rezervasyonu Mayis filtresinde hic gorunmuyordu; oysa Mayis'in 31
  // gecesinin tamami bu rezervasyona ait.
  // Geceler [checkIn, checkOut-1] araligidir; checkOut cikis gunu, gece degil.
  const range = getFilterDateRange();
  if (!range || !bIn) return false;
  return bIn <= range.end && bOut > range.start;
}

/**
 * Rezervasyonun secili doneme dusen gece sayisi ve tutar orani.
 *
 * USALI tahakkuk esasi: aylari kesen bir rezervasyonun geliri gecelere esit
 * bolunur, her donem yalnizca kendi gecelerinin payini alir.
 *
 * Bu fonksiyon olmadan onceki hal, aylari kesen rezervasyonu hem giris hem
 * cikis ayina TAM tutarla yaziyordu: 04-28 -> 05-03 arasi 50.000 TL'lik bir
 * rezervasyon Nisan'da da 50.000, Mayis'ta da 50.000 gorunuyordu. Ayni para
 * iki kez sayiliyor, aylik toplamlarin toplami gercek cironun uzerine
 * cikiyordu. core/financial_metrics_service.js ve sunucudaki
 * compute_month_close_snapshot() bastan beri gece bazinda dagitiyordu; bu
 * yuzden Finans ekrani ile yonetici paneli ayni ay icin farkli ciro veriyordu.
 *
 * @returns {{nights:number, total:number, ratio:number}}
 */
function getBookingFilterShare(b) {
  const bos = { nights: 0, total: 0, ratio: 0 };
  if (!b) return bos;
  const ci = b.checkIn || b.check_in;
  const co = b.checkOut || b.check_out;
  if (!ci || !co) {
    // Tarihi olmayan kayit bolunemez; filtreden gectiyse tamami sayilir.
    const n = Number(b.nights) || 0;
    return { nights: n, total: n, ratio: 1 };
  }
  const gun = 86400000;
  const bas = Date.parse(ci + 'T00:00:00Z');
  const bit = Date.parse(co + 'T00:00:00Z');
  if (!isFinite(bas) || !isFinite(bit)) return bos;
  const toplam = Math.round((bit - bas) / gun);
  if (toplam <= 0) return bos;

  const aralik = getFilterDateRange();
  if (!aralik) return { nights: toplam, total: toplam, ratio: 1 };

  let icerde = 0;
  for (let i = 0; i < toplam; i++) {
    const g = new Date(bas + i * gun).toISOString().slice(0, 10);
    if (g >= aralik.start && g <= aralik.end) icerde++;
  }
  return { nights: icerde, total: toplam, ratio: icerde / toplam };
}

/**
 * Secili filtrenin tarih araligi (dahil-dahil). Donem 'ALL' ise null.
 */
// -------------------------------------------------------------
// DONEM DEFTERI — tek formul (K-04, core/ledger_contract.js)
// -------------------------------------------------------------
// Finans ekrani, kokpit, aylik KPI tablosu ve onceki donem karsilastirmasi
// toplamlarini BURADAN okur. Sunucudaki kapanis ve yonetici snapshot'lari
// (phase45) ayni formulu kullanir; ekranlar ayri ayri toplam yaptiginda ayni
// ay icin farkli net kar raporluyorlardi (CLAUDE.md 3.4).
function getLedgerContract() {
  if (typeof LedgerContract !== 'undefined') return LedgerContract;
  if (typeof window !== 'undefined' && window.LedgerContract) return window.LedgerContract;
  if (typeof require === 'function') {
    try { return require('./core/ledger_contract.js'); } catch (e) { /* tarayici */ }
  }
  throw new Error('Defter sozlesmesi (core/ledger_contract.js) yuklenmedi.');
}

function taskMatchesVilla(t, villa) {
  if (!villa || villa === 'ALL') return true;
  const propId = appData?.villas?.[villa]?.id;
  return t.villa === villa || (!!propId && t.propertyId === propId);
}

/** Arayuzde secili donem ve mulk icin defter. */
function computeFilterLedger() {
  const villa = currentFilter ? currentFilter.villa : 'ALL';
  return getLedgerContract().computePeriodLedger({
    bookings: appData.bookings || [],
    expenses: appData.expenses || [],
    cleaningTasks: appData.cleaningTasks || [],
    bookingInScope: isBookingInFilter,
    bookingShare: getBookingFilterShare,
    expenseInScope: isExpenseInFilter,
    taskInScope: t => taskMatchesVilla(t, villa) && isDateInFilter(t.date)
  });
}

/** Belirli bir takvim ayi (YYYY-MM) icin defter; mulk filtresi istege bagli. */
function computeMonthLedger(monthKey, villa) {
  const L = getLedgerContract();
  const r = L.monthRange(monthKey);
  if (!r) return null;
  const v = villa || 'ALL';
  const propId = v !== 'ALL' ? appData?.villas?.[v]?.id : null;
  const tarihIcinde = d => typeof d === 'string' && d.slice(0, 10) >= r.start && d.slice(0, 10) <= r.end;
  return L.computePeriodLedger({
    bookings: appData.bookings || [],
    expenses: appData.expenses || [],
    cleaningTasks: appData.cleaningTasks || [],
    bookingInScope: b => v === 'ALL' || b.villa === v || (!!propId && b.propertyId === propId),
    bookingShare: b => L.nightShareInRange(b, r.start, r.end),
    expenseInScope: e => (v === 'ALL' || e.villa === v)
      && tarihIcinde(e.date || e.expense_date || (e.month ? e.month + '-15' : '')),
    taskInScope: t => taskMatchesVilla(t, v) && tarihIcinde(t.date)
  });
}

function getFilterDateRange() {
  if (typeof currentFilter === 'undefined' || !currentFilter) return null;
  if (!currentFilter.period || currentFilter.period === 'ALL') {
    const dates = [];
    (appData?.bookings || []).forEach(b => { if (b.checkIn) dates.push(b.checkIn); if (b.checkOut) dates.push(b.checkOut); });
    (appData?.expenses || []).forEach(e => { if (e.date || e.expense_date) dates.push(e.date || e.expense_date); });
    dates.sort();
    return dates.length ? { start: dates[0].slice(0, 10), end: dates[dates.length - 1].slice(0, 10) } : null;
  }

  const yearMatch = /^(\d{4})-YEAR$/.exec(currentFilter.period);
  if (yearMatch) {
    return {
      start: yearMatch[1] + '-01-01',
      end: yearMatch[1] + '-12-31'
    };
  }

  if (currentFilter.period === 'CUSTOM') {
    if (!currentFilter.startDate || !currentFilter.endDate) return null;
    return {
      start: currentFilter.startDate,
      end: currentFilter.endDate
    };
  }

  if (/^\d{4}-\d{2}$/.test(currentFilter.period)) {
    const y = parseInt(currentFilter.period.slice(0, 4), 10);
    const m = parseInt(currentFilter.period.slice(5, 7), 10);
    const sonGun = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      start: currentFilter.period + '-01',
      end: currentFilter.period + '-' + String(sonGun).padStart(2, '0')
    };
  }

  return null;
}

function isDateInFilter(date) {
  if (currentFilter.period === 'ALL') return true;
  if (!date) return true;
  const range = getFilterDateRange();
  return !!range && date >= range.start && date <= range.end;
}

function getPropertySalesReadinessApi() {
  if (typeof PropertySalesReadiness !== 'undefined') return PropertySalesReadiness;
  if (typeof require === 'function') return require('./core/property_sales_readiness.js');
  return null;
}

function canManagePropertyReadiness() {
  const api = getPropertySalesReadinessApi();
  return !!(api && api.canEdit(activeTenant?.role));
}

function getPropertySalesReadiness(villaKey) {
  const api = getPropertySalesReadinessApi();
  const villa = appData?.villas?.[villaKey];
  if (!api || !villa) return null;
  const cloudTickets = appData?.maintenanceTickets;
  return api.buildPropertyReadiness({ ...villa, key: villaKey, slug: villa.slug || villaKey }, {
    overrideStatus: appData?.housekeepingOverrides?.[villaKey],
    maintenanceTickets: Array.isArray(cloudTickets) && cloudTickets.length > 0
      ? cloudTickets
      : (appData?.maintenance || [])
  });
}

// -------------------------------------------------------------
// AY ÜSTÜ AY (MoM) KARŞILAŞTIRMASI
// Finans ekranindaki "geçen aya göre" rozetleri statik HTML'di ve kategori
// trendleri `dummyMoMDeltas` adli sabit bir tablodan geliyordu; hangi donem
// secilirse secilsin ayni yuzdeler gorunuyordu. Artik gercekten hesaplanir.
// -------------------------------------------------------------
// -------------------------------------------------------------
// OPERASYON & FİYATLANDIRMA KPI ŞERİTLERİ
// Bu kartlar index.html'de SABIT degerlerle duruyordu ("5 / 5", "₺16.500",
// "%100") ve hicbir render fonksiyonu onlara dokunmuyordu; her musteri ayni
// uydurma rakamlari goruyordu. Artik gercek veriden turetilir.
// -------------------------------------------------------------
function renderOperationsKpiStrip() {
  if (typeof document === 'undefined' || !appData) return;
  const villas = appData.villas || {};
  const villaKeys = Object.keys(villas);
  const tasks = appData.cleaningTasks || [];
  const tickets = appData.maintenance || [];

  const hazir = villaKeys.filter(k => {
    const readiness = getPropertySalesReadiness(k);
    return readiness && ['SALES_READY', 'NON_BLOCKING_ISSUE'].includes(readiness.status);
  }).length;
  setEl('opsReadyPropsVal', `${hazir} / ${villaKeys.length}`);

  const bugun = getTodayStr();
  const bugunkuTurnover = tasks.filter(t => (t.date || '').slice(0, 10) === bugun).length;
  setEl('opsTurnoverVal', `${bugunkuTurnover} Görev`);

  const acikP1 = tickets.filter(t => {
    const durum = String(t.status || '').toUpperCase();
    const oncelik = String(t.priority || t.oncelik || '').toUpperCase();
    return durum !== 'DONE' && durum !== 'CLOSED' && durum !== 'TAMAMLANDI'
      && (oncelik === 'P1' || oncelik === 'KRITIK' || oncelik === 'CRITICAL');
  }).length;
  setEl('opsOpenMaintVal', `${acikP1} İş`);

  const borc = tasks.filter(t => !t.paid).reduce((a, t) => a + (Number(t.amount) || 0), 0);
  setEl('opsDebtVal', `₺${Math.round(borc).toLocaleString('tr-TR')}`);

  // SLA: tamamlanmis gorevlerin zamaninda bitenlerin orani. Hic tamamlanmis
  // gorev yoksa YUZDE UYDURMA - "—" goster.
  const tamamlanan = tasks.filter(t => t.completed || t.status === 'DONE');
  if (tamamlanan.length === 0) {
    setEl('opsSlaVal', '—');
  } else {
    const zamaninda = tamamlanan.filter(t => !t.slaBreached && !t.isLate).length;
    setEl('opsSlaVal', `%${Math.round((zamaninda / tamamlanan.length) * 100)}`);
  }
}

function renderPricingKpiStrip() {
  if (typeof document === 'undefined' || !appData) return;
  const bookings = (appData.bookings || []).filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
  // ADR tek tanimdan: net oda geliri / satilan gece (K-04, L-37). Burada
  // eskiden brut / gece hesaplaniyordu; temizlik ucreti ve indirim ADR'yi
  // ayni ay icin Finans ekranindan farkli gosteriyordu.
  const defter = computeFilterLedger();
  setEl('pricingAdrVal', defter.adr === null ? '—' : `₺${Math.round(defter.adr).toLocaleString('tr-TR')}`);

  let gapSayisi = 0;
  try {
    if (typeof GapNightService !== 'undefined' && GapNightService.detectGapNights) {
      const g = GapNightService.detectGapNights({ bookings, properties: Object.values(appData.villas || {}) });
      gapSayisi = Array.isArray(g) ? g.length : (g && g.gapNights ? g.gapNights.length : 0);
    }
  } catch (e) { gapSayisi = 0; }
  const fiyatVerisiVar = Object.keys(appData.villas || {}).length > 0 && bookings.length > 0;
  setEl('pricingGapCountVal', fiyatVerisiVar ? `${gapSayisi} Gece` : '—');

  // Yillik hedef, guardrail ve uzatma donusumu ancak kayit varsa gosterilir.
  // Ilk musteriye ait butce ve oranlar tum hesaplara sabit yazilmiyordu.
  const hedefler = Array.isArray(appData.targets) ? appData.targets : Object.values(appData.targets || {});
  const yillik = hedefler.find(t => {
    const tur = String(t.type || t.metric || t.target_type || '').toUpperCase();
    return tur.includes('REVENUE') && (tur.includes('YEAR') || t.year);
  });
  const hedefTutar = Number(yillik && (yillik.amount ?? yillik.target ?? yillik.value));
  setEl('pricingAnnualTargetVal', hedefTutar > 0 ? `₺${Math.round(hedefTutar).toLocaleString('tr-TR')}` : '—');
  setEl('pricingAnnualTargetMeta', hedefTutar > 0
    ? `${yillik.year || 'Seçili yıl'} hedef kaydı`
    : 'Yıllık hedef kaydı yok; tutar hesaplanamadı');

  const profiller = Array.isArray(appData.pricingProfiles) ? appData.pricingProfiles : [];
  const korumali = profiller.filter(p => Number(p.min_price ?? p.minPrice) > 0 && Number(p.max_price ?? p.maxPrice) > 0);
  setEl('pricingGuardrailVal', profiller.length ? `${korumali.length} / ${profiller.length}` : '—');
  setEl('pricingGuardrailMeta', profiller.length
    ? 'Alt ve üst fiyat sınırı kayıtlı profil'
    : 'Fiyat profili kaydı yok; koruma durumu hesaplanamadı');

  const teklifler = Array.isArray(appData.extensionOffers) ? appData.extensionOffers : [];
  const sonuclanan = teklifler.filter(t => ['ACCEPTED', 'REJECTED', 'DECLINED'].includes(String(t.status || '').toUpperCase()));
  const kabul = sonuclanan.filter(t => String(t.status || '').toUpperCase() === 'ACCEPTED').length;
  setEl('pricingExtensionConversionVal', sonuclanan.length
    ? `%${Math.round((kabul / sonuclanan.length) * 100)}` : '—');
  setEl('pricingExtensionConversionMeta', sonuclanan.length
    ? `${kabul} kabul / ${sonuclanan.length} sonuçlanan teklif`
    : 'Sonuçlanmış uzatma teklifi yok; oran hesaplanamadı');
}

// -------------------------------------------------------------
// DÖNEMDEKİ GÜN SAYISI
// Doluluk ve RevPAR paydasi uygulamada tutarsizdi: bir yerde 30, baska bir
// yerde 31, bir digerinde 90 gun kullaniliyordu. Ayni ay icin farkli ekranlar
// farkli doluluk gosteriyordu. Artik tek kaynak ve GERCEK ay uzunlugu.
// -------------------------------------------------------------
function getPeriodDayCount(periodKey) {
  const p = periodKey || (currentFilter && currentFilter.period);
  if (!p) return null;
  if (/^\d{4}-YEAR$/.test(p)) {
    const y = Number(p.slice(0, 4));
    return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365;
  }
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split('-').map(Number);
    return new Date(y, m, 0).getDate();   // ayin gercek gun sayisi
  }
  const range = getFilterDateRange();
  if (!range) return null;
  const start = Date.parse(range.start + 'T00:00:00Z');
  const end = Date.parse(range.end + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86400000) + 1;
}

function getPreviousPeriodKey(periodKey) {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) return null;
  const [y, m] = periodKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));   // bir onceki ay
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inPeriodKey(dateStr, periodKey) {
  return typeof dateStr === 'string' && periodKey && dateStr.slice(0, 7) === periodKey;
}

function matchesVillaFilter(record) {
  if (!currentFilter || currentFilter.villa === 'ALL') return true;
  return record.villa === currentFilter.villa;
}

function computePreviousPeriodCategoryTotals() {
  const prev = getPreviousPeriodKey(currentFilter && currentFilter.period);
  const totals = {};
  EXPENSE_CATEGORIES.forEach(c => { totals[c.name] = 0; });
  if (!prev || !appData || !Array.isArray(appData.expenses)) return totals;
  appData.expenses.forEach(e => {
    if (!inPeriodKey(e.date || e.expense_date, prev)) return;
    if (!matchesVillaFilter(e)) return;
    if (totals[e.category] !== undefined) totals[e.category] += Number(e.amount) || 0;
  });
  return totals;
}

function computePreviousPeriodTotals() {
  // Onceki ay da SECILI donemle ayni formulden (K-04) ve ayni tahakkukla
  // gelir. Bir zamanlar rezervasyonu yalniz GIRIS ayina tam tutariyla
  // yaziyordu ve temizlik ucretini ciroya katip indirimi dusmuyordu; MoM
  // rozetleri elma ile armudu karsilastiriyordu (L-37). `expense` alani da
  // yoktu: "gider" rozeti her zaman "—" gosteriyordu.
  const out = { revenue: 0, roomRevenue: 0, opex: 0, capex: 0, expense: 0, nights: 0, operatingProfit: 0, netProfit: 0, hasData: false };
  const prev = getPreviousPeriodKey(currentFilter && currentFilter.period);
  if (!prev || !appData) return out;
  const l = computeMonthLedger(prev, currentFilter ? currentFilter.villa : 'ALL');
  if (!l) return out;
  out.revenue = l.totalRevenue;
  out.roomRevenue = l.netRoomRevenue;
  out.opex = l.totalOpex;
  out.capex = l.capex;
  out.expense = l.totalOpex + l.capex;
  out.nights = l.soldNights;
  out.operatingProfit = l.operatingProfit;
  out.netProfit = l.netProfit;
  out.hasData = l.bookingCount > 0 || l.manualOpex > 0 || l.capex > 0 || l.cleaningCost > 0;
  return out;
}

// Onceki donemde veri yoksa YUZDE UYDURMA - "—" goster.
function formatMoMDelta(current, previous) {
  const cur = Number(current) || 0;
  const prv = Number(previous) || 0;
  if (prv === 0) return cur === 0 ? '—' : 'yeni';
  const pct = ((cur - prv) / Math.abs(prv)) * 100;
  if (!isFinite(pct)) return '—';
  const ok = pct >= 0 ? '↑' : '↓';
  return `${ok} %${Math.abs(pct).toFixed(0)}`;
}

function formatMoMLabel(current, previous) {
  const d = formatMoMDelta(current, previous);
  if (d === '—') return 'geçen ay veri yok';
  if (d === 'yeni') return 'geçen ay kayıt yok';
  return `${d} geçen aya göre`;
}

function isExpenseInFilter(exp) {
  // Mulk gorunumu yalniz O MULKUN giderini sayar (L-36). Portfoy geneli
  // (mulksuz) gider eskiden HER mulke ayri ayri dusuyordu: iki mulkun
  // karlari toplami portfoy karindan kucuk cikiyordu ve sunucu snapshot'i
  // ayni mulk/ay icin baska rakam veriyordu. Portfoy geneli gider mulk
  // gorunumunde ayrica "dahil degil" diye gosterilir.
  if (currentFilter.villa !== 'ALL' && exp.villa !== currentFilter.villa) return false;
  if (currentFilter.period === 'ALL') return true;

  const expMonth = exp.monthKey || exp.month || (exp.date ? exp.date.substring(0, 7) : '');
  const expDate = exp.date || (expMonth ? expMonth + '-15' : '');

  return isDateInFilter(expDate);
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
function getCurrentAppBuildVersion(doc = typeof document !== 'undefined' ? document : null) {
  const script = doc?.currentScript || Array.from(doc?.scripts || [])
    .find(item => /(?:^|\/)app\.js(?:\?|$)/.test(item.getAttribute?.('src') || ''));
  const src = script?.getAttribute?.('src') || '';
  const version = src.match(/[?&]v=([^&]+)/)?.[1];
  return version ? `asset-${version}` : 'development';
}

const CURRENT_APP_BUILD_VERSION = getCurrentAppBuildVersion();

async function forceHardRefresh() {
  const confirmed = confirm('Tarayıcı ve mobildeki eski önbellek (cache) ve çerez kalıntıları temizlenip en güncel canlı sürüm yüklensin mi?\n\n(Not: Oturum bilgileriniz korunacaktır.)');
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

    // Clear known storage keys
    const removeKeys = [
      'LEXBNB_V5_MASTER_DATA',
      'LEXBNB_APP_DATA_V4',
      'LEXBNB_V3_STATE',
      'LEXBNB_APP_DATA'
    ];
    removeKeys.forEach(k => localStorage.removeItem(k));

    localStorage.setItem('LEXBNB_APP_VERSION', CURRENT_APP_BUILD_VERSION);

    // 3. Force hard navigation with timestamp cache-buster
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now());
    window.location.replace(url.toString());
  } catch (err) {
    console.error('Hard refresh error:', err);
    window.location.reload(true);
  }
}

const LARGE_TABLE_PAGE_SIZE = 100;
const largeTablePageState = { bookings: 1, expenses: 1 };

function paginateRows(rows, requestedPage = 1, pageSize = LARGE_TABLE_PAGE_SIZE) {
  const source = Array.isArray(rows) ? rows : [];
  const safeSize = Math.max(1, Math.floor(Number(pageSize) || LARGE_TABLE_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(source.length / safeSize));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  const start = (page - 1) * safeSize;
  return { rows: source.slice(start, start + safeSize), page, pageSize: safeSize, totalPages, totalRows: source.length };
}

function renderTablePagination(containerId, tableKey, pageInfo, renderFunctionName) {
  const container = document.getElementById(containerId);
  if (!container) return;
  largeTablePageState[tableKey] = pageInfo.page;
  if (pageInfo.totalRows <= pageInfo.pageSize) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <button type="button" class="btn btn-secondary btn-sm" ${pageInfo.page <= 1 ? 'disabled' : ''}
            data-onclick="setLargeTablePage(decodeURIComponent('${encodeActionArg(tableKey)}'), ${pageInfo.page - 1}, decodeURIComponent('${encodeActionArg(renderFunctionName)}'))">← Önceki</button>
    <span>${pageInfo.totalRows.toLocaleString('tr-TR')} kayıt · ${pageInfo.page}/${pageInfo.totalPages}. sayfa</span>
    <button type="button" class="btn btn-secondary btn-sm" ${pageInfo.page >= pageInfo.totalPages ? 'disabled' : ''}
            data-onclick="setLargeTablePage(decodeURIComponent('${encodeActionArg(tableKey)}'), ${pageInfo.page + 1}, decodeURIComponent('${encodeActionArg(renderFunctionName)}'))">Sonraki →</button>`;
}

function setLargeTablePage(tableKey, page, renderFunctionName) {
  largeTablePageState[tableKey] = Math.max(1, Number(page) || 1);
  const renderers = { renderManageBookingsTable, renderExpensesTable };
  if (renderers[renderFunctionName]) renderers[renderFunctionName]();
}

const ACTIVE_RENDER_PLANS = {
  'tab-executive': ['renderExecutiveControlCenter'],
  'tab-properties': ['renderPropertiesTab'],
  'tab-operations': ['renderOperationsTab', 'renderOperationsKpiStrip'],
  'tab-guests': ['renderGuestsTab'],
  'tab-pricing': ['renderPricingTab', 'renderPricingKpiStrip'],
  'tab-finance': ['renderFinanceModule'],
  'tab-dashboard': ['renderKPIsAndDashboard', 'renderGapNights', 'renderTodayRadar', 'renderOtaRadar', 'runWhatIfSimulation', 'renderTrajectoryRadar', 'renderTrajectoryInsights', 'renderCriticPresets', 'renderDailyOps'],
  'tab-reservations': ['renderManageBookingsTable', 'renderTapeChart'],
  'tab-expenses': ['renderExpensesTable'],
  'tab-leads': ['renderManageLeadsTable', 'renderLeadAnalytics'],
  'tab-maintenance': ['renderManageMaintTable'],
  'tab-housekeeping': ['renderHousekeepingTab'],
  'tab-reports': ['renderReportsTab'],
  'tab-settings': ['renderSettingsTable', 'renderTeamManagement']
};

function getActiveRenderPlan(activeTabId) {
  return (ACTIVE_RENDER_PLANS[activeTabId] || []).slice();
}

// Master render updates only the visible surface. Previously every mutation
// rebuilt every hidden table and dashboard, so one booking rendered 20+ views.
function renderAll() {
  if (typeof document === 'undefined') return;
  refreshPortfolioCountLabels();
  refreshPeriodSelectors();
  updateStepperLabels();
  renderMonthCloseCard();
  renderUserNotificationsBadge();

  const activeTabId = document.querySelector('.tab-content.active')?.id || '';
  const activePlan = getActiveRenderPlan(activeTabId);
  const renderers = {
    renderExecutiveControlCenter,
    renderPropertiesTab,
    renderOperationsTab,
    renderOperationsKpiStrip,
    renderGuestsTab,
    renderPricingTab,
    renderPricingKpiStrip,
    renderFinanceModule,
    renderKPIsAndDashboard,
    renderManageBookingsTable,
    renderExpensesTable,
    renderManageLeadsTable,
    renderLeadAnalytics,
    renderManageMaintTable,
    renderGapNights,
    renderTodayRadar,
    renderOtaRadar,
    runWhatIfSimulation,
    renderTrajectoryRadar,
    renderTrajectoryInsights,
    renderCriticPresets,
    renderDailyOps,
    renderTapeChart,
    renderHousekeepingTab,
    renderReportsTab,
    renderSettingsTable,
    renderTeamManagement
  };
  const fallbackPlan = Object.keys(renderers);
  const plan = activePlan.length ? activePlan : (activeTabId ? [] : fallbackPlan);
  plan.forEach(name => renderers[name]());

  // Badges
  // Badges (Seçili Dönem Filtresine Göre Dinamik Sayım)
  const rBadge = document.getElementById('rezCountBadge');
  if (rBadge) {
    const activeBookings = (appData.bookings || []).filter(b => isBookingInFilter(b));
    rBadge.innerText = activeBookings.length;
  }
  const eBadge = document.getElementById('expenseCountBadge');
  if (eBadge) {
    const activeExpenses = (appData.expenses || []).filter(exp => isExpenseInFilter(exp));
    eBadge.innerText = activeExpenses.length;
  }
  const lBadge = document.getElementById('leadCountBadge');
  if (lBadge) lBadge.innerText = appData.leads.length;
  const mBadge = document.getElementById('maintCountBadge');
  if (mBadge) mBadge.innerText = appData.maintenance.filter(m => m.status === 'OPEN').length;
}

// =============================================================
// 1. PROFESYONEL FİNANSAL PERFORMANS MODÜLÜ (GENEL RAPOR ENTEGRELİ)
// =============================================================
function getConfiguredRevenueTarget(filter, targets, villaKey = 'ALL') {
  const property = villaKey !== 'ALL' ? appData.villas?.[villaKey] : null;
  const propertyId = property?.id || null;
  const rows = Array.isArray(targets) ? targets : [];
  if (rows.length) {
    const matchingScope = rows.filter(t => propertyId
      ? (t.property_id === propertyId || t.propertyId === propertyId)
      : !(t.property_id || t.propertyId));
    let selected = matchingScope;
    if (/^\d{4}-\d{2}$/.test(filter.period || '')) {
      const [year, month] = filter.period.split('-').map(Number);
      selected = matchingScope.filter(t => Number(t.year) === year && Number(t.month) === month);
    } else if (filter.period === 'CUSTOM' && filter.startDate && filter.endDate) {
      const start = filter.startDate.slice(0, 7);
      const end = filter.endDate.slice(0, 7);
      selected = matchingScope.filter(t => {
        const ym = `${t.year}-${String(t.month).padStart(2, '0')}`;
        return ym >= start && ym <= end;
      });
    } else if (/^\d{4}-YEAR$/.test(filter.period || '')) {
      const year = Number(filter.period.slice(0, 4));
      selected = matchingScope.filter(t => Number(t.year) === year);
    }
    if (!selected.length) return null;
    return selected.reduce((sum, t) => sum + Number(t.revenue_target ?? t.revenue ?? 0), 0);
  }

  if (targets && typeof targets === 'object') {
    const candidate = targets[filter.period];
    if (candidate && Number.isFinite(Number(candidate.revenue ?? candidate.revenue_target))) {
      return Number(candidate.revenue ?? candidate.revenue_target);
    }
  }
  return null;
}

function renderFinanceModule() {
  let totalRevenue = 0;
  let totalOpex = 0;
  let totalCapex = 0;
  let totalSoldNights = 0;
  let avgRevPerNight = 0;
  let targetRev = null;
  // Mulk istatistikleri MUSTERININ KENDI mulklerinden kurulur. Burada bes
  // uydurma villa (Bella Vista, Olive Garden, Azure Bay, Sunset Horizon,
  // Palm Breeze) sabit yaziliydi: ilk musterinin portfoyu. Baska her musteri
  // finans ekraninda sahibi olmadigi bes villayi goruyordu.
  let propStats = {};
  Object.keys(appData.villas || {}).forEach(vKey => {
    propStats[vKey] = {
      name: (appData.villas[vKey] && appData.villas[vKey].name) || vKey,
      revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0
    };
  });

  const categoryTotals = {};
  EXPENSE_CATEGORIES.forEach(c => { categoryTotals[c.name] = 0; });


  // Resolve only explicitly configured targets. Missing data stays missing.
  if (targetRev === null) targetRev = getConfiguredRevenueTarget(currentFilter, appData.targets, currentFilter.villa);

  // Include user-entered bookings (in clean state, ALL revenue comes from here!)
  // Donemin toplamlari tek formulden (K-04, core/ledger_contract.js). Asagidaki
  // dongu yalniz MULK kirilimi icindir; toplamlar ondan turetilmez.
  const ledger = computeFilterLedger();
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    // USALI tahakkuk: aylari kesen rezervasyonun yalnizca bu doneme dusen payi.
    const pay = getBookingFilterShare(b);
    if (pay.nights === 0 && pay.ratio === 0) return;
    const bNet = ((Number(b.gross !== undefined ? b.gross : b.net) || 0) - (Number(b.discount) || 0)) * pay.ratio;
    const bRoom = ((Number(b.gross !== undefined ? b.gross : b.net) || 0) - (Number(b.cleanFee ?? b.cleaningFee) || 0) - (Number(b.discount) || 0)) * pay.ratio;
    const bNights = pay.nights;

    if (propStats[b.villa]) {
      propStats[b.villa].revenue += bNet;
      propStats[b.villa].roomRevenue = (propStats[b.villa].roomRevenue || 0) + bRoom;
      propStats[b.villa].nights += bNights;
    }
  });

  // Burada bir zamanlar `hasStaticExcelMonth` kontrolu vardi: silinmis
  // demo Excel veri setinde o ay varsa, isletmenin GERCEK rezervasyonlari
  // yok sayilip demo rakamlari gosteriliyordu. `appData.excelDb` yalnizca
  // null atanir ve baska hicbir yerde doldurulmaz, yani kontrol her zaman
  // false donuyordu — dal oluydu (3.6).
  {
    totalRevenue = ledger.totalRevenue;
    totalSoldNights = ledger.soldNights;
    // ADR = Net Oda Geliri / satilan gece (K-04). Satilan gece yoksa bilinmiyor.
    avgRevPerNight = ledger.adr === null ? null : Math.round(ledger.adr);


    const daysInPeriod = getPeriodDayCount();
    // Payda: mulkun o aydaki GERCEK kapasitesi (aktivasyon/pasiflestirme ve
    // bakim kesintisi dusulmus), sunucu snapshot'iyla ayni (L-36). Ay disi
    // donemlerde gun sayisi.
    const ayMi = /^d{4}-d{2}$/.test(currentFilter.period || '');
    const kapasite = vKey => {
      if (ayMi && typeof FinancialMetricsService !== 'undefined' && appData.villas[vKey]) {
        const [y, m] = currentFilter.period.split('-').map(Number);
        return FinancialMetricsService.calculateAvailableNights([appData.villas[vKey]], y, m, appData.maintenance || []);
      }
      return daysInPeriod;
    };
    Object.keys(propStats).forEach(vKey => {
      const s = propStats[vKey];
      const payda = kapasite(vKey);
      s.adr = s.nights > 0 ? Math.round((s.roomRevenue || 0) / s.nights) : 0;
      s.share = totalRevenue > 0 ? Number(((s.revenue / totalRevenue) * 100).toFixed(1)) : 0;
      s.occupancy = payda > 0 ? Number(((s.nights / payda) * 100).toFixed(1)) : 0;
      s.revpar = payda > 0 ? Math.round((s.roomRevenue || 0) / payda) : 0;
    });

    // Mulk filtresi defterin kendisinde (isBookingInFilter); toplamlar
    // burada mulk kiriliminden yeniden yazilmaz.
  }

  // Categorical expenses
  appData.expenses.forEach(exp => {
    if (!isExpenseInFilter(exp)) return;
    const amt = Number(exp.amount) || 0;
    // Kategori eslemesi BUYUK-KUCUK HARF DUYARSIZ olmali. Eskiden birebir
    // karsilastiriliyordu: "TEMİZLİK" (ice aktarilan dosyadaki hali) listedeki
    // "Temizlik" ile eslesmiyor, gider grafiginde her sey "Diger"e dusuyordu.
    const kat = eslesenGiderKategorisi(exp.category);
    categoryTotals[kat] = (categoryTotals[kat] || 0) + amt;
  });

  // Rezervasyondan ve temizlik defterinden OTOMATIK gelen giderler de
  // kategorilere dusulur; yoksa halka grafiginin dilimleri toplam gideri
  // tutmaz.
  const otomatikKomisyon = ledger.otaCommission + ledger.paymentCommission;
  categoryTotals['Kredi Kartı / Komisyon'] = (categoryTotals['Kredi Kartı / Komisyon'] || 0) + otomatikKomisyon;
  categoryTotals['Temizlik'] = (categoryTotals['Temizlik'] || 0) + ledger.cleaningCost;
  totalOpex = ledger.totalOpex;
  totalCapex = ledger.capex;

  // Bu tutarlar rezervasyonlardan ve temizlik defterinden OTOMATIK gelir.
  // Kullanici ayni maliyeti bir de Gider Defteri'ne elle girerse iki kez
  // dusulur; bunu gizlemek yerine ekranda acikca gosteriyoruz.
  const otomatikParcalar = [];
  if (ledger.otaCommission > 0) otomatikParcalar.push(`${Math.round(ledger.otaCommission).toLocaleString('tr-TR')} TL OTA komisyonu`);
  if (ledger.paymentCommission > 0) otomatikParcalar.push(`${Math.round(ledger.paymentCommission).toLocaleString('tr-TR')} TL ödeme komisyonu`);
  if (ledger.cleaningCost > 0) otomatikParcalar.push(`${Math.round(ledger.cleaningCost).toLocaleString('tr-TR')} TL yapılmış temizlik maliyeti`);
  let ortakNot = '';
  if (currentFilter.villa !== 'ALL') {
    const ortak = (appData.expenses || [])
      .filter(e => e.villa === 'ALL' && (currentFilter.period === 'ALL' || isDateInFilter(e.date || (e.month ? e.month + '-15' : ''))))
      .reduce((t, e) => t + (Number(e.amount) || 0), 0);
    if (ortak > 0) ortakNot = ` Portföy geneli ${Math.round(ortak).toLocaleString('tr-TR')} TL gider bu mülk görünümüne dahil değildir.`;
  }
  setEl('finAutoDerivedCost', (otomatikParcalar.length
    ? `Bunun ${otomatikParcalar.join(', ')} kayıtlardan otomatik gelir. Aynı tutarları Gider Defteri'ne tekrar girmeyin.`
    : '') + ortakNot);

  // Hierarchy calculations
  const operatingProfit = totalRevenue - totalOpex;
  const netCashProfit = operatingProfit - totalCapex;
  const totalExpense = totalOpex + totalCapex;
  const netMargin = totalRevenue > 0 ? (netCashProfit / totalRevenue) * 100 : 0;
  const expenseRatio = totalRevenue > 0 ? (totalExpense / totalRevenue) * 100 : 0;

  // Monthly Target Comparison
  const hasTarget = Number.isFinite(Number(targetRev)) && Number(targetRev) > 0;
  const targetDiff = hasTarget ? totalRevenue - Number(targetRev) : null;
  const targetPct = hasTarget ? (totalRevenue / Number(targetRev)) * 100 : null;
  const forecastEndMonth = null; // A forecast is shown only when a real forecast model supplies one.

  // Update Top 5 KPI Cards
  // setEl artik genel kapsamda tanimli. Burada yerel bir const olarak
  // duruyordu ve fonksiyonun BASINDA kullanildigi icin TDZ hatasi veriyordu:
  //   ReferenceError: Cannot access 'setEl' before initialization

  setEl('finActualRevenue', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('finRevTargetDelta', hasTarget ? `Hedefin %${Math.round(Math.abs(targetPct - 100))} ${targetDiff >= 0 ? 'üzerinde' : 'altında'}` : 'Hedef belirlenmedi');
  setEl('finTargetRevenue', hasTarget ? `${Math.round(targetRev).toLocaleString('tr-TR')} TL` : '—');
  setEl('finTargetDiff', hasTarget ? `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL fark` : '—');

  setEl('finNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('finNetMarginLabel', `%${netMargin.toFixed(1)} net kâr marjı`);

  setEl('finTotalExpense', `${Math.round(totalExpense).toLocaleString('tr-TR')} TL`);
  setEl('finExpenseRatio', `Cironun %${expenseRatio.toFixed(1)}'i`);

  setEl('finSoldNights', `${totalSoldNights} gece`);
  setEl('finAvgRevPerNight', avgRevPerNight === null ? 'ADR: — (satılan gece yok)' : `ADR ${avgRevPerNight.toLocaleString('tr-TR')} TL (net oda geliri / satılan gece)`);

  // Target Analysis Box
  setEl('tgtBoxTarget', hasTarget ? `${Math.round(targetRev).toLocaleString('tr-TR')} TL` : '—');
  setEl('tgtBoxActual', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('tgtBoxDiff', hasTarget ? `${targetDiff >= 0 ? '+' : ''}${Math.round(targetDiff).toLocaleString('tr-TR')} TL` : '—');
  setEl('tgtBoxPct', hasTarget ? `%${targetPct.toFixed(1)}` : '—');
  setEl('tgtBoxForecast', forecastEndMonth === null ? '—' : `${forecastEndMonth.toLocaleString('tr-TR')} TL`);
  setEl('finTargetStatusBadge', hasTarget ? `%${targetPct.toFixed(1)} Hedef Başarısı` : 'Hedef belirlenmedi');
  setEl('targetBarRatioText', hasTarget ? `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL / ${Math.round(targetRev).toLocaleString('tr-TR')} TL (%${targetPct.toFixed(1)})` : `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL / —`);

  const fillEl = document.getElementById('targetBarFill');
  if (fillEl) fillEl.style.width = hasTarget ? `${Math.min(100, Math.max(0, targetPct))}%` : '0%';

  // Profit Waterfall Bridge
  setEl('brCiro', `${Math.round(totalRevenue).toLocaleString('tr-TR')} TL`);
  setEl('brOpex', `-${Math.round(totalOpex).toLocaleString('tr-TR')} TL`);
  setEl('brOpProfit', `${Math.round(operatingProfit).toLocaleString('tr-TR')} TL`);
  setEl('brCapex', `-${Math.round(totalCapex).toLocaleString('tr-TR')} TL`);
  setEl('brNetProfit', `${Math.round(netCashProfit).toLocaleString('tr-TR')} TL`);
  setEl('brNetMargin', `%${netMargin.toFixed(1)} Net Kâr Marjı`);

  // Operasyonel kar marji index.html'de "%30,3" olarak KODA GOMULUYDU ve hicbir
  // zaman guncellenmiyordu; hemen altindaki net marj dogru hesaplanirken bu
  // sabit kaliyordu, yani iki satir birbirini yalanliyordu.
  const opMargin = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;
  setEl('brOpMargin', `Marj: %${opMargin.toFixed(1)} (Yatırımlar Öncesi)`);

  // "geçen aya göre" rozetleri de statik HTML'di.
  const prevTotals = computePreviousPeriodTotals();
  setEl('finNetProfitMoM', formatMoMLabel(netCashProfit, prevTotals.netProfit));
  setEl('finExpenseMoM', formatMoMLabel(totalExpense, prevTotals.expense));
  setEl('finRevMoM', formatMoMLabel(totalRevenue, prevTotals.revenue));
  setEl('finNightsMoM', formatMoMLabel(totalSoldNights, prevTotals.nights));

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
    path.innerHTML = `<title>${escapeHtml(cat.name)}: ${amt.toLocaleString('tr-TR')} TL (%${((amt/totalExpense)*100).toFixed(1)})</title>`;
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

  // Onceki donemin kategori toplamlari. Burada eskiden `dummyMoMDeltas` adinda
  // sabit bir tablo vardi ("↑ %14", "↑ %4"...) ve musteriye gercek trendmis
  // gibi gosteriliyordu - hangi ay secilirse secilsin ayni sayilar.
  const prevCategoryTotals = computePreviousPeriodCategoryTotals();

  EXPENSE_CATEGORIES.forEach(cat => {
    const amt = categoryTotals[cat.name] || 0;
    const shareExpense = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
    const shareRev = totalRevenue > 0 ? (amt / totalRevenue) * 100 : 0;
    const deltaStr = formatMoMDelta(amt, prevCategoryTotals[cat.name] || 0);

    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = () => filterExpensesByCategory(cat.name);
    tr.innerHTML = `
      <td><span class="cat-dot" style="background:${cat.color};"></span> <strong>${escapeHtml(cat.name)}</strong></td>
      <td><strong>${Math.round(amt).toLocaleString('tr-TR')} TL</strong></td>
      <td>%${shareExpense.toFixed(1)}</td>
      <td>%${shareRev.toFixed(1)}</td>
      <td><span class="${deltaStr.includes('↑') ? 'text-rose' : 'text-emerald'}">${deltaStr}</span></td>
      <td style="text-align: right;"><button class="btn-text" data-onclick="filterExpensesByCategory(decodeURIComponent('${encodeActionArg(cat.name)}'), event)">Detay ›</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function filterExpensesByCategory(catName, clickEvent) {
  if (clickEvent && typeof clickEvent.stopPropagation === 'function') clickEvent.stopPropagation();
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

  const vKeys = Object.keys(appData.villas || {}).filter(k => propStats && propStats[k]);
  
  // Sort villas by revenue descending so #1 is clearly visible
  const sortedVillas = vKeys.map(k => {
    const s = propStats[k] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0, share: 0 };
    const conf = (appData.villas && appData.villas[k]) || {};
    const spec = [conf.capacity, conf.amenities].filter(Boolean).join(' • ') || 'Özellik belirtilmedi';
    return { key: k, conf, stats: s, meta: { icon: '🏡', spec } };
  }).sort((a, b) => b.stats.revenue - a.stats.revenue);

  // 1. Render Executive Ranking Matrix Table
  if (tableBody) {
    tableBody.innerHTML = '';
    sortedVillas.forEach((item, idx) => {
      const s = item.stats;
      const rank = idx + 1;
      const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
      const ciroShare = totalRevenue > 0 ? (s.revenue / totalRevenue) * 100 : 0;
      const occVal = Number(s.occupancy || ((s.nights / getPeriodDayCount()) * 100).toFixed(1));
      const adrVal = Math.round(s.adr || (s.nights > 0 ? s.revenue / s.nights : 0));

      // Determine Strategic Diagnosis
      let diagBadge = '<span class="badge badge-emerald">🟢 Dengeli</span>';
      if (rank === 1 && s.revenue > 0) diagBadge = '<span class="badge badge-emerald">👑 Ciro Şampiyonu</span>';
      else if (occVal < 40 && s.revenue > 0) diagBadge = '<span class="badge badge-rose">📉 Boşluk Riski</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="prop-name-col">
            <span class="rank-badge ${rankClass}">#${rank}</span>
            <div class="villa-icon-avatar">${item.meta.icon || '🏡'}</div>
            <div class="villa-text-meta">
              <h4>${escapeHtml(item.conf.name)}</h4>
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
          <strong class="text-emerald" title="Mülk bazında gider dağılımı bulunmadığı için hesaplanamadı">—</strong>
          <span style="display:block; font-size:10px; color:var(--text-muted);">Gider dağılımı gerekli</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" data-onclick="filterByVilla(decodeURIComponent('${encodeActionArg(item.key)}'))">🔍 Odaklan</button>
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
      const occVal = Number(s.occupancy || ((s.nights / getPeriodDayCount()) * 100).toFixed(1));
      const adrVal = Math.round(s.adr || (s.nights > 0 ? s.revenue / s.nights : 0));

      const card = document.createElement('div');
      card.className = `prop-card-premium ${rank === 1 ? 'leader-card' : ''}`;
      card.onclick = () => filterByVilla(item.key);

      card.innerHTML = `
        <div class="prop-card-head">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="villa-icon-avatar">${item.meta.icon || '🏡'}</div>
            <div>
              <h3 style="margin:0; font-size:15px; font-weight:700;">${escapeHtml(item.conf.name)}</h3>
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
            <span class="s-val text-emerald" title="Mülk bazında gider dağılımı bulunmadığı için hesaplanamadı">—</span>
          </div>
          <div class="subm-box">
            <span class="s-lbl">KÂR MARJI</span>
            <span class="s-val" title="Mülk bazında gider dağılımı bulunmadığı için hesaplanamadı">—</span>
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

  // Musterinin GERCEK mulkleri. Sabit ['BELLA','OLIVE','AZURE','SUNSET','PALM']
  // yaziliydi: ilk musterinin villalari. Baska herkes kendi villalarini hic
  // gormuyor, bunun yerine sahibi olmadigi bes bos cubuk goruyordu.
  const vKeys = Object.keys(propStats || {}).filter(k => propStats[k]);
  const values = [];

  vKeys.forEach(vKey => {
    const s = propStats[vKey] || { revenue: 0, nights: 0, adr: 0, occupancy: 0, revpar: 0 };
    let val = 0;
    if (metric === 'ciro') val = s.revenue;
    if (metric === 'netKar') val = null;
    if (metric === 'adr') val = s.adr || (s.nights > 0 ? Math.round(s.revenue / s.nights) : 0);
    if (metric === 'revpar') val = s.revpar || Math.round(s.revenue / getPeriodDayCount());
    if (metric === 'doluluk') val = Number(s.occupancy || ((s.nights / getPeriodDayCount()) * 100).toFixed(1));
    if (metric === 'satilanGece') val = s.nights;
    values.push({ key: vKey, name: ((appData.villas && appData.villas[vKey] && appData.villas[vKey].name) || vKey), val });
  });

  const maxVal = Math.max(1, ...values.map(v => Number(v.val) || 0));

  values.forEach(item => {
    const barPct = item.val === null ? 0 : (item.val / maxVal) * 100;
    const row = document.createElement('div');
    row.className = 'comp-bar-row';
    row.innerHTML = `
      <div class="comp-bar-label"><strong>${escapeHtml(item.name)}</strong></div>
      <div class="comp-bar-track">
        <div class="comp-bar-fill" style="width: ${barPct}%;"></div>
      </div>
      <div class="comp-bar-value"><strong title="${item.val === null ? 'Mülk bazında gider dağılımı bulunmadığı için hesaplanamadı' : ''}">${item.val === null ? '—' : item.val.toLocaleString('tr-TR')}</strong></div>
    `;
    container.appendChild(row);
  });

  // Anomaly Badges Detection
  const anomContainer = document.getElementById('anomaliesListContainer');
  if (anomContainer) {
    anomContainer.innerHTML = '';

    // Anomaliler MUSTERININ KENDI verisinden cikarilir.
    //
    // Burada uc sabit metin vardi ve secili doneme gore diziliyordu: Agustos
    // 2026'da "VILLA SUNSET HORIZON %96,8 doluluk, 2.826 TL ADR", Ocak
    // 2026'da "Temmuz 2025'te 320.000 TL ciro rekoru", diger her ayda ise
    // "resmi sirket raporu verileri basariyla incelendi". Hicbiri hesaplanmis
    // degildi; hepsi ilk musterinin rakamlariydi ve bos bir hesapta bile
    // gorunuyordu.
    const anomalies = [];
    const aktif = vKeys
      .map(k => ({ key: k, s: propStats[k], ad: ((appData.villas && appData.villas[k] && appData.villas[k].name) || k) }))
      .filter(v => v.s && Number(v.s.nights) > 0);

    if (aktif.length === 0) {
      anomalies.push({ type: 'info', text: 'Bu dönemde satılan gece bulunmuyor; karşılaştırılacak veri yok.' });
    } else {
      const adrOf = v => Number(v.s.adr) || (v.s.nights > 0 ? v.s.revenue / v.s.nights : 0);
      const ortAdr = aktif.reduce((a, v) => a + adrOf(v), 0) / aktif.length;
      const ortDoluluk = aktif.reduce((a, v) => a + (Number(v.s.occupancy) || 0), 0) / aktif.length;
      const tl = n => Math.round(n).toLocaleString('tr-TR');

      const enIyi = aktif.slice().sort((a, b) => adrOf(b) - adrOf(a))[0];
      anomalies.push({
        type: 'success',
        text: `💎 ${enIyi.ad}: dönemin en yüksek gecelik fiyatı — ${tl(adrOf(enIyi))} TL/gece (${enIyi.s.nights} gece, ${tl(enIyi.s.revenue)} TL).`
      });

      // Talep var ama fiyat dusuk: doluluk ortalamanin ustunde, ADR altinda.
      aktif
        .filter(v => (Number(v.s.occupancy) || 0) > ortDoluluk && adrOf(v) < ortAdr)
        .slice(0, 2)
        .forEach(v => anomalies.push({
          type: 'warning',
          text: `⚠️ ${v.ad}: doluluk portföy ortalamasının üstünde (%${(Number(v.s.occupancy) || 0).toFixed(1)}) ama gecelik fiyat altında (${tl(adrOf(v))} TL, ortalama ${tl(ortAdr)} TL). Talep varken taban fiyat gözden geçirilmeli.`
        }));

      // Hic satmayan mulkler
      const bos = vKeys.filter(k => propStats[k] && !(Number(propStats[k].nights) > 0));
      if (bos.length) {
        const adlar = bos.map(k => ((appData.villas && appData.villas[k] && appData.villas[k].name) || k)).join(', ');
        anomalies.push({ type: 'warning', text: `⚠️ Bu dönemde hiç satılmayan mülk: ${adlar}.` });
      }
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

  const allTrendData = getMonthlyKpiDataset().filter(d => d.ciro !== 0 || d.totalExp !== 0 || d.nights !== 0);
  if (!allTrendData.length) {
    container.innerHTML = `
      <div style="text-align:center; padding: 45px 20px; color: var(--color-slate-400);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📊</div>
        <strong style="color:var(--color-slate-200); font-size:1.05rem;">Henüz aylık finans verisi yok</strong>
        <p style="font-size: 0.85rem; margin-top: 6px;">Yeni rezervasyonlar ve harcamalar eklendikçe aylık trend sütunları burada otomatik oluşacaktır.</p>
      </div>
    `;
    return;
  }

  let selectedTrendData = allTrendData;
  if (activeTrendRange === '3M') selectedTrendData = allTrendData.slice(-3);
  if (activeTrendRange === '6M') selectedTrendData = allTrendData.slice(-6);
  if (activeTrendRange === '12M') selectedTrendData = allTrendData.slice(-12);
  if (activeTrendRange === 'YTD') selectedTrendData = allTrendData.filter(d => d.key.startsWith(String(new Date().getFullYear())));
  const displayData = selectedTrendData.map(d => ({
    key: d.key, month: d.monthName, ciro: d.ciro, opex: d.opex,
    profit: Math.max(0, d.netProfit)
  }));

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

/**
 * Gecen yilin AYNI ayi ile karsilastirma.
 *
 * Bu panel HIC CALISMIYORDU. Karsilastirma tabani `appData.excelDb` idi;
 * o alan yalnizca `null` atanir, baska hicbir yerde doldurulmaz (silinmis
 * demo veri seti). Yani panel, isletmenin gecen yila ait gercek
 * rezervasyonlari Postgres'te dururken bile her zaman "Veriler sıfırlandı"
 * yaziyordu. Gecmis donem anahtari da sabitti (`prevKey = '2025-08'`):
 * 2027'de bakan bir kullanici 2025 Agustos ile karsilastirilacakti.
 *
 * Artik taban `computeMonthActuals()` — KPI izleyicinin kullandigi tabanin
 * ayni. Gecen yil veri YOKSA rakam uydurulmaz, durum soylenir (3.6).
 */
function renderYoYComparison(actualRevenue, actualOpex, actualNetProfit, actualNights) {
  const subEl = document.getElementById('yoySubText');
  const badgeEl = document.getElementById('yoyBadge');
  const container = document.getElementById('yoyBoxesContainer');

  // Yalnizca tek bir ay secilmisken anlamlidir; 'ALL', 'CUSTOM' ve
  // '2026-YEAR' gibi donemlerin "gecen yilin ayni ayi" karsiligi yoktur.
  const donem = currentFilter.period || '';
  const ayMi = /^\d{4}-(0[1-9]|1[0-2])$/.test(donem);
  const prevKey = ayMi ? (Number(donem.slice(0, 4)) - 1) + donem.slice(4) : null;

  const bosluk = (baslik, mesaj) => {
    if (subEl) subEl.innerText = baslik;
    if (badgeEl) badgeEl.innerText = '—';
    if (container) {
      container.innerHTML = `
        <div style="text-align:center; padding: 25px; color: var(--color-slate-400); grid-column: span 3;">
          ${mesaj}
        </div>
      `;
    }
  };

  if (!ayMi) {
    bosluk('Aylık karşılaştırma', 'Geçen yılla karşılaştırma için tek bir ay seçin.');
    return;
  }

  const gecen = computeMonthActuals(prevKey, currentFilter ? currentFilter.villa : 'ALL');
  const prevRevenue = gecen.ciro;
  const prevNights = gecen.nights;
  const prevNetProfit = gecen.netProfit;

  if (prevRevenue === 0 && prevNights === 0) {
    bosluk(
      `${getPeriodDisplayName(prevKey)} vs ${getPeriodDisplayName(donem)}`,
      `${getPeriodDisplayName(prevKey)} dönemine ait kayıt yok; karşılaştırma yapılamıyor.`
    );
    return;
  }

  const revDeltaNominal = actualRevenue - prevRevenue;
  const revDeltaPct = prevRevenue > 0 ? (revDeltaNominal / prevRevenue) * 100 : 0;
  const profitDeltaNominal = actualNetProfit - prevNetProfit;
  const profitDeltaPct = prevNetProfit > 0 ? (profitDeltaNominal / prevNetProfit) * 100 : 0;
  const nightsDelta = actualNights - prevNights;
  const nightsDeltaPct = prevNights > 0 ? (nightsDelta / prevNights) * 100 : 0;

  if (subEl) subEl.innerText = `${getPeriodDisplayName(prevKey)} vs ${getPeriodDisplayName(donem)}`;
  // Gecen yil ciro 0 ise yuzde artis tanimsizdir; %0 yazmak "buyume yok"
  // demektir ve yaniltir.
  if (badgeEl) {
    badgeEl.innerText = prevRevenue > 0
      ? `Nominal Büyüme: %${revDeltaPct >= 0 ? '+' : ''}${revDeltaPct.toFixed(1)}`
      : 'Nominal Büyüme: —';
  }

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
  const goodBox = document.getElementById('aiGoodContent');
  const badBox = document.getElementById('aiBadContent');
  const whyBox = document.getElementById('aiWhyContent');
  const actionBox = document.getElementById('aiActionContent');

  if (revenue === 0) {
    if (goodBox) goodBox.innerHTML = '<p>• <strong>Temiz Başlangıç:</strong> Sistem verileri sıfırlandı. Yeni rezervasyonlar girildikçe finansal analizler burada anlık oluşturulacaktır.</p>';
    if (badBox) badBox.innerHTML = '<p>• <strong>Kaçak Yok:</strong> Şu anda kayıtlı maliyet kaçağı veya düşük fiyat anomalisi bulunmuyor.</p>';
    if (whyBox) whyBox.innerHTML = '<p>• <strong>Korelasyon:</strong> Rezervasyon ve harcama girişi yapıldıkça maliyet korelasyonları tespit edilecektir.</p>';
    if (actionBox) actionBox.innerHTML = '<div style="padding: 15px; color: var(--color-slate-400); text-align:center;">Yeni rezervasyon veya harcama kaydı bekleniyor.</div>';
    return;
  }
  // BURADA UYDURMA METIN VARDI. Geliri sifirdan buyuk olan HER musteri, kendi
  // rakamlarindan bagimsiz olarak su sabit cumleleri goruyordu:
  //   "Villa Azure Bay Liderligi", "5.004.165 TL tarihsel ciro / 457 gece",
  //   "Villa Sunset Horizon 30 gece satti, ADR 2.826 TL'de kaldi",
  //   "OTA komisyonlari 75.519 TL kesintiye yol acti",
  //   "Camasirhane gideri 47.000 TL'ye ulasti".
  // Hicbiri hesaplanmiyordu. Artik her cumle musterinin kendi verisinden
  // uretiliyor; uretilemiyorsa yazilmiyor.
  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const donemAdi = getPeriodDisplayName(currentFilter.period);

  const donemBk = (appData.bookings || []).filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
  const paylar = donemBk.map(b => ({ b, p: getBookingFilterShare(b) }));
  const donemGece = paylar.reduce((a, x) => a + x.p.nights, 0);
  const komisyon = paylar.reduce((a, x) => a + (Number(x.b.otaCommission) || 0) * x.p.ratio, 0);

  // Mulk bazinda: en iyi ve en zayif gecelik fiyat
  const mulkStat = Object.keys(propStats || {})
    .map(k => ({ k, s: propStats[k], ad: (propStats[k] && propStats[k].name) || k }))
    .filter(v => v.s && Number(v.s.nights) > 0)
    .map(v => ({ ...v, adr: Number(v.s.adr) || (v.s.revenue / v.s.nights) }))
    .sort((a, b) => b.adr - a.adr);

  // Gider kategorisi liderligi
  const donemGid = (appData.expenses || []).filter(e => isExpenseInFilter(e));
  const katTop = {};
  donemGid.forEach(e => { katTop[e.category || 'Diğer'] = (katTop[e.category || 'Diğer'] || 0) + (Number(e.amount) || 0); });
  const enBuyukKat = Object.entries(katTop).sort((a, b) => b[1] - a[1])[0];

  if (goodBox) {
    const satirlar = [];
    if (targetRev > 0) {
      satirlar.push(`<p>• <strong>Hedef Gerçekleşmesi:</strong> ${tl(targetRev)} TL hedefe karşılık ${tl(revenue)} TL gerçekleşti — <strong>%${targetPct.toFixed(1)}</strong>.</p>`);
    } else {
      satirlar.push(`<p>• <strong>Ciro:</strong> ${donemAdi} döneminde ${tl(revenue)} TL ciro, ${donemGece} satılan gece. (Bu dönem için hedef girilmemiş.)</p>`);
    }
    if (mulkStat.length) {
      const en = mulkStat[0];
      satirlar.push(`<p>• <strong>En Güçlü Mülk:</strong> ${escapeHtml(en.ad)} — ${tl(en.adr)} TL/gece ile dönemin en yüksek gecelik fiyatı (${en.s.nights} gece, ${tl(en.s.revenue)} TL).</p>`);
    }
    if (netProfit > 0) {
      satirlar.push(`<p>• <strong>Net Kâr:</strong> ${tl(netProfit)} TL${netMargin ? ` (marj %${Number(netMargin).toFixed(1)})` : ''}.</p>`);
    }
    goodBox.innerHTML = satirlar.join('') || '<p>• Bu dönem için öne çıkarılacak bir sonuç yok.</p>';
  }

  if (badBox) {
    const satirlar = [];
    if (revenue > 0) {
      satirlar.push(`<p>• <strong>Gider / Ciro Oranı:</strong> Toplam giderler cironun <strong>%${(((opex + capex) / revenue) * 100).toFixed(1)}</strong>'i seviyesinde.</p>`);
    }
    if (mulkStat.length > 1) {
      const ortAdr = mulkStat.reduce((a, v) => a + v.adr, 0) / mulkStat.length;
      const zayif = mulkStat[mulkStat.length - 1];
      if (zayif.adr < ortAdr) {
        satirlar.push(`<p>• <strong>Düşük Gecelik Fiyat:</strong> ${escapeHtml(zayif.ad)} ${zayif.s.nights} gece sattı ama gecelik ${tl(zayif.adr)} TL'de kaldı; portföy ortalaması ${tl(ortAdr)} TL.</p>`);
      }
    }
    if (enBuyukKat) {
      satirlar.push(`<p>• <strong>En Büyük Gider Kalemi:</strong> ${escapeHtml(enBuyukKat[0])} — ${tl(enBuyukKat[1])} TL.</p>`);
    }
    badBox.innerHTML = satirlar.join('') || '<p>• Bu dönemde öne çıkan bir maliyet anomalisi yok.</p>';
  }

  if (whyBox) {
    const satirlar = [];
    if (komisyon > 0) {
      const oran = revenue > 0 ? ((komisyon / revenue) * 100).toFixed(1) : null;
      satirlar.push(`<p>• <strong>OTA Komisyonu:</strong> ${tl(komisyon)} TL${oran ? ` (cironun %${oran}'i)` : ''}. Doğrudan satışa kayan her rezervasyon bu kalemi düşürür.</p>`);
    }
    if (capex > 0) {
      satirlar.push(`<p>• <strong>Yatırım (CAPEX):</strong> ${tl(capex)} TL. Bu tutar işletme kârını değil nakit akışını etkiler.</p>`);
    }
    whyBox.innerHTML = satirlar.join('') || '<p>• Bu dönemde açıklanacak belirgin bir maliyet korelasyonu yok.</p>';
  }

  if (actionBox) {
    const oneriler = [];
    if (mulkStat.length > 1) {
      const ortAdr = mulkStat.reduce((a, v) => a + v.adr, 0) / mulkStat.length;
      const zayif = mulkStat[mulkStat.length - 1];
      if (zayif.adr < ortAdr * 0.85) {
        const hedef = Math.round(ortAdr / 100) * 100;
        oneriler.push({
          baslik: `${zayif.ad} taban fiyatını gözden geçirin`,
          metin: `Gecelik ${tl(zayif.adr)} TL ile portföy ortalamasının (${tl(ortAdr)} TL) altında. Doluluk korunuyorsa taban fiyat ${tl(hedef)} TL bandına çekilebilir.`,
          gorev: `${zayif.ad} taban fiyatını gözden geçir`
        });
      }
    }
    if (komisyon > 0) {
      oneriler.push({
        baslik: 'Doğrudan satış payını artırın',
        metin: `Bu dönem ${tl(komisyon)} TL OTA komisyonu ödendi. Tekrar gelen misafirlere doğrudan kanaldan teklif götürmek bu kalemi doğrudan azaltır.`,
        gorev: 'Doğrudan rezervasyon kampanyası planla'
      });
    }
    if (enBuyukKat && revenue > 0 && enBuyukKat[1] > revenue * 0.15) {
      oneriler.push({
        baslik: `${enBuyukKat[0]} giderini inceleyin`,
        metin: `${tl(enBuyukKat[1])} TL ile cironun %${((enBuyukKat[1] / revenue) * 100).toFixed(1)}'ini oluşturuyor. Tedarikçi veya sözleşme koşulları gözden geçirilmeli.`,
        gorev: `${enBuyukKat[0]} gideri için tedarikçi görüşmesi`
      });
    }

    actionBox.innerHTML = oneriler.length
      ? oneriler.map((o, i) => `
      <div class="ai-action-item">
        <div class="action-text">
          <strong>${i + 1}. ${escapeHtml(o.baslik)}</strong>
          <p>${escapeHtml(o.metin)}</p>
        </div>
        <button class="btn btn-primary btn-sm" data-ai-task="${escapeHtml(o.gorev)}">⚡ Görev Oluştur</button>
      </div>`).join('')
      : '<div style="padding: 15px; color: var(--color-slate-400); text-align:center;">Bu dönem verisinden çıkarılabilecek somut bir aksiyon önerisi yok.</div>';

    // Inline onclick yerine delegasyon: mulk adinda tirnak olabilir.
    actionBox.querySelectorAll('[data-ai-task]').forEach(btn => {
      btn.addEventListener('click', () => createTaskFromAI(btn.getAttribute('data-ai-task'), 'P2', ''));
    });
  }
}

async function createTaskFromAI(title, priority, notes) {
  const propertyId = currentFilter.villa === 'ALL' ? null : currentFilter.villa;
  const canonicalPriority = priority === 'P1' || priority === 'HIGH' ? 'HIGH' : 'MEDIUM';
  return await convertAiActionToTask(title, propertyId, canonicalPriority, notes);
}

// -------------------------------------------------------------
// CANLI WHAT-IF GELİR & KÂR SİMÜLATÖRÜ
// -------------------------------------------------------------
function runWhatIfSimulation() {
  const adrDelta = Number(document.getElementById('simAdrSlider')?.value) || 0;
  const occDelta = Number(document.getElementById('simOccSlider')?.value) || 0;
  const directPct = Number(document.getElementById('simDirectSlider')?.value) || 60;

  setEl('simAdrLabel', `${adrDelta >= 0 ? '+' : ''}%${adrDelta}`);
  setEl('simOccLabel', `${occDelta >= 0 ? '+' : ''}%${occDelta}`);
  setEl('simDirectLabel', `%${directPct}`);

  // Taban: secili donemin DEFTERI (K-04 formulu, tahakkuklu). Eskiden
  // rezervasyonlarin TAMAMI donem disi geceleriyle birlikte sayiliyordu.
  const d = computeFilterLedger();
  const baseRevenue = d.totalRevenue;
  const baseNights = d.soldNights;
  const baseAdr = d.adr || 0;
  const baseProfit = d.netProfit;

  if (baseRevenue <= 0 || baseNights <= 0) {
    setEl('simResRevenue', '—');
    setEl('simResRevDelta', 'Bu dönemde satılmış gece yok; simülasyon yapılamaz');
    setEl('simResCommission', '—');
    setEl('simResCommDelta', 'Veri yok');
    setEl('simResProfit', '—');
    setEl('simResProfitDelta', 'Kayıt bekleniyor');
    return;
  }

  // Oranlar ISLETMENIN KENDI kayitlarindan olculur (L-37, 3.6). Eskiden
  // sabit %16 OTA komisyonu ve gece basi 600 TL marjinal maliyet
  // varsayiliyordu; olculmemis bir sayi olculmus gibi sonuc uretiyordu.
  const kanallar = (typeof appData !== 'undefined' && appData.bookingChannels) || [];
  const direktMi = b => isDirectBookingChannel(b.channel, kanallar);
  const otaGeliri = (appData.bookings || [])
    .filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b) && !direktMi(b))
    .reduce((t, b) => t + ((Number(b.gross) || 0) - (Number(b.discount) || 0)) * getBookingFilterShare(b).ratio, 0);
  const otaOrani = otaGeliri > 0 ? d.otaCommission / otaGeliri : null;
  const geceMaliyeti = d.cleaningCost > 0 ? d.cleaningCost / baseNights : null;
  // Temizlik geliri gece basina (ucret brutun icinde; oda disi gelir).
  const geceTemizlikGeliri = d.cleaningRevenue / baseNights;

  const newAdr = baseAdr * (1 + (adrDelta / 100));
  const newNights = Math.max(1, Math.round(baseNights * (1 + (occDelta / 100))));
  const newRoomRevenue = newAdr * newNights;
  const newRevenue = Math.round(newRoomRevenue + geceTemizlikGeliri * newNights);
  const revDiff = newRevenue - baseRevenue;
  const revDiffPct = (revDiff / baseRevenue) * 100;

  const otaShare = Math.max(0, (100 - directPct) / 100);
  const newComm = otaOrani === null ? d.otaCommission : Math.round(newRevenue * otaShare * otaOrani);
  const commSaved = d.otaCommission - newComm;

  const marginalCost = geceMaliyeti === null ? 0 : (newNights - baseNights) * geceMaliyeti;
  const newOpex = Math.round(d.totalOpex - d.otaCommission + newComm + marginalCost);
  const newProfit = Math.round(newRevenue - newOpex - d.capex);
  const profitDiff = newProfit - baseProfit;
  const newMargin = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;

  setEl('simResRevenue', `${newRevenue.toLocaleString('tr-TR')} TL`);
  setEl('simResRevDelta', `${revDiff >= 0 ? '+' : ''}${Math.round(revDiff).toLocaleString('tr-TR')} TL (%${revDiffPct.toFixed(1)})`);

  if (otaOrani === null) {
    setEl('simResCommission', '—');
    setEl('simResCommDelta', 'Bu dönemde OTA rezervasyonu yok; komisyon oranı ölçülemedi');
  } else {
    setEl('simResCommission', `${Math.round(commSaved).toLocaleString('tr-TR')} TL`);
    setEl('simResCommDelta', `Ölçülen OTA oranı %${(otaOrani * 100).toFixed(1)} · yeni komisyon ${newComm.toLocaleString('tr-TR')} TL`);
  }

  setEl('simResProfit', `${newProfit.toLocaleString('tr-TR')} TL`);
  setEl('simResProfitDelta', `${profitDiff >= 0 ? '+' : ''}${Math.round(profitDiff).toLocaleString('tr-TR')} TL (%${newMargin.toFixed(1)} Marj)`
    + (geceMaliyeti === null ? ' · ek gece maliyeti ölçülemedi (yapılmış temizlik yok)' : ''));
}

/**
 * Kanal dogrudan mi? Isletmenin kanal ayarlari (phase30, tenant_booking_channels
 * channel_type = DIRECT) once gelir; kayit yoksa bilinen dogrudan kanallar.
 * Eskiden iki yerde iki farkli sabit liste vardi ve isletmenin kendi
 * tanimladigi ozel dogrudan kanallar hep OTA sayiliyordu (L-37).
 */
function isDirectBookingChannel(channel, channels) {
  const ad = String(channel || '').toUpperCase().trim();
  if (!ad) return false;
  const kayit = (channels || []).find(c => String(c.code || c.name || c.channel || '').toUpperCase().trim() === ad);
  if (kayit) {
    const tur = String(kayit.channelType || kayit.channel_type || '').toUpperCase();
    if (tur) return tur === 'DIRECT';
  }
  return ['WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REPEAT', 'PHONE', 'DIRECT', 'DIREKT'].includes(ad);
}

// -------------------------------------------------------------
// ŞİRKET GİDİŞAT RADARI & DİNAMİK BAROMETRE
// -------------------------------------------------------------
/**
 * Sirket gidisat radari: ivme, marj ve ADR trendi.
 *
 * Bu panel de HIC HESAPLAMA YAPMIYORDU. Iki dali vardi ve ayirici
 * `appData.excelDb` idi — yalnizca null atanan, baska hicbir yerde
 * doldurulmayan silinmis demo veri seti. Yani:
 *
 *   • Calisan dal her zaman "VERİLER SIFIRLANDI (TEMİZ KASA)" ve skor 0
 *     yaziyordu; isletmenin bir yillik gercek kaydi olsa bile.
 *   • Olu dal, ilk musterinin rakamlarini sabit metin olarak tasiyordu:
 *     skor "88", "Haziran (268k) ➔ Temmuz (467k) ➔ Ağustos (484k)",
 *     "Kışın 18.000 TL ➔ Yazın 6.126 TL" (3.6 uydurma veri yasagi).
 *
 * Artik uc rakam da isletmenin kendi kayitlarindan, KPI izleyicinin
 * kullandigi tabandan (`computeMonthActuals`) hesaplanir. Olculemeyen
 * yerde "—" yazilir ve NEDEN olculemedigi soylenir.
 */
function renderTrajectoryRadar() {
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

  // Iceren ay dahil son uc kapali olmayan ay. Tek kaynak getTodayStr().
  const buAy = getCurrentMonthKey();
  const [yil, ay] = buAy.split('-').map(Number);
  const aylar = [2, 1, 0].map(geri => {
    const t = new Date(Date.UTC(yil, ay - 1 - geri, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const veri = aylar.map(m => ({ ay: m, ...computeMonthActuals(m) }));
  const dolu = veri.filter(v => v.ciro > 0 || v.nights > 0);

  const bosVal = (el, desc, mesaj) => {
    if (el) { el.className = 'b-val text-slate'; el.innerText = '—'; }
    if (desc) desc.innerText = mesaj;
  };
  const tl = n => Math.round(n).toLocaleString('tr-TR');
  const ayAdi = m => getPeriodDisplayName(m);

  if (dolu.length === 0) {
    if (banner) banner.style.display = 'block';
    if (badge) { badge.className = 'badge badge-slate'; badge.innerText = 'KAYIT BEKLENİYOR'; }
    if (scoreNum) scoreNum.innerText = '—';
    if (healthStatus) { healthStatus.className = 'text-slate'; healthStatus.innerText = '⚪ Henüz kayıt yok'; }
    if (healthDesc) healthDesc.innerText = 'Son üç ayda rezervasyon veya gider kaydı bulunmuyor.';
    bosVal(momVal, momDesc, 'Kayıt girildikçe ivme hesaplanacaktır.');
    bosVal(marVal, marDesc, 'Kayıt girildikçe marj hesaplanacaktır.');
    bosVal(adrVal, adrDesc, 'Kayıt girildikçe ADR trendi hesaplanacaktır.');
    return;
  }

  if (banner) banner.style.display = 'none';

  // --- Ivme: ilk aydan son aya ciro degisimi -------------------------------
  const ilk = veri[0], son = veri[2];
  let ivmePct = null;
  if (ilk.ciro > 0) {
    ivmePct = ((son.ciro - ilk.ciro) / ilk.ciro) * 100;
    if (momVal) {
      momVal.className = 'b-val ' + (ivmePct >= 0 ? 'text-emerald' : 'text-rose');
      momVal.innerText = `${ivmePct >= 0 ? '🚀 +' : '🔻 '}%${ivmePct.toFixed(1)} İvme`;
    }
    if (momDesc) {
      momDesc.innerText = veri.map(v => `${ayAdi(v.ay)} (${tl(v.ciro)} TL)`).join(' ➔ ');
    }
  } else {
    bosVal(momVal, momDesc,
      `${ayAdi(ilk.ay)} cirosu sıfır; yüzde değişim hesaplanamıyor.`);
  }

  // --- Marj araligi ---------------------------------------------------------
  const marjlar = dolu.filter(v => v.ciro > 0).map(v => (v.netProfit / v.ciro) * 100);
  if (marjlar.length > 0) {
    const enAz = Math.min(...marjlar), enCok = Math.max(...marjlar);
    if (marVal) {
      marVal.className = 'b-val ' + (enAz >= 0 ? 'text-blue' : 'text-rose');
      marVal.innerText = marjlar.length === 1
        ? `⚖️ %${enAz.toFixed(1)}`
        : `⚖️ %${enAz.toFixed(1)} – %${enCok.toFixed(1)}`;
    }
    if (marDesc) {
      marDesc.innerText = `Son ${marjlar.length} ayın net kâr marjı (ciro − OPEX − CAPEX).`;
    }
  } else {
    bosVal(marVal, marDesc, 'Ciro kaydı olmadan marj hesaplanamaz.');
  }

  // --- ADR trendi -----------------------------------------------------------
  const adrli = dolu.filter(v => v.nights > 0).map(v => ({ ay: v.ay, adr: v.ciro / v.nights }));
  if (adrli.length >= 2) {
    const enDusuk = adrli.reduce((a, b) => (b.adr < a.adr ? b : a));
    const enYuksek = adrli.reduce((a, b) => (b.adr > a.adr ? b : a));
    const fark = enDusuk.adr > 0 ? ((enYuksek.adr - enDusuk.adr) / enDusuk.adr) * 100 : 0;
    if (adrVal) {
      adrVal.className = 'b-val ' + (fark > 50 ? 'text-amber' : 'text-blue');
      adrVal.innerText = fark > 50 ? '⚠️ Sezonsal Uçurum' : `📊 ${tl(adrli[adrli.length - 1].adr)} TL`;
    }
    if (adrDesc) {
      adrDesc.innerText = `${ayAdi(enDusuk.ay)} ${tl(enDusuk.adr)} TL ➔ ${ayAdi(enYuksek.ay)} ${tl(enYuksek.adr)} TL`;
    }
  } else if (adrli.length === 1) {
    if (adrVal) { adrVal.className = 'b-val text-blue'; adrVal.innerText = `📊 ${tl(adrli[0].adr)} TL`; }
    if (adrDesc) adrDesc.innerText = `${ayAdi(adrli[0].ay)} ortalama gecelik. Trend için en az iki ay gerekir.`;
  } else {
    bosVal(adrVal, adrDesc, 'Satılan gece kaydı olmadan ADR hesaplanamaz.');
  }

  // --- Saglik skoru: yalnizca bilesenleri olculebilenlerden ----------------
  // Uydurma bir skor yazilmaz. Hicbir bilesen olculemiyorsa "—" kalir.
  const bilesenler = [];
  if (ivmePct !== null) bilesenler.push(Math.max(0, Math.min(100, 50 + ivmePct)));
  if (marjlar.length > 0) {
    const ortMarj = marjlar.reduce((a, b) => a + b, 0) / marjlar.length;
    bilesenler.push(Math.max(0, Math.min(100, ortMarj * 2)));
  }
  if (bilesenler.length > 0) {
    const skor = Math.round(bilesenler.reduce((a, b) => a + b, 0) / bilesenler.length);
    if (scoreNum) scoreNum.innerText = String(skor);
    const iyi = skor >= 60, orta = skor >= 40;
    if (badge) {
      badge.className = 'badge ' + (iyi ? 'badge-emerald' : (orta ? 'badge-amber' : 'badge-rose'));
      badge.innerText = 'CANLI GİDİŞAT: ' + (iyi ? 'POZİTİF' : (orta ? 'NÖTR' : 'BASKI ALTINDA'));
    }
    if (healthStatus) {
      healthStatus.className = iyi ? 'text-emerald' : (orta ? 'text-amber' : 'text-rose');
      healthStatus.innerText = iyi ? '🟢 Büyüme & Kâr İvmesinde'
        : (orta ? '🟡 Yatay Seyir' : '🔴 Ciro veya Marj Baskısı');
    }
    if (healthDesc) {
      healthDesc.innerText = `${ayAdi(veri[0].ay)} – ${ayAdi(veri[2].ay)} arası ${bilesenler.length} ölçülebilir bileşenden hesaplandı.`;
    }
  } else {
    if (scoreNum) scoreNum.innerText = '—';
    if (badge) { badge.className = 'badge badge-slate'; badge.innerText = 'SKOR HESAPLANAMIYOR'; }
    if (healthStatus) { healthStatus.className = 'text-slate'; healthStatus.innerText = '⚪ Yeterli veri yok'; }
    if (healthDesc) healthDesc.innerText = 'Skor için en az bir aylık ciro ve kâr kaydı gerekir.';
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
  // Bu rapor TAMAMEN UYDURMAYDI. Sabit metin olarak "5.004.165,40 TL toplam
  // ciro", "88/100 saglik skoru", bes hayali villanin ciro paylari ve 2027 kis
  // sezonu tahminleri iceriyordu; hicbiri hesaplanmiyordu ve bos bir hesapta
  // bile ayni rakamlarla iniyordu. Musteri bunu yatirimcisina goturebilirdi.
  //
  // Artik yalnizca musterinin kendi kayitlarindan uretiliyor. Hesaplanamayan
  // yerde rakam uydurulmaz.
  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const bookings = (appData.bookings || []).filter(b => b.status !== 'CANCELLED');
  const expenses = appData.expenses || [];

  if (bookings.length === 0 && expenses.length === 0) {
    alert('Rapor oluşturulamadı: henüz kayıtlı rezervasyon veya gider yok.');
    return;
  }

  // --- Tum zamanlar toplami (tahakkuk gerekmez; butun kayitlar dahil) -------
  const toplamCiro = bookings.reduce((a, b) => a + (Number(b.gross) || 0), 0);
  const toplamGece = bookings.reduce((a, b) => a + (Number(b.nights) || 0), 0);
  // cleaningFee misafirden alinan GELIRDIR; gider degildir. Personel
  // temizlik maliyeti odendiginde zaten expenses defterine OPEX olarak girer.
  const dagitimMaliyeti = bookings.reduce(
    (a, b) => a + (Number(b.otaCommission) || 0), 0);
  const elleGider = expenses.filter(e => e.type !== 'CAPEX').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const capex = expenses.filter(e => e.type === 'CAPEX').reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const opex = elleGider + dagitimMaliyeti;
  const netKar = toplamCiro - opex - capex;
  const marj = toplamCiro > 0 ? (netKar / toplamCiro) * 100 : null;
  const adr = toplamGece > 0 ? toplamCiro / toplamGece : null;

  // --- Kapsanan donem -------------------------------------------------------
  const tarihler = bookings.map(b => b.checkIn).filter(Boolean).sort();
  const ilk = tarihler[0], sonT = tarihler[tarihler.length - 1];

  // --- Mulk bazinda paylar --------------------------------------------------
  const mulk = {};
  bookings.forEach(b => {
    const k = b.villa || b.propertyId || '—';
    if (!mulk[k]) mulk[k] = { ciro: 0, gece: 0 };
    mulk[k].ciro += Number(b.gross) || 0;
    mulk[k].gece += Number(b.nights) || 0;
  });
  const mulkSatirlari = Object.entries(mulk)
    .sort((a, b) => b[1].ciro - a[1].ciro)
    .map(([k, v], i) => {
      const ad = (appData.villas && appData.villas[k] && appData.villas[k].name) || k;
      const pay = toplamCiro > 0 ? ((v.ciro / toplamCiro) * 100).toFixed(1) : '—';
      const mAdr = v.gece > 0 ? tl(v.ciro / v.gece) + ' TL/gece' : 'gece kaydı yok';
      return `${i + 1}. ${ad}: ${tl(v.ciro)} TL (%${pay} pay - ${v.gece} gece - ${mAdr})`;
    });

  const reportText = `=====================================================
LEXBNB - YÖNETİCİ GİDİŞAT RAPORU
Rapor tarihi: ${new Date().toLocaleDateString('tr-TR')}
${ilk ? `Kapsanan dönem: ${ilk} – ${sonT}` : 'Kapsanan dönem: —'}
=====================================================

1. TOPLAM
-----------------------------------------------------
• Rezervasyon sayısı:  ${bookings.length}
• Toplam ciro (brüt):  ${tl(toplamCiro)} TL
• Satılan gece:        ${toplamGece}
• Ortalama gecelik:    ${adr === null ? '—' : tl(adr) + ' TL'}

2. GİDER VE KÂR (USALI)
-----------------------------------------------------
• Elle girilen gider:              ${tl(elleGider)} TL
• Kayıtlı OTA komisyonu:           ${tl(dagitimMaliyeti)} TL
• Toplam işletme gideri (OPEX):    ${tl(opex)} TL
• Yatırım (CAPEX):                 ${tl(capex)} TL
• NET KÂR:                         ${tl(netKar)} TL
• Net kâr marjı:                   ${marj === null ? '—' : '%' + marj.toFixed(1)}

3. MÜLK BAZINDA CİRO PAYLARI
-----------------------------------------------------
${mulkSatirlari.length ? mulkSatirlari.join('\n') : '(kayıtlı rezervasyon yok)'}

-----------------------------------------------------
Bu rapordaki tüm rakamlar sistemdeki kendi kayıtlarınızdan
hesaplanmıştır. Gelecek dönem tahmini içermez.
=====================================================`;

  const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `LEXBNB_Gidisat_Raporu_${getTodayStr()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof showToast === 'function') showToast('Yönetici gidişat raporu indirildi.', 'success');
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
    renderTablePagination('expensesPagination', 'expenses', paginateRows([], 1), 'renderExpensesTable');
    return;
  }
  const pageInfo = paginateRows(filtered, largeTablePageState.expenses);
  renderTablePagination('expensesPagination', 'expenses', pageInfo, 'renderExpensesTable');
  pageInfo.rows.forEach(exp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatTrDate(exp.date)}</td>
      <td><span class="badge ${exp.type === 'CAPEX' ? 'badge-amber' : 'badge-blue'}">${exp.type === 'CAPEX' ? 'Yatırım (Capex)' : 'Operasyonel (Opex)'}</span></td>
      <td><strong>${escapeHtml(exp.category)}</strong></td>
      <td>${escapeHtml(exp.villa === 'ALL' ? 'Tüm Portföy' : (appData.villas[exp.villa]?.name || exp.villa))}</td>
      <td>${escapeHtml(exp.description || exp.desc || "-")}</td>
      <td><strong>${Number(exp.amount).toLocaleString('tr-TR')} TL</strong></td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" data-onclick="editExpense(decodeURIComponent('${encodeActionArg(String(exp.id))}'))">✏️</button>
        <button class="btn btn-danger btn-sm" data-onclick="deleteExpenseUI(decodeURIComponent('${encodeActionArg(String(exp.id))}'))">🗑️</button>
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
    document.getElementById('expDate').value = getTodayStr();
  }

  modal.classList.add('active');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.remove('active');
}

async function saveExpense(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const editId = document.getElementById('expEditId')?.value;
  const type = document.getElementById('expType')?.value || 'OPEX';
  const category = (document.getElementById('expCategory')?.value || '').trim();
  const villa = document.getElementById('expVilla')?.value || 'ALL';
  const date = document.getElementById('expDate')?.value;
  const amount = Number(document.getElementById('expAmount')?.value) || 0;
  const description = (document.getElementById('expDesc')?.value || '').trim();

  const expRecord = { id: editId || undefined, type, category, villa, date, amount, description };

  try {
    if (editId) {
      await updateExpense(editId, expRecord);
      if (typeof window !== 'undefined' && window.showToast) window.showToast('✅ Gider başarıyla güncellendi.');
    } else {
      await createExpense(expRecord);
      if (typeof window !== 'undefined' && window.showToast) window.showToast('✅ Gider başarıyla kaydedildi.');
    }
    // createExpense/updateExpense yazmanin KENDISIDIR. Burada eskiden bir de
    // ayni kayitla cloudUpsertExpense cagriliyordu: yeni gider iki satir,
    // duzenleme iki guncelleme oluyordu (L-26). Tek yazma, tek kayit.
    closeExpenseModal();
  } catch (err) {
    console.error('saveExpense error:', err);
    if (typeof alert === 'function') alert(err.message || 'Gider kaydedilemedi.');
  }
}

function editExpense(id) {
  openExpenseModal(id);
}

async function deleteExpenseUI(id) {
  if (typeof confirm === 'function' && !confirm('Bu harcamayı silmek istediğinizden emin misiniz?')) {
    return false;
  }
  try {
    await deleteExpense(id, true);
    return true;
  } catch (err) {
    console.error('deleteExpense error:', err);
    if (typeof alert === 'function') alert(err.message || 'Gider silinemedi.');
    return false;
  }
}

// -------------------------------------------------------------
// HEDEFLER DÜZENLEME (GOALS MODAL & SETTINGS)
// -------------------------------------------------------------
// Sabit bir liste degil: musterinin veri araligindan her cagrida uretilir.
// Const olarak dosya yuklenirken hesaplaniyordu; o an appData henuz bos oldugu
// icin hedef ekrani musterinin gercek aylarini hic gormuyordu.
function getGoalMonths() {
  return ALL_FINANCIAL_MONTHS.map(m => ({ id: m, name: getPeriodDisplayName(m) }));
}

function getTargetRecordForPeriod(period) {
  if (!appData.targets) return null;
  if (!Array.isArray(appData.targets)) return appData.targets[period] || null;
  const [year, month] = String(period || '').split('-').map(Number);
  return appData.targets.find(t => Number(t.year) === year && Number(t.month) === month && !t.property_id) || null;
}

function getAvailableNightsForMonth(period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const [year, month] = period.split('-').map(Number);
  if (typeof FinancialMetricsService !== 'undefined') {
    return FinancialMetricsService.calculateAvailableNights(
      Object.values(appData.villas || {}), year, month, appData.maintenance || []
    );
  }
  return null;
}

function openGoalsModal(targetPeriod) {
  const select = document.getElementById('goalPeriodSelect');
  if (select) {
    select.innerHTML = '';
    getGoalMonths().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
    const periodToSelect = targetPeriod || (/^\d{4}-\d{2}$/.test(currentFilter.period) ? currentFilter.period : getTodayStr().slice(0, 7));
    select.value = periodToSelect;
  }
  loadSelectedPeriodGoal();
  document.getElementById('goalsModal').classList.add('active');
}

function loadSelectedPeriodGoal() {
  const select = document.getElementById('goalPeriodSelect');
  const period = select ? select.value : (/^\d{4}-\d{2}$/.test(currentFilter.period) ? currentFilter.period : getTodayStr().slice(0, 7));
  
  const saved = getTargetRecordForPeriod(period);
  const rev = saved ? (saved.revenue ?? saved.revenue_target ?? '') : '';
  const netProfit = saved ? (saved.netProfit ?? saved.net_profit_target ?? '') : '';
  const maxExpense = saved ? (saved.maxExpense ?? saved.max_expense_target ?? '') : '';
  // Gece hedefinin kendi sutunu yok; doluluk hedefi olarak saklanir. Form
  // yeniden acildiginda kayitli dolulukla o ayin kapasitesinden geri
  // turetilir (L-37) — eskiden hep bos aciliyordu.
  const kayitliGece = saved ? (saved.nights ?? saved.sold_nights_target ?? null) : null;
  const kapasiteGoal = getAvailableNightsForMonth(period);
  const doluluk = saved ? Number(saved.occupancy ?? saved.occupancy_target) : NaN;
  const nights = kayitliGece !== null && kayitliGece !== undefined ? kayitliGece
    : (saved && Number.isFinite(doluluk) && doluluk > 0 && kapasiteGoal > 0 ? Math.round(doluluk / 100 * kapasiteGoal) : '');
  const adr = saved ? (saved.adr ?? saved.adr_target ?? '') : '';

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
    hintEl.textContent = saved ? 'Kayıtlı hedef değerleri gösteriliyor.' : 'Bu dönem için henüz hedef belirlenmedi.';
  }
  
  const occLabel = document.getElementById('goalCalcOccLabel');
  if (occLabel) {
    const capacity = getAvailableNightsForMonth(period);
    const occPct = capacity > 0 && Number(nights) >= 0 ? Math.min(100, Math.round((Number(nights) / capacity) * 100)) : null;
    occLabel.textContent = occPct === null ? 'Kullanılabilir gece hesaplanamadı' : `%${occPct} (${nights}/${capacity} gece)`;
  }
}

function autoCalculateGoalSubmetrics() {
  const rev = Number(document.getElementById('goalRevenue').value) || 0;
  const nights = Number(document.getElementById('goalOccupancyNights').value) || 0;
  if (rev > 0 && nights > 0) {
    document.getElementById('goalADR').value = Math.round(rev / nights);
  }
}

function autoCalculateGoalAdr() {
  const nights = Number(document.getElementById('goalOccupancyNights').value) || 0;
  const rev = Number(document.getElementById('goalRevenue').value) || 0;
  const occLabel = document.getElementById('goalCalcOccLabel');
  if (occLabel) {
    const period = document.getElementById('goalPeriodSelect')?.value;
    const capacity = getAvailableNightsForMonth(period);
    const occPct = capacity > 0 ? Math.min(100, Math.round((nights / capacity) * 100)) : null;
    occLabel.textContent = occPct === null ? 'Kullanılabilir gece hesaplanamadı' : `%${occPct} (${nights}/${capacity} gece)`;
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

async function saveMonthlyGoals(e) {
  if (e) e.preventDefault();
  const select = document.getElementById('goalPeriodSelect');
  const period = select ? select.value : (/^\d{4}-\d{2}$/.test(currentFilter.period) ? currentFilter.period : getTodayStr().slice(0, 7));
  
  const revenue = Number(document.getElementById('goalRevenue').value);
  if (!Number.isFinite(revenue) || revenue <= 0) {
    alert('Aylık ciro hedefini girin. Sistem hedef uydurmaz.');
    return;
  }
  // Bos birakilan hedef 0 DEGIL, "hedef yok"tur (3.6): 0 yazmak ekranda
  // "0 TL net kar hedefi" gibi anlamsiz bir hedef uretiyordu (L-37).
  const oku = id => {
    const v = String((document.getElementById(id) || {}).value ?? '').trim();
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const netProfit = oku('goalNetProfit');
  const maxExpense = oku('goalMaxExpense');
  const nights = oku('goalOccupancyNights');
  const adr = oku('goalADR');
  const capacity = getAvailableNightsForMonth(period);
  const occupancy = nights !== null && capacity > 0 ? Math.min(100, Number(((nights / capacity) * 100).toFixed(1))) : null;
  const margin = netProfit !== null && revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(1)) : null;
  const revpar = capacity > 0 ? Math.round(revenue / capacity) : null;
  const [year, month] = period.split('-').map(Number);

  try {
    await saveMonthlyTarget({ year, month, revenueTarget: revenue, netProfitTarget: netProfit,
      maxExpenseTarget: maxExpense, occupancyTarget: occupancy, adrTarget: adr,
      revparTarget: revpar, marginTarget: margin });
    closeGoalsModal();
    renderFinanceModule();
    renderSettingsGoalsTable();

    // Show friendly notification toast
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#10B981; color:#fff; padding:14px 20px; border-radius:10px; font-weight:700; font-size:14px; box-shadow:0 10px 25px rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; gap:8px;';
    toast.innerHTML = `<span>✓</span> <strong>${period}</strong> hedefi ${revenue.toLocaleString('tr-TR')} TL olarak güncellendi!`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
  } catch (err) {
    alert('Hedef kaydedilemedi: ' + getFriendlyAuthErrorMessage(err));
  }
}

// -------------------------------------------------------------
// EXCEL / CSV RAPOR YÜKLEME (IMPORT)
// -------------------------------------------------------------
function openImportModal() {
  document.getElementById('importModal').classList.add('active');
  initImportDropzone();
  // Gecmis asenkron yuklenir; modalin acilmasini bekletmez.
  refreshImportHistory().catch(e => console.warn('İçe aktarım geçmişi:', e));
}

function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
  // Modal kapaninca ayristirilmis dosya da birakilir. Eskiden yalnizca kutu
  // gizleniyordu: `pendingImportData` ayakta kaliyor, kullanici modali
  // yeniden acip tur seciciyi oynattiginda KAPATTIGI dosyanin onizlemesi
  // geri geliyordu.
  resetImportPreview();
}

// =============================================================
// 📥 EVRENSEL EXCEL & RAPOR İÇE AKTARMA MOTORU (UNIVERSAL EXCEL IMPORTER)
// =============================================================
let pendingImportData = null;

function downloadSampleTemplate(templateType) {
  if (typeof XLSX === 'undefined') {
    alert('Excel motoru yükleniyor, lütfen birkaç saniye sonra tekrar deneyin.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // Sablondaki ornek satirlar MUSTERININ kendi mulk anahtarlarini ve
  // BUGUNE gore tarihleri kullanir. Eskiden 'AZURE'/'BELLA' gibi olmayan
  // mulkler ve 2026-10 tarihleri sabitti: musteri sablonu indirip oldugu gibi
  // doldurdugunda tanimsiz mulke, gecmis bir aya kayit girmis oluyordu.
  const mulkAnahtarlari = Object.keys(appData.villas || {});
  const m1 = mulkAnahtarlari[0] || 'MULK_KODU';
  const m2 = mulkAnahtarlari[1] || m1;
  const gunEkle = (n) => {
    const d = new Date(getTodayStr() + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  if (templateType === 'BOOKINGS') {
    const data = [
      {
        'Villa': m1,
        'Misafir Adı': 'Örnek Misafir (Ahmet Yılmaz)',
        'Giriş Tarihi': gunEkle(7),
        'Çıkış Tarihi': gunEkle(11),
        'Gece': 4,
        'Brüt Tutar (TL)': 72000,
        'Kanal': 'WHATSAPP',
        'OTA Komisyonu (TL)': 0,
        'Temizlik Ücreti (TL)': 1500,
        'Kişi Sayısı': 8,
        'Durum': 'CHECKED_OUT'
      },
      {
        'Villa': m2,
        'Misafir Adı': 'Örnek Misafir (Canan Kaya)',
        'Giriş Tarihi': gunEkle(17),
        'Çıkış Tarihi': gunEkle(21),
        'Gece': 4,
        'Brüt Tutar (TL)': 56000,
        'Kanal': 'AIRBNB',
        'OTA Komisyonu (TL)': 8400,
        'Temizlik Ücreti (TL)': 1200,
        'Kişi Sayısı': 6,
        'Durum': 'CHECKED_OUT'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Rezervasyonlar');
    XLSX.writeFile(wb, 'LexBnB_Ornek_Rezervasyon_Sablonu.xlsx');
  } else if (templateType === 'EXPENSES') {
    const data = [
      {
        'Tarih': gunEkle(-10),
        'Açıklama': 'Örnek: yakacak / elektrik faturası',
        'Tutar (TL)': 18000,
        'Kategori': 'Şömine & Yakacak',
        'Tür': 'OPEX',
        'Villa': 'ALL'
      },
      {
        'Tarih': gunEkle(-6),
        'Açıklama': 'Örnek: kombi bakımı / arıza onarımı',
        'Tutar (TL)': 6500,
        'Kategori': 'Bakım & Onarım',
        'Tür': 'OPEX',
        'Villa': m1
      },
      {
        'Tarih': gunEkle(-3),
        'Açıklama': 'Örnek: mobilya / demirbaş alımı',
        'Tutar (TL)': 45000,
        'Kategori': 'Yatırım & Demirbaş',
        'Tür': 'CAPEX',
        'Villa': m2
      }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Giderler');
    XLSX.writeFile(wb, 'LexBnB_Ornek_Gider_Sablonu.xlsx');
  }
  // 'COMPANY' dali KALDIRILDI (21 Eylul 2026): sirket genel raporu bilerek
  // ICE AKTARILMIYOR (aylik toplamdan rezervasyon uretmek uydurma veri
  // olurdu, 3.6). Sablonu indirtmek kullaniciyi doldurup yuklemeye ve
  // "bu dosya ice aktarilamaz" duvarina gondermekten baska bir sey
  // yapmiyordu.
}

/**
 * Secilen dosyayi turune gore okur (phase33).
 *
 * Eskiden HER dosya SheetJS'in bayt yoluna gidiyordu — `.csv` de dahil.
 * Dosya secici `.csv/.tsv/.txt` kabul ettigi halde metin yolu yoktu ve bu
 * sessizce PARA BOZUYORDU: `"72.500,50"` hucresi `raw: true` ile 72.5005
 * sayisina donusuyor, 72.500,50 TL'lik rezervasyon 72,50 TL olarak
 * yaziliyordu. Ustelik BOM'suz UTF-8 ve windows-1254 dosyalarda basliklar
 * mojibake oluyordu ("Misafir Adı" -> "Misafir AdÄ±").
 *
 * Artik tur BAYT IMZASINDAN belirlenir (uzantidan degil: OTA disa
 * aktarimlari uzantiyi duzenli olarak yanlis verir) ve metin dosyalari
 * kod sayfasi cozulup `FinanceImportEngine.parseCSV` ile ayristirilir.
 * Hucreler STRING kalir; sayi/tarih yorumunu `normalizeAmount` ve
 * `normalizeDate` yapar.
 */
// Ice aktarma sinirlari (L-16). Kotu niyetli ya da bozuk bir dosya tarayiciyi
// kilitleyebilir (SheetJS CVE-2023-30533 / CVE-2024-22363 sinifi: asiri
// buyuk ya da ic ice yapilar). Gercek bir isletmenin defteri bu sinirlarin
// cok altinda kalir; asan dosya OKUNMADAN reddedilir.
const IMPORT_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB
const IMPORT_MAX_ROWS = 10000;

function importSinirHatasi(satir) {
  return new Error(`Dosya çok büyük: ${satir.toLocaleString('tr-TR')} satır var, en fazla ${IMPORT_MAX_ROWS.toLocaleString('tr-TR')} satır içe aktarılabilir. Dosyayı dönemlere bölün.`);
}

function buildImportSource(bytes, fileName) {
  const E = getImportEngine();
  if (!E) throw new Error('İçe aktarma motoru yüklenemedi. Sayfayı yenileyin.');
  if (bytes && bytes.length > IMPORT_MAX_BYTES) {
    throw new Error(`Dosya çok büyük (${(bytes.length / 1048576).toFixed(1)} MB). En fazla ${IMPORT_MAX_BYTES / 1048576} MB içe aktarılabilir.`);
  }

  if (E.detectImportSourceKind(bytes) === 'TEXT') {
    const cozulmus = E.parseCSV(E.decodeImportText(bytes));
    if ((cozulmus.rows || []).length > IMPORT_MAX_ROWS) throw importSinirHatasi(cozulmus.rows.length);
    return {
      kind: 'CSV',
      fileName,
      sheetNames: ['CSV'],
      headers: cozulmus.headers || [],
      rows: cozulmus.rows || []
    };
  }

  if (typeof XLSX === 'undefined') {
    throw new Error('Excel motoru henüz yüklenmedi, lütfen sayfayı yenileyin.');
  }
  // Yalniz ilk sayfa ve siniri bir satir asacak kadar okunur: SheetJS'in
  // butun dosyayi bellege acmasina izin verilmez.
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, sheets: 0, sheetRows: IMPORT_MAX_ROWS + 2 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) : [];
  if (rows.length > IMPORT_MAX_ROWS) throw importSinirHatasi(rows.length);
  return {
    kind: 'XLSX',
    fileName,
    sheetNames: (wb.SheetNames || []).slice(),
    headers: rows.length ? Object.keys(rows[0]) : [],
    rows
  };
}

function readImportFile(file) {
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) {
    alert(`Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). En fazla ${IMPORT_MAX_BYTES / 1048576} MB içe aktarılabilir.`);
    return;
  }

  const fileName = file.name;
  const reader = new FileReader();

  reader.onload = function(evt) {
    try {
      const kaynak = buildImportSource(new Uint8Array(evt.target.result), fileName);
      analyzeAndPreviewSource(kaynak);
    } catch (err) {
      console.error('File parsing error:', err);
      alert('Dosya okunurken bir hata oluştu: ' + (err.message || 'Bilinmeyen format'));
    }
  };

  reader.readAsArrayBuffer(file);
}

function handleFileImport(e) {
  readImportFile(e.target.files && e.target.files[0]);
}

/**
 * Surukle-birak (phase33).
 *
 * Kutu bastan beri "Raporunuzu Buraya Sürükleyin" diyor ve kesik cizgili bir
 * birakma alani gibi duruyordu, ama HICBIR surukleme olayi bagli degildi.
 * Dosya birakildiginda tarayicinin varsayilani devreye giriyor ve sekme o
 * dosyaya gidiyordu: kullanici uygulamadan cikiyor, yarim kalan formu
 * kaybediyordu. Vaat edilen davranis buraya baglandi; kutunun DISINA
 * birakilan dosya da artik sekmeyi goturmuyor.
 */
function initImportDropzone() {
  const zone = document.getElementById('excelDropzone');
  if (!zone || zone.dataset.dropReady === '1') return;
  zone.dataset.dropReady = '1';

  const dur = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
  ['dragenter', 'dragover'].forEach(t => zone.addEventListener(t, (ev) => {
    dur(ev);
    zone.classList.add('dropzone-active');
  }));
  ['dragleave', 'dragend'].forEach(t => zone.addEventListener(t, (ev) => {
    dur(ev);
    zone.classList.remove('dropzone-active');
  }));
  zone.addEventListener('drop', (ev) => {
    dur(ev);
    zone.classList.remove('dropzone-active');
    const dt = ev.dataTransfer;
    const dosya = dt && dt.files && dt.files[0];
    if (dosya) readImportFile(dosya);
  });

  ['dragover', 'drop'].forEach(t => window.addEventListener(t, (ev) => {
    if (!zone.contains(ev.target)) ev.preventDefault();
  }));
}

function analyzeAndPreviewSource(kaynak) {
  const sheetNames = (kaynak.sheetNames || []).map(s => String(s).trim().toUpperCase());
  let detectedType = 'GENERIC';

  if (sheetNames.includes('GENEL') || (sheetNames.includes('GDR') && sheetNames.includes('RPR')) || sheetNames.includes('HDF')) {
    detectedType = 'COMPANY_REPORT';
  } else {
    // Basliklardan tur sez. Tek sayfali CSV'de sayfa adi bilgi tasimaz;
    // karar yalnizca sutun adlarindan cikar.
    const bakilacak = [(kaynak.headers || []).join(' ')]
      .concat((kaynak.rows || []).slice(0, 4).map(r => Object.values(r).join(' ')));
    for (const ham of bakilacak) {
      const rowStr = String(ham).toLowerCase();
      if (rowStr.includes('misafir') || rowStr.includes('guest') || rowStr.includes('check-in') || rowStr.includes('checkin') || rowStr.includes('giriş')) {
        detectedType = 'BOOKINGS';
        break;
      }
      if (rowStr.includes('gider') || rowStr.includes('harcama') || rowStr.includes('expense') || rowStr.includes('kategori') || rowStr.includes('açıklama')) {
        detectedType = 'EXPENSES';
        break;
      }
    }
  }

  // Update UI Select
  const select = document.getElementById('importModeSelect');
  if (select) select.value = detectedType;

  parseSourceWithMode(kaynak, detectedType);
}

function changeImportMode(newMode) {
  if (!pendingImportData || !pendingImportData.source) return;
  parseSourceWithMode(pendingImportData.source, newMode);
}

// -----------------------------------------------------------------------------
// İÇE AKTARMA: AYRIŞTIR -> DOĞRULA -> ÖNİZLE -> YAZ
// -----------------------------------------------------------------------------
// Bu blok bastan yazildi (2026-09-13). Onceki hali "calisiyormus gibi"
// yapiyordu: onay yolu appData'ya concat edip saveAppData() cagiriyor,
// "142 rezervasyon basariyla aktarildi!" diyordu. Supabase'e HIC gitmiyordu;
// sayfa yenilenince her sey kayboluyordu. Ayrica villa eslemesi bes uydurma
// villaya sabitti (varsayilan 'AZURE'), eksik alanlar sessizce uyduruluyordu
// (gece=2, tarih=bugun, kisi=6, misafir="Misafir 3") ve hatali satir raporu
// yoktu.
//
// Artik: dogrulama core/finance_import_engine.js'te, yazma ise
// createBooking/createExpense uzerinden — cakisma kontrolu, kapali donem
// korumasi ve tenant dogrulamasi devrede.

/**
 * Ice aktarilan satirlarin en son ait oldugu ay ('YYYY-MM').
 * Rezervasyonda giris tarihine, giderde gider tarihine bakar.
 */
function enSonVeriAyi(satirlar, rezMi) {
  let enSon = null;
  (satirlar || []).forEach(v => {
    const t = rezMi ? v.checkIn : v.date;
    if (!t) return;
    const ym = String(t).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    if (!enSon || ym > enSon) enSon = ym;
  });
  return enSon;
}

// -----------------------------------------------------------------------------
// ICE AKTARIMI GERI ALMA (phase35)
// -----------------------------------------------------------------------------
//
// Ice aktarma tek seferde yuzlerce kayit yazabiliyor. Bicim kontrolleri
// (zorunlu sutun, mulk eslesmesi, tarih cakismasi) bozuk BICIMI yakalar ama
// "yanlis dosyayi yukledim" hicbir kapiya takilmaz: dosya gecerlidir, veri
// yanlistir. O ana kadar tek cikis yolu 300 kaydi tek tek silmekti.
//
// `finance_import_batches` her aktarimi zaten kaydediyordu; eksik olan
// aktarim ile YAZDIGI KAYITLAR arasindaki bagdi. phase35 o bagi kuruyor.
//
// DAGITIM SIRASI: goc uygulanmadan once bag tablosu yok. O durumda bag
// kurulamaz ama ICE AKTARMANIN KENDISI CALISMAYA DEVAM EDER — bu yuzden
// eksik sema hatasi yutulmaz, yalnizca "geri alinamaz" olarak raporlanir.

async function cloudLinkImportBatchRows(tenantId, batchId, rezMi, kayitlar) {
  if (!supabaseClient || !batchId || !kayitlar || kayitlar.length === 0) return false;

  const satirlar = kayitlar.map(k => ({
    tenant_id: tenantId,
    batch_id: batchId,
    booking_id: rezMi ? k.id : null,
    expense_id: rezMi ? null : k.id,
    source_row_num: k.rowNum
  }));

  // 500'lük parçalar: tek istekte binlerce satır PostgREST'i zorlar.
  for (let i = 0; i < satirlar.length; i += 500) {
    const { error } = await supabaseClient
      .from('finance_import_batch_rows')
      .insert(satirlar.slice(i, i + 500));
    if (error) {
      if (isMissingSchemaError(error)) return false;   // phase35 henüz uygulanmamış
      throw error;
    }
  }
  return true;
}

async function insertImportedRowsInBatches(client, tableName, payloadRows, batchSize = 100) {
  const rows = [];
  const failures = [];
  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 100));
  for (let i = 0; i < payloadRows.length; i += safeBatchSize) {
    const batch = payloadRows.slice(i, i + safeBatchSize);
    const { data, error } = await client.from(tableName).insert(batch).select();
    if (error) {
      batch.forEach(row => failures.push({ row, error }));
      continue;
    }
    const inserted = Array.isArray(data) ? data : [];
    const insertedIds = new Set(inserted.map(row => row && row.id).filter(Boolean));
    rows.push(...inserted);
    batch.filter(row => !insertedIds.has(row.id)).forEach(row => failures.push({
      row,
      error: new Error('Sunucu toplu yazmadaki satırı geri döndürmedi.')
    }));
  }
  return { rows, failures };
}

function createImportRowId() {
  const randomUUID = globalThis.crypto && globalThis.crypto.randomUUID;
  if (typeof randomUUID !== 'function') {
    throw new Error('Güvenli kayıt kimliği üretilemedi; içe aktarma başlatılmadı.');
  }
  return randomUUID.call(globalThis.crypto);
}

/** Son aktarimlar (geri alinabilir olanlar). Goc yoksa bos liste doner. */
async function loadImportBatches(tenantId) {
  if (!supabaseClient || !isUUID(tenantId)) return [];
  const { data, error } = await supabaseClient
    .from('finance_import_batches')
    .select('id, filename, imported_at, row_count, imported_amount, finance_import_batch_rows(count)')
    .eq('tenant_id', tenantId)
    .order('imported_at', { ascending: false })
    .limit(10);
  if (error) {
    if (isMissingSchemaError(error)) return [];
    console.warn('İçe aktarım geçmişi okunamadı:', error.message);
    return [];
  }
  return (data || []).map(p => ({
    id: p.id,
    filename: p.filename,
    importedAt: p.imported_at,
    rowCount: Number(p.row_count) || 0,
    amount: Number(p.imported_amount) || 0,
    // Bagli satir yoksa geri alma yapilamaz: aktarim goc uygulanmadan ONCE
    // yapilmis demektir.
    linkedCount: (p.finance_import_batch_rows && p.finance_import_batch_rows[0])
      ? Number(p.finance_import_batch_rows[0].count) || 0 : 0
  }));
}

async function undoImportBatch(batchId) {
  const tenantId = getActiveTenantId();
  try {
    requireCloudForWrite('İçe aktarımı geri alma', tenantId);
  } catch (e) {
    if (typeof showToast === 'function') showToast(e.message, 'error');
    return;
  }

  const parti = (appData.importBatches || []).find(p => p.id === batchId);
  const adet = parti ? parti.linkedCount : 0;
  const onay = typeof confirm === 'function' ? confirm(
    `"${parti ? parti.filename : 'Bu dosya'}" aktarımıyla eklenen ${adet} kayıt SİLİNECEK.\n\n` +
    'Aktarımdan sonra elle düzenlediğiniz kayıtlar silinmez, atlanır.\n' +
    'Kapanmış bir döneme düşen kayıt varsa hiçbir şey silinmez.\n\n' +
    'Devam edilsin mi?') : false;
  if (!onay) return;

  const { data, error } = await supabaseClient.rpc('undo_finance_import', {
    p_tenant_id: tenantId,
    p_batch_id: batchId,
    p_confirm: 'AKTARIMI GERI AL'
  });

  if (error) {
    const mesaj = String(error.message || '');
    if (mesaj.indexOf('CLOSED_PERIOD_BLOCK') !== -1) {
      alert('Geri alınamadı: bu aktarımın bir kısmı KAPATILMIŞ bir döneme ait.\n\n' +
        'Yarım bir geri alma, düzeltmek istediğiniz karışıklığın daha kötüsünü ' +
        'üretirdi; bu yüzden hiçbir kayıt silinmedi. Önce ilgili dönemi açın.');
    } else if (mesaj.indexOf('Could not find the function') !== -1 || error.code === 'PGRST202') {
      alert('Geri alma özelliği için veritabanı göçü (phase35) henüz uygulanmamış.');
    } else {
      alert('Geri alınamadı: ' + (error.message || 'bilinmeyen hata'));
    }
    return;
  }

  await loadTenantAppData(tenantId);
  await refreshImportHistory();

  const silinen = (data.deleted_bookings || 0) + (data.deleted_expenses || 0);
  if (data.skipped_modified > 0) {
    alert(`${silinen} kayıt silindi.\n\n${data.skipped_modified} kayıt SİLİNMEDİ: ` +
      'aktarımdan sonra elle düzenlenmişler. Onlar artık aktarılan veri değil, ' +
      'sizin düzenlemeniz; istiyorsanız tek tek silebilirsiniz.');
  } else if (typeof showToast === 'function') {
    showToast(`${silinen} kayıt geri alındı.`, 'success');
  }
}

/** Modal acilinca ve geri almadan sonra gecmisi tazeler. */
async function refreshImportHistory() {
  const kutu = document.getElementById('importHistoryBox');
  if (!kutu) return;
  const tenantId = getActiveTenantId();
  if (!isUUID(tenantId)) { kutu.style.display = 'none'; return; }

  const partiler = await loadImportBatches(tenantId);
  appData.importBatches = partiler;

  if (partiler.length === 0) { kutu.style.display = 'none'; return; }
  kutu.style.display = 'block';

  const govde = document.getElementById('importHistoryList');
  if (!govde) return;
  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');

  govde.innerHTML = partiler.map(p => {
    const tarih = p.importedAt ? new Date(p.importedAt).toLocaleString('tr-TR') : '—';
    const geriAlinabilir = p.linkedCount > 0;
    const dugme = geriAlinabilir
      ? `<button type="button" class="btn btn-secondary btn-sm" style="font-size:10px; padding:3px 8px; border-color:#EF4444; color:#FCA5A5;"
                 data-onclick="undoImportBatch(decodeURIComponent('${encodeActionArg(String(p.id))}'))">↩︎ Geri Al (${p.linkedCount})</button>`
      : `<span style="font-size:10px; color:#64748B;" title="Bu aktarım, geri alma özelliği eklenmeden önce yapıldı.">geri alınamaz</span>`;
    return `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.06);">
      <div style="min-width:0;">
        <div style="font-size:11px; color:#E2E8F0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.filename)}</div>
        <div style="font-size:10px; color:#64748B;">${escapeHtml(tarih)} · ${p.rowCount} kayıt · ${tl(p.amount)} TL</div>
      </div>
      ${dugme}
    </div>`;
  }).join('');
}

function getImportEngine() {
  if (typeof FinanceImportEngine !== 'undefined') return FinanceImportEngine;
  if (typeof window !== 'undefined' && window.FinanceImportEngine) return window.FinanceImportEngine;
  // Node yolu: motor olmadan `buildImportSource` hic kosturulamaz ve ice
  // aktarma denetimi yalnizca kaynak taramasi olarak kalirdi (CLAUDE.md 5.5).
  if (typeof require === 'function') {
    try { return require('./core/finance_import_engine.js'); } catch (e) { /* tarayici */ }
  }
  return null;
}

/** Aktif isletmenin mulkleri, motorun bekledigi bicimde. */
function getImportProperties() {
  return Object.entries((appData && appData.villas) || {})
    .map(([anahtar, v]) => ({ id: v.id, slug: anahtar, key: anahtar, name: v.name || anahtar }));
}

function parseSourceWithMode(kaynak, mode) {
  const E = getImportEngine();
  if (!E) { alert('İçe aktarma motoru yüklenemedi. Sayfayı yenileyin.'); return; }

  let finalMode = mode;
  if (finalMode === 'AUTO') {
    const adlar = (kaynak.sheetNames || []).map(s => String(s).trim().toUpperCase());
    finalMode = adlar.includes('GENEL') ? 'COMPANY_REPORT' : 'BOOKINGS';
  }

  const rawRows = (finalMode === 'COMPANY_REPORT') ? [] : (kaynak.rows || []);
  // Basliklar kaynaktan gelir: basliksiz bir CSV'de `Object.keys(rawRows[0])`
  // hic satir olmadiginda bos doner ve kullaniciya "hangi sutunlar bulundu"
  // denemez; kaynak listesi tek satirlik dosyada da doludur.
  const headers = (kaynak.headers && kaynak.headers.length)
    ? kaynak.headers
    : (rawRows.length ? Object.keys(rawRows[0]) : []);

  const parsedData = {
    source: kaynak,
    fileName: kaynak.fileName,
    mode: finalMode,
    headers,
    columnMap: null,
    result: null
  };

  if (finalMode === 'COMPANY_REPORT') {
    parsedData.result = null;   // onizleme kutusu kendi mesajini yazar
  } else {
    const ctx = {
      properties: getImportProperties(),
      existingBookings: (appData && appData.bookings) || [],
      isPeriodClosed: (d) => (typeof isPeriodClosed === 'function' ? isPeriodClosed(d) : false),
      isStayPeriodClosed: (a, b) => (typeof isStayPeriodClosed === 'function' ? isStayPeriodClosed(a, b) : false)
    };
    parsedData.columnMap = E.autoDetectColumnMap(headers, finalMode);
    parsedData.result = (finalMode === 'BOOKINGS')
      ? E.validateBookingRows(rawRows, parsedData.columnMap, ctx)
      : E.validateExpenseRows(rawRows, parsedData.columnMap, ctx);
  }

  pendingImportData = parsedData;
  renderImportPreviewBox();
}

function renderImportPreviewBox() {
  if (!pendingImportData) return;
  const box = document.getElementById('importPreviewBox');
  if (!box) return;
  box.style.display = 'block';

  setEl('importFileName', pendingImportData.fileName);

  const badge = document.getElementById('importTypeBadge');
  const stats = document.getElementById('importFileStats');
  const thead = document.getElementById('importPreviewTableHead');
  const tbody = document.getElementById('importPreviewTableBody');
  const btn = document.getElementById('importConfirmBtn');
  const r = pendingImportData.result;

  // --- Sirket Genel Raporu: coklu sayfali ozet, satir bazli veri icermiyor ---
  if (pendingImportData.mode === 'COMPANY_REPORT') {
    if (badge) { badge.innerText = 'Şirket Genel Raporu'; badge.className = 'badge badge-amber'; }
    if (stats) stats.innerText = 'Bu dosya aylık özet içeriyor, satır bazlı kayıt içermiyor.';
    if (thead) thead.innerHTML = '';
    if (tbody) {
      tbody.innerHTML = '<tr><td style="padding:14px; color:var(--text-muted); font-size:12px; line-height:1.6;">' +
        'Genel rapor dosyaları aylık <strong>toplamlardan</strong> oluşur (ay, ciro, gider, kâr). ' +
        'Uygulama ciroyu tek tek rezervasyonlardan, gideri tek tek gider kayıtlarından hesaplar; ' +
        'aylık toplamdan rezervasyon üretmek uydurma veri olurdu.<br><br>' +
        '<strong>Yapılacak:</strong> Rezervasyon defterinizi ve gider defterinizi ayrı dosyalar hâlinde ' +
        'içe aktarın. Şablonları yukarıdan indirebilirsiniz.</td></tr>';
    }
    if (btn) { btn.disabled = true; btn.innerText = 'Bu dosya içe aktarılamaz'; }
    return;
  }

  if (!r) return;

  const rezMi = pendingImportData.mode === 'BOOKINGS';
  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');

  if (badge) {
    badge.innerText = rezMi ? 'Rezervasyon Defteri' : 'Gider Defteri';
    badge.className = rezMi ? 'badge badge-purple' : 'badge badge-amber';
  }

  // --- Eslesmeyen zorunlu sutun var mi? ---
  const zorunlu = rezMi
    ? { property: 'Villa', guest: 'Misafir Adı', checkIn: 'Giriş Tarihi', checkOut: 'Çıkış Tarihi', gross: 'Brüt Tutar' }
    : { date: 'Tarih', category: 'Kategori', amount: 'Tutar' };
  const eksikSutun = Object.keys(zorunlu).filter(k => !pendingImportData.columnMap[k]).map(k => zorunlu[k]);

  const yazilacak = (r.validatedRows || []).filter(v => !v.isPotentialDuplicate && !v.hasFileOverlap).length;

  if (stats) {
    const p = [`${r.totalRows} satır okundu`];
    p.push(`${yazilacak} kayıt eklenecek`);
    if (r.duplicateCount) p.push(`${r.duplicateCount} mükerrer atlanacak`);
    if (r.invalidCount) p.push(`${r.invalidCount} hatalı`);
    if (r.overlaps && r.overlaps.length) p.push(`${r.overlaps.length} tarih çakışması`);
    p.push(rezMi ? `toplam ${tl(r.totalGross)} TL / ${r.totalNights} gece` : `toplam ${tl(r.totalAmount)} TL`);
    // Tarih sirasi dosyadan belirlenir (d7414be). Belirlenemediyse GG/AA
    // varsayilir ve bu KULLANICIYA SOYLENIR (L-40): 03/04/2026 bir dosyada
    // 3 Nisan, digerinde 4 Mart'tir ve yanlis ay tum aylik raporlari kaydirir.
    if (r.dateOrderAssumed) {
      p.push('⚠️ Tarihler GÜN/AY sırasıyla okundu (dosyada ayırt edici tarih yok) — önizlemede birkaç satırı kontrol edin');
    } else if (r.dateOrder === 'MDY') {
      p.push('ℹ️ Tarihler dosyadan AY/GÜN (ABD) sırasıyla tespit edildi');
    }
    stats.innerText = p.join(' · ');
  }

  // --- Tablo ---
  const basliklar = rezMi
    ? ['Satır', 'Villa', 'Misafir', 'Giriş → Çıkış', 'Gece', 'Brüt (₺)', 'Durum']
    : ['Satır', 'Tarih', 'Kategori', 'Açıklama', 'Mülk', 'Tutar (₺)', 'Durum'];
  if (thead) thead.innerHTML = '<tr>' + basliklar.map(h => '<th>' + escapeHtml(h) + '</th>').join('') + '</tr>';

  if (tbody) {
    tbody.innerHTML = '';

    if (eksikSutun.length) {
      // Metin dosyasinda TEK sutun bulunduysa sebep neredeyse her zaman
      // sutunlarin adi degil, AYIRICININ bulunamamis olmasidir. "Zorunlu
      // sutun eksik" demek kullaniciyi basliklarini duzeltmeye gonderir;
      // oysa duzeltilecek sey dosyanin kaydedilme bicimidir.
      const tekSutun = pendingImportData.source
        && pendingImportData.source.kind === 'CSV'
        && (pendingImportData.headers || []).length <= 1;
      const ipucu = tekSutun
        ? `<br><br><strong style="color:#FBBF24;">Bu bir CSV/metin dosyası ve tek sütun olarak okundu.</strong>
           Sütun ayırıcısı bulunamadı — dosya büyük ihtimalle desteklenmeyen bir
           ayırıcıyla kaydedilmiş. Kabul edilen ayırıcılar: noktalı virgül (;),
           virgül (,), sekme ve dikey çizgi (|). Excel'de
           <em>Farklı Kaydet → CSV UTF-8</em> ile yeniden kaydetmek genellikle yeterli.`
        : '';
      tbody.innerHTML = `<tr><td colspan="${basliklar.length}" style="padding:14px; color:#FCA5A5; font-size:12px; line-height:1.6;">
        <strong>Dosya içe aktarılamaz:</strong> zorunlu sütun bulunamadı — ${escapeHtml(eksikSutun.join(', '))}.<br>
        Dosyanızın ilk satırı başlık satırı olmalı ve bu sütunları içermeli.
        En kolayı yukarıdan örnek şablonu indirip kendi verinizi oraya yapıştırmak.${ipucu}<br><br>
        <span style="color:#94A3B8;">Bulunan sütunlar: ${escapeHtml((pendingImportData.headers || []).join(', ') || '—')}</span>
      </td></tr>`;
      if (btn) { btn.disabled = true; btn.innerText = 'Zorunlu sütun eksik'; }
      return;
    }

    const satirYaz = (hucreler, renk, notMetni) => {
      const tr = document.createElement('tr');
      if (renk) tr.style.background = renk;
      tr.innerHTML = hucreler.map(c => '<td>' + escapeHtml(String(c)) + '</td>').join('');
      if (notMetni) tr.title = notMetni;
      tbody.appendChild(tr);
    };

    // Once HATALI satirlar: kullanicinin gormesi gereken bunlar.
    const hatalar = (r.errors || []).concat(r.overlaps || []);
    hatalar.slice(0, 15).forEach(e => {
      const bos = new Array(basliklar.length - 2).fill('');
      satirYaz([e.rowNum, ...bos, '✕ ' + e.errors.join(' ')], 'rgba(239,68,68,0.10)', e.errors.join('\n'));
    });

    // Sonra gecerli satirlardan ornek
    (r.validatedRows || []).filter(v => !v.hasFileOverlap).slice(0, Math.max(0, 15 - hatalar.length)).forEach(v => {
      const durum = v.isPotentialDuplicate ? '⊘ mükerrer, atlanacak' : '✓ eklenecek';
      const renk = v.isPotentialDuplicate ? 'rgba(245,158,11,0.10)' : '';
      if (rezMi) {
        satirYaz([v.rowNum, v.propertyName, v.guest, v.checkIn + ' → ' + v.checkOut,
                  v.nights, tl(v.gross), durum], renk);
      } else {
        satirYaz([v.rowNum, v.date, v.category, v.description || '—',
                  v.propertyId ? (v.propertyKey || '—') : 'Tüm portföy', tl(v.amount), durum], renk);
      }
    });

    const gosterilen = Math.min(15, hatalar.length + (r.validatedRows || []).length);
    const kalan = (hatalar.length + (r.validatedRows || []).length) - gosterilen;
    if (kalan > 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${basliklar.length}" style="text-align:center; color:var(--text-muted); font-size:11px;">… ${kalan} satır daha</td>`;
      tbody.appendChild(tr);
    }
  }

  if (btn) {
    btn.disabled = yazilacak <= 0;
    btn.innerText = yazilacak > 0
      ? `${yazilacak} kaydı içe aktar`
      : 'İçe aktarılacak geçerli kayıt yok';
  }
}

function resetImportPreview() {
  pendingImportData = null;
  const box = document.getElementById('importPreviewBox');
  if (box) box.style.display = 'none';
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) fileInput.value = '';
}

/**
 * Onaylanan satirlari GERCEKTEN yazar.
 *
 * createBooking / createExpense uzerinden gider: cakisma kontrolu, kapali
 * donem korumasi, rol ve tenant dogrulamasi bu yollarda zaten var. Kismi
 * basari normaldir; her satirin sonucu ayri raporlanir.
 */
/**
 * Ice aktarimin icerik parmak izi: dogrulanmis satirlarin kanonik metninin
 * SHA-256'si. Dosya adi ve satir sirasi disinda her sey dahildir.
 */
async function computeImportContentFingerprint(mode, result, tenantId) {
  const alanlar = r => {
    const { raw, rowNum, isPotentialDuplicate, hasFileOverlap, ...kalan } = r || {};
    return JSON.stringify(Object.keys(kalan).sort().map(k => [k, kalan[k]]));
  };
  const satirlar = ((result && result.validatedRows) || []).map(alanlar).sort();
  const hatali = ((result && result.errors) || []).map(e => JSON.stringify(e.raw || {})).sort();
  const metin = [String(mode), String(tenantId), satirlar.join('\n'), hatali.join('\n')].join('|');
  const sub = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
  if (sub && typeof TextEncoder !== 'undefined') {
    const ozet = await sub.digest('SHA-256', new TextEncoder().encode(metin));
    return Array.from(new Uint8Array(ozet)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const E = getImportEngine();
  return E ? E.computeHash(metin) : null;
}

async function applyImportedData() {
  if (!pendingImportData || !pendingImportData.result) {
    if (typeof showToast === 'function') showToast('Önce bir dosya seçin.', 'info');
    return;
  }

  const tenantId = getActiveTenantId();
  try {
    requireCloudForWrite('İçe aktarma', tenantId);
  } catch (e) {
    if (typeof showToast === 'function') showToast(e.message, 'error');
    return;
  }

  const r = pendingImportData.result;
  const rezMi = pendingImportData.mode === 'BOOKINGS';
  const yazilacaklar = (r.validatedRows || []).filter(v => !v.isPotentialDuplicate && !v.hasFileOverlap);
  if (yazilacaklar.length === 0) {
    if (typeof showToast === 'function') showToast('İçe aktarılacak geçerli kayıt yok.', 'info');
    return;
  }

  // Dosya parmak izi: ayni dosya iki kez yuklenmesin. ICERIKTEN uretilir
  // (L-41): eskiden "ad | satir | toplam" idi; yeniden adlandirilan ayni dosya
  // uyarisiz ikinci kez yaziliyor, ayni ad/satir/toplamli FARKLI dosya ise
  // "daha once aktarilmis" saniliyordu.
  const parmakIzi = await computeImportContentFingerprint(pendingImportData.mode, r, tenantId);

  if (parmakIzi && supabaseClient) {
    const { data: onceki } = await supabaseClient.from('finance_import_batches')
      .select('id,filename,imported_at,row_count').eq('tenant_id', tenantId).eq('file_hash', parmakIzi).maybeSingle();
    if (onceki) {
      const t = onceki.imported_at ? new Date(onceki.imported_at).toLocaleString('tr-TR') : '';
      const devam = typeof confirm === 'function'
        ? confirm(`Bu dosya daha önce içe aktarılmış (${onceki.filename}, ${t}, ${onceki.row_count} satır).\n\nAynı kayıtları ikinci kez eklemek cironuzu ve giderinizi iki katına çıkarır.\n\nYine de devam etmek istiyor musunuz?`)
        : false;
      if (!devam) return;
    }
  }

  const btn = document.getElementById('importConfirmBtn');
  if (btn) { btn.disabled = true; btn.innerText = 'Aktarılıyor… (0/' + yazilacaklar.length + ')'; }

  const basarili = [], basarisiz = [];
  // Yazilan kayitlarin kimlikleri: aktarimi GERI ALABILMEK icin partiyle
  // eslestirilecekler (phase35). Kimlik toplanmazsa "bu aktarim neyi yazdi"
  // sorusunun cevabi hicbir yerde durmaz.
  const yeniKayitlar = [];
  const prepared = [];
  const sourceRowById = new Map();
  for (const v of yazilacaklar) {
    try {
      const id = createImportRowId();
      let payload;
      if (rezMi) {
        payload = mapBookingToDb({
          id,
          propertyId: v.propertyId,
          villa: v.propertyKey,
          guest: v.guest,
          checkIn: v.checkIn,
          checkOut: v.checkOut,
          gross: v.gross,
          otaCommission: v.otaCommission,
          cleaningFee: v.cleaningFee,
          discount: v.discount || 0,
          phone: v.phone || '',
          notes: v.notes || '',
          channel: v.channel,
          pax: v.pax || undefined,
          status: v.status,
          code: v.code || undefined
        }, tenantId);
      } else {
        payload = mapExpenseToDb({
          id,
          date: v.date,
          category: v.category,
          amount: v.amount,
          description: v.description,
          propertyId: v.propertyId || undefined,
          villa: v.propertyKey || 'ALL',
          type: v.expenseType
        }, tenantId);
      }
      prepared.push(payload);
      sourceRowById.set(id, v.rowNum);
    } catch (err) {
      basarisiz.push({ rowNum: v.rowNum, mesaj: (err && err.message) ? err.message : String(err) });
    }
  }

  if (prepared.length > 0) {
    const batchResult = await insertImportedRowsInBatches(
      supabaseClient,
      rezMi ? 'bookings' : 'expenses',
      prepared,
      100
    );
    batchResult.rows.forEach(row => {
      const rowNum = sourceRowById.get(row.id);
      if (rowNum !== undefined) {
        basarili.push(rowNum);
        yeniKayitlar.push({ rowNum, id: row.id });
      }
    });
    batchResult.failures.forEach(failure => {
      basarisiz.push({
        rowNum: sourceRowById.get(failure.row.id),
        mesaj: failure.error && failure.error.message ? failure.error.message : String(failure.error)
      });
    });
    if (btn) btn.innerText = `Aktarılıyor… (${basarili.length + basarisiz.length}/${yazilacaklar.length})`;
  }

  // Basarili bir aktarim kaydi birak (mukerrer engeli bunu okur) ve yazilan
  // kayitlari ona BAGLA — geri alma bu bagin ustunde durur (phase35).
  let bagKuruldu = false;
  if (parmakIzi && supabaseClient && basarili.length > 0) {
    try {
      const { data: parti, error: partiHata } = await supabaseClient
        .from('finance_import_batches')
        .insert({
          tenant_id: tenantId,
          file_hash: parmakIzi,
          filename: String(pendingImportData.fileName || 'dosya').slice(0, 255),
          row_count: basarili.length,
          imported_amount: rezMi ? r.totalGross : r.totalAmount
        })
        .select('id')
        .single();
      if (partiHata) throw partiHata;
      bagKuruldu = await cloudLinkImportBatchRows(tenantId, parti.id, rezMi, yeniKayitlar);
    } catch (e) {
      // Kayit tutulamazsa aktarimin KENDISI yine de gecerlidir; kullanici
      // sadece tek tusla geri alamaz. Sessiz kalmiyoruz (asagida soyleniyor).
      console.warn('İçe aktarım kaydı tutulamadı:', e && e.message ? e.message : e);
    }
  }

  await loadTenantAppData(tenantId);
  if (btn) { btn.disabled = false; }

  // Ice aktarilan kayitlarin bulundugu SON aya gec.
  //
  // Bunsuz, gecmis veri aktaran kullanici hicbir sey gormuyordu: donem filtresi
  // icinde bulunulan ayda kaliyor, o ayda kayit olmadigi icin panel bos, rozet
  // "Rezervasyonlar (0)" gosteriyordu. Kayitlar veritabaninda duruyor olmasina
  // ragmen "aktarim olmadi" izlenimi veriyordu.
  const gidilenAy = enSonVeriAyi(yazilacaklar, rezMi);
  let ayDegisti = false;
  if (gidilenAy && gidilenAy !== currentFilter.period) {
    currentFilter.period = gidilenAy;
    currentFilter.startDate = gidilenAy + '-01';
    const sg = new Date(Date.UTC(Number(gidilenAy.slice(0, 4)), Number(gidilenAy.slice(5, 7)), 0)).getUTCDate();
    currentFilter.endDate = gidilenAy + '-' + String(sg).padStart(2, '0');
    ayDegisti = true;
    const secici = document.getElementById('globalPeriodFilter');
    if (secici) {
      refreshPeriodSelectors();
      if (secici.querySelector(`option[value="${gidilenAy}"]`)) secici.value = gidilenAy;
    }
    renderAll();
  }

  if (basarisiz.length === 0) {
    // Bag kurulamadiysa aktarim gecerlidir ama tek tusla geri alinamaz;
    // bunu SESSIZ gecmek, olmayan bir guvenlik agi vaat etmek olurdu.
    if (!bagKuruldu && typeof showToast === 'function') {
      showToast('Kayıtlar aktarıldı, ancak bu aktarım tek tuşla geri alınamayacak ' +
        '(veritabanı göçü henüz uygulanmamış).', 'info');
    }
    closeImportModal();
    resetImportPreview();
    if (typeof showToast === 'function') {
      const ek = ayDegisti ? ` Dönem ${getPeriodDisplayName(gidilenAy)} olarak değiştirildi.` : '';
      showToast(`${basarili.length} kayıt içe aktarıldı.${ek}`, 'success');
    }
  } else {
    // Kismi basari: NE YAZILDI, NE YAZILMADI acikca soylenir.
    const ozet = basarisiz.slice(0, 5).map(f => `satır ${f.rowNum}: ${f.mesaj}`).join('\n');
    const kalan = basarisiz.length > 5 ? `\n… ${basarisiz.length - 5} hata daha` : '';
    alert(`${basarili.length} kayıt eklendi, ${basarisiz.length} kayıt eklenemedi.\n\n${ozet}${kalan}\n\n` +
          `Eklenen kayıtlar sistemde kaldı. Hatalı satırları dosyanızda düzeltip yeniden yükleyebilirsiniz.`);
    renderImportPreviewBox();
  }
}


// -------------------------------------------------------------
// EXISTING DASHBOARD, LEADS, MAINTENANCE & SETTINGS LOGIC
// -------------------------------------------------------------
function renderKPIsAndDashboard() {
  let totalGross = 0;
  let totalNet = 0;
  let totalRoomRevenue = 0;
  let totalPaidNights = 0;
  let directRevenue = 0;

  const targetVillas = currentFilter.villa === 'ALL'
    ? Object.keys(appData.villas).filter(k => appData.villas[k]?.isActive !== false && !appData.villas[k]?.archivedAt)
    : [currentFilter.villa];
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
    const pay = getBookingFilterShare(b);
    const bGross = (Number(b.gross) || 0) * pay.ratio;
    const bNet = Math.max(0, Number(b.gross || 0) - Number(b.discount || 0)) * pay.ratio;
    const bRoom = Math.max(0, Number(b.gross || 0) - Number(b.cleaningFee || b.cleanFee || 0) - Number(b.discount || 0)) * pay.ratio;
    const bNights = pay.nights;

    totalGross += bGross;
    totalNet += bNet;
    totalRoomRevenue += bRoom;
    totalPaidNights += bNights;

    if (villaStats[b.villa]) {
      villaStats[b.villa].nights += bNights;
      villaStats[b.villa].netRevenue += bNet;
      villaStats[b.villa].grossRevenue += bGross;
    }

    if (isDirectBookingChannel(b.channel, appData.bookingChannels)) {
      directRevenue += bNet;
      if (villaStats[b.villa]) villaStats[b.villa].directRevenue += bNet;
    }
  });

  let availableNights = null;
  if (/^\d{4}-\d{2}$/.test(currentFilter.period || '') && typeof FinancialMetricsService !== 'undefined') {
    const [year, month] = currentFilter.period.split('-').map(Number);
    availableNights = FinancialMetricsService.calculateAvailableNights(
      targetVillas.map(k => appData.villas[k]).filter(Boolean), year, month, appData.maintenance || []
    );
  } else {
    const daysInPeriod = getPeriodDayCount();
    if (daysInPeriod !== null) availableNights = daysInPeriod * targetVillas.length;
  }
  // Toplamlar Finans ekraniyla AYNI formulden (K-04); yukaridaki dongu
  // yalniz mulk kirilimi icindir.
  const ledger = computeFilterLedger();
  totalNet = ledger.totalRevenue;
  totalRoomRevenue = ledger.netRoomRevenue;
  totalPaidNights = ledger.soldNights;
  const occupancyRate = availableNights > 0 ? (totalPaidNights / availableNights) * 100 : null;
  const adr = ledger.adr;
  const revpar = availableNights > 0 ? totalRoomRevenue / availableNights : null;
  // NRevPAR = (Toplam Gelir - OPEX) / kullanilabilir gece. OPEX yapilmis
  // temizligi ve odeme komisyonunu da icerir.
  const nrevpar = availableNights > 0 ? ledger.operatingProfit / availableNights : null;

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

  const currentTarget = getConfiguredRevenueTarget(currentFilter, appData.targets, currentFilter.villa);

  const targetPct = currentTarget > 0 ? ((totalNet / currentTarget) * 100).toFixed(0) : null;

  if (elNetRev) elNetRev.innerText = '₺' + Math.round(totalNet).toLocaleString('tr-TR');
  if (elGrossRev) elGrossRev.innerText = 'Brüt: ₺' + Math.round(totalGross).toLocaleString('tr-TR');
  if (elTargetPct) {
    elTargetPct.innerText = targetPct === null ? 'Hedef belirlenmedi' : '%' + targetPct + ' Hedef';
    elTargetPct.className = 'kpi-trend ' + (targetPct !== null && Number(targetPct) >= 100 ? 'positive' : 'neutral');
  }
  if (elOcc) elOcc.innerText = occupancyRate === null ? '—' : '%' + occupancyRate.toFixed(1);
  if (elNightsDetail) elNightsDetail.innerText = totalPaidNights + ' Gece Satıldı';
  if (elAvailDetail) elAvailDetail.innerText = availableNights === null ? 'Kapasite hesaplanamadı' : availableNights + ' Gece Kapasite';
  if (elAdr) elAdr.innerText = adr === null ? '—' : '₺' + Math.round(adr).toLocaleString('tr-TR');
  if (elRevpar) elRevpar.innerText = revpar === null ? '—' : '₺' + Math.round(revpar).toLocaleString('tr-TR');
  if (elNRevpar) elNRevpar.innerText = nrevpar === null ? 'NRevPAR: —' : 'NRevPAR: ₺' + Math.round(nrevpar).toLocaleString('tr-TR');

  // Render Kokpit Funnel and Channel Distribution
  renderFunnelStats();
  renderChannelDistribution();


  // Scorecard
  const tbody = document.getElementById('villaScorecardBody');
  if (tbody) {
    tbody.innerHTML = '';
    if (!targetVillas || targetVillas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 32px; color: var(--text-muted, #94A3B8);">
            <div style="font-size: 14px; margin-bottom: 8px;">Henüz kayıtlı bir mülkünüz bulunmuyor.</div>
            <button type="button" class="btn btn-primary btn-sm" data-onclick="openPropertyModal()" style="font-size: 12px; padding: 6px 14px;">İlk mülkünü ekle</button>
          </td>
        </tr>
      `;
      return;
    }
    targetVillas.forEach(vKey => {
      const vConf = appData.villas[vKey];
      const s = villaStats[vKey] || { nights: 0, netRevenue: 0, directRevenue: 0, p1Open: 0 };
      let propertyAvailable = getPeriodDayCount();
      if (/^\d{4}-\d{2}$/.test(currentFilter.period || '') && typeof FinancialMetricsService !== 'undefined') {
        const [year, month] = currentFilter.period.split('-').map(Number);
        propertyAvailable = FinancialMetricsService.calculateAvailableNights([vConf], year, month, appData.maintenance || []);
      }
      const vOcc = propertyAvailable > 0 ? (s.nights / propertyAvailable) * 100 : null;
      const vAdr = s.nights > 0 ? (s.netRevenue / s.nights) : 0;
      const vRevpar = propertyAvailable > 0 ? s.netRevenue / propertyAvailable : null;
      const vDirPct = s.netRevenue > 0 ? (s.directRevenue / s.netRevenue) * 100 : 0;

      let badgeHtml = '<span class="badge badge-emerald">🟢 Sağlıklı</span>';
      if (s.p1Open > 0) badgeHtml = '<span class="badge badge-rose">🔴 P1 Arıza</span>';
      else if (vOcc !== null && vOcc < 40) badgeHtml = '<span class="badge badge-amber">🟡 Düşük Doluluk</span>';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong>${escapeHtml(vConf.name || 'Adsız mülk')}</strong>
            <button type="button" class="btn btn-sm btn-subtle" data-onclick="openPropertyModal(decodeURIComponent('${encodeActionArg(String(vKey))}'))" title="Mülkü Düzenle" style="padding: 2px 6px; font-size: 11px; cursor: pointer; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #cbd5e1;">✏️</button>
          </div>
        </td>
        <td>${escapeHtml(vConf.capacity || 'Belirtilmedi')}</td>
        <td>${s.nights} Gece</td>
        <td>${vOcc === null ? '—' : '%' + vOcc.toFixed(1)}</td>
        <td>₺${Math.round(vAdr).toLocaleString('tr-TR')}</td>
        <td>${vRevpar === null ? '—' : '₺' + Math.round(vRevpar).toLocaleString('tr-TR')}</td>
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
    const downtime = Number(m.downtime);
    const hasDowntime = m.downtime !== null && m.downtime !== undefined && m.downtime !== '';
    const downtimeText = hasDowntime && Number.isFinite(downtime) && downtime >= 0
      ? `${downtime} Gece`
      : '— (kesinti süresi girilmemiş)';
    actions.push({ type: 'p1', id: m.id, badge: '[P1 ACİL]', title: `${appData.villas[m.villa]?.name || m.villa}: ${m.title}`, meta: `Downtime: ${downtimeText}`, action: 'Arızalara Git' });
  });

  appData.leads.filter(l => l.status === 'FOLLOW_UP').forEach(l => {
    actions.push({ type: 'lead', id: l.id, badge: '[SICAK LEAD]', title: `${l.guest} (${appData.villas[l.villa]?.name || l.villa}): ₺${Number(l.quote).toLocaleString('tr-TR')}`, meta: `Kanal: ${l.channel}`, action: 'Taleplere Git' });
  });

  if (actions.length === 0) {
    actions.push({ type: 'ops', id: '', badge: '[GÜVENLİ]', title: 'Tüm villalar operasyonel açıdan sakin ve hazır durumda.', meta: 'Açık P1 arıza bulunmuyor.', action: 'Operasyona Git' });
  }

  const badge = document.getElementById('radarBadge');
  if (badge) badge.innerText = `${actions.length} Aksiyon`;

  actions.slice(0, 5).forEach(act => {
    const row = document.createElement('div');
    row.className = 'radar-row';
    row.innerHTML = `
      <div class="radar-badge-col"><span class="radar-pill pill-${act.type}">${act.badge}</span></div>
      <div class="radar-main-col"><strong>${escapeHtml(act.title)}</strong><span>${act.meta}</span></div>
      <div class="radar-action-col"><button type="button" class="btn btn-secondary btn-sm" data-radar-action="${act.type}" data-radar-id="${act.id || ''}">${act.action}</button></div>
    `;
    const actionButton = row.querySelector('[data-radar-action]');
    if (actionButton) {
      actionButton.addEventListener('click', () => handleTodayRadarAction(act.type, act.id));
    }
    container.appendChild(row);
  });
}

function handleTodayRadarAction(type) {
  if (type === 'p1') {
    switchTab('maintenance');
    return;
  }
  if (type === 'lead') {
    switchTab('leads');
    return;
  }
  switchTab('operations');
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
    const net = (Number(b.net) || 0) * getBookingFilterShare(b).ratio;
    totalNet += net;

    if (!channelTotals[ch]) {
      channelTotals[ch] = { name: ch, count: 0, net: 0 };
    }
    channelTotals[ch].count += 1;
    channelTotals[ch].net += net;

    if (isDirectBookingChannel(ch, appData.bookingChannels)) {
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
    const isDirect = isDirectBookingChannel(ch.name, appData.bookingChannels);
    const pct = totalNet > 0 ? (ch.net / totalNet) * 100 : 0;

    const div = document.createElement('div');
    div.className = 'channel-progress-item';
    div.innerHTML = `
      <div class="channel-meta">
        <span><strong>${escapeHtml(chName)}</strong> (${ch.count} Rez.)</span>
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
  const todayStr = getTodayStr();
  const hasCalendarSource = Object.keys(appData.villas || {}).length > 0
    && (appData.bookings || []).some(b => b.status !== 'CANCELLED');

  // Check gaps between consecutive bookings for each villa
  Object.keys(appData.villas).forEach(vKey => {
    const vConf = appData.villas[vKey];
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
        // Taban ve teklif YALNIZCA mulkun kendi girilmis rakamlarindan
        // uretilir. Eskiden girilmemis her alan bir sabitle dolduruluyordu
        // (taban 4.000, temizlik 1.500, isitma 500, baz 7.000): hic fiyat
        // girmemis bir isletme, kendi rakami sanip uygulayacagi bir teklif
        // goruyordu. Baz fiyat yoksa teklif hesaplanamaz (3.6).
        const floorGuard = (Number(vConf.floor) || 0) + (Number(vConf.cleanCost) || 0) + (Number(vConf.heatCost) || 0);
        const baseNightly = Number(vConf.base) || Number(vConf.basePrice) || 0;
        const offer = baseNightly > 0 ? Math.max(Math.round(baseNightly * 0.75), floorGuard) : null;
        gaps.push({
          villaName: vConf.name,
          dates: `${formatShortDate(cur.checkOut)} → ${formatShortDate(next.checkIn)} (${diffDays} Gece Boş)`,
          offer: offer === null ? 'Fiyat girilmemiş' : ('₺' + offer.toLocaleString('tr-TR') + ' / Gece'),
          floor: floorGuard > 0 ? ('₺' + floorGuard.toLocaleString('tr-TR') + ' Taban') : 'Taban maliyeti girilmemiş',
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
        // Taban ve teklif YALNIZCA mulkun kendi girilmis rakamlarindan
        // uretilir. Eskiden girilmemis her alan bir sabitle dolduruluyordu
        // (taban 4.000, temizlik 1.500, isitma 500, baz 7.000): hic fiyat
        // girmemis bir isletme, kendi rakami sanip uygulayacagi bir teklif
        // goruyordu. Baz fiyat yoksa teklif hesaplanamaz (3.6).
        const floorGuard = (Number(vConf.floor) || 0) + (Number(vConf.cleanCost) || 0) + (Number(vConf.heatCost) || 0);
        const baseNightly = Number(vConf.base) || Number(vConf.basePrice) || 0;
        const offer = baseNightly > 0 ? Math.max(Math.round(baseNightly * 0.75), floorGuard) : null;
        gaps.push({
          villaName: vConf.name,
          dates: `Hemen Giriş: ${formatShortDate(todayStr)} → ${formatShortDate(firstB.checkIn)} (${daysUntil} Gece)`,
          offer: offer === null ? 'Fiyat girilmemiş' : ('₺' + offer.toLocaleString('tr-TR') + ' / Gece'),
          floor: floorGuard > 0 ? ('₺' + floorGuard.toLocaleString('tr-TR') + ' Taban') : 'Taban maliyeti girilmemiş',
          note: 'İlk girişe kadar hızlı fırsat satışı'
        });
      }
    }
  });

  if (gaps.length === 0) {
    if (!hasCalendarSource) {
      container.innerHTML = '<div style="grid-column:1 / -1; padding:14px 18px; color:var(--text-muted);">Mülk ve rezervasyon kaydı olmadan takvim boşlukları hesaplanamadı.</div>';
      return;
    }
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
        <strong style="color: #FFFFFF; font-size: 13px;">${escapeHtml(g.villaName)}</strong>
        <span style="color: #60A5FA; font-size: 12px; font-weight: 600; margin-top: 2px;">${g.dates}</span>
        <span style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(g.note)}</span>
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

  const channelData = {};


  let directGross = 0;
  appData.bookings.forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const ch = b.channel ? b.channel.toUpperCase() : 'OTHER';
    const oran = getBookingFilterShare(b).ratio;
    const isDirect = isDirectBookingChannel(ch, appData.bookingChannels);
    if (!channelData[ch]) channelData[ch] = {
      name: ch === 'BOOKING' ? 'Booking.com' : ch,
      type: isDirect ? 'Direkt' : 'OTA', count: 0, gross: 0, comm: 0, net: 0
    };
    const gross = (Number(b.gross) || 0) * oran;
    channelData[ch].count += 1;
    channelData[ch].gross += gross;
    channelData[ch].comm += (Number(b.otaComm ?? b.otaCommission) || 0) * oran;
    channelData[ch].net += (Number(b.net) || 0) * oran;
    if (isDirect) directGross += gross;
  });

  const otaSavedEl = document.getElementById('otaSavedCommission');
  if (otaSavedEl) otaSavedEl.innerText = Object.keys(channelData).length
    ? `${Math.round(directGross).toLocaleString('tr-TR')} TL`
    : '—';

  if (Object.keys(channelData).length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">Seçili dönemde kanal raporu oluşturacak rezervasyon kaydı yok.</td></tr>';
    return;
  }

  Object.keys(channelData).forEach(k => {
    const c = channelData[k];
    const commPct = c.gross > 0 ? (c.comm / c.gross) * 100 : 0;
    const netMargin = c.gross > 0 ? (c.net / c.gross) * 100 : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong></td>
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

  const todayStr = getTodayStr();

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
      // Konaklamanin GECELERINDEN biri donemde mi (3.4)? Eskiden yalniz giris
      // ve cikis ayina bakiliyordu; 28 Nisan -> 2 Haziran konaklamasi Mayis
      // listesinde hic gorunmuyordu (L-37).
      const yil = /^(\d{4})-YEAR$/.exec(periodFilter);
      const aralik = yil ? { start: `${yil[1]}-01-01`, end: `${yil[1]}-12-31` } : getLedgerContract().monthRange(periodFilter);
      if (aralik) {
        if (!(b.checkIn <= aralik.end && b.checkOut > aralik.start)) return false;
      } else if (b.checkIn.slice(0, 7) !== periodFilter && b.checkOut.slice(0, 7) !== periodFilter) {
        return false;
      }
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
    renderTablePagination('bookingsPagination', 'bookings', paginateRows([], 1), 'renderManageBookingsTable');
    return;
  }

  const pageInfo = paginateRows(filtered, largeTablePageState.bookings);
  renderTablePagination('bookingsPagination', 'bookings', pageInfo, 'renderManageBookingsTable');
  pageInfo.rows.forEach(b => {
    const vName = appData.villas[b.villa]?.name || b.villa;
    const nightly = b.nights > 0 ? Math.round((b.net || b.gross) / b.nights) : 0;

    let statusBadge = '<span class="badge badge-slate" title="Kaynak kayıtta geçerli durum yok">—</span>';
    if (b.status === 'CONFIRMED') statusBadge = '<span class="badge badge-green">Onaylandı</span>';
    if (b.status === 'CANCELLED') statusBadge = '<span class="badge badge-rose">İptal</span>';
    if (b.status === 'CHECKED_IN') statusBadge = '<span class="badge badge-blue">İçeride</span>';
    if (b.status === 'CHECKED_OUT') statusBadge = '<span class="badge badge-slate">Tamamlandı</span>';

    // Highlight New Year / future special dates
    const isNewYear = String(b.checkIn || '').slice(5, 10) === '12-31';

    const tr = document.createElement('tr');
    if (isNewYear) {
      tr.style.background = 'rgba(217, 119, 6, 0.08)';
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(vName)}</strong> ${isNewYear ? ' <span class="badge badge-amber" style="font-size:10px;">🎄 Yılbaşı</span>' : ''}</td>
      <td>${escapeHtml(b.guest || 'Belirtilmedi')}</td>
      <td><span class="badge ${b.channel === 'AIRBNB' ? 'badge-rose' : (b.channel === 'BOOKING' ? 'badge-blue' : 'badge-emerald')}">${escapeHtml(b.channel || 'Belirtilmedi')}</span></td>
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
        <button class="btn btn-secondary btn-sm" data-onclick="editBooking(decodeURIComponent('${encodeActionArg(String(b.id))}'))" title="Düzenle">✏️</button>
        <button class="btn btn-danger btn-sm" data-onclick="deleteBookingUI(decodeURIComponent('${encodeActionArg(String(b.id))}'))" title="Sil">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openBookingModal(editId = null) {
  const modal = document.getElementById('bookingModal');
  const title = document.getElementById('bookingModalTitle');
  const editInput = document.getElementById('resEditId');
  if (!modal) return;

  let deleteBtn = document.getElementById('resDeleteBtn');
  if (!deleteBtn) {
    const footer = modal.querySelector('.modal-footer');
    if (footer) {
      deleteBtn = document.createElement('button');
      deleteBtn.id = 'resDeleteBtn';
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.style.cssText = 'background:#ef4444; border:none; margin-right:auto; cursor:pointer; font-size:12px; padding:8px 14px; border-radius:6px; color:#fff;';
      deleteBtn.innerText = '🗑️ Rezervasyonu Sil';
      deleteBtn.onclick = handleBookingDeleteFromModal;
      footer.insertBefore(deleteBtn, footer.firstChild);
    }
  }

  if (editId) {
    const b = (appData.bookings || []).find(item => item.id === editId || item.code === editId || item.dbId === editId);
    if (!b) return;
    refreshBookingChannelDropdown(b.channel);
    if (title) title.innerText = '✏️ Rezervasyonu Güncelle';
    if (editInput) editInput.value = b.id;
    const vEl = document.getElementById('resVilla');
    if (vEl) vEl.value = b.villa || b.propertyId;
    const gEl = document.getElementById('resGuest');
    if (gEl) gEl.value = b.guest;
    const linkedGuest = (appData.guests || []).find(guest => guest.id === b.primaryGuestId);
    const gidEl = document.getElementById('resGuestId');
    if (gidEl) gidEl.value = linkedGuest?.id || '';
    const phoneEl = document.getElementById('resGuestPhone');
    if (phoneEl) phoneEl.value = linkedGuest?.phone || b.phone || '';
    const emailEl = document.getElementById('resGuestEmail');
    if (emailEl) emailEl.value = linkedGuest?.email || '';
    const langEl = document.getElementById('resGuestLanguage');
    if (langEl) langEl.value = linkedGuest?.language || 'tr';
    const marketingEl = document.getElementById('resGuestMarketingOptIn');
    if (marketingEl) marketingEl.checked = linkedGuest?.marketingOptIn === true;
    setResDateRange(b.checkIn, b.checkOut);
    const chEl = document.getElementById('resChannel');
    if (chEl) chEl.value = b.channel;
    const grEl = document.getElementById('resGross');
    if (grEl) grEl.value = b.gross;
    const commEl = document.getElementById('resCommission');
    if (commEl) commEl.value = b.otaComm;
    const rateEl = document.getElementById('resCommissionRate');
    if (rateEl) {
      const g = Number(b.gross) || 0;
      rateEl.value = g > 0 ? ((Number(b.otaComm) || 0) / g * 100).toFixed(2) : '';
    }
    const cfEl = document.getElementById('resCleanFee');
    if (cfEl) cfEl.value = b.cleanFee;
    const ccEl = document.getElementById('resCleanCost');
    // Maliyet bilinmiyorsa bos kalir; misafirden alinan ucret maliyet
    // diye doldurulmaz (L-27).
    if (ccEl) ccEl.value = (b.cleanCost === undefined || b.cleanCost === null) ? '' : b.cleanCost;
    const pcEl = document.getElementById('resPaymentCommission');
    if (pcEl) pcEl.value = Number(b.paymentCommission) > 0 ? b.paymentCommission : '';
    const stEl = document.getElementById('resStatus');
    if (stEl) stEl.value = normalizeBookingStatus(b.status) || '';
    const pxEl = document.getElementById('resPax');
    if (pxEl) pxEl.value = normalizePositiveInteger(b.pax) ?? '';
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
  } else {
    if (title) title.innerText = '➕ Yeni Rezervasyon Girişi';
    if (editInput) editInput.value = '';
    const form = document.getElementById('bookingForm');
    if (form) form.reset();
    refreshBookingChannelDropdown();
    const gidEl = document.getElementById('resGuestId');
    if (gidEl) gidEl.value = '';
    const cfEl = document.getElementById('resCleanFee');
    if (cfEl) cfEl.value = 0;
    const ccEl = document.getElementById('resCleanCost');
    if (ccEl) ccEl.value = '';
    const pcEl = document.getElementById('resPaymentCommission');
    if (pcEl) pcEl.value = '';
    const rateEl = document.getElementById('resCommissionRate');
    if (rateEl) rateEl.value = '';
    // form.reset() gizli inputlari bosaltir ama takvim durumu JS'te tutulur.
    clearResDateRange();
    handleBookingChannelChange();
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  calculateLivePreview();
  modal.classList.add('active');
}

function closeBookingModal() {
  const modal = document.getElementById('bookingModal');
  if (modal) modal.classList.remove('active');
}

async function handleBookingDeleteFromModal() {
  const editId = document.getElementById('resEditId')?.value;
  if (editId) {
    return await deleteBookingUI(editId);
  }
  return false;
}

function getBookingChannelCatalog(channels) {
  if (Array.isArray(channels) && channels.length) return channels;
  if (typeof appData !== 'undefined' && Array.isArray(appData.bookingChannels) && appData.bookingChannels.length) {
    return appData.bookingChannels;
  }
  return getFallbackBookingChannels();
}

function getChannelCommissionRate(channel, channels) {
  const code = String(channel || '').toUpperCase();
  const match = getBookingChannelCatalog(channels).find(item => String(item.code || '').toUpperCase() === code);
  return match ? Number(match.defaultCommissionRate) || 0 : 0;
}

function getBookingChannelLabel(channel) {
  const rate = Number(channel.defaultCommissionRate) || 0;
  return `${channel.displayName} (${channel.channelType === 'OTA' ? `OTA - %${rate.toLocaleString('tr-TR')}` : 'Direkt - %0'})`;
}

function sortBookingChannelsForSelection(channels) {
  const systemOrder = new Map(DEFAULT_BOOKING_CHANNELS.map((channel, index) => [channel.code, index]));
  return (channels || []).slice().sort((a, b) => {
    const aRank = systemOrder.has(a.code) ? systemOrder.get(a.code) : Number.MAX_SAFE_INTEGER;
    const bRank = systemOrder.has(b.code) ? systemOrder.get(b.code) : Number.MAX_SAFE_INTEGER;
    if (aRank !== bRank) return aRank - bRank;
    return String(a.displayName || a.code).localeCompare(String(b.displayName || b.code), 'tr');
  });
}

function refreshBookingChannelDropdown(selectedCode = '') {
  if (typeof document === 'undefined') return;
  const select = document.getElementById('resChannel');
  if (!select) return;
  const selected = String(selectedCode || select.value || '').toUpperCase();
  const channels = sortBookingChannelsForSelection(
    getBookingChannelCatalog().filter(channel => channel.isActive || channel.code === selected)
  );
  if (selected && !channels.some(channel => channel.code === selected)) {
    channels.push({ code: selected, displayName: selected, channelType: 'DIRECT', defaultCommissionRate: 0, isActive: false });
  }
  select.innerHTML = channels.map(channel =>
    `<option value="${escapeHtml(channel.code)}">${escapeHtml(getBookingChannelLabel(channel))}${channel.isActive ? '' : ' — Pasif'}</option>`
  ).join('');
  if (selected && channels.some(channel => channel.code === selected)) select.value = selected;
}

function handleBookingChannelChange() {
  const channel = document.getElementById('resChannel')?.value || '';
  const rateEl = document.getElementById('resCommissionRate');
  const commEl = document.getElementById('resCommission');
  if (rateEl) rateEl.value = String(getChannelCommissionRate(channel));
  if (commEl) commEl.value = '';
  syncCommissionFromRate();
}

/**
 * Rezervasyon ekonomisinin TEK hesaplama noktasi.
 *
 * Temizlik iki AYRI kalemdir ve birbirine karistirilmaz:
 *   - cleanFee  : misafirden alinan temizlik ucreti  -> GELIR (brute dahildir)
 *   - cleanCost : personele odenen temizlik maliyeti -> GIDER (borc defteri)
 *
 * Bir zamanlar tek alan ikisini birden temsil ediyordu: ayni sayi hem
 * bookings.cleaning_fee'ye gelir olarak yaziliyor hem de temizlik gorevinin
 * personele odenecek tutari oluyordu. Kar marji bu yuzden yanlis cikiyordu.
 */
function computeBookingEconomics(input) {
  const gross = Math.max(0, Number(input.gross) || 0);
  const cleanFee = Math.max(0, Number(input.cleanFee) || 0);
  const cleanCost = Math.max(0, Number(input.cleanCost) || 0);
  // Odeme komisyonu (POS / sanal POS): gider, ciroyu azaltmaz (K-04).
  const paymentComm = Math.max(0, Number(input.paymentCommission) || 0);
  const nights = Math.max(0, Number(input.nights) || 0);

  // Temizlik ucreti brutun icindedir; oda geliri geri kalanidir.
  const roomRevenue = Math.max(0, gross - cleanFee);

  let otaComm;
  if (input.commission !== '' && input.commission !== null && input.commission !== undefined
      && !isNaN(Number(input.commission))) {
    otaComm = Math.max(0, Number(input.commission));
  } else {
    otaComm = Math.round(gross * getChannelCommissionRate(input.channel, input.channels) / 100);
  }
  otaComm = Math.min(otaComm, gross);

  const commissionRate = gross > 0 ? (otaComm / gross) * 100 : 0;
  const netAfterCommission = gross - otaComm - paymentComm;  // bize gecen tutar
  const netToUs = netAfterCommission - cleanCost;  // temizlik odendikten sonra kalan

  // ADR tabani: komisyon ve temizlik geliri disinda kalan saf oda geliri.
  const netRoomRevenue = Math.max(0, roomRevenue - otaComm);

  return {
    gross, cleanFee, cleanCost, nights, roomRevenue,
    otaComm, paymentComm, commissionRate, netAfterCommission, netToUs, netRoomRevenue,
    nightlyNet: nights > 0 ? Math.round(netRoomRevenue / nights) : 0
  };
}

function readBookingFormEconomics() {
  const el = id => document.getElementById(id);
  const dInStr = el('resCheckIn') ? el('resCheckIn').value : '';
  const dOutStr = el('resCheckOut') ? el('resCheckOut').value : '';
  return computeBookingEconomics({
    gross: el('resGross') ? el('resGross').value : 0,
    cleanFee: el('resCleanFee') ? el('resCleanFee').value : 0,
    cleanCost: el('resCleanCost') ? el('resCleanCost').value : 0,
    paymentCommission: el('resPaymentCommission') ? el('resPaymentCommission').value : 0,
    channel: el('resChannel') ? el('resChannel').value : '',
    commission: el('resCommission') ? el('resCommission').value : '',
    nights: calculateNightsBetween(dInStr, dOutStr)
  });
}

// Oran yazildiginda tutari, tutar yazildiginda orani guncelle. Ikisi de
// kullanicinin elindedir; hangisini yazarsa digeri turetilir.
function syncCommissionFromRate() {
  const rateEl = document.getElementById('resCommissionRate');
  const commEl = document.getElementById('resCommission');
  const gross = Number((document.getElementById('resGross') || {}).value) || 0;
  if (rateEl && commEl && rateEl.value !== '' && !isNaN(Number(rateEl.value))) {
    commEl.value = Math.round(gross * Number(rateEl.value) / 100);
  }
  calculateLivePreview();
}

function syncRateFromCommission() {
  const rateEl = document.getElementById('resCommissionRate');
  const commEl = document.getElementById('resCommission');
  const gross = Number((document.getElementById('resGross') || {}).value) || 0;
  if (rateEl && commEl && commEl.value !== '' && !isNaN(Number(commEl.value)) && gross > 0) {
    rateEl.value = (Number(commEl.value) / gross * 100).toFixed(2);
  }
  calculateLivePreview();
}

function calculateLivePreview() {
  const e = readBookingFormEconomics();
  const money = v => `₺${Math.round(v).toLocaleString('tr-TR')}`;
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  put('prevNights', e.nights > 0 ? `${e.nights} Gece` : '—');
  put('prevRoomRevenue', money(e.roomRevenue));
  put('prevCleanRevenue', money(e.cleanFee));
  put('prevGrossTotal', money(e.gross));
  put('prevCommissionRate', e.gross > 0 ? `(%${e.commissionRate.toFixed(2)})` : '');
  put('prevCommission', e.otaComm > 0 ? `− ${money(e.otaComm)}` : money(0));
  put('prevPaymentCommission', e.paymentComm > 0 ? `− ${money(e.paymentComm)}` : money(0));
  put('prevNetAfterCommission', money(e.netAfterCommission));
  put('prevCleanCost', e.cleanCost > 0 ? `− ${money(e.cleanCost)}` : money(0));
  put('prevNetToUs', money(e.netToUs));
  put('prevNetRevenue', money(e.netRoomRevenue));
  put('prevNightlyNet', e.nights > 0 ? `${money(e.nightlyNet)} / gece` : '—');
}

/* ===========================================================================
   KONAKLAMA TARIHI SECICI (tek takvimde aralik — Airbnb kalibi)
   Giris ve cikis ayri iki <input type="date"> idi; kullanici cikisin girisden
   once olmadigini kendi kontrol etmek zorundaydi ve kac gece oldugunu ancak
   kaydettikten sonra goruyordu.
   resCheckIn / resCheckOut gizli input olarak KORUNUR: kaydetme, duzenleme,
   fiyatlandirma ve testler o iki degeri okumaya devam eder.
   =========================================================================== */
const RES_CAL_MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const RES_CAL_DOW_TR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];

let resCalAnchor = null;   // gorunen ilk ayin 1'i
let resRangeStart = null;  // 'YYYY-MM-DD'
let resRangeEnd = null;    // 'YYYY-MM-DD'

function resDateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resParseKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function resFormatHuman(key) {
  const d = resParseKey(key);
  if (!d) return '—';
  return `${d.getDate()} ${RES_CAL_MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`;
}

function resAnchorFrom(key) {
  const d = resParseKey(key) || resParseKey(getTodayStr()) || new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function toggleResDatePicker(forceOpen) {
  const panel = document.getElementById('resDatePicker');
  const btn = document.getElementById('resDateRangeBtn');
  if (!panel) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : panel.hidden;
  panel.hidden = !open;
  if (btn) btn.setAttribute('aria-expanded', String(open));
  if (open) {
    resCalAnchor = resCalAnchor || resAnchorFrom(resRangeStart);
    renderResCalendar();
  }
}

function shiftResCalendar(delta) {
  resCalAnchor = resCalAnchor || resAnchorFrom(resRangeStart);
  resCalAnchor = new Date(resCalAnchor.getFullYear(), resCalAnchor.getMonth() + delta, 1);
  renderResCalendar();
}

function clearResDateRange() {
  resRangeStart = null;
  resRangeEnd = null;
  syncResDateInputs();
  renderResCalendar();
}

function pickResDate(key) {
  if (!resRangeStart || (resRangeStart && resRangeEnd)) {
    // Yeni bir aralik baslat
    resRangeStart = key;
    resRangeEnd = null;
  } else if (key <= resRangeStart) {
    // Girisden onceki (veya ayni) gun secildiyse yeni giris say — cikis
    // girisden once olamaz, bu yuzden sessizce gecersiz aralik uretmeyiz.
    resRangeStart = key;
    resRangeEnd = null;
  } else {
    resRangeEnd = key;
  }
  syncResDateInputs();
  renderResCalendar();
  if (resRangeStart && resRangeEnd) toggleResDatePicker(false);
}

function syncResDateInputs() {
  const inEl = document.getElementById('resCheckIn');
  const outEl = document.getElementById('resCheckOut');
  if (inEl) inEl.value = resRangeStart || '';
  if (outEl) outEl.value = resRangeEnd || '';

  const inLbl = document.getElementById('resDateInLabel');
  const outLbl = document.getElementById('resDateOutLabel');
  const badge = document.getElementById('resDateNightsBadge');
  const hint = document.getElementById('resDateHint');
  if (inLbl) inLbl.innerText = resRangeStart ? resFormatHuman(resRangeStart) : '—';
  if (outLbl) outLbl.innerText = resRangeEnd ? resFormatHuman(resRangeEnd) : '—';

  const nights = calculateNightsBetween(resRangeStart, resRangeEnd);
  if (badge) badge.innerText = nights > 0 ? `${nights} gece` : '—';
  if (hint) {
    hint.innerText = !resRangeStart ? 'Giriş tarihini seçin'
      : !resRangeEnd ? 'Çıkış tarihini seçin'
      : `${nights} gece seçildi`;
  }
  calculateLivePreview();
}

/** Disaridan (duzenleme ekrani, WhatsApp ayristirici) aralik yuklemek icin. */
function setResDateRange(checkIn, checkOut) {
  resRangeStart = checkIn || null;
  resRangeEnd = checkOut || null;
  resCalAnchor = resAnchorFrom(resRangeStart);
  syncResDateInputs();
  renderResCalendar();
}

function renderResCalendarMonth(anchor) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const today = getTodayStr();
  const first = new Date(year, month, 1);
  // Pazartesi=0 olacak sekilde kaydir (JS'te Pazar=0).
  const lead = (first.getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();

  let cells = '';
  RES_CAL_DOW_TR.forEach(d => { cells += `<div class="daterange-dow">${d}</div>`; });
  for (let i = 0; i < lead; i++) cells += '<span class="daterange-day is-empty"></span>';

  for (let day = 1; day <= dayCount; day++) {
    const key = resDateKey(year, month, day);
    const classes = ['daterange-day'];
    if (key === today) classes.push('is-today');
    if (resRangeStart && key === resRangeStart) classes.push('is-start');
    if (resRangeEnd && key === resRangeEnd) classes.push('is-end');
    if (resRangeStart && resRangeEnd && key > resRangeStart && key < resRangeEnd) classes.push('in-range');
    cells += `<button type="button" class="${classes.join(' ')}" data-res-date="${key}">${day}</button>`;
  }

  return `<div><div class="daterange-month-name">${RES_CAL_MONTHS_TR[month]} ${year}</div>`
    + `<div class="daterange-grid">${cells}</div></div>`;
}

function renderResCalendar() {
  const host = document.getElementById('resCalMonths');
  if (!host) return;
  resCalAnchor = resCalAnchor || resAnchorFrom(resRangeStart);
  const second = new Date(resCalAnchor.getFullYear(), resCalAnchor.getMonth() + 1, 1);
  host.innerHTML = renderResCalendarMonth(resCalAnchor) + renderResCalendarMonth(second);

  const title = document.getElementById('resCalTitle');
  if (title) {
    title.innerText = `${RES_CAL_MONTHS_TR[resCalAnchor.getMonth()]} ${resCalAnchor.getFullYear()}`
      + ` – ${RES_CAL_MONTHS_TR[second.getMonth()]} ${second.getFullYear()}`;
  }
}

if (typeof document !== 'undefined' && document.addEventListener) {
  // Gun butonlari her render'da yeniden uretildigi icin olay delegasyonu.
  document.addEventListener('click', event => {
    const dayBtn = event.target.closest && event.target.closest('[data-res-date]');
    if (dayBtn) { pickResDate(dayBtn.dataset.resDate); return; }
    const panel = document.getElementById('resDatePicker');
    if (!panel || panel.hidden) return;
    if (event.target.closest && !event.target.closest('.daterange-group')) toggleResDatePicker(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') toggleResDatePicker(false);
  });
}

async function saveBooking(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : '💾 Rezervasyonu Kaydet';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Kaydediliyor...';
  }

  try {
    const editId = document.getElementById('resEditId').value;
    const villa = document.getElementById('resVilla').value;
    const guest = document.getElementById('resGuest').value.trim();
    const guestPhone = document.getElementById('resGuestPhone')?.value.trim() || '';
    const guestEmail = document.getElementById('resGuestEmail')?.value.trim() || '';
    const guestLanguage = document.getElementById('resGuestLanguage')?.value || 'tr';
    const guestMarketingOptIn = document.getElementById('resGuestMarketingOptIn')?.checked === true;
    const checkIn = document.getElementById('resCheckIn').value;
    const checkOut = document.getElementById('resCheckOut').value;
    const channel = document.getElementById('resChannel').value;
    const status = document.getElementById('resStatus').value;
    const pax = normalizePositiveInteger(document.getElementById('resPax').value);

    if (pax === null) {
      throw new Error('Kişi sayısı pozitif bir tam sayı olmalıdır.');
    }

    // Tarihler artik gizli input; tarayici "required" dogrulamasi gizli
    // alanlara uygulanmaz, bu yuzden burada acikca kontrol edilir.
    if (!checkIn || !checkOut) {
      throw new Error('Konaklama tarihlerini seçin.');
    }
    if (calculateNightsBetween(checkIn, checkOut) <= 0) {
      throw new Error('Çıkış tarihi giriş tarihinden sonra olmalıdır.');
    }

    const economics = readBookingFormEconomics();
    const cleanFee = economics.cleanFee;
    // Bos alan = maliyet bilinmiyor (null), 0 degil.
    const hamMaliyet = (document.getElementById('resCleanCost') || {}).value;
    const cleanCost = hamMaliyet === '' || hamMaliyet === undefined || hamMaliyet === null ? null : economics.cleanCost;
    const paymentCommission = economics.paymentComm;
    const gross = economics.gross;
    const otaComm = economics.otaComm;

    if (cleanFee > gross) {
      throw new Error('Temizlik ücreti brüt tutardan büyük olamaz; brüt tutara dâhildir.');
    }

    const net = economics.netRoomRevenue;

    const bookingInput = {
      villa,
      guest,
      phone: guestPhone,
      checkIn,
      checkOut,
      channel,
      gross,
      otaComm,
      cleanFee,
      cleanCost,
      net,
      pax,
      status
    };

    const savedBooking = editId
      ? await updateBooking(editId, bookingInput)
      : await createBooking(bookingInput);

    // Rezervasyon kaydedildi. Temizlik gorevi ve odeme komisyonu ayri
    // tablolardadir (bookings'e sutun eklenmedi, CLAUDE.md 3.4); yazilamazlarsa
    // rezervasyon geri alinmaz, kullaniciya acikca soylenir.
    let ekUyari = await syncBookingCleaningTaskToCloud(savedBooking, cleanCost);
    ekUyari += await saveBookingPaymentCommission(savedBooking, paymentCommission);
    if (typeof renderAll === 'function') renderAll();

    let guestProfileWarning = ekUyari;
    if (guestPhone || guestEmail) {
      try {
        await linkBookingGuestProfile(savedBooking.id, {
          fullName: guest,
          phone: guestPhone,
          email: guestEmail,
          language: guestLanguage,
          marketingOptIn: guestMarketingOptIn
        });
      } catch (guestErr) {
        console.error('Guest profile link error:', guestErr);
        guestProfileWarning += '\n\nRezervasyon kaydedildi; ancak misafir profili bağlanamadı: ' + (guestErr.message || 'Bilinmeyen hata');
      }
    }

    closeBookingModal();
    if (typeof alert === 'function') alert('✅ Rezervasyon başarıyla kaydedildi!' + guestProfileWarning);
  } catch (err) {
    console.error('saveBooking error:', err);
    if (typeof alert === 'function') alert('Rezervasyon kaydedilemedi: ' + (err.message || 'Lütfen bilgileri kontrol edin.'));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

function editBooking(id) { openBookingModal(id); }

// -------------------------------------------------------------
// SETTINGS TABLE (PRICING TIERS)
// -------------------------------------------------------------
function renderSettingsGoalsTable() {
  const tbody = document.getElementById('settingsGoalsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  getGoalMonths().forEach(m => {
    const period = m.id;
    const saved = getTargetRecordForPeriod(period);
    // null (girilmemis) hedef NaN olur ve "—" yazilir; Number(null) = 0 degil.
    const sayi = v => (v === null || v === undefined || v === '') ? NaN : Number(v);
    const rev = saved ? sayi(saved.revenue ?? saved.revenue_target) : null;
    const netProfit = saved ? sayi(saved.netProfit ?? saved.net_profit_target) : null;
    const maxExpense = saved ? sayi(saved.maxExpense ?? saved.max_expense_target) : null;
    const occ = saved ? sayi(saved.occupancy ?? saved.occupancy_target) : null;
    const kap = getAvailableNightsForMonth(period);
    const nights = saved ? (Number.isFinite(sayi(saved.nights ?? saved.sold_nights_target))
      ? sayi(saved.nights ?? saved.sold_nights_target)
      : (Number.isFinite(occ) && kap > 0 ? Math.round(occ / 100 * kap) : NaN)) : null;
    const adr = saved ? sayi(saved.adr ?? saved.adr_target) : null;

    const isCurrent = (currentFilter.period === period);
    const tr = document.createElement('tr');
    if (isCurrent) {
      tr.style.background = 'rgba(59, 130, 246, 0.08)';
    }

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(m.name)}</strong>
        ${isCurrent ? ' <span class="badge badge-blue" style="font-size:10px; margin-left:4px;">Seçili Dönem</span>' : ''}
      </td>
      <td>
        <strong style="color: #60A5FA;">${Number.isFinite(rev) ? rev.toLocaleString('tr-TR') + ' TL' : '—'}</strong>
      </td>
      <td style="color: #34D399; font-weight: 600;">
        ${Number.isFinite(netProfit) ? netProfit.toLocaleString('tr-TR') + ' TL' : '—'}
      </td>
      <td>
        <span class="badge badge-amber">${Number.isFinite(occ) ? '%' + occ : '—'}${Number.isFinite(nights) ? ` (${nights} Gece)` : ''}</span>
      </td>
      <td>
        ${Number.isFinite(adr) ? adr.toLocaleString('tr-TR') + ' TL' : '—'}
      </td>
      <td style="color: #F87171;">
        ${Number.isFinite(maxExpense) ? maxExpense.toLocaleString('tr-TR') + ' TL' : '—'}
      </td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" data-onclick="openGoalsModal(decodeURIComponent('${encodeActionArg(period)}'))" style="padding: 4px 10px; font-size: 11px;">
          ✏️ Düzenle
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// 👥 EKİP VE ROL YÖNETİMİ (PHASE 16)
// Tum yetki kararlari sunucuda (RLS + SECURITY DEFINER RPC) verilir. Buradaki
// gizleme/gosterme yalnizca arayuz kolayligidir, guvenlik siniri DEGILDIR.
// =============================================================================

const TEAM_ROLES = {
  owner:   { label: 'Sahip',     badge: 'badge-purple',  hint: 'Tam yetki. Ekip ve rolleri yönetir, işletmeyi silebilir.' },
  admin:   { label: 'Yönetici',  badge: 'badge-blue',    hint: 'Davet gönderebilir, tüm verileri yönetir. Rol değiştiremez.' },
  manager: { label: 'Operasyon', badge: 'badge-emerald', hint: 'Rezervasyon, fiyatlama ve operasyonu yönetir.' },
  staff:   { label: 'Personel',  badge: 'badge-amber',   hint: 'Günlük operasyon görevlerini görür ve günceller.' },
  viewer:  { label: 'İzleyici',  badge: 'badge-rose',    hint: 'Yalnızca görüntüler, hiçbir veriyi değiştiremez.' }
};

function roleBadgeHtml(role) {
  const r = TEAM_ROLES[role] || { label: role, badge: 'badge-rose' };
  return `<span class="badge ${r.badge}">${escapeHtml(r.label)}</span>`;
}

/**
 * Kisa bildirim kutusu.
 *
 * Uygulamada 34 yerde cagriliyordu ama HIC TANIMLI DEGILDI. Cagrilarin hepsi
 * `if (typeof showToast === 'function')` ile korumali oldugu icin hata da
 * vermiyor, sessizce hicbir sey yapmiyorlardi: kullanici ay kapattiginda,
 * veriyi sifirladiginda ya da bir kayit olusturdugunda hicbir onay gormuyordu.
 *
 * @param {string} mesaj
 * @param {'success'|'error'|'info'} tur
 */
function showToast(mesaj, tur = 'info') {
  if (typeof document === 'undefined' || !document.body) return;

  let kap = document.getElementById('lexToastWrap');
  if (!kap) {
    kap = document.createElement('div');
    kap.id = 'lexToastWrap';
    kap.setAttribute('role', 'status');
    kap.setAttribute('aria-live', 'polite');
    kap.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;' +
      'display:flex;flex-direction:column;gap:8px;max-width:min(380px,calc(100vw - 36px));';
    document.body.appendChild(kap);
  }

  const renk = tur === 'success' ? '#34D399' : (tur === 'error' ? '#F87171' : '#60A5FA');
  const el = document.createElement('div');
  el.style.cssText = 'background:rgba(15,23,42,0.97);color:#E2E8F0;border:1px solid rgba(255,255,255,0.12);' +
    'border-left:3px solid ' + renk + ';border-radius:8px;padding:11px 14px;font-size:13px;line-height:1.45;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.45);opacity:0;transform:translateY(6px);' +
    'transition:opacity .18s ease,transform .18s ease;word-break:break-word;';
  // Ham sunucu mesaji kullaniciya gitmez (L-22).
  el.textContent = String(mesaj == null ? '' : kullaniciMesaji(mesaj));
  kap.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });

  const sure = tur === 'error' ? 7000 : 4000;
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
  }, sure);
}

/**
 * Bir elemanin metnini yazar; eleman yoksa sessizce gecer.
 *
 * Bu yardimci iki fonksiyonun ICINDE yerel olarak tanimliydi
 * (renderFinanceModule, renderKPIsAndDashboard). renderExecutiveControlCenter
 * de onu kullaniyordu ama kendi kapsaminda yoktu:
 *
 *   ReferenceError: setEl is not defined
 *     at renderExecutiveControlCenter
 *     at renderAll
 *     at loadTenantAppData        <-- catch bloguna dusuyordu
 *
 * Sonuc: oturum acan HER kullanicida veri yukleme catch'e dusuyor, appData
 * bos duruma cekiliyor ve "Isletme verileri yuklenemedi" uyarisi cikiyordu.
 * Node testleri renderAll'i hic calistirmadigi icin yakalanmamisti.
 */
function setEl(id, text) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function escapeHtml(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTeamDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function renderTeamManagement() {
  const memberBody = document.getElementById('teamMembersTableBody');
  const inviteWrap = document.getElementById('pendingInvitationsWrap');
  const inviteBody = document.getElementById('pendingInvitationsTableBody');
  const inviteBtn = document.getElementById('inviteMemberBtn');
  if (!memberBody) return;

  const tenantId = getActiveTenantId();

  // Demo / yerel kum havuzunda bulut ekibi yoktur.
  if (!isCloudTenant(tenantId)) {
    memberBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:22px;" class="sub-text">
      Ekip yönetimi bulut hesabına özeldir. Demo modunda kullanılamaz.</td></tr>`;
    if (inviteWrap) inviteWrap.style.display = 'none';
    if (inviteBtn) inviteBtn.style.display = 'none';
    return;
  }

  memberBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:22px;" class="sub-text">Ekip yükleniyor…</td></tr>`;

  const { data: members, error: memErr } = await supabaseClient.rpc('get_tenant_members', { p_tenant_id: tenantId });

  if (memErr) {
    memberBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:22px; color:#FCA5A5;">
      Ekip listesi yüklenemedi: ${escapeHtml(memErr.message)}</td></tr>`;
    return;
  }

  const myRole = (activeTenant && activeTenant.role) || 'viewer';
  const canManageRoles = myRole === 'owner';
  const canInvite = myRole === 'owner' || myRole === 'admin';
  const ownerCount = (members || []).filter(m => m.role === 'owner').length;

  if (inviteBtn) inviteBtn.style.display = canInvite ? '' : 'none';

  memberBody.innerHTML = (members || []).map(m => {
    const isLastOwner = m.role === 'owner' && ownerCount === 1;

    // NOT: Satir ici onclick'e veri gomulmez. escapeHtml kesme isaretini &#39;
    // yapar, tarayici HTML varliklarini JS ayristirmasindan ONCE cozer ve
    // o'brien@x.com gibi gecerli bir adres handler'i kirardi. Veri data-*
    // niteliginde tasinir, olaylar asagida delegasyonla baglanir.
    let roleCell;
    if (canManageRoles && !m.is_self && !isLastOwner) {
      const opts = Object.keys(TEAM_ROLES).map(k =>
        `<option value="${k}"${k === m.role ? ' selected' : ''}>${escapeHtml(TEAM_ROLES[k].label)}</option>`
      ).join('');
      roleCell = `<select data-action="role" data-user="${escapeHtml(m.user_id)}"
        style="padding:6px 8px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.15);
        border-radius:6px; color:#fff; font-size:12px; font-weight:600;">${opts}</select>`;
    } else {
      roleCell = roleBadgeHtml(m.role) + (isLastOwner
        ? ' <span class="sub-text" style="font-size:10px;">(tek sahip)</span>' : '');
    }

    const canRemove = canManageRoles && !m.is_self && !isLastOwner;
    const actionCell = canRemove
      ? `<button class="btn btn-secondary btn-sm" data-action="remove"
           data-user="${escapeHtml(m.user_id)}" data-email="${escapeHtml(m.email)}">Çıkar</button>`
      : '<span class="sub-text" style="font-size:11px;">—</span>';

    return `<tr>
      <td><strong>${escapeHtml(m.full_name)}</strong>${m.is_self ? ' <span class="sub-text" style="font-size:10px;">(siz)</span>' : ''}</td>
      <td>${escapeHtml(m.email)}</td>
      <td>${roleCell}</td>
      <td>${formatTeamDate(m.joined_at)}</td>
      <td style="text-align:right;">${actionCell}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5" style="text-align:center; padding:22px;" class="sub-text">Henüz ekip üyesi yok.</td></tr>`;

  // Erken return yollarindan once bagla; uye tablosu her durumda calissin.
  bindTeamTableEvents();

  // Bekleyen davetler yalnizca owner/admin icin
  if (!canInvite) {
    if (inviteWrap) inviteWrap.style.display = 'none';
    return;
  }

  const { data: invites, error: invErr } = await supabaseClient.rpc('get_tenant_invitations', { p_tenant_id: tenantId });

  if (invErr || !invites || invites.length === 0) {
    if (inviteWrap) inviteWrap.style.display = 'none';
    return;
  }

  if (inviteWrap) inviteWrap.style.display = 'block';
  if (inviteBody) {
    inviteBody.innerHTML = invites.map(i => `<tr>
      <td>${escapeHtml(i.email)}</td>
      <td>${roleBadgeHtml(i.role)}</td>
      <td>${formatTeamDate(i.created_at)}</td>
      <td>${i.expired
        ? '<span class="badge badge-rose">Süresi doldu</span>'
        : formatTeamDate(i.expires_at) + ' tarihine kadar'}</td>
      <td style="text-align:right;">
        <button class="btn btn-secondary btn-sm" data-action="revoke"
          data-invite="${escapeHtml(i.id)}" data-email="${escapeHtml(i.email)}">İptal Et</button>
      </td>
    </tr>`).join('');
    bindTeamTableEvents();
  }
}

// Olay delegasyonu: satirlar her tazelemede yeniden uretildigi icin
// dinleyiciler tbody uzerinde tutulur, her satira ayri ayri baglanmaz.
function bindTeamTableEvents() {
  const memberBody = document.getElementById('teamMembersTableBody');
  const inviteBody = document.getElementById('pendingInvitationsTableBody');

  if (memberBody && !memberBody.dataset.bound) {
    memberBody.dataset.bound = '1';
    memberBody.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-action="role"]');
      if (el) changeMemberRole(el.dataset.user, el.value);
    });
    memberBody.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action="remove"]');
      if (el) removeTeamMember(el.dataset.user, el.dataset.email);
    });
  }

  if (inviteBody && !inviteBody.dataset.bound) {
    inviteBody.dataset.bound = '1';
    inviteBody.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action="revoke"]');
      if (el) revokeMemberInvite(el.dataset.invite, el.dataset.email);
    });
  }
}

// =============================================================================
// ⚠️ HESAP KAPATMA (PHASE 18 — KVKK / GDPR)
// Silme kararini ve kapsamini SUNUCU verir; buradaki onizleme yalnizca
// kullanicinin ne kaybedecegini gormesi icindir.
// =============================================================================

const DELETE_ACCOUNT_PHRASE = 'HESABIMI SIL';

function describeDeletionImpact(impact) {
  const del = (impact && impact.tenants_to_delete) || [];
  const leave = (impact && impact.tenants_to_leave) || [];
  const parts = [];

  if (del.length) {
    const rows = del.map(t =>
      `<li><strong>${escapeHtml(t.name)}</strong> — ${t.properties} mülk, ${t.bookings} rezervasyon, ${t.members} üye</li>`
    ).join('');
    parts.push(
      `<div style="color:#FCA5A5; margin-bottom:10px;">
         <strong>Kalıcı olarak silinecek işletmeler</strong> (tek sahibi sizsiniz):
         <ul style="margin:6px 0 0 18px; padding:0;">${rows}</ul>
       </div>`
    );
  }

  if (leave.length) {
    const rows = leave.map(t =>
      `<li>${escapeHtml(t.name)} <span class="sub-text" style="font-size:11px;">(${escapeHtml(t.role)})</span></li>`
    ).join('');
    parts.push(
      `<div style="color:#93C5FD;">
         <strong>Yalnızca üyeliğiniz kaldırılacak</strong> (işletme ve verisi kalır):
         <ul style="margin:6px 0 0 18px; padding:0;">${rows}</ul>
       </div>`
    );
  }

  if (!parts.length) {
    parts.push('<span class="sub-text">Bu hesaba bağlı bir işletme yok. Yalnızca hesabınız silinecek.</span>');
  }
  return parts.join('');
}

async function loadDeletionImpact() {
  const box = document.getElementById('deletionImpactBox');
  const card = document.getElementById('dangerZoneCard');
  if (!box) return null;

  // Demo / yerel kum havuzunda kapatilacak bulut hesabi yoktur.
  if (!isCloudTenant(getActiveTenantId())) {
    if (card) card.style.display = 'none';
    return null;
  }
  if (card) card.style.display = '';

  const { data, error } = await supabaseClient.rpc('get_account_deletion_impact');
  if (error) {
    box.innerHTML = `<span style="color:#FCA5A5;">Etki bilgisi alınamadı: ${escapeHtml(error.message)}</span>`;
    return null;
  }

  const del = (data && data.tenants_to_delete) || [];
  box.innerHTML = del.length
    ? `Hesabınızı kapatırsanız <strong style="color:#FCA5A5;">${del.length} işletme</strong> ve tüm verisi kalıcı olarak silinir.`
    : 'Hesabınızı kapatırsanız yalnızca hesabınız silinir; işletmeler diğer sahiplerinde kalır.';
  return data;
}

async function openDeleteAccountModal() {
  const modal = document.getElementById('deleteAccountModal');
  if (!modal) return;

  const input = document.getElementById('deleteAccountConfirm');
  const err = document.getElementById('deleteAccountError');
  const detail = document.getElementById('deleteAccountImpact');
  if (input) input.value = '';
  if (err) err.style.display = 'none';
  updateDeleteAccountButton();

  modal.classList.add('active');
  if (detail) detail.innerHTML = 'Yükleniyor…';

  const { data, error } = await supabaseClient.rpc('get_account_deletion_impact');
  if (detail) {
    detail.innerHTML = error
      ? `<span style="color:#FCA5A5;">Etki bilgisi alınamadı: ${escapeHtml(error.message)}</span>`
      : describeDeletionImpact(data);
  }
  setTimeout(() => input && input.focus(), 80);
}

function closeDeleteAccountModal() {
  const modal = document.getElementById('deleteAccountModal');
  if (modal) modal.classList.remove('active');
}

// =============================================================
// AY KAPANISI ARAYUZU
// =============================================================
// Bu ozellik veritabaninda bastan beri vardi (close_monthly_period_atomic,
// koruma tetikleyicileri) ama arayuzde HICBIR giris noktasi yoktu: hicbir
// yerden cagrilmiyordu. Ustelik loadTenantAppData() kapanislari cekmedigi
// icin isPeriodClosed() her zaman false donuyordu.

/** Secili donemin kapanis kaydi (yoksa null). */
function getCurrentPeriodClose() {
  if (typeof currentFilter === 'undefined' || !currentFilter) return null;
  const p = currentFilter.period || '';
  if (!/^\d{4}-\d{2}$/.test(p)) return null;
  const y = parseInt(p.slice(0, 4), 10);
  const m = parseInt(p.slice(5, 7), 10);
  const list = (appData && appData.closedPeriods) ? appData.closedPeriods : [];
  return list.find(cp => Number(cp.year) === y && Number(cp.month) === m) || null;
}

function canManageMonthClose() {
  const rol = (typeof activeTenant !== 'undefined' && activeTenant && activeTenant.role) || 'viewer';
  return ['owner', 'admin', 'manager'].includes(rol);
}

function canReopenMonthClose() {
  const rol = (typeof activeTenant !== 'undefined' && activeTenant && activeTenant.role) || 'viewer';
  return ['owner', 'admin'].includes(rol);
}

function renderMonthCloseCard() {
  const kart = document.getElementById('monthCloseCard');
  if (!kart) return;

  const rozet = document.getElementById('monthCloseBadge');
  const detay = document.getElementById('monthCloseDetail');
  const kapatBtn = document.getElementById('monthCloseBtn');
  const acBtn = document.getElementById('monthReopenBtn');
  const gecmis = document.getElementById('monthCloseHistory');
  const p = (typeof currentFilter !== 'undefined' && currentFilter) ? currentFilter.period : '';

  // Ay disi filtrelerde (ALL, yil, ozel aralik) kapanis islemi anlamsiz.
  if (!/^\d{4}-\d{2}$/.test(p || '')) {
    kart.hidden = true;
    return;
  }
  kart.hidden = false;

  const kayit = getCurrentPeriodClose();
  const kapali = !!(kayit && kayit.status === 'CLOSED');
  const ayAdi = formatPeriodLabel(p);

  if (rozet) {
    rozet.textContent = kapali ? 'KAPALI' : 'AÇIK';
    rozet.style.background = kapali ? 'rgba(239,68,68,0.18)' : 'rgba(52,211,153,0.15)';
    rozet.style.color = kapali ? '#FCA5A5' : '#6EE7B7';
  }

  if (detay) {
    if (kapali) {
      const t = kayit.closed_at ? new Date(kayit.closed_at).toLocaleString('tr-TR') : '—';
      let metin = `${ayAdi} kapatıldı (${t}). Bu döneme ait rezervasyon ve gider kayıtları değiştirilemez.`;
      if (kayit.client_matches_server === false) {
        metin += ' ⚠️ Kapanış anında ekrandaki rakam ile sunucunun hesabı farklıydı; kayıtta ikisi de saklı.';
      }
      detay.textContent = metin;
    } else if (kayit) {
      const t = kayit.reopened_at ? new Date(kayit.reopened_at).toLocaleString('tr-TR') : '—';
      detay.textContent = `${ayAdi} daha önce kapatılmış, ${t} tarihinde yeniden açılmış. Kayıtlar düzenlenebilir.`;
    } else {
      detay.textContent = `${ayAdi} açık. Ay bittikten sonra kapatarak rakamları mühürleyebilirsiniz.`;
    }
  }

  const yetkili = canManageMonthClose();
  const gelecek = periodStartsInFuture(p);
  // Icinde bulunulan ay bitmeden kapatilamaz (phase43, PERIOD_NOT_ENDED;
  // "bugun" Europe/Istanbul). Dugme bunu sunucuya sormadan soyler (L-08).
  const suruyor = !gelecek && p === getTodayStr().slice(0, 7);

  if (kapatBtn) {
    kapatBtn.hidden = kapali;
    kapatBtn.disabled = !yetkili || gelecek || suruyor;
    kapatBtn.title = !yetkili
      ? 'Dönem kapatmak için yönetici yetkisi gerekir.'
      : (gelecek ? 'Henüz başlamamış bir dönem kapatılamaz.'
        : (suruyor ? 'İçinde bulunulan ay bitmeden kapatılamaz; ayın son gününden sonra kapatabilirsiniz.' : ''));
  }
  if (detay && !kapali && !kayit && suruyor) {
    detay.textContent = `${ayAdi} devam ediyor. Ay bittikten sonra (ayın son gününden sonra) kapatarak rakamları mühürleyebilirsiniz.`;
  }
  if (acBtn) {
    acBtn.hidden = !kapali;
    acBtn.disabled = !canReopenMonthClose();
    acBtn.title = canReopenMonthClose() ? '' : 'Dönemi yeniden açmak için işletme sahibi veya yönetici olmalısınız.';
  }

  if (gecmis) {
    const kayitlar = (kayit && Array.isArray(kayit.history_json)) ? kayit.history_json : [];
    if (!kayitlar.length) {
      gecmis.textContent = '';
    } else {
      gecmis.innerHTML = kayitlar.slice(-4).map(h => {
        const ne = h.action === 'REOPENED' ? 'Yeniden açıldı' : 'Kapatıldı';
        const ne2 = h.at ? new Date(h.at).toLocaleString('tr-TR') : '—';
        const gerekce = h.reason ? ' — ' + escapeHtml(String(h.reason)) : '';
        return `• ${ne}: ${escapeHtml(ne2)}${gerekce}`;
      }).join('<br>');
    }
  }
}

/**
 * Donem secicilerini MUSTERININ KENDI VERISINDEN uretir.
 *
 * Iki secici de (globalPeriodFilter, rezPeriodFilter) 2025-07 ... 2027-12
 * arasinda SABIT yaziliydi ve etiketleri ilk musterinin takvimini anlatiyordu
 * ("2026 YILI (Resmi Veriler & Aktif Sezon)", "Aralik 2027 (Yilbasi 2028)").
 * 2024 verisiyle gelen bir musteri o aylari hic secemezdi; 2028'e gelindiginde
 * de liste biterdi.
 *
 * Kural: en eski kayittan, bugunden 12 ay sonrasina kadar. Veri yoksa
 * icinde bulunulan yilin tamami.
 */
function refreshPeriodSelectors() {
  if (typeof document === 'undefined') return;

  // Tek kaynak: ay araligi computeFinancialMonthRange() ile hesaplanir; ay
  // adimlayici, hedefler ve tape chart da ayni listeyi kullanir.
  ALL_FINANCIAL_MONTHS = computeFinancialMonthRange();
  const aylar = ALL_FINANCIAL_MONTHS;
  const bugun = getTodayStr().slice(0, 7);

  const yillar = [];
  aylar.forEach(ym => {
    const y = ym.slice(0, 4);
    let grup = yillar.find(g => g.yil === y);
    if (!grup) { grup = { yil: y, aylar: [] }; yillar.push(grup); }
    grup.aylar.push({ deger: ym, etiket: formatPeriodLabel(ym) });
  });

  const ilkEtiket = aylar.length
    ? `${formatPeriodLabel(aylar[0])} – Günümüz`
    : 'Tüm Zamanlar';

  function kur(id, ustSecenekler) {
    const el = document.getElementById(id);
    if (!el) return;
    const onceki = el.value;
    const parcalar = [ustSecenekler];
    yillar.forEach(g => {
      parcalar.push(`<optgroup label="${g.yil}">` +
        g.aylar.map(a => `<option value="${a.deger}">${a.etiket}</option>`).join('') +
        '</optgroup>');
    });
    el.innerHTML = parcalar.join('');
    // Onceki secim hala listede varsa korunur; yoksa icinde bulunulan aya duser.
    if (onceki && el.querySelector(`option[value="${onceki}"]`)) el.value = onceki;
    else if (el.querySelector(`option[value="${bugun}"]`)) el.value = bugun;
  }

  const yilSecenekleri = yillar
    .map(g => `<option value="${g.yil}-YEAR">${g.yil} Yılı Tamamı</option>`).join('');

  kur('globalPeriodFilter',
    '<optgroup label="GENEL &amp; TARİH ARALIKLARI">' +
    `<option value="ALL">Tüm Zamanlar (${ilkEtiket})</option>` +
    yilSecenekleri +
    '<option value="CUSTOM">Özel Tarih Aralığı Seç…</option>' +
    '</optgroup>');

  kur('rezPeriodFilter',
    '<optgroup label="GENEL">' +
    '<option value="ALL">Tüm Rezervasyonlar</option>' +
    '<option value="UPCOMING">Gelecek &amp; Aktif Rezervasyonlar</option>' +
    '</optgroup>');
}

/**
 * Bugunun tarihi, 'YYYY-MM-DD'.
 *
 * Uygulamada "bugun" 20 ayri yerde 2026-09-07 olarak SABIT yaziliydi.
 * Yalnizca goruntuyu degil KAYITLARI da bozuyordu: bir temizlik odemesi
 * isaretlendiginde odeme tarihi gercek gun ne olursa olsun 2026-09-07 olarak
 * yaziliyordu. Musteri kendi odeme gecmisini yanlis goruyordu.
 *
 * Yerel saat dilimine gore hesaplanir; toISOString() UTC'ye cevirdigi icin
 * aksam saatlerinde bir onceki gunu verebiliyor.
 */
/**
 * Icinde bulunulan ay, `YYYY-MM`. "Bugün"un tek kaynagi getTodayStr()
 * oldugu gibi, "bu ay"in tek kaynagi da budur.
 *
 * Sabit '2026-09' alti ayri yerde yaziliydi ve takvim ilerledikce uygulama
 * gecmis bir ayi "guncel" gostermeye devam ediyordu (3.6). Tarih taramasi
 * 10 karakterli YYYY-MM-DD ariyordu, 7 karakterli YYYY-MM gozden kacmisti.
 */
function getCurrentMonthKey() {
  return getTodayStr().slice(0, 7);
}

function getTodayStr() {
  const timezone = 'Europe/Istanbul';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch (_) {
    // Invalid tenant timezones never fall back to the browser's local zone.
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  }
}

/** 'YYYY-MM' -> 'Nisan 2026' */
function formatPeriodLabel(p) {
  if (!/^\d{4}-\d{2}$/.test(p || '')) return p || '—';
  const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${aylar[parseInt(p.slice(5, 7), 10) - 1]} ${p.slice(0, 4)}`;
}

/** Donem henuz baslamadi mi? Sunucu da bunu reddeder. */
function periodStartsInFuture(p) {
  if (!/^\d{4}-\d{2}$/.test(p || '')) return false;
  // "Bugun" tek kaynaktan (Europe/Istanbul); tarayicinin yerel saati ay
  // sinirinda sunucunun PERIOD_NOT_ENDED kararindan ayrisirdi.
  const bugun = getTodayStr();
  const buAy = parseInt(bugun.slice(0, 4), 10) * 12 + (parseInt(bugun.slice(5, 7), 10) - 1);
  const hedef = parseInt(p.slice(0, 4), 10) * 12 + (parseInt(p.slice(5, 7), 10) - 1);
  return hedef > buAy;
}

function openMonthCloseModal() {
  const modal = document.getElementById('monthCloseModal');
  if (!modal) return;
  const err = document.getElementById('monthCloseError');
  const ozet = document.getElementById('monthCloseSummary');
  const btn = document.getElementById('monthCloseSubmitBtn');
  if (err) err.style.display = 'none';
  if (btn) btn.disabled = false;

  const p = currentFilter.period;
  if (ozet) {
    const bkl = (appData.bookings || []).filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
    const geceler = bkl.reduce((a, b) => a + getBookingFilterShare(b).nights, 0);
    const ciro = bkl.reduce((a, b) => a + (Number(b.gross) || 0) * getBookingFilterShare(b).ratio, 0);
    const gid = (appData.expenses || []).filter(e => isExpenseInFilter(e));
    const gidTop = gid.reduce((a, e) => a + (Number(e.amount) || 0), 0);
    ozet.innerHTML = `
      <div style="font-weight:700; margin-bottom:8px;">${escapeHtml(formatPeriodLabel(p))}</div>
      <div>Rezervasyon: <strong>${bkl.length}</strong> &nbsp;•&nbsp; Satılan gece: <strong>${geceler}</strong></div>
      <div>Ciro (tahakkuk): <strong>${Math.round(ciro).toLocaleString('tr-TR')} TL</strong></div>
      <div>Gider kaydı: <strong>${gid.length}</strong> &nbsp;•&nbsp; <strong>${Math.round(gidTop).toLocaleString('tr-TR')} TL</strong></div>
      <p class="sub-text" style="font-size:10px; margin:10px 0 0;">
        Bu rakamlar ekrandaki hesaptır. Kaydedilecek resmî rakam kapanış anında sunucuda yeniden hesaplanır.
      </p>`;
  }
  modal.classList.add('active');
}

function closeMonthCloseModal() {
  const modal = document.getElementById('monthCloseModal');
  if (modal) modal.classList.remove('active');
}

async function submitMonthClose(event) {
  if (event && event.preventDefault) event.preventDefault();
  const err = document.getElementById('monthCloseError');
  const btn = document.getElementById('monthCloseSubmitBtn');
  const p = currentFilter.period;
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Kapatılıyor…'; }

  try {
    const sonuc = await closeMonthlyPeriod(parseInt(p.slice(0, 4), 10), parseInt(p.slice(5, 7), 10));
    closeMonthCloseModal();
    if (typeof showToast === 'function') {
      const uyari = (sonuc && sonuc.client_matches_server === false)
        ? ' Ekrandaki rakamla sunucunun hesabı farklıydı; kayıtta ikisi de saklandı.'
        : '';
      showToast(`${formatPeriodLabel(p)} kapatıldı.` + uyari, uyari ? 'info' : 'success');
    }
  } catch (e) {
    if (err) { err.textContent = e.message || 'Dönem kapatılamadı.'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Dönemi Kapat'; }
  }
}

function openMonthReopenModal() {
  const modal = document.getElementById('monthReopenModal');
  if (!modal) return;
  const ta = document.getElementById('monthReopenReason');
  const err = document.getElementById('monthReopenError');
  if (ta) ta.value = '';
  if (err) err.style.display = 'none';
  updateMonthReopenButton();
  modal.classList.add('active');
  setTimeout(() => ta && ta.focus(), 80);
}

function closeMonthReopenModal() {
  const modal = document.getElementById('monthReopenModal');
  if (modal) modal.classList.remove('active');
}

function updateMonthReopenButton() {
  const ta = document.getElementById('monthReopenReason');
  const btn = document.getElementById('monthReopenSubmitBtn');
  const sayac = document.getElementById('monthReopenCharCount');
  const n = ta ? ta.value.trim().length : 0;
  if (sayac) sayac.textContent = String(n);
  if (btn) btn.disabled = n < 10;
}

async function submitMonthReopen(event) {
  if (event && event.preventDefault) event.preventDefault();
  const ta = document.getElementById('monthReopenReason');
  const err = document.getElementById('monthReopenError');
  const btn = document.getElementById('monthReopenSubmitBtn');
  const p = currentFilter.period;
  if (err) err.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Açılıyor…'; }

  try {
    await reopenMonthlyPeriod(parseInt(p.slice(0, 4), 10), parseInt(p.slice(5, 7), 10), ta ? ta.value : '');
    closeMonthReopenModal();
    if (typeof showToast === 'function') showToast(`${formatPeriodLabel(p)} yeniden açıldı. İşlem denetim kaydına işlendi.`, 'success');
  } catch (e) {
    if (err) { err.textContent = e.message || 'Dönem yeniden açılamadı.'; err.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = 'Dönemi Yeniden Aç'; }
    updateMonthReopenButton();
  }
}

// Onay metni birebir yazilmadan buton acilmaz. Sunucu da ayrica dogrular.
function updateDeleteAccountButton() {
  const input = document.getElementById('deleteAccountConfirm');
  const btn = document.getElementById('deleteAccountSubmitBtn');
  if (!btn) return;
  const typed = (input && input.value ? input.value : '').trim().toUpperCase();
  btn.disabled = typed !== DELETE_ACCOUNT_PHRASE;
}

async function submitAccountDeletion(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('deleteAccountConfirm');
  const btn = document.getElementById('deleteAccountSubmitBtn');
  const err = document.getElementById('deleteAccountError');
  const phrase = (input && input.value ? input.value : '').trim().toUpperCase();

  if (err) err.style.display = 'none';
  if (phrase !== DELETE_ACCOUNT_PHRASE) {
    if (err) { err.style.display = 'block'; err.innerText = '⚠️ Onay metnini birebir yazın.'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.innerText = '⏳ Siliniyor...'; }

  try {
    const { data, error } = await supabaseClient.rpc('delete_my_account', { p_confirmation: phrase });
    if (error) {
      if (err) { err.style.display = 'block'; err.innerText = '⚠️ ' + error.message; }
      return;
    }

    // Yerel izleri temizle ve giris ekranina don.
    try { await supabaseClient.auth.signOut(); } catch (ex) {}
    try { clearLexbnbBrowserStorage(); } catch (ex) {}

    const n = (data && data.deleted_tenants) || 0;
    alert(`Hesabınız kalıcı olarak kapatıldı.${n ? `\n${n} işletme ve tüm verisi silindi.` : ''}\n\nİlginiz için teşekkür ederiz.`);
    window.location.replace(window.location.pathname);
  } catch (ex) {
    if (err) { err.style.display = 'block'; err.innerText = '⚠️ ' + (ex && ex.message ? ex.message : 'Hesap kapatılamadı.'); }
  } finally {
    if (btn) { btn.innerText = 'Hesabımı Kalıcı Olarak Sil'; updateDeleteAccountButton(); }
  }
}

function updateInviteRoleHint() {
  const sel = document.getElementById('inviteMemberRole');
  const hint = document.getElementById('inviteRoleHint');
  if (!sel || !hint) return;
  const r = TEAM_ROLES[sel.value];
  hint.textContent = r ? r.hint : '';
}

function openInviteMemberModal() {
  const modal = document.getElementById('inviteMemberModal');
  if (!modal) return;

  const emailInput = document.getElementById('inviteMemberEmail');
  const roleSelect = document.getElementById('inviteMemberRole');
  const err = document.getElementById('inviteMemberError');
  if (emailInput) emailInput.value = '';
  if (err) err.style.display = 'none';

  // Admin, 'admin' rolunde davet gonderemez (sunucu da reddeder).
  const myRole = (activeTenant && activeTenant.role) || 'viewer';
  if (roleSelect) {
    const adminOpt = roleSelect.querySelector('option[value="admin"]');
    if (adminOpt) adminOpt.disabled = (myRole !== 'owner');
    if (myRole !== 'owner' && roleSelect.value === 'admin') roleSelect.value = 'manager';
  }

  updateInviteRoleHint();
  modal.classList.add('active');
  setTimeout(() => emailInput && emailInput.focus(), 80);
}

function closeInviteMemberModal() {
  const modal = document.getElementById('inviteMemberModal');
  if (modal) modal.classList.remove('active');
}

function showInviteError(message) {
  const err = document.getElementById('inviteMemberError');
  if (!err) { alert(message); return; }
  err.style.display = 'block';
  err.innerText = '⚠️ ' + message;
}

async function submitMemberInvite(e) {
  if (e) e.preventDefault();
  const email = (document.getElementById('inviteMemberEmail')?.value || '').trim().toLowerCase();
  const role = document.getElementById('inviteMemberRole')?.value || 'viewer';
  const btn = document.getElementById('inviteMemberSubmitBtn');
  const err = document.getElementById('inviteMemberError');
  if (err) err.style.display = 'none';

  if (!email.includes('@')) {
    showInviteError('Geçerli bir e-posta adresi girin.');
    return;
  }

  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    showInviteError('Ekip yönetimi bulut hesabına özeldir.');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerText = '⏳ Gönderiliyor...'; }

  try {
    const { error } = await supabaseClient.rpc('create_tenant_invitation', {
      p_tenant_id: tenantId, p_email: email, p_role: role
    });
    if (error) { showInviteError(error.message); return; }

    closeInviteMemberModal();
    await renderTeamManagement();
    alert(`✉️ Davet oluşturuldu ve e-posta teslim kuyruğuna alındı.\n\n${email} bu adresle kayıt olup giriş yaptığında ekibinize otomatik katılacak.\nDavet 14 gün geçerlidir.`);
  } catch (ex) {
    showInviteError(ex && ex.message ? ex.message : 'Davet gönderilemedi.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '✉️ Daveti Gönder'; }
  }
}

async function changeMemberRole(userId, newRole) {
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return;

  const { error } = await supabaseClient
    .from('tenant_members')
    .update({ role: newRole })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  if (error) {
    alert('⚠️ Rol değiştirilemedi: ' + error.message);
  }
  // Basarili da olsa hatali da olsa listeyi sunucudan tazele: acilir menu
  // asla sunucudaki gercek rolden farkli bir sey gostermesin.
  await renderTeamManagement();
}

async function removeTeamMember(userId, email) {
  if (!confirm(`${email} adlı kullanıcıyı ekipten çıkarmak istediğinize emin misiniz?\n\nBu kişi işletme verilerine anında erişimini kaybeder.`)) return;

  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) return;

  const { error } = await supabaseClient
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  if (error) {
    alert('⚠️ Üye çıkarılamadı: ' + error.message);
    return;
  }
  await renderTeamManagement();
}

async function revokeMemberInvite(invitationId, email) {
  if (!confirm(`${email} adresine gönderilen daveti iptal etmek istiyor musunuz?`)) return;

  const { error } = await supabaseClient.rpc('revoke_tenant_invitation', { p_invitation_id: invitationId });
  if (error) {
    alert('⚠️ Davet iptal edilemedi: ' + error.message);
    return;
  }
  await renderTeamManagement();
}

function canManageBookingChannels() {
  return ['owner', 'admin', 'manager'].includes(String(activeTenant?.role || '').toLowerCase());
}

function setBookingChannelMessage(message, type = 'info') {
  if (typeof showToast === 'function') showToast(message, type);
  else if (typeof alert === 'function') alert(message);
}

async function refreshBookingChannelSettings() {
  const result = await loadTenantBookingChannels(getActiveTenantId());
  appData.bookingChannels = result.rows;
  appData.bookingChannelSchemaReady = result.schemaReady;
  renderBookingChannelSettings();
  refreshBookingChannelDropdown();
}

function toggleNewBookingChannelRate() {
  const type = document.getElementById('newBookingChannelType')?.value || 'OTA';
  const input = document.getElementById('newBookingChannelRate');
  if (!input) return;
  input.disabled = type === 'DIRECT';
  if (type === 'DIRECT') input.value = '0';
}

function toggleBookingChannelRowRate(channelId) {
  const type = document.getElementById(`bookingChannelType_${channelId}`)?.value || 'DIRECT';
  const input = document.getElementById(`bookingChannelRate_${channelId}`);
  if (!input) return;
  input.disabled = type === 'DIRECT' || !canManageBookingChannels();
  if (type === 'DIRECT') input.value = '0';
}

function renderBookingChannelSettings() {
  const tbody = document.getElementById('bookingChannelSettingsBody');
  const addForm = document.getElementById('bookingChannelAddForm');
  const notice = document.getElementById('bookingChannelSchemaNotice');
  if (!tbody) return;
  const canEdit = canManageBookingChannels();
  const schemaReady = appData.bookingChannelSchemaReady === true;
  if (addForm) addForm.style.display = canEdit && schemaReady ? 'grid' : 'none';
  if (notice) {
    notice.style.display = schemaReady ? 'none' : 'block';
    notice.innerText = 'Kanal ayarları göçü henüz uygulanmadı. Rezervasyon formu mevcut güvenli varsayılanlarla çalışmaya devam eder; kalıcı değişiklik yapılamaz.';
  }
  const channels = getBookingChannelCatalog().slice().sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return String(a.displayName).localeCompare(String(b.displayName), 'tr');
  });
  tbody.innerHTML = channels.map(channel => {
    const id = channel.id || `fallback_${channel.code}`;
    const disabled = !canEdit || !schemaReady || !channel.id;
    const typeDisabled = disabled || channel.isSystem;
    return `<tr style="${channel.isActive ? '' : 'opacity:.6;'}">
      <td><input class="tbl-input" id="bookingChannelName_${id}" maxlength="100" value="${escapeHtml(channel.displayName)}" ${disabled ? 'disabled' : ''}><br><small>${escapeHtml(channel.code)}${channel.isSystem ? ' · Sistem kanalı' : ' · Özel kanal'}</small></td>
      <td><select class="tbl-input" id="bookingChannelType_${id}" data-onchange="toggleBookingChannelRowRate(decodeURIComponent('${encodeActionArg(id)}'))" ${typeDisabled ? 'disabled' : ''}><option value="OTA" ${channel.channelType === 'OTA' ? 'selected' : ''}>OTA</option><option value="DIRECT" ${channel.channelType === 'DIRECT' ? 'selected' : ''}>Direkt</option></select></td>
      <td><input class="tbl-input" id="bookingChannelRate_${id}" type="number" min="0" max="100" step="0.01" value="${Number(channel.defaultCommissionRate)}" ${(disabled || channel.channelType === 'DIRECT') ? 'disabled' : ''}></td>
      <td><span class="badge ${channel.isActive ? 'badge-green' : 'badge-slate'}">${channel.isActive ? 'AKTİF' : 'PASİF'}</span></td>
      <td style="text-align:right; white-space:nowrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="saveBookingChannelRow(event, decodeURIComponent('${encodeActionArg(channel.id || '')}'))" ${disabled ? 'disabled' : ''}>Kaydet</button>
        <button type="button" class="btn ${channel.isActive ? 'btn-danger' : 'btn-secondary'} btn-sm" data-onclick="setBookingChannelActive(decodeURIComponent('${encodeActionArg(channel.id || '')}'), ${channel.isActive ? 'false' : 'true'})" ${disabled ? 'disabled' : ''}>${channel.isActive ? 'Kaldır' : 'Etkinleştir'}</button>
      </td>
    </tr>`;
  }).join('');
}

async function saveBookingChannelRow(clickEvent, channelId) {
  const channel = (appData.bookingChannels || []).find(item => item.id === channelId);
  if (!channel) return;
  const id = channel.id;
  const button = clickEvent?.currentTarget || null;
  if (button) button.disabled = true;
  try {
    await saveTenantBookingChannel({
      id,
      displayName: document.getElementById(`bookingChannelName_${id}`)?.value,
      channelType: document.getElementById(`bookingChannelType_${id}`)?.value || channel.channelType,
      defaultCommissionRate: document.getElementById(`bookingChannelRate_${id}`)?.value,
      isActive: channel.isActive
    });
    await refreshBookingChannelSettings();
    setBookingChannelMessage('Kanal ve komisyon ayarı kaydedildi.', 'success');
  } catch (error) {
    setBookingChannelMessage('Kanal ayarı kaydedilemedi: ' + (error.message || 'Bilinmeyen hata'), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function setBookingChannelActive(channelId, isActive) {
  const channel = (appData.bookingChannels || []).find(item => item.id === channelId);
  if (!channel) return;
  if (!isActive && typeof confirm === 'function' && !confirm(`${channel.displayName} yeni rezervasyonlardan kaldırılacak. Eski rezervasyonlar korunur. Devam edilsin mi?`)) return;
  try {
    await saveTenantBookingChannel({ ...channel, isActive });
    await refreshBookingChannelSettings();
    setBookingChannelMessage(isActive ? 'Kanal yeniden etkinleştirildi.' : 'Kanal pasifleştirildi; geçmiş rezervasyonlar korundu.', 'success');
  } catch (error) {
    setBookingChannelMessage('Kanal durumu değiştirilemedi: ' + (error.message || 'Bilinmeyen hata'), 'error');
  }
}

async function createBookingChannelFromSettings(formEvent) {
  formEvent.preventDefault();
  const submit = formEvent.currentTarget.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await saveTenantBookingChannel({
      displayName: document.getElementById('newBookingChannelName')?.value,
      channelType: document.getElementById('newBookingChannelType')?.value,
      defaultCommissionRate: document.getElementById('newBookingChannelRate')?.value,
      isActive: true
    });
    formEvent.currentTarget.reset();
    toggleNewBookingChannelRate();
    await refreshBookingChannelSettings();
    setBookingChannelMessage('Yeni rezervasyon kanalı eklendi.', 'success');
  } catch (error) {
    setBookingChannelMessage('Kanal eklenemedi: ' + (error.message || 'Bilinmeyen hata'), 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function renderSettingsTable() {
  renderSettingsGoalsTable();
  renderBookingChannelSettings();
  const tbody = document.getElementById('settingsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.keys(appData.villas).forEach(vKey => {
    const v = appData.villas[vKey];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(v.name)}</strong></td>
      <td>${v.capacity}</td>
      <td><input type="number" class="tbl-input" id="set_floor_${vKey}" value="${fiyatAlani(v.floor)}"></td>
      <td><input type="number" class="tbl-input" id="set_base_${vKey}" value="${fiyatAlani(v.base !== undefined ? v.base : v.basePrice)}"></td>
      <td><input type="number" class="tbl-input" id="set_target_${vKey}" value="${fiyatAlani(v.target)}"></td>
      <td><input type="number" class="tbl-input" id="set_premium_${vKey}" value="${fiyatAlani(v.premium)}"></td>
      <td><input type="number" class="tbl-input" id="set_peak_${vKey}" value="${fiyatAlani(v.peak)}"></td>
      <td><input type="number" class="tbl-input" id="set_clean_${vKey}" value="${fiyatAlani(v.cleanCost)}"></td>
      <td><input type="number" class="tbl-input" id="set_heat_${vKey}" value="${fiyatAlani(v.heatCost)}"></td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Girilmemis bir fiyat alani BOS gosterilir.
 *
 * Buradaki uc alan bir zamanlar `v.base * 1.3`, `* 1.8`, `* 2.5` ile
 * DOLDURULUYORDU. Kullanici hedef/premium/zirve fiyatini hic girmemis olsa
 * bile ekranda bir rakam goruyor, "Kaydet"e basinca o uydurma rakam
 * mulkun gercek fiyati oluyordu — oradan firsat fiyatina ve misafire giden
 * metne tasiniyordu (3.6).
 */
function fiyatAlani(deger) {
  const n = Number(deger);
  return Number.isFinite(n) && n > 0 ? n : '';
}

/**
 * Villa fiyat basamaklarini ve maliyet parametrelerini kaydeder.
 *
 * Bir zamanlar iki ayri sekilde yaniltiyordu:
 *
 *   1. Bos birakilan her alana SIFIR OLMAYAN bir varsayilan yaziyordu
 *      (`|| 3000`, `|| 4000`, `|| 12000`, `|| 800`, `|| 350`). Kullanicinin
 *      hic girmedigi bir fiyat mulkun gercek fiyati oluyordu (3.6).
 *   2. Yalnizca `saveAppData()` cagiriyordu, yani hicbir sey kaydetmiyordu;
 *      "kaydedildi" diyen uyari ise gosteriliyordu.
 *
 * `base_price` ve `clean_cost` mulkun kendi satirina yazilir. Merdivenin
 * diger basamaklari (floor/target/premium/peak) ve isitma maliyeti icin
 * henuz sutun yok — phase30 gelene kadar bunlar KAYDEDILEMEZ ve kullaniciya
 * bu acikca soylenir; "kaydedildi" denip kaybedilmez.
 */
async function saveAllSettings() {
  const oku = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const ham = String(el.value).trim();
    if (ham === '') return null;          // girilmemis: 0 degil, BILINMIYOR
    const n = Number(ham);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const degisen = [];
  Object.keys(appData.villas).forEach(vKey => {
    const v = appData.villas[vKey];
    const yeni = {
      floor: oku(`set_floor_${vKey}`),
      base: oku(`set_base_${vKey}`),
      target: oku(`set_target_${vKey}`),
      premium: oku(`set_premium_${vKey}`),
      peak: oku(`set_peak_${vKey}`),
      cleanCost: oku(`set_clean_${vKey}`),
      heatCost: oku(`set_heat_${vKey}`)
    };
    // null = kullanici bos birakti; onceki degeri silmeyiz, uydurmayiz da.
    Object.entries(yeni).forEach(([alan, deger]) => {
      if (deger !== null) v[alan] = deger;
    });
    degisen.push(vKey);
  });

  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) {
    alert('Bulut bağlantısı kurulamadı. Değişiklikler kaydedilmedi.');
    return;
  }

  const hatalar = [];
  let merdivenKirik = false;
  for (const vKey of degisen) {
    const v = appData.villas[vKey];
    try {
      await updateProperty(vKey, {
        ...v,
        basePrice: v.base !== undefined ? v.base : v.basePrice,
        cleanCost: v.cleanCost
      });
    } catch (err) {
      hatalar.push(`${v.name || vKey}: ${err?.message || 'veritabanı hatası'}`);
      continue;
    }
    // Merdivenin geri kalani (taban/hedef/premium/zirve + isitma) ayri bir
    // tabloda durur: `properties`'e sutun eklemek, goc uygulanana kadar mulk
    // kaydetmeyi tamamen kirardi (AGENTS.md, dagitim sirasi tuzagi). Bu
    // yuzden merdiven yazmasi ayri denenir ve tek basina duser.
    try {
      await cloudSavePricingLadder(vKey, {
        floor: v.floor, target: v.target, premium: v.premium,
        peak: v.peak, heatCost: v.heatCost
      });
    } catch (err) {
      if (isMissingSchemaError(err)) merdivenKirik = true;
      else hatalar.push(`${v.name || vKey} (fiyat merdiveni): ${err?.message || 'veritabanı hatası'}`);
    }
  }

  if (hatalar.length > 0) {
    alert('⚠️ Bazı mülkler kaydedilemedi:\n' + hatalar.join('\n'));
    return;
  }

  alert(
    merdivenKirik
      ? 'Gecelik taban fiyat ve temizlik maliyeti kaydedildi.\n\n' +
        '⚠️ Fiyat merdiveni (taban/hedef/premium/zirve) ve ısıtma maliyeti ' +
        'KAYDEDİLEMEDİ: veritabanı göçü (phase31) henüz uygulanmamış. ' +
        'Bu değerler yalnızca bu oturumda geçerlidir.'
      : 'Fiyat merdiveni, gecelik taban fiyat ve maliyetler kaydedildi.'
  );
}

// -------------------------------------------------------------
// LEADS & MAINTENANCE CRUD
// -------------------------------------------------------------
function renderManageLeadsTable() {
  const tbody = document.getElementById('manageLeadsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('leadSearchInput')?.value || '').toLowerCase().trim();
  const leads = (appData.leads || []).filter(l => {
    if (!searchVal) return true;
    const g = (l.guest || l.guestName || '').toLowerCase();
    const v = (l.villa || '').toLowerCase();
    const c = (l.channel || '').toLowerCase();
    return g.includes(searchVal) || v.includes(searchVal) || c.includes(searchVal);
  });

  leads.forEach(l => {
    let statusBadge = `<span class="badge badge-amber">${escapeHtml(l.status || l.stage)}</span>`;
    if (l.status === 'WON' || l.stage === 'WON') statusBadge = `<span class="badge badge-green">Kazanıldı</span>`;
    if (l.status === 'LOST' || l.stage === 'LOST') statusBadge = `<span class="badge badge-rose">Kaybedildi</span>`;

    let convertAction = '';
    if (l.status === 'WON' || l.stage === 'WON' || l.convertedBookingId) {
      convertAction = `<span class="badge badge-green" style="font-size: 11px;" title="Dönüşen Rezervasyon">✅ Rezervasyona Dönüştü</span>`;
    } else {
      convertAction = `<button class="btn btn-primary btn-sm" data-onclick="convertLeadAction(decodeURIComponent('${encodeActionArg(l.id)}'))" title="Kesin Rezervasyona Dönüştür">📅 Rezervasyona Dönüştür</button>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(l.guest)}</strong></td>
      <td>${escapeHtml(appData.villas[l.villa]?.name || l.villa)}</td>
      <td>${escapeHtml(l.channel)}</td>
      <td>₺${Number(l.quote).toLocaleString('tr-TR')}</td>
      <td>${statusBadge}</td>
      <td>${escapeHtml(l.lostReason || '-')}</td>
      <td>${escapeHtml(l.notes || '-')}</td>
      <td style="text-align: right; white-space: nowrap; display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
        ${convertAction}
        <button class="btn btn-secondary btn-sm" data-onclick="editLead(decodeURIComponent('${encodeActionArg(l.id)}'))" title="Düzenle">✏️</button>
        <button class="btn btn-danger btn-sm" data-onclick="deleteLeadUI(decodeURIComponent('${encodeActionArg(l.id)}'))" title="Sil">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function convertLeadAction(leadId) {
  const l = (appData.leads || []).find(item => item.id === leadId || item.dbId === leadId);
  if (!l) {
    alert('Talep bulunamadı.');
    return false;
  }

  if (l.status === 'WON' || l.convertedBookingId) {
    alert('Bu talep zaten bir rezervasyona dönüştürülmüş.');
    return false;
  }

  let checkIn = l.checkIn;
  let checkOut = l.checkOut;
  if (!checkIn || !checkOut) {
    checkIn = prompt(`"${l.guest}" için Giriş Tarihini giriniz (YYYY-AA-GG):`, getTodayStr());
    if (!checkIn) return false;
    checkOut = prompt(`"${l.guest}" için Çıkış Tarihini giriniz (YYYY-AA-GG):`, checkIn);
    if (!checkOut) return false;
  }

  let pax = normalizePositiveInteger(l.pax);
  if (pax === null) {
    const enteredPax = prompt(`"${l.guest}" için kişi sayısını giriniz:`, '');
    if (enteredPax === null) return false;
    pax = normalizePositiveInteger(enteredPax);
    if (pax === null) {
      alert('Kişi sayısı pozitif bir tam sayı olmalıdır.');
      return false;
    }
  }

  if (!confirm(`"${l.guest}" talebi ₺${Number(l.quote).toLocaleString('tr-TR')} bedelle kesin rezervasyona dönüştürülecek. Onaylıyor musunuz?`)) {
    return false;
  }

  try {
    await convertLeadToBooking(l.id, {
      checkIn,
      checkOut,
      pax,
      villa: l.villa,
      propertyId: l.propertyId,
      ...buildLeadConversionOptions(l, { grossAmount: Number(l.quote) || 0 })
    });
    if (window.showToast) window.showToast('🎉 Talep başarıyla rezervasyona dönüştürüldü ve takvime eklendi!');
    else alert('🎉 Talep başarıyla rezervasyona dönüştürüldü ve takvime eklendi!');
    renderManageLeadsTable();
    renderLeadAnalytics();
    return true;
  } catch (err) {
    alert('Dönüştürme Hatası: ' + err.message);
    return false;
  }
}

function openLeadModal(editId = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('leadModalTitle');
  const editInput = document.getElementById('leadEditId');

  if (editId) {
    const l = appData.leads.find(item => item.id === editId || item.dbId === editId);
    if (!l) return;
    title.innerText = '✏️ Lead Güncelle';
    editInput.value = l.id;
    document.getElementById('leadGuest').value = l.guestName || l.guest;
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

async function saveLead(e) {
  e.preventDefault();
  const editId = document.getElementById('leadEditId').value;
  const guest = document.getElementById('leadGuest').value.trim();
  const villa = document.getElementById('leadVilla').value;
  const channel = document.getElementById('leadChannel').value;
  const quote = Number(document.getElementById('leadQuote').value) || 0;
  const status = document.getElementById('leadStatus').value;
  const lostReason = document.getElementById('leadLostReason').value;
  const notes = document.getElementById('leadNotes').value.trim();

  const payload = buildLeadEditPayload(editId, {
    guest,
    guestName: guest,
    villa,
    channel,
    quote,
    status,
    lostReason,
    notes
  });

  try {
    if (editId) {
      await updateLead(editId, payload);
      if (window.showToast) window.showToast('✅ Talep başarıyla güncellendi.');
    } else {
      await createLead(payload);
      if (window.showToast) window.showToast('🎯 Yeni talep başarıyla oluşturuldu.');
    }
    closeLeadModal();
    renderManageLeadsTable();
    renderLeadAnalytics();
  } catch (err) {
    alert('Hata: ' + err.message);
  }
}

function editLead(id) { openLeadModal(id); }

async function deleteLeadUI(id) {
  const l = (appData.leads || []).find(item => item.id === id || item.dbId === id);
  if (l && (l.status === 'WON' || l.stage === 'WON')) {
    alert('⚠️ Bu talep kazanılmış bir satış olup tarihsel ciro ve conversion KPI verilerine bağlıdır. Silinemez.');
    return;
  }
  if (confirm('Bu talebi silmek istediğinizden emin misiniz?')) {
    try {
      await deleteLead(id);
      renderManageLeadsTable();
      renderLeadAnalytics();
      if (window.showToast) window.showToast('🗑️ Talep başarıyla silindi.');
    } catch (err) {
      alert('Silme Hatası: ' + err.message);
    }
  }
}

function getMaintenancePriorityFromSeverity(severity) {
  if (severity === 'CRITICAL') return 'P1';
  if (severity === 'HIGH' || severity === 'MEDIUM') return 'P2';
  return 'P3';
}

function getMaintenanceAssigneeFromDb(ticket) {
  const description = String(ticket?.description || '');
  const match = description.match(/^Sorumlu:\s*(.+)$/i);
  return match ? match[1].trim() : String(ticket?.assigned_to || '');
}

function getMaintenanceStatusPresentation(status) {
  const presentations = {
    OPEN: { label: 'Açık', badgeClass: 'badge-rose', archived: false },
    IN_PROGRESS: { label: 'Devam Ediyor', badgeClass: 'badge-amber', archived: false },
    WAITING_PARTS: { label: 'Parça Bekliyor', badgeClass: 'badge-amber', archived: false },
    RESOLVED: { label: 'Tamamlandı', badgeClass: 'badge-green', archived: false },
    COMPLETED: { label: 'Tamamlandı', badgeClass: 'badge-green', archived: false },
    CANCELLED: { label: 'Arşivlendi', badgeClass: 'badge-secondary', archived: true }
  };
  return presentations[status] || { label: 'Bilinmiyor', badgeClass: 'badge-secondary', archived: false };
}

function getMaintenanceSeverityForSave(priority, existingTicket = null) {
  if (existingTicket && existingTicket.priority === priority &&
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(existingTicket.severity)) {
    return existingTicket.severity;
  }
  return priority === 'P1' ? 'CRITICAL' : (priority === 'P2' ? 'HIGH' : 'LOW');
}

function mapMaintenanceTicketFromDb(ticket, propertyIdMap = {}) {
  return {
    ...ticket,
    villa: propertyIdMap[ticket.property_id] || ticket.property_id,
    priority: getMaintenancePriorityFromSeverity(ticket.severity),
    assignee: getMaintenanceAssigneeFromDb(ticket),
    cost: Number(ticket.actual_cost || ticket.estimated_cost || 0),
    downtime: ticket.blocks_availability && ticket.downtime_start && ticket.downtime_end
      ? Math.floor((Date.parse(ticket.downtime_end + 'T00:00:00Z') - Date.parse(ticket.downtime_start + 'T00:00:00Z')) / 86400000) + 1 : 0,
    statusRaw: ticket.status,
    status: ticket.status === 'RESOLVED' ? 'COMPLETED' : ticket.status
  };
}

function renderManageMaintTable() {
  const tbody = document.getElementById('manageMaintTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  appData.maintenance.forEach(m => {
    let priBadge = '<span class="badge badge-rose">P1 Kritik</span>';
    if (m.priority === 'P2') priBadge = '<span class="badge badge-amber">P2 Önemli</span>';
    if (m.priority === 'P3') priBadge = '<span class="badge badge-blue">P3 Rutin</span>';

    const statusPresentation = getMaintenanceStatusPresentation(m.statusRaw || m.status);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${priBadge}</td>
      <td><strong>${escapeHtml(appData.villas[m.villa]?.name || m.villa)}</strong></td>
      <td>${escapeHtml(m.title || '')}</td>
      <td>${escapeHtml(m.assignee || 'Atanmadı')}</td>
      <td>₺${Number(m.cost).toLocaleString('tr-TR')}</td>
      <td>${m.downtime || 0} Gece</td>
      <td><span class="badge ${statusPresentation.badgeClass}">${escapeHtml(statusPresentation.label)}</span></td>
      <td style="text-align: right; white-space: nowrap;">
        ${statusPresentation.archived ? '' : `<button class="btn btn-secondary btn-sm" data-onclick="editMaint(decodeURIComponent('${encodeActionArg(String(m.id))}'))">✏️</button>
        <button class="btn btn-danger btn-sm" data-onclick="deleteMaint(decodeURIComponent('${encodeActionArg(String(m.id))}'))">Arşivle</button>`}
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
    document.getElementById('maintBlocksAvailability').checked = !!(m.blocks_availability || m.blocksAvailability);
    document.getElementById('maintDowntimeStart').value = m.downtime_start || m.downtimeStart || '';
    document.getElementById('maintDowntimeEnd').value = m.downtime_end || m.downtimeEnd || '';
    document.getElementById('maintCost').value = m.cost || 0;
    document.getElementById('maintStatus').value = m.statusRaw || (m.status === 'COMPLETED' ? 'RESOLVED' : m.status);
  } else {
    title.innerText = '🛠️ Yeni Arıza / Bakım İşi';
    editInput.value = '';
    document.getElementById('maintForm').reset();
  }
  modal.classList.add('active');
}

function closeMaintModal() { document.getElementById('maintModal').classList.remove('active'); }

async function saveMaint(e) {
  e.preventDefault();
  const editId = document.getElementById('maintEditId').value;
  const villa = document.getElementById('maintVilla').value;
  const priority = document.getElementById('maintPriority').value;
  const title = document.getElementById('maintTitle').value;
  const assignee = document.getElementById('maintAssignee').value.trim();
  const blocksAvailability = document.getElementById('maintBlocksAvailability').checked;
  const downtimeStart = document.getElementById('maintDowntimeStart').value || null;
  const downtimeEnd = document.getElementById('maintDowntimeEnd').value || null;
  const cost = Number(document.getElementById('maintCost').value) || 0;
  const status = document.getElementById('maintStatus').value;

  if (blocksAvailability && (!downtimeStart || !downtimeEnd || downtimeEnd < downtimeStart)) {
    alert('Takvimi kapatan bakım için geçerli başlangıç ve bitiş tarihleri zorunludur.');
    return;
  }
  try {
    const tenantId = getActiveTenantId();
    requireCloudForWrite('Bakım kaydı', tenantId);
    const propertyId = appData.villas[villa]?.id;
    const existingTicket = editId ? appData.maintenance.find(item => item.id === editId) : null;
    const payload = {
      property_id: propertyId,
      category: 'MAINTENANCE',
      severity: getMaintenanceSeverityForSave(priority, existingTicket),
      title: title.trim(),
      description: assignee ? `Sorumlu: ${assignee}` : null,
      status,
      estimated_cost: cost,
      blocks_availability: blocksAvailability,
      downtime_start: blocksAvailability ? downtimeStart : null,
      downtime_end: blocksAvailability ? downtimeEnd : null
    };
    if (editId) {
      const { error } = await supabaseClient.from('maintenance_tickets').update(payload)
        .eq('tenant_id', tenantId).eq('id', editId);
      if (error) throw error;
    } else {
      await createMaintenanceTicket(payload);
    }
    await loadTenantAppData(tenantId);
    closeMaintModal();
  } catch (err) {
    alert('Bakım kaydı kaydedilemedi: ' + getFriendlyAuthErrorMessage(err));
  }
}

function editMaint(id) { openMaintModal(id); }
async function deleteMaint(id) {
  if (confirm('Bu bakım kaydını iptal ederek arşivlemek istediğinize emin misiniz?')) {
    const tenantId = getActiveTenantId();
    try {
      const { error } = await supabaseClient.from('maintenance_tickets')
        .update({ status: 'CANCELLED', blocks_availability: false, downtime_start: null, downtime_end: null })
        .eq('tenant_id', tenantId).eq('id', id);
      if (error) throw error;
      await loadTenantAppData(tenantId);
      if (window.showToast) window.showToast('Bakım kaydı iptal edilerek arşivlendi.');
    } catch (err) {
      alert('Bakım kaydı arşivlenemedi: ' + getFriendlyAuthErrorMessage(err));
    }
  }
}

// -------------------------------------------------------------
// RESET, RESTORE & EXPORT
// -------------------------------------------------------------

function openResetModal() {
  const modal = document.getElementById('resetModal');
  if (!modal) return;
  const input = document.getElementById('resetConfirmInput');
  const err = document.getElementById('resetError');
  if (input) input.value = '';
  if (err) err.style.display = 'none';
  updateResetButton();
  modal.classList.add('active');
  renderResetImpact();
}

function closeResetModal() {
  const modal = document.getElementById('resetModal');
  if (modal) modal.classList.remove('active');
}

/** Sifirlamanin ne silecegini ONCEDEN gosterir. */
function renderResetImpact() {
  const kutu = document.getElementById('resetImpact');
  if (!kutu) return;
  const say = (arr) => Array.isArray(arr) ? arr.length : 0;
  const satirlar = [
    ['Mülk', Object.keys(appData.villas || {}).length],
    ['Rezervasyon', say(appData.bookings)],
    ['Gider kaydı', say(appData.expenses)],
    ['Temizlik görevi', say(appData.cleaningTasks)],
    ['Talep (lead)', say(appData.leads)],
    ['Kapatılmış dönem', (appData.closedPeriods || []).filter(c => c.status === 'CLOSED').length]
  ].filter(([, n]) => n > 0);

  kutu.innerHTML = satirlar.length
    ? '<strong>Silinecek kayıtlar:</strong><br>' +
      satirlar.map(([ad, n]) => `• ${escapeHtml(ad)}: <strong>${n}</strong>`).join('<br>') +
      '<br><span style="color:#94A3B8;">Ekip üyeleriniz ve işletme hesabınız korunur.</span>'
    : 'Sıfırlanacak kayıt bulunmuyor; işletmeniz zaten boş.';
}

function updateResetButton() {
  const input = document.getElementById('resetConfirmInput');
  const btn = document.getElementById('resetSubmitBtn');
  if (btn) btn.disabled = !input || input.value.trim() !== 'VERILERI SIFIRLA';
}

/**
 * Isletmenin TUM verisini siler.
 *
 * Eskiden bulut hesabinda HICBIR SEY yapmiyordu: yalnizca "bu islem bulut
 * hesabinizdaki kayitlari silmez" uyarisi cikip kapaniyordu. Yerel modda ise
 * sadece bellegi bosaltiyor, appData.targets'i dizi yerine NESNE ({}) yapip
 * hedef listesini de bozuyordu.
 *
 * Artik tek transaction'da sunucuda calisir (reset_tenant_data): isletme
 * sahibine ozel, yazili onay zorunlu, kapatilmis donemler dahil her sey silinir.
 */
async function cleanResetAll() {
  const err = document.getElementById('resetError');
  const btn = document.getElementById('resetSubmitBtn');
  const input = document.getElementById('resetConfirmInput');
  const onay = input ? input.value.trim() : '';
  if (err) err.style.display = 'none';

  if (onay !== 'VERILERI SIFIRLA') {
    if (err) { err.textContent = 'Onaylamak için tam olarak "VERILERI SIFIRLA" yazın.'; err.style.display = 'block'; }
    return;
  }

  const tenantId = getActiveTenantId();
  requireCloudForWrite('Veri sıfırlama', tenantId);

  if (btn) { btn.disabled = true; btn.textContent = 'Sıfırlanıyor…'; }
  try {
    const { data, error } = await supabaseClient.rpc('reset_tenant_data', {
      p_tenant_id: tenantId,
      p_confirm: onay
    });
    if (error) throw new Error(error.message || 'Veritabanı hatası');

    await loadTenantAppData(tenantId);
    closeResetModal();
    const adet = (data && data.total_deleted) || 0;
    if (typeof showToast === 'function') {
      showToast(adet > 0
        ? `${adet} kayıt silindi. İşletmeniz sıfırlandı.`
        : 'İşletmenizde silinecek kayıt yoktu.', 'success');
    }
  } catch (e) {
    if (err) { err.textContent = 'Sıfırlanamadı: ' + (e.message || 'bilinmeyen hata'); err.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = '🗑️ Tüm Verileri Kalıcı Olarak Sıfırla'; }
    updateResetButton();
  }
}

function resetToCleanState() {
  openResetModal();
}

// -------------------------------------------------------------
// DEFTER DISA AKTARMA
// -------------------------------------------------------------
//
// Burada bir zamanlar `exportDataJSON()` vardi: "💾 Raporu İndir (JSON)"
// dugmesi `appData`'nin TAMAMINI ham JSON olarak dokuyordu — misafir
// adlari, telefonlari, riza kayitlari ve planlanmis mesajlar dahil. Ne
// rapordu (ham veri yigiydi), ne donem filtresini taniyordu (ekranda Eylul
// secilyken dosya her ayi iceriyordu), ne de kimsenin isine yariyordu
// (bir isletmeci ya da muhasebeci JSON acmaz).
//
// Yerine gecen sey tek bir kurala bagli: **disa aktarilan dosya geri
// yuklenebilmeli.** Sutunlar `SABLON_SUTUNLARI`'ndan gelir; ornek sablonla
// ve ice aktarma eslemesiyle ayni listedir.
//
// Suzme burada yapilir, motorda degil: hangi kayitlarin disa aktarilacagi
// ekranin sorusudur, bicimlendirme motorun.

/** Dısa aktarma menusunu acar/kapatir. Disariya tiklayinca da kapanir. */
function toggleExportMenu(olay) {
  if (olay) olay.stopPropagation();
  const menu = document.getElementById('ledgerExportMenu');
  if (!menu) return;
  const acik = menu.style.display !== 'none';
  menu.style.display = acik ? 'none' : 'block';

  if (!acik && !menu.dataset.disKapatmaHazir) {
    menu.dataset.disKapatmaHazir = '1';
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#ledgerExportMenu') && !e.target.closest('[data-onclick*="toggleExportMenu"]')) {
        menu.style.display = 'none';
      }
    });
  }
}

function getExportEngine() {
  if (typeof FinanceExportEngine !== 'undefined') return FinanceExportEngine;
  if (typeof window !== 'undefined' && window.FinanceExportEngine) return window.FinanceExportEngine;
  if (typeof require === 'function') {
    try { return require('./core/finance_export_engine.js'); } catch (e) { /* tarayici */ }
  }
  return null;
}

/**
 * Disa aktarilacak kayitlar — EKRANDA GORUNEN defterin aynisi.
 *
 * Rezervasyon TAM haliyle yazilir, aya dusen payiyla DEGIL. Tahakkuk payi
 * (3.4) bir RAPORLAMA kuralidir; defter satiri ise butun bir rezervasyondur.
 * Payi yazsaydik dosya geri yuklendiginde rezervasyon parcalanir ve tutar
 * kalici olarak bozulurdu. Bunun sonucu, ay sinirini kesen bir kaydin
 * dosyada TAM tutariyla gorunmesidir; kullaniciya da oyle soylenir.
 */
function collectExportRecords(mod) {
  if (mod === 'BOOKINGS') {
    return (appData.bookings || []).filter(b => isBookingInFilter(b));
  }
  return (appData.expenses || []).filter(e => isExpenseInFilter(e));
}

/** Tarayiciya dosya indirtir. */
function triggerFileDownload(icerik, ad, mimeTur) {
  const blob = new Blob([icerik], { type: mimeTur });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Object URL birakilmazsa sekme kapanana kadar bellekte kalir.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * @param {'BOOKINGS'|'EXPENSES'} mod
 * @param {'xlsx'|'csv'} bicim
 */
function exportLedger(mod, bicim) {
  const E = getExportEngine();
  if (!E) {
    if (typeof showToast === 'function') showToast('Dışa aktarma motoru yüklenemedi. Sayfayı yenileyin.', 'error');
    return;
  }

  const kayitlar = collectExportRecords(mod);
  const defterAdi = (mod === 'BOOKINGS') ? 'rezervasyon' : 'gider';
  if (kayitlar.length === 0) {
    // Bos dosya indirtmek "disa aktarim calismadi" izlenimi verir; sebebi
    // soylemek daha dogru.
    if (typeof showToast === 'function') {
      showToast(`${getPeriodDisplayName(currentFilter.period)} döneminde dışa aktarılacak ${defterAdi} kaydı yok.`, 'info');
    }
    return;
  }

  let disaAktarim;
  try {
    disaAktarim = E.buildExport(mod, kayitlar);
  } catch (err) {
    console.error('Export build failed:', err);
    if (typeof showToast === 'function') showToast(err.message || 'Dışa aktarma hazırlanamadı.', 'error');
    return;
  }

  const donem = (currentFilter.villa && currentFilter.villa !== 'ALL')
    ? currentFilter.period + '_' + currentFilter.villa
    : currentFilter.period;

  if (bicim === 'csv') {
    triggerFileDownload(E.toCSV(disaAktarim), E.dosyaAdi(mod, donem, 'csv'),
      'text/csv;charset=utf-8');
  } else {
    if (typeof XLSX === 'undefined') {
      if (typeof showToast === 'function') showToast('Excel motoru henüz yüklenmedi, birkaç saniye sonra tekrar deneyin.', 'error');
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(E.toAOA(disaAktarim)),
      mod === 'BOOKINGS' ? 'Rezervasyonlar' : 'Giderler');
    const bayt = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    triggerFileDownload(bayt, E.dosyaAdi(mod, donem, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  if (typeof showToast === 'function') {
    showToast(`${kayitlar.length} ${defterAdi} kaydı dışa aktarıldı (${getPeriodDisplayName(currentFilter.period)}).`, 'success');
  }
}

// Initialize on DOM Ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    wireAccessibleFormLabels();
    const isAuth = await checkAuthStatus();
    if (!isAuth) {
      if (typeof getBlankTenantData === 'function') {
        appData = getBlankTenantData('guest');
      }
      showLockOverlay();
    }
  });
}


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
  if (!appData.cleaningTasks) appData.cleaningTasks = [];
  if (!appData.housekeepingOverrides) appData.housekeepingOverrides = {};

  const todayStr = getTodayStr(); // Canonical system date
  const checkInTime = appData.guestSettings?.check_in_time || appData.guestSettings?.checkInTime || null;
  const checkOutTime = appData.guestSettings?.check_out_time || appData.guestSettings?.checkOutTime || null;

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
              <span><strong>${formatShortDate(u.checkIn)}</strong> - ${escapeHtml(u.guest)}</span>
              <span style="color: #93C5FD;">${escapeHtml(appData.villas[u.villa]?.name || u.villa)}</span>
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
          <div class="ops-guest-name" style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${escapeHtml(b.guest)}</div>
          <div class="ops-guest-meta" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(vName)} • ${escapeHtml(b.channel)} • ${b.nights || '—'} Gece • ${b.pax || '—'} Kişi
          </div>
          <div style="font-size: 11px; color: #34D399; margin-top: 2px;">Net Gelir: ₺${Number(b.net || 0).toLocaleString('tr-TR')}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="badge badge-green" style="font-weight: 700;">🟢 ${checkInTime ? escapeHtml(checkInTime) + ' Giriş' : 'Giriş saati kayıtlı değil'}</span>
          <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 6px;" data-onclick="openBookingModal(decodeURIComponent('${encodeActionArg(b.id)}'))">Detay</button>
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
              <span><strong>${formatShortDate(u.checkOut)}</strong> - ${escapeHtml(u.guest)}</span>
              <span style="color: #93C5FD;">${escapeHtml(appData.villas[u.villa]?.name || u.villa)}</span>
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
          <div class="ops-guest-name" style="font-weight: 700; color: #FFFFFF; font-size: 13px;">${escapeHtml(b.guest)}</div>
          <div class="ops-guest-meta" style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            ${escapeHtml(vName)} • ${escapeHtml(b.channel)} • Çıkış Günü
          </div>
          <div style="font-size: 11px; color: #FBBF24; margin-top: 2px;">🧹 Temizlik Planına Alındı</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
          <span class="badge badge-blue" style="font-weight: 700;">🔵 ${checkOutTime ? escapeHtml(checkOutTime) + ' Çıkış' : 'Çıkış saati kayıtlı değil'}</span>
          <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 2px 6px;" data-onclick="openBookingModal(decodeURIComponent('${encodeActionArg(b.id)}'))">Detay</button>
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
    const vConf = appData.villas[vKey];
    if (!vConf) return;

    const readiness = getPropertySalesReadiness(vKey);
    const meta = readiness?.meta || getPropertySalesReadinessApi()?.STATUS_META?.UNSET;
    const statusBadge = meta ? `${meta.icon} ${meta.shortLabel}` : '⚪ Belirsiz';
    const badgeClass = meta?.tone === 'green' ? 'badge-emerald'
      : meta?.tone === 'yellow' ? 'badge-amber'
        : meta?.tone === 'red' ? 'badge-rose'
          : meta?.tone === 'blue' ? 'badge-blue' : '';
    const canEditReadiness = canManagePropertyReadiness();
    const actionAttrs = canEditReadiness
      ? `data-onclick="cycleHkStatus(decodeURIComponent('${encodeActionArg(vKey)}'))" title="Satış hazırlığı durumunu değiştirmek için tıklayın"`
      : 'title="Bu durumu değiştirme yetkiniz yok"';

    villaCardsHtml += `
      <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.07); padding: 3px 6px; border-radius: 6px; font-size: 11px; margin: 2px;">
        <span style="color: #FFFFFF; font-weight: 600;">${escapeHtml(vConf.name.split(' ')[0])}:</span>
        <span class="badge ${badgeClass}" data-readiness-status="${escapeHtml(readiness?.status || 'UNSET')}" style="font-size: 9px; padding: 1px 5px; cursor: ${canEditReadiness ? 'pointer' : 'default'};" ${actionAttrs}>${statusBadge}</span>
      </div>
    `;
  });

  villaBar.innerHTML = `
    <div style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span>🏡 Mülk Satış Hazırlığı</span>
      <span style="color: #93C5FD; font-size: 10px;">${canManagePropertyReadiness() ? 'Durum Değiştir 🔄' : 'Salt Okunur'}</span>
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
      const vConf = appData.villas[task.villa];
      const vName = vConf?.name || task.villa;
      const amt = Number(task.amount) || 0;
      const isPaid = !!task.paid;

      // Borc = YAPILMIS ve odenmemis temizlik (K-04). Planli ya da yapilmamis
      // gorev personele borc degildir.
      if (task.status === 'DONE' && !isPaid) {
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
              <strong style="font-size: 13px; color: #FFFFFF;">${escapeHtml(vName)}</strong>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              ${task.guest ? `<strong>${escapeHtml(task.guest)}</strong> • Çıkış Temizliği & Hazırlık` : escapeHtml(task.notes || 'Temizlik')}
            </div>
          </div>
          <span class="badge ${isPaid ? 'badge-emerald' : (task.status === 'DONE' ? 'badge-amber' : (task.status === 'SKIPPED' ? '' : 'badge-blue'))}" style="font-size: 10px; font-weight: 700; white-space: nowrap;">
            ${isPaid ? '✅ Ödendi' : (task.status === 'DONE' ? '⏳ Borç' : (task.status === 'SKIPPED' ? '✖ Yapılmadı' : '🗓️ Planlı'))}
          </span>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 6px; border-top: 1px dashed rgba(255, 255, 255, 0.1); font-size: 11px;">
          <span style="color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
            🧹 Bedel: 
            <b style="color: #60A5FA; cursor: pointer; text-decoration: underline dashed; font-size: 12px;" 
               data-onclick="promptEditTaskAmount(decodeURIComponent('${encodeActionArg(task.id)}'))" 
               title="Maliyeti değiştirmek için tıklayın">
              ₺${amt.toLocaleString('tr-TR')} ✏️
            </b>
          </span>
          <button class="${isPaid ? 'btn-clean-paid' : 'btn-clean-pending'}" 
                  data-onclick="toggleTaskPaid(decodeURIComponent('${encodeActionArg(task.id)}'))" 
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
/** Kullanicinin yazdigi tutar: "1.500" bin bes yuzdur, 1,5 degil (L-29). */
function parseCleaningAmountInput(input) {
  const engine = getImportEngine();
  const deger = engine && typeof engine.normalizeAmount === 'function'
    ? engine.normalizeAmount(String(input))
    : null;
  return Number.isFinite(deger) && deger >= 0 ? Math.round(deger * 100) / 100 : null;
}

function findCleaningTask(taskId) {
  return (appData.cleaningTasks || []).find(t => t.id === taskId || t.dbId === taskId || t.legacyId === taskId) || null;
}

async function promptEditTaskAmount(taskId) {
  // Dogru gorev: kimligiyle bulunur. Eskiden mulk duzeyindeki duzenleme
  // mulkun ILK gorevini degistiriyordu (L-29).
  const task = findCleaningTask(taskId);
  if (!task) return;

  const input = prompt(`${task.guest || task.villa} temizlik maliyetini giriniz (TL):`, task.amount || '');
  if (input === null) return;
  const newAmount = parseCleaningAmountInput(input);
  if (newAmount === null) {
    alert('Lütfen geçerli bir tutar giriniz (ör. 1.500 veya 1500,50).');
    return;
  }

  task.amount = newAmount;
  renderHousekeepingTab();
  renderDailyOps();

  await reportCleaningPersist(task, `✅ Temizlik maliyeti ₺${newAmount.toLocaleString('tr-TR')} olarak güncellendi.`);
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
}

/** YYYY-MM-DD mi ve gercek bir gun mu? */
function isValidIsoDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Temizlik YAPILDI (K-04). Gider bu anda dogar ve YAPILDIGI GUNUN ayina
 * yazilir; gun sorulur, varsayilan planlanan gundur. Odeme ayri bir adimdir.
 */
async function markCleaningDone(taskId) {
  const task = findCleaningTask(taskId);
  if (!task) return false;
  const girilen = prompt('Temizlik hangi gün yapıldı? (YYYY-AA-GG)', task.date || getTodayStr());
  if (girilen === null) return false;
  const gun = String(girilen).trim();
  if (!isValidIsoDate(gun)) {
    alert('Lütfen tarihi YYYY-AA-GG biçiminde girin.');
    return false;
  }
  if (gun > getTodayStr()) {
    alert('Henüz gelmemiş bir gün için temizlik "yapıldı" işaretlenemez.');
    return false;
  }
  task.status = 'DONE';
  task.date = gun;
  renderHousekeepingTab();
  const ok = await reportCleaningPersist(task, `✅ Temizlik yapıldı olarak işaretlendi (${formatTrDate(gun)}). Maliyeti bu günün ayına gider yazıldı.`);
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
  return ok;
}

/** Temizlik YAPILMADI (gelmeyen misafir, iptal): ne gider ne borc. */
async function markCleaningSkipped(taskId) {
  const task = findCleaningTask(taskId);
  if (!task) return false;
  if (task.paid) {
    alert('Ödenmiş bir temizlik "yapılmadı" yapılamaz. Önce ödemeyi geri alın.');
    return false;
  }
  if (!confirm('Bu temizlik yapılmadı olarak işaretlensin mi? Gider ve personel borcu oluşmaz.')) return false;
  task.status = 'SKIPPED';
  renderHousekeepingTab();
  const ok = await reportCleaningPersist(task, '⏭️ Temizlik yapılmadı olarak işaretlendi; gider ve borç oluşmaz.');
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
  return ok;
}

/** Yanlislikla verilen "yapildi / yapilmadi"yi geri al. */
async function markCleaningPlanned(taskId) {
  const task = findCleaningTask(taskId);
  if (!task) return false;
  if (task.paid) {
    alert('Ödenmiş bir temizlik planlı duruma alınamaz. Önce ödemeyi geri alın.');
    return false;
  }
  task.status = 'PLANNED';
  renderHousekeepingTab();
  const ok = await reportCleaningPersist(task, '↩️ Temizlik yeniden planlı duruma alındı.');
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
  return ok;
}

/** Secilen gecmis tarihli planli gorevleri tek seferde "yapildi" yap. */
async function markSelectedCleaningDone() {
  const secili = Array.from(document.querySelectorAll('.hk-select:checked') || [])
    .map(el => decodeURIComponent(el.value));
  const gorevler = secili.map(findCleaningTask).filter(t => t && t.status === 'PLANNED');
  if (gorevler.length === 0) {
    alert('Önce listeden yapılmış (planlı) temizlikleri seçin.');
    return false;
  }
  const bugun = getTodayStr();
  const gelecek = gorevler.filter(t => (t.date || '') > bugun);
  if (gelecek.length) {
    alert(`${gelecek.length} seçili temizlik henüz gelmemiş bir güne planlı; yalnız geçmiş tarihli olanlar işaretlenebilir.`);
    return false;
  }
  if (!confirm(`${gorevler.length} temizlik planlandıkları gün yapılmış olarak işaretlensin mi? Maliyetleri o günlerin ayına gider yazılır.`)) return false;
  gorevler.forEach(t => { t.status = 'DONE'; });
  renderHousekeepingTab();
  const ok = await reportCleaningPersist(gorevler, `✅ ${gorevler.length} temizlik yapıldı olarak işaretlendi.`);
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
  return ok;
}


async function cycleHkStatus(vKey) {
  const api = getPropertySalesReadinessApi();
  if (!api) return false;
  const current = api.normalizeStatus(appData?.housekeepingOverrides?.[vKey]);
  const states = api.SELECTABLE_STATUSES;
  const currentIndex = states.indexOf(current);
  const next = states[(currentIndex + 1) % states.length];
  return await setPropertySalesReadiness(vKey, next);
}

async function setPropertySalesReadiness(vKey, status) {
  const api = getPropertySalesReadinessApi();
  if (!api || !api.SELECTABLE_STATUSES.includes(status)) {
    if (window.showToast) window.showToast('⚠️ Geçersiz mülk hazırlık durumu.', 'error');
    return false;
  }
  if (!canManagePropertyReadiness()) {
    if (window.showToast) window.showToast('⚠️ Bu durumu değiştirme yetkiniz yok.', 'error');
    return false;
  }

  const villaName = appData?.villas?.[vKey]?.name || vKey;
  const meta = api.STATUS_META[status];
  const saved = await reportStatePersist(
    () => cloudSaveHousekeepingOverride(vKey, status),
    `✅ ${villaName}: ${meta.label}`
  );
  if (!saved) return false;

  if (!appData.housekeepingOverrides) appData.housekeepingOverrides = {};
  appData.housekeepingOverrides[vKey] = status;
  renderExecutiveControlCenter();
  renderDailyOps();
  renderOperationsKpiStrip();
  return true;
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
  const bugun = getTodayStr();

  // Kapsam: secili mulk ve donem. Gorev tarihi = temizligin yapildigi (ya da
  // planlandigi) gun; gider de bu gunun ayina yazilir (K-04).
  const allInScope = appData.cleaningTasks.filter(t => {
    if (!taskMatchesVilla(t, currentFilter.villa)) return false;
    if (currentFilter.period === 'ALL') return true;
    return isDateInFilter(t.date || '');
  });

  let filtered = allInScope.slice();
  // PENDING eski deger: "borc" ile ayni anlam.
  if (statusFilter === 'DEBT' || statusFilter === 'PENDING') {
    filtered = filtered.filter(t => t.status === 'DONE' && !t.paid);
  } else if (statusFilter === 'PAID') {
    filtered = filtered.filter(t => t.paid);
  } else if (statusFilter === 'UNCONFIRMED') {
    filtered = filtered.filter(t => t.status === 'PLANNED' && (t.date || '') <= bugun);
  } else if (statusFilter === 'PLANNED') {
    filtered = filtered.filter(t => t.status === 'PLANNED');
  } else if (statusFilter === 'SKIPPED') {
    filtered = filtered.filter(t => t.status === 'SKIPPED');
  }

  if (searchTerm) {
    filtered = filtered.filter(t => {
      const vName = (appData.villas[t.villa]?.name || t.villa || '').toLowerCase();
      const guest = (t.guest || '').toLowerCase();
      const cleaner = (t.cleaner || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      return vName.includes(searchTerm) || guest.includes(searchTerm) || cleaner.includes(searchTerm) || notes.includes(searchTerm);
    });
  }

  // KPI'lar. Borc = YAPILMIS ve odenmemis temizlik; planli gorev borc degil.
  const debtList = allInScope.filter(t => t.status === 'DONE' && !t.paid);
  const paidList = allInScope.filter(t => t.paid);
  const unconfirmed = allInScope.filter(t => t.status === 'PLANNED' && (t.date || '') <= bugun);
  const pendingDebt = debtList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const paidAmount = paidList.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  setEl('hkKpiPendingDebt', '₺' + pendingDebt.toLocaleString('tr-TR'));
  setEl('hkKpiPendingCount', debtList.length + ' yapılmış temizlik ödeme bekliyor');
  setEl('hkKpiPaidAmount', '₺' + paidAmount.toLocaleString('tr-TR'));
  setEl('hkKpiPaidCount', paidList.length + ' Temizlik Ödendi');
  setEl('hkKpiTotalOps', allInScope.length);
  setEl('hkKpiTotalOpsMeta', unconfirmed.length > 0
    ? `${unconfirmed.length} geçmiş temizlik "yapıldı mı?" bekliyor`
    : (currentFilter.villa === 'ALL' ? portfolioLabel(' Toplamı') : (appData.villas[currentFilter.villa]?.name || currentFilter.villa)));

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">Kriterlere uygun temizlik / borç kaydı bulunamadı.</td></tr>';
    return;
  }

  const kod = encodeActionArg; // checkbox degeri de ayni kodla
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '')).forEach(task => {
    const vName = appData.villas[task.villa]?.name || task.villa;
    const isPaid = !!task.paid;
    const amount = Number(task.amount) || 0;
    const id = kod(task.id);
    const gecmisPlanli = task.status === 'PLANNED' && (task.date || '') <= bugun;

    let durum;
    if (task.status === 'DONE') {
      durum = `<span class="badge badge-emerald">✔ Yapıldı</span>`
        + (isPaid ? '' : ` <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:10px;" data-onclick="markCleaningPlanned(decodeURIComponent('${encodeActionArg(task.id)}'))" title="Yanlışlıkla işaretlendiyse geri al">↩︎</button>`);
    } else if (task.status === 'SKIPPED') {
      durum = `<span class="badge">Yapılmadı</span> <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:10px;" data-onclick="markCleaningPlanned(decodeURIComponent('${encodeActionArg(task.id)}'))" title="Geri al">↩︎</button>`;
    } else {
      durum = `<span class="badge ${gecmisPlanli ? 'badge-amber' : 'badge-blue'}">${gecmisPlanli ? 'Yapıldı mı?' : 'Planlandı'}</span>
        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:10px; margin-left:4px;" data-onclick="markCleaningDone(decodeURIComponent('${encodeActionArg(task.id)}'))">✔ Yapıldı</button>
        <button class="btn btn-secondary btn-sm" style="padding:2px 6px; font-size:10px;" data-onclick="markCleaningSkipped(decodeURIComponent('${encodeActionArg(task.id)}'))">✖ Yapılmadı</button>`;
    }

    let odeme;
    if (task.status === 'DONE') {
      odeme = `<button class="${isPaid ? 'btn-clean-paid' : 'btn-clean-pending'}"
                data-onclick="toggleTaskPaid(decodeURIComponent('${encodeActionArg(task.id)}'))"
                title="${isPaid ? 'Ödenmedi olarak değiştir' : 'Ödendi olarak işaretle'}">
          ${isPaid ? '✅ ÖDENDİ' : '⏳ ÖDENECEK'}
        </button>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 2px;">${isPaid ? (task.paidDate ? formatTrDate(task.paidDate) : 'Ödendi') : '<span style="color: #F87171;">Borç</span>'}</div>`;
    } else {
      odeme = `<span style="color: var(--text-muted); font-size: 11px;">${task.status === 'SKIPPED' ? 'Gider ve borç yok' : 'Yapılınca borç olur'}</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${task.status === 'PLANNED' ? `<input type="checkbox" class="hk-select" value="${id}" aria-label="Seç" style="margin-right:6px;">` : ''}<strong>${formatTrDate(task.date)}</strong></td>
      <td><span class="villa-badge">${escapeHtml(vName)}</span></td>
      <td>
        <strong style="color: #FFFFFF;">${escapeHtml(task.guest ? task.guest + ' Çıkışı' : (task.notes || 'Temizlik'))}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(task.notes || '-')}</div>
      </td>
      <td>
        <span style="color: #93C5FD; font-weight: 500;">👤 ${escapeHtml(task.cleaner || 'Temizlik personeli belirtilmedi')}</span>
      </td>
      <td>
        <b style="color: #60A5FA; cursor: pointer; text-decoration: underline dashed; font-size: 13px;"
           data-onclick="promptEditTaskAmount(decodeURIComponent('${encodeActionArg(task.id)}'))"
           title="Tıklayarak maliyeti değiştirin">
          ${amount > 0 ? '₺' + amount.toLocaleString('tr-TR') : 'Tutar girilmedi'} ✏️
        </b>
      </td>
      <td>${durum}</td>
      <td>${odeme}</td>
      <td style="text-align: right;">
        <button class="btn btn-secondary btn-sm" data-onclick="openEditCleaningTaskModal(decodeURIComponent('${encodeActionArg(task.id)}'))" style="padding: 3px 7px; font-size: 11px;" title="Detaylı Düzenle">✏️</button>
        <button class="btn btn-danger btn-sm" data-onclick="deleteCleaningTask(decodeURIComponent('${encodeActionArg(task.id)}'))" style="padding: 3px 7px; font-size: 11px; margin-left: 4px;" title="Sil">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function toggleTaskPaid(taskId) {
  const task = findCleaningTask(taskId);
  if (!task) return;

  const newPaid = !task.paid;
  if (newPaid && task.status === 'SKIPPED') {
    alert('Yapılmamış bir temizlik ödenemez.');
    return;
  }
  if (newPaid && task.status !== 'DONE') {
    // Odeme yapilmis temizlige yapilir. Planli gorev once "yapildi" olur;
    // gider o anda ve yapildigi gunun ayinda dogar.
    if (!confirm('Bu temizlik henüz "yapıldı" işaretlenmemiş. Yapıldı olarak işaretleyip ödensin mi?')) return;
    const girilen = prompt('Temizlik hangi gün yapıldı? (YYYY-AA-GG)', task.date || getTodayStr());
    if (girilen === null) return;
    const gun = String(girilen).trim();
    if (!isValidIsoDate(gun) || gun > getTodayStr()) {
      alert('Geçerli ve gelecekte olmayan bir tarih girin (YYYY-AA-GG).');
      return;
    }
    task.status = 'DONE';
    task.date = gun;
  }
  task.paid = newPaid;
  task.paidDate = newPaid ? getTodayStr() : null;

  const vName = (appData.villas && appData.villas[task.villa]?.name) ? appData.villas[task.villa].name : task.villa;
  renderHousekeepingTab();
  renderDailyOps();

  // "Odendi" gider YAZMAZ (K-04): gider temizlik yapildiginda dogdu.
  const msg = newPaid
    ? `✅ [${vName}] temizlik (₺${Number(task.amount).toLocaleString('tr-TR')}) ödendi; personel borcu kapandı.`
    : `⏳ [${vName}] temizlik (₺${Number(task.amount).toLocaleString('tr-TR')}) yeniden ödenecek (borç) durumunda.`;
  await reportCleaningPersist(task, msg);
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
  if (typeof renderExpensesTable === 'function') renderExpensesTable();
}


async function payAllPendingCleaning() {
  if (!appData.cleaningTasks) return;
  // Borc = yapilmis ve odenmemis temizlik. Planli gorev borc degildir:
  // yapilmamis temizligin parasi odenmez (K-04).
  const pending = appData.cleaningTasks.filter(t => t.status === 'DONE' && !t.paid);
  if (pending.length === 0) {
    alert('Şu anda ödenecek temizlik borcu yok. (Planlı temizlikler önce "yapıldı" işaretlenmelidir.)');
    return;
  }

  const totalDebt = pending.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const confirmPay = confirm(`Yapılmış ${pending.length} temizliğin borcu (₺${totalDebt.toLocaleString('tr-TR')}) ödendi olarak kapatılsın mı?`);
  if (!confirmPay) return;

  const todayStr = getTodayStr();
  pending.forEach(t => {
    t.paid = true;
    t.paidDate = todayStr;
  });

  renderHousekeepingTab();
  renderDailyOps();

  await reportCleaningPersist(
    pending,
    `✅ ${pending.length} temizlik borcu (₺${totalDebt.toLocaleString('tr-TR')}) ödendi.`
  );
  if (typeof renderFinanceModule === 'function') renderFinanceModule();
}


function openNewCleaningTaskModal() {
  document.getElementById('cleaningTaskModalTitle').innerText = '🧹 Yeni Temizlik / Borç Girişi';
  document.getElementById('hkEditTaskId').value = '';
  document.getElementById('hkVilla').value = currentFilter.villa !== 'ALL'
    ? currentFilter.villa
    : (Object.keys((typeof appData !== 'undefined' && appData.villas) || {})[0] || '');
  document.getElementById('hkDate').value = getTodayStr();
  document.getElementById('hkCleaner').value = '';
  
  const vKey = document.getElementById('hkVilla').value;
  const vConf = appData.villas[vKey];
  // Yeni borc girisinde tutar, mulkun girilmis temizlik maliyetidir; yoksa
  // bos kalir. 1.500 TL on-doldurmak, kullanicinin hic girmedigi bir tutari
  // borc defterine yazmasina yol aciyordu.
  document.getElementById('hkAmount').value = Number(vConf?.cleanCost) || '';
  
  document.getElementById('hkDesc').value = '';
  document.getElementById('hkPaidStatus').value = 'PLANNED';
  document.getElementById('hkDeleteBtn').style.display = 'none';

  document.getElementById('cleaningTaskModal').classList.add('active');
}

function openEditCleaningTaskModal(taskId) {
  if (!appData.cleaningTasks) return;
  const rawTask = appData.cleaningTasks.find(t => t.id === taskId || t.dbId === taskId || t.legacyId === taskId);
  if (!rawTask) return;
  const task = normalizeCleaningTask(rawTask, appData.villas || {});

  document.getElementById('cleaningTaskModalTitle').innerText = '✏️ Temizlik Kaydını Düzenle';
  document.getElementById('hkEditTaskId').value = task.id;
  document.getElementById('hkVilla').value = task.villa;
  document.getElementById('hkDate').value = task.date || getTodayStr();
  document.getElementById('hkCleaner').value = task.cleaner || '';
  document.getElementById('hkAmount').value = task.amount;
  document.getElementById('hkDesc').value = task.notes || task.guest || '';
  document.getElementById('hkPaidStatus').value = task.paid ? 'PAID'
    : (task.status === 'DONE' ? 'PENDING' : (task.status === 'SKIPPED' ? 'SKIPPED' : 'PLANNED'));
  document.getElementById('hkDeleteBtn').style.display = 'inline-block';

  document.getElementById('cleaningTaskModal').classList.add('active');
}

function closeCleaningTaskModal() {
  const modal = document.getElementById('cleaningTaskModal');
  if (modal) modal.classList.remove('active');
}

async function saveCleaningTask(e) {
  e.preventDefault();
  if (!appData.cleaningTasks) appData.cleaningTasks = [];

  const editId = document.getElementById('hkEditTaskId').value;
  const villa = document.getElementById('hkVilla').value;
  const date = document.getElementById('hkDate').value;
  const cleaner = document.getElementById('hkCleaner').value.trim();
  if (!cleaner) {
    alert('Lütfen temizlik personelini belirtin.');
    return;
  }
  const hamTutar = String(document.getElementById('hkAmount').value || '').trim();
  const amount = hamTutar === '' ? 0 : parseCleaningAmountInput(hamTutar);
  if (amount === null) {
    alert('Lütfen geçerli bir tutar giriniz (ör. 1.500 veya 1500,50).');
    return;
  }
  const notes = document.getElementById('hkDesc').value.trim();
  const secim = document.getElementById('hkPaidStatus').value;
  const paid = secim === 'PAID';
  // Odenmis ya da borc olan temizlik yapilmistir (K-04).
  const status = (secim === 'PAID' || secim === 'PENDING') ? 'DONE' : (secim === 'SKIPPED' ? 'SKIPPED' : 'PLANNED');
  if (status === 'DONE' && date > getTodayStr()) {
    alert('Henüz gelmemiş bir gün için temizlik "yapıldı" kaydedilemez.');
    return;
  }

  let taskRecord = null;
  if (editId) {
    const existing = appData.cleaningTasks.find(t => t.id === editId || t.dbId === editId || t.legacyId === editId);
    if (existing) {
      taskRecord = normalizeCleaningTask({
        ...existing,
        villa, date, cleaner, amount, notes,
        paid, status,
        paidDate: paid ? (existing.paidDate || getTodayStr()) : null
      }, appData.villas || {});
    }
  } else {
    const newId = 'TASK-CLN-' + Date.now().toString() + '-' + Math.random().toString(36).slice(2, 8);
    taskRecord = normalizeCleaningTask({
      id: newId,
      villa,
      guest: '',
      date,
      cleaner,
      amount,
      paid,
      status,
      paidDate: paid ? getTodayStr() : null,
      notes
    }, appData.villas || {});
  }

  if (!taskRecord) {
    if (window.showToast) window.showToast('⚠️ Düzenlenecek temizlik kaydı bulunamadı.', 'error');
    return false;
  }

  const saveButton = document.getElementById('hkSaveBtn');
  if (saveButton) saveButton.disabled = true;
  let result;
  try {
    result = await persistCleaningTaskDraft(taskRecord);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
  if (!result.ok) return false;

  taskRecord = result.task;
  upsertCleaningTaskInMemory(taskRecord, editId);

  closeCleaningTaskModal();
  saveAppData();
  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();
  renderOperationsTab();

  return true;
}

async function deleteCleaningTask(taskId) {
  if (!confirm('Bu temizlik kaydını silmek istediğinize emin misiniz?')) return false;
  const task = findCleaningTask(taskId);
  if (!task) return false;

  // Once veritabani: gorev satiri ve (varsa) eski EXP-CLEAN-* gider satiri.
  // Bir zamanlar silme beklenmiyor, hata okunmuyor ve bagli gider yalniz
  // bellekten siliniyordu; ekran "silindi" diyor, kayit veritabaninda
  // duruyordu (L-30).
  try {
    const eskiGider = findLegacyCleaningExpense(task);
    if (isCloudTenant(getActiveTenantId())) {
      await cloudDeleteCleaningTask(task.dbId || task.id);
      if (eskiGider) await cloudDeleteCleaningExpense(eskiGider.legacyId || eskiGider.id);
    }
    const kimlikler = new Set([task.id, task.dbId, task.legacyId].filter(Boolean));
    appData.cleaningTasks = appData.cleaningTasks.filter(t => ![t.id, t.dbId, t.legacyId].some(k => k && kimlikler.has(k)));
    if (eskiGider && appData.expenses) appData.expenses = appData.expenses.filter(e => e !== eskiGider);
  } catch (err) {
    const mesaj = '⚠️ ' + (err?.message || 'Temizlik kaydı silinemedi.');
    if (window.showToast) window.showToast(mesaj, 'error'); else console.error(mesaj);
    if (typeof loadTenantAppData === 'function' && isCloudTenant(getActiveTenantId())) {
      try { await loadTenantAppData(getActiveTenantId()); } catch (_) { /* yeniden yukleme de dustu */ }
    }
    return false;
  }

  renderHousekeepingTab();
  renderDailyOps();
  renderExpensesTable();
  renderFinanceModule();
  if (window.showToast) window.showToast('🗑️ Temizlik kaydı silindi.');
  return true;
}

function deleteCleaningTaskFromModal() {
  const editId = document.getElementById('hkEditTaskId').value;
  if (editId) {
    deleteCleaningTask(editId).then(ok => { if (ok) closeCleaningTaskModal(); });
  }
}

// -------------------------------------------------------------
// 📅 30 GÜNLÜK GÖRSEL DOLULUK ÇİZELGESİ (TAPE CHART)
// -------------------------------------------------------------
let tapeChartMonth = getTodayStr().slice(0, 7);

function populateTapeChartMonthSelect() {
  const select = document.getElementById('tapeChartMonthSelect');
  if (!select) return;
  select.innerHTML = '';

  ALL_FINANCIAL_MONTHS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    let label = getPeriodDisplayName(m);
    if (m === getTodayStr().slice(0, 7)) label += ' (Güncel Ay)';
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
  if (idx === -1) idx = ALL_FINANCIAL_MONTHS.indexOf(getTodayStr().slice(0, 7));
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
  const year = Number(yStr);
  const month = Number(mStr);
  if (!/^\d{4}-\d{2}$/.test(tapeChartMonth)
      || !Number.isInteger(year) || !Number.isInteger(month)
      || month < 1 || month > 12) {
    container.innerHTML = '<div class="empty-state">Takvim gösterilemedi: geçerli bir ay seçilmedi.</div>';
    return;
  }

  const vKeys = (typeof appData !== 'undefined' && appData.villas)
    ? Object.keys(appData.villas)
    : [];
  if (vKeys.length === 0) {
    container.innerHTML = '<div class="empty-state">Henüz gerçek mülk kaydı yok; doluluk takvimi oluşturulamadı.</div>';
    return;
  }
  
  // Exact days in month (30 for Sep, 31 for Dec, 28/29 for Feb)
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const dayNamesShort = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const todayStr = getTodayStr();

  let tableHtml = '<table class="tape-chart-table"><thead><tr><th class="tape-villa-th">VİLLA \\ GÜNLER</th>';
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
    const vConf = appData.villas?.[vKey] || {};
    const vName = vConf.name || vKey;
    const vPropId = vConf.id;
    tableHtml += `<tr><td class="tape-villa-td"><strong>${escapeHtml(vName)}</strong></td>`;

    const vBookings = (appData.bookings || []).filter(b => 
      (b.villa === vKey || (vPropId && b.propertyId === vPropId)) && b.status !== 'CANCELLED'
    );

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
        else if (isDirectBookingChannel(booking.channel, appData.bookingChannels)) chClass = 'tape-direct';

        const isCheckInDay = (booking.checkIn === dateStr);
        const isCheckOutDay = (booking.checkOut === dateStr);

        tableHtml += `<td class="tape-cell ${isToday ? 'today-cell' : ''}" title="${escapeHtml(booking.guest)} (${escapeHtml(booking.channel)}) | ${booking.checkIn} - ${booking.checkOut} | Toplam: ${booking.gross} TL (Tıklayarak düzenleyin)" data-onclick="editBooking(decodeURIComponent('${encodeActionArg(booking.id)}'))" style="cursor: pointer;">
          <div class="tape-booked ${chClass}" style="${isCheckInDay ? 'border-left: 3px solid #FCD34D;' : ''}">
            ${escapeHtml(booking.guest.split(' ')[0])}
          </div>
        </td>`;
      } else {
        tableHtml += `<td class="tape-cell ${isToday ? 'today-cell' : ''}" title="${formatTrDate(dateStr)} - Müsait (Rezervasyon eklemek için tıklayın)" data-onclick="openBookingForDate(decodeURIComponent('${encodeActionArg(vKey)}'), decodeURIComponent('${encodeActionArg(dateStr)}'))" style="cursor: pointer; ${isToday ? 'background: rgba(245, 158, 11, 0.05);' : ''}"></td>`;
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
  if (vSelect) vSelect.value = villa;
  // Takvimden gelen gun giris tarihi olarak yuklenir; cikis kullanicinin
  // secimine birakilir. Gizli inputa dogrudan yazmak takvim durumunu
  // guncellemezdi, bu yuzden aralik API'si uzerinden gidilir.
  setResDateRange(dateStr, null);
  toggleResDatePicker(true);
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
  const ornekVilla = Object.values(appData.villas || {})[0];
  const sample = "Örnek Misafir: Selamlar, 18-23 Eylül arası 5 gece " + ((ornekVilla && ornekVilla.name) || "villanız") + " için 85.000 TL konuştuk, 8 kişiyiz onaylıyoruz. Tel: +90 532 555 1234";
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

function parseWhatsAppMessageText(text, villas = {}, todayStr = getTodayStr()) {
  const normalizedText = String(text || '').trim();
  const emptyResult = {
    guest: null,
    phone: null,
    villa: null,
    amount: null,
    pax: null,
    checkIn: null,
    checkOut: null
  };
  if (!normalizedText) return emptyResult;

  text = normalizedText;
  const lower = text.toLowerCase();

  // Mulk yalnizca mesajda gercekten geciyorsa secilir. Ilk mulku varsaymak,
  // eksik bilgiyi gercek veri gibi kaydediyordu.
  const mulkler = Object.entries(villas || {});
  let detectedVilla = null;
  for (const [anahtar, v] of mulkler) {
    const ad = ((v && v.name) || '').toLowerCase();
    const anahtarMetni = String(anahtar).toLowerCase();
    if ((ad && lower.includes(ad)) || (anahtarMetni && lower.includes(anahtarMetni))) {
      detectedVilla = anahtar;
      break;
    }
  }

  let detectedGuest = null;
  const prefixMatch = text.match(/(?:misafir|isim|ad\s*soyad|ad|konuk)\s*[:=-]\s*([A-Za-zÇĞİÖŞÜçğıöşü\s]{3,30})/i);
  if (prefixMatch) {
    detectedGuest = prefixMatch[1].trim();
  } else {
    const waHeaderMatch = text.match(/^(?:\[[\d\.\,\:\s]+\]\s*)?([A-Za-zÇĞİÖŞÜçğıöşü\s]{3,25}):/m);
    if (waHeaderMatch) {
      detectedGuest = waHeaderMatch[1].trim();
    } else {
      const wordsMatch = text.match(/\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+))\b/);
      // Misafir adi sanilmamasi gereken kelimeler: musterinin KENDI mulk
      // adlari + kanal ve selamlama sozcukleri. Burada bes uydurma villa adi
      // sabit yaziliydi; gercek mulk adlari ise listede olmadigi icin misafir
      // adi olarak algilanabiliyordu.
      const mulkAdlari = Object.values(villas || {})
        .map(v => v && v.name).filter(Boolean);
      const yasakli = mulkAdlari.concat(['WhatsApp', 'Airbnb', 'Booking', 'Selamlar', 'Merhaba', 'İyi Günler']);
      if (wordsMatch && !yasakli.includes(wordsMatch[1])) {
        detectedGuest = wordsMatch[1];
      }
    }
  }

  let detectedPhone = null;
  const phoneMatch = text.match(/(?:\+?90\s*|\b0)?\s*(5\d{2})[\s\.-]*(\d{3})[\s\.-]*(\d{2})[\s\.-]*(\d{2})\b/);
  if (phoneMatch) {
    detectedPhone = `0${phoneMatch[1]} ${phoneMatch[2]} ${phoneMatch[3]} ${phoneMatch[4]}`;
  }

  // Ucret icin para birimi veya fiyat/butce baglami aranir. Boylece telefon
  // numaralari ve tarihler ucret olarak yorumlanmaz.
  let detectedAmount = null;
  const kMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:bin|k)\b/i);
  if (kMatch) {
    detectedAmount = Number(kMatch[1].replace(',', '.')) * 1000;
  } else {
    const currencyMatch = text.match(/(\d{1,3}(?:\.\d{3})+|\d{1,7}(?:[.,]\d{1,2})?)\s*(?:tl|₺|euro|usd|lira)/i);
    const contextMatch = text.match(/(?:bütçe(?:miz)?|butce(?:miz)?|fiyat|tutar|teklif)\D{0,20}(\d{1,3}(?:\.\d{3})+|\d{1,7}(?:[.,]\d{1,2})?)/i);
    const priceMatch = currencyMatch || contextMatch;
    if (priceMatch) {
      const rawAmount = priceMatch[1];
      const decimalSeparator = rawAmount.includes(',') && !/^\d{1,3}(?:\.\d{3})+$/.test(rawAmount);
      detectedAmount = Number(decimalSeparator
        ? rawAmount.replace(/\./g, '').replace(',', '.')
        : rawAmount.replace(/\./g, ''));
      if (!Number.isFinite(detectedAmount)) detectedAmount = null;
    }
  }

  let detectedPax = null;
  const paxMatch = text.match(/(\d{1,2})\s*(?:kişi|kisi|pax|yetişkin|yetiskin|konuk)/i);
  if (paxMatch) {
    detectedPax = Number(paxMatch[1]);
  }

  let checkIn = null;
  let checkOut = null;
  const todayMatch = String(todayStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const currentYear = todayMatch ? Number(todayMatch[1]) : new Date().getFullYear();
  const normalizedToday = todayMatch ? todayMatch[0] : `${currentYear}-01-01`;

  function validIsoDate(year, month, day) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const candidate = new Date(`${iso}T00:00:00Z`);
    return candidate.getUTCFullYear() === Number(year) &&
      candidate.getUTCMonth() + 1 === Number(month) &&
      candidate.getUTCDate() === Number(day) ? iso : null;
  }

  function inferFutureRange(startMonth, startDay, endMonth, endDay) {
    let startYear = currentYear;
    let start = validIsoDate(startYear, startMonth, startDay);
    if (start && start < normalizedToday) {
      startYear += 1;
      start = validIsoDate(startYear, startMonth, startDay);
    }
    const crossesYear = Number(endMonth) < Number(startMonth) ||
      (Number(endMonth) === Number(startMonth) && Number(endDay) < Number(startDay));
    const end = validIsoDate(startYear + (crossesYear ? 1 : 0), endMonth, endDay);
    return { start, end };
  }

  const sameMonthMatch = text.match(/(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i);
  const diffMonthMatch = text.match(/(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s*[-–/]\s*(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i);
  const isoMatch = text.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})\s*[-–]\s*(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);

  if (isoMatch) {
    checkIn = validIsoDate(isoMatch[3], isoMatch[2], isoMatch[1]);
    checkOut = validIsoDate(isoMatch[6], isoMatch[5], isoMatch[4]);
  } else if (diffMonthMatch) {
    const m1Name = diffMonthMatch[2].toLowerCase();
    const m2Name = diffMonthMatch[4].toLowerCase();
    const m1 = MONTH_MAP_TR[m1Name];
    const m2 = MONTH_MAP_TR[m2Name];

    if (m1 && m2) {
      const range = inferFutureRange(m1, diffMonthMatch[1], m2, diffMonthMatch[3]);
      checkIn = range.start;
      checkOut = range.end;
    }
  } else if (sameMonthMatch) {
    const mName = sameMonthMatch[3].toLowerCase();
    const m = MONTH_MAP_TR[mName];
    if (m) {
      const range = inferFutureRange(m, sameMonthMatch[1], m, sameMonthMatch[2]);
      checkIn = range.start;
      checkOut = range.end;
    }
  }

  return {
    guest: detectedGuest,
    phone: detectedPhone,
    villa: detectedVilla,
    amount: detectedAmount,
    pax: detectedPax,
    checkIn,
    checkOut
  };
}

function parseWhatsAppMessage() {
  const text = (document.getElementById('waRawInput')?.value || '').trim();
  if (!text) return;

  const parsed = parseWhatsAppMessageText(text, appData.villas || {});

  // Populate preview form
  document.getElementById('waParsedGuest').value = parsed.guest || '';
  document.getElementById('waParsedPhone').value = parsed.phone || '';
  document.getElementById('waParsedVilla').value = parsed.villa || '';
  document.getElementById('waParsedAmount').value = parsed.amount ?? '';
  document.getElementById('waParsedCheckIn').value = parsed.checkIn || '';
  document.getElementById('waParsedCheckOut').value = parsed.checkOut || '';
  document.getElementById('waParsedPax').value = parsed.pax ?? '';
  
  const notes = `WhatsApp mesajından aktarıldı: ${text.slice(0, 60)}...`;
  document.getElementById('waParsedNotes').value = notes;
}

/**
 * WhatsApp talebini Lead defterine yazar.
 *
 * Bir zamanlar kaydi yalnizca `appData.leads`'e itip `saveAppData()`
 * cagiriyor ve kullaniciya "başarıyla kaydedildi" diyordu. saveAppData()
 * hicbir sey kaydetmez (6. bolum): talep sayfa yenilenince kayboluyordu.
 * Artik `createLead()` uzerinden gecer — dogrulama, bulut yazmasi ve
 * appData guncellemesi oradadir.
 */
async function saveWaAsLead() {
  const guest = document.getElementById('waParsedGuest').value.trim() || 'WhatsApp Misafiri';
  const villa = document.getElementById('waParsedVilla').value;
  const quote = Number(document.getElementById('waParsedAmount').value) || 0;
  const phone = document.getElementById('waParsedPhone').value.trim();
  const notes = document.getElementById('waParsedNotes').value.trim();

  try {
    await createLead({
      guest: guest,
      guestName: guest,
      phone: phone,
      villa: villa,
      channel: 'WhatsApp',
      quote: quote,
      status: 'FOLLOW_UP',
      notes: notes || 'WhatsApp Business talebi'
    });
  } catch (err) {
    alert('⚠️ Talep kaydedilemedi: ' + (err?.message || 'veritabanı hatası'));
    return;
  }

  closeWhatsAppModal();
  switchTab('leads');
  renderManageLeadsTable();

  alert(`✅ WhatsApp talebi "${guest}" başarıyla Lead & Satış listesine kaydedildi!`);
}

async function saveWaAsBooking() {
  const guest = document.getElementById('waParsedGuest').value.trim() || 'WhatsApp Misafiri';
  const villa = document.getElementById('waParsedVilla').value;
  const gross = Number(document.getElementById('waParsedAmount').value) || 0;
  const checkIn = document.getElementById('waParsedCheckIn').value;
  const checkOut = document.getElementById('waParsedCheckOut').value;
  const paxText = document.getElementById('waParsedPax').value;
  const pax = Number(paxText);
  const phone = document.getElementById('waParsedPhone').value.trim();

  if (!villa) {
    alert('Lütfen rezervasyon için villayı seçiniz!');
    return;
  }

  if (!paxText || !Number.isFinite(pax) || pax <= 0) {
    alert('Lütfen rezervasyon için kişi sayısını giriniz!');
    return;
  }

  if (!checkIn || !checkOut) {
    alert('Lütfen rezervasyon için giriş ve çıkış tarihlerini seçiniz!');
    return;
  }

  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  if (!Number.isInteger(nights) || nights <= 0) {
    alert('Çıkış tarihi giriş tarihinden sonra olmalıdır.');
    return;
  }

  try {
    await createBooking({
      villa: villa,
      guest: guest,
      phone: phone,
      checkIn: checkIn,
      checkOut: checkOut,
      nights: nights,
      channel: 'WHATSAPP',
      gross: gross,
      otaComm: 0,
      // Temizlik ucreti bilinmiyor; 0 tasinir, uydurulmaz (3.6). Isletme
      // rezervasyonu duzenleyip gercek rakami girdikce veri duzelir.
      cleanFee: 0,
      pax: pax,
      status: 'CONFIRMED'
    });
  } catch (err) {
    alert('⚠️ Rezervasyon kaydedilemedi: ' + (err?.message || 'veritabanı hatası'));
    return;
  }

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
  // Gecmiste iki sekme vardi; "Canli QR / Whapi" sekmesi sahte oldugu icin
  // kaldirildi. Ayristirici tek panel olarak kaldi.
  const p1 = document.getElementById('waPaneParser');
  if (p1) p1.style.display = 'block';
}

// `showLiveQrCodeModal()` KALDIRILDI: sahte QR kutusunu acip kapatiyordu.

// `saveWhapiSettings()` KALDIRILDI.
//
// Whapi/WhatsApp "canli baglanti" ozelliginin TAMAMI sahteydi:
//   • "QR Kodu Göster" bir div acip kapatiyordu; icindeki QR elle cizilmis
//     bir SVG'ydi, okutulsa hicbir sey yapmazdi.
//   • Token `appData.waConfig.token`'a yaziliyordu; oradan HICBIR YER
//     okumuyordu ve `saveAppData()` de kaydetmiyordu. Musteri gercek bir
//     API anahtarini girip cope atiyordu.
//   • Durum rozeti sabit "🟢 Hazır / Simülasyon Aktif" yaziyordu.
//   • Whapi.cloud'a tek bir istek gitmiyordu.
//
// Calisan ozellik korundu: misafirin mesajini yapistirip talebe veya
// rezervasyona cevirme (parseWhatsAppMessage + saveWaAsLead /
// saveWaAsBooking). Ticari bir uruns musteriye kurulu olmayan bir
// entegrasyonu kurulmus gibi gosteremez (3.6).

// `simulateIncomingWhatsAppTest()` KALDIRILDI.
//
// "⚡ Gelen Canlı Mesajı Simüle Et" dugmesi, musterinin GERCEK talep
// defterine sahte bir kayit yaziyordu: uc uydurma misafir (Cemil Öz /
// 55.000 TL, Deniz Aksu / 42.000 TL, Alper Tunç / 26.000 TL) ve silinmis
// demo villa anahtarlari (AZURE, OLIVE, BELLA). Kayit huniye giriyor,
// donusum orani ve talep analitigi bozuluyordu. Ustelik bildirimde
// "Yeni CANLI WhatsApp Mesaji Yakalandi" yaziyordu — canli degildi.
//
// Ticari bir urunde musterinin defterine test kaydi yazan bir dugme
// bulunmaz (3.6).

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
            <span>${escapeHtml(r.label)}</span>
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
  const villaCounts = Object.fromEntries(Object.keys(appData.villas || {}).map(k => [k, 0]));
  leads.forEach(l => {
    const key = l.villa || l.propertyId;
    if (Object.prototype.hasOwnProperty.call(villaCounts, key)) villaCounts[key]++;
  });

  const villaBox = document.getElementById('waVillaDemandList');
  if (villaBox) {
    villaBox.innerHTML = '';
    const totalVCounts = totalLeads || 1;
    // Musterinin kendi mulkleri. Bes uydurma villa sabit yaziliydi ve talep
    // grafigi herkese ayni bes ismi gosteriyordu.
    const RENKLER = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#F97316', '#14B8A6'];
    const villaMeta = Object.keys(appData.villas || {}).map((k, i) => ({
      key: k,
      name: (appData.villas[k] && appData.villas[k].name) || k,
      color: RENKLER[i % RENKLER.length]
    }));

    if (villaMeta.length === 0) {
      villaBox.innerHTML = '<div style="font-size:12px; color:var(--text-muted);">Henüz mülk eklenmemiş.</div>';
    }

    villaMeta.forEach(v => {
      const cnt = villaCounts[v.key] || 0;
      const pct = Math.round((cnt / totalVCounts) * 100);
      villaBox.innerHTML += `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span>${escapeHtml(v.name)}</span>
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
        • <strong>Dönüşüm Verimliliği:</strong> ${totalLeads > 0 ? `${totalLeads} talebin ${wonLeads.length} tanesi rezervasyona dönüştü (%${convRate}). Kayıtlı teklif toplamı <strong>${wonRevenue.toLocaleString('tr-TR')} TL</strong>.` : 'Henüz talep kaydı yok; dönüşüm oranı hesaplanamadı.'}
      </div>
      <div style="margin-bottom: 8px;">
        • <strong>Kaçan Satış Aksiyonu:</strong> Kaybedilen taleplerin en büyük sebebi <em>"Tarih Dolu"</em> ve <em>"Fiyat Yüksek"</em>. İstenen tarih doluysa misafire hemen yakın boş gap gecelerini alternatif olarak sunun.
      </div>
      ${(() => {
        // Bu cumle sabitti: "Taleplerin %60'indan fazlasi Villa Azure Bay ve
        // Villa Olive Garden icin geliyor" — hicbir hesaba dayanmiyordu.
        const siralı = Object.entries(villaCounts)
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1]);
        if (!siralı.length) return '';
        const guvenliAd = k => escapeHtml((appData.villas && appData.villas[k] && appData.villas[k].name) || k);
        const top = siralı[0];
        const pay = totalLeads > 0 ? Math.round((top[1] / totalLeads) * 100) : 0;
        const zayif = siralı.length > 1 ? siralı[siralı.length - 1] : null;
        return `<div>
        • <strong>Talep Yoğunluğu:</strong> Taleplerin %${pay}'i <strong>${guvenliAd(top[0])}</strong> için geliyor (${top[1]} talep). Bu mülkte taban fiyatı savunun${zayif ? `; en az talep gören <strong>${guvenliAd(zayif[0])}</strong> için hafta içi paket teklifi deneyin` : ''}.
      </div>`;
      })()}
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

// Satir ici ifade olarak yazilamayan iki dugme (L-15: data-on* govdesi yalniz
// izinli fonksiyon cagirir, ozellik erisimi yapamaz).
function reloadPage() {
  window.location.reload();
}

function openExcelFilePicker() {
  const input = document.getElementById('excelFileInput');
  if (input) input.click();
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.header-dropdown-wrap')) {
      closeAllHeaderDropdowns();
    }
  });
}



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

/**
 * Bir ayin GERCEK rakamlari: ciro, OPEX, CAPEX, satilan gece.
 *
 * Gelir gecelere esit bolunur ve her ay yalnizca kendi gecelerinin payini
 * alir (3.4 tahakkuk kurali) — ay sinirini kesen rezervasyon iki aya da
 * tam tutariyla yazilmaz.
 *
 * Bu hesap bir zamanlar yalnizca `getMonthlyKpiDataset()` icinde, bir
 * `if (hasStatic)` dalinin yaninda duruyordu; `hasStatic` sabit `false`
 * oldugu icin o dal olu kodtu ve icinde silinmis demo veri setine yapilan
 * cagrilar kalmisti. Tek kaynaga cikarildi: YoY karsilastirmasi da ayni
 * tabani kullanir, yoksa iki ekran ayni ay icin farkli ciro raporlar.
 */
function computeMonthActuals(monthKey, villa) {
  // Mulk filtresi (L-37): KPI izleyici ve YoY eskiden secili mulku yok sayip
  // hep portfoyu gosteriyordu.
  const l = computeMonthLedger(monthKey, villa || 'ALL');
  if (!l) return { ciro: 0, roomRevenue: 0, opex: 0, capex: 0, nights: 0, netProfit: 0 };
  return {
    ciro: l.totalRevenue,
    roomRevenue: l.netRoomRevenue,
    opex: l.totalOpex,
    capex: l.capex,
    nights: l.soldNights,
    netProfit: l.netProfit
  };
}

function getMonthlyKpiDataset() {
  const months = ALL_FINANCIAL_MONTHS.slice();

  const dataset = [];

  months.forEach(m => {
    const [metricYear, metricMonth] = m.split('-').map(Number);
    const targetFilter = { period: m };
    const secili = (typeof currentFilter !== 'undefined' && currentFilter && currentFilter.villa) || 'ALL';
    const target = getConfiguredRevenueTarget(targetFilter, appData.targets, secili) || 0;
    const monthName = getPeriodDisplayName(m);

    const { ciro, roomRevenue, opex, capex, nights, netProfit } = computeMonthActuals(m, secili);
    // ADR ve RevPAR NET ODA GELIRINDEN (K-04). Toplam ciro temizlik ucretini
    // de icerir; ona bolmek gecelik fiyati sisirirdi.
    const adr = nights > 0 ? Math.round(roomRevenue / nights) : 0;
    const margin = ciro > 0 ? Number(((netProfit / ciro) * 100).toFixed(1)) : 0;
    const available = typeof FinancialMetricsService !== 'undefined'
      ? FinancialMetricsService.calculateAvailableNights(secili === 'ALL' ? Object.values(appData.villas || {}) : [appData.villas[secili]].filter(Boolean), metricYear, metricMonth, appData.maintenance || [])
      : null;
    const occupancy = available > 0 ? Number(((nights / available) * 100).toFixed(1)) : null;
    const revpar = available > 0 ? Math.round(roomRevenue / available) : null;

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
      isCurrentMonth: (m === getCurrentMonthKey()),
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
      const shortMonth = getPeriodDisplayName(d.key) ? getPeriodDisplayName(d.key).split(' ')[0].substring(0, 3) : parts[1];
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
        <td style="font-weight: 700; white-space: nowrap;">${d.occupancy === null ? '—' : '%' + d.occupancy}</td>
        <td style="font-weight: 700; color: #FBBF24; white-space: nowrap;">${d.adr > 0 ? (Math.round(d.adr).toLocaleString('tr-TR') + ' ₺') : '-'}</td>
        <td style="font-weight: 600; color: #DDD6FE; white-space: nowrap;">${d.revpar > 0 ? (Math.round(d.revpar).toLocaleString('tr-TR') + ' ₺') : '-'}</td>
        <td style="color: #F87171; font-weight: 600; white-space: nowrap;">${Math.round(d.totalExp).toLocaleString('tr-TR')} ₺</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-secondary btn-sm" data-onclick="filterByPeriod(decodeURIComponent('${encodeActionArg(d.key)}'))" style="padding: 4px 8px; font-size: 11px;">
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
    title: 'Toplam Gelir (Net Oda Geliri + Temizlik Geliri)',
    icon: '💰',
    category: 'TEMEL FİNANS',
    badgeClass: 'badge-blue',
    summary: 'Seçili döneme düşen konaklama gecelerinin geliridir: indirimler düşülmüş oda geliri ile misafirden alınan temizlik ücretinin toplamı.',
    warning: '⚠️ OTA komisyonu ve ödeme komisyonu geliri azaltmaz; gider olarak ayrıca düşülür. Ciro kâr demek değildir.',
    formula: 'Net Oda Geliri = Brüt − Temizlik Ücreti − İndirim · Toplam Gelir = Net Oda Geliri + Temizlik Ücreti',
    example: 'Ay sınırını aşan rezervasyonun yalnız bu döneme düşen gecelerinin payı sayılır.',
    actionRule: 'Ciro hacminizi gösterir ama asıl odaklanmanız gereken rakam cebinizde kalan Net Kâr\'dır.'
  },
  'TARGET': {
    title: 'Hedef Ciro & Bütçe Planlaması',
    icon: '🎯',
    category: 'STRATEJİ & HEDEF',
    badgeClass: 'badge-amber',
    summary: 'O ay için ulaşmayı planladığınız gelir eşiğidir. İşletmenizin rotasını ve başarı çıtasını belirler.',
    warning: '💡 Hedefi kendi kapasiteniz, geçmiş kayıtlarınız ve sezonsal talebinizle belirleyin.',
    formula: 'Tahmini Satılabilir Gece × Hedeflenen ADR',
    example: 'Kayıtlı hedef ile aynı dönemin gerçekleşen cirosu karşılaştırılır.',
    actionRule: 'Hedefe ayın ortasında ulaştıysanız hemen kalan günlerin fiyatını artırın (yield management). Geride kaldıysanız gap gecelerine indirim uygulayın.'
  },
  'NET_PROFIT': {
    title: 'Net Nakit Kâr (Net Cash Profit)',
    icon: '💵',
    category: 'KASADA KALAN SERBEST NAKİT',
    badgeClass: 'badge-green',
    summary: 'Cirodan tüm operasyonel harcamalar (Opex) ve mülk yatırımları (Capex) düşüldükten sonra işletme sahibinin cebinde kalan net nakittir.',
    warning: '🌟 Yüksek ciro tek başına yüksek kâr anlamına gelmez; kayıtlı gider ve yatırımları birlikte değerlendirin.',
    formula: 'Net Kâr = Toplam Gelir − OPEX − CAPEX · OPEX = elle giderler + OTA komisyonu + ödeme komisyonu + yapılmış temizlik maliyeti',
    example: 'Temizlik maliyeti temizlik "yapıldı" işaretlendiği günün ayına yazılır; ödeme ayrı bir durumdur.',
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
    example: 'Seçili dönemdeki OPEX ve CAPEX kayıtları ayrı toplanıp birlikte gösterilir.',
    actionRule: 'Giderlerin ciroya oranı %70\'i aşıyorsa harcama kalemlerini (özellikle komisyon ve sarfiyatları) denetleyin.'
  },
  'SOLD_NIGHTS': {
    title: 'Satılan Gece Sayısı (Oda-Gece Hacmi)',
    icon: '🌙',
    category: 'KAPASİTE & HACİM',
    badgeClass: 'badge-blue',
    summary: 'O ay boyunca villalarınızda misafirlerin fiilen konakladığı toplam gece sayısıdır.',
    warning: 'Kapasite, seçili dönemin gerçek gün sayısı ile aktif mülk sayısından hesaplanır.',
    formula: 'Tüm villaların ay içindeki rezerve gece toplamı.',
    example: 'Seçili döneme düşen rezervasyon geceleri çakışmalar giderilerek toplanır.',
    actionRule: 'Yüksek sezonda satılan geceyi 70\'in üzerine çıkarmak doluluk başarısıdır.'
  },
  'ADR': {
    title: 'ADR (Ortalama Günlük Satış Fiyatı)',
    icon: '🏷️',
    category: 'FİYATLANDIRMA GÜCÜ',
    badgeClass: 'badge-amber',
    summary: 'Villalarınızı bir geceliğine ortalama kaça sattığınızı gösteren fiyattır. (Average Daily Rate).',
    warning: '🌟 Başlangıç Seviyesi Altın Kural: Tüm evleriniz doluyorsa ama ADR çok düşükse, evlerinizi ucuza satıyorsunuz demektir! Fiyatı hemen artırın.',
    formula: 'ADR = Net Oda Geliri ÷ Satılan Gece Sayısı',
    example: 'Seçili dönemin oda geliri, aynı dönemde satılan geceye bölünür.',
    actionRule: 'Hafta sonu yüksek ADR, hafta içi doluluk odaklı dengeli ADR uygulayın.'
  },
  'REVPAR': {
    title: 'RevPAR (Oda Başına Düşen Gelir)',
    icon: '📈',
    category: 'OTELCİLİĞİN ALTIN KARNESİ',
    badgeClass: 'badge-purple',
    summary: 'Villanız boş ya da dolu fark etmeksizin, takvimdeki her gün için size kaç TL kazandırdığını gösteren en dürüst başarı karnesidir.',
    warning: 'RevPAR, fiyat ile kullanılabilir kapasitenin ne kadarının satıldığını aynı ölçüde birleştirir.',
    formula: 'RevPAR = Net Oda Geliri ÷ Kullanılabilir Gece (= ADR × Doluluk %)',
    example: 'Seçili dönemin oda geliri, kullanılabilir mülk-gece kapasitesine bölünür.',
    actionRule: 'RevPAR\'ı artırmanın yolu: Doluluk %70\'i aştığında fiyatı yükseltmektir.'
  },
  'OCCUPANCY': {
    title: 'Doluluk Oranı (%)',
    icon: '📊',
    category: 'KAPASİTE VERİMLİLİĞİ',
    badgeClass: 'badge-blue',
    summary: 'Villalarınızın ayın yüzde kaçında misafirle dolu olduğunu gösterir.',
    warning: 'Doluluk tek başına yorumlanmaz; ADR, RevPAR ve kârlılıkla birlikte değerlendirilir.',
    formula: '(Satılan Gece Sayısı ÷ Kullanılabilir Gece Sayısı) × 100',
    example: 'Satılan mülk-gece sayısı, seçili dönemin kullanılabilir mülk-gece kapasitesine bölünür.',
    actionRule: '%100 doluluk her zaman iyi değildir! %100 doluluk genellikle \'fiyatı çok ucuz tuttunuz\' anlamına gelir.'
  },
  'OPEX': {
    title: 'OPEX (Operasyonel İşletme Giderleri)',
    icon: '⚡',
    category: 'RUTİN GİDERLER',
    badgeClass: 'badge-rose',
    summary: 'Tesisin günlük olarak çalışmaya devam etmesi için yapılan düzenli, tekrarlayan harcamalardır.',
    warning: 'Gerçek temizlik maliyeti, elektrik/su/internet faturası, sarfiyat ve OTA komisyonları OPEX’tir. Misafirden alınan temizlik bedeli gelir bileşenidir.',
    formula: 'Tüm operasyonel cari fatura ve sarfiyat toplamı.',
    example: 'Seçili dönemde OPEX olarak sınıflandırılmış gider kayıtları toplanır.',
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
    example: 'Seçili dönemde CAPEX olarak sınıflandırılmış yatırım kayıtları toplanır.',
    actionRule: 'Doğru bir CAPEX yatırımı (örn: ısıtmalı jakuzi), kendini 2-3 ayda gecelik fiyat artışıyla geri öder.'
  },
  'OPERATING_PROFIT': {
    title: 'Faaliyet Kârı',
    icon: '📉',
    category: 'OPERASYON VERİMLİLİĞİ',
    badgeClass: 'badge-blue',
    summary: 'Cirodan OPEX düşüldükten sonra, yatırım harcamaları düşülmeden önce kalan işletme sonucudur.',
    warning: 'Faaliyet kârı CAPEX’i içermez; sahibin cebinde kalan nihai nakit için Net Nakit Kârı izleyin.',
    formula: 'Faaliyet Kârı = Gerçekleşen Ciro − OPEX',
    example: 'Seçili dönemin gerçekleşen cirosundan aynı dönemin OPEX toplamı düşülür.',
    actionRule: 'Faaliyet marjı düşüyorsa önce komisyon, enerji, temizlik ve sarf giderlerini inceleyin.'
  },
  'GAP_NIGHTS': {
    title: 'Boşluk Geceleri (Gap Nights & Yetim Geceler)',
    icon: '🧩',
    category: 'KAYIP KAZANÇ FIRSATI',
    badgeClass: 'badge-amber',
    summary: 'İki rezervasyon arasında sıkışıp kalan 1 veya 2 günlük boş günlerdir.',
    warning: 'O gün boş kalırsa size maliyeti 0 TL değil, kayıp bir cirodur! O günü fırsat paketiyle satmak saf kârdır.',
    formula: 'İki rezervasyon arasındaki satılmamış 1-2 günlük boşluklar.',
    example: 'Sistem, ardışık rezervasyonlar arasındaki kısa boşlukları gerçek takvimden bulur.',
    actionRule: 'Gap gecesini boş bırakmaktansa normal fiyatın %30 altına \'Son Dakika Fırsatı\' ile satın.'
  },
  'OTA_COMMISSION': {
    title: 'OTA Komisyonları vs Doğrudan Satış',
    icon: '🌐',
    category: 'KOMİSYON TASARRUFU',
    badgeClass: 'badge-green',
    summary: 'OTA platformlarının rezervasyon başına kestiği, kanal ayarınızda veya rezervasyonda kayıtlı aracılık ücretidir.',
    warning: 'Komisyon oranı kanal ve sözleşmeye göre değişir; kayıt yoksa oran veya tasarruf varsayılmaz.',
    formula: 'Kayıtlı OTA Satış Tutarı × Kayıtlı Komisyon Oranı',
    example: 'Kayıtlı OTA komisyonları ile doğrudan kanal satışları ayrı raporlanır.',
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
// Aliases for legacy compatibility

function renderAirbnbAuditRadar() {
  const tbody = document.getElementById('digitalAuditTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const listings = (appData.airbnbListings && Object.keys(appData.airbnbListings).length > 0) 
    ? appData.airbnbListings
    : {};

  let totalWeightedScore = 0;
  let totalReviews = 0;

  Object.keys(listings).forEach(vKey => {
    const item = listings[vKey];
    const rCount = Number(item.reviews) || 0;
    const parsedScore = Number(item.rating);
    const hasRating = item.rating !== null && item.rating !== undefined && item.rating !== '';
    const rScore = hasRating && Number.isFinite(parsedScore) && parsedScore >= 0 && parsedScore <= 5
      ? parsedScore
      : null;
    if (rScore !== null && rCount > 0) {
      totalWeightedScore += (rScore * rCount);
      totalReviews += rCount;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 700; white-space: nowrap;">
        <strong>${escapeHtml(item.name)}</strong>
      </td>
      <td style="font-size: 12px; color: #E2E8F0;">
        <span style="font-weight: 600;">${escapeHtml(item.title)}</span>
        <div style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); margin-top: 2px;">
          airbnb.com.tr/h/${escapeHtml(item.slug)}
        </div>
      </td>
      <td style="white-space: nowrap;">
        <span class="badge ${rScore !== null && rScore >= 4.9 ? 'badge-amber' : 'badge-blue'}" style="font-size: 13px; font-weight: 800; padding: 4px 8px;" title="${rScore === null ? 'Airbnb puanı ölçülemedi' : 'Airbnb puanı'}">
          ${rScore === null ? '—' : rScore.toFixed(2) + ' ★'}
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
  const portfolioAvg = totalReviews > 0 ? (totalWeightedScore / totalReviews) : null;
  const pScoreEl = document.getElementById('airbnbPortfolioScore');
  if (pScoreEl) {
    pScoreEl.innerHTML = portfolioAvg === null
      ? '<span title="Puanı hesaplamak için doğrulanmış ilan puanı ve yorum sayısı gerekli">—</span>'
      : `${portfolioAvg.toFixed(2)} <span class="sub-val" style="color: #FDE68A;">★ / 5.0</span>`;
  }

  const pReviewsEl = document.getElementById('airbnbTotalReviews');
  if (pReviewsEl) pReviewsEl.innerText = `${totalReviews} Değerlendirme (${portfolioLabel()})`;
}

/**
 * Airbnb ilan verisi senkronizasyonu — BAGLANTI YOK, durum acikca soylenir.
 *
 * Bu fonksiyon SENKRONIZASYON YAPMIYORDU. Govdesi 600 ms bekliyor, sonra
 * her ilanin `lastSync` alanina "Şimdi (14:32)" yaziyor ve dugmeyi
 * "✅ Canlı Skorlar Güncel!" yapiyordu. Airbnb'ye hicbir istek gitmiyordu;
 * zaten `appData.airbnbListings` bos bir nesne, yani donguye girecek tek
 * bir ilan bile yoktu. Musteri puanlarinin guncellendigini saniyordu.
 *
 * Ayni sinifin daha once duzeltilen uyesi `runAiListingCritic`: o da her
 * URL icin 79/100 uyduruyordu, artik durumu acikca soyluyor. Kural ayni —
 * bir ozellik gercek veriyi olcemiyorsa bunu SOYLER, skor uydurmaz (3.6).
 */
function syncLiveAirbnbData() {
  const btn = document.getElementById('syncAirbnbBtn');
  const mesaj = 'Airbnb ilan verisi bağlantısı kurulu değil.\n\n' +
    'İlan puanı, yorum sayısı ve sıralama Airbnb tarafından herkese açık ' +
    'bir arayüzle verilmiyor; bu rakamlar ölçülemediği için uydurulmuyor. ' +
    'Bağlantı kurulduğunda bu ekran gerçek verilerle dolacak.';
  if (typeof showToast === 'function') showToast(mesaj, 'info');
  else alert(mesaj);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⛔ Bağlantı kurulu değil';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '🔄 Airbnb\'den Senkronize Et';
    }, 3000);
  }
}


// =============================================================
// 📢 PAZARLAMA & YAPAY ZEKA REKLAM RADARI (MARKETING & AI GROWTH)
// =============================================================

function isCampaignInFilter(camp) {
  if (currentFilter.villa !== 'ALL' && camp.villa !== 'ALL' && camp.villa !== currentFilter.villa) {
    return false;
  }
  if (currentFilter.period === 'ALL') return true;

  const s = camp.startDate || '';
  const e = camp.endDate || s || '';

  const range = getFilterDateRange();
  if (!range || !s || !e) return true;
  return s <= range.end && e >= range.start;
}

function renderMarketingCampaignsTable(campaigns) {
  const tbody = document.getElementById('marketingCampaignsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!campaigns || campaigns.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; color:var(--text-muted);">Bu dönemde kayıtlı reklam kampanyası bulunmuyor.</td></tr>';
    return;
  }

  campaigns.forEach(c => {
    const sp = Number(c.spent) || 0;
    const bg = Number(c.budget) || sp;
    const rv = Number(c.revenue) || 0;
    const roas = sp > 0 ? (rv / sp).toFixed(1) : null;
    const cl = Number(c.clicks) || 0;
    const ld = Number(c.leads) || 0;
    const bk = Number(c.bookingsCount) || 0;

    let pBadge = '<span class="badge badge-blue">Google Ads</span>';
    if (c.platform === 'META') pBadge = '<span class="badge badge-purple">Meta Ads</span>';
    if (c.platform === 'TIKTOK') pBadge = '<span class="badge badge-pink">TikTok Ads</span>';
    if (c.platform === 'OTHER') pBadge = '<span class="badge badge-secondary">Diğer</span>';

    let statusBadge = '<span class="badge badge-green">Aktif</span>';
    if (c.status === 'COMPLETED') statusBadge = '<span class="badge badge-secondary">Tamamlandı</span>';
    if (c.status === 'PAUSED') statusBadge = '<span class="badge badge-amber">Duraklatıldı</span>';

    const vName = c.villa === 'ALL' ? 'Tüm Portföy' : (appData.villas[c.villa]?.name || c.villa);
    const dateStr = (c.startDate || '') + (c.endDate ? ' - ' + c.endDate : '');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color:#F8FAFC;">${escapeHtml(c.name)}</strong>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escapeHtml(c.notes || c.channelType || '')}</div>
      </td>
      <td>${pBadge}</td>
      <td><span class="badge badge-blue" style="font-size:11px;">${escapeHtml(vName)}</span></td>
      <td style="font-size:12px; color:var(--text-muted);">${dateStr || '-'}</td>
      <td>
        <strong style="color:#F87171;">₺${sp.toLocaleString('tr-TR')}</strong>
        <div style="font-size:10px; color:var(--text-muted);">Bütçe: ₺${bg.toLocaleString('tr-TR')}</div>
      </td>
      <td>
        <span style="font-weight:600; color:#E2E8F0;">${cl.toLocaleString('tr-TR')} Tık</span>
        <div style="font-size:10px; color:#A855F7;">${ld} Lead / Mesaj</div>
      </td>
      <td>
        <strong style="color:#34D399;">₺${rv.toLocaleString('tr-TR')}</strong>
        <div style="font-size:10px; color:var(--text-muted);">${bk} Rezervasyon</div>
      </td>
      <td>
        <span class="badge ${roas === null ? 'badge-purple' : (Number(roas) >= 5 ? 'badge-green' : 'badge-amber')}" style="font-weight:700;">${roas === null ? 'harcama yok' : roas + 'x ROAS'}</span>
      </td>
      <td>${statusBadge}</td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-sm" data-onclick="openMarketingModal(decodeURIComponent('${encodeActionArg(c.id)}'))" style="padding:4px 8px; font-size:11px; margin-right:4px;">✏️ Düzenle</button>
        <button class="btn btn-secondary btn-sm text-danger" data-onclick="deleteMarketingCampaign(decodeURIComponent('${encodeActionArg(c.id)}'))" style="padding:4px 8px; font-size:11px;">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Pazarlama danismaninin dayandigi OLCULMUS gercekler.
 *
 * Olculemeyen her alan null doner. Cagiran taraf null'i "veri yok" olarak
 * gosterir; varsayilan deger UYDURMAZ (3.6). Danisman bu tabloyu kendisi
 * uretir, cunku "AI Analizini Yenile" dugmesi onu argumansiz cagiriyor:
 * eskiden o yolda context bos geliyor ve `context.metaRoas || 8.0` devreye
 * girip musteriye hic olculmemis bir 8.0x ROAS gosteriyordu.
 */
function collectMarketingFacts() {
  const campaigns = (appData.marketingCampaigns || []).filter(isCampaignInFilter);
  const platform = {
    META: { spent: 0, rev: 0 },
    GOOGLE: { spent: 0, rev: 0 }
  };
  let totalSpent = 0;
  let totalRev = 0;

  campaigns.forEach(c => {
    const sp = Number(c.spent) || 0;
    const rv = Number(c.revenue) || 0;
    totalSpent += sp;
    totalRev += rv;
    const key = platform[c.platform] ? c.platform : null;
    if (key) {
      platform[key].spent += sp;
      platform[key].rev += rv;
    }
  });

  // ROAS yalnizca harcama varken tanimlidir. Harcama 0 ise oran yoktur.
  const roas = s => (s.spent > 0 ? Number((s.rev / s.spent).toFixed(1)) : null);

  let otaComm = 0;
  let otaCommRecorded = 0;
  let otaMissing = 0;
  (appData.bookings || []).forEach(b => {
    if (b.status === 'CANCELLED' || !isBookingInFilter(b)) return;
    const ch = (b.channel || '').toUpperCase();
    if (ch !== 'AIRBNB' && ch !== 'BOOKING' && ch !== 'EXPEDIA' && ch !== 'OTA') return;
    const oran = getBookingFilterShare(b).ratio;
    const cm = (Number(b.otaComm) || 0) * oran;
    otaComm += cm;
    if (cm > 0) otaCommRecorded++; else otaMissing++;
  });

  return {
    campaignCount: campaigns.length,
    totalSpent,
    totalRev,
    metaRoas: roas(platform.META),
    googleRoas: roas(platform.GOOGLE),
    otaCommLoss: otaCommRecorded > 0 ? otaComm : null,
    otaMissingCommCount: otaMissing,
    gapNights: (typeof detectGapNights === 'function' ? detectGapNights() : [])
  };
}

function runAIMarketingAdvisor() {
  const container = document.getElementById('aiInsightsContainer');
  if (!container) return;

  const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const timeEl = document.getElementById('aiLastAnalysisTime');
  if (timeEl) timeEl.innerText = `Son Analiz: ${nowStr}`;

  const f = collectMarketingFacts();
  const metaRoas = f.metaRoas;
  const googleRoas = f.googleRoas;

  let insights = [];

  // Insight 1: ROAS karsilastirmasi — YALNIZCA ikisi de olculmusse.
  if (metaRoas !== null && googleRoas !== null) {
    const onde = googleRoas > metaRoas ? 'Google Arama' : 'Meta';
    const geride = googleRoas > metaRoas ? 'Meta' : 'Google Arama';
    const ondeDeger = Math.max(googleRoas, metaRoas);
    const gerideDeger = Math.min(googleRoas, metaRoas);
    if (ondeDeger > gerideDeger) {
      insights.push({
        type: 'arbitrage',
        icon: '💡',
        title: `Bütçe Arbitrajı: ${onde} tarafı daha verimli`,
        text: `<strong>${onde}</strong> kampanyalarınız <strong>${ondeDeger}x</strong> getiri üretirken <strong>${geride}</strong> tarafı <strong>${gerideDeger}x</strong> seviyesinde. Bütçenin bir kısmını ${onde} tarafına kaydırmak aynı harcamayla daha yüksek ciro getirebilir. <em>Kaydırmanın ne kadar ek ciro getireceği ölçülmeden bilinemez</em> — değişikliği yaptıktan sonra bu ekrandan takip edin.`
      });
    } else {
      insights.push({
        type: 'arbitrage',
        icon: '⚖️',
        title: 'İki platform da aynı getiride',
        text: `Meta ve Google tarafı <strong>${metaRoas}x</strong> ile aynı seviyede. Bütçeyi bir tarafa kaydırmak için ölçülmüş bir gerekçe yok.`
      });
    }
  } else if (metaRoas !== null || googleRoas !== null) {
    const olculen = metaRoas !== null ? 'Meta' : 'Google Arama';
    const olculmeyen = metaRoas !== null ? 'Google Arama' : 'Meta';
    const deger = metaRoas !== null ? metaRoas : googleRoas;
    insights.push({
      type: 'arbitrage',
      icon: '📊',
      title: `Yalnızca ${olculen} tarafı ölçülebiliyor`,
      text: `<strong>${olculen}</strong> kampanyalarınızın getirisi <strong>${deger}x</strong>. <strong>${olculmeyen}</strong> tarafında harcama kaydı olmadığı için karşılaştırma yapılamıyor; iki tarafı kıyaslamak için ${olculmeyen} kampanyalarını da deftere girin.`
    });
  }

  // Insight 2: OTA stratejisi. Komisyon tutari kayitliysa yazilir.
  const isUserMarkup = (appData.otaPricingStrategy !== 'ABSORBED');
  if (isUserMarkup) {
    insights.push({
      type: 'commission',
      icon: '🏷️',
      title: 'Fiyatlandırma Stratejisi: Komisyon Misafire Yansıtılıyor (Mark-up)',
      text: `Fiyatlarınız OTA komisyonu oranında artırılarak listelendiği için <strong>net kârınız korunuyor</strong>. Bu stratejinin asıl avantajı direkt satışta ortaya çıkar: WhatsApp ve web sitenizde misafire komisyon farkı kadar indirim sunarak OTA'da sizi görüp arayan misafirleri doğrudan kapatabilirsiniz.`
    });
  } else if (f.otaCommLoss !== null) {
    const eksik = f.otaMissingCommCount > 0
      ? ` Bu tutar eksik olabilir: <strong>${f.otaMissingCommCount}</strong> OTA rezervasyonunda komisyon kaydı yok.`
      : '';
    insights.push({
      type: 'commission',
      icon: '🛡️',
      title: 'OTA Komisyon Sızıntısı: Direkte Çevirme Reçetesi',
      text: `Bu dönem OTA platformlarına ödenen kayıtlı komisyon tutarı <strong>₺${Math.round(f.otaCommLoss).toLocaleString('tr-TR')}</strong>.${eksik} Bu bütçenin bir kısmı direkt kanala aktarılarak komisyon tasarrufu denenebilir.`
    });
  } else {
    insights.push({
      type: 'commission',
      icon: '🛡️',
      title: 'OTA komisyonu ölçülemiyor',
      text: 'Bu dönemdeki OTA rezervasyonlarının hiçbirinde komisyon tutarı kayıtlı değil, bu yüzden sızıntı hesaplanamıyor. Rezervasyon kayıtlarına OTA komisyonunu girdikçe bu kutu gerçek tutarı gösterir.'
    });
  }

  // Insight 3: Bosluk gecesi — GERCEK bosluk varsa. Bir zamanlar burada
  // sabit bir sehir listesi, "₺1.500 butce" ve "mesaj basi ₺35" yaziyordu;
  // hicbiri olculmuyordu ve bos bir hesapta bile goruntuleniyordu.
  if (f.gapNights.length > 0) {
    const toplamGece = f.gapNights.reduce((a, g) => a + g.nights, 0);
    const mulkSayisi = new Set(f.gapNights.map(g => g.villaKey)).size;
    insights.push({
      type: 'gap',
      icon: '⚡',
      title: 'Son Dakika Boşluk Doldurma (Gap-Filling)',
      text: `Takviminizde <strong>${mulkSayisi}</strong> mülkte toplam <strong>${toplamGece}</strong> gecelik yetim boşluk var. Bu boşluklar için minimum konaklama süresini düşürmek ve hedefli bir hikaye reklamı açmak en hızlı dolum yoludur. Boşlukların listesi ve fırsat fiyatları aşağıdaki <em>Yetim Gece Radarı</em> kutusunda.`
    });
  }

  if (insights.length === 0 || (f.campaignCount === 0 && f.gapNights.length === 0)) {
    // Ne kampanya ne bosluk var: olculecek bir sey yok, oneri de uydurulmaz.
    insights = [{
      type: 'gap',
      icon: '📭',
      title: 'Henüz analiz edilecek veri yok',
      text: 'Bu dönemde kampanya kaydı ve takvimde yetim boşluk bulunmuyor. Reklam defterine kampanya girdikçe getiri (ROAS) karşılaştırması, rezervasyonlara OTA komisyonu girdikçe komisyon sızıntısı burada gerçek rakamlarla görünür.'
    }];
  }

  container.innerHTML = insights.map(i => `
    <div class="ai-insight-card ${i.type}">
      <div class="ai-insight-title">
        <span>${i.icon}</span>
        <span>${escapeHtml(i.title)}</span>
      </div>
      <div class="ai-insight-text">${escapeHtml(i.text)}</div>
    </div>
  `).join('');
}

/**
 * Butce dagitim simulatoru.
 *
 * Kutunun etiketi "Gecmis ROAS ve kanal doluluk katsayilarina gore hesaplanir"
 * diyor; bir zamanlar bu DOGRU DEGILDI. Beklenen ciro sabit carpanlarla
 * uretiliyordu (Google 9,5x / Meta 8,0x / retarget 10,5x): musteri hangi
 * butceyi girerse girsin, hic reklam vermemis bir hesapta bile "Beklenen
 * Toplam Ciro" yaziyordu ve rakam isletmenin kendi verisiyle hic ilgili
 * degildi. Artik carpan isletmenin KENDI olculmus ROAS'idir; olculmemis bir
 * kanal icin ciro tahmini yazilmaz (3.6).
 *
 * "Yeniden hedefleme" ayri bir kanal olarak defterde tutulmuyor; kendi
 * olculmus getirisi olmadigi icin ciro tahmini uretmez.
 */
function runMarketingBudgetSimulation() {
  const budgetInput = document.getElementById('simBudgetInput');
  const budget = budgetInput ? (Number(budgetInput.value) || 0) : 0;

  const f = collectMarketingFacts();

  // Dagitim bir ONERIDIR (olcum degil): %45 Google, %40 Meta, %15 retarget.
  const googleAmt = Math.round(budget * 0.45);
  const metaAmt = Math.round(budget * 0.40);
  const retargetAmt = Math.round(budget * 0.15);

  const googleRev = f.googleRoas !== null ? Math.round(googleAmt * f.googleRoas) : null;
  const metaRev = f.metaRoas !== null ? Math.round(metaAmt * f.metaRoas) : null;
  const retargetRev = null;

  const olculenler = [googleRev, metaRev].filter(v => v !== null);
  const olculenButce = (f.googleRoas !== null ? googleAmt : 0) + (f.metaRoas !== null ? metaAmt : 0);
  const totalRev = olculenler.length > 0 ? olculenler.reduce((a, b) => a + b, 0) : null;
  const blendedRoas = (totalRev !== null && olculenButce > 0)
    ? (totalRev / olculenButce).toFixed(1)
    : null;

  const tl = v => `₺${v.toLocaleString('tr-TR')}`;
  const yaz = (id, deger) => {
    const el = document.getElementById(id);
    if (el) el.innerText = deger;
  };

  yaz('simGoogleAmt', tl(googleAmt));
  yaz('simGoogleRev', googleRev === null ? 'ölçülmedi' : tl(googleRev));
  yaz('simMetaAmt', tl(metaAmt));
  yaz('simMetaRev', metaRev === null ? 'ölçülmedi' : tl(metaRev));
  yaz('simRetargetAmt', tl(retargetAmt));
  yaz('simRetargetRev', retargetRev === null ? 'ölçülmedi' : tl(retargetRev));

  yaz('simTotalExpectedRev', totalRev === null ? '—' : tl(totalRev));
  yaz('simExpectedRoas', blendedRoas === null
    ? 'geçmiş ROAS yok'
    : `${blendedRoas}x ROAS (kendi ölçümünüz)`);

  // Neye dayandigini acikca yaz: hangi kanalin carpani olculdu, hangisi yok.
  const not = document.getElementById('simBasisNote');
  if (not) {
    if (totalRev === null) {
      not.innerText = 'Bu dönemde harcama kaydı olan kampanya yok; geçmiş getiri ölçülemediği için ciro tahmini üretilmedi.';
    } else {
      const parcalar = [];
      if (f.googleRoas !== null) parcalar.push(`Google ${f.googleRoas}x`);
      if (f.metaRoas !== null) parcalar.push(`Meta ${f.metaRoas}x`);
      not.innerText = `Çarpanlar kendi kayıtlarınızdan: ${parcalar.join(', ')}. ` +
        'Yeniden hedefleme ayrı ölçülmediği için tahmine katılmadı.';
    }
  }
}

// -------------------------------------------------------------
// MARKETING MODAL & CRUD
// -------------------------------------------------------------
function openMarketingModal(id = null) {
  const modal = document.getElementById('marketingCampaignModal');
  const form = document.getElementById('mktCampaignForm');
  const title = document.getElementById('mktModalTitle');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('mktCampaignId').value = '';

  if (id) {
    const c = (appData.marketingCampaigns || []).find(item => item.id === id);
    if (c) {
      if (title) title.innerText = 'Reklam Kampanyasını Düzenle';
      document.getElementById('mktCampaignId').value = c.id;
      document.getElementById('mktName').value = c.name || '';
      document.getElementById('mktPlatform').value = c.platform || 'META';
      document.getElementById('mktVilla').value = c.villa || 'ALL';
      document.getElementById('mktStartDate').value = c.startDate || '';
      document.getElementById('mktEndDate').value = c.endDate || '';
      document.getElementById('mktBudget').value = c.budget || '';
      document.getElementById('mktSpent').value = c.spent || '';
      document.getElementById('mktClicks').value = c.clicks || '';
      document.getElementById('mktLeads').value = c.leads || '';
      document.getElementById('mktBookingsCount').value = c.bookingsCount || '';
      document.getElementById('mktRevenue').value = c.revenue || '';
      document.getElementById('mktStatus').value = c.status || 'ACTIVE';
      document.getElementById('mktNotes').value = c.notes || '';
    }
  } else {
    if (title) title.innerText = 'Yeni Reklam Kampanyası Ekle';
    document.getElementById('mktStartDate').value = getTodayStr();
  }

  modal.classList.add('active');
}

function closeMarketingModal() {
  const modal = document.getElementById('marketingCampaignModal');
  if (modal) modal.classList.remove('active');
}

async function saveMarketingCampaign(e) {
  e.preventDefault();
  if (!appData.marketingCampaigns) appData.marketingCampaigns = [];

  const id = document.getElementById('mktCampaignId').value;
  const name = document.getElementById('mktName').value.trim();
  const platform = document.getElementById('mktPlatform').value;
  const villa = document.getElementById('mktVilla').value;
  const startDate = document.getElementById('mktStartDate').value;
  const endDate = document.getElementById('mktEndDate').value;
  const budget = Number(document.getElementById('mktBudget').value) || 0;
  const spent = Number(document.getElementById('mktSpent').value) || 0;
  const clicks = Number(document.getElementById('mktClicks').value) || 0;
  const leads = Number(document.getElementById('mktLeads').value) || 0;
  const bookingsCount = Number(document.getElementById('mktBookingsCount').value) || 0;
  const revenue = Number(document.getElementById('mktRevenue').value) || 0;
  const status = document.getElementById('mktStatus').value;
  const notes = document.getElementById('mktNotes').value.trim();

  // Kimlik artik Postgres'ten gelir. Eskiden `MKT-<zaman>` uretiliyordu ve
  // kayit hicbir yere yazilmadigi icin sayfa yenilenince yok oluyordu.
  const kampanya = {
    id: id || null,
    name, platform, villa, startDate, endDate, budget, spent,
    clicks, leads, bookingsCount, revenue, status, notes
  };

  const yazildi = await reportStatePersist(async () => {
    const satir = await cloudSaveMarketingCampaign(kampanya);
    const kayit = mapMarketingCampaignFromDb(satir, buildPropertyIdSlugMap());
    const idx = appData.marketingCampaigns.findIndex(c => c.id === kayit.id);
    if (idx !== -1) appData.marketingCampaigns[idx] = kayit;
    else appData.marketingCampaigns.unshift(kayit);
  }, '✅ Reklam kampanyası kaydedildi.');

  saveAppData();
  if (!yazildi) return;
  closeMarketingModal();
  renderMarketingModule();
}

async function deleteMarketingCampaign(id) {
  if (!confirm('Bu reklam kampanyası kaydını silmek istediğinizden emin misiniz?')) return;
  const yazildi = await reportStatePersist(
    () => cloudDeleteMarketingCampaign(id),
    'Reklam kampanyası silindi.'
  );
  if (!yazildi) return;
  appData.marketingCampaigns = (appData.marketingCampaigns || []).filter(c => c.id !== id);
  saveAppData();
  renderMarketingModule();
}


// =============================================================
// 🌟 OTA İLK SAYFA SIRALAMA, KAPAK GÖRSELİ & A/B TEST RADARI
// =============================================================

function renderOtaRankingAndCoverRadar() {
  const tbody = document.getElementById('otaRankingTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const listings = (appData.airbnbListings && Object.keys(appData.airbnbListings).length > 0)
    ? appData.airbnbListings
    : {};

  let firstPageCount = 0;
  let totalCtrSum = 0;
  let totalScoreSum = 0;
  let count = 0;

  Object.keys(listings).forEach(vKey => {
    const item = listings[vKey];
    count++;
    if (item.searchPage === 1) firstPageCount++;
    totalCtrSum += Number(item.coverCtr) || 4.5;
    totalScoreSum += Number(item.strScore || item.listingScore) || 90;

    const rankBadgeClass = item.searchPage === 1 ? 'badge-rank-p1' : 'badge-rank-p2';
    const ctrVal = (Number(item.coverCtr) || 4.0).toFixed(1);
    const scoreVal = Number(item.strScore || item.listingScore) || 90;
    const g5Val = Number(item.golden5Score) || 90;
    const opNote = item.operatorNote || '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color: #F8FAFC; font-size: 13px;">${escapeHtml(item.name)}</strong>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(item.title)}</div>
        <div style="margin-top: 4px;">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; color: #60A5FA; text-decoration: none;">🔗 airbnb.com.tr/h/${escapeHtml(item.slug)} ↗</a>
        </div>
      </td>
      <td>
        <span class="badge ${rankBadgeClass}" style="font-size: 11px;">
          ${item.searchRank || 'Sayfa 1 / #4'}
        </span>
      </td>
      <td>
        <div style="font-weight: 600; color: #E2E8F0; font-size: 12px;">${item.coverPhoto || 'Şömine & Jakuzi'}</div>
        <div class="cover-ctr-bar" style="margin-top: 4px;">
          <span style="font-weight: 800; color: ${ctrVal >= 4.5 ? '#34D399' : '#FBBF24'}; font-size: 12px;">%${ctrVal} CTR</span>
          <div class="cover-ctr-track">
            <div class="cover-ctr-fill" style="width: ${Math.min(100, ctrVal * 16)}%;"></div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge ${g5Val >= 90 ? 'badge-green' : 'badge-amber'}" style="font-size: 11px;">
          ${g5Val} / 100
        </span>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Kolaj Kurgusu</div>
      </td>
      <td>
        <span class="badge badge-blue" style="font-size: 11px;">50 Karakter Formülü</span>
        <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Duygusal Kanca (Hook)</div>
      </td>
      <td>
        ${item.isSuperhost ? '<span class="badge badge-amber" style="font-size: 10px; margin-right: 2px;">🏆 Superhost</span>' : ''}
        ${item.isGuestFavorite ? '<span class="badge badge-green" style="font-size: 10px;">💎 Gözde</span>' : ''}
        <div style="font-size: 10px; color: #34D399; margin-top: 2px;">⚡ Anında Rez. Açık</div>
      </td>
      <td>
        <span class="badge ${scoreVal >= 90 ? 'badge-green' : 'badge-amber'}" style="font-size: 13px; font-weight: 800; padding: 4px 8px;">
          ${scoreVal} / 100
        </span>
      </td>
      <td style="min-width: 190px;">
        <textarea id="opNote_${vKey}" class="operator-note-box" rows="2" placeholder="Stratejik notunuzu buraya yazın...">${opNote}</textarea>
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="saveOperatorNote(decodeURIComponent('${encodeActionArg(vKey)}'))" style="margin-top: 4px; padding: 2px 8px; font-size: 10px; border-color: #A855F7; color: #DDD6FE;">
          💾 Notu Kaydet
        </button>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="setCriticUrlPreset(decodeURIComponent('${encodeActionArg(vKey)}'))" style="border-color: #EF4444; color: #FCA5A5; font-size: 11px; font-weight: 700;">
          🔥 Eleştir
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update Summary Badges
  const firstPagePct = count > 0 ? Math.round((firstPageCount / count) * 100) : null;
  const avgCtr = count > 0 ? (totalCtrSum / count).toFixed(1) : null;
  const avgScore = count > 0 ? Math.round(totalScoreSum / count) : null;

  const elFpBadge = document.getElementById('otaFirstPageBadge');
  if (elFpBadge) elFpBadge.innerText = firstPagePct === null ? '— İlan verisi yok' : `%${firstPagePct} İlk Sayfada (${firstPageCount}/${count} mülk)`;

  const elRankSummary = document.getElementById('otaRankSummaryBadge');
  if (elRankSummary) elRankSummary.innerText = firstPagePct === null ? '1. sayfa oranı hesaplanamadı' : `1. Sayfada: %${firstPagePct}`;

  const elAvgCoverCtr = document.getElementById('otaAvgCoverCtr');
  if (elAvgCoverCtr) elAvgCoverCtr.innerText = avgCtr === null ? '— CTR verisi yok' : `%${avgCtr}`;

  const elAvgScore = document.getElementById('otaAvgListingScore');
  if (elAvgScore) elAvgScore.innerText = avgScore === null ? '—' : `${avgScore} / 100`;

  renderCoverAbTestLab();
}

function renderCoverAbTestLab(villaKey = null) {
  const container = document.getElementById('abTestComparisonContainer');
  if (!container) return;

  const listings = (appData.airbnbListings && Object.keys(appData.airbnbListings).length > 0)
    ? appData.airbnbListings
    : {};

  const selectedKey = villaKey && listings[villaKey] ? villaKey : Object.keys(listings)[0];
  const item = selectedKey ? listings[selectedKey] : null;
  if (!item) {
    container.innerHTML = '<div style="color:var(--text-muted);">A/B karşılaştırması için ölçülmüş ilan verisi yok.</div>';
    return;
  }

  const parsedCtr = Number(item.coverCtr);
  const currentCtr = Number.isFinite(parsedCtr) && parsedCtr >= 0 ? parsedCtr : null;

  container.innerHTML = `
    <div class="ab-test-card-grid">
      <!-- Versiyon A: Mevcut Yayındaki İlan -->
      <div class="ab-box current">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="badge badge-secondary">Versiyon A (Şu An Yayında Olan)</span>
          <span style="font-weight: 700; color: #94A3B8; font-size: 12px;">Mevcut Sıra: ${item.searchRank}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Aktif Kapak Görseli:</div>
          <div style="font-weight: 700; color: #F8FAFC; font-size: 13px; margin-top: 2px;">${item.coverPhoto}</div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Mevcut Başlık:</div>
          <div style="font-size: 12px; color: #CBD5E1; font-weight: 600; margin-top: 2px;">"${escapeHtml(item.title)}"</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.04); border-radius: 8px;">
          <span style="font-size: 12px; color: var(--text-muted);">Ölçülen Tıklama (CTR):</span>
          <strong style="color: #93C5FD; font-size: 14px;">${currentCtr === null ? '— (CTR ölçülmedi)' : '%' + currentCtr.toFixed(1)}</strong>
        </div>
      </div>

      <!-- Versiyon B: Yapay Zeka Tarafından Optimize Edilmiş -->
      <div class="ab-box ai-optimized">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span class="badge badge-green">Versiyon B (AI Optimize Edilmiş Öneri ⭐)</span>
          <span style="font-weight: 800; color: #34D399; font-size: 12px;">Öneri; sonuç henüz ölçülmedi</span>
        </div>
        <div style="margin-bottom: 8px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">Önerilen Yeni Kapak Konsepti:</div>
          <div style="font-weight: 700; color: #34D399; font-size: 13px; margin-top: 2px;">
            ${item.aiCoverAdvice}
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase;">AI Tarafından Üretilen SEO Başlığı:</div>
          <div style="font-size: 12px; color: #F8FAFC; font-weight: 700; margin-top: 2px; background: rgba(0,0,0,0.4); padding: 6px 10px; border-radius: 6px; border: 1px dashed rgba(52, 211, 153, 0.4);">
            "${escapeHtml(item.aiOptimizedTitle || item.title)}"
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
          <div>
            <span style="font-size: 12px; color: #DDD6FE;">Beklenen Tıklama (CTR):</span>
            <strong style="color: #34D399; font-size: 14px; margin-left: 6px;">— (A/B testi çalıştırılmadı)</strong>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-onclick="copyAiTitle(decodeURIComponent('${encodeActionArg(item.aiOptimizedTitle || item.title)}'))" style="border-color: #34D399; color: #34D399; font-size: 11px; font-weight: 700;">
            📋 Başlığı Kopyala
          </button>
        </div>
      </div>
    </div>
  `;
}

function copyAiTitle(titleText) {
  navigator.clipboard.writeText(titleText).then(() => {
    alert('✅ Optimize edilmiş Airbnb başlığı panoya kopyalandı! İlanınızda doğrudan kullanabilirsiniz.');
  }).catch(() => {
    alert('Başlık: ' + titleText);
  });
}


async function setOtaPricingStrategy(strategyMode) {
  const oncekiDeger = appData.otaPricingStrategy;
  appData.otaPricingStrategy = strategyMode;
  saveAppData();
  renderMarketingModule();
  const yazildi = await reportStatePersist(
    () => cloudSaveTenantSetting('ota_pricing_strategy', strategyMode)
  );
  if (!yazildi) {
    // Yazma dustu: secim ekranda "kaydedilmis" gibi kalmasin. Fiyat
    // stratejisi misafire gosterilen fiyati degistiriyor; yanlis modda
    // durmasi dogrudan para kaybidir.
    appData.otaPricingStrategy = oncekiDeger;
    renderMarketingModule();
  }
}


// =============================================================
// 🤖 AIRBNB / OTA İLAN ELEŞTİRMENİ (AI STR CRITIC & ROAST ENGINE)
// =============================================================

async function saveOperatorNote(villaKey) {
  if (!appData.airbnbListings) {
    appData.airbnbListings = {};  // DEFAULT_AIRBNB_PROPERTIES demo temizliginde silindi (ReferenceError)
  }
  const textarea = document.getElementById('opNote_' + villaKey);
  if (!textarea) return;

  const noteText = textarea.value.trim();
  if (!appData.airbnbListings[villaKey]) {
    appData.airbnbListings[villaKey] = {};
  }
  appData.airbnbListings[villaKey].operatorNote = noteText;
  saveAppData();
  const mAd = (appData.villas && appData.villas[villaKey] && appData.villas[villaKey].name) || villaKey;
  await reportStatePersist(
    () => cloudSaveOperatorNote(villaKey, noteText),
    mAd + ' için operatör notu kaydedildi.'
  );
}

function setCriticUrlPreset(villaKey) {
  // DEFAULT_AIRBNB_PROPERTIES demo temizliginde silinmisti; bu fonksiyon
  // tiklandiginda ReferenceError firlatiyordu. Artik musterinin kendi
  // mulkunun ilan baglantisini kullanir.
  const v = (appData.villas || {})[villaKey];
  if (!v || !v.url) {
    if (typeof showToast === 'function') showToast('Bu mülk için kayıtlı bir ilan bağlantısı yok.', 'info');
    return;
  }
  const input = document.getElementById('criticUrlInput');
  if (input) input.value = v.url;
  runAiListingCritic(v.url, villaKey);
}

/** Ilan bagi olan mulkler icin hizli secim butonlari. */
function renderCriticPresets() {
  const kap = document.getElementById('criticPresetList');
  if (!kap) return;
  const kayitlar = Object.entries(appData.villas || {}).filter(([, v]) => v && v.url);
  if (!kayitlar.length) {
    kap.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">İlan bağlantısı kayıtlı mülk yok. Mülk ekranından ekleyebilirsiniz.</span>';
    return;
  }
  kap.innerHTML = kayitlar.map(([k, v]) =>
    `<button type="button" class="btn btn-secondary btn-sm" data-critic-villa="${escapeHtml(k)}">🏡 ${escapeHtml(v.name || k)}</button>`
  ).join('');
  kap.querySelectorAll('[data-critic-villa]').forEach(b => {
    b.addEventListener('click', () => setCriticUrlPreset(b.getAttribute('data-critic-villa')));
  });
}

function runAiListingCritic(inputUrl = null, explicitKey = null) {
  // BU FONKSIYON ANALIZ UYDURUYORDU.
  //
  // Girilen HERHANGI bir URL icin sabit bir skor (79/100) ve sabit bir arama
  // sirasi ("Sayfa 2 / #14") yaziyordu. Ilan sayfasina hicbir zaman erisilmiyor,
  // hicbir olcum yapilmiyordu; bes uydurma villadan biriyle eslesirse onun
  // sabit skorunu, eslesmezse 79'u gosteriyordu. Musteri bunu kendi ilaninin
  // gercek performansi saniyordu.
  //
  // Gercek ilan analizi icin OTA tarafindan saglanan bir veri kaynagi gerekir;
  // sistemde boyle bir baglanti yok. Uydurma skor gostermektense durumu
  // acikca soyluyoruz.
  const urlField = document.getElementById("criticUrlInput");
  const url = inputUrl || (urlField ? urlField.value.trim() : "");
  const container = document.getElementById("criticResultsContainer");
  if (!container) return;

  if (!url) {
    if (typeof showToast === "function") showToast("Önce ilan bağlantısını girin.", "info");
    return;
  }

  container.style.display = "block";
  container.innerHTML =
    '<div style="background: rgba(0,0,0,0.3); border: 1px dashed rgba(168, 85, 247, 0.4); border-radius: 10px; padding: 16px;">' +
      '<strong style="color:#D8B4FE; font-size:14px;">İlan analizi henüz bağlı değil</strong>' +
      '<p style="font-size:12px; color:#CBD5E1; line-height:1.5; margin:8px 0 0;">' +
        'Bu bölüm ilan sayfanızı otomatik puanlayabilmek için OTA tarafından sağlanan bir ' +
        'veri bağlantısı gerektiriyor; sistemde böyle bir bağlantı henüz yok. Bu yüzden ' +
        'burada <strong>puan veya sıralama gösterilmiyor</strong> — ölçülmemiş bir rakamı ' +
        'ölçülmüş gibi sunmuyoruz.' +
      '</p>' +
      '<p style="font-size:11px; color:#94A3B8; margin:10px 0 0; word-break:break-all;">' +
        'Girilen bağlantı: ' + escapeHtml(url) +
      '</p>' +
    '</div>';
}

// =============================================================
// 5 İLERİ SEVİYE STR & VILLA PAZARLAMA MODÜLLERİ
// =============================================================

// 1. 🛑 TAKVİMDEKİ "YETİM GECELER" (GAP NIGHTS) MOTORU
// -------------------------------------------------------------
function detectGapNights() {
  const gaps = [];
  const villas = Object.keys(appData.villas || {});

  villas.forEach(vKey => {
    const vName = (appData.villas && appData.villas[vKey]?.name) ? appData.villas[vKey].name : vKey;
    const vBookings = (appData.bookings || [])
      .filter(b => b.villa === vKey && b.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

    for (let i = 0; i < vBookings.length - 1; i++) {
      const b1 = vBookings[i];
      const b2 = vBookings[i + 1];
      const d1 = new Date(b1.checkOut);
      const d2 = new Date(b2.checkIn);
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));

      if (diffDays >= 1 && diffDays <= 4) {
        // Gecelik fiyat MULKUN KENDI liste fiyatidir. Burada bir zamanlar
        // silinmis demo anahtarlarina bagli bir merdiven vardi
        // (AZURE 18.000, BELLA 14.000, digerleri 12.000): her gercek mulk
        // icin 12.000 TL uyduruyordu ve bu rakam asagidaki "Durum" /
        // "Hikaye" butonlariyla MISAFIRE GONDERILEN metne giriyordu.
        // Liste fiyati girilmemisse fiyat bilinmiyordur; uydurulmaz (3.6).
        const villa = (appData.villas || {})[vKey] || {};
        const baseNightly = Number(villa.basePrice) || 0;
        const regularTotal = baseNightly > 0 ? baseNightly * diffDays : null;
        const discountTotal = regularTotal === null ? null : Math.round(regularTotal * 0.8);
        gaps.push({
          villaKey: vKey,
          villaName: vName,
          checkIn: b1.checkOut,
          checkOut: b2.checkIn,
          nights: diffDays,
          regularPrice: regularTotal,
          discountPrice: discountTotal,
          discountPct: regularTotal === null ? null : 20
        });
      }
    }
  });

  // Gercek bosluk yoksa UYDURULMAZ. Burada, gaps.length < 3 ise ucu birden
  // sahte olarak eklenirdi: olmayan villalar (Bella Vista, Azure Bay, Sunset
  // Horizon), uydurma tarihler ve "%20 indirim" fiyatlari. Yeni musteri
  // sahip olmadigi villalar icin firsat listesi goruyordu.

  return gaps;
}

function renderGapNightsRadar() {
  const container = document.getElementById('gapNightsGridContainer');
  const badge = document.getElementById('gapNightsCountBadge');
  if (!container) return;

  const gaps = detectGapNights();
  if (badge) badge.innerText = 'Tespit Edilen: ' + gaps.length + ' Yetim Boşluk';

  container.innerHTML = '';
  if (gaps.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); padding:16px; text-align:center; grid-column: 1 / -1;">Takvimde şu anda kritik yetim gece boşluğu bulunmuyor.</div>';
    return;
  }

  gaps.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gap-night-card';
    // Fiyat bilinmiyorsa paylasim butonlari CIKMAZ: bu metinler misafire
    // gidiyor, icinde "₺—" ya da uydurma bir rakam olamaz.
    const fiyatBiliniyor = g.regularPrice !== null && g.discountPrice !== null;
    const fiyatKutusu = fiyatBiliniyor
      ? `<div>
          <div style="font-size:10px; color:var(--text-muted); text-decoration:line-through;">Liste: ₺${g.regularPrice.toLocaleString('tr-TR')}</div>
          <div style="font-size:15px; font-weight:800; color:#34D399;">₺${g.discountPrice.toLocaleString('tr-TR')}</div>
        </div>
        <span class="badge badge-green" style="font-size:10px;">OTA Komisyonsuz</span>`
      : `<div style="font-size:11px; color:var(--text-muted);">
          Bu mülkün liste fiyatı girilmemiş — fırsat fiyatı hesaplanamıyor.
          <div style="margin-top:2px;">Mülk kartından gecelik fiyatı girin.</div>
        </div>`;
    const butonlar = fiyatBiliniyor
      ? `<div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="copyGapStoryText(decodeURIComponent('${encodeActionArg(g.villaName)}'), decodeURIComponent('${encodeActionArg(g.checkIn + ' - ' + g.checkOut)}'), ${Number(g.nights) || 0}, decodeURIComponent('${encodeActionArg(g.discountPrice.toLocaleString('tr-TR'))}'), decodeURIComponent('${encodeActionArg(g.regularPrice.toLocaleString('tr-TR'))}'))" style="flex:1; border-color:#EF4444; color:#FCA5A5; font-size:11px; font-weight:700;">
          ⚡ Flaş Hikaye Kopyala
        </button>
        <button type="button" class="btn btn-primary btn-sm" data-onclick="shareGapWhatsApp(decodeURIComponent('${encodeActionArg(g.villaName)}'), decodeURIComponent('${encodeActionArg(g.checkIn + ' - ' + g.checkOut)}'), ${Number(g.nights) || 0}, decodeURIComponent('${encodeActionArg(g.discountPrice.toLocaleString('tr-TR'))}'))" style="background:#10B981; border:none; font-size:11px; font-weight:700;">
          📲 Durum
        </button>
      </div>`
      : '';
    card.innerHTML = `
      <div class="gap-card-header">
        <span class="gap-villa-name">🏡 ${escapeHtml(g.villaName)}</span>
        ${fiyatBiliniyor ? `<span class="badge badge-amber">%${g.discountPct} Flaş İndirim</span>` : ''}
      </div>
      <div class="gap-dates-tag">
        <span>📅</span> ${g.checkIn} - ${g.checkOut} (${g.nights} Gece Boşluk)
      </div>
      <div class="gap-price-box">
        ${fiyatKutusu}
      </div>
      <div style="font-size:11px; color:#CBD5E1; margin-bottom:10px;">
        💡 <strong>STR Aksiyonu:</strong> Airbnb'de minimum konaklamayı ${g.nights} geceye düşürün ve aşağıdaki hikaye şablonunu paylaşın.
      </div>
      ${butonlar}
    `;
    container.appendChild(card);
  });
}

function copyGapStoryText(vName, dates, nights, discPrice, regPrice) {
  // Bu metin MISAFIRE gidiyor. Bir zamanlar burada "karlar altinda sicacik
  // somine keyfi, izole mustakil bahce ve isitmali jakuzi" yaziyordu: mulkte
  // bunlar olmasa da, mevsim kis olmasa da her firsat mesajina giriyordu.
  // Isletme adina olmayan bir ozellik vaat etmeyiz.
  const storyText = '🔥 SON DAKİKA KAÇAMAK FIRSATI! 🔥\n\n' +
    '🏡 ' + vName + '\n' +
    '📅 ' + dates + ' (' + nights + ' Gece)\n\n' +
    '🏷️ Flaş Yetim Gece Fırsatı: ₺' + regPrice + ' yerine sadece ₺' + discPrice + '!\n\n' +
    '📲 İlk yazan rezerve eder! Detay ve rezervasyon için hemen DM veya WhatsApp\'tan yazın.';

  navigator.clipboard.writeText(storyText).then(() => {
    alert('✅ Instagram Hikaye & WhatsApp Durum metni panoya kopyalandı! Doğrudan paylaşabilirsiniz.');
  }).catch(() => {
    alert(storyText);
  });
}

function shareGapWhatsApp(vName, dates, nights, discPrice) {
  // Konum iddiasi yok: isletme Akdeniz'de olmayabilir (eskiden sabitti).
  const text = '🔥 SON DAKİKA VİLLA KAÇAMAĞI!\n' +
    '🏡 ' + vName + '\n' +
    '📅 ' + dates + ' (' + nights + ' Gece)\n' +
    '🏷️ Flaş İndirimli Fiyat: ₺' + discPrice + '\n' +
    'Detaylar için bana yazabilirsiniz.';
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

// -------------------------------------------------------------
// 2. 💬 WHATSAPP & INSTAGRAM DM SATIŞ KAPANIŞ (CLOSING) ASİSTANI
// -------------------------------------------------------------
let activeClosingScenario = 'PAHALI';

function selectClosingScenario(scenarioKey) {
  activeClosingScenario = scenarioKey;
  const btns = document.querySelectorAll('.script-scenario-btn');
  btns.forEach(btn => {
    if (btn.getAttribute('data-scenario') === scenarioKey) {
      btn.className = 'btn btn-sm btn-primary script-scenario-btn active';
    } else {
      btn.className = 'btn btn-sm btn-secondary script-scenario-btn';
    }
  });
  updateClosingScriptPreview();
}

function updateClosingScriptPreview() {
  // Bu metinler MISAFIRE gidiyor. Bir zamanlar her senaryo, isletmenin
  // dogrulanmamis ozelliklerini ve vermedigi sozleri iceriyordu: "1.200 m²
  // korunakli bahce", "disaridan gorunmeyen isitmali jakuzi", "sinirsiz mese
  // somine odunu", "Akdeniz kiyisi", "1 cuval odun ve mangal paketi hediye",
  // "%30 daha avantajli". Hicbiri musterinin verisinden gelmiyordu; mulkte
  // jakuzi olmasa da, isletme Akdeniz'de olmasa da gonderiliyordu — ustelik
  // bazilari isletmenin yerine getirmek zorunda kalacagi TAAHHUTTU.
  // Artik yalnizca musterinin kendi girdigi bilgiler kullanilir.
  const guestName = (document.getElementById('scriptGuestName')?.value || '').trim();
  const vSelect = document.getElementById('scriptVillaSelect');
  const vKey = vSelect ? vSelect.value : Object.keys(appData.villas || {})[0];
  const villa = (appData.villas || {})[vKey] || {};
  const vName = villa.name || vKey || 'mülkümüz';
  const dates = (document.getElementById('scriptDates')?.value || '').trim();
  const priceInput = (document.getElementById('scriptPrice')?.value || '').trim();
  // Fiyat girilmemisse mulkun KENDI liste fiyati; o da yoksa fiyat cumlesi hic kurulmaz.
  const price = priceInput || (Number(villa.basePrice) > 0
    ? '₺' + Number(villa.basePrice).toLocaleString('tr-TR')
    : '');

  const hitap = guestName ? guestName + ' merhaba!' : 'Merhaba!';
  const tarihIfadesi = dates || 'belirttiğiniz tarihler';
  // Ozellik iddiasi yalnizca mulkun kendi "amenities" alanindan gelir.
  const ozellikler = (villa.amenities || '').trim();
  const ozellikCumlesi = ozellikler ? ' ' + vName + ' şu özellikleriyle öne çıkıyor: ' + ozellikler + '.' : '';
  const fiyatCumlesi = price ? ' Bu tarihler için fiyatımız ' + price + '.' : '';

  let text = '';
  switch (activeClosingScenario) {
    case 'PAHALI':
      text = hitap + ' Bütçe planlamasının önemli olduğunu biliyoruz.' + ozellikCumlesi +
        '\n\n' + tarihIfadesi + ' için size uygun bir çözüm bulmak isteriz.' + fiyatCumlesi +
        ' Sizin için opsiyonlayayım mı?';
      break;
    case 'GHOSTING':
      text = hitap + ' ' + vName + ' için görüştüğümüz ' + tarihIfadesi + ' tarihlerine başka bir misafirimizden de talep geldi.\n\n' +
        'Sizinle daha önce iletişime geçtiğimiz için önceliği size vermek istedim. Rezervasyonunuzu kesinleştirmek isterseniz bu teklifi adınıza opsiyonda tutabilirim. Ne dersiniz, organize edelim mi?';
      break;
    case 'DOLU':
      text = hitap + ' Ne yazık ki ilgilendiğiniz ' + vName + ' ' + tarihIfadesi + ' tarihlerinde dolu.\n\n' +
        'Sizi ağırlamayı çok isteriz: portföyümüzdeki diğer mülklerin o tarihlerdeki müsaitliğini kontrol edip seçenekleri ve fotoğrafları iletebilirim. İster misiniz?';
      break;
    case 'SON_DAKIKA':
      text = hitap + ' ' + vName + ' bugün için hazır ve müsait.' + ozellikCumlesi + fiyatCumlesi +
        '\n\nGirişinizi hemen hazırlayalım mı?';
      break;
    case 'KARARSIZ':
      text = hitap + ' Tarihleriniz esnekse hafta sonu yerine hafta içi konaklamayı önerebilirim: hem daha sakin oluyor hem de hafta içi fiyatlarımız genelde daha uygun.\n\n' +
        'Hafta içi müsaitliklerimizi ve fiyatlarını ileteyim mi?';
      break;
    default:
      text = hitap + ' ' + vName + ' için ' + tarihIfadesi + ' konaklamanızı organize etmek için buradayız.';
  }

  const previewEl = document.getElementById('scriptPreviewText');
  if (previewEl) previewEl.innerText = text;
}

function renderClosingScriptToolbox() {
  updateClosingScriptPreview();
}

function copyClosingScript() {
  const text = document.getElementById('scriptPreviewText')?.innerText;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ Satış kapatma yanıtı panoya kopyalandı! WhatsApp veya Instagram DM penceresine yapıştırabilirsiniz.');
  }).catch(() => {
    alert(text);
  });
}

function openClosingWhatsApp() {
  const text = document.getElementById('scriptPreviewText')?.innerText;
  if (!text) return;
  const phone = (document.getElementById('scriptGuestPhone')?.value || '').replace(/[^0-9]/g, '');
  let url = 'https://wa.me/';
  if (phone) {
    let p = phone;
    if (p.startsWith('0')) p = '90' + p.slice(1);
    if (!p.startsWith('90')) p = '90' + p;
    url += p;
  }
  url += '?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

// -------------------------------------------------------------
// 3. 🔁 ESKİ MİSAFİR SADAKAT & TEKRAR GETİRME (RETENTION VIP CRM)
// -------------------------------------------------------------
function renderRetentionCrm() {
  const tbody = document.getElementById('retentionCrmTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const map = new Map();
  (appData.bookings || []).forEach(b => {
    if (b.status === 'CANCELLED') return;
    const key = (b.guest || '').trim();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        guest: key,
        villa: b.villa,
        villaName: (appData.villas && appData.villas[b.villa]?.name) ? appData.villas[b.villa].name : b.villa,
        bookingsCount: 0,
        totalNights: 0,
        totalSpent: 0,
        lastStay: b.checkOut
      });
    }
    const item = map.get(key);
    item.bookingsCount++;
    item.totalNights += Number(b.nights) || 0;
    item.totalSpent += Number(b.gross) || 0;
    if (new Date(b.checkOut) > new Date(item.lastStay)) {
      item.lastStay = b.checkOut;
      item.villa = b.villa;
      item.villaName = (appData.villas && appData.villas[b.villa]?.name) ? appData.villas[b.villa].name : b.villa;
    }
  });

  const guests = Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  if (guests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:16px; color:var(--text-muted);">Sistemde kayıtlı eski misafir bulunmuyor.</td></tr>';
    return;
  }

  guests.forEach(g => {
    const isVip = (g.totalSpent >= 50000 || g.totalNights >= 5 || g.bookingsCount >= 2);
    const badge = isVip
      ? '<span class="badge badge-purple" style="font-weight:700;">💎 VIP Misafir</span>'
      : '<span class="badge badge-blue">⭐ Sadık Misafir</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color:#F8FAFC;">${escapeHtml(g.guest)}</strong>
        <div style="font-size:11px; color:var(--text-muted);">${g.bookingsCount} Konaklama</div>
      </td>
      <td><span class="badge badge-secondary">${escapeHtml(g.villaName || 'Belirtilmedi')}</span></td>
      <td style="font-weight:700; color:#E2E8F0;">${g.totalNights} Gece</td>
      <td style="font-weight:800; color:#34D399;">₺${g.totalSpent.toLocaleString('tr-TR')}</td>
      <td style="font-size:12px; color:var(--text-muted);">${g.lastStay || '-'}</td>
      <td>${badge}</td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="sendGuestLoyaltyMessage(decodeURIComponent('${encodeActionArg(g.guest)}'), decodeURIComponent('${encodeActionArg(String(g.villa || ''))}'), '')" style="border-color:#10B981; color:#34D399; font-size:11px; font-weight:700;">
          💬 VIP Davet
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function sendGuestLoyaltyMessage(guestName, villaKey, phone) {
  const vName = (appData.villas && appData.villas[villaKey]?.name) ? appData.villas[villaKey].name : 'Lexbnb Villaları';
  const text = 'Merhaba ' + guestName + '!\n\n' +
    'Daha önce ' + vName + ' konaklamanızda sizi ağırlamaktan mutluluk duymuştuk. ' +
    'Yeni bir konaklama düşünüyorsanız güncel müsaitlik ve fiyat bilgisini paylaşabiliriz. Müsait tarihleri iletmemizi ister misiniz?';

  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

function sendBroadcastLoyaltyMessage() {
    const text = 'Değerli Misafirimiz, daha önce bizi tercih ettiğiniz için teşekkür ederiz.\n\n' +
    'Yeni bir konaklama düşünüyorsanız güncel müsaitlik ve fiyat bilgisini memnuniyetle paylaşabiliriz. ' +
    'Bilgi almak için bu mesaja yanıt vermeniz yeterli.';
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ Toplu kış sezonu VIP davet metni kopyalandı! WhatsApp bülten veya toplu mesaj listenizde kullanabilirsiniz.');
  }).catch(() => {
    alert(text);
  });
}

// -------------------------------------------------------------
/**
 * Gidişat sekmesindeki üç stratejik kutu.
 *
 * index.html'de SABIT metin olarak duruyorlardi: "komisyon (75.519 TL) ve
 * temizlik (47.000 TL) toplam 122.500 TL yuttu", "Villa Sunset Horizon fiyat
 * baskisi", "Villa Azure Bay portfoy lideri". Hicbiri hesaplanmiyordu; bos bir
 * hesapta bile ayni rakamlarla goruntuleniyordu.
 */
function renderTrajectoryInsights() {
  if (typeof document === 'undefined') return;
  const tehlike = document.getElementById('trajDangerText');
  const anomali = document.getElementById('trajAnomalyText');
  const firsat = document.getElementById('trajOpportunityText');
  if (!tehlike && !anomali && !firsat) return;

  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const bk = (appData.bookings || []).filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
  const paylar = bk.map(b => ({ b, p: getBookingFilterShare(b) }));
  const ciro = paylar.reduce((a, x) => a + (Number(x.b.gross) || 0) * x.p.ratio, 0);
  const komisyon = paylar.reduce((a, x) => a + (Number(x.b.otaCommission) || 0) * x.p.ratio, 0);
  const temizlikMaliyeti = (appData.expenses || [])
    .filter(e => isExpenseInFilter(e) && /temizlik/i.test(String(e.category || '')))
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const donem = getPeriodDisplayName(currentFilter.period);

  if (tehlike) {
    if (komisyon + temizlikMaliyeti <= 0) {
      tehlike.textContent = bk.length
        ? 'Bu dönemde OTA komisyonu veya temizlik maliyeti kaydedilmemiş.'
        : 'Bu dönemde rezervasyon kaydı yok.';
    } else {
      const oran = ciro > 0 ? ((komisyon + temizlikMaliyeti) / ciro) * 100 : null;
      tehlike.innerHTML = `<strong>Kayıtlı Komisyon ve Temizlik Maliyeti:</strong> ${donem} döneminde komisyon ${tl(komisyon)} TL, gider defterindeki temizlik maliyeti ${tl(temizlikMaliyeti)} TL — toplam <strong>${tl(komisyon + temizlikMaliyeti)} TL</strong>${oran !== null ? ` (cironun %${oran.toFixed(1)}'i)` : ''}.`;
    }
  }

  // Mulk bazinda gecelik fiyat karsilastirmasi
  const mulk = {};
  paylar.forEach(({ b, p }) => {
    const k = b.villa || b.propertyId || '—';
    if (!mulk[k]) mulk[k] = { ciro: 0, gece: 0 };
    // Gecelik fiyat NET ODA GELIRINDEN (K-04 ADR tanimi); brut temizlik
    // ucretini ve indirimi icerirdi.
    mulk[k].ciro += ((Number(b.gross) || 0) - (Number(b.cleanFee ?? b.cleaningFee) || 0) - (Number(b.discount) || 0)) * p.ratio;
    mulk[k].gece += p.nights;
  });
  const liste = Object.entries(mulk)
    .filter(([, v]) => v.gece > 0)
    .map(([k, v]) => ({
      ad: (appData.villas && appData.villas[k] && appData.villas[k].name) || k,
      adr: v.ciro / v.gece, gece: v.gece, ciro: v.ciro
    }))
    .sort((a, b) => b.adr - a.adr);

  if (anomali) {
    if (liste.length < 2) {
      anomali.textContent = 'Karşılaştırma için bu dönemde en az iki mülkte satış olmalı.';
    } else {
      const ort = liste.reduce((a, v) => a + v.adr, 0) / liste.length;
      const z = liste[liste.length - 1];
      anomali.innerHTML = z.adr < ort
        ? `<strong>${escapeHtml(z.ad)} Fiyat Baskısı:</strong> ${z.gece} gece satıldı ama gecelik ${tl(z.adr)} TL'de kaldı; portföy ortalaması ${tl(ort)} TL. Doluluk korunuyorsa taban fiyat yükseltilebilir.`
        : 'Bu dönemde mülkler arasında belirgin bir fiyat anomalisi yok.';
    }
  }

  if (firsat) {
    if (!liste.length) {
      firsat.textContent = 'Bu dönemde satış kaydı yok.';
    } else {
      const e = liste[0];
      const pay = ciro > 0 ? ((e.ciro / ciro) * 100).toFixed(1) : null;
      firsat.innerHTML = `<strong>${escapeHtml(e.ad)} Öne Çıkıyor:</strong> ${tl(e.adr)} TL/gece ile en yüksek gecelik fiyat${pay ? `, dönem cirosunun %${pay}'i` : ''}. Bu mülkte taban fiyatı koruyup erken rezervasyon açmak en yüksek getiriyi sağlar.`;
    }
  }
}

// -------------------------------------------------------------
// 4. ❄️ SEZONLUK & ÖZEL DÖNEM FIRSAT RADARI
// -------------------------------------------------------------
function renderSeasonalEventRadar() {
  const container = document.getElementById('seasonalEventsContainer');
  if (!container) return;
  container.innerHTML = '';

  // Bu bolum bastan asagi sabitti:
  //   - "bugun" = 2026-09-09 olarak yaziliydi, geri sayim hep ayni cikiyordu
  //   - etkinlik tarihleri 2026/2027'ye sabitti, 2028'de liste olurdu
  //   - doluluk rozetleri gercek rezervasyonlara BAKMIYORDU: her zaman
  //     "Villa Azure Bay DOLU, diger 4 villa BOS" yaziyordu; ustelik o
  //     villalar musterinin degildi
  //   - strateji metinleri olmayan villalarin adini veriyordu
  const bugun = new Date(getTodayStr() + 'T00:00:00');

  // Etkinlikler yila gore uretilir; gecmis kalanlar bir sonraki yila kayar.
  function tarih(yil, ay, gun) { return new Date(Date.UTC(yil, ay - 1, gun)); }
  const y = bugun.getUTCFullYear ? bugun.getFullYear() : new Date().getFullYear();

  const sablonlar = [
    { id: 'EV-WINTER-OPEN', icon: '❄️', name: 'Kar Sezonu Açılışı', ay: 12, gun: 1, bitAy: 12, bitGun: 15,
      advice: 'Erken rezervasyon kampanyası: sosyal medya bütçesini artırın, şömine ve kış görselleriyle "yerini şimdiden ayırt" mesajını öne çıkarın.' },
    { id: 'EV-NEWYEAR', icon: '🎄', name: 'Yılbaşı Tatili', ay: 12, gun: 31, bitAy: 1, bitGun: 3,
      advice: 'Minimum konaklama kuralı uygulayın. Fiyat kırmak yerine paket (barbekü sepeti, ikram, müzik) ile değer katın.' },
    { id: 'EV-SEMESTER', icon: '🎒', name: 'Sömestr Yarıyıl Tatili', ay: 1, gun: 22, bitAy: 2, bitGun: 7,
      advice: 'Aile segmentine yönelin: yüksek yatak kapasiteli mülkleri öne çıkaran arama reklamları planlayın.' },
    { id: 'EV-VALENTINE', icon: '💖', name: 'Sevgililer Günü', ay: 2, gun: 12, bitAy: 2, bitGun: 15,
      advice: 'Çiftlere yönelik kısa konaklama paketi kurgulayın: jakuzi, şömine, özel akşam yemeği.' },
    { id: 'EV-SPRING', icon: '🌸', name: 'Bahar Kaçamağı', ay: 3, gun: 20, bitAy: 3, bitGun: 25,
      advice: 'Doğa yürüyüşü, açık hava barbeküsü ve bahar teması üzerinden sosyal medya reklamları planlayın.' }
  ];

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const iki = n => String(n).padStart(2, '0');

  const events = sablonlar.map(t => {
    let yil = y;
    let bas = tarih(yil, t.ay, t.gun);
    // Gecmisse bir sonraki yila kaydir
    if (bas < bugun) { yil = y + 1; bas = tarih(yil, t.ay, t.gun); }
    const bitYil = t.bitAy < t.ay ? yil + 1 : yil;
    const bit = tarih(bitYil, t.bitAy, t.bitGun);
    return {
      ...t,
      startDate: bas,
      endDate: bit,
      basStr: `${yil}-${iki(t.ay)}-${iki(t.gun)}`,
      bitStr: `${bitYil}-${iki(t.bitAy)}-${iki(t.bitGun)}`,
      dates: `${t.gun} ${AYLAR[t.ay - 1]} ${yil} – ${t.bitGun} ${AYLAR[t.bitAy - 1]} ${bitYil}`
    };
  }).sort((a, b) => a.startDate - b.startDate);

  const villaKeys = Object.keys(appData.villas || {});
  if (villaKeys.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); padding:16px; text-align:center;">Sezon fırsatlarını görebilmek için önce mülk ekleyin.</div>';
    return;
  }

  // Bir mulk, verilen aralikta gercekten dolu mu? (Gerçek rezervasyonlardan.)
  function doluMu(vKey, basStr, bitStr) {
    return (appData.bookings || []).some(b => {
      if (b.status === 'CANCELLED') return false;
      const eslesme = b.villa === vKey || b.propertyId === vKey ||
        (appData.villas[vKey] && b.propertyId === appData.villas[vKey].id);
      if (!eslesme) return false;
      const ci = b.checkIn || '', co = b.checkOut || '';
      return ci && co && ci <= bitStr && co > basStr;
    });
  }

  events.forEach(ev => {
    const diffDays = Math.max(0, Math.round((ev.startDate - bugun) / (1000 * 60 * 60 * 24)));
    const durumlar = villaKeys.map(k => ({
      ad: (appData.villas[k] && appData.villas[k].name) || k,
      dolu: doluMu(k, ev.basStr, ev.bitStr)
    }));
    const doluSayi = durumlar.filter(d => d.dolu).length;

    const card = document.createElement('div');
    card.className = 'seasonal-event-card';
    card.innerHTML = `
      <div>
        <div class="seasonal-card-header">
          <div>
            <div style="font-size:15px; font-weight:800; color:#F8FAFC; display:flex; align-items:center; gap:6px;">
              <span>${ev.icon}</span> ${escapeHtml(ev.name)}
            </div>
            <div style="font-size:11px; color:#F0ABFC; margin-top:3px; font-weight:600;">${escapeHtml(ev.dates)}</div>
          </div>
          <span class="event-countdown-badge">⏳ ${diffDays} Gün Kaldı</span>
        </div>

        <div style="margin:10px 0;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Mülk Durumu (${doluSayi}/${durumlar.length} dolu):</div>
          <div>
            ${durumlar.map(d => `<span class="villa-occupancy-pill ${d.dolu ? 'full' : 'empty'}">${escapeHtml(d.ad)}: ${d.dolu ? 'DOLU ✅' : 'BOŞ ⚠️'}</span>`).join('')}
          </div>
        </div>

        <div style="font-size:11px; color:#CBD5E1; line-height:1.4; background:rgba(0,0,0,0.3); padding:8px; border-radius:6px; border:1px dashed rgba(217, 70, 239, 0.3);">
          🎯 <strong>Strateji:</strong> ${escapeHtml(ev.advice)}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// 5. 📸 INFLUENCER & BARTER İŞBİRLİĞİ ROI TAKİPÇİSİ
// -------------------------------------------------------------
function renderInfluencerRoiLedger() {
  const tbody = document.getElementById('influencerCollabsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!appData.influencerCollabs) {
    // DEFAULT_INFLUENCER_COLLABS demo temizliginde silindi.
    appData.influencerCollabs = [];
  }

  if (appData.influencerCollabs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:16px; color:var(--text-muted);">Kayıtlı influencer veya barter anlaşması bulunmuyor.</td></tr>';
    return;
  }

  appData.influencerCollabs.forEach(c => {
    const cost = Number(c.cost) || 0;
    const rev = Number(c.revenue) || 0;
    const roiCalc = cost > 0 ? (rev / cost).toFixed(1) + 'x' : '-';
    const vName = (appData.villas && appData.villas[c.villa]?.name) ? appData.villas[c.villa].name : c.villa;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong style="color:#FDE68A;">${escapeHtml(c.handle || 'Belirtilmedi')}</strong>
        <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(c.followers || '-')} Takipçi</div>
      </td>
      <td>
        <span class="badge badge-secondary">${escapeHtml(vName || 'Belirtilmedi')}</span>
        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${escapeHtml(c.dates || '-')}</div>
      </td>
      <td style="color:#F87171; font-weight:700;">₺${cost.toLocaleString('tr-TR')}</td>
      <td><span class="badge badge-purple" style="font-size:11px; font-weight:800;">${escapeHtml(c.code || '-')}</span></td>
      <td>
        <strong style="color:#34D399;">₺${rev.toLocaleString('tr-TR')}</strong>
        <div style="font-size:10px; color:var(--text-muted);">${c.bookingsCount || 0} Rezervasyon</div>
      </td>
      <td>
        <span class="badge ${Number(roiCalc) >= 5 ? 'badge-green' : 'badge-amber'}" style="font-weight:800; font-size:12px;">${roiCalc} ROI 🚀</span>
      </td>
      <td><span class="badge badge-green">${escapeHtml(c.status === 'COMPLETED' ? 'Tamamlandı' : (c.status || 'Belirtilmedi'))}</span></td>
      <td style="text-align: right; white-space: nowrap;">
        <button type="button" class="btn btn-secondary btn-sm" data-onclick="openInfluencerModal(decodeURIComponent('${encodeActionArg(String(c.id))}'))" style="padding:4px 8px; font-size:11px; margin-right:4px;">✏️ Düzenle</button>
        <button type="button" class="btn btn-secondary btn-sm text-danger" data-onclick="deleteInfluencerCollab(decodeURIComponent('${encodeActionArg(String(c.id))}'))" style="padding:4px 8px; font-size:11px;">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openInfluencerModal(id = null) {
  const modal = document.getElementById('influencerModal');
  const form = document.getElementById('influencerForm');
  const title = document.getElementById('influencerModalTitle');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('infCollabId').value = '';

  if (id) {
    const item = (appData.influencerCollabs || []).find(c => c.id === id);
    if (item) {
      if (title) title.innerText = 'Influencer / Barter Düzenle';
      document.getElementById('infCollabId').value = item.id;
      document.getElementById('infHandle').value = item.handle || '';
      document.getElementById('infFollowers').value = item.followers || '';
      document.getElementById('infVilla').value = item.villa || Object.keys(appData.villas || {})[0] || '';
      document.getElementById('infDates').value = item.dates || '';
      document.getElementById('infCost').value = item.cost || '';
      document.getElementById('infCode').value = item.code || '';
      document.getElementById('infBookingsCount').value = item.bookingsCount || '';
      document.getElementById('infRevenue').value = item.revenue || '';
      document.getElementById('infStatus').value = item.status || 'COMPLETED';
      document.getElementById('infNotes').value = item.notes || '';
    }
  } else {
    if (title) title.innerText = 'Yeni Influencer / Barter İşbirliği Ekle';
  }

  modal.classList.add('active');
}

function closeInfluencerModal() {
  const modal = document.getElementById('influencerModal');
  if (modal) modal.classList.remove('active');
}

async function saveInfluencerCollab(e) {
  e.preventDefault();
  if (!appData.influencerCollabs) appData.influencerCollabs = [];

  const id = document.getElementById('infCollabId').value;
  const handle = document.getElementById('infHandle').value.trim();
  const followers = document.getElementById('infFollowers').value.trim();
  const villa = document.getElementById('infVilla').value;
  const dates = document.getElementById('infDates').value.trim();
  const cost = Number(document.getElementById('infCost').value) || 0;
  const code = document.getElementById('infCode').value.trim().toUpperCase();
  const bookingsCount = Number(document.getElementById('infBookingsCount').value) || 0;
  const revenue = Number(document.getElementById('infRevenue').value) || 0;
  const status = document.getElementById('infStatus').value;
  const notes = document.getElementById('infNotes').value.trim();

  const isbirligi = {
    id: id || null,
    handle, followers, villa, dates, cost, code, bookingsCount, revenue, status, notes
  };

  const yazildi = await reportStatePersist(async () => {
    const satir = await cloudSaveInfluencerCollab(isbirligi);
    const kayit = mapInfluencerCollabFromDb(satir, buildPropertyIdSlugMap());
    const idx = appData.influencerCollabs.findIndex(c => c.id === kayit.id);
    if (idx !== -1) appData.influencerCollabs[idx] = kayit;
    else appData.influencerCollabs.push(kayit);
  });

  saveAppData();
  // Basarisizsa modal ACIK kalir: kullanici girdigi veriyi kaybetmesin.
  // Eskiden her durumda "başarıyla kaydedildi" deniyordu ve kayit
  // hicbir yere yazilmiyordu.
  if (!yazildi) return;
  closeInfluencerModal();
  renderInfluencerRoiLedger();
  alert('✅ Influencer / Barter işbirliği başarıyla kaydedildi!');
}

async function deleteInfluencerCollab(id) {
  if (!confirm('Bu influencer işbirliği kaydını silmek istediğinize emin misiniz?')) return;
  if (!appData.influencerCollabs) return;
  const yazildi = await reportStatePersist(
    () => cloudDeleteInfluencerCollab(id),
    'Influencer işbirliği silindi.'
  );
  if (!yazildi) return;
  appData.influencerCollabs = appData.influencerCollabs.filter(c => c.id !== id);
  saveAppData();
  renderInfluencerRoiLedger();
}

// =============================================================================
// 🌐 LEXBNB ENTERPRISE MULTI-TENANT SAAS & SUPABASE POSTGRESQL ENGINE
// =============================================================================

// Merkezi LexBnB Supabase Projesi (Kullanıcıdan asla API key istenmez)
const DEFAULT_SUPABASE_URL = 'https://kirpcqklyjlrhvdbgdrq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcnBjcWtseWpscmh2ZGJnZHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTcxMjksImV4cCI6MjEwNDU3MzEyOX0.qjZJYGo9mLL3kPYpjkGuAfToxu8Xud1kILCTuVl24O0';

// Hedef proje YALNIZ koddan gelir (L-20). Eskiden localStorage'daki
// LEXBNB_SUPABASE_URL okunuyordu: bir kez yazilan deger (ortak bilgisayar,
// eklenti, HTML enjeksiyonu) uygulamayi baska bir Supabase'e yonlendiriyor ve
// giris formu e-posta ile sifreyi oraya gonderiyordu. Eski anahtarlar
// acilista silinir.
const SUPABASE_URL = DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = DEFAULT_SUPABASE_KEY;
(function purgeLegacySupabaseOverrides() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('LEXBNB_SUPABASE_URL');
      localStorage.removeItem('LEXBNB_SUPABASE_PUBLISHABLE_KEY');
    }
  } catch (e) { /* gizli pencere vb. */ }
})();

let supabaseClient = null;
let activeSaaSUser = null; // { id, email, fullName }
let activeTenantId = null; // TEK MERKEZİ SOURCE-OF-TRUTH TENANT UUID
let activeTenant = null;   // { id, name, slug, role }
let userMemberships = [];  // Array of accessible memberships from PostgreSQL

function getActiveTenantId() {
  return activeTenantId || (activeTenant ? activeTenant.id : null);
}

function setActiveTenant(tenantObj) {
  if (tenantObj && tenantObj.id) {
    activeTenant = tenantObj;
    activeTenantId = tenantObj.id;
    if (typeof localStorage !== 'undefined' && isUUID(activeTenantId)) {
      localStorage.setItem('LEXBNB_LAST_TENANT', activeTenantId);
    }
  } else {
    activeTenant = null;
    activeTenantId = null;
  }
}

// -------------------------------------------------------------
// "BU CIHAZDA BENI HATIRLA" (L-21)
// -------------------------------------------------------------
// Kutu bir zamanlar hicbir sey yapmiyordu: istemci her durumda oturumu
// localStorage'a yaziyor, kutunun yazdigi anahtar hic okunmuyordu. Ortak bir
// bilgisayarda kutuyu bos birakip tarayiciyi kapatan kullanicinin oturumu
// (finans ve misafir verisi) bir sonraki kisiye acik kaliyordu.
//
// Supabase oturumu artik tercihe gore yazilir: isaretliyse localStorage'a ve
// en fazla 30 gun; isaretsizse sessionStorage'a (tarayici kapaninca biter).
// Tercih girisin HEMEN ONCESINDE yazilir; tercih yoksa (davet / sifre
// sifirlama baglantisi) oturum sekmeyle sinirli kalir.
const REMEMBER_PREF_KEY = 'LEXBNB_REMEMBER_DEVICE';
const REMEMBER_UNTIL_KEY = 'LEXBNB_REMEMBER_UNTIL';
const REMEMBER_DAYS = 30;

function guvenliDepo(ad) {
  try {
    const kok = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : null);
    const d = kok ? kok[ad] : null;
    return d && typeof d.getItem === 'function' ? d : null;
  } catch (_) { return null; }
}

function setRememberDevicePreference(remember, now) {
  const kalici = guvenliDepo('localStorage');
  if (!kalici) return;
  try {
    kalici.setItem(REMEMBER_PREF_KEY, remember ? '1' : '0');
    if (remember) kalici.setItem(REMEMBER_UNTIL_KEY, String((now || Date.now()) + REMEMBER_DAYS * 86400000));
    else kalici.removeItem(REMEMBER_UNTIL_KEY);
  } catch (_) { /* gizli pencere vb. */ }
}

function createAuthSessionStorage(nowFn) {
  const simdi = nowFn || (() => Date.now());
  const kalici = () => guvenliDepo('localStorage');
  const oturumluk = () => guvenliDepo('sessionStorage');
  const hatirla = () => {
    const d = kalici();
    try { return !!d && d.getItem(REMEMBER_PREF_KEY) === '1'; } catch (_) { return false; }
  };
  const suresiDoldu = () => {
    const d = kalici();
    try { return Number(d && d.getItem(REMEMBER_UNTIL_KEY)) < simdi(); } catch (_) { return true; }
  };
  const sil = key => {
    [kalici(), oturumluk()].forEach(d => { try { if (d) d.removeItem(key); } catch (_) { /* yoksay */ } });
  };
  return {
    getItem(key) {
      if (hatirla()) {
        if (suresiDoldu()) { sil(key); return null; }
        const d = kalici();
        try { return d ? d.getItem(key) : null; } catch (_) { return null; }
      }
      // Hatirlanmayan oturum yalniz sekmede durur. Eski surumun localStorage'a
      // yazdigi oturum burada okunmaz ve temizlenir.
      const d = oturumluk();
      try { const k = kalici(); if (k) k.removeItem(key); } catch (_) { /* yoksay */ }
      try { return d ? d.getItem(key) : null; } catch (_) { return null; }
    },
    setItem(key, value) {
      const hedef = hatirla() ? kalici() : oturumluk();
      const diger = hatirla() ? oturumluk() : kalici();
      try { if (diger) diger.removeItem(key); } catch (_) { /* yoksay */ }
      try { if (hedef) hedef.setItem(key, value); } catch (_) { /* yoksay */ }
    },
    removeItem(key) { sil(key); }
  };
}

/**
 * Tarayicida bir kez kurulur:
 *   - window.alert kanali ham sunucu mesajini ayiklar (L-22). Uygulamadaki
 *     yuzlerce "alert('... : ' + err.message)" noktasi tek tek degil, kanalin
 *     kendisinde duzeltilir; uygulamanin Turkce metni degismez.
 *   - Yakalanmamis hata ve reddedilmis promise kullaniciya gorunur (L-24).
 *     Eskiden sessizce konsolda kaliyordu: "Lexbnb'e Sor" her soruda
 *     cokuyordu (L-60) ve kimse gormuyordu. Harici servis yok (K-07).
 */
function installUserFacingErrorChannels() {
  if (typeof window === 'undefined' || window.__lexbnbErrorChannels) return;
  if (typeof window.addEventListener !== 'function') return; // tarayici disi (test) ortam
  window.__lexbnbErrorChannels = true;
  const U = getUserFacingErrors();
  if (!U) return;
  if (typeof window.alert === 'function') {
    const asilAlert = window.alert.bind(window);
    window.alert = m => asilAlert(U.sanitizeUserMessage(m));
  }
  const kapi = U.createGlobalErrorGate(() => Date.now(), window.location ? window.location.origin : '');
  const bildir = (olay, ayrinti) => {
    console.error('[Lexbnb yakalanmamis hata]', ayrinti);
    if (!kapi(olay)) return;
    if (typeof showToast === 'function') {
      showToast('⚠️ Beklenmeyen bir hata oluştu; son işleminiz tamamlanmamış olabilir. Sayfayı yenileyip tekrar deneyin.', 'error');
    }
  };
  window.addEventListener('error', olay => bildir(olay, olay.error || olay.message));
  window.addEventListener('unhandledrejection', olay => bildir(olay, olay.reason));
}
installUserFacingErrorChannels();

function initSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      if (SUPABASE_URL && !SUPABASE_URL.includes('your-project') && !SUPABASE_URL.includes('example')) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'LEXBNB_SUPA_AUTH',
            storage: createAuthSessionStorage()
          }
        });
        console.log('⚡ LexBnB Cloud Engine: Supabase client aktif.');
      }
    } catch (err) {
      console.warn('Supabase init notice:', err);
    }
  }
}
initSupabaseClient();

// Eski surumlerin tarayiciya yazdigi duz metin sifreli kaydi temizle.
(function purgeLegacyUserRegistry() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('LEXBNB_USERS_REGISTRY')) {
      localStorage.removeItem('LEXBNB_USERS_REGISTRY');
    }
  } catch (e) { /* private mode vb. */ }
})();

function switchAuthTab(tab) {
  const btnLogin = document.getElementById('tabBtnLogin');
  const btnRegister = document.getElementById('tabBtnRegister');
  const formLogin = document.getElementById('saasLoginForm');
  const formRegister = document.getElementById('saasRegisterForm');
  const err = document.getElementById('authErrorMessage');
  if (err) err.style.display = 'none';

  if (tab === 'login') {
    if (btnLogin) {
      btnLogin.style.background = '#8B5CF6';
      btnLogin.style.color = '#fff';
      btnLogin.style.fontWeight = '700';
    }
    if (btnRegister) {
      btnRegister.style.background = 'transparent';
      btnRegister.style.color = '#94A3B8';
      btnRegister.style.fontWeight = '600';
    }
    if (formLogin) formLogin.style.display = 'block';
    if (formRegister) formRegister.style.display = 'none';
  } else {
    if (btnLogin) {
      btnLogin.style.background = 'transparent';
      btnLogin.style.color = '#94A3B8';
      btnLogin.style.fontWeight = '600';
    }
    if (btnRegister) {
      btnRegister.style.background = '#10B981';
      btnRegister.style.color = '#fff';
      btnRegister.style.fontWeight = '700';
    }
    if (formLogin) formLogin.style.display = 'none';
    if (formRegister) formRegister.style.display = 'block';
  }

  // Sifre sifirlama ve yeni sifre formlari sekme disidir; tab degisiminde kapanir.
  const formForgot = document.getElementById('saasForgotForm');
  const formNewPass = document.getElementById('saasNewPassForm');
  const tabs = document.querySelector('.saas-auth-tabs');
  if (formForgot) formForgot.style.display = 'none';
  if (formNewPass) formNewPass.style.display = 'none';
  if (tabs) tabs.style.display = 'flex';
}

// -------------------------------------------------------------
// SIFRE SIFIRLAMA AKISI
// Kullanici e-posta ister -> Supabase recovery linki yollar -> link ile
// donuldugunde (#type=recovery) yeni sifre formu acilir -> updateUser().
// -------------------------------------------------------------
function showForgotPasswordForm() {
  const formLogin = document.getElementById('saasLoginForm');
  const formRegister = document.getElementById('saasRegisterForm');
  const formForgot = document.getElementById('saasForgotForm');
  const err = document.getElementById('authErrorMessage');
  if (err) err.style.display = 'none';
  if (formLogin) formLogin.style.display = 'none';
  if (formRegister) formRegister.style.display = 'none';
  if (formForgot) formForgot.style.display = 'block';

  // Giris ekraninda yazilan e-postayi tasi
  const typed = document.getElementById('saasLoginUser')?.value.trim();
  const target = document.getElementById('saasForgotEmail');
  if (typed && target && typed.includes('@')) target.value = typed;
  if (target) setTimeout(() => target.focus(), 50);
}

async function handleSaaSForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('saasForgotEmail')?.value.trim().toLowerCase() || '';
  const err = document.getElementById('authErrorMessage');
  const submitBtn = document.getElementById('saasForgotSubmitBtn');

  if (err) {
    err.style.display = 'none';
    err.style.background = '';
    err.style.border = '';
    err.style.color = '';
  }

  if (!email || !email.includes('@')) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Lütfen geçerli bir e-posta adresi girin.';
    }
    return;
  }

  if (!supabaseClient) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Bulut bağlantısı kurulamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Gönderiliyor...';
  }

  try {
    const redirectTo = window.location.origin + window.location.pathname;
    const captchaToken = await getAuthCaptchaToken('saasForgotForm');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, captchaToken ? { redirectTo, captchaToken } : { redirectTo });
    consumeAuthCaptcha('saasForgotForm');

    // Hesabin var olup olmadigini ASLA sizdirma: her iki durumda ayni mesaj.
    if (error && !/rate limit|Too many requests/i.test(error.message || '')) {
      console.warn('Password reset notice:', error);
    }

    if (err) {
      err.style.display = 'block';
      if (error && /rate limit|Too many requests/i.test(error.message || '')) {
        err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(error);
      } else {
        err.style.background = 'rgba(59, 130, 246, 0.15)';
        err.style.border = '1px solid #3B82F6';
        err.style.color = '#93C5FD';
        err.innerHTML = `📬 <strong>Sıfırlama Bağlantısı Gönderildi</strong><br>
        <span style="font-size:12px;">Bu adrese ait bir hesap varsa, <strong>${escapeHtml(email)}</strong> adresine şifre yenileme bağlantısı gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin.</span>`;
      }
    }
  } catch (ex) {
    console.error('Password reset error:', ex);
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(ex);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '📧 Sıfırlama Bağlantısı Gönder';
    }
  }
}

function showNewPasswordForm() {
  showLockOverlay();
  const tabs = document.querySelector('.saas-auth-tabs');
  ['saasLoginForm', 'saasRegisterForm', 'saasForgotForm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (tabs) tabs.style.display = 'none';
  const intro = document.getElementById('saasNewPassIntro');
  if (intro) {
    intro.innerText = getPasswordSetupRedirectType() === 'invite'
      ? 'Ekibe davet edildiniz. Sonraki girişleriniz için bir şifre belirleyin.'
      : 'Yeni şifrenizi belirleyin.';
  }
  const form = document.getElementById('saasNewPassForm');
  if (form) form.style.display = 'block';
  setTimeout(() => document.getElementById('saasNewPass1')?.focus(), 80);
}

async function handleSaaSNewPassword(e) {
  e.preventDefault();
  const p1 = document.getElementById('saasNewPass1')?.value.trim() || '';
  const p2 = document.getElementById('saasNewPass2')?.value.trim() || '';
  const err = document.getElementById('authErrorMessage');
  const submitBtn = document.getElementById('saasNewPassSubmitBtn');

  if (err) {
    err.style.display = 'none';
    err.style.background = '';
    err.style.border = '';
    err.style.color = '';
  }

  if (p1.length < AUTH_MIN_PASSWORD_LENGTH) {
    if (err) {
      err.style.display = 'block';
      err.innerText = `⚠️ Şifreniz en az ${AUTH_MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
    }
    return;
  }

  if (p1 !== p2) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Girdiğiniz iki şifre birbiriyle uyuşmuyor.';
    }
    return;
  }

  if (!supabaseClient) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Güncelleniyor...';
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: p1 });
    if (error) {
      if (err) {
        err.style.display = 'block';
        err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(error);
      }
      return;
    }

    // URL'deki recovery token'ini temizle, gecmise sizmasin
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      await handleAuthenticatedSession(session.user);
    } else {
      switchAuthTab('login');
      if (err) {
        err.style.display = 'block';
        err.style.background = 'rgba(16, 185, 129, 0.15)';
        err.style.border = '1px solid #10B981';
        err.style.color = '#A7F3D0';
        err.innerText = '✅ Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.';
      }
    }
  } catch (ex) {
    console.error('Update password error:', ex);
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(ex);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '🔒 Şifremi Güncelle';
    }
  }
}

// Supabase recovery linkiyle donuldugunde token URL hash'inde gelir.
// Sifre belirletilmesi gereken iki link turu var:
//   recovery -> sifremi unuttum
//   invite   -> ekip daveti. Davet edilen hesabin SIFRESI YOKTUR; link oturumu
//               acar ama giris yalnizca e-posta+sifre ile yapildigi icin
//               (CLAUDE.md 3.1) sifre belirletilmezse kisi bir sonraki girisinde
//               iceri giremezdi.
function getPasswordSetupRedirectType() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  const type = (hash && new URLSearchParams(hash).get('type'))
    || new URLSearchParams(window.location.search).get('type');
  return type === 'recovery' || type === 'invite' ? type : null;
}

function isPasswordRecoveryRedirect() {
  return getPasswordSetupRedirectType() !== null;
}

// RESTORE SESSION ON LOAD & AUTH STATE LISTENER
async function checkCloudSession() {
  if (!supabaseClient) return false;
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error || !session || !session.user) return false;

    return await handleAuthenticatedSession(session.user);
  } catch (e) {
    console.warn('Cloud session restore note:', e);
  }
  return false;
}
if (typeof window !== 'undefined') {
  window.checkCloudSession = checkCloudSession;
}

// Merkezi Authenticated Session Yöneticisi (PHASE 3)
async function handleAuthenticatedSession(u) {
  if (!u || !u.id) return false;

  activeSaaSUser = {
    id: u.id,
    email: u.email,
    fullName: u.user_metadata?.full_name || u.email.split('@')[0]
  };

  // 0. Bu adrese gonderilmis bekleyen davetleri uyelige cevir.
  //    Uyelikler asagida okunacagi icin bundan ONCE calismali, aksi halde
  //    davet edilen kullanici ilk girisinde isletmeyi goremez.
  //    Hata olursa giris akisini KESME - davet ikincil bir yoldur.
  try {
    const { data: accepted, error: acceptErr } = await supabaseClient.rpc('accept_pending_invitations');
    if (acceptErr) {
      console.warn('Bekleyen davetler kontrol edilemedi:', acceptErr.message);
    } else if (accepted && accepted.joined > 0) {
      console.log(`✉️ ${accepted.joined} davet kabul edildi.`);
      window.LEXBNB_JUST_JOINED = accepted.joined;
    }
  } catch (e) {
    console.warn('Bekleyen davet kontrolu atlandi:', e);
  }

  // 1. Kullanıcının üye olduğu TÜM tenant'ları PostgreSQL'den çek (Source of Truth)
  const { data: members, error: memErr } = await supabaseClient
    .from('tenant_members')
    .select('tenant_id, role, tenants(id, name, slug, plan)')
    .eq('user_id', u.id)
    .order('created_at', { ascending: true });

  // Uyelik OKUNAMADIYSA (ag, RLS, zaman asimi) kullanicinin isletmesi yok
  // DEGILDIR. Eskiden hata okunmuyor, bos liste "henuz isletme yok" sayiliyor
  // ve asagidaki kurtarma yolu kullaniciya IKINCI bir isletme aciyordu (L-06).
  if (memErr) {
    console.error('Uyelik okunamadi:', memErr);
    const hataKutusu = document.getElementById('authErrorMessage');
    if (hataKutusu) {
      hataKutusu.style.display = 'block';
      hataKutusu.innerText = '⚠️ İşletme bilgileriniz şu an okunamadı. Bağlantınızı kontrol edip yeniden giriş yapın.';
    }
    return false;
  }

  userMemberships = members || [];

  if (userMemberships.length > 0) {
    // 2. Aktif tenant'ı belirle
    let selectedMem = null;

    if (userMemberships.length === 1) {
      // Tek tenant kullanıcısı: otomatik seç
      selectedMem = userMemberships[0];
    } else {
      // Birden fazla tenant kullanıcısı: son seçilen tenant ID'sini doğrula
      const cachedTenantId = localStorage.getItem('LEXBNB_LAST_TENANT');
      if (cachedTenantId) {
        selectedMem = userMemberships.find(m => m.tenant_id === cachedTenantId);
      }
      if (!selectedMem) {
        selectedMem = userMemberships[0];
      }
    }

    setActiveTenant({
      id: selectedMem.tenant_id,
      name: selectedMem.tenants?.name || 'İşletmem',
      slug: selectedMem.tenants?.slug || 'tenant',
      role: selectedMem.role || 'owner'
    });
  } else {
    // 3. Recovery: Kullanıcı Auth'ta var ama henüz tenant'ı yok (Örn: E-posta onayından döndüyse)
    let compName = u.user_metadata?.company_name || 'İşletme Portföyü';
    let mgrName = activeSaaSUser.fullName;

    const pendingRaw = sessionStorage.getItem('LEXBNB_PENDING_ONBOARDING') || localStorage.getItem('LEXBNB_PENDING_ONBOARDING');
    if (pendingRaw) {
      try {
        const p = JSON.parse(pendingRaw);
        if (p.companyName) compName = p.companyName;
        if (p.managerName) mgrName = p.managerName;
      } catch (e) {}
      sessionStorage.removeItem('LEXBNB_PENDING_ONBOARDING');
      localStorage.removeItem('LEXBNB_PENDING_ONBOARDING');
    }

    try {
      const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('create_tenant_and_owner', {
        p_company_name: compName,
        p_full_name: mgrName
      });

      if (rpcErr || !rpcRes) {
        console.error('Atomic tenant recovery error:', rpcErr);
        const err = document.getElementById('authErrorMessage');
        if (err) {
          err.style.display = 'block';
          err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(rpcErr || 'İşletme kurulumu tamamlanamadı.');
        }
        return false;
      }

      setActiveTenant({
        id: rpcRes.tenant_id,
        name: rpcRes.tenant_name,
        slug: rpcRes.tenant_slug,
        role: rpcRes.role || 'owner'
      });

      userMemberships = [{
        tenant_id: activeTenantId,
        role: activeTenant.role,
        tenants: { id: activeTenantId, name: activeTenant.name, slug: activeTenant.slug }
      }];
    } catch (createErr) {
      console.error('Atomic tenant creation exception:', createErr);
      return false;
    }
  }

  sessionStorage.setItem('LEXBNB_ACTIVE_USER', JSON.stringify(activeSaaSUser));
  if (activeTenant) {
    sessionStorage.setItem('LEXBNB_ACTIVE_TENANT', JSON.stringify(activeTenant));
  }
  sessionStorage.setItem('LEXBNB_ACTIVE_USER_ID', u.id);

  hideLockOverlay();
  updateSaaSUi();
  renderTenantSelector();

  if (activeTenantId) {
    await loadTenantAppData(activeTenantId);
    subscribeTenantRealtime(activeTenantId);

    // Mülk sayısı 0 ise Onboarding modalını aç
    const propCount = Object.keys(appData.villas || {}).length;
    if (propCount === 0) {
      openOnboardingModal(activeTenant.name);
    }
  }
  return true;
}

// =============================================================
// TENANT SWITCH AKIŞI (PHASE 3)
// 1. Eski realtime subscription kapat.
// 2. Eski tenant'a ait business state temizle.
// 3. activeTenantId güncelle.
// 4. Yeni tenant verilerini Supabase'den yükle.
// 5. UI hydrate et.
// 6. Yeni realtime subscription başlat.
// 7. Dashboard render et.
// =============================================================
async function switchActiveTenant(targetTenantId) {
  if (!targetTenantId || targetTenantId === activeTenantId) return;

  const targetMem = userMemberships.find(m => m.tenant_id === targetTenantId);
  if (!targetMem) {
    console.error('Unauthorized tenant switch attempted:', targetTenantId);
    if (window.showToast) window.showToast('⚠️ Bu işletmeye erişim yetkiniz bulunmuyor.');
    return;
  }

  // 1. Eski realtime subscription kapat
  unsubscribeTenantRealtime();

  // 2. Eski tenant'a ait business state temizle (Sıfır veri sızıntısı)
  appData = getBlankTenantData(targetTenantId);
  if (window.currentFilter) window.currentFilter.villa = 'ALL';

  // 3. activeTenantId güncelle
  setActiveTenant({
    id: targetMem.tenant_id,
    name: targetMem.tenants?.name || 'İşletmem',
    slug: targetMem.tenants?.slug || 'tenant',
    role: targetMem.role || 'viewer'
  });

  sessionStorage.setItem('LEXBNB_ACTIVE_TENANT', JSON.stringify(activeTenant));
  localStorage.setItem('LEXBNB_LAST_TENANT', activeTenantId);

  // 4. UI yükleniyor bildirimi
  if (window.showToast) window.showToast('⏳ ' + activeTenant.name + ' verileri yükleniyor...');
  updateSaaSUi();
  renderTenantSelector();

  try {
    // 5. Yeni tenant verilerini Supabase'den yükle
    await loadTenantAppData(activeTenantId);

    // 6. Yeni realtime subscription başlat
    subscribeTenantRealtime(activeTenantId);

    // 7. Dashboard render et
    updateAllVillaDropdowns();
    renderAll();

    if (window.showToast) window.showToast('✅ ' + activeTenant.name + ' aktif işletme yapıldı.');
  } catch (err) {
    console.error('Tenant switch data load error:', err);
    if (window.showToast) window.showToast('⚠️ İşletme verileri yüklenemedi. Tekrar deneyin.');
  }
}

function renderTenantSelector() {
  const container = document.getElementById('tenantSwitcherContainer');
  const dropdown = document.getElementById('tenantSelectDropdown');
  if (!container || !dropdown) return;

  if (!userMemberships || userMemberships.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  dropdown.innerHTML = '';

  userMemberships.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.tenant_id;
    const tName = m.tenants?.name || 'İşletme';
    const tRole = (m.role || 'üye').toUpperCase();
    opt.textContent = `${tName} (${tRole})`;
    if (m.tenant_id === activeTenantId) {
      opt.selected = true;
    }
    dropdown.appendChild(opt);
  });
}

async function handleSaaSLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('saasLoginUser')?.value.trim() || '';
  const passInput = document.getElementById('saasLoginPass')?.value.trim() || '';
  const remember = document.getElementById('authRememberCheckbox')?.checked;
  const err = document.getElementById('authErrorMessage');
  const submitBtn = document.getElementById('saasLoginSubmitBtn');

  if (err) {
    err.style.display = 'none';
    err.style.background = '';
    err.style.border = '';
    err.style.color = '';
  }

  // 2. Giriş yalnızca e-posta ile yapılır (Supabase Auth source-of-truth)
  if (!userInput.includes('@')) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Lütfen kullanıcı adı değil, hesabınızın e-posta adresini girin.';
    }
    return;
  }

  if (!supabaseClient) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Bulut bağlantısı kurulamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.';
    }
    return;
  }

  // Buton yükleniyor durumu ve çift tıklama önleme
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Giriş Yapılıyor...';
  }

  try {
    // Oturum yazilmadan ONCE: depo bagdastiricisi hangi depoya yazacagini
    // bu tercihten okur (L-21).
    setRememberDevicePreference(!!remember);
    const captchaToken = await getAuthCaptchaToken('saasLoginForm');
    const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
      email: userInput,
      password: passInput,
      ...(captchaToken ? { options: { captchaToken } } : {})
    });
    consumeAuthCaptcha('saasLoginForm');

    if (authErr) {
      if (err) {
        err.style.display = 'block';
        if (authErr.message && authErr.message.includes('Email not confirmed')) {
          err.style.background = 'rgba(245, 158, 11, 0.15)';
          err.style.border = '1px solid #F59E0B';
          err.style.color = '#FDE68A';
          err.innerHTML = '📬 <strong>E-posta Doğrulaması Gerekiyor:</strong><br><span style="font-size:12px;">Lütfen gelen kutunuzdaki aktivasyon bağlantısına tıklayıp ardından yeniden giriş yapın.</span>';
        } else {
          err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(authErr);
        }
      }
      return;
    }

    if (authData && authData.user) {
      const ok = await handleAuthenticatedSession(authData.user);
      if (!ok && err) {
        err.style.display = 'block';
        err.innerText = '⚠️ Oturum açıldı ancak işletme verisi yüklenemedi.';
      }
    }
  } catch (supaErr) {
    console.error('Supabase cloud login error:', supaErr);
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(supaErr);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '🔓 Hesabıma Giriş Yap';
    }
  }
}

// =============================================================================
// KAYIT & ATOMİK TENANT KURULUM AKIŞI:
// Kesintisiz, anında aktif olan hem yerel hem bulut kayıt mimarisi
// =============================================================================
async function handleSaaSRegister(e) {
  e.preventDefault();
  const company = document.getElementById('saasRegCompany')?.value.trim() || 'Özel Tatil Evleri';
  const manager = document.getElementById('saasRegManager')?.value.trim() || 'İşletme Yöneticisi';
  const email = document.getElementById('saasRegEmail')?.value.trim().toLowerCase() || '';
  const pass = document.getElementById('saasRegPass')?.value.trim() || '';
  const err = document.getElementById('authErrorMessage');
  const submitBtn = document.getElementById('saasRegSubmitBtn');

  if (err) {
    err.style.display = 'none';
    err.style.background = '';
    err.style.border = '';
    err.style.color = '';
  }

  if (!email || !pass) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Lütfen tüm alanları doldurun.';
    }
    return;
  }

  if (pass.length < AUTH_MIN_PASSWORD_LENGTH) {
    if (err) {
      err.style.display = 'block';
      err.innerText = `⚠️ Şifreniz en az ${AUTH_MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
    }
    return;
  }

  if (!supabaseClient) {
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ Bulut bağlantısı kurulamadı. İnternet bağlantınızı kontrol edip sayfayı yenileyin.';
    }
    return;
  }

  // Buton yükleniyor durumu ve çift tıklama önleme
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Hesabınız Oluşturuluyor...';
  }

  try {
    // Adım 1: Supabase Auth kullanıcısı oluştur
    const captchaToken = await getAuthCaptchaToken('saasRegisterForm');
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: manager, company_name: company }, ...(captchaToken ? { captchaToken } : {}) }
    });
    consumeAuthCaptcha('saasRegisterForm');

    if (authError) {
      if (err) {
        err.style.display = 'block';
        err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(authError);
      }
      return;
    }

    const user = authData?.user;
    if (!user) {
      if (err) {
        err.style.display = 'block';
        err.innerText = '⚠️ Kullanıcı hesabı oluşturulamadı. Lütfen tekrar deneyin.';
      }
      return;
    }

    // Adım 2: E-posta onayı zorunluysa session gelmez. Authenticated session
    // olmadan ASLA tenant yaratmaya kalkışma; kullanıcıyı bilgilendir.
    if (!authData.session) {
      sessionStorage.setItem('LEXBNB_PENDING_ONBOARDING', JSON.stringify({
        companyName: company,
        managerName: manager,
        email: email
      }));

      if (err) {
        err.style.display = 'block';
        err.style.background = 'rgba(59, 130, 246, 0.15)';
        err.style.border = '1px solid #3B82F6';
        err.style.color = '#93C5FD';
        err.innerHTML = `📬 <strong>Aktivasyon E-postası Gönderildi!</strong><br>
        <span style="font-size:12px;">Lütfen <strong>${escapeHtml(email)}</strong> adresine gönderilen onay linkine tıklayın. Doğrulama sonrası kaldığınız yerden devam edebilirsiniz.</span>`;
      }
      return;
    }

    // Adım 3: Authenticated session var -> tek atomik DB işlemiyle tenant + owner kur
    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('create_tenant_and_owner', {
      p_company_name: company,
      p_full_name: manager
    });

    if (rpcErr || !rpcRes) {
      console.error('Atomic create_tenant_and_owner error:', rpcErr);
      if (err) {
        err.style.display = 'block';
        err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(rpcErr || 'İşletme kurulumu tamamlanamadı.');
      }
      return;
    }

    activeSaaSUser = { id: user.id, email: user.email, fullName: manager };
    setActiveTenant({
      id: rpcRes.tenant_id,
      name: rpcRes.tenant_name,
      slug: rpcRes.tenant_slug,
      role: rpcRes.role || 'owner'
    });

    sessionStorage.setItem('LEXBNB_ACTIVE_USER', JSON.stringify(activeSaaSUser));
    sessionStorage.setItem('LEXBNB_ACTIVE_TENANT', JSON.stringify(activeTenant));
    sessionStorage.setItem('LEXBNB_ACTIVE_USER_ID', user.id);

    // Temiz başlangıç (Asla sahte/eski veri yüklenmez)
    appData = getBlankTenantData(activeTenant.id);
    appData.companyName = company;
    saveAppData();

    hideLockOverlay();
    updateSaaSUi();
    subscribeTenantRealtime(activeTenant.id);
    updateAllVillaDropdowns();
    renderAll();

    // Adım 4: Onboarding modalı (kullanıcı ilk mülkünü eklesin)
    openOnboardingModal(company);
  } catch (supaErr) {
    console.error('Supabase cloud signup error:', supaErr);
    if (err) {
      err.style.display = 'block';
      err.innerText = '⚠️ ' + getFriendlyAuthErrorMessage(supaErr);
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = '✨ Hesabımı Oluştur ve Başla';
    }
  }
}

async function logoutSaaSUser() {
  if (!confirm('Oturumunuzu kapatmak istediğinize emin misiniz?')) return;

  unsubscribeTenantRealtime();
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn('SignOut note:', e);
    }
  }

  activeSaaSUser = null;
  activeTenant = null;
  activeTenantId = null;
  userMemberships = [];

  clearLexbnbBrowserStorage(sessionStorage);
  localStorage.removeItem('LEXBNB_REMEMBER_USER_ID');
  localStorage.removeItem('LEXBNB_REMEMBER_AUTH');
  localStorage.removeItem('LEXBNB_LAST_TENANT');
  localStorage.removeItem(REMEMBER_PREF_KEY);
  localStorage.removeItem(REMEMBER_UNTIL_KEY);

  // Business state'i sıfırla (Önceki kullanıcının verisi ekranda ve bellekte kalmasın)
  appData = getBlankTenantData('guest');
  if (window.currentFilter) window.currentFilter.villa = 'ALL';
  updateAllVillaDropdowns();
  renderAll();
  renderTenantSelector();

  showLockOverlay();
}

// =============================================================================
// 💾 PHASE 31 — YEREL KALAN SON ALTI DEFTER
//
// `saveAppData()` hicbir sey kaydetmez; govdesi yalnizca eski localStorage
// anahtarlarini siler (CLAUDE.md 6). Asagidaki alti akis "yazilacak tablo yok"
// dendigi icin bellekte kaliyordu: kullanici kampanyayi giriyor, tabloda
// goruyor, sayfayi yenileyince kaybediyordu. phase31 gocu tablolari actı;
// burasi o tablolarin okuma/yazma katmanidir.
//
// Her yazma `requireCloudForWrite` (3.3) ile korunur ve dustugu anda ekran
// `loadTenantAppData()` ile gercege geri cekilir — bellekteki degisiklik
// ekranda "kaydedilmis" gibi kalmaz.
// =============================================================================

/**
 * Goc uygulanmadan once de ekran calissin: tablo yoksa `null` doner.
 * `null` = "sema hazir degil", `[]` = "hazir ama bos". Ikisi ayri seydir;
 * ilkinde kullaniciya YAZARKEN sebebi soylenir.
 */
async function fetchTenantRowsTolerant(buildQuery) {
  try {
    return await fetchAllCloudRows(buildQuery);
  } catch (err) {
    if (isMissingSchemaError(err)) return null;
    throw err;
  }
}

const PHASE31_SEMA_YOK =
  'Bu kayit icin veritabani tablosu henuz olusturulmamis (phase31 gocu ' +
  'uygulanmadi). Degisiklik kaydedilmedi.';

/** Yazma hatasini yuzeye cikarir ve ekrani gercege geri ceker. */
async function reportStatePersist(yazici, basariMesaji) {
  try {
    await yazici();
    if (basariMesaji && typeof window !== 'undefined' && window.showToast) {
      window.showToast(basariMesaji);
    }
    return true;
  } catch (err) {
    const ham = err && err.message ? err.message : 'Kayit veritabanina yazilamadi.';
    const mesaj = '⚠️ ' + (isMissingSchemaError(err) ? PHASE31_SEMA_YOK : ham);
    if (typeof window !== 'undefined' && window.showToast) window.showToast(mesaj, 'error');
    else console.error(mesaj);
    if (typeof loadTenantAppData === 'function' && isCloudTenant(getActiveTenantId())) {
      try { await loadTenantAppData(getActiveTenantId()); } catch (_) { /* yeniden yukleme de dustu */ }
    }
    return false;
  }
}

/** property_id -> villa slug. Kayit sonrasi donen satiri esleme icin. */
function buildPropertyIdSlugMap() {
  const harita = {};
  const villas = (typeof appData !== 'undefined' && appData) ? (appData.villas || {}) : {};
  Object.values(villas).forEach(p => { if (p && p.id) harita[p.id] = p.slug; });
  return harita;
}

/** `villa` slug'i -> property_id. 'ALL' portfoy genelidir, mulke baglanmaz. */
async function resolveOptionalPropertyId(villaKey, tenantId) {
  if (!villaKey || villaKey === 'ALL') return null;
  return await getPropertyIdBySlug(villaKey, tenantId);
}

function mapMarketingCampaignFromDb(row, propIdMap = {}) {
  return {
    id: row.id,
    name: row.name || '',
    platform: row.platform || 'OTHER',
    villa: row.property_id ? (propIdMap[row.property_id] || row.property_id) : 'ALL',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    budget: Number(row.budget) || 0,
    spent: Number(row.spent) || 0,
    clicks: Number(row.clicks) || 0,
    leads: Number(row.leads_count) || 0,
    bookingsCount: Number(row.bookings_count) || 0,
    revenue: Number(row.revenue) || 0,
    status: row.status || 'ACTIVE',
    notes: row.notes || ''
  };
}

function mapInfluencerCollabFromDb(row, propIdMap = {}) {
  return {
    id: row.id,
    handle: row.handle || '',
    followers: row.followers || '',
    villa: row.property_id ? (propIdMap[row.property_id] || row.property_id) : 'ALL',
    dates: row.collab_dates || '',
    cost: Number(row.cost) || 0,
    code: row.discount_code || '',
    bookingsCount: Number(row.bookings_count) || 0,
    revenue: Number(row.revenue) || 0,
    status: row.status || 'COMPLETED',
    notes: row.notes || ''
  };
}

async function cloudSaveMarketingCampaign(kampanya) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Reklam kampanyasi', tenantId);
  const satir = {
    tenant_id: tenantId,
    property_id: await resolveOptionalPropertyId(kampanya.villa, tenantId),
    name: kampanya.name,
    platform: kampanya.platform,
    start_date: kampanya.startDate || null,
    end_date: kampanya.endDate || null,
    budget: Number(kampanya.budget) || 0,
    spent: Number(kampanya.spent) || 0,
    clicks: Number(kampanya.clicks) || 0,
    leads_count: Number(kampanya.leads) || 0,
    bookings_count: Number(kampanya.bookingsCount) || 0,
    revenue: Number(kampanya.revenue) || 0,
    status: kampanya.status || 'ACTIVE',
    notes: kampanya.notes || ''
  };
  if (kampanya.id && isUUID(kampanya.id)) satir.id = kampanya.id;
  else satir.created_by = activeSaaSUser?.id;

  const { data, error } = await supabaseClient
    .from('marketing_campaigns')
    .upsert(satir, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function cloudDeleteMarketingCampaign(id) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Reklam kampanyasi silme', tenantId);
  const { error } = await supabaseClient
    .from('marketing_campaigns').delete().match({ tenant_id: tenantId, id });
  if (error) throw error;
}

async function cloudSaveInfluencerCollab(isbirligi) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Influencer isbirligi', tenantId);
  const satir = {
    tenant_id: tenantId,
    property_id: await resolveOptionalPropertyId(isbirligi.villa, tenantId),
    handle: isbirligi.handle,
    followers: isbirligi.followers || null,
    collab_dates: isbirligi.dates || null,
    cost: Number(isbirligi.cost) || 0,
    discount_code: isbirligi.code || null,
    bookings_count: Number(isbirligi.bookingsCount) || 0,
    revenue: Number(isbirligi.revenue) || 0,
    status: isbirligi.status || 'COMPLETED',
    notes: isbirligi.notes || ''
  };
  if (isbirligi.id && isUUID(isbirligi.id)) satir.id = isbirligi.id;
  else satir.created_by = activeSaaSUser?.id;

  const { data, error } = await supabaseClient
    .from('influencer_collabs')
    .upsert(satir, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function cloudDeleteInfluencerCollab(id) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Influencer isbirligi silme', tenantId);
  const { error } = await supabaseClient
    .from('influencer_collabs').delete().match({ tenant_id: tenantId, id });
  if (error) throw error;
}

async function cloudSaveTenantSetting(anahtar, deger) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Isletme ayari', tenantId);
  const { error } = await supabaseClient.from('tenant_settings').upsert({
    tenant_id: tenantId,
    key: anahtar,
    value: deger,
    updated_by: activeSaaSUser?.id
  }, { onConflict: 'tenant_id, key' });
  if (error) throw error;
}

async function cloudSaveOperatorNote(villaKey, not) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Operator notu', tenantId);
  const propId = await getPropertyIdBySlug(villaKey, tenantId);
  if (!propId) throw new Error('Operator notu kaydedilemedi: mulk bulunamadi.');
  const { error } = await supabaseClient.from('property_operator_notes').upsert({
    property_id: propId,
    tenant_id: tenantId,
    note: not || '',
    updated_by: activeSaaSUser?.id
  }, { onConflict: 'property_id' });
  if (error) throw error;
}

/**
 * Merdivenin girilmemis basamagi `null` gider — 0 DEGIL.
 * `|| 3000` kalibi tam olarak burada uydurma veri uretiyordu (3.6).
 */
async function cloudSavePricingLadder(villaKey, merdiven) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Fiyat merdiveni', tenantId);
  const propId = await getPropertyIdBySlug(villaKey, tenantId);
  if (!propId) throw new Error('Fiyat merdiveni kaydedilemedi: mulk bulunamadi.');
  const sayi = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const { error } = await supabaseClient.from('property_pricing_ladder').upsert({
    property_id: propId,
    tenant_id: tenantId,
    floor_price: sayi(merdiven.floor),
    target_price: sayi(merdiven.target),
    premium_price: sayi(merdiven.premium),
    peak_price: sayi(merdiven.peak),
    heating_cost: sayi(merdiven.heatCost),
    updated_by: activeSaaSUser?.id
  }, { onConflict: 'property_id' });
  if (error) throw error;
}

/** `status === null` = AUTO: gecersiz kilma satiri SILINIR. */
async function cloudSaveHousekeepingOverride(villaKey, status) {
  const tenantId = getActiveTenantId();
  requireCloudForWrite('Mülk satış hazırlığı', tenantId);
  const api = getPropertySalesReadinessApi();
  if (status && (!api || !api.SELECTABLE_STATUSES.includes(status))) {
    throw new Error('Geçersiz mülk hazırlık durumu.');
  }
  const propId = await getPropertyIdBySlug(villaKey, tenantId);
  if (!propId) throw new Error('Mülk hazırlık durumu kaydedilemedi: mülk bulunamadı.');
  if (!status) {
    const { error } = await supabaseClient.from('housekeeping_status_overrides')
      .delete().match({ tenant_id: tenantId, property_id: propId });
    if (error) throw error;
    return;
  }
  const { error } = await supabaseClient.from('housekeeping_status_overrides').upsert({
    property_id: propId,
    tenant_id: tenantId,
    status,
    updated_by: activeSaaSUser?.id
  }, { onConflict: 'property_id' });
  if (error) {
    if (error.code === '23514' || String(error.message || '').includes('housekeeping_status_overrides_status_check')) {
      throw new Error('Mülk satış hazırlığı için Phase 36 veritabanı güncellemesi henüz uygulanmadı. Değişiklik kaydedilmedi.');
    }
    throw error;
  }
}

// -------------------------------------------------------------
// ☁️ VERİ YÜKLEME (SUPABASE = SOURCE OF TRUTH)
// -------------------------------------------------------------
async function loadTenantAppData(tenantIdOrUserId) {
  const targetId = tenantIdOrUserId || getActiveTenantId();

  // 1. Supabase Cloud Source of Truth
  if (isCloudTenant(targetId)) {
    try {
      const tenantId = targetId;
      // Independent datasets are loaded concurrently and every list is paged;
      // Supabase's per-response cap must never silently truncate a dashboard.
      const [villas, bookings, expenses, cleanList, leads, closeList, targetList, maintenanceTickets, operationalTasks, financialTransactions, guests, guestConsentEvents, bookingChannelCatalog, scheduledMessages, extensionOffers, userNotifications, campaignRows, influencerRows, settingRows, operatorNoteRows, pricingLadderRows, hkOverrideRows, paymentCommissionRows] = await Promise.all([
        loadProperties(tenantId),
        loadBookings(tenantId),
        loadExpenses(tenantId),
        fetchAllCloudRows(() => supabaseClient.from('cleaning_tasks').select('*').eq('tenant_id', tenantId).order('task_date', { ascending: false })),
        loadLeads(tenantId),
        fetchAllCloudRows(() => supabaseClient.from('monthly_financial_closes').select('*').eq('tenant_id', tenantId).order('year', { ascending: false }).order('month', { ascending: false })),
        fetchAllCloudRows(() => supabaseClient.from('monthly_targets').select('*').eq('tenant_id', tenantId).order('year', { ascending: false }).order('month', { ascending: false })),
        fetchAllCloudRows(() => supabaseClient.from('maintenance_tickets').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        fetchAllCloudRows(() => supabaseClient.from('operational_tasks').select('*').eq('tenant_id', tenantId).order('due_at', { ascending: true })),
        fetchAllCloudRows(() => supabaseClient.from('financial_transactions').select('*').eq('tenant_id', tenantId).order('occurred_on', { ascending: false })),
        fetchAllCloudRows(() => supabaseClient.from('guests').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        fetchAllCloudRows(() => supabaseClient.from('guest_consent_events').select('*').eq('tenant_id', tenantId).order('recorded_at', { ascending: false })),
        loadTenantBookingChannels(tenantId),
        fetchAllCloudRows(() => supabaseClient.from('scheduled_messages').select('*').eq('tenant_id', tenantId).order('scheduled_at', { ascending: true })),
        fetchAllCloudRows(() => supabaseClient.from('extension_offers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        // Bildirim merkezi: `appData.userNotifications` HIC ATANMIYORDU.
        // Zil ikonu, rozet ve cekmece yalnizca bu diziyi okuyor, yani
        // bildirim merkezi musteride HER ZAMAN bos gorunuyordu.
        fetchAllCloudRows(() => supabaseClient.from('user_notifications').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        // phase31 defterleri: goc uygulanmadan once `null` doner, ekran
        // bos ama calisir durumda kalir (dagitim sirasi tuzagi).
        fetchTenantRowsTolerant(() => supabaseClient.from('marketing_campaigns').select('*').eq('tenant_id', tenantId).order('start_date', { ascending: false, nullsFirst: false })),
        fetchTenantRowsTolerant(() => supabaseClient.from('influencer_collabs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })),
        fetchTenantRowsTolerant(() => supabaseClient.from('tenant_settings').select('*').eq('tenant_id', tenantId)),
        fetchTenantRowsTolerant(() => supabaseClient.from('property_operator_notes').select('*').eq('tenant_id', tenantId)),
        fetchTenantRowsTolerant(() => supabaseClient.from('property_pricing_ladder').select('*').eq('tenant_id', tenantId)),
        fetchTenantRowsTolerant(() => supabaseClient.from('housekeeping_status_overrides').select('*').eq('tenant_id', tenantId)),
        // phase45: rezervasyon basina odeme komisyonu. Goc yoksa null doner;
        // komisyon 0 degil BILINMIYOR kalir ama ekran calisir.
        fetchTenantRowsTolerant(() => supabaseClient.from('booking_payment_commissions').select('booking_id, amount').eq('tenant_id', tenantId))
      ]);
      const propIdMap = {};
      Object.values(villas || {}).forEach(p => {
        if (p.id) propIdMap[p.id] = p.slug;
      });
      const bookingsWithVillaSlugs = attachBookingVillaSlugs(bookings, villas);
      // Gider ve talepler mulklerle PARALEL yuklenir; esleyici mulk kisa adini
      // o anki (bos olabilen) listeden cozer ve kisa ad yerine UUID kalir. Mulk
      // filtresinde o mulkun giderleri kayboluyor, mulk kari sisiyordu (L-38).
      // Rezervasyonlardaki gibi yukleme BITTIKTEN sonra yeniden baglanir.
      const expensesWithSlugs = attachBookingVillaSlugs(expenses, villas);
      const leadsWithSlugs = attachBookingVillaSlugs(leads, villas);
      const odemeKomisyonu = {};
      (paymentCommissionRows || []).forEach(r => { odemeKomisyonu[r.booking_id] = Number(r.amount) || 0; });
      bookingsWithVillaSlugs.forEach(b => {
        if (Object.prototype.hasOwnProperty.call(odemeKomisyonu, b.id)) b.paymentCommission = odemeKomisyonu[b.id];
      });

      // --- phase31: yerel kalan alti defter -------------------------------
      // Fiyat merdiveni mulk nesnesine geri yazilir: ayar ekrani `v.floor`,
      // `v.heatCost` ... okuyor. `properties`'e sutun eklenmedi, cunku mulk
      // CRUD'una yeni sutun sokmak goc uygulanana kadar mulk kaydetmeyi
      // tamamen kirar (AGENTS.md, dagitim sirasi tuzagi).
      (pricingLadderRows || []).forEach(r => {
        const slug = propIdMap[r.property_id];
        const v = slug && villas ? villas[slug] : null;
        if (!v) return;
        // null = kullanici girmedi. 0'a cevirmek "bilinmiyor"u "sifir"
        // yapardi; ekranda "—" yerine rakam cikardi (3.6).
        if (r.floor_price !== null) v.floor = Number(r.floor_price);
        if (r.target_price !== null) v.target = Number(r.target_price);
        if (r.premium_price !== null) v.premium = Number(r.premium_price);
        if (r.peak_price !== null) v.peak = Number(r.peak_price);
        if (r.heating_cost !== null) v.heatCost = Number(r.heating_cost);
      });

      const housekeepingOverrides = {};
      (hkOverrideRows || []).forEach(r => {
        const slug = propIdMap[r.property_id];
        if (slug) housekeepingOverrides[slug] = r.status;
      });

      const airbnbListings = {};
      (operatorNoteRows || []).forEach(r => {
        const slug = propIdMap[r.property_id];
        if (slug) airbnbListings[slug] = { operatorNote: r.note || '' };
      });

      const ayarlar = {};
      (settingRows || []).forEach(r => { ayarlar[r.key] = r.value; });

      const cleaningTasks = (cleanList || []).map(c => normalizeCleaningTask(c, villas));

      // `cleaningPayments` (kokpitteki villa bazli "ödendi/borç" durumu)
      // HICBIR YERDE YUKLENMIYORDU: yenilemeden sonra her villa yeniden
      // "borç" gorunuyordu. Ayri bir tabloda tutulmaz — ayni sayiyi iki
      // yerde saklamak "hangisi dogru" sorusunu acar (3.4). Villanin en
      // guncel temizlik gorevinden TURETILIR.
      const cleaningPayments = {};
      cleaningTasks.forEach(t => {
        if (!t.villa || t.status !== 'DONE') return;
        const mevcut = cleaningPayments[t.villa];
        if (!mevcut || (t.date || '') > (mevcut.date || '')) {
          cleaningPayments[t.villa] = { paid: !!t.paid, amount: t.amount, date: t.date };
        }
      });

      appData = {
        tenantId,
        companyName: activeTenant?.name || 'İşletmem',
        villas,
        bookings: bookingsWithVillaSlugs,
        guests: (guests || []).map(mapGuestFromDb),
        guestConsentEvents: guestConsentEvents || [],
        bookingChannels: bookingChannelCatalog.rows,
        bookingChannelSchemaReady: bookingChannelCatalog.schemaReady,
        scheduledMessages: scheduledMessages || [],
        extensionOffers: extensionOffers || [],
        expenses: expensesWithSlugs,
        cleaningTasks,
        cleaningPayments,
        leads: leadsWithSlugs,
        closedPeriods: closeList || [],
        targets: targetList || [],
        maintenance: maintenanceTickets.map(t => mapMaintenanceTicketFromDb(t, propIdMap)),
        maintenanceTickets,
        operationalTasks: operationalTasks || [],
        financialTransactions: financialTransactions || [],
        userNotifications: userNotifications || [],
        marketingCampaigns: (campaignRows || []).map(r => mapMarketingCampaignFromDb(r, propIdMap)),
        influencerCollabs: (influencerRows || []).map(r => mapInfluencerCollabFromDb(r, propIdMap)),
        housekeepingOverrides,
        airbnbListings,
        // Ayar okunamiyorsa (goc yok) varsayilan 'MARKUP' kalir; bu bir
        // uydurma veri degil, ozelligin tanimli baslangic modudur.
        otaPricingStrategy: ayarlar.ota_pricing_strategy || 'MARKUP',
        // Hangi defterlerin semasi hazir? Yazma tarafi buna bakmaz
        // (hatayi Postgres soyler) ama ekranin "kayit yok" ile "tablo yok"
        // ayrimini yapabilmesi icin tasinir.
        phase31SchemaReady: campaignRows !== null && influencerRows !== null
          && settingRows !== null && operatorNoteRows !== null
          && pricingLadderRows !== null && hkOverrideRows !== null,
        loadState: { status: 'READY', stale: false, loadedAt: new Date().toISOString() },
        isCleanState: Object.keys(villas).length === 0
      };

      invalidateExecutiveSnapshotCache();
      updateAllVillaDropdowns();
      renderAll();
      return;
    } catch (err) {
      console.error('Cloud data fetch error:', err);
      // Keep the last verified in-memory view visible, but explicitly mark it as
      // stale. Never replace a transport error with a misleading empty company.
      appData.loadState = { status: 'ERROR', stale: true, message: getFriendlyAuthErrorMessage(err) };
      if (window.showToast) {
        window.showToast('⚠️ İşletme verileri yenilenemedi; ekrandaki son doğrulanmış görünüm korunuyor. Lütfen tekrar deneyin.', 'error');
      }
      return;
    }
  }

  // Demo / yerel boş state
  appData = getBlankTenantData(targetId);
  invalidateExecutiveSnapshotCache();
  updateAllVillaDropdowns();
  renderAll();
}

function getBlankTenantData(userId) {
  return {
    tenantId: userId,
    companyName: 'Özel Mülk Portföyü',
    managerName: 'Yönetici',
    villas: {},
    bookings: [],
    guests: [],
    guestConsentEvents: [],
    bookingChannels: getFallbackBookingChannels(),
    bookingChannelSchemaReady: false,
    scheduledMessages: [],
    extensionOffers: [],
    expenses: [],
    cleaningTasks: [],
    leads: [],
    closedPeriods: [],
    targets: [],
    maintenance: [],
    maintenanceTickets: [],
    operationalTasks: [],
    financialTransactions: [],
    marketingCampaigns: [],
    influencerCollabs: [],
    housekeepingOverrides: {},
    airbnbListings: {},
    phase31SchemaReady: false,
    otaPricingStrategy: 'MARKUP'
  };
}

function updateSaaSUi() {
  const user = activeSaaSUser;
  if (!user) return;

  const tName = activeTenant?.name || user.companyName || 'LexBnB SaaS';
  const roleText = activeTenant?.role ? ` (${activeTenant.role.toUpperCase()})` : '';

  const headerComp = document.getElementById('headerCompanyName');
  if (headerComp) headerComp.innerText = tName + roleText;

  const menuTitle = document.getElementById('menuCompanyTitle');
  if (menuTitle) menuTitle.innerText = tName;

  const menuEmail = document.getElementById('menuUserEmail');
  if (menuEmail) menuEmail.innerText = (user.fullName || user.managerName ? (user.fullName || user.managerName) + ' • ' : '') + user.email;

  const menuPlan = document.getElementById('menuPlanBadge');
  if (menuPlan) menuPlan.innerText = user.plan ? user.plan + ' 🚀' : 'Plan bilgisi yok';
}

// Portfoydeki mulk sayisi. Uygulama 5 villalik demo portfoye gore yazilmisti
// ve bircok etiket "5 Villa" olarak KODA GOMULUYDU; 1 mulklu bir musteri de
// "Mulkler (5)" goruyordu. Bu sayilar artik tek yerden turetilir.
function getPortfolioVillaCount() {
  return (appData && appData.villas)
    ? Object.values(appData.villas).filter(v => v && v.isActive !== false && !v.archivedAt).length
    : 0;
}

function portfolioLabel(suffix) {
  return getPortfolioVillaCount() + ' Villa' + (suffix || '');
}

function refreshPortfolioCountLabels() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('propCountBadge');
  if (badge) badge.innerText = String(getPortfolioVillaCount());
  const hkBadge = document.getElementById('todayHousekeepingBadge');
  if (hkBadge) hkBadge.innerText = portfolioLabel();
  const hkMeta = document.getElementById('hkKpiTotalOpsMeta');
  if (hkMeta) hkMeta.innerText = portfolioLabel(' Toplamı');
}

function updateAllVillaDropdowns() {
  if (!appData || !appData.villas) return;

  const villaKeys = Object.keys(appData.villas).filter(k => {
    const v = appData.villas[k];
    return v && v.isActive !== false && !v.archivedAt;
  });

  const dropdownIds = [
    'globalVillaFilter',
    'resVilla',
    'expVilla',
    'leadVilla',
    'maintVilla',
    'mktVilla',
    'infVilla',
    'scriptVillaSelect',
    'abTestVillaSelect',
    'calendarVillaFilter',
    'pricingVillaFilter',
    'opsVillaFilter',
    'hkVilla',
    'guestVilla',
    // Bu ikisi listede yoktu: markup'taki bes uydurma villa hicbir zaman
    // yenilenmiyor, musteri kendi mulklerini burada goremiyordu.
    'rezVillaFilter',
    'waParsedVilla'
  ];

  dropdownIds.forEach(selectId => {
    const el = document.getElementById(selectId);
    if (!el) return;

    const currentVal = el.value;
    el.innerHTML = '';

    // "Tüm portföy" secenegi olmasi gerekenler. expVilla ve rezVillaFilter
    // markup'ta bu secenege sahipti ama listeye alinmadigi icin JS onlari
    // yeniden kurarken secenek kayboluyordu.
    const TUMU_OLANLAR = ['globalVillaFilter', 'mktVilla', 'expVilla', 'rezVillaFilter',
                          'calendarVillaFilter', 'pricingVillaFilter', 'opsVillaFilter'];
    if (TUMU_OLANLAR.includes(selectId)) {
      const optAll = document.createElement('option');
      optAll.value = 'ALL';
      optAll.innerText = 'Tüm Villalar / Portföy';
      el.appendChild(optAll);
    }

    if (selectId === 'waParsedVilla') {
      const optUnknown = document.createElement('option');
      optUnknown.value = '';
      optUnknown.innerText = 'Mesajdan algılanmadı — seçin';
      el.appendChild(optUnknown);
    }

    if (villaKeys.length === 0) {
      const bos = document.createElement('option');
      bos.value = '';
      bos.innerText = 'Henüz mülk eklenmemiş';
      bos.disabled = true;
      el.appendChild(bos);
    }

    villaKeys.forEach(vKey => {
      const v = appData.villas[vKey];
      const opt = document.createElement('option');
      opt.value = vKey;
      opt.innerText = (v && v.name) ? v.name + (v.capacity ? ' (' + v.capacity + ')' : '') : vKey;
      el.appendChild(opt);
    });

    if (currentVal && (currentVal === 'ALL' || villaKeys.includes(currentVal))) {
      el.value = currentVal;
    }
  });
}

// -------------------------------------------------------------
// 🏡 DİNAMİK MÜLK / VİLLA YÖNETİMİ (PROPERTY CRUD UI)
// -------------------------------------------------------------
function openPropertyModal(villaKey = null) {
  const modal = document.getElementById('propertyModal');
  const form = document.getElementById('propertyForm');
  const title = document.getElementById('propertyModalTitle');
  if (!modal || !form) return;

  form.reset();
  document.getElementById('propEditKey').value = '';
  if (typeof resetPropertyAnalysisContextForm === 'function') resetPropertyAnalysisContextForm();

  let deleteBtn = document.getElementById('propDeleteBtn');
  if (!deleteBtn) {
    const footer = modal.querySelector('.modal-footer');
    if (footer) {
      deleteBtn = document.createElement('button');
      deleteBtn.id = 'propDeleteBtn';
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.style.cssText = 'background:#ef4444; border:none; margin-right:auto;';
      deleteBtn.innerText = '🗑️ Mülkü Sil';
      deleteBtn.onclick = handlePropertyDeleteFromModal;
      footer.insertBefore(deleteBtn, footer.firstChild);
    }
  }

  if (villaKey && appData.villas && appData.villas[villaKey]) {
    const v = appData.villas[villaKey];
    if (title) title.innerText = '🏡 ' + v.name + ' Düzenle';
    document.getElementById('propEditKey').value = villaKey;
    document.getElementById('propKey').value = villaKey;
    document.getElementById('propKey').readOnly = true;
    document.getElementById('propName').value = v.name || '';
    document.getElementById('propCapacity').value = v.capacity || '';
    // Girilmemis fiyat 20.000 / 1.500 olarak DOLDURULMAZ: kullanici hic
    // girmedigi bir rakami kaydediyordu ve o rakam mulkun fiyati oluyordu.
    document.getElementById('propBasePrice').value = (Number(v.basePrice) || Number(v.adr) || '');
    document.getElementById('propCleanCost').value = (Number(v.cleanCost) || '');
    document.getElementById('propAmenities').value = v.amenities || '';
    document.getElementById('propUrl').value = v.url || '';
    if (typeof loadPropertyAnalysisContextForm === 'function') loadPropertyAnalysisContextForm(v.id);
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-block';
    }
  } else {
    if (title) title.innerText = '🏡 Yeni Villa / Mülk Ekle';
    document.getElementById('propKey').readOnly = false;
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
  }

  modal.classList.add('active');
}

function closePropertyModal() {
  const modal = document.getElementById('propertyModal');
  if (modal) modal.classList.remove('active');
}

async function handlePropertyDeleteFromModal() {
  const editKey = document.getElementById('propEditKey')?.value;
  if (editKey) {
    return await deletePropertyUI(editKey);
  }
  return false;
}

async function saveProperty(e) {
  e.preventDefault();
  if (!appData.villas) appData.villas = {};

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn ? submitBtn.innerText : '💾 Mülkü Kaydet';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Kaydediliyor...';
  }

  try {
    const editKey = document.getElementById('propEditKey').value;
    let rawKey = document.getElementById('propKey').value.trim().toUpperCase();
    rawKey = rawKey.replace(/[^A-Z0-9_]/g, '_');

    const name = document.getElementById('propName').value.trim();
    const capacity = document.getElementById('propCapacity').value.trim();
    const basePrice = Number(document.getElementById('propBasePrice').value) || 0;
    const cleanCost = Number(document.getElementById('propCleanCost').value) || 0;
    const amenities = document.getElementById('propAmenities').value.trim();
    const url = document.getElementById('propUrl').value.trim();

    if (!name) {
      alert('Lütfen geçerli bir mülk adı giriniz.');
      return;
    }

    const propData = {
      name,
      capacity,
      basePrice,
      adr: basePrice,
      cleanCost,
      amenities,
      url
    };

    let savedProperty;
    if (editKey) {
      savedProperty = await updateProperty(editKey, propData);
    } else {
      propData.slug = rawKey || name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      savedProperty = await createProperty(propData);
    }

    let contextWarning = '';
    if (typeof savePropertyAnalysisContextDraft === 'function' && savedProperty?.id) {
      try {
        await savePropertyAnalysisContextDraft(savedProperty.id);
      } catch (contextError) {
        const migrationMissing = typeof PropertyAnalysisContextService !== 'undefined'
          && PropertyAnalysisContextService.isMissingSchemaError(contextError);
        contextWarning = migrationMissing
          ? '\n\n⚠️ Mülk kaydedildi; konum/sosyal profil için Phase 40 göçü henüz uygulanmamış.'
          : '\n\n⚠️ Mülk kaydedildi; konum/sosyal profil kaydedilemedi. Lütfen yeniden deneyin.';
      }
    }

    closePropertyModal();
    updateAllVillaDropdowns();
    renderAll();
    alert('✅ ' + name + ' başarıyla mülk portföyünüze kaydedildi!' + contextWarning);
  } catch (err) {
    console.error('saveProperty error:', err);
    alert('Mülk kaydedilemedi: ' + (err.message || 'Lütfen bilgileri kontrol edip tekrar deneyin.'));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

// -------------------------------------------------------------
// 🚀 ONBOARDING MODAL & SUBMIT
// -------------------------------------------------------------
function openOnboardingModal(companyName = '') {
  const modal = document.getElementById('onboardingModal');
  const title = document.getElementById('onboardingModalTitle');
  if (modal) {
    if (title && companyName) title.innerText = '🎉 Hoş Geldiniz! ' + companyName + ' İlk Mülkünü Tanımlayın';
    modal.classList.add('active');
  }
}

function closeOnboardingModal() {
  const modal = document.getElementById('onboardingModal');
  if (modal) modal.classList.remove('active');
}

async function handleOnboardingSubmit(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.innerText : '🚀 Başlat';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = '⏳ Hazırlanıyor...';
  }

  try {
    const name = document.getElementById('onboardPropName')?.value.trim();
    if (!name) {
      alert('Lütfen geçerli bir mülk adı giriniz.');
      return;
    }

    let slug = document.getElementById('onboardPropKey')?.value.trim().toUpperCase() || 'VILLA_1';
    slug = slug.replace(/[^A-Z0-9_]/g, '_');
    const capacity = document.getElementById('onboardPropCapacity')?.value.trim() || '';
    const basePrice = Number(document.getElementById('onboardPropBasePrice')?.value);
    const cleanCost = Number(document.getElementById('onboardPropCleanCost')?.value || 0);
    const amenities = document.getElementById('onboardPropAmenities')?.value.trim() || '';

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      alert('Lütfen sıfır veya daha büyük geçerli bir gecelik fiyat giriniz.');
      return;
    }
    if (!Number.isFinite(cleanCost) || cleanCost < 0) {
      alert('Lütfen sıfır veya daha büyük geçerli bir temizlik maliyeti giriniz.');
      return;
    }

    await createProperty({
      slug,
      name,
      capacity,
      basePrice,
      adr: basePrice,
      cleanCost,
      amenities
    });

    closeOnboardingModal();
    updateAllVillaDropdowns();
    renderAll();
    alert('🎉 Tebrikler! ' + name + ' başarıyla eklendi. Yönetim kokpitiniz hazır!');
  } catch (err) {
    console.error('Onboarding submit error:', err);
    alert('İlk mülk kaydedilemedi: ' + (err.message || 'Lütfen tekrar deneyin.'));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalText;
    }
  }
}

// -------------------------------------------------------------
// ⚡ TARGETED REALTIME SUBSCRIPTION & CLEANUP (PHASE 6)
// -------------------------------------------------------------
let activeRealtimeChannel = null;

const TENANT_REALTIME_TABLES = [
  'properties',
  'bookings',
  'expenses',
  'cleaning_tasks',
  'leads',
  'monthly_financial_closes',
  'monthly_targets',
  'maintenance_tickets',
  'operational_tasks',
  'financial_transactions',
  'guests',
  'user_notifications'
];

function getTenantRealtimeTables() {
  return TENANT_REALTIME_TABLES.slice();
}

function applyRealtimeArrayEvent(items, payload, mapper) {
  const collection = Array.isArray(items) ? items : [];
  const eventType = payload?.eventType;
  const row = eventType === 'DELETE' ? payload?.old : payload?.new;
  if (!row?.id) return { changed: false, items: collection };
  if (eventType === 'DELETE') {
    const next = collection.filter(item => item?.id !== row.id && item?.dbId !== row.id);
    return { changed: next.length !== collection.length, items: next };
  }
  if (eventType !== 'INSERT' && eventType !== 'UPDATE') return { changed: false, items: collection };
  const mapped = mapper(row);
  if (!mapped) return { changed: false, items: collection };
  const index = collection.findIndex(item => item?.id === row.id || item?.dbId === row.id);
  if (index === -1) return { changed: true, items: [mapped, ...collection] };
  const next = collection.slice();
  next[index] = mapped;
  return { changed: true, items: next };
}

function applyTenantRealtimePayload(table, payload) {
  if (!TENANT_REALTIME_TABLES.includes(table)) return false;
  if (table === 'properties') {
    const row = payload?.eventType === 'DELETE' ? payload?.old : payload?.new;
    if (!row?.id) return false;
    const villas = { ...(appData.villas || {}) };
    const existingKey = Object.keys(villas).find(key => villas[key]?.id === row.id);
    if (existingKey) delete villas[existingKey];
    if (payload.eventType !== 'DELETE') {
      const mapped = mapPropertyFromDb(row);
      if (!mapped?.slug) return false;
      villas[mapped.slug] = mapped;
    }
    appData.villas = villas;
    return true;
  }

  const propertyIdMap = {};
  Object.entries(appData.villas || {}).forEach(([slug, property]) => {
    if (property?.id) propertyIdMap[property.id] = slug;
  });
  let relatedStateChanged = false;
  if (table === 'maintenance_tickets') {
    const rawTickets = applyRealtimeArrayEvent(appData.maintenanceTickets, payload, row => row);
    if (rawTickets.changed) appData.maintenanceTickets = rawTickets.items;
    relatedStateChanged = rawTickets.changed;
  }
  const configs = {
    bookings: ['bookings', row => mapBookingFromDb(row, propertyIdMap)],
    expenses: ['expenses', mapExpenseFromDb],
    cleaning_tasks: ['cleaningTasks', row => normalizeCleaningTask(row, appData.villas || propertyIdMap)],
    leads: ['leads', mapLeadFromDb],
    monthly_financial_closes: ['closedPeriods', row => row],
    monthly_targets: ['targets', row => row],
    maintenance_tickets: ['maintenance', row => mapMaintenanceTicketFromDb(row, propertyIdMap)],
    operational_tasks: ['operationalTasks', row => row],
    financial_transactions: ['financialTransactions', row => row],
    guests: ['guests', row => row],
    user_notifications: ['userNotifications', row => row]
  };
  const [stateKey, mapper] = configs[table] || [];
  if (!stateKey) return false;
  const result = applyRealtimeArrayEvent(appData[stateKey], payload, mapper);
  if (result.changed) appData[stateKey] = result.items;
  return result.changed || relatedStateChanged;
}

function renderTenantRealtimeChange(table) {
  if (typeof document === 'undefined') return;
  invalidateExecutiveSnapshotCache();
  if (table === 'properties') updateAllVillaDropdowns();
  if (table === 'bookings' && typeof syncBookingCleaningTasks === 'function') syncBookingCleaningTasks();
  renderAll();
}

function unsubscribeTenantRealtime() {
  const channel = activeRealtimeChannel;
  activeRealtimeChannel = null;
  if (channel && supabaseClient) {
    try {
      supabaseClient.removeChannel(channel);
      console.log('⚡ Realtime: Önceki kanal aboneliği sonlandırıldı ve soket temizlendi.');
    } catch (e) {
      console.warn('Realtime teardown notice:', e);
    }
  }
}

function subscribeTenantRealtime(tenantId) {
  unsubscribeTenantRealtime();
  if (!isCloudTenant(tenantId)) return;
  try {
    let channel = supabaseClient.channel(`tenant-${tenantId}-ops`);
    TENANT_REALTIME_TABLES.forEach(table => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` },
        payload => {
          if (!activeTenant || activeTenant.id !== tenantId) return;
          const eventRow = payload?.eventType === 'DELETE' ? payload?.old : payload?.new;
          if (eventRow?.tenant_id && eventRow.tenant_id !== tenantId) return;
          if (applyTenantRealtimePayload(table, payload)) renderTenantRealtimeChange(table);
        }
      );
    });
    activeRealtimeChannel = channel.subscribe();
  } catch (e) {
    console.warn('Realtime subscription error:', e);
  }
}
// =============================================================================
// LEXBNB PHASE 9 — OPERATIONS SERVICE & DISPATCH
// =============================================================================

async function loadOperationalTasks(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('operational_tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('due_at', { ascending: true });
  if (error) {
    console.error('Error loading operational tasks:', error);
    return [];
  }
  return data || [];
}

async function createOperationalTask(taskInput) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = {
    ...taskInput,
    tenant_id: tenantId
  };
  const { data, error } = await supabaseClient
    .from('operational_tasks')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateOperationalTask(taskId, patch) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('operational_tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteOperationalTask(taskId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { error } = await supabaseClient
    .from('operational_tasks')
    .delete()
    .eq('id', taskId)
    .eq('tenant_id', tenantId);
  if (error) throw error;
  return true;
}

async function loadMaintenanceTickets(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('maintenance_tickets')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading maintenance tickets:', error);
    return [];
  }
  return data || [];
}

async function createMaintenanceTicket(ticketInput) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = {
    ...ticketInput,
    tenant_id: tenantId
  };
  const { data, error } = await supabaseClient
    .from('maintenance_tickets')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resolveMaintenanceTicket(ticketId, actualCost, category = 'Tadilat', description = null) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('resolve_maintenance_ticket_atomic', {
    p_tenant_id: tenantId,
    p_ticket_id: ticketId,
    p_actual_cost: actualCost,
    p_category: category,
    p_description: description
  });
  if (error) throw error;
  return data;
}

// =============================================================================
// LEXBNB PHASE 10 — GUEST LIFECYCLE & MESSAGING CLIENT SERVICES
// =============================================================================

function mapGuestFromDb(g) {
  if (!g) return null;
  return {
    id: g.id,
    tenantId: g.tenant_id,
    firstName: g.first_name,
    lastName: g.last_name || '',
    phone: g.phone || '',
    email: g.email || '',
    language: g.preferred_language || 'tr',
    countryCode: g.country_code || 'TR',
    allowEmail: g.allow_email === true,
    allowSms: g.allow_sms === true,
    allowWhatsapp: g.allow_whatsapp === true,
    marketingOptIn: g.marketing_opt_in === true,
    preferences: g.preferences || '',
    internalNotes: g.internal_notes || '',
    tags: Array.isArray(g.tags) ? g.tags : [],
    createdAt: g.created_at,
    updatedAt: g.updated_at
  };
}

function mapGuestToDb(guestInput = {}) {
  return {
    first_name: String(guestInput.firstName || guestInput.first_name || '').trim(),
    last_name: String(guestInput.lastName || guestInput.last_name || '').trim() || null,
    phone: String(guestInput.phone || '').trim() || null,
    email: String(guestInput.email || '').trim().toLowerCase() || null,
    preferred_language: guestInput.language || guestInput.preferred_language || 'tr',
    country_code: guestInput.countryCode || guestInput.country_code || 'TR',
    allow_email: guestInput.allowEmail === true || guestInput.allow_email === true,
    allow_sms: guestInput.allowSms === true || guestInput.allow_sms === true,
    allow_whatsapp: guestInput.allowWhatsapp === true || guestInput.allow_whatsapp === true,
    marketing_opt_in: guestInput.marketingOptIn === true || guestInput.marketing_opt_in === true,
    preferences: String(guestInput.preferences || '').trim() || null,
    internal_notes: String(guestInput.internalNotes || guestInput.internal_notes || '').trim() || null,
    tags: Array.from(new Set((Array.isArray(guestInput.tags) ? guestInput.tags : [])
      .map(tag => String(tag || '').trim()).filter(Boolean))).slice(0, 20)
  };
}

async function loadGuests(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('guests')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading guests:', error);
    return [];
  }
  return (data || []).map(mapGuestFromDb);
}

async function createGuest(guestInput) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = {
    ...mapGuestToDb(guestInput),
    tenant_id: tenantId
  };
  const { data, error } = await supabaseClient
    .from('guests')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return mapGuestFromDb(data);
}

async function updateGuest(guestId, patch) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const existing = (appData.guests || []).find(guest => guest.id === guestId) || {};
  const { data, error } = await supabaseClient
    .from('guests')
    .update({ ...mapGuestToDb({ ...existing, ...patch }), updated_at: new Date().toISOString() })
    .eq('id', guestId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return mapGuestFromDb(data);
}

function splitGuestName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
}

async function linkBookingGuestProfile(bookingId, guestInput) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient || !isUUID(bookingId)) throw new Error('Misafir profili için geçerli rezervasyon ve oturum gereklidir.');
  const names = splitGuestName(guestInput.fullName);
  const phoneResult = guestInput.phone ? normalizePhone(guestInput.phone, guestInput.countryCode || 'TR') : { valid: false, normalized: '' };
  const emailResult = guestInput.email ? normalizeEmail(guestInput.email) : { valid: false, normalized: '' };
  if (guestInput.phone && !phoneResult.valid) throw new Error('Telefon numarası geçerli değil. Türkiye için 05xx xxx xx xx biçimini kullanın.');
  if (guestInput.email && !emailResult.valid) throw new Error('E-posta adresi geçerli değil.');

  const { data, error } = await supabaseClient.rpc('upsert_booking_guest_atomic', {
    p_tenant_id: tenantId,
    p_booking_id: bookingId,
    p_first_name: names.firstName,
    p_last_name: names.lastName || null,
    p_phone: phoneResult.normalized || null,
    p_email: emailResult.normalized || null,
    p_preferred_language: guestInput.language || 'tr',
    p_country_code: guestInput.countryCode || 'TR',
    p_allow_email: guestInput.allowEmail === true,
    p_allow_sms: guestInput.allowSms === true,
    p_allow_whatsapp: guestInput.allowWhatsapp === true,
    p_marketing_opt_in: guestInput.marketingOptIn === true
  });
  if (error) {
    if (error.code === 'PGRST202' || String(error.message || '').includes('Could not find the function')) {
      throw new Error('Misafir bağlantısı için phase27 Supabase göçü uygulanmalı.');
    }
    throw error;
  }
  const guest = mapGuestFromDb(data);
  if (!appData.guests) appData.guests = [];
  const guestIndex = appData.guests.findIndex(item => item.id === guest.id);
  if (guestIndex >= 0) appData.guests[guestIndex] = guest;
  else appData.guests.unshift(guest);
  const booking = (appData.bookings || []).find(item => item.id === bookingId);
  if (booking) {
    booking.primaryGuestId = guest.id;
    booking.guest = [guest.firstName, guest.lastName].filter(Boolean).join(' ');
    booking.phone = guest.phone || booking.phone;
  }
  renderGuestsTab();
  return guest;
}

async function loadMessageTemplates(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('message_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading message templates:', error);
    return [];
  }
  return data || [];
}

async function createMessageTemplate(templateInput) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = {
    ...templateInput,
    tenant_id: tenantId
  };
  const { data, error } = await supabaseClient
    .from('message_templates')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateMessageTemplate(templateId, patch) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('message_templates')
    .update(patch)
    .eq('id', templateId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function loadScheduledMessages(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('scheduled_messages')
    .select('*')
    .eq('tenant_id', tenantId);

  if (options.status) {
    query = query.eq('status', options.status);
  }
  if (options.bookingId) {
    query = query.eq('booking_id', options.bookingId);
  }

  const { data, error } = await query.order('scheduled_at', { ascending: true });
  if (error) {
    console.error('Error loading scheduled messages:', error);
    return [];
  }
  return data || [];
}

async function cancelScheduledMessage(messageId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('scheduled_messages')
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('tenant_id', tenantId)
    .eq('status', 'SCHEDULED')
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function loadPricingProfiles(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from('pricing_profiles')
    .select('*')
    .eq('tenant_id', tenantId);
  if (error) {
    console.error('Error loading pricing profiles:', error);
    return [];
  }
  return data || [];
}

async function savePricingProfile(profileData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...profileData, tenant_id: tenantId, updated_at: new Date().toISOString() };
  let res;
  if (payload.id) {
    res = await supabaseClient
      .from('pricing_profiles')
      .update(payload)
      .eq('id', payload.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
  } else {
    res = await supabaseClient
      .from('pricing_profiles')
      .insert(payload)
      .select()
      .single();
  }
  if (res.error) throw res.error;
  return res.data;
}

async function loadPricingRules(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('pricing_rules')
    .select('*')
    .eq('tenant_id', tenantId);
  if (options.propertyId) {
    query = query.or(`property_id.eq.${options.propertyId},property_id.is.null`);
  }
  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }
  const { data, error } = await query.order('priority', { ascending: false });
  if (error) {
    console.error('Error loading pricing rules:', error);
    return [];
  }
  return data || [];
}

async function createPricingRule(ruleData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...ruleData, tenant_id: tenantId };
  const { data, error } = await supabaseClient
    .from('pricing_rules')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updatePricingRule(ruleId, patch) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('pricing_rules')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', ruleId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deletePricingRule(ruleId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('pricing_rules')
    .delete()
    .eq('id', ruleId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function loadPricingEvents(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('pricing_events')
    .select('*')
    .eq('tenant_id', tenantId);
  if (options.propertyId) {
    query = query.or(`property_id.eq.${options.propertyId},property_id.is.null`);
  }
  const { data, error } = await query.order('start_date', { ascending: true });
  if (error) {
    console.error('Error loading pricing events:', error);
    return [];
  }
  return data || [];
}

async function createPricingEvent(eventData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...eventData, tenant_id: tenantId };
  const { data, error } = await supabaseClient
    .from('pricing_events')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updatePricingEvent(eventId, patch) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('pricing_events')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deletePricingEvent(eventId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('pricing_events')
    .delete()
    .eq('id', eventId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function loadDailyRates(propertyId, startDate, endDate) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('daily_rates')
    .select('*')
    .eq('property_id', propertyId)
    .eq('tenant_id', tenantId);
  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);
  const { data, error } = await query.order('date', { ascending: true });
  if (error) {
    console.error('Error loading daily rates:', error);
    return [];
  }
  return data || [];
}

async function saveManualPricingOverride(params) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('save_manual_pricing_override_atomic', {
    p_tenant_id: tenantId,
    p_property_id: params.propertyId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_rate_override: params.rate,
    p_reason: params.reason || 'Manual override',
    p_min_stay_override: params.minStay || null,
    p_bypass_guardrail: params.bypassGuardrail || false
  });
  if (error) throw error;
  return data;
}

async function loadBookingQuotes(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('booking_quotes')
    .select('*')
    .eq('tenant_id', tenantId);
  if (options.propertyId) query = query.eq('property_id', options.propertyId);
  if (options.leadId) query = query.eq('lead_id', options.leadId);
  if (options.status) query = query.eq('status', options.status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading booking quotes:', error);
    return [];
  }
  return data || [];
}

async function createBookingQuote(quoteData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...quoteData, tenant_id: tenantId };
  const { data, error } = await supabaseClient
    .from('booking_quotes')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function acceptBookingQuote(quoteId, bookingId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('accept_booking_quote_atomic', {
    p_quote_id: quoteId,
    p_booking_id: bookingId || null
  });
  if (error) throw error;
  return data;
}

function mapFriendlyErrorMessage(error) {
  if (!error) return 'Bilinmeyen bir hata oluştu.';
  const msg = typeof error === 'string' ? error : (error.message || error.details || error.hint || JSON.stringify(error));
  
  if (msg.includes('CLOSED_PERIOD_VIOLATION') || msg.includes('dönemi kapatılmış')) {
    return 'Bu finans dönemi kapatılmış. Geçmişe dönük değişiklik yapılamaz.';
  }
  if (msg.includes('BOOKING_OVERLAP') || msg.includes('conflicting key value') || msg.includes('bookings_no_overlap')) {
    return 'Seçilen tarihlerde bu mülk için başka bir rezervasyon bulunmaktadır.';
  }
  if (msg.includes('UNAUTHORIZED') || msg.includes('JWT') || msg.includes('permission denied')) {
    return 'Bu işlem için yetkiniz bulunmamaktadır.';
  }
  if (msg.includes('ALREADY_ACCEPTED')) {
    return 'Bu teklif daha önce kabul edilmiştir.';
  }
  if (msg.includes('QUOTE_EXPIRED')) {
    return 'Bu teklifin geçerlilik süresi dolmuştur.';
  }
  if (msg.includes('MAINTENANCE_BLOCK') || msg.includes('EXTENSION_UNAVAILABLE')) {
    return 'İstenen tarihler bakım veya dolu takvim nedeniyle müsait değildir.';
  }
  if (msg.includes('chk_rule_pricing_mode')) {
    return 'Fiyat kuralı çarpan VEYA sabit fiyat içermelidir (ikisi birden veya hiçbiri olamaz).';
  }
  return msg;
}

async function loadExecutiveAlerts(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('executive_alerts')
    .select('*')
    .eq('tenant_id', tenantId);
  if (options.status) query = query.eq('status', options.status);
  if (options.severity) query = query.eq('severity', options.severity);
  if (options.propertyId) query = query.eq('property_id', options.propertyId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading executive alerts:', error);
    return [];
  }
  return data || [];
}

async function createExecutiveAlert(alertData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...alertData, tenant_id: tenantId };
  const { data, error } = await supabaseClient
    .from('executive_alerts')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function acknowledgeExecutiveAlert(alertId, userId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient
    .from('executive_alerts')
    .update({ status: 'ACKNOWLEDGED', acknowledged_at: new Date().toISOString(), acknowledged_by: userId || null })
    .eq('id', alertId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resolveExecutiveAlert(alertId, userId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('resolve_executive_alert_atomic', {
    p_alert_id: alertId,
    p_resolved_by: userId || null
  });
  if (error) throw error;
  return data;
}

async function loadUserNotifications(targetTenantId, options = {}) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return [];
  let query = supabaseClient
    .from('user_notifications')
    .select('*')
    .eq('tenant_id', tenantId);
  if (options.status) query = query.eq('status', options.status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading user notifications:', error);
    return [];
  }
  return data || [];
}

async function createUserNotification(notifData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...notifData, tenant_id: tenantId };
  const { data, error } = await supabaseClient
    .from('user_notifications')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function acknowledgeUserNotification(notifId) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('acknowledge_notification_atomic', {
    p_notification_id: notifId
  });
  if (error) throw error;
  return data;
}

/**
 * Bildirimleri OKUNDU olarak isaretler — Postgres'e.
 *
 * "Tumunu Okundu Say" dugmesi bir zamanlar yalnizca `appData` icindeki
 * nesneleri degistirip `saveAppData()` cagiriyordu; saveAppData ise hicbir sey
 * kaydetmiyor (yalnizca eski localStorage onbellegini siliyor). Yani rozet
 * siniyor, kullanici "okundu" sanip sayfayi yeniliyor ve butun bildirimler
 * geri geliyordu. 1. bolum: kaydedilmeyen seye "kaydedildi" denmez.
 *
 * ACKNOWLEDGED icin ayri bir RPC var (denetimli); READ icin tablo yazmasi
 * yeterlidir ve RLS kiraci izolasyonunu zaten uyguluyor.
 */
async function markUserNotificationsRead(notifIds) {
  const tenantId = getActiveTenantId();
  const ids = (notifIds || []).filter(Boolean);
  if (!ids.length) return { updated: 0 };
  requireCloudForWrite('bildirimleri okundu isaretleme', tenantId);
  if (!supabaseClient) return { updated: 0 };
  const { data, error } = await supabaseClient
    .from('user_notifications')
    .update({ status: 'READ', read_at: new Date().toISOString() })
    .in('id', ids)
    .eq('tenant_id', tenantId)
    .eq('status', 'UNREAD')
    .select('id');
  if (error) throw error;
  return { updated: (data || []).length };
}

async function loadTenantOnboarding(targetTenantId) {
  const tenantId = targetTenantId || getActiveTenantId();
  if (!tenantId || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from('tenant_onboarding')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    console.error('Error loading tenant onboarding:', error);
    return null;
  }
  return data;
}

async function saveTenantOnboarding(onboardingData) {
  const tenantId = getActiveTenantId();
  if (!tenantId || !supabaseClient) throw new Error('Active tenant session required');
  const payload = { ...onboardingData, tenant_id: tenantId, updated_at: new Date().toISOString() };
  let res;
  if (payload.id) {
    res = await supabaseClient
      .from('tenant_onboarding')
      .update(payload)
      .eq('id', payload.id)
      .eq('tenant_id', tenantId)
      .select()
      .single();
  } else {
    res = await supabaseClient
      .from('tenant_onboarding')
      .upsert(payload, { onConflict: 'tenant_id' })
      .select()
      .single();
  }
  if (res.error) throw res.error;
  return res.data;
}

async function getExecutiveDashboardSnapshot(targetMonth, propertyId = null) {
  if (!supabaseClient) throw new Error('Active supabase client required');
  const tenantId = getActiveTenantId();
  if (!isCloudTenant(tenantId)) throw new Error('Active tenant session required');
  const { data, error } = await supabaseClient.rpc('get_executive_dashboard_snapshot', {
    p_tenant_id: tenantId,
    p_target_month: targetMonth,
    p_property_id: propertyId
  });
  if (error) throw error;
  return data;
}

let executiveSnapshotState = {
  key: null,
  status: 'idle',
  current: null,
  prior: null,
  error: null,
  retryAt: 0,
  requestId: 0
};

function shouldRefreshExecutiveSnapshot(state, contextKey, now = Date.now()) {
  if (!state || state.key !== contextKey) return true;
  return state.status === 'error' && Number(state.retryAt || 0) <= now;
}

function invalidateExecutiveSnapshotCache() {
  executiveSnapshotState = {
    ...executiveSnapshotState,
    key: null,
    status: 'idle',
    current: null,
    prior: null,
    error: null,
    retryAt: 0,
    requestId: Number(executiveSnapshotState?.requestId || 0) + 1
  };
}

function getExecutiveSnapshotContext() {
  const tenantId = getActiveTenantId();
  const period = currentFilter && currentFilter.period;
  if (!isCloudTenant(tenantId) || !supabaseClient) return { supported: false, reason: 'Bulut oturumu gerekli.' };
  if (!/^\d{4}-\d{2}$/.test(period || '')) {
    return { supported: false, reason: 'Sunucu anlık görüntüsü aylık dönemlerde kullanılabilir.' };
  }

  let propertyId = null;
  if (currentFilter.villa && currentFilter.villa !== 'ALL') {
    const villa = appData && appData.villas ? appData.villas[currentFilter.villa] : null;
    propertyId = (villa && (villa.id || villa.dbId || villa.property_id)) || currentFilter.villa;
  }
  return {
    supported: true,
    tenantId,
    period,
    priorPeriod: getPreviousPeriodKey(period),
    propertyId,
    key: [tenantId, period, propertyId || 'ALL'].join('|')
  };
}

function setExecutiveSnapshotPlaceholder(message) {
  ['execKpiRevenue', 'execKpiOpex', 'execKpiCapex', 'execKpiOperatingProfit',
    'execKpiProfit', 'execKpiOccupancy', 'execKpiAdr', 'execKpiRevpar']
    .forEach(id => setEl(id, '—'));
  ['execRevVariance', 'execRevMoM', 'execOpexRatio', 'execOtaCost', 'execCapexRatio',
    'execCapexTrend', 'execOperatingMargin', 'execOperatingTrend', 'execProfitMargin',
    'execProfitVariance', 'execOccVariance', 'execSoldNightsLabel', 'execAdrTrend',
    'execRevparTrend'].forEach(id => setEl(id, '—'));
  setEl('execSnapshotStatus', message);
}

function renderExecutiveKpiValues(kpis) {
  const money = value => value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—' : `₺${Number(value).toLocaleString('tr-TR')}`;
  const ratio = (value, revenue) => value === null || value === undefined || !(Number(revenue) > 0)
    ? '—' : `%${Math.round((Number(value) / Number(revenue)) * 100)}`;
  const trend = metric => !metric || metric.prior === null || metric.prior === undefined
    ? 'geçen ay veri yok' : `${formatMoMDelta(metric.current, metric.prior)} Geçen Ay`;

  setEl('execKpiRevenue', money(kpis.revenue.current));
  setEl('execKpiOpex', money(kpis.opex.current));
  setEl('execKpiCapex', money(kpis.capex.current));
  setEl('execKpiOperatingProfit', money(kpis.operatingProfit.current));
  setEl('execKpiProfit', money(kpis.netProfit.current));
  setEl('execKpiOccupancy', kpis.occupancy.current === null ? '—' : `%${kpis.occupancy.current}`);
  setEl('execKpiAdr', money(kpis.adr.current));
  setEl('execKpiRevpar', money(kpis.revpar.current));

  setEl('execRevMoM', trend(kpis.revenue));
  setEl('execOpexRatio', kpis.opex.current === null ? '—' : `${ratio(kpis.opex.current, kpis.revenue.current)} Ciro`);
  // OPEX'in otomatik kalemleri. Sunucu bir kalemi vermiyorsa (phase45
  // oncesi) o kalem "—" yazilir, 0 degil.
  const kalem = (ad, v) => `${ad}: ${v === null || v === undefined ? '—' : money(v)}`;
  setEl('execOtaCost', [
    kalem('OTA', kpis.opex.otaCommission),
    kalem('Ödeme kom.', kpis.opex.paymentCommission),
    kalem('Temizlik', kpis.opex.cleaningCost)
  ].join(' · '));
  setEl('execCapexRatio', kpis.capex.current === null ? '—' : `${ratio(kpis.capex.current, kpis.revenue.current)} Ciro`);
  setEl('execCapexTrend', trend(kpis.capex));
  const operatingMargin = ratio(kpis.operatingProfit.current, kpis.revenue.current);
  const netMargin = ratio(kpis.netProfit.current, kpis.revenue.current);
  setEl('execOperatingMargin', operatingMargin === '—' ? '—' : `${operatingMargin} Marj`);
  setEl('execOperatingTrend', trend(kpis.operatingProfit));
  setEl('execProfitMargin', netMargin === '—' ? '—' : `${netMargin} Marj`);
  setEl('execAdrTrend', trend(kpis.adr));
  setEl('execRevparTrend', trend(kpis.revpar));
  setEl('execSoldNightsLabel', `${kpis.bookedNights} / ${kpis.availableNights ?? '—'} Gece`);

  const revVariance = document.getElementById('execRevVariance');
  if (revVariance) {
    revVariance.className = kpis.revenue.variance.varianceAmount >= 0 ? 'badge badge-green' : 'badge badge-red';
    revVariance.innerText = kpis.revenue.target > 0
      ? `${kpis.revenue.variance.varianceAmount >= 0 ? '+' : ''}%${kpis.revenue.variance.variancePercent} Hedef`
      : 'Hedef belirlenmemiş';
  }
  setEl('execProfitVariance', kpis.netProfit.target > 0
    ? `${kpis.netProfit.variance.varianceAmount >= 0 ? '+' : ''}%${kpis.netProfit.variance.variancePercent} Hedef`
    : 'Hedef belirlenmemiş');
  const occVariance = document.getElementById('execOccVariance');
  if (occVariance) {
    occVariance.className = kpis.occupancy.variance.varianceAmount >= 0 ? 'badge badge-green' : 'badge badge-yellow';
    occVariance.innerText = kpis.occupancy.target > 0 ? `Hedef: %${kpis.occupancy.target}` : 'Hedef belirlenmemiş';
  }
}

function renderExecutiveSnapshotKpis() {
  const context = getExecutiveSnapshotContext();
  if (!context.supported) {
    setExecutiveSnapshotPlaceholder(context.reason);
    return false;
  }

  if (shouldRefreshExecutiveSnapshot(executiveSnapshotState, context.key)) {
    setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü yükleniyor…');
    void refreshExecutiveDashboardSnapshot(false);
    return true;
  }
  if (executiveSnapshotState.status === 'loading') {
    setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü yükleniyor…');
    return true;
  }
  if (executiveSnapshotState.status === 'error') {
    setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü alınamadı; finansal KPI gösterilmiyor.');
    return true;
  }
  if (executiveSnapshotState.status !== 'ready' || !executiveSnapshotState.current) {
    setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü hazır değil.');
    return true;
  }
  if (typeof ExecutiveDashboardService === 'undefined' || !ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot) {
    setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü işlenemedi.');
    return true;
  }

  const periodTarget = getTargetRecordForPeriod(context.period) || {};
  const kpis = ExecutiveDashboardService.computeExecutiveTopKpisFromSnapshot(
    executiveSnapshotState.current,
    { targets: periodTarget, priorSnapshot: executiveSnapshotState.prior }
  );
  renderExecutiveKpiValues(kpis);

  const phase32Ready = executiveSnapshotState.current.room_revenue !== undefined;
  setEl('execSnapshotStatus', !phase32Ready
    ? 'Sunucu anlık görüntüsü • Phase 32 uygulanana kadar ADR/RevPAR gösterilmez'
    : kpis.hasExpenseBreakdown
      ? 'Sunucu anlık görüntüsü • finansal tek kaynak'
      : 'Sunucu anlık görüntüsü • Phase 38 uygulanana kadar OPEX/CAPEX ayrımı gösterilmez');
  return true;
}

async function refreshExecutiveDashboardSnapshot(force = false) {
  const context = getExecutiveSnapshotContext();
  if (!context.supported) {
    executiveSnapshotState = { ...executiveSnapshotState, key: null, status: 'unsupported', current: null, prior: null, error: null, retryAt: 0 };
    if (typeof document !== 'undefined') renderExecutiveSnapshotKpis();
    return null;
  }
  if (!force && executiveSnapshotState.key === context.key && ['loading', 'ready'].includes(executiveSnapshotState.status)) {
    return executiveSnapshotState.current;
  }

  const requestId = executiveSnapshotState.requestId + 1;
  executiveSnapshotState = { key: context.key, status: 'loading', current: null, prior: null, error: null, retryAt: 0, requestId };
  if (typeof document !== 'undefined') setExecutiveSnapshotPlaceholder('Sunucu anlık görüntüsü yükleniyor…');
  try {
    const [current, prior] = await Promise.all([
      getExecutiveDashboardSnapshot(context.period, context.propertyId),
      context.priorPeriod ? getExecutiveDashboardSnapshot(context.priorPeriod, context.propertyId) : Promise.resolve(null)
    ]);
    if (executiveSnapshotState.requestId !== requestId || executiveSnapshotState.key !== context.key) return null;
    executiveSnapshotState = { key: context.key, status: 'ready', current, prior, error: null, retryAt: 0, requestId };
    if (typeof document !== 'undefined') renderExecutiveControlCenter();
    return current;
  } catch (error) {
    if (executiveSnapshotState.requestId !== requestId) return null;
    console.error('Executive snapshot load failed:', error);
    executiveSnapshotState = { key: context.key, status: 'error', current: null, prior: null, error, retryAt: Date.now() + 5000, requestId };
    if (typeof document !== 'undefined') renderExecutiveControlCenter();
    return null;
  }
}

const setAppData = function (data) {
  if (typeof appData !== 'undefined') {
    Object.assign(appData, data);
  } else if (typeof global !== 'undefined') {
    if (!global.appData) global.appData = {};
    Object.assign(global.appData, data);
  }
};

const getAppData = function () {
  return (typeof appData !== 'undefined') ? appData : (typeof global !== 'undefined' ? global.appData : null);
};

// Donem filtresini disaridan ayarlamak icin. Testler gelir dagitiminin
// (getBookingFilterShare) donem sinirlarinda dogru davrandigini boyle olcer.
function setCurrentFilter(filter) {
  Object.assign(currentFilter, filter || {});
  return currentFilter;
}

const setSupabaseClient = function (client) {
  supabaseClient = client;
};

const getSupabaseClient = function () {
  return supabaseClient;
};

// =============================================================================
// LEXBNB PHASE 12 — EXECUTIVE CONTROL CENTER & UI IMPLEMENTATION
// =============================================================================

let pendingAiAction = null;

function renderExecutiveControlCenter() {
  if (typeof document === 'undefined') return;
  const execTab = document.getElementById('tab-executive');
  if (!execTab) return;

  const bookings = (typeof appData !== 'undefined' && appData.bookings) || [];
  const expenses = (typeof appData !== 'undefined' && appData.expenses) || [];
  const villas = (typeof appData !== 'undefined' && appData.villas) || {};
  const targets = (typeof appData !== 'undefined' && appData.targets) || {};
  const tasks = (typeof appData !== 'undefined' && appData.cleaningTasks) || [];
  const tickets = (typeof appData !== 'undefined' && appData.maintenanceTickets) || [];
  const leads = (typeof appData !== 'undefined' && appData.leads) || [];
  const alerts = (typeof appData !== 'undefined' && appData.executiveAlerts) || [];

  const propertiesList = Object.keys(villas).map(k => ({
    id: villas[k].id || k,
    key: k,
    name: villas[k].name || k,
    capacity: villas[k].capacity ?? null,
    basePrice: villas[k].basePrice ?? null,
    minPrice: villas[k].minPrice ?? null,
    maxPrice: villas[k].maxPrice ?? null,
    readinessStatus: villas[k].readinessStatus || 'UNKNOWN'
  }));

  const snapshotOwnsTopKpis = isCloudTenant(getActiveTenantId()) && !!supabaseClient;
  if (snapshotOwnsTopKpis) renderExecutiveSnapshotKpis();

  // 1. Top Executive KPIs
  if (!snapshotOwnsTopKpis && typeof ExecutiveDashboardService !== 'undefined' && ExecutiveDashboardService.computeExecutiveTopKpis) {
    const curPeriod = (typeof currentFilter !== 'undefined' && currentFilter.period) || 'ALL';
    const periodTarget = getTargetRecordForPeriod(curPeriod) || {};
    const scopedBookings = bookings
      .filter(b => typeof isBookingInFilter === 'function' ? isBookingInFilter(b) : true)
      .map(b => {
        const share = getBookingFilterShare(b);
        return {
          ...b,
          gross_amount: Number(b.gross ?? b.grossAmount ?? b.gross_amount ?? 0) * share.ratio,
          cleaning_fee: Number(b.cleaningFee ?? b.cleaning_fee ?? 0) * share.ratio,
          discount: Number(b.discount || 0) * share.ratio,
          ota_commission: Number(b.otaCommission ?? b.otaComm ?? b.ota_commission ?? 0) * share.ratio,
          payment_commission: Number(b.paymentCommission ?? b.payment_commission ?? 0) * share.ratio,
          nights: share.nights
        };
      });
    const exactAvailableNights = getAvailableNightsForMonth(curPeriod);

    const kpis = ExecutiveDashboardService.computeExecutiveTopKpis({
      bookings: scopedBookings,
      expenses: expenses.filter(e => typeof isExpenseInFilter === 'function' ? isExpenseInFilter(e) : true),
      targets: periodTarget,
      cleaningCost: computeFilterLedger().cleaningCost,
      propertiesCount: propertiesList.filter(p => villas[p.key]?.isActive !== false && !villas[p.key]?.archivedAt).length,
      daysInMonth: getPeriodDayCount(),
      availableNights: exactAvailableNights,
      // Servis prior alanlarini destekliyordu ama beslenmiyordu; bu yuzden
      // "Gecen Ay" etiketleri index.html'de sabit kalmisti.
      priorPeriodMetrics: (function () {
        const p = computePreviousPeriodTotals();
        if (!p.hasData) return null;
        const gunler = getPeriodDayCount(getPreviousPeriodKey(currentFilter && currentFilter.period));
        const kapasite = Math.max(1, propertiesList.length * gunler);
        return {
          revenue: p.revenue,
          opex: p.opex,
          capex: p.capex,
          operatingProfit: p.operatingProfit,
          netProfit: p.netProfit,
          occupancy: Number(((p.nights / kapasite) * 100).toFixed(2)),
          adr: p.nights > 0 ? Math.round(p.roomRevenue / p.nights) : 0,
          revpar: Math.round(p.roomRevenue / kapasite)
        };
      })()
    });
    renderExecutiveKpiValues(kpis);
    setEl('execSnapshotStatus', 'Yerel veri görünümü • OPEX/CAPEX ayrımı etkin');
  }

  // 2. Onboarding Progress
  if (typeof ExecutiveDashboardService !== 'undefined' && ExecutiveDashboardService.computeTenantOnboardingProgress) {
    // computeTenantOnboardingProgress'in BEKLEDIGI sekil bu; onceki cagri
    // properties/monthly_targets/... gonderiyordu, yani hicbir adim
    // okunamiyordu ve donen alan `percentage` diye okunuyordu - oysa servis
    // `progressPercent` donduruyor. Sonuc: yeni musteri "%undefined" goruyordu.
    const onboarding = ExecutiveDashboardService.computeTenantOnboardingProgress({
      tenantId: getActiveTenantId(),
      propertiesCount: propertiesList.length,
      bookingsCount: bookings.length,
      hasMonthlyTargets: Object.keys(targets || {}).length > 0,
      hasFinanceTransactions: expenses.length > 0,
      hasCleaningChecklist: tasks.length > 0,
      hasPricingProfile: !!(appData && appData.pricingProfiles && appData.pricingProfiles.length),
      hasGuestSettings: !!(appData && appData.guests && appData.guests.length),
      hasMessageTemplates: !!(appData && appData.messageTemplates && appData.messageTemplates.length),
      hasTeamMembers: (typeof userMemberships !== 'undefined' && userMemberships.length > 1)
        || !!(appData && appData.teamMemberCount > 1)
    });
    const pctEl = document.getElementById('onboardProgressPct');
    if (pctEl) pctEl.innerText = `%${onboarding.progressPercent}`;

    // Adim listesi statik HTML'di ve BES MADDESI DE ✅ isaretliydi; sifir
    // mulklu bir hesapta bile "her sey tamam" diyordu. Artik gercek durumu
    // yansitir.
    const stepsEl = document.getElementById('onboardStepsList');
    if (stepsEl && Array.isArray(onboarding.steps)) {
      stepsEl.innerHTML = onboarding.steps.map(s =>
        `<span style="opacity:${s.completed ? 1 : 0.5};">${s.completed ? '✅' : '⬜'} ${escapeHtml(s.title)}</span>`
      ).join('');
    }

    const barEl = document.getElementById('onboardProgressBar');
    if (barEl) barEl.style.width = `${onboarding.progressPercent}%`;
  }

  // 3. Today Command Center (3+2+1 Priority Scoring)
  if (typeof ExecutivePriorityService !== 'undefined' && ExecutivePriorityService.selectTodayCommandCenterActions) {
    const candidates = [];

    // Cleaning / Turnover tasks
    tasks.forEach(t => {
      if (t.status !== 'DONE') {
        const isCritical = t.priority === 'CRITICAL' || t.isSlaBreached;
        candidates.push({
          id: t.id,
          domain: 'OPERATIONS',
          propertyId: t.propertyId || t.property_id || null,
          title: t.title || 'Turnover Temizlik Görevi',
          severity: isCritical ? 'CRITICAL' : 'MEDIUM',
          guestImpact: isCritical ? 'HIGH' : 'MEDIUM',
          urgencyDueTime: isCritical ? 30 : 18,
          isSlaBreached: !!t.isSlaBreached,
          isCheckInToday: true,
          confidence: 'HIGH',
          rationale: 'Misafir check-in öncesi turnover temizliği ve hazır bulunuşluk zorunluluğu.',
          sourceMetrics: [t.due_at || t.dueAt
            ? `Son zaman: ${t.due_at || t.dueAt}`
            : 'Görev zamanı kayıtlı değil', 'Kategori: Temizlik'],
          deepLink: 'housekeeping',
          quickAction: null
        });
      }
    });

    // Maintenance tickets
    tickets.forEach(tk => {
      if (tk.status !== 'RESOLVED') {
        candidates.push({
          id: tk.id,
          domain: 'OPERATIONS',
          propertyId: tk.propertyId || tk.property_id || null,
          title: `${tk.severity === 'CRITICAL' ? 'P1 ' : ''}Arıza: ${tk.title || 'Başlık girilmemiş'}`,
          severity: tk.severity || null,
          guestImpact: 'HIGH',
          urgencyDueTime: 25,
          revenueImpact: 'HIGH',
          confidence: 'HIGH',
          rationale: 'Misafir konforunu doğrudan etkileyen kritik teknik donanım arızası.',
          sourceMetrics: [`Öncelik: P1`, `Durum: Açık`],
          deepLink: 'maintenance',
          quickAction: 'RESOLVE_TICKET'
        });
      }
    });

    // Executive alerts
    alerts.forEach(al => {
      if (al.status === 'OPEN') {
        candidates.push({
          id: al.id,
          domain: al.domain || 'SYSTEM',
          propertyId: al.property_id || al.propertyId,
          title: al.title,
          severity: al.severity,
          guestImpact: al.severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
          urgencyDueTime: 28,
          confidence: 'HIGH',
          rationale: al.reason || 'Sistem eşik aşımı veya operasyonel bildirim.',
          sourceMetrics: al.source_metrics || ['Eşik Değeri: Kritik'],
          deepLink: al.deep_link || 'finance',
          quickAction: 'RESOLVE_ALERT'
        });
      }
    });

    // Gap nights (Revenue opportunity)
    if (typeof appData !== 'undefined' && appData.gapNights && appData.gapNights.length > 0) {
      const gap = appData.gapNights[0];
      candidates.push({
        id: `gap-${gap.date}-${gap.villa}`,
        domain: 'REVENUE',
        propertyId: gap.villa,
        title: `Boş Gece (Gap Night): ${gap.date} - ${appData.villas[gap.villa]?.name || gap.villa}`,
        revenueImpact: 'HIGH',
        guestImpact: 'LOW',
        urgencyDueTime: 20,
        confidence: 'HIGH',
        rationale: 'İki rezervasyon arasında kalan boşluk; yalnız kayıtlı fiyat kuralı varsa teklif üretilebilir.',
        // Onerilen fiyat hesaplanmamissa satir hic yazilmaz; 12.500 TL
        // uydurulmaz (3.6).
        sourceMetrics: [`Tarih: ${gap.date}`].concat(
          Number(gap.suggestedPrice) > 0
            ? [`Öneri: ₺${Number(gap.suggestedPrice).toLocaleString('tr-TR')}`]
            : ['Öneri fiyatı hesaplanamadı (mülkün liste fiyatı girilmemiş)']
        ),
        deepLink: 'pricing',
        quickAction: 'APPLY_GAP_DISCOUNT'
      });
    }

    // High value leads
    const hotLeads = leads.filter(l => l.status === 'FOLLOW_UP' || l.status === 'QUOTE_SENT');
    if (hotLeads.length > 0) {
      const l = hotLeads[0];
      candidates.push({
        id: l.id,
        domain: 'LEADS',
        propertyId: l.villa,
        title: `Sıcak Müşteri Teklifi: ${l.guest || 'Ad belirtilmedi'} (₺${Number(l.quote || 0).toLocaleString('tr-TR')})`,
        revenueImpact: 'HIGH',
        confidence: 'HIGH',
        rationale: 'Rezervasyona dönüşme olasılığı yüksek müşteri teklifi bekliyor.',
        sourceMetrics: [`Durum: ${l.status}`, `Değer: ₺${Number(l.quote || 0).toLocaleString('tr-TR')}`],
        deepLink: 'leads',
        quickAction: 'CONVERT_LEAD'
      });
    }

    const commandResult = ExecutivePriorityService.selectTodayCommandCenterActions(candidates, {
      currentFilter,
      propertiesCount: propertiesList.length
    });

    renderTodayCommandCenter(commandResult);
  }

  // 4. Property sales readiness. Payment status is deliberately not used:
  // `paid` is a financial flag, not evidence that cleaning was completed.
  const readinessApi = getPropertySalesReadinessApi();
  if (readinessApi) {
    const healthCards = propertiesList.map(property => readinessApi.buildPropertyReadiness(property, {
      overrideStatus: appData?.housekeepingOverrides?.[property.key],
      maintenanceTickets: tickets
    }));
    renderPortfolioHealth(healthCards);
  }
}

function renderTodayCommandCenter(actionsResult) {
  if (typeof document === 'undefined') return;

  const critList = document.getElementById('todayCriticalActionsList');
  const critBadge = document.getElementById('criticalActionsCountBadge');
  const opsList = document.getElementById('todayOperationsActionsList');
  const opsBadge = document.getElementById('operationsActionsCountBadge');
  const revList = document.getElementById('todayRevenueActionsList');
  const revBadge = document.getElementById('revenueActionsCountBadge');

  // Helper renderer
  function renderActionCards(listEl, badgeEl, actions, typeClass, emptyMsg) {
    if (badgeEl) badgeEl.innerText = `${actions.length} / ${badgeEl.innerText.split('/')[1]?.trim() || actions.length}`;
    if (!listEl) return;

    if (!actions || actions.length === 0) {
      listEl.innerHTML = `<div class="empty-action-state">${emptyMsg}</div>`;
      return;
    }

    listEl.innerHTML = actions.map(act => {
      const rawScore = act.priorityScore ?? act.actionScore;
      const parsedScore = Number(rawScore);
      const hasScore = rawScore !== null && rawScore !== '' && Number.isFinite(parsedScore);
      const score = hasScore ? parsedScore : null;
      const scoreClass = !hasScore ? 'score-med' : (score >= 70 ? '' : (score >= 40 ? 'score-med' : 'score-green'));
      const metricsText = (act.sourceMetrics || []).join(' • ');

      return `
        <div class="command-action-card ${typeClass}">
          <div class="action-card-top">
            <span class="action-score-pill ${scoreClass}" title="${hasScore ? 'Hesaplanan öncelik puanı' : 'Öncelik puanı hesaplanamadı'}">Puan: ${hasScore ? score + '/100' : '—'}</span>
            <span style="font-size: 10px; color: #94A3B8; font-weight: 600;">${act.propertyId || ''}</span>
          </div>
          <div class="action-card-title">${escapeHtml(act.title)}</div>
          <div class="action-card-rationale">${act.rationale || ''}</div>
          ${metricsText ? `<div class="action-source-metrics">📊 ${metricsText}</div>` : ''}
          <div class="action-card-footer">
            <button type="button" class="btn btn-secondary btn-sm" data-onclick="openTabFromDeepLink(decodeURIComponent('${encodeActionArg(act.deepLink || 'executive')}'), decodeURIComponent('${encodeActionArg(act.id)}'))" style="font-size: 11px; padding: 3px 8px;">İncele ›</button>
            ${act.quickAction
              ? `<button type="button" class="btn btn-primary btn-sm" data-onclick="handleQuickActionTrigger(decodeURIComponent('${encodeActionArg(act.quickAction)}'), decodeURIComponent('${encodeActionArg(act.id)}'))" style="font-size: 11px; padding: 3px 8px;">Uygula</button>`
              : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  renderActionCards(critList, critBadge, actionsResult.critical || [], 'critical', 'Kayıtlı açık kritik uyarı yok; dış sistem durumu doğrulanmadı.');
  renderActionCards(opsList, opsBadge, actionsResult.operations || [], 'operations', 'Kayıtlı bekleyen turnover veya arıza görevi yok.');
  renderActionCards(revList, revBadge, actionsResult.revenueOpportunities || [], 'revenue', 'Hesaplanmış gelir fırsatı yok; fiyatlandırmanın optimize olduğu sonucuna varılamaz.');
}

function renderPortfolioHealth(healthCards) {
  if (typeof document === 'undefined') return;
  const grid = document.getElementById('portfolioHealthCardsGrid');
  if (!grid) return;

  const counts = {
    SALES_READY: 0,
    NEEDS_CLEANING: 0,
    NON_BLOCKING_ISSUE: 0,
    BLOCKED_MAINTENANCE: 0,
    UNSET: 0
  };
  const readinessApi = getPropertySalesReadinessApi();
  const canEdit = canManagePropertyReadiness();

  grid.innerHTML = healthCards.map(c => {
    counts[c.status] = (counts[c.status] || 0) + 1;
    const meta = c.meta || readinessApi?.STATUS_META?.UNSET || {
      icon: '⚪', label: 'Durum seçilmedi', tone: 'neutral'
    };
    const badgeClass = meta.tone === 'green' ? 'badge-green'
      : meta.tone === 'yellow' ? 'badge-yellow'
        : meta.tone === 'red' ? 'badge-red'
          : meta.tone === 'blue' ? 'badge-blue' : '';
    const cardStatus = c.status === 'SALES_READY' ? 'HEALTHY'
      : c.status === 'BLOCKED_MAINTENANCE' ? 'CRITICAL'
        : c.status === 'NON_BLOCKING_ISSUE' ? 'INFO' : 'WARNING';
    const options = readinessApi.SELECTABLE_STATUSES.map(status => {
      const optionMeta = readinessApi.STATUS_META[status];
      const selected = c.manualStatus === status ? ' selected' : '';
      return `<option value="${escapeHtml(status)}"${selected}>${optionMeta.icon} ${escapeHtml(optionMeta.label)}</option>`;
    }).join('');
    const editor = canEdit
      ? `<label style="display:block; margin-top:9px; font-size:10px; color:#94A3B8;">
           Durumu değiştir
           <select class="property-readiness-select" data-property-readiness-key="${escapeHtml(c.propertyKey)}"
             data-onchange="setPropertySalesReadiness(decodeURIComponent('${encodeActionArg(String(c.propertyKey))}'), this.value)"
             style="width:100%; margin-top:4px; padding:6px 8px; border-radius:6px; background:#0F172A; color:#E2E8F0; border:1px solid rgba(255,255,255,.16); font-size:11px;">
             <option value="" disabled${c.manualStatus === 'UNSET' ? ' selected' : ''}>⚪ Durum seçin</option>
             ${options}
           </select>
         </label>`
      : '<div style="margin-top:9px; font-size:10px; color:#64748B;">Salt okunur · değiştirme yetkiniz yok</div>';

    return `
      <div class="property-health-card status-${cardStatus}" data-readiness-status="${escapeHtml(c.status)}" data-property-key="${escapeHtml(c.propertyKey)}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <strong style="font-size: 14px; color: #FFFFFF;">${escapeHtml(c.propertyName)}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(c.reason)}</div>
          </div>
          <span class="badge ${badgeClass}" style="white-space:nowrap;">${meta.icon} ${escapeHtml(meta.label)}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin: 4px 0;">
          <div style="background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
            <span style="color: #94A3B8; display: block;">Satış Durumu:</span>
            <strong style="color: #F8FAFC; font-size: 12px;">${c.status === 'BLOCKED_MAINTENANCE' ? 'Kapalı' : (c.status === 'UNSET' ? 'Belirsiz' : 'Açık')}</strong>
          </div>
          <div style="background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
            <span style="color: #94A3B8; display: block;">Açık İş / Arıza:</span>
            <strong style="color: ${c.openIssueCount > 0 ? '#F87171' : '#34D399'}; font-size: 13px;">${c.openIssueCount || 0} Kayıt</strong>
          </div>
        </div>
        ${editor}
      </div>
    `;
  }).join('');

  setEl('healthPillReady', `🟢 Hazır: ${counts.SALES_READY}`);
  setEl('healthPillCleaning', `🟡 Temizlik: ${counts.NEEDS_CLEANING}`);
  setEl('healthPillMinorIssue', `🔵 Küçük Arıza: ${counts.NON_BLOCKING_ISSUE}`);
  setEl('healthPillBlocked', `🔴 Kapalı: ${counts.BLOCKED_MAINTENANCE}`);
}

// -----------------------------------------------------------------------------
// AI STR ADVISOR ("ASK LEXBNB")
// -----------------------------------------------------------------------------

function askExecutiveAdvisor(question) {
  const input = document.getElementById('aiAdvisorPromptInput');
  if (input) input.value = question;
  handleAiAdvisorSubmit(new Event('submit'));
}

function handleAiAdvisorSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = document.getElementById('aiAdvisorPromptInput');
  if (!input || !input.value.trim()) return;

  const query = input.value.trim();
  const outputBox = document.getElementById('aiAdvisorOutputBox');
  const responseContent = document.getElementById('aiAdvisorResponseContent');

  if (outputBox) outputBox.style.display = 'block';
  if (responseContent) responseContent.innerHTML = `<div style="color: #A78BFA; font-size: 13px;">🤖 Analiz ediliyor... Lütfen bekleyin.</div>`;

  setTimeout(() => {
    try {
    let answerText = '';
    let recommendationAction = null;
    let sourceMetrics = [];

    const bookings = (typeof appData !== 'undefined' && appData.bookings) || [];
    const expenses = (typeof appData !== 'undefined' && appData.expenses) || [];
    const villas = (typeof appData !== 'undefined' && appData.villas) || {};

    if (typeof ExecutiveAIAdvisor !== 'undefined' && ExecutiveAIAdvisor.answerExecutiveQuery) {
      const period = (currentFilter && currentFilter.period) || 'ALL';
      const target = getTargetRecordForPeriod(period) || {};
      const activeBookings = bookings.filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
      const soldNights = activeBookings.reduce((sum, b) => sum + getBookingFilterShare(b).nights, 0);
      const revenue = activeBookings.reduce((sum, b) => {
        const share = getBookingFilterShare(b).ratio;
        return sum + (Number(b.gross ?? b.grossAmount ?? b.gross_amount ?? 0) - Number(b.discount || 0)) * share;
      }, 0);
      const roomRevenue = activeBookings.reduce((sum, b) => {
        const share = getBookingFilterShare(b).ratio;
        return sum + (Number(b.gross ?? b.grossAmount ?? b.gross_amount ?? 0) - Number(b.cleaningFee ?? b.cleaning_fee ?? 0) - Number(b.discount || 0)) * share;
      }, 0);
      const otaCost = activeBookings.reduce((sum, b) => sum + Number(b.otaCommission ?? b.otaComm ?? b.ota_commission ?? 0) * getBookingFilterShare(b).ratio, 0);
      const manualCost = expenses.filter(isExpenseInFilter).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const availableNights = getAvailableNightsForMonth(period);
      const sanitizedContext = ExecutiveAIAdvisor.buildSanitizedExecutiveContext({
        tenant: activeTenant || {},
        kpis: {
          revenue: { current: revenue, target: Number(target.revenue_target || target.revenueTarget || 0) },
          netProfit: { current: revenue - otaCost - manualCost, target: Number(target.net_profit_target || target.profit_target || target.profitTarget || 0) },
          occupancy: { current: availableNights > 0 ? soldNights / availableNights * 100 : null, target: Number(target.occupancy_target || target.occupancyTarget || 0) },
          adr: { current: soldNights > 0 ? roomRevenue / soldNights : null },
          revpar: { current: availableNights > 0 ? roomRevenue / availableNights : null }
        },
        properties: Object.keys(villas).map(k => ({ id: k, name: villas[k]?.name || k })),
        gapNights: typeof detectGapNights === 'function' ? detectGapNights() : [],
        tasks: (appData && appData.operationalTasks) || [],
        tickets: (appData && appData.maintenanceTickets) || [],
        leads: (appData && appData.leads) || [],
        targets: target
      });

      const response = ExecutiveAIAdvisor.answerExecutiveQuery(query, sanitizedContext);
      answerText = response.answer;
      sourceMetrics = response.sourceMetrics || [];
      recommendationAction = response.recommendedAction;
    } else {
      answerText = 'Yönetici danışmanı şu anda kullanılamıyor. Doğrulanmamış bir değerlendirme üretilmedi.';
      sourceMetrics = [];
    }

    let actionBtnHtml = '';
    if (recommendationAction && isCanonicalAiActionReady(recommendationAction)) {
      actionBtnHtml = `
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: flex-end;">
          <button type="button" class="btn btn-primary btn-sm" data-onclick="openAiActionConfirmModal(decodeURIComponent('${encodeActionArg(JSON.stringify(recommendationAction))}'))" style="background: #10B981; font-weight: 700;">
            ⚡ Bu Öneriyi Uygula
          </button>
        </div>
      `;
    }

    if (responseContent) {
      responseContent.innerHTML = `
        <div style="font-weight: 700; color: #EDE9FE; margin-bottom: 8px;">💬 Danışman Analizi:</div>
        <div style="color: #F8FAFC; margin-bottom: 12px; line-height: 1.6;">${answerText}</div>
        <div style="font-size: 11px; color: #94A3B8; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px;">
          <strong>Kanonik Metrik Kaynakları:</strong> ${sourceMetrics.join(' • ')}
        </div>
        ${actionBtnHtml}
      `;
    }
    } catch (_error) {
      if (responseContent) {
        responseContent.innerHTML = '<div role="alert" style="color:#FCA5A5; font-size:13px;">Danışman yanıtı oluşturulamadı. Lütfen tekrar deneyin.</div>';
      }
    }
  }, 350);
}

function openAiActionConfirmModal(action) {
  // Isleyiciden JSON metni olarak gelir (L-15: nesne satir ici isleyiciye
  // yazilamaz); dogrudan nesne de kabul edilir.
  if (typeof action === 'string') {
    try { action = JSON.parse(action); } catch (_) { return; }
  }
  pendingAiAction = action;
  const modal = document.getElementById('aiActionConfirmModal');
  const body = document.getElementById('aiActionConfirmBody');
  const metrics = document.getElementById('aiActionConfirmMetrics');
  const btn = document.getElementById('aiActionConfirmExecuteBtn');

  if (body) {
    body.innerHTML = `
      <strong>Öneri Türü:</strong> ${action.type || 'FİYAT_GÜNCELLEME'}<br>
      <strong>Açıklama:</strong> ${escapeHtml(action.description || 'Önerilen stratejik değişiklik kanonik motor aracılığıyla uygulanacaktır.')}
    `;
  }
  if (metrics) {
    metrics.innerText = `Kaynak Metrikler: ${(action.sourceMetrics || ['Doluluk Eşiği', 'Kanonik Fiyat Motoru']).join(', ')}`;
  }
  if (btn) {
    btn.onclick = executeAiActionConfirmed;
  }
  if (modal) modal.style.display = 'flex';
}

function closeAiActionConfirmModal() {
  const modal = document.getElementById('aiActionConfirmModal');
  if (modal) modal.style.display = 'none';
  pendingAiAction = null;
}

function isCanonicalAiActionReady(action) {
  return !!(action && action.type === 'GAP_DISCOUNT' && isUUID(action.propertyId) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(action.date || '')) && Number(action.rate) > 0);
}

async function executeCanonicalAiAction(action, services = {}) {
  if (!isCanonicalAiActionReady(action)) {
    throw new Error('Öneriyi uygulamak için mülk, tarih ve doğrulanmış fiyat bilgisi eksik.');
  }

  const persistOverride = services.saveManualPricingOverride || saveManualPricingOverride;
  return await persistOverride({
    propertyId: action.propertyId,
    startDate: action.date,
    endDate: action.date,
    rate: Number(action.rate),
    reason: 'Komuta Merkezi: boş gece fiyatı'
  });
}

async function executeAiActionConfirmed() {
  if (!pendingAiAction) {
    closeAiActionConfirmModal();
    return false;
  }

  const btn = document.getElementById('aiActionConfirmExecuteBtn');
  if (btn) btn.disabled = true;
  try {
    await executeCanonicalAiAction(pendingAiAction);
    closeAiActionConfirmModal();
    if (typeof renderAll === 'function') renderAll();
    if (typeof showToast === 'function') showToast('Önerilen fiyat takvime kaydedildi.', 'success');
    return true;
  } catch (error) {
    console.error('AI önerisi uygulanamadı:', error);
    if (typeof showToast === 'function') {
      showToast('Öneri uygulanamadı: ' + (error?.message || 'veritabanı hatası'), 'error');
    }
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// -----------------------------------------------------------------------------
// COMMAND PALETTE (CTRL+K)
// -----------------------------------------------------------------------------

function openCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) {
    modal.style.display = 'flex';
    const input = document.getElementById('commandPaletteInput');
    if (input) {
      input.value = '';
      input.focus();
      handleCommandPaletteSearch('');
    }
  }
}

function closeCommandPalette() {
  const modal = document.getElementById('commandPaletteModal');
  if (modal) modal.style.display = 'none';
}

function handleCommandPaletteKeydown(e) {
  if (e.key === 'Escape') closeCommandPalette();
}

function handleCommandPaletteSearch(query) {
  const container = document.getElementById('commandPaletteResults');
  if (!container) return;

  const q = (query || '').toLowerCase().trim();
  const defaultActions = [
    { icon: '📅', title: 'Yeni Rezervasyon Girişi', action: () => { closeCommandPalette(); openBookingModal(); } },
    { icon: '🧹', title: 'Temizlik Görevi Ekle', action: () => { closeCommandPalette(); openNewCleaningTaskModal(); } },
    { icon: '🛠️', title: 'Arıza / Bakım Bildir', action: () => { closeCommandPalette(); openMaintModal(); } },
    { icon: '💸', title: 'Yeni Gider / Harcama Ekle', action: () => { closeCommandPalette(); openExpenseModal(); } },
    { icon: '🎯', title: 'Aylık Hedef Belirle', action: () => { closeCommandPalette(); openGoalsModal(); } },
    { icon: '💬', title: 'WhatsApp Mesaj Ayrıştır', action: () => { closeCommandPalette(); openWhatsAppModal('parser'); } },
    { icon: '🤖', title: 'AI Strateji Danışmanına Git', action: () => { closeCommandPalette(); switchTab('executive'); document.getElementById('aiAdvisorPromptInput')?.focus(); } },
    { icon: '💰', title: 'Finansal Performans Portalı', action: () => { closeCommandPalette(); switchTab('finance'); } }
  ];

  let items = [];

  if (!q) {
    items = defaultActions;
  } else {
    // Search actions
    defaultActions.forEach(act => {
      if (act.title.toLowerCase().includes(q)) items.push(act);
    });

    // Search properties
    if (typeof appData !== 'undefined' && appData.villas) {
      Object.keys(appData.villas).forEach(k => {
        const v = appData.villas[k];
        if (v.name.toLowerCase().includes(q) || k.toLowerCase().includes(q)) {
          items.push({
            icon: '🏡',
            title: `Mülk: ${v.name}${v.capacity ? ` (${v.capacity})` : ''}`,
            action: () => {
              closeCommandPalette();
              currentFilter.villa = k;
              const select = document.getElementById('globalVillaFilter');
              if (select) select.value = k;
              handleFilterChange();
              switchTab('properties');
            }
          });
        }
      });
    }

    // Search bookings
    if (typeof appData !== 'undefined' && appData.bookings) {
      appData.bookings.slice(0, 30).forEach(b => {
        if ((b.guest && b.guest.toLowerCase().includes(q)) || (b.code && b.code.toLowerCase().includes(q))) {
          items.push({
            icon: '👤',
            title: `Rezervasyon: ${b.guest} (${b.checkIn} - ${b.checkOut})`,
            action: () => {
              closeCommandPalette();
              openBookingModal(b.id);
            }
          });
        }
      });
    }
  }

  if (items.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">"${escapeHtml(query)}" ile eşleşen komut veya kayıt bulunamadı.</div>`;
    return;
  }

  container.innerHTML = items.map((it, idx) => `
    <div class="palette-item" data-palette-index="${idx}" role="button" tabindex="0">
      <span style="font-size: 16px;">${escapeHtml(it.icon)}</span>
      <span style="flex: 1; font-weight: 600;">${escapeHtml(it.title)}</span>
      <span style="font-size: 11px; color: #94A3B8;">Git ›</span>
    </div>
  `).join('');
  container.querySelectorAll('[data-palette-index]').forEach(element => {
    const activate = () => {
      const selected = items[Number(element.dataset.paletteIndex)];
      if (selected && typeof selected.action === 'function') selected.action();
    };
    element.addEventListener('click', activate);
    element.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  });
}

// Global shortcut listener for Ctrl+K
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });
}

// -----------------------------------------------------------------------------
// NOTIFICATION DRAWER & NOTIFICATIONS
// -----------------------------------------------------------------------------

function toggleNotificationDrawer() {
  const drawer = document.getElementById('notificationDrawer');
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none';
  drawer.style.display = isHidden ? 'block' : 'none';
  if (isHidden) renderUserNotificationsDrawer();
}

function renderUserNotificationsBadge() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('notificationBellBadge');
  if (!badge) return;

  const notes = (typeof appData !== 'undefined' && appData.userNotifications) || [];
  const unreadCount = notes.filter(n => n.status === 'UNREAD').length;

  if (unreadCount > 0) {
    badge.innerText = unreadCount;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function renderUserNotificationsDrawer() {
  if (typeof document === 'undefined') return;
  const list = document.getElementById('notificationList');
  if (!list) return;

  const notes = (typeof appData !== 'undefined' && appData.userNotifications) || [];
  if (notes.length === 0) {
    list.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Yeni bildirim bulunmuyor.</div>`;
    return;
  }

  list.innerHTML = notes.map(n => `
    <div style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: ${n.severity === 'CRITICAL' ? '#F87171' : '#FCD34D'};">${escapeHtml(n.title || '')}</strong>
        <span style="font-size: 10px; color: #94A3B8;">${escapeHtml(n.status || '')}</span>
      </div>
      <div style="color: #CBD5E1; font-size: 11px;">${escapeHtml(n.message || '')}</div>
      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 4px;">
        ${n.status === 'ACKNOWLEDGED' || n.status === 'RESOLVED' ? '' :
          `<button class="btn btn-secondary btn-sm" data-onclick="confirmUserNotification(decodeURIComponent('${encodeActionArg(String(n.id))}'))" style="font-size: 9px; padding: 1px 5px;">Onayla</button>`}
      </div>
    </div>
  `).join('');
}

/**
 * Cekmecedeki "Onayla" dugmesi.
 *
 * Eskiden dugmenin isleyicisi `acknowledgeUserNotification(id); renderUserNotificationsDrawer();`
 * yaziyordu. Uc ayri sorun vardi:
 *   1. acknowledgeUserNotification async; BEKLENMIYORDU. Yeniden cizim, RPC
 *      donmeden once yerel (degismemis) veriyle calisiyordu.
 *   2. Yerel kayit hic guncellenmiyordu; sayfa yenilenene kadar bildirim
 *      UNREAD gorunmeye devam ediyordu.
 *   3. RPC hata firlatirsa (yetki, baglanti) yakalanmiyordu: yakalanmayan
 *      promise reddi, kullaniciya HICBIR SEY soylemeden sessizce yutuluyordu.
 */
async function confirmUserNotification(notifId) {
  try {
    const sonuc = await acknowledgeUserNotification(notifId);

    // phase39: RPC artik 0 satir etkiledigini SOYLUYOR. Bunu okumazsak
    // ekranda "onaylandi" yazar, kayit ise (silinmis oldugu icin) yoktur —
    // yani istemci, sunucunun duzelttigi yalani kendi tekrarlar.
    if (sonuc && sonuc.success === false) {
      const notes = (typeof appData !== 'undefined' && appData.userNotifications) || [];
      const i = notes.findIndex(x => x.id === notifId);
      if (i >= 0) notes.splice(i, 1);
      renderUserNotificationsBadge();
      renderUserNotificationsDrawer();
      if (typeof showToast === 'function') {
        showToast('Bu bildirim artık mevcut değil; listeden kaldırıldı.', 'info');
      }
      return;
    }

    const notes = (typeof appData !== 'undefined' && appData.userNotifications) || [];
    const n = notes.find(x => x.id === notifId);
    if (n) {
      n.status = 'ACKNOWLEDGED';
      n.acknowledged_at = new Date().toISOString();
    }
    renderUserNotificationsBadge();
    renderUserNotificationsDrawer();
  } catch (err) {
    console.error('Bildirim onaylanamadi:', err);
    if (typeof showToast === 'function') {
      showToast('Bildirim onaylanamadı: ' + (err && err.message ? err.message : 'bilinmeyen hata'), 'error');
    }
  }
}

/**
 * "Tumunu Okundu Say".
 *
 * Eskiden yalnizca bellekteki nesneleri degistiriyordu. `saveAppData()` bile
 * cagrilmiyordu — cagrilsa da bir sey degismezdi, cunku o fonksiyon hicbir sey
 * kaydetmiyor. Rozet siniyor, kullanici "okundu" saniyor, sayfa yenilenince
 * butun bildirimler geri geliyordu (1. bolum).
 */
async function markAllNotificationsAsRead() {
  const notes = (typeof appData !== 'undefined' && appData.userNotifications) || [];
  const okunmayan = notes.filter(n => n.status === 'UNREAD');
  if (okunmayan.length === 0) return;
  try {
    await markUserNotificationsRead(okunmayan.map(n => n.id));
    okunmayan.forEach(n => { n.status = 'READ'; n.read_at = new Date().toISOString(); });
    renderUserNotificationsBadge();
    renderUserNotificationsDrawer();
  } catch (err) {
    console.error('Bildirimler okundu isaretlenemedi:', err);
    if (typeof showToast === 'function') {
      showToast('Bildirimler okundu işaretlenemedi: ' + (err && err.message ? err.message : 'bilinmeyen hata'), 'error');
    }
  }
}

// -----------------------------------------------------------------------------
// CANONICAL TAB RENDERERS
// -----------------------------------------------------------------------------

function renderPropertiesTab() {
  if (typeof document === 'undefined') return;
  const grid = document.getElementById('propertiesManagementGrid');
  if (!grid) return;

  const villas = (typeof appData !== 'undefined' && appData.villas) || {};
  const propKeys = Object.keys(villas).filter(k => villas[k] && villas[k].isActive !== false && !villas[k].archivedAt);

  const badge = document.getElementById('propCountBadge');
  if (badge) badge.innerText = propKeys.length;

  grid.innerHTML = propKeys.map(k => {
    const v = villas[k];
    return `
      <div class="property-health-card status-HEALTHY">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <strong style="font-size: 15px; color: #FFFFFF;">${escapeHtml(v.name || 'Adsız mülk')}</strong>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Kod: ${escapeHtml(k)} • Kapasite: ${escapeHtml(v.capacity || 'Belirtilmedi')}</div>
          </div>
          <span class="badge badge-green">AKTİF</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; margin: 6px 0;">
          <div style="background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
            <span style="color: #94A3B8; display: block;">Taban Fiyat:</span>
            <strong style="color: #F8FAFC; font-size: 12px;">${(() => { const t = v.floor ?? v.floorPrice; return t !== null && t !== undefined && t !== '' && Number.isFinite(Number(t)) ? '₺' + Number(t).toLocaleString('tr-TR') : '—'; })()}</strong>
          </div>
          <div style="background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
            <span style="color: #94A3B8; display: block;">Baz Fiyat:</span>
            <strong style="color: #34D399; font-size: 12px;">${Number.isFinite(Number(v.basePrice)) ? '₺' + Number(v.basePrice).toLocaleString('tr-TR') : '—'}</strong>
          </div>
        </div>
        <div style="font-size: 11px; color: #CBD5E1;">
          <strong>Olanaklar:</strong> ${escapeHtml(v.amenities || 'Belirtilmedi')}
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;">
          <button class="btn btn-secondary btn-sm" data-onclick="openPropertyModal(decodeURIComponent('${encodeActionArg(k)}'))" style="font-size: 10px;">Düzenle</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderOperationsTab() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('opsCombinedContainer');
  if (!container) return;

  const tasks = ((typeof appData !== 'undefined' && appData.cleaningTasks) || [])
    .map(task => normalizeCleaningTask(task, appData.villas || {}));
  // Borc = YAPILMIS ve odenmemis temizlik (K-04). Planli gorev borc degildir.
  const pendingTasks = tasks.filter(task => task.status === 'DONE' && !task.paid);
  const tickets = (typeof appData !== 'undefined' && appData.maintenanceTickets) || [];

  const taskBadge = document.getElementById('opsTaskCountBadge');
  if (taskBadge) taskBadge.innerText = String(pendingTasks.length);

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div style="background: rgba(0,0,0,0.25); padding: 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="margin: 0 0 10px 0; color: #FBBF24; font-size: 13px;">🧹 Bekleyen Temizlik Borçları (${pendingTasks.length})</h4>
        ${pendingTasks.length === 0 ? '<div style="color: var(--text-muted); font-size: 12px;">Bekleyen temizlik borcu yok.</div>' : pendingTasks.map(t => `
          <div data-cleaning-task-id="${escapeHtml(t.id)}" style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;">
            <div style="min-width: 0;">
              <strong style="color: #F8FAFC;">${escapeHtml(t.propertyName)}</strong>
              <div style="color: #CBD5E1; margin-top: 3px;">📅 ${escapeHtml(t.date ? formatTrDate(t.date) : 'Tarih belirtilmedi')} · 🧹 ${escapeHtml(t.cleaner || 'Personel belirtilmedi')}</div>
              ${t.notes ? `<div style="color: var(--text-muted); margin-top: 3px;">${escapeHtml(t.notes)}</div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px; white-space: nowrap;">
              <strong style="color: #60A5FA;">₺${Number(t.amount).toLocaleString('tr-TR')}</strong>
              <span class="badge badge-yellow" style="font-size: 10px;">${escapeHtml(t.paymentLabel)}</span>
              <button class="btn btn-secondary btn-sm" style="font-size: 10px; padding: 3px 7px;" data-onclick="openEditCleaningTaskModal(decodeURIComponent('${encodeActionArg(t.id)}'))">Ayrıntı / Düzenle</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="background: rgba(0,0,0,0.25); padding: 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="margin: 0 0 10px 0; color: #F87171; font-size: 13px;">🛠️ Arıza ve Bakım İşleri (${tickets.length})</h4>
        ${tickets.length === 0 ? '<div style="color: var(--text-muted); font-size: 12px;">Açık arıza kaydı bulunmuyor.</div>' : tickets.slice(0, 5).map(tk => `
          <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; display: flex; justify-content: space-between;">
            <span>${escapeHtml(tk.title || 'Belirtilmedi')}</span>
            <span class="badge badge-red" style="font-size: 10px;">${escapeHtml(tk.status || 'OPEN')}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

const guestDirectoryState = { query: '', segment: 'ALL', propertyId: '', sort: 'RECENT', direction: 'DESC', dateStart: '', dateEnd: '', page: 1, pageSize: 20 };

function getGuestCrmApi() {
  if (typeof LexbnbGuestCrm !== 'undefined') return LexbnbGuestCrm;
  if (typeof require === 'function') return require('./core/guest_crm_engine.js');
  return null;
}

function getGuestCrmView() {
  const api = getGuestCrmApi();
  return api ? api.buildGuestCrmView({
    guests: appData.guests || [],
    bookings: appData.bookings || [],
    messages: appData.scheduledMessages || [],
    offers: appData.extensionOffers || [],
    villas: appData.villas || {},
    today: getTodayStr()
  }) : { rows: [], metrics: {} };
}

function setGuestDirectoryQuery(value) { guestDirectoryState.query = value || ''; guestDirectoryState.page = 1; renderGuestsTab(); }
// syncSelect: satir ici isleyici tek cagri olmali (L-15); secici esitlemesi
// eskiden isleyicide ikinci ifadeydi ve temizleyici butun isleyiciyi siliyordu.
function setGuestDirectorySegment(value, syncSelect) {
  guestDirectoryState.segment = value || 'ALL'; guestDirectoryState.page = 1;
  if (syncSelect) { const el = document.getElementById('guestDirectorySegment'); if (el) el.value = guestDirectoryState.segment; }
  renderGuestsTab();
}
function setGuestDirectoryProperty(value) { guestDirectoryState.propertyId = value || ''; guestDirectoryState.page = 1; renderGuestsTab(); }
function setGuestDirectorySort(value) { guestDirectoryState.sort = value || 'RECENT'; guestDirectoryState.page = 1; renderGuestsTab(); }
function setGuestDirectorySortDirection(value) { guestDirectoryState.direction = value === 'ASC' ? 'ASC' : 'DESC'; guestDirectoryState.page = 1; renderGuestsTab(); }
function setGuestDirectoryDateRange() {
  const startInput = document.getElementById('guestDirectoryDateStart');
  const endInput = document.getElementById('guestDirectoryDateEnd');
  const start = startInput?.value || '';
  const end = endInput?.value || '';
  if (endInput) endInput.setCustomValidity(start && end && end < start ? 'Bitiş tarihi başlangıç tarihinden önce olamaz.' : '');
  if (start && end && end < start) {
    endInput?.reportValidity();
    return;
  }
  guestDirectoryState.dateStart = start;
  guestDirectoryState.dateEnd = end;
  guestDirectoryState.page = 1;
  renderGuestsTab();
}
function resetGuestDirectoryDateRange() {
  const startInput = document.getElementById('guestDirectoryDateStart');
  const endInput = document.getElementById('guestDirectoryDateEnd');
  if (startInput) startInput.value = '';
  if (endInput) { endInput.value = ''; endInput.setCustomValidity(''); }
  guestDirectoryState.dateStart = '';
  guestDirectoryState.dateEnd = '';
  guestDirectoryState.page = 1;
  renderGuestsTab();
}
function setGuestDirectoryPage(value) { guestDirectoryState.page = Math.max(1, Number(value) || 1); renderGuestsTab(); }

function setGuestMetric(id, value) {
  const element = document.getElementById(id);
  if (element) element.innerText = value;
}

function formatGuestDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function renderGuestsTab() {
  if (typeof document === 'undefined') return;
  const tbody = document.getElementById('guestsTableBody');
  if (!tbody) return;
  const api = getGuestCrmApi();
  const view = getGuestCrmView();
  const metrics = view.metrics || {};
  const repeatRate = metrics.repeatRate == null ? '—' : '%' + Math.round(metrics.repeatRate * 100);
  setGuestMetric('guestCountBadge', metrics.totalGuests ?? '—');
  setGuestMetric('guestKpiTotal', metrics.totalGuests ?? '—');
  setGuestMetric('guestKpiRepeat', metrics.repeatGuests ?? '—');
  setGuestMetric('guestKpiRepeatRate', repeatRate + (metrics.repeatRate == null ? '' : ' tekrar oranı'));
  setGuestMetric('guestKpiRepeatRevenue', metrics.repeatRevenue == null ? '—' : '₺' + Number(metrics.repeatRevenue).toLocaleString('tr-TR'));
  setGuestMetric('guestKpiContactable', metrics.contactableGuests ?? '—');
  setGuestMetric('guestKpiRebooking', metrics.rebookingOpportunityCount ?? '—');
  setGuestMetric('guestKpiUnlinked', metrics.unlinkedBookingCount ?? '—');

  const opportunityNotice = document.getElementById('guestOpportunityNotice');
  if (opportunityNotice) {
    const count = Number(metrics.rebookingOpportunityCount || 0);
    opportunityNotice.innerHTML = count
      ? `<strong>🎯 ${count} yeniden rezervasyon fırsatı:</strong> Konaklaması tamamlanmış, gelecekte rezervasyonu olmayan ve kampanya iletişimine açık onay vermiş misafir. <button type="button" class="btn btn-secondary btn-sm" style="margin-left:8px;" data-onclick="setGuestDirectorySegment('REBOOKING', true)">Fırsatları göster</button>`
      : '';
    opportunityNotice.style.display = count ? 'block' : 'none';
  }

  const notice = document.getElementById('guestDataNotice');
  if (notice) {
    const notes = [];
    if (metrics.excludedAggregateBookingCount) notes.push(`${metrics.excludedAggregateBookingCount} toplu aktarım özeti kişi olmadığı için CRM dışında tutuldu.`);
    if (metrics.unlinkedBookingCount) notes.push(`${metrics.unlinkedBookingCount} gerçek rezervasyon henüz bir misafir profiline bağlı değil; düzenleyip telefon veya e-posta ekleyerek bağlayabilirsiniz.`);
    notice.innerText = notes.join(' ');
    notice.style.display = notes.length ? 'block' : 'none';
  }

  const editAllowed = ['owner', 'admin', 'manager', 'staff'].includes(activeTenant?.role);
  const newButton = document.getElementById('newGuestProfileBtn');
  if (newButton) newButton.style.display = editAllowed ? '' : 'none';

  const propertySelect = document.getElementById('guestDirectoryProperty');
  if (propertySelect) {
    const selected = guestDirectoryState.propertyId;
    const options = Object.entries(appData.villas || {}).map(([key, villa]) =>
      `<option value="${escapeHtml(key)}">${escapeHtml(villa?.name || key)}</option>`
    ).join('');
    propertySelect.innerHTML = '<option value="">Tüm mülkler</option>' + options;
    propertySelect.value = selected;
  }

  const filtered = api ? api.filterGuestRows(view.rows, guestDirectoryState) : [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / guestDirectoryState.pageSize));
  guestDirectoryState.page = Math.min(guestDirectoryState.page, pageCount);
  const start = (guestDirectoryState.page - 1) * guestDirectoryState.pageSize;
  const pageRows = filtered.slice(start, start + guestDirectoryState.pageSize);

  if (pageRows.length === 0) {
    const hasProfiles = (metrics.totalGuests || 0) > 0;
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:24px;">${hasProfiles ? 'Arama veya segmente uyan misafir yok.' : 'Henüz gerçek misafir profili yok. Yeni rezervasyonda telefon veya e-posta girildiğinde profil güvenle oluşur.'}</td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map(row => {
      const rangeBookings = (row.bookings || []).filter(booking => {
        const checkIn = String(booking.checkIn || '');
        const checkOut = String(booking.checkOut || checkIn);
        if (guestDirectoryState.dateStart && checkOut <= guestDirectoryState.dateStart) return false;
        if (guestDirectoryState.dateEnd && checkIn > guestDirectoryState.dateEnd) return false;
        return true;
      });
      const dateBooking = (guestDirectoryState.dateStart || guestDirectoryState.dateEnd)
        ? rangeBookings.sort((a, b) => String(b.checkIn || '').localeCompare(String(a.checkIn || '')))[0]
        : (row.nextStay || row.lifecycle?.booking || row.lastStay);
      const dateValue = dateBooking ? `${formatTrDate(dateBooking.checkIn)} – ${formatTrDate(dateBooking.checkOut)}` : '—';
      const lifecycleClass = row.lifecycle.code === 'IN_HOUSE' ? 'badge-green' : (row.lifecycle.code === 'UPCOMING' ? 'badge-yellow' : 'badge-blue');
      const segment = row.isRepeat ? '<span class="badge badge-purple">TEKRAR</span>' : '<span class="badge badge-slate">İLK KONAKLAMA</span>';
      const opportunity = row.rebookingEligible ? '<br><span class="badge badge-green" style="margin-top:4px;">YENİDEN REZERVASYON</span>' : '';
      const contact = [row.phone, row.email].filter(Boolean).map(escapeHtml).join('<br>') || '<span style="color:var(--text-muted);">Eksik</span>';
      const consent = row.marketingOptIn ? '<span class="badge badge-green">KAMPANYA İZNİ VAR</span>' : '<span class="badge badge-slate">KAMPANYA İZNİ YOK</span>';
      const directShare = row.directShare == null ? '—' : `%${Math.round(row.directShare * 100)} doğrudan`;
      const villaKey = dateBooking?.villa || dateBooking?.propertyId || '';
      const villaName = villaKey ? (appData.villas?.[villaKey]?.name || villaKey) : '';
      return `<tr>
        <td><strong>${escapeHtml(row.name)}</strong><br><small>${escapeHtml(String(row.language || 'tr').toUpperCase())}</small></td>
        <td>${contact}</td>
        <td><strong>${row.stayCount}</strong></td>
        <td>${row.nights}</td>
        <td><strong>₺${Number(row.lifetimeRevenue).toLocaleString('tr-TR')}</strong></td>
        <td>${escapeHtml(dateValue)}${villaName ? `<br><small>${escapeHtml(villaName)}</small>` : ''}</td>
        <td><span>${escapeHtml(directShare)}</span><br>${consent}</td>
        <td><span class="badge ${lifecycleClass}">${escapeHtml(row.lifecycle.label)}</span><br>${segment}${opportunity}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-sm" data-onclick="openGuestProfileModal(decodeURIComponent('${encodeActionArg(String(row.id))}'))">Detay</button></td>
      </tr>`;
    }).join('');
  }

  const pagination = document.getElementById('guestDirectoryPagination');
  if (pagination) pagination.innerHTML = `<button class="btn btn-secondary btn-sm" data-onclick="setGuestDirectoryPage(${guestDirectoryState.page - 1})" ${guestDirectoryState.page <= 1 ? 'disabled' : ''}>Önceki</button><span>${filtered.length} misafir · ${guestDirectoryState.page}/${pageCount}</span><button class="btn btn-secondary btn-sm" data-onclick="setGuestDirectoryPage(${guestDirectoryState.page + 1})" ${guestDirectoryState.page >= pageCount ? 'disabled' : ''}>Sonraki</button>`;
}

/** Misafir profilinden rezervasyona gec (tek cagri, L-15). */
function openBookingFromGuestProfile(bookingId) {
  closeGuestProfileModal();
  openBookingModal(bookingId);
}

function closeGuestProfileModal() {
  document.getElementById('guestProfileModal')?.classList.remove('active');
}

function openGuestProfileModal(guestId = null) {
  const modal = document.getElementById('guestProfileModal');
  const form = document.getElementById('guestProfileForm');
  if (!modal || !form) return;
  form.reset();
  document.getElementById('guestCountryCode').value = 'TR';
  const guest = guestId ? (appData.guests || []).find(item => item.id === guestId) : null;
  document.getElementById('guestProfileId').value = guest?.id || '';
  document.getElementById('guestProfileModalTitle').innerText = guest ? '👤 Misafir Detayı' : '➕ Yeni Misafir';
  document.getElementById('guestFirstName').value = guest?.firstName || '';
  document.getElementById('guestLastName').value = guest?.lastName || '';
  document.getElementById('guestPhone').value = guest?.phone || '';
  document.getElementById('guestEmail').value = guest?.email || '';
  document.getElementById('guestLanguage').value = guest?.language || 'tr';
  document.getElementById('guestCountryCode').value = guest?.countryCode || 'TR';
  document.getElementById('guestAllowWhatsapp').checked = guest?.allowWhatsapp === true;
  document.getElementById('guestAllowSms').checked = guest?.allowSms === true;
  document.getElementById('guestAllowEmail').checked = guest?.allowEmail === true;
  document.getElementById('guestMarketingOptIn').checked = guest?.marketingOptIn === true;
  document.getElementById('guestPreferences').value = guest?.preferences || '';
  document.getElementById('guestInternalNotes').value = guest?.internalNotes || '';
  document.getElementById('guestTags').value = (guest?.tags || []).join(', ');

  const rebookingAction = document.getElementById('guestRebookingAction');

  const insights = document.getElementById('guestProfileInsights');
  const row = guest ? getGuestCrmView().rows.find(item => item.id === guest.id) : null;
  if (insights && row) {
    const history = row.bookings.length ? row.bookings.map(booking => {
      const villaName = appData.villas?.[booking.villa]?.name || booking.villa || '—';
      return `<div style="padding:7px 0; border-bottom:1px solid rgba(255,255,255,.06);">${escapeHtml(villaName)} · ${formatTrDate(booking.checkIn)} – ${formatTrDate(booking.checkOut)} · ₺${Number(booking.gross || 0).toLocaleString('tr-TR')} <button type="button" class="btn btn-secondary btn-sm" style="float:right;" data-onclick="openBookingFromGuestProfile(decodeURIComponent('${encodeActionArg(String(booking.id))}'))">Rezervasyon</button></div>`;
    }).join('') : '<div style="color:var(--text-muted);">Bu profile bağlı rezervasyon yok.</div>';
    const offerStatus = row.latestOffer ? escapeHtml(row.latestOffer.status || '—') : '—';
    const directShare = row.directShare == null ? '—' : '%' + Math.round(row.directShare * 100);
    const consentEvents = (appData.guestConsentEvents || []).filter(event => event.guest_id === row.id);
    const consentHistory = consentEvents.length
      ? consentEvents.map(event => `<div style="padding:5px 0; font-size:12px;"><span class="badge ${event.marketing_opt_in ? 'badge-green' : 'badge-slate'}">${event.marketing_opt_in ? 'İZİN VERİLDİ' : 'İZİN GERİ ÇEKİLDİ'}</span> ${escapeHtml(formatGuestDateTime(event.recorded_at))} · ${escapeHtml(event.source || 'APPLICATION')}</div>`).join('')
      : '<div style="color:var(--text-muted); font-size:12px;">Henüz kaydedilmiş izin değişikliği yok.</div>';
    const tagBadges = (guest.tags || []).length ? `<div style="margin-bottom:10px;">${guest.tags.map(tag => `<span class="badge badge-purple" style="margin-right:5px;">${escapeHtml(tag)}</span>`).join('')}</div>` : '';
    insights.innerHTML = `<div class="kpi-cards-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); margin-bottom:12px;"><div class="kpi-card"><span class="kpi-label">KONAKLAMA</span><div class="kpi-value">${row.stayCount}</div></div><div class="kpi-card"><span class="kpi-label">GECE</span><div class="kpi-value">${row.nights}</div></div><div class="kpi-card"><span class="kpi-label">CİRO</span><div class="kpi-value">₺${Number(row.lifetimeRevenue).toLocaleString('tr-TR')}</div></div><div class="kpi-card"><span class="kpi-label">DOĞRUDAN PAY</span><div class="kpi-value">${directShare}</div></div><div class="kpi-card"><span class="kpi-label">PLANLI MESAJ</span><div class="kpi-value">${row.scheduledCount}</div><div class="kpi-meta">Uzatma: ${offerStatus}</div></div></div>${tagBadges}<h4>Konaklama Geçmişi</h4>${history}<h4 style="margin-top:14px;">Kampanya İzni Geçmişi</h4>${consentHistory}`;
    insights.style.display = 'block';
    if (rebookingAction) {
      rebookingAction.innerHTML = row.rebookingEligible
        ? `<strong>🎯 Yeniden rezervasyon fırsatı</strong><br><span style="font-size:12px; color:var(--text-muted);">Son çıkışın üzerinden ${row.daysSinceLastStay ?? '—'} gün geçti; gelecekte rezervasyon yok ve kampanya izni mevcut.</span><button type="button" class="btn btn-primary btn-sm" style="float:right; margin-top:-8px;" data-onclick="openGuestRebookingWhatsApp(decodeURIComponent('${encodeActionArg(String(row.id))}'))">WhatsApp'ta davet hazırla</button>`
        : '';
      rebookingAction.style.display = row.rebookingEligible ? 'block' : 'none';
    }
  } else if (insights) {
    insights.innerHTML = '';
    insights.style.display = 'none';
    if (rebookingAction) { rebookingAction.innerHTML = ''; rebookingAction.style.display = 'none'; }
  }
  modal.classList.add('active');
}

function openGuestRebookingWhatsApp(guestId) {
  const row = getGuestCrmView().rows.find(item => item.id === guestId);
  if (!row || !row.rebookingEligible) {
    if (typeof alert === 'function') alert('Bu misafir için telefon, WhatsApp izni, kampanya açık onayı ve tamamlanmış konaklama birlikte bulunmalıdır.');
    return;
  }
  const phone = String(row.phone || '').replace(/\D/g, '');
  if (!phone) return;
  const firstName = row.guest?.firstName || row.guest?.first_name || row.name;
  const text = `Merhaba ${firstName}, sizi yeniden ağırlamaktan memnuniyet duyarız. Yeni seyahat tarihleriniz için size yardımcı olabiliriz.`;
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(`https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }
}

async function saveGuestProfile(event) {
  event.preventDefault();
  const submit = event.target.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const id = document.getElementById('guestProfileId').value;
    const rawPhone = document.getElementById('guestPhone').value.trim();
    const rawEmail = document.getElementById('guestEmail').value.trim();
    const phone = rawPhone ? normalizePhone(rawPhone, document.getElementById('guestCountryCode').value || 'TR') : { valid: false, normalized: '' };
    const email = rawEmail ? normalizeEmail(rawEmail) : { valid: false, normalized: '' };
    if (rawPhone && !phone.valid) throw new Error('Telefon numarası geçerli değil.');
    if (rawEmail && !email.valid) throw new Error('E-posta adresi geçerli değil.');
    const input = {
      firstName: document.getElementById('guestFirstName').value.trim(),
      lastName: document.getElementById('guestLastName').value.trim(),
      phone: phone.normalized || '', email: email.normalized || '',
      language: document.getElementById('guestLanguage').value,
      countryCode: document.getElementById('guestCountryCode').value.trim().toUpperCase() || 'TR',
      allowWhatsapp: document.getElementById('guestAllowWhatsapp').checked,
      allowSms: document.getElementById('guestAllowSms').checked,
      allowEmail: document.getElementById('guestAllowEmail').checked,
      marketingOptIn: document.getElementById('guestMarketingOptIn').checked,
      preferences: document.getElementById('guestPreferences').value.trim(),
      internalNotes: document.getElementById('guestInternalNotes').value.trim(),
      tags: document.getElementById('guestTags').value.split(',').map(tag => tag.trim()).filter(Boolean)
    };
    const duplicate = detectDuplicateCandidates(
      { id: id || null, tenant_id: getActiveTenantId(), phone: input.phone, email: input.email },
      (appData.guests || []).map(item => ({ id: item.id, tenant_id: item.tenantId, first_name: item.firstName, last_name: item.lastName, phone: item.phone, email: item.email }))
    );
    if (duplicate.hasWarning) throw new Error('Aynı telefon veya e-postaya sahip başka bir misafir profili var. Otomatik birleştirme yapılmadı; mevcut profili açın.');
    const saved = id ? await updateGuest(id, input) : await createGuest(input);
    if (!appData.guests) appData.guests = [];
    const index = appData.guests.findIndex(item => item.id === saved.id);
    if (index >= 0) appData.guests[index] = saved; else appData.guests.unshift(saved);
    closeGuestProfileModal();
    renderGuestsTab();
    if (typeof alert === 'function') alert('✅ Misafir profili kaydedildi.');
  } catch (error) {
    if (typeof alert === 'function') alert('Misafir profili kaydedilemedi: ' + (error.message || 'Bilinmeyen hata'));
  } finally {
    if (submit) submit.disabled = false;
  }
}

function renderPricingTab() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('pricingManagerContainer');
  if (!container) return;

  const gaps = (typeof appData !== 'undefined' && appData.gapNights) || [];
  const hasPricingSource = Object.keys((typeof appData !== 'undefined' && appData.villas) || {}).length > 0
    && ((typeof appData !== 'undefined' && appData.bookings) || []).length > 0;
  const gapBadge = document.getElementById('pricingGapBadge');
  if (gapBadge) gapBadge.innerText = gaps.length;

  container.innerHTML = `
    <div style="background: rgba(0,0,0,0.25); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);">
      <h4 style="margin: 0 0 12px 0; color: #A78BFA; font-size: 14px;">🎯 Fiyatlandırma ve Boş Gece Durumu</h4>
      <p style="font-size: 12px; color: #CBD5E1; margin: 0 0 14px 0;">
        Kayıtlı rezervasyon takviminizdeki tek gecelik boşlukları gösterir. Fiyat değişikliği yalnızca sizin onayınızla yapılır.
      </p>
      ${!hasPricingSource
        ? '<div style="color: var(--text-muted); font-size: 12px;">Mülk ve rezervasyon kaydı olmadan boş gece durumu hesaplanamadı.</div>'
        : gaps.length === 0 ? '<div style="color: #34D399; font-size: 12px;">✅ Kayıtlı takvimde kritik boş gece penceresi bulunmuyor.</div>' : `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;">
          ${gaps.map(g => `
            <div class="gap-night-card">
              <div class="gap-villa-name">${escapeHtml((appData.villas && appData.villas[g.villa]?.name) || g.villa)}</div>
              <div class="gap-dates-tag">📅 ${g.date} (1 Gece)</div>
              <div class="gap-price-box">
                <span style="font-size: 11px; color: #94A3B8;">Önerilen Fiyat:</span>
                <strong style="color: ${Number(g.suggestedPrice) > 0 ? '#34D399' : 'var(--text-muted)'};">${Number(g.suggestedPrice) > 0 ? '₺' + Number(g.suggestedPrice).toLocaleString('tr-TR') : '—'}</strong>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function renderReportsTab() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('reportsContentContainer');
  if (!container) return;

  const bookings = (appData.bookings || []).filter(b => b.status !== 'CANCELLED' && isBookingInFilter(b));
  const expenses = (appData.expenses || []).filter(isExpenseInFilter);
  const tl = n => Math.round(Number(n) || 0).toLocaleString('tr-TR');
  const kanal = new Map();
  let brut = 0;
  let komisyon = 0;
  bookings.forEach(b => {
    const pay = getBookingFilterShare(b);
    const tutar = (Number(b.gross) || 0) * pay.ratio;
    const kesinti = (Number(b.otaCommission ?? b.otaComm) || 0) * pay.ratio;
    const ad = String(b.channel || 'KANAL BELİRTİLMEDİ').trim() || 'KANAL BELİRTİLMEDİ';
    const satir = kanal.get(ad) || { tutar: 0, adet: 0 };
    satir.tutar += tutar;
    satir.adet += 1;
    kanal.set(ad, satir);
    brut += tutar;
    komisyon += kesinti;
  });
  const opex = expenses.filter(e => String(e.type || 'OPEX').toUpperCase() !== 'CAPEX')
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const capex = expenses.filter(e => String(e.type || '').toUpperCase() === 'CAPEX')
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const netNakit = brut - komisyon - opex - capex;
  const marj = brut > 0 ? (netNakit / brut) * 100 : null;
  const kanalSatirlari = Array.from(kanal.entries())
    .sort((a, b) => b[1].tutar - a[1].tutar)
    .map(([ad, v]) => {
      const pay = brut > 0 ? (v.tutar / brut) * 100 : 0;
      return `• <strong>${escapeHtml(ad)}:</strong> %${pay.toFixed(1)} pay (₺${tl(v.tutar)}, ${v.adet} rezervasyon)`;
    }).join('<br>');

  if (!bookings.length && !expenses.length) {
    container.innerHTML = '<div class="empty-state" style="padding:24px; color:var(--text-muted);">Seçili dönem ve mülk için rezervasyon veya gider kaydı yok; kanal dağılımı ve kârlılık hesaplanamadı.</div>';
    return;
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div style="background: rgba(0,0,0,0.25); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="margin: 0 0 10px 0; color: #60A5FA; font-size: 13px;">🌐 Kanal Satış Dağılımı</h4>
        <div style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
          ${kanalSatirlari || 'Kanalı belirlenmiş rezervasyon kaydı yok.'}
        </div>
      </div>
      <div style="background: rgba(0,0,0,0.25); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="margin: 0 0 10px 0; color: #34D399; font-size: 13px;">📈 Kârlılık Köprüsü & Komisyon Analizi</h4>
        <div style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
          • <strong>Brüt Satış:</strong> ₺${tl(brut)}<br>
          • <strong>Kayıtlı Kanal Komisyonları:</strong> ₺${tl(komisyon)}<br>
          • <strong>Kayıtlı OPEX:</strong> ₺${tl(opex)}<br>
          • <strong>Kayıtlı CAPEX:</strong> ₺${tl(capex)}<br>
          • <strong>Net Nakit:</strong> ₺${tl(netNakit)}${marj === null ? ' (marj hesaplanamadı: ciro yok)' : ` (%${marj.toFixed(1)} marj)`}
        </div>
      </div>
    </div>
  `;
}

function openTabFromDeepLink(tabId, entityId) {
  switchTab(tabId);
}

async function runCommandCenterAction(actionType, entityId, options = {}) {
  if (actionType === 'COMPLETE_TASK') {
    const updateTask = options.updateOperationalTask || updateOperationalTask;
    return await updateTask(entityId, { status: 'DONE' });
  }
  if (actionType === 'RESOLVE_TICKET') {
    const actualCost = Number(options.actualCost);
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      throw new Error('Gerçekleşen maliyet sıfır veya pozitif bir sayı olmalıdır.');
    }
    const resolveTicket = options.resolveMaintenanceTicket || resolveMaintenanceTicket;
    return await resolveTicket(entityId, actualCost, 'Tadilat', 'Komuta Merkezi üzerinden çözüldü.');
  }
  if (actionType === 'RESOLVE_ALERT') {
    const resolveAlert = options.resolveExecutiveAlert || resolveExecutiveAlert;
    const result = await resolveAlert(entityId);
    if (result && result.success === false) throw new Error('Bu uyarı artık mevcut değil.');
    return result;
  }
  if (actionType === 'CONVERT_LEAD') {
    const convertLead = options.convertLeadAction || convertLeadAction;
    const result = await convertLead(entityId);
    if (result !== true) throw new Error('Talep rezervasyona dönüştürülmedi.');
    return result;
  }
  throw new Error('Bu aksiyon için çalışan bir uygulama yolu bulunmuyor.');
}

async function handleQuickActionTrigger(actionType, entityId) {
  if (actionType === 'APPLY_GAP_DISCOUNT') {
    const gap = ((typeof appData !== 'undefined' && appData.gapNights) || [])
      .find(item => `gap-${item.date}-${item.villa}` === entityId);
    const propertyId = gap && ((appData.villas?.[gap.villa]?.id) || (isUUID(gap.villa) ? gap.villa : null));
    const rate = Number(gap?.suggestedPrice);
    if (!gap || !propertyId || !Number.isFinite(rate) || rate <= 0) {
      if (typeof showToast === 'function') {
        showToast('İndirim uygulanmadı: doğrulanmış mülk veya fiyat bilgisi eksik.', 'error');
      }
      openTabFromDeepLink('pricing', entityId);
      return false;
    }
    openAiActionConfirmModal({
      type: 'GAP_DISCOUNT',
      propertyId,
      date: gap.date,
      rate,
      description: `${gap.date} tarihi için ₺${rate.toLocaleString('tr-TR')} fiyatı takvime kaydedilecek.`,
      sourceMetrics: [`Tarih: ${gap.date}`, `Önerilen fiyat: ₺${rate.toLocaleString('tr-TR')}`]
    });
    return true;
  }

  let actualCost;
  if (actionType === 'RESOLVE_TICKET') {
    const entered = prompt('Arıza için gerçekleşen maliyeti giriniz (₺):', '0');
    if (entered === null) return false;
    actualCost = Number(String(entered).replace(',', '.'));
  }

  try {
    await runCommandCenterAction(actionType, entityId, { actualCost });
    if (typeof renderAll === 'function') renderAll();
    const messages = {
      COMPLETE_TASK: 'Operasyonel görev tamamlandı.',
      RESOLVE_TICKET: 'Arıza iş emri çözüldü.',
      RESOLVE_ALERT: 'Bildirim kapatıldı.',
      CONVERT_LEAD: 'Talep rezervasyona dönüştürüldü.'
    };
    if (actionType !== 'CONVERT_LEAD' && typeof showToast === 'function') {
      showToast(messages[actionType] || 'Aksiyon tamamlandı.', 'success');
    }
    return true;
  } catch (error) {
    console.error('Komuta merkezi aksiyonu uygulanamadı:', error);
    if (typeof showToast === 'function') {
      showToast('Aksiyon uygulanamadı: ' + (error?.message || 'veritabanı hatası'), 'error');
    }
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseWhatsAppMessageText,
    isUUID,
    roundMoney,
    normalizeCleaningTask,
    cleaningExpenseKey,
    findLegacyCleaningExpense,
    syncBookingCleaningTaskToCloud,
    refreshAfterPersistedWrite,
    runWhatIfSimulation,
    isDirectBookingChannel,
    computeImportContentFingerprint,
    saveBookingPaymentCommission,
    deleteCleaningTask,
    parseCleaningAmountInput,
    markCleaningDone,
    markCleaningSkipped,
    markCleaningPlanned,
    markSelectedCleaningDone,
    toggleTaskPaid,
    payAllPendingCleaning,
    promptEditTaskAmount,
    cloudUpsertCleaningTask,
    cloudDeleteCleaningTask,
    cloudDeleteCleaningExpense,
    persistCleaningLedgerEntry,
    persistCleaningTaskDraft,
    upsertCleaningTaskInMemory,
    mapPropertyFromDb,
    mapPropertyToDb,
    loadProperties,
    createProperty,
    updateProperty,
    deleteProperty,
    generateSafeBookingCode,
    calculateNightsBetween,
    mapBookingFromDb,
    attachBookingVillaSlugs,
    mapBookingToDb,
    checkBookingOverlap,
    loadBookings,
    createBooking,
    updateBooking,
    deleteBooking,
    mapExpenseFromDb,
    mapExpenseToDb,
    loadExpenses,
    createExpense,
    updateExpense,
    deleteExpense,
    saveExpense,
    deleteExpenseUI,
    ALLOWED_LEAD_STAGES,
    ALLOWED_LEAD_SOURCES,
    mapLeadFromDb,
    mapLeadToDb,
    buildLeadEditPayload,
    validateLeadInput,
    loadLeads,
    createLead,
    updateLead,
    deleteLead,
    buildLeadConversionOptions,
    convertLeadToBooking,
    setAppData,
    getAppData,
    setSupabaseClient,
    getSupabaseClient,
    getActiveTenantId,
    setActiveTenant,
    getImportEngine,
    buildImportSource,
    paginateRows,
    getActiveRenderPlan,
    insertImportedRowsInBatches,
    mapMaintenanceTicketFromDb,
    getMaintenanceStatusPresentation,
    getMaintenanceSeverityForSave,
    getTenantRealtimeTables,
    applyTenantRealtimePayload,
    subscribeTenantRealtime,
    unsubscribeTenantRealtime,
    getExportEngine,
    collectExportRecords,
    exportLedger,
    cloudLinkImportBatchRows,
    loadImportBatches,
    undoImportBatch,
    loadMonthlyTargets,
    saveMonthlyTarget,
    loadMonthlyCloses,
    closeMonthlyPeriod,
    reopenMonthlyPeriod,
    isPeriodClosed,
    isStayPeriodClosed,
    setCurrentFilter,
    computeFilterLedger,
    computeMonthLedger,
    computeMonthActuals,
    computePreviousPeriodTotals,
    isBookingInFilter,
    getFilterDateRange,
    isDateInFilter,
    isExpenseInFilter,
    isCampaignInFilter,
    getBookingFilterShare,
    computeBookingEconomics,
    getChannelCommissionRate,
    sortBookingChannelsForSelection,
    canManageBookingChannels,
    renderBookingChannelSettings,
    getFallbackBookingChannels,
    mapBookingChannelFromDb,
    isMissingBookingChannelSchema,
    isMissingSchemaError,
    loadTenantBookingChannels,
    saveTenantBookingChannel,
    // phase31 — yerel kalan alti defter
    fetchTenantRowsTolerant,
    reportStatePersist,
    buildPropertyIdSlugMap,
    resolveOptionalPropertyId,
    mapMarketingCampaignFromDb,
    mapInfluencerCollabFromDb,
    cloudSaveMarketingCampaign,
    cloudDeleteMarketingCampaign,
    cloudSaveInfluencerCollab,
    cloudDeleteInfluencerCollab,
    cloudSaveTenantSetting,
    cloudSaveOperatorNote,
    cloudSavePricingLadder,
    cloudSaveHousekeepingOverride,
    syncBookingCleaningTasks,
    convertAiActionToTask,
    loadOperationalTasks,
    createOperationalTask,
    updateOperationalTask,
    deleteOperationalTask,
    loadMaintenanceTickets,
    createMaintenanceTicket,
    resolveMaintenanceTicket,
    mapGuestFromDb,
    mapGuestToDb,
    loadGuests,
    createGuest,
    updateGuest,
    splitGuestName,
    linkBookingGuestProfile,
    getGuestCrmView,
    loadMessageTemplates,
    createMessageTemplate,
    updateMessageTemplate,
    loadScheduledMessages,
    cancelScheduledMessage,
    loadPricingProfiles,
    savePricingProfile,
    loadPricingRules,
    createPricingRule,
    updatePricingRule,
    deletePricingRule,
    loadPricingEvents,
    createPricingEvent,
    updatePricingEvent,
    deletePricingEvent,
    loadDailyRates,
    saveManualPricingOverride,
    loadBookingQuotes,
    createBookingQuote,
    acceptBookingQuote,
    mapFriendlyErrorMessage,
    loadExecutiveAlerts,
    createExecutiveAlert,
    acknowledgeExecutiveAlert,
    resolveExecutiveAlert,
    loadUserNotifications,
    createUserNotification,
    acknowledgeUserNotification,
    loadTenantOnboarding,
    saveTenantOnboarding,
    getExecutiveDashboardSnapshot,
    getExecutiveSnapshotContext,
    invalidateExecutiveSnapshotCache,
    shouldRefreshExecutiveSnapshot,
    refreshExecutiveDashboardSnapshot,
    renderExecutiveSnapshotKpis,
    renderExecutiveControlCenter,
    renderPortfolioHealth,
    runCommandCenterAction,
    executeCanonicalAiAction,
    getPropertySalesReadiness,
    canManagePropertyReadiness,
    setPropertySalesReadiness,
    askExecutiveAdvisor,
    openCommandPalette,
    closeCommandPalette,
    toggleNotificationDrawer,
    // Bildirim merkezi: yukleme + okundu/onay yollari. Bu fonksiyonlarin
    // hicbiri kalici degildi (bkz. markAllNotificationsAsRead aciklamasi).
    markUserNotificationsRead,
    markAllNotificationsAsRead,
    confirmUserNotification,
    renderUserNotificationsBadge,
    renderUserNotificationsDrawer,
    // Tarayici render hatti. core/render_pipeline_tests.js bunlari sahte bir
    // DOM ile GERCEKTEN calistirir; setEl gibi tanimsiz referanslar ancak
    // boyle yakalanir (statik tarama regex literalleri yuzunden guvenilmez).
    renderAll,
    renderOperationsTab,
    renderTapeChart,
    renderReportsTab,
    renderPricingTab,
    renderPricingKpiStrip,
    renderAirbnbAuditRadar,
    renderCoverAbTestLab,
    renderGapNights,
    renderOtaRadar,
    setEl,
    showToast,
    // Pazarlama ekrani renderAll'in ICINDE DEGIL (sekme acilinca calisiyor),
    // bu yuzden ayrica disa aktarilir. Bu fonksiyonlar musteriye rakam
    // yaziyor; sahte DOM ile gercekten kosulup uydurma deger uretmedikleri
    // olculur (core/render_pipeline_tests.js).
    runAIMarketingAdvisor,
    runMarketingBudgetSimulation,
    renderGapNightsRadar,
    updateClosingScriptPreview,
    collectMarketingFacts,
    createAuthSessionStorage,
    renderMonthCloseCard,
    getFriendlyAuthErrorMessage,
    handleAuthenticatedSession,
    setRememberDevicePreference,
    setActiveTenantForTests: (t) => { activeTenant = t; }
  };
}


