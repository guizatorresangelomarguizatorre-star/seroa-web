
const CACHE_NAME = 'seroa-v1';


const urlsToCache = [
  './',
  './index.html',
  './pacientes.html',
  './dosificacion.html',
  './tanque.html',
  './configuracion.html',
  './estilos.css',
  './js/global.js',
  './js/index.js',
  './js/tanque.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

// 1. INSTALACIÓN
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Archivos de Seroa guardados en caché');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. INTERCEPTOR 
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si encuentra el archivo en caché, lo devuelve. Si no, lo busca en internet.
        return response || fetch(event.request);
      })
  );
});