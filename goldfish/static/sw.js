/* Service worker: lets the app open offline and keeps card images you've already seen. */
const VERSION = 'isf-v12';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'sim.js', 'source.js', 'charts.js', 'suggest.js', 'profile.js', 'tags.js', 'looks.js', 'worker.js', 'manifest.webmanifest', 'logo.svg', 'donate-qr.jpg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const IMG = 'gf-img-v1';
const MAX_IMAGES = 600;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // card images: cache-first (they never change)
  if (url.hostname === 'cards.scryfall.io') {
    e.respondWith(caches.open(IMG).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trim(cache); }
      return res;
    }));
    return;
  }
  // the app itself: use the cached copy right away, refresh it in the background
  if (url.origin === location.origin && !url.pathname.includes('/api/')) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
