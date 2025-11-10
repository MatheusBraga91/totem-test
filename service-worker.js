const CACHE_NAME = 'totem-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/media/video1.mp4',
  '/media/image1.png',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(resp => {
      if (resp) {
        // Serve from cache, try to update in background
        fetch(event.request).then(update => {
          if (update && update.ok) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, update.clone()));
          }
        }).catch(() => {});
        return resp;
      }
      return fetch(event.request).catch(() => new Response("Offline"));
    })
  );
});
