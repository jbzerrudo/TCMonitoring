/* TC React Monitor service worker.
   VERSION is rewritten by build.js from a hash of the sources, so every build gets a new cache name.
   The page and the data files are fetched network first: an online user always gets the newest
   build and the newest data. The copy saved on this device is the fallback, and a data file served
   from it carries the header X-TCR-From-Cache: 1, so the page can say it is showing an offline copy.
   Bulletin PDFs are left to the browser.
   Required Notice: Copyright 2026 Jef Zerrudo (https://github.com/jbzerrudo/TCReactPH)
   PolyForm Noncommercial License 1.0.0 */
const VERSION = 'tcreact-dcb09dd6';
const DATA = 'tcreact-data';   // survives builds: it holds the last copy of the data seen, not code
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Delete old code caches and take over open pages; after an update, reload them so they show the
  // new build. The reload starts after activation, not inside it.
  e.waitUntil(caches.keys().then(keys => {
    const old = keys.filter(k => k !== VERSION && k !== DATA);
    return Promise.all(old.map(k => caches.delete(k))).then(() => self.clients.claim()).then(() => {
      if (old.length) self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(c => c.navigate(c.url).catch(() => {})));
    });
  }));
});
async function networkFirst(req, cacheName, mark) {
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) { const c = await caches.open(cacheName); await c.put(req, res.clone()); }
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (!hit) return Response.error();
    if (!mark) return hit;
    const h = new Headers(hit.headers);
    h.set('X-TCR-From-Cache', '1');
    return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers: h });
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith('.pdf')) return;
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, VERSION, false).then(async r => (r.type === 'error' ? (await caches.match('./index.html')) || r : r)));
    return;
  }
  if (url.pathname.includes('/data/')) { e.respondWith(networkFirst(req, DATA, true)); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
