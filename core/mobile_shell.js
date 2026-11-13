'use strict';

// Telefon kabuğu (mobil uyum, PR 1, 09.11.2026).
//
// Telefonda (<=640 px) üst sekme şeridi yerine alt gezinme çubuğu, dönem ve
// mülk seçimi tek düğmeye katlanmış üst bar. Bu modül YALNIZ görünür olanı
// eşler: hangi sekmenin görüneceğine karar vermez. Kaynak, rol kapısının
// (applyRoleNavigationVisibility) zaten gizlediği `.nav-tabs .tab-btn`
// düğmeleridir; burada ikinci bir rol listesi yazılmaz (CLAUDE.md §3.3.1).
// Görünüm CSS'tedir: masaüstünde çubuk ve düğme hiç görünmez.

(function (kok) {
  // Alt çubuğa sabitlenen sekmeler; kalanı "Daha fazla" sayfasındadır.
  const CUBUK_SEKMELERI = ['executive', 'reservations', 'operations', 'finance'];

  function belgeAl(belge) {
    return belge || (typeof document !== 'undefined' ? document : null);
  }

  function sekmeAdi(dugme) {
    const m = String(dugme.getAttribute('data-onclick') || '').match(/^switchTab\('([^']+)'\)$/);
    return m ? m[1] : null;
  }

  // Menüdeki sekmeler, rol kapısından geçtikten sonraki hâliyle.
  function menuSekmeleri(belge) {
    const nav = belge.querySelector('.nav-tabs');
    if (!nav || nav.hidden) return [];
    return Array.from(nav.querySelectorAll('.tab-btn'))
      .map(dugme => ({ dugme, sekme: sekmeAdi(dugme) }))
      .filter(x => x.sekme && !x.dugme.hidden);
  }

  // Menü düğmesinin metni: simge ve sayaç rozetiyle birlikte ("🤝 Misafirler ve Satış (3)").
  function dugmeMetni(dugme) {
    return String(dugme.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function secenekMetni(select) {
    if (!select) return '';
    const secili = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    return secili ? String(secili.textContent || '').trim() : '';
  }

  // Üst bardaki dönem düğmesinin yazısı: "Kasım 2026 · Tüm Villalar / Portföy".
  function filtreOzeti(belge) {
    const donem = secenekMetni(belge.getElementById('globalPeriodFilter'));
    const mulk = secenekMetni(belge.getElementById('globalVillaFilter'));
    return [donem, mulk].filter(Boolean).join(' · ') || '—';
  }

  function cubuguEsle(belge, sekmeler, aktif) {
    const cubuk = belge.getElementById('mobileTabbar');
    if (!cubuk) return;
    const gorunen = new Set(sekmeler.map(x => x.sekme));
    cubuk.hidden = sekmeler.length < 2;
    let cubuktaAktif = false;
    Array.from(cubuk.querySelectorAll('[data-mobile-tab]')).forEach(dugme => {
      const sekme = dugme.getAttribute('data-mobile-tab');
      if (sekme === 'more') return;
      dugme.hidden = !gorunen.has(sekme);
      const secili = sekme === aktif;
      if (secili) cubuktaAktif = true;
      dugme.classList.toggle('active', secili);
      if (secili) dugme.setAttribute('aria-current', 'page');
      else dugme.removeAttribute('aria-current');
    });
    const dahaFazla = cubuk.querySelector('[data-mobile-tab="more"]');
    if (dahaFazla) {
      const fazlaSekme = sekmeler.some(x => !CUBUK_SEKMELERI.includes(x.sekme));
      dahaFazla.classList.toggle('active', !!aktif && !cubuktaAktif && fazlaSekme);
    }
  }

  // "Daha fazla" sayfasının listesi: çubukta olmayan görünen sekmeler.
  function dahaFazlaListesi(belge, sekmeler, aktif) {
    const liste = belge.getElementById('mobileMoreList');
    if (!liste) return;
    while (liste.firstChild) liste.removeChild(liste.firstChild);
    sekmeler.filter(x => !CUBUK_SEKMELERI.includes(x.sekme)).forEach(x => {
      const dugme = belge.createElement('button');
      dugme.type = 'button';
      dugme.className = 'mobile-more-item' + (x.sekme === aktif ? ' active' : '');
      dugme.setAttribute('data-onclick', `switchTab('${x.sekme}'); closeMobileMoreSheet()`);
      if (x.sekme === aktif) dugme.setAttribute('aria-current', 'page');
      dugme.textContent = dugmeMetni(x.dugme);
      liste.appendChild(dugme);
    });
  }

  function filtreDugmesiniEsle(belge) {
    const cip = belge.getElementById('mobileFilterChip');
    const bar = belge.getElementById('globalFilterBar');
    if (!cip || !bar) return;
    cip.hidden = !!bar.hidden;
    const yazi = belge.getElementById('mobileFilterChipText');
    if (yazi) yazi.textContent = filtreOzeti(belge);
    const acik = !!(belge.body && belge.body.classList.contains('mobile-filters-open'));
    cip.setAttribute('aria-expanded', acik && !bar.hidden ? 'true' : 'false');
  }

  // Tek giriş noktası: sekme değişince, rol kapısından sonra ve filtre
  // değişince çağrılır. Yan etkisi yalnız bu modülün öğeleridir.
  function syncMobileShell(belgeArg) {
    const belge = belgeAl(belgeArg);
    if (!belge || typeof belge.getElementById !== 'function') return;
    const sekmeler = menuSekmeleri(belge);
    const aktifDugme = belge.querySelector('.nav-tabs .tab-btn.active');
    const aktif = aktifDugme ? sekmeAdi(aktifDugme) : null;
    cubuguEsle(belge, sekmeler, aktif);
    dahaFazlaListesi(belge, sekmeler, aktif);
    filtreDugmesiniEsle(belge);
  }

  function openMobileMoreSheet() {
    const belge = belgeAl();
    if (!belge) return;
    syncMobileShell(belge);
    const sayfa = belge.getElementById('mobileMoreSheet');
    if (sayfa) sayfa.classList.add('active');
  }

  function closeMobileMoreSheet() {
    const belge = belgeAl();
    const sayfa = belge && belge.getElementById('mobileMoreSheet');
    if (sayfa) sayfa.classList.remove('active');
  }

  function toggleMobileFilters() {
    const belge = belgeAl();
    if (!belge || !belge.body) return;
    belge.body.classList.toggle('mobile-filters-open');
    filtreDugmesiniEsle(belge);
  }

  // Telefonda kart moduna dönen tablolar (`table.mobile-cards`): her hücreye
  // sütun adını başlıktan `data-label` olarak yazar; CSS etiketi `td::before`
  // ile gösterir. Satırları çizen fonksiyonlara dokunmadan çalışır: tbody her
  // yeniden çizildiğinde gözlemci etiketleri tazeler. Var olan etiket ezilmez.
  function tabloyuEtiketle(tablo) {
    if (!tablo || !tablo.querySelectorAll) return 0;
    const basliklar = Array.from(tablo.querySelectorAll(':scope > thead > tr > th')).map(th => String(th.textContent || '').replace(/\s+/g, ' ').trim());
    let sayi = 0;
    Array.from(tablo.querySelectorAll(':scope > tbody > tr')).forEach(tr => {
      let sutun = 0;
      Array.from(tr.children).forEach(td => {
        const genislik = Number(td.getAttribute('colspan')) || 1;
        if (genislik === 1 && !td.getAttribute('data-label') && basliklar[sutun]) {
          td.setAttribute('data-label', basliklar[sutun]);
          sayi += 1;
        }
        sutun += genislik;
      });
    });
    return sayi;
  }

  function mobilTablolariIzle(belge) {
    belge = belgeAl(belge);
    if (!belge) return;
    Array.from(belge.querySelectorAll('table.mobile-cards')).forEach(tablo => {
      tabloyuEtiketle(tablo);
      const govde = tablo.querySelector('tbody');
      if (govde && typeof MutationObserver !== 'undefined' && !govde.__lxEtiketGozlemci) {
        govde.__lxEtiketGozlemci = new MutationObserver(() => tabloyuEtiketle(tablo));
        govde.__lxEtiketGozlemci.observe(govde, { childList: true });
      }
    });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mobilTablolariIzle(document));
    else mobilTablolariIzle(document);
  }

  const api = { CUBUK_SEKMELERI, filtreOzeti, menuSekmeleri, syncMobileShell, openMobileMoreSheet, closeMobileMoreSheet, toggleMobileFilters, tabloyuEtiketle, mobilTablolariIzle };
  // Düğmelerin çağırdığı adlar genel olmalı (core/action_dispatch.js EYLEMLER).
  if (typeof window !== 'undefined') {
    window.syncMobileShell = syncMobileShell;
    window.openMobileMoreSheet = openMobileMoreSheet;
    window.closeMobileMoreSheet = closeMobileMoreSheet;
    window.toggleMobileFilters = toggleMobileFilters;
  }
  kok.LexbnbMobileShell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
