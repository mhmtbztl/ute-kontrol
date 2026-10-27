// =============================================================================
// LEXBNB — KISI BAZINDA IZIN MATRISI (L-211, phase107)
// Rol baslangic paketidir; isletme sahibi her uyenin satis, finans ve
// operasyon izinlerini ayri ayri acar/kapatir. Sunucu karsiligi
// fn_permission_default + fn_member_capability (phase107); varsayilan tablo
// AYNI olmak zorunda — permission_matrix_tests goc metnini okuyup karsilastirir.
// Arayuzde gizleme kolayliktir; guvenlik siniri sunucudadir.
// =============================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PermissionMatrix = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PERMISSIONS = [
    { key: 'sales.read', label: 'Satış verisini görür', hint: 'Rezervasyon, talep, misafir ve fiyat takvimi.' },
    { key: 'sales.write', label: 'Satış kaydı yapar', hint: 'Rezervasyon, talep ve misafir girer, düzenler. Satış verisini görmeyi de açar.' },
    { key: 'ledger.read', label: 'Finans defterini görür', hint: 'Finans sekmesi, giderler, gelirler, kâr ve raporlar.' },
    { key: 'ledger.write', label: 'Finans kaydı yapar', hint: 'Gider ve gelir girer, ay kapatır, aktarım geri alır. Finans defterini görmeyi de açar.' },
    { key: 'operations.manage', label: 'Operasyonu yönetir', hint: 'Temizlik, arıza, görev, saha ekibi ve kontrol listeleri.' }
  ];

  // Sunucudaki fn_permission_default ile birebir (phase107).
  const DEFAULTS = {
    'sales.read': ['owner', 'admin', 'manager', 'sales', 'viewer'],
    'sales.write': ['owner', 'admin', 'manager', 'sales'],
    'ledger.read': ['owner', 'admin', 'manager', 'viewer'],
    'ledger.write': ['owner', 'admin', 'manager'],
    'operations.manage': ['owner', 'admin', 'manager']
  };

  function defaultFor(role, permission) {
    return (DEFAULTS[permission] || []).includes(role);
  }

  // Uyenin tek bir izni: sahip her zaman, sonra kisi bazindaki kayit, sonra rol.
  function granted(role, permission, overrides) {
    if (!role) return false;
    if (role === 'owner') return true;
    const o = overrides && Object.prototype.hasOwnProperty.call(overrides, permission) ? overrides[permission] : null;
    return typeof o === 'boolean' ? o : defaultFor(role, permission);
  }

  // Yetki: yazma okumayi icerir (sunucudaki can_read_* ile ayni).
  function allows(role, capability, overrides) {
    if (capability === 'sales.read') return granted(role, 'sales.read', overrides) || granted(role, 'sales.write', overrides);
    if (capability === 'ledger.read') return granted(role, 'ledger.read', overrides) || granted(role, 'ledger.write', overrides);
    return granted(role, capability, overrides);
  }

  function effectiveAll(role, overrides) {
    return Object.fromEntries(PERMISSIONS.map(p => [p.key, allows(role, p.key, overrides)]));
  }

  // Penceredeki secim -> sunucuya gidecek istek. Varsayilana esit olan
  // izin null gider (kisi bazindaki kayit kalkar). Yazma okumayi icerir.
  function requestFromSelection(role, secim) {
    // Sira sunucuyla ayni (set_member_permissions): once okuma kapanirsa yazma
    // kapanir, sonra acik yazma okumayi acar.
    // Secimde olmayan izin rol varsayilanidir (kapali sayilmaz).
    const s = Object.fromEntries(PERMISSIONS.map(p => [p.key, typeof (secim || {})[p.key] === 'boolean' ? secim[p.key] : defaultFor(role, p.key)]));
    if ((secim || {})['sales.read'] === false) s['sales.write'] = false;
    if ((secim || {})['ledger.read'] === false) s['ledger.write'] = false;
    if (s['sales.write']) s['sales.read'] = true;
    if (s['ledger.write']) s['ledger.read'] = true;
    return Object.fromEntries(PERMISSIONS.map(p => [p.key, s[p.key] === defaultFor(role, p.key) ? null : !!s[p.key]]));
  }

  // Satirlardan ({permission, granted}) kisi bazindaki kayit nesnesi.
  function overridesFromRows(rows) {
    const out = {};
    (rows || []).forEach(r => { if (r && typeof r.granted === 'boolean' && DEFAULTS[r.permission]) out[r.permission] = r.granted; });
    return out;
  }

  return { PERMISSIONS, DEFAULTS, defaultFor, granted, allows, effectiveAll, requestFromSelection, overridesFromRows };
});
