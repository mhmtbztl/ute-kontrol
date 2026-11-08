/*
 * LEXBNB — tekrar girislerde hizli acilis (giris hizi 2. asama, 08.11.2026)
 *
 * GitHub Pages her dosyaya max-age=600 veriyor ve basligi degistiremiyoruz:
 * 10 dakikadan sonra acilis 54 dosyayi yeniden soruyordu. Oysa dosyalarin hepsi
 * icerik damgali (?v=hash) — damga degismeden icerik degismez. Bu calisan:
 *
 *   - damgali statik dosya (?v=xxxxxxxx)  -> once onbellek; yeni damga eskisini siler
 *   - giris sayfasi (/ ve /index.html)    -> once ag; ag yoksa onbellekteki
 *   - yazi tipi ve marka dosyalari        -> onbellekten ver, arkada yenile
 *   - geri kalan her sey                  -> DOKUNULMAZ
 *
 * Yalniz ayni kokenden GET istekleri ele alinir. Supabase (kullanici verisi),
 * Turnstile ve Cloudflare istekleri baska kokendir; hic onbellege girmez.
 *
 * ACIL KAPATMA: sorun cikarsa bu dosyanin govdesi su hale getirilip yayinlanir:
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', e => e.waitUntil(caches.keys()
 *     .then(k => Promise.all(k.map(n => caches.delete(n))))
 *     .then(() => self.registration.unregister())));
 * Tarayici sw.js'i her gezinmede HTTP onbellegini atlayarak denetler.
 */
'use strict';

const CACHE_VERSION = 1;
const CACHE_NAME = 'lexbnb-static-v' + CACHE_VERSION;
const INDEX_KEY = '/index.html';

const STAMP_RE = /^\?v=[0-9a-f]{8}$/;
// server.js isAllowed'in damgali kismi: kok dosyalar ve core/*.js
const STAMPED_PATH_RE = /^\/(?:[A-Za-z0-9_.-]+\.(?:js|css)|core\/[a-z0-9_]+\.js)$/;
const SWR_PATH_RE = /^\/assets\/(?:fonts|brand)\/[a-z0-9-]+\.(?:woff2|svg|png)$/;
// index.html'deki damgali yerel src/href (stamp_assets.js bicimi)
const INDEX_ASSET_RE = /\b(?:src|href)="(?!https?:|\/\/)([^"?#]+\?v=[0-9a-f]{8})"/g;

function cacheable(response) {
  return !!response && response.ok && response.type === 'basic';
}

function classify(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (request.mode === 'navigate') {
    return (url.pathname === '/' || url.pathname === INDEX_KEY) ? 'index' : null;
  }
  if (STAMP_RE.test(url.search) && STAMPED_PATH_RE.test(url.pathname)) return 'stamped';
  if (!url.search && SWR_PATH_RE.test(url.pathname)) return 'swr';
  return null;
}

/** Ayni yolun eski damgalarini siler; onbellek yayin basina buyumez. */
async function putStamped(cache, url, response) {
  const target = new URL(url, self.location.origin);
  const keys = await cache.keys();
  await Promise.all(keys.map(req => {
    const u = new URL(req.url);
    return (u.pathname === target.pathname && u.search !== target.search) ? cache.delete(req) : null;
  }));
  await cache.put(target.pathname + target.search, response);
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const res = await fetch(INDEX_KEY, { cache: 'no-cache' });
  if (!cacheable(res)) return;
  const html = await res.clone().text();
  await cache.put(INDEX_KEY, res);
  const urls = [...new Set([...html.matchAll(INDEX_ASSET_RE)].map(m => '/' + m[1].replace(/^\.?\//, '')))];
  // Bir dosya alinamazsa kurulum durmaz; o dosya ilk kullanimda onbellege girer.
  await Promise.allSettled(urls.map(async u => {
    const r = await fetch(u);
    if (cacheable(r)) await putStamped(cache, u, r);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precache().catch(err => console.warn('[sw] on yukleme:', err && err.message)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('lexbnb-') && n !== CACHE_NAME).map(n => caches.delete(n)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function handleIndex(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = (await event.preloadResponse) || await fetch(event.request);
    if (cacheable(res)) event.waitUntil(cache.put(INDEX_KEY, res.clone()));
    return res;
  } catch (err) {
    const cached = await cache.match(INDEX_KEY);
    if (cached) return cached;
    throw err;
  }
}

async function handleStamped(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (cacheable(res)) await putStamped(cache, request.url, res.clone());
  return res;
}

async function handleSwr(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const fresh = fetch(event.request).then(async res => {
    if (cacheable(res)) await cache.put(event.request, res.clone());
    return res;
  });
  if (cached) {
    event.waitUntil(fresh.catch(() => null));
    return cached;
  }
  return fresh;
}

self.addEventListener('fetch', event => {
  const kind = classify(event.request);
  if (kind === 'index') event.respondWith(handleIndex(event));
  else if (kind === 'stamped') event.respondWith(handleStamped(event.request));
  else if (kind === 'swr') event.respondWith(handleSwr(event));
});
