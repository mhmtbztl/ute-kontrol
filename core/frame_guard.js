/**
 * LEXBNB — CERCEVE KORUMASI (clickjacking, L-18)
 *
 * GitHub Pages yanit basligi gondermiyor; `X-Frame-Options` ve CSP
 * `frame-ancestors` ise <meta> icinde tarayici tarafindan YOK SAYILIR. Bu
 * yuzden baska bir site uygulamayi gorunmez bir iframe'e gomup kullaniciya
 * dugme tiklatabilirdi. Kalici cozum basligi veren bir on katman
 * (Cloudflare) — o gelene kadar bu betik:
 *
 *   - sayfa baska bir kokenin cercevesindeyse belgeyi gizler (tiklanacak
 *     bir sey kalmaz) ve ust pencereyi uygulamaya yonlendirmeyi dener;
 *   - ayni kokenden cerceve (ornegin kendi onizlememiz) serbesttir.
 *
 * <head> icinde, diger her betikten ONCE ve senkron yuklenir.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') api.apply(window);
}(this, function () {
  function isForeignFrame(win) {
    if (win.top === win.self) return false;
    try {
      // Ayni koken: top.location okunabilir. Farkli koken: SecurityError.
      return win.top.location.origin !== win.location.origin;
    } catch (_) {
      return true;
    }
  }

  function apply(win) {
    if (!isForeignFrame(win)) return false;
    const doc = win.document;
    if (doc && doc.documentElement) doc.documentElement.style.display = 'none';
    try { win.top.location = win.self.location.href; } catch (_) { /* sandbox: gizli kalir */ }
    return true;
  }

  return { isForeignFrame, apply };
}));
