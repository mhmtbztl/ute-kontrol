/**
 * LEXBNB — HTML ENJEKSIYONU KAYNAK TARAYICISI (L-15)
 *
 * HTML ureten her sablon metninde (`...<etiket...${ifade}...`) kullanici ya da
 * misafir verisi tasiyan ifadelerin kacislanip kacislanmadigini bulur.
 *
 * Kural: HTML sablonuna giren ve asagidaki veri alanlarindan birine dokunan
 * her `${...}` ifadesi su sarmalayicilardan biriyle baslamalidir:
 *   escapeHtml(...)          — metin ve oznitelik degeri
 *   encodeURIComponent(...)  — satir ici isleyicideki JS dizesi (decodeURIComponent ile okunur)
 *   kod(...)                 — ayni (yerel kisaltma)
 * Ic ice sablonlar (ternary icindeki `<span>...`) ayrica taranir.
 *
 * Sayi ve tarih bicimleyicileri (toLocaleString, formatTrDate, Math.round,
 * Number(...)) veri alani icerse bile guvenlidir; bunlar muaf tutulur.
 *
 * Bu bir sezgisel tarayicidir: YANLIS NEGATIF uretebilir (listede olmayan bir
 * alan adi), yanlis pozitifi ise `// guvenli-html:` yorumuyla degil, ifadeyi
 * sarmalayarak cozun — sarmalamak her zaman zararsizdir.
 */
const fs = require('fs');

// Kullanici / misafir / isletme tarafindan yazilabilen alan ve degisken adlari.
const VERI_ALANLARI = [
  'guest', 'guestName', 'guest_name', 'name', 'title', 'notes', 'note', 'description', 'desc',
  'cleaner', 'phone', 'email', 'category', 'company', 'companyName', 'company_name',
  'reason', 'message', 'text', 'channel', 'displayName', 'display_name', 'chName',
  'propertyName', 'vName', 'villaName', 'ad', 'misafir', 'baslik', 'aciklama', 'fullName',
  'full_name', 'assignee', 'assignedTo', 'assigned_to', 'source', 'code', 'slug', 'tags',
  'amenities', 'address', 'location', 'city', 'filename', 'fileName', 'label', 'lostReason',
  'lost_reason', 'status', 'body', 'content', 'firstName', 'lastName', 'first_name', 'last_name',
  'role', 'nickname', 'tenantName', 'tenant_name', 'operatorNote', 'cleanerName', 'reporter'
];

// Adi Html ile biten ya da guvenli ile baslayan yardimcilar kendi
// kacislarindan sorumludur (or. roleBadgeHtml, guvenliAd).
const GUVENLI_BASLANGIC = /^(?:escapeHtml|encodeURIComponent|kod|escapeAttr|[A-Za-z_$][\w$]*Html|guvenli[A-Z][\w$]*)\s*\(/;
const SAYISAL = /(?:toLocaleString|toFixed|formatTrDate|formatShortDate|formatPeriodLabel|getPeriodDisplayName|Math\.(?:round|abs|max|min|floor|ceil)|Number\s*\(|parseInt|parseFloat|\.length\b|money\s*\(|tl\s*\(|formatMoney|formatCurrency)/;

const alanRegex = new RegExp('(?:\\.|\\b)(' + VERI_ALANLARI.join('|') + ')\\b');

/** Kaynaktaki sablon metinlerini (ic ice dahil) cikarir. */
function sablonlar(kaynak) {
  const sonuc = [];
  let i = 0;
  const n = kaynak.length;
  // Basit durum makinesi: yorum, dize ve regex disindaki ` karakterleri.
  function sablonOku(bas) {
    // kaynak[bas] === '`'
    let j = bas + 1;
    const parcalar = [];
    let metin = '';
    while (j < n) {
      const c = kaynak[j];
      if (c === '\\') { metin += c + kaynak[j + 1]; j += 2; continue; }
      if (c === '`') { parcalar.push({ tur: 'metin', deger: metin }); return { son: j, parcalar }; }
      if (c === '$' && kaynak[j + 1] === '{') {
        parcalar.push({ tur: 'metin', deger: metin }); metin = '';
        // ${ ... } — dengeli parantez, ic sablonlari da atla
        let d = 1; let k = j + 2; let ifade = '';
        while (k < n && d > 0) {
          const ch = kaynak[k];
          if (ch === '`') {
            const ic = sablonOku(k);
            sonuc.push({ bas: k, parcalar: ic.parcalar });
            ifade += kaynak.slice(k, ic.son + 1);
            k = ic.son + 1; continue;
          }
          if (ch === "'" || ch === '"') {
            let m = k + 1;
            while (m < n && kaynak[m] !== ch) { if (kaynak[m] === '\\') m++; m++; }
            ifade += kaynak.slice(k, m + 1); k = m + 1; continue;
          }
          if (ch === '{') d++;
          else if (ch === '}') { d--; if (d === 0) break; }
          ifade += ch; k++;
        }
        parcalar.push({ tur: 'ifade', deger: ifade, konum: j });
        j = k + 1; continue;
      }
      metin += c; j++;
    }
    return { son: n, parcalar };
  }
  while (i < n) {
    const c = kaynak[i];
    if (c === '/' && kaynak[i + 1] === '/') { while (i < n && kaynak[i] !== '\n') i++; continue; }
    if (c === '/' && kaynak[i + 1] === '*') { const e = kaynak.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') {
      let m = i + 1;
      while (m < n && kaynak[m] !== c && kaynak[m] !== '\n') { if (kaynak[m] === '\\') m++; m++; }
      i = m + 1; continue;
    }
    if (c === '`') {
      const s = sablonOku(i);
      sonuc.push({ bas: i, parcalar: s.parcalar });
      i = s.son + 1; continue;
    }
    i++;
  }
  return sonuc;
}

function satirNo(kaynak, konum) {
  let s = 1;
  for (let i = 0; i < konum && i < kaynak.length; i++) if (kaynak[i] === '\n') s++;
  return s;
}

/**
 * @returns {Array<{satir:number, ifade:string}>} kacislanmamis veri ifadeleri
 */
function scan(kaynak) {
  const bulgular = [];
  sablonlar(kaynak).forEach(s => {
    const html = s.parcalar.filter(p => p.tur === 'metin').map(p => p.deger).join('');
    if (!/<[a-zA-Z]/.test(html)) return; // HTML uretmiyor
    let onceki = '';
    s.parcalar.forEach(p => {
      if (p.tur === 'metin') { onceki += p.deger; return; }
      const ifade = p.deger.trim();
      if (!ifade) return;
      // Satir ici isleyici icindeki JS dizesi: escapeHtml YETMEZ (oznitelik
      // cozulunce &#39; yine tirnak olur); encodeURIComponent sart.
      const isleyicide = /\son[a-z]+\s*=\s*"[^"]*$/i.test(onceki);
      if (isleyicide ? /^(?:encodeURIComponent|kod)\s*\(/.test(ifade) : GUVENLI_BASLANGIC.test(ifade)) return;
      // Ic sablon iceren ifade (ternary ile HTML parcasi): ic sablon ayrica taranir;
      // ifadenin geri kalaninda (ic sablonlar cikarilmis) veri var mi bak.
      // Geri cagirim / IIFE ile ic sablon ureten ifade: ciktiyi ic sablonlar
      // uretir ve onlar ayrica taranir. (`.map(x => x.name)` gibi ic sablonsuz
      // olan yine denetlenir.)
      if (/=>/.test(ifade) && /`/.test(ifade)) return;
      const disi = ifade.replace(/`(?:\\.|[^`\\])*`/g, "''")
        // Zaten kacislanmis alt ifadeler (ternary dallarinda) guvenlidir.
        // Isleyici baglaminda escapeHtml guvenli DEGILDIR (yukariya bkz.).
        .replace(isleyicide ? /(?:encodeURIComponent|kod)\s*\([^()]*\)/g
          : /(?:escapeHtml|encodeURIComponent|kod)\s*\([^()]*\)/g, "''");
      if (!alanRegex.test(disi)) return;
      if (SAYISAL.test(disi) && !/\?|\|\|/.test(disi)) return;
      // Kosul/secim ifadesi: yalniz kosulda kullanilan alan cikti degildir.
      // `a ? b : c` -> b ve c'ye bak.
      const secim = disi.match(/^[^?]*\?([\s\S]*)$/);
      // Dize sabitleri cikti degil sabittir ('badge-rose', 'Kapalı' ...).
      const cikti = (secim ? secim[1] : disi).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''")
        // Ic ice ternary'deki karsilastirma kosullari da cikti degildir.
        .replace(/[\w$.?[\]]+\s*(?:===|!==|==|!=)\s*''/g, '');
      if (!alanRegex.test(cikti)) return;
      if (SAYISAL.test(cikti) && !/\|\|/.test(cikti) && !/:/.test(cikti)) return;
      bulgular.push({ satir: satirNo(kaynak, p.konum), ifade: ifade.slice(0, 160), isleyicide });
    });
  });
  return bulgular;
}

function scanFile(yol) {
  return scan(fs.readFileSync(yol, 'utf8'));
}

module.exports = { scan, scanFile, VERI_ALANLARI };

if (require.main === module) {
  const yol = process.argv[2];
  const b = scanFile(yol);
  b.forEach(x => console.log(`${yol}:${x.satir}  ${x.ifade}`));
  console.log(`\n${b.length} bulgu`);
}
