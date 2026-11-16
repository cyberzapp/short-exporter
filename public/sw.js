const CACHE = 'short-exporter-v2';
const APP_SHELL = ['/', '/manifest.webmanifest', '/muxer.js', '/exporter.js', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' })));
    const page = await cache.match('/');
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+)"/g)].map(match => match[1]);
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
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  if (url.pathname === '/' && request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match('/'))));
  } else if (APP_SHELL.includes(url.pathname) || url.pathname.startsWith('/_next/static/')) {
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
