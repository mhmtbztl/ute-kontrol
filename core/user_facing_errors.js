/**
 * LEXBNB — KULLANICIYA GIDEN HATA METNI (L-22, L-24)
 *
 * Uygulamanin yuzlerce yerinde `alert('... kaydedilemedi: ' + err.message)`
 * kalibi var ve Postgres / PostgREST mesaji oldugu gibi kullaniciya gidiyordu:
 * tablo, kisit, sutun ve RPC adlari dahil. Bu hem ic yapiyi disariya
 * anlatiyordu hem de kullaniciya hicbir sey soylemiyordu
 * ("new row violates row-level security policy for table ...").
 *
 * Her cagri noktasini tek tek duzeltmek yerine kullaniciya giden IKI kanal
 * (uyari kutusu ve bildirim) bu fonksiyondan gecer. Uygulamanin kendi Turkce
 * metni oldugu gibi kalir; yalniz teknik parca anlasilir bir cumleyle
 * degistirilir ve ayrinti bir basvuru koduyla konsola yazilir. Destek
 * isteyen kullanici kodu iletir; ayrinti ekranda gorunmez.
 *
 * Yakalanmamis hatalar (L-24) icin: kullaniciya bir kez gorunur mesaj, konsola
 * ayrinti. Harici hata izleme servisi kullanilmiyor (K-07).
 *
 * Node'da ve tarayicida calisir; yan etkisi yoktur.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UserFacingErrors = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  // Veritabani / sunucu ic ayrintisini ele veren parcalar. Uygulamanin kendi
  // Turkce mesajlari bunlari icermez.
  const TEKNIK = [
    /violates (row-level security|foreign key|check|unique|not-null|exclusion)/i,
    /duplicate key value/i,
    /relation "[^"]+"/i,
    /column "[^"]+"/i,
    /function public\./i,
    /\bPGRST\d{3}\b/,
    /\bSQLSTATE\b/i,
    /schema cache/i,
    /syntax error at or near/i,
    /JSON object requested/i,
    /permission denied for (table|function|schema|relation)/i,
    /invalid input syntax for type/i,
    /null value in column/i,
    /Could not find the (table|function)/i,
    /\bat character \d+/i,
    /Key \([^)]*\)=\(/
  ];

  // Sirali: ilk eslesen kazanir.
  const ESLEME = [
    [/CLOSED_PERIOD_VIOLATION|dönemi kapatılmış/i, 'Bu finans dönemi kapatılmış; geçmişe dönük değişiklik yapılamaz.'],
    [/PERIOD_NOT_ENDED/, 'Bu ay henüz bitmedi; ayın son gününden sonra kapatabilirsiniz.'],
    [/BOOKING_OVERLAP|bookings_no_overlap|exclude_overlapping|OVERBOOKING_CONFLICT|conflicting key value/i, 'Seçilen tarihlerde bu mülk için başka bir rezervasyon var.'],
    [/row-level security|permission denied|UNAUTHORIZED|FORBIDDEN_ROLE|42501/i, 'Bu işlem için yetkiniz yok.'],
    [/JWT expired|invalid JWT|refresh_token/i, 'Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.'],
    [/Failed to fetch|NetworkError|network request failed|FetchError|Load failed/i, 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'],
    [/schema cache|Could not find the (table|function)|PGRST20[45]|42P01|42703|does not exist/i, 'Veritabanı güncellemesi henüz uygulanmamış; yöneticinize haber verin.'],
    [/duplicate key value|already exists|23505/i, 'Bu kayıt zaten var.'],
    [/violates foreign key|23503/i, 'Bağlı bir kayıt bulunamadı ya da bu kayda bağlı başka kayıtlar var.'],
    [/violates check constraint|violates not-null|null value in column|invalid input syntax|23514|23502|22P02/i, 'Girilen değerlerden biri geçersiz; alanları kontrol edin.'],
    [/rate limit|Too many requests/i, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.']
  ];

  const GENEL = 'İşlem tamamlanamadı.';

  function teknikMi(metin) {
    return TEKNIK.some(r => r.test(metin));
  }

  function anlasilir(metin) {
    const bulunan = ESLEME.find(([r]) => r.test(metin));
    return bulunan ? bulunan[1] : GENEL;
  }

  function yeniKod() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  /**
   * Kullaniciya gosterilecek metin. Teknik ayrinti yoksa metin DEGISMEZ.
   * Varsa: uygulamanin on eki (ilk ": "ye kadar olan Turkce cumle) korunur,
   * teknik kuyruk anlasilir cumleyle degisir ve basvuru kodu eklenir.
   * Ayrinti `log` ile (varsayilan console.error) kodla birlikte yazilir.
   */
  function sanitizeUserMessage(ham, opts) {
    const o = opts || {};
    if (ham === null || ham === undefined) return ham;
    const metin = String(ham);
    if (!teknikMi(metin)) return metin;
    const kod = (o.newCode || yeniKod)();
    const log = o.log || ((...a) => { if (typeof console !== 'undefined') console.error(...a); });
    log(`[Lexbnb hata ${kod}]`, metin);
    // Teknik parcanin basladigi yerden onceki son ": " — uygulamanin kendi cumlesi.
    const ilkTeknik = Math.min(...TEKNIK.map(r => { const m = metin.match(r); return m ? m.index : Infinity; }));
    const onEkSonu = metin.lastIndexOf(': ', ilkTeknik);
    const onEk = onEkSonu > 0 ? metin.slice(0, onEkSonu).trim() : '';
    const govde = anlasilir(metin);
    return `${onEk ? onEk + ': ' : ''}${govde} (Hata kodu: ${kod})`;
  }

  /**
   * Yakalanmamis hata kullaniciya gosterilmeli mi? Tarayici eklentilerinin ve
   * zararsiz tarayici uyarilarinin (ResizeObserver) ekrani doldurmasini
   * onler; ayni kod 10 sn icinde bir kez gosterilir.
   */
  function createGlobalErrorGate(nowFn, origin) {
    const simdi = nowFn || (() => Date.now());
    let son = -Infinity;
    return function gecsinMi(olay) {
      const mesaj = String((olay && (olay.message || (olay.reason && (olay.reason.message || olay.reason)))) || '');
      if (/ResizeObserver loop/i.test(mesaj)) return false;
      const dosya = String((olay && olay.filename) || '');
      if (dosya && /^(chrome|moz|safari)-extension:/i.test(dosya)) return false;
      if (dosya && origin && !dosya.startsWith(origin)) return false;
      const t = simdi();
      if (t - son < 10000) return false;
      son = t;
      return true;
    };
  }

  return { sanitizeUserMessage, createGlobalErrorGate, isTechnical: teknikMi, GENERIC_MESSAGE: GENEL };
}));
