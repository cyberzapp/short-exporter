const CACHE = 'short-exporter-v3';
const APP_SHELL = ['/', '/share', '/manifest.webmanifest', '/muxer.js', '/exporter.js', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' })));
    const pages = await Promise.all(['/', '/share'].map(p => cache.match(p)));
    const assets = [];
    for (const page of pages) {
      if (!page) continue;
      const html = await page.text();
      for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)) {
        assets.push(match[1]);
      }
    }
    await cache.addAll([...new Set(assets)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('short-exporter-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/share')) {
    event.respondWith(
      fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(url.pathname))),
    );
    return;
  }
  if (url.search) return;
  if (APP_SHELL.includes(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      if (url.pathname.startsWith('/_next/static/')) {
        const stored = await cache.match(request);
        if (stored) return stored;
      }
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
  }
});
