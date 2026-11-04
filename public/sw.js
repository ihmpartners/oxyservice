// Offline cache for the OxyService app shell. Bump VERSION when you change the app files.
const VERSION = 'oxyservice-v8';
const SHELL = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, {cache: 'reload'})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return; // sync goes straight to network
  const nav = req.mode === 'navigate', key = nav ? './' : req;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key, {ignoreSearch: true});
    const net = fetch(req, nav ? {cache: 'no-store'} : undefined).then(res => {
      if (res.ok && !res.redirected) cache.put(key, res.clone());
      return res;
    });
    if (nav) {
      // The app page: always try for the latest version first, so a new deploy shows on the next open.
      // Fall back to the saved copy if offline or the network takes longer than 4 seconds.
      const slow = new Promise(r => setTimeout(() => r(hit), 4000));
      return Promise.race([net.catch(() => hit), hit ? slow : net]).then(r => r || hit || net);
    }
    // Icons etc.: answer from the saved copy, refresh in the background.
    return hit || net.catch(() => hit);
  }));
});
