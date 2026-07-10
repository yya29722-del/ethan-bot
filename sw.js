const CACHE_VERSION = 'yuwen-home-v69';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './assets/home/paper-bg.svg',
  './assets/home/hero-column-arch.svg',
  './assets/home/hero-column-original.png',
  './assets/home/hero-column-branch-clean.png',
  './assets/home/hero-left-column-arch.png',
  './assets/home/hero-left-column-arch-tip-clean.png',
  './assets/home/hero-right-branch.png',
  './assets/home/hero-right-branch-clean.png',
  './assets/home/note-paper.svg',
  './assets/home/note-paper-original.png',
  './assets/home/note-paper-original-crop.png',
  './assets/home/note-paper-no-pin.png',
  './assets/home/note-paper-custom.png',
  './assets/home/note-paper-floral-clean.png',
  './assets/home/note-paper-floral-no-shadow.png',
  './assets/home/small-branch.svg',
  './assets/home/menu-icon.svg',
  './assets/home/menu-icon-v46.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
        return response;
      });
    })
  );
});
