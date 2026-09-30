// =============================================================================
// LEXBNB ORTAK DETAY PANELI (A1-G2, 30 Eylul 2026)
// =============================================================================
//
// Kullanici karari (ENVANTER Mulkler, 27.09.2026): "Acilis deseni: mobilde en
// iyi calisan desen secilir, masaustu ona uyar — masaustunde sagdan kayan
// panel, mobilde tam ekran sayfa. Rezervasyon detayi ayni deseni kullanir."
// Rezervasyon (A2-G6), mulk profili (A4-G2) ve misafir detayi (A4-G1) bu TEK
// bilesenle acilir; her ekran kendi penceresini yazmaz.
//
// Sozlesme:
//   SidePanel.open({ title, subtitle?, bodyHtml, footerHtml?, ariaLabel?, onClose? })
//     -> { body, footer, close }     (ikinci open icerigi degistirir, tek panel)
//   SidePanel.close()                (Esc, arka plan tiklamasi ve X de kapatir)
//   SidePanel.isOpen()
//
// `bodyHtml` / `footerHtml` HAZIR HTML'dir: kullanici verisini cagiran taraf
// escapeHtml ile kacislar (CLAUDE.md 7, L-15). Baslik ve alt baslik metin
// olarak yazilir (textContent), kacis gerekmez.
//
// Erisilebilirlik: role="dialog" + aria-modal, baslik aria-labelledby ile
// bagli, acilinca odak kapat dugmesine gelir, Tab panelin icinde doner,
// kapaninca odak panel acilmadan onceki elemana doner, sayfa kaydirmasi kilitlenir.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SidePanel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let seq = 0;
  let current = null; // { doc, backdrop, panel, titleEl, subtitleEl, body, footer, closeBtn, opener, onClose, onKey }

  function build(doc) {
    const backdrop = doc.createElement('div');
    backdrop.className = 'side-panel-backdrop';
    backdrop.setAttribute('data-side-panel-backdrop', '');

    const panel = doc.createElement('aside');
    panel.className = 'side-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const titleId = `sidePanelTitle${++seq}`;
    panel.setAttribute('aria-labelledby', titleId);

    const header = doc.createElement('header');
    header.className = 'side-panel-header';
    const heading = doc.createElement('div');
    heading.className = 'side-panel-heading';
    const titleEl = doc.createElement('h2');
    titleEl.className = 'side-panel-title';
    titleEl.id = titleId;
    const subtitleEl = doc.createElement('p');
    subtitleEl.className = 'side-panel-subtitle';
    heading.appendChild(titleEl);
    heading.appendChild(subtitleEl);
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'side-panel-close';
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.textContent = '×';
    header.appendChild(heading);
    header.appendChild(closeBtn);

    const body = doc.createElement('div');
    body.className = 'side-panel-body';
    const footer = doc.createElement('footer');
    footer.className = 'side-panel-footer';

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    return { backdrop, panel, titleEl, subtitleEl, body, footer, closeBtn };
  }

  function focusables(panel) {
    if (!panel || typeof panel.querySelectorAll !== 'function') return [];
    return Array.from(panel.querySelectorAll(FOCUSABLE));
  }

  function close() {
    if (!current) return false;
    const c = current;
    current = null;
    c.doc.removeEventListener('keydown', c.onKey);
    if (c.backdrop.parentNode) c.backdrop.parentNode.removeChild(c.backdrop);
    if (c.panel.parentNode) c.panel.parentNode.removeChild(c.panel);
    if (c.doc.body && c.doc.body.classList) c.doc.body.classList.remove('side-panel-open');
    if (c.opener && typeof c.opener.focus === 'function') c.opener.focus();
    if (typeof c.onClose === 'function') c.onClose();
    return true;
  }

  function open(options, docOverride) {
    const o = options || {};
    const doc = docOverride || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.body) return null;

    // Tek panel: aciksa icerigini degistir, odak ve acan eleman korunur.
    if (!current) {
      const parts = build(doc);
      const onKey = event => {
        if (!current) return;
        if (event.key === 'Escape') { event.preventDefault && event.preventDefault(); close(); return; }
        if (event.key === 'Tab') {
          const list = focusables(current.panel);
          if (!list.length) return;
          const first = list[0];
          const last = list[list.length - 1];
          if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      };
      parts.closeBtn.addEventListener('click', () => close());
      parts.backdrop.addEventListener('click', () => close());
      doc.body.appendChild(parts.backdrop);
      doc.body.appendChild(parts.panel);
      if (doc.body.classList) doc.body.classList.add('side-panel-open');
      doc.addEventListener('keydown', onKey);
      current = { doc, ...parts, opener: doc.activeElement || null, onKey, onClose: null };
    }

    current.onClose = typeof o.onClose === 'function' ? o.onClose : null;
    current.titleEl.textContent = o.title || '';
    current.subtitleEl.textContent = o.subtitle || '';
    current.subtitleEl.hidden = !o.subtitle;
    if (o.ariaLabel) current.panel.setAttribute('aria-label', o.ariaLabel);
    current.body.innerHTML = o.bodyHtml || '';
    current.footer.innerHTML = o.footerHtml || '';
    current.footer.hidden = !o.footerHtml;
    if (typeof current.closeBtn.focus === 'function') current.closeBtn.focus();

    return { body: current.body, footer: current.footer, close };
  }

  function isOpen() { return !!current; }

  return { open, close, isOpen };
}));
