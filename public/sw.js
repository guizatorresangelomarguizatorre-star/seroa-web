
const CACHE_NAME = 'seroa-pwa-v1.6.5';
const urlsToCache = [
  './',
  './index.html',
  './pacientes.html',
  './dosificacion.html',
  './registro.html',
  './tanque.html',
  './configuracion.html',
  './invitado.html',
  './login.html',
  './guia.html',
  './menu.html',
  './header.html',
  './estilos.css',
  './global.js',
  './index.js',
  './pacientes.js',
  './dosificacion.js',
  './registro.js',
  './tanque.js',
  './configuracion.js',
  './invitado.js',
  './auth.js',
  './utils.js',
  './seguridad_head.js',
  './manifest.json',
  'img/logo-icono.png',
  'img/patron-separador.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const networkFetch = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    }).catch(() => caches.match('./index.html'))
  );
});