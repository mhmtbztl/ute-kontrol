/**
 * LEXBNB — SATIR ICI ISLEYICI YERINE OLAY YETKILENDIRICISI (L-15 adim 3)
 *
 * Arayuz eskiden satir ici `on<olay>` isleyicisi kullaniyordu. Satir ici isleyici, sayfanin
 * guvenlik politikasinda (CSP) `script-src 'unsafe-inline'` ister ve o izin
 * acik oldukca enjekte edilen her `on*` ozniteligi KOD olarak calisir.
 *
 * Yeni model: ozniteligin adi `data-on<olay>` olur, govdesi ayni kalir:
 *
 *   <button data-onclick="editExpense(decodeURIComponent('${encodeActionArg(id)}'))">
 *
 * Govde CALISTIRILMAZ, AYRISTIRILIR. Kabul edilen dil bilerek kucuktur:
 *   ifade   := adim (';' adim)* ';'?
 *   adim    := AD '(' [arg (',' arg)*] ')'  |  'return false'
 *            | 'event.stopPropagation()'    |  'event.preventDefault()'
 *   arg     := 'dize' | sayi | true | false | null
 *            | event | this | this.value | this.checked
 *            | decodeURIComponent('dize')
 * AD, asagidaki EYLEMLER listesinde olmak zorundadir. Ozellik erisimi
 * (window.x, document.cookie), atama, birlestirme (+), ic ice cagri — hicbiri
 * ayristirilamaz; ayristirilamayan govde hic calismaz.
 *
 * Satir ici isleyicinin anlami korunur: `this` isleyicinin ogesi, `event`
 * gercek olay; isleyici calisirken `event.currentTarget` o ogedir;
 * stopPropagation ust ogelerin (ve sonra kaydedilmis belge dinleyicilerinin)
 * isleyicisini durdurur; `return false` varsayilan davranisi engeller.
 *
 * Bu dosya app.js'ten ONCE yuklenmelidir: belge dinleyicisi app.js'in kendi
 * belge dinleyicilerinden once kaydolmali ki stopPropagation onlari da
 * durdurabilsin (satir ici isleyici belge dinleyicilerinden once calisirdi).
 */
(function (kok) {
  'use strict';

  const OLAYLAR = ['click', 'change', 'input', 'submit', 'keydown'];

  // Arayuzden cagrilabilen fonksiyonlarin TAMAMI. Yeni bir dugme eklerken
  // fonksiyonu buraya ekleyin; html_injection_tests listede olmayan, tanimsiz
  // ya da artik kullanilmayan adi yakalar.
  const EYLEMLER = new Set([
    'applyImportedData', 'askExecutiveAdvisor', 'autoCalculateGoalAdr',
    'autoCalculateGoalSubmetrics', 'calculateLivePreview', 'changeImportMode', 'cleanResetAll',
    'clearResDateRange', 'closeAiActionConfirmModal', 'closeAllHeaderDropdowns',
    'closeBookingModal', 'closeCleaningTaskModal', 'closeDeleteAccountModal', 'closeExpenseModal',
    'closeGoalsModal', 'closeGuestProfileModal', 'closeHelpModal', 'closeImportModal',
    'closeInfluencerModal', 'closeInviteMemberModal', 'closeKpiExplanationModal', 'closeLeadModal',
    'closeMaintModal', 'closeMarketingModal', 'closeMonthCloseModal', 'closeMonthReopenModal',
    'closeOnboardingModal', 'closePropertyModal', 'closeResetModal', 'closeWhatsAppModal',
    'confirmUserNotification', 'convertLeadAction', 'copyAiTitle', 'copyAnalysisPrompt',
    'copyGapStoryText', 'createBookingChannelFromSettings', 'cycleHkStatus', 'deleteBookingUI',
    'deleteCleaningTask', 'deleteCleaningTaskFromModal', 'deleteExpenseUI',
    'deleteInfluencerCollab', 'deleteLeadUI', 'deleteMaint', 'deleteMarketingCampaign',
    'downloadAnalysisJson', 'downloadSampleTemplate', 'editBooking', 'editExpense', 'editLead',
    'editMaint', 'exportLedger', 'exportTrajectoryReport', 'filterByPeriod', 'filterByVilla',
    'filterExpensesByCategory', 'filterHelpGlossary', 'generateAnalysisExport',
    'handleAiAdvisorSubmit', 'handleBookingChannelChange', 'handleBookingDeleteFromModal',
    'handleCommandPaletteKeydown', 'handleCommandPaletteSearch', 'handleFileImport',
    'handleFilterChange', 'handleOnboardingSubmit', 'handlePropertyDeleteFromModal',
    'handleQuickActionTrigger', 'handleSaaSForgotPassword', 'handleSaaSLogin',
    'handleSaaSNewPassword', 'handleSaaSRegister', 'loadSampleWhatsAppMsg',
    'loadSelectedPeriodGoal', 'logoutSaaSUser', 'markAllNotificationsAsRead', 'markCleaningDone',
    'markCleaningPlanned', 'markCleaningSkipped', 'markSelectedCleaningDone',
    'openAiActionConfirmModal', 'openBookingForDate', 'openBookingFromGuestProfile',
    'openBookingModal', 'openCommandPalette', 'openDeleteAccountModal',
    'openEditCleaningTaskModal', 'openExcelFilePicker', 'openExpenseModal', 'openGoalsModal',
    'openGuestProfileModal', 'openGuestRebookingWhatsApp', 'openHelpModal', 'openImportModal',
    'openInfluencerModal', 'openInviteMemberModal', 'openLeadModal', 'openMaintModal',
    'openMarketingModal', 'openMonthCloseModal', 'openMonthReopenModal',
    'openNewCleaningTaskModal', 'openPropertyModal', 'openPropertyOtaManager', 'openResetModal',
    'openTabFromDeepLink', 'openWhatsAppModal', 'parseWhatsAppMessage', 'payAllPendingCleaning',
    'promptEditTaskAmount', 'refreshExecutiveDashboardSnapshot', 'reloadPage', 'renderAll',
    'renderExpensesTable', 'renderHousekeepingTab', 'renderManageBookingsTable',
    'renderManageLeadsTable', 'renderPropertyComparisonChart', 'resetGuestDirectoryDateRange',
    'resetImportPreview', 'resetSimulator', 'runWhatIfSimulation', 'saveAllSettings',
    'saveBooking', 'saveBookingChannelRow', 'saveCleaningTask', 'saveExpense', 'saveGuestProfile',
    'saveInfluencerCollab', 'saveLead', 'saveMaint', 'saveMarketingCampaign', 'saveMonthlyGoals',
    'saveOperatorNote', 'saveProperty', 'saveWaAsBooking', 'saveWaAsLead',
    'sendGuestLoyaltyMessage', 'setBookingChannelActive', 'setCriticUrlPreset',
    'setGuestDirectoryDateRange', 'setGuestDirectoryPage', 'setGuestDirectoryProperty',
    'setGuestDirectoryQuery', 'setGuestDirectorySegment', 'setGuestDirectorySort',
    'setGuestDirectorySortDirection', 'setKpiTrackerMetric', 'setLargeTablePage',
    'setPropViewMode', 'setPropertySalesReadiness', 'setTapeChartMonth', 'setTrendRange',
    'shareGapWhatsApp', 'shiftResCalendar', 'showForgotPasswordForm', 'showKpiExplanation',
    'stepMonth', 'stepTapeChartMonth', 'submitAccountDeletion', 'submitMemberInvite',
    'submitMonthClose', 'submitMonthReopen', 'switchActiveTenant', 'switchAuthTab',
    'switchHelpTab', 'switchTab', 'switchWaModalTab', 'syncCommissionFromRate',
    'syncLiveAirbnbData', 'syncRateFromCommission', 'toggleAnalysisProperties',
    'toggleBookingChannelRowRate', 'toggleExportMenu', 'toggleHeaderDropdown',
    'toggleNewBookingChannelRate', 'toggleNotificationDrawer', 'toggleResDatePicker',
    'toggleTaskPaid', 'undoImportBatch', 'updateDeleteAccountButton', 'updateInviteRoleHint',
    'updateMonthReopenButton', 'updateResetButton'
  ]);

  // encodeURIComponent tek tirnagi ve parantezleri KODLAMAZ: "O'Brien" ile
  // `decodeURIComponent('O'Brien')` dizeyi kirar. Isleyici argumani bu
  // yardimciyla kodlanir; cikti yalniz [A-Za-z0-9_.~%-] icerir.
  function encodeActionArg(deger) {
    return encodeURIComponent(String(deger == null ? '' : deger))
      .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  const KIMLIK = /^[A-Za-z_$][\w$]*/;
  const SAYI = /^-?\d+(?:\.\d+)?/;
  const SABIT_ADIMLAR = [
    ['return false', { tur: 'engelle' }],
    ['event.preventDefault()', { tur: 'engelle' }],
    ['event.stopPropagation()', { tur: 'durdur' }]
  ];
  const SABIT_ARGLAR = [
    ['this.checked', { tur: 'checked' }],
    ['this.value', { tur: 'value' }],
    ['this', { tur: 'oge' }],
    ['event', { tur: 'olay' }],
    ['true', { tur: 'sabit', deger: true }],
    ['false', { tur: 'sabit', deger: false }],
    ['null', { tur: 'sabit', deger: null }]
  ];

  /**
   * Govdeyi adimlara ayirir. Gecersizse { hata } doner; asla fonksiyon cagirmaz.
   * @returns {{adimlar: Array<object>} | {hata: string}}
   */
  function parseAction(kaynak) {
    const s = String(kaynak == null ? '' : kaynak);
    let i = 0;
    const bosluk = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const bak = (metin) => s.startsWith(metin, i);
    const sonrakiKimlikDegil = (uzunluk) => !/[\w$.]/.test(s[i + uzunluk] || '');

    function dize() {
      if (s[i] !== "'") return null;
      const son = s.indexOf("'", i + 1);
      if (son < 0) throw new Error('kapanmamis dize');
      const deger = s.slice(i + 1, son);
      if (deger.includes('\\')) throw new Error('dizede kacis karakteri');
      i = son + 1;
      return deger;
    }

    function arg() {
      bosluk();
      const d = dize();
      if (d !== null) return { tur: 'sabit', deger: d };
      if (bak('decodeURIComponent(')) {
        i += 'decodeURIComponent('.length;
        bosluk();
        const ham = dize();
        if (ham === null) throw new Error('decodeURIComponent yalniz dize alir');
        bosluk();
        if (s[i] !== ')') throw new Error('decodeURIComponent kapanmadi');
        i++;
        return { tur: 'sabit', deger: decodeURIComponent(ham) };
      }
      const sayi = s.slice(i).match(SAYI);
      if (sayi && sonrakiKimlikDegil(sayi[0].length)) {
        i += sayi[0].length;
        return { tur: 'sabit', deger: Number(sayi[0]) };
      }
      for (const [metin, dugum] of SABIT_ARGLAR) {
        if (bak(metin) && sonrakiKimlikDegil(metin.length)) { i += metin.length; return dugum; }
      }
      throw new Error(`gecersiz arguman: ${s.slice(i, i + 20)}`);
    }

    function adim() {
      bosluk();
      for (const [metin, dugum] of SABIT_ADIMLAR) {
        if (bak(metin) && sonrakiKimlikDegil(metin.length)) { i += metin.length; return dugum; }
      }
      const ad = s.slice(i).match(KIMLIK);
      if (!ad) throw new Error(`gecersiz adim: ${s.slice(i, i + 20)}`);
      i += ad[0].length;
      if (!EYLEMLER.has(ad[0])) throw new Error(`izinli olmayan eylem: ${ad[0]}`);
      bosluk();
      if (s[i] !== '(') throw new Error(`${ad[0]} cagrilmiyor`);
      i++;
      const argumanlar = [];
      bosluk();
      if (s[i] === ')') { i++; return { tur: 'cagri', ad: ad[0], argumanlar }; }
      for (;;) {
        argumanlar.push(arg());
        bosluk();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ')') { i++; return { tur: 'cagri', ad: ad[0], argumanlar }; }
        throw new Error(`${ad[0]} argumanlari kapanmadi`);
      }
    }

    try {
      const adimlar = [];
      bosluk();
      while (i < s.length) {
        adimlar.push(adim());
        bosluk();
        if (i < s.length) {
          if (s[i] !== ';') throw new Error(`beklenmeyen karakter: ${s[i]}`);
          i++;
          bosluk();
        }
      }
      if (!adimlar.length) return { hata: 'bos govde' };
      return { adimlar };
    } catch (e) {
      return { hata: e.message };
    }
  }

  const onbellek = new Map();
  function ayristirOnbellekli(kaynak) {
    let sonuc = onbellek.get(kaynak);
    if (!sonuc) {
      sonuc = parseAction(kaynak);
      if (onbellek.size > 2000) onbellek.clear();
      onbellek.set(kaynak, sonuc);
    }
    return sonuc;
  }

  function argumanDegeri(a, oge, olay) {
    switch (a.tur) {
      case 'sabit': return a.deger;
      case 'oge': return oge;
      case 'olay': return olay;
      case 'value': return oge.value;
      case 'checked': return oge.checked;
      default: return undefined;
    }
  }

  function hataBildir(hata) {
    if (typeof kok.reportError === 'function') kok.reportError(hata);
    else setTimeout(() => { throw hata; }, 0);
  }

  /** Ogenin govdesini calistirir. Satir ici isleyici gibi ilk hatada zincir durur. */
  function runAction(oge, olay, kaynak, fonksiyonBul) {
    const sonuc = ayristirOnbellekli(kaynak);
    if (sonuc.hata) {
      if (kok.console) kok.console.warn(`[LexbnbActions] ${sonuc.hata} — "${String(kaynak).slice(0, 80)}"`);
      // Cozumlenemeyen gonderim formu sayfayi (sifre alanlariyla birlikte)
      // URL'ye gondermesin.
      if (olay && olay.type === 'submit' && olay.preventDefault) olay.preventDefault();
      return false;
    }
    const bul = fonksiyonBul || (ad => kok[ad]);
    for (const a of sonuc.adimlar) {
      if (a.tur === 'engelle') { if (olay && olay.preventDefault) olay.preventDefault(); continue; }
      if (a.tur === 'durdur') { if (olay && olay.stopPropagation) olay.stopPropagation(); continue; }
      const fn = bul(a.ad);
      if (typeof fn !== 'function') {
        if (kok.console) kok.console.warn(`[LexbnbActions] tanimsiz eylem: ${a.ad}`);
        if (olay && olay.type === 'submit' && olay.preventDefault) olay.preventDefault();
        return false;
      }
      try {
        fn.apply(undefined, a.argumanlar.map(x => argumanDegeri(x, oge, olay)));
      } catch (hata) {
        hataBildir(hata);
        return false;
      }
    }
    return true;
  }

  function currentTargetSabitle(olay, oge) {
    try {
      Object.defineProperty(olay, 'currentTarget', { configurable: true, get: () => oge });
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Belge duzeyindeki tek dinleyici: hedeften yukari dogru data-on<olay> ogelerini calistirir. */
  function dispatch(olay, belge) {
    const oznitelik = 'data-on' + olay.type;
    let oge = olay.target;
    if (oge && oge.nodeType !== 1) oge = oge.parentElement;
    while (oge && oge !== belge && oge.nodeType === 1) {
      if (oge.hasAttribute(oznitelik)) {
        const sabitlendi = currentTargetSabitle(olay, oge);
        try {
          runAction(oge, olay, oge.getAttribute(oznitelik));
        } finally {
          if (sabitlendi) delete olay.currentTarget;
        }
        if (olay.cancelBubble) {
          // Satir ici isleyicide stopPropagation belge dinleyicilerini de
          // durdururdu; bu dinleyici ilk kaydolan oldugu icin ayni etki.
          if (olay.stopImmediatePropagation) olay.stopImmediatePropagation();
          return;
        }
      }
      oge = oge.parentElement;
    }
  }

  function install(belge) {
    if (!belge || typeof belge.addEventListener !== 'function' || belge.__lexbnbActions) return false;
    OLAYLAR.forEach(tur => belge.addEventListener(tur, olay => dispatch(olay, belge)));
    belge.__lexbnbActions = true;
    return true;
  }

  const api = { EYLEMLER, OLAYLAR, encodeActionArg, parseAction, runAction, dispatch, install };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  kok.LexbnbActions = api;
  if (typeof document !== 'undefined') install(document);
})(typeof window !== 'undefined' ? window : globalThis);
