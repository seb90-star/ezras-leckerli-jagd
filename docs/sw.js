// Speichert das Spiel auf dem Handy, damit es auch ohne Internet läuft.
// Bei jeder Änderung am Spiel die Versionsnummer erhöhen.
const VERSION = 'leckerli-jagd-v5';
const DATEIEN = [
  './',
  'index.html',
  'datenschutz.html',
  'privacy.html',
  'ezra.jpg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/baloo-2-latin-600-normal.woff2',
  'fonts/baloo-2-latin-800-normal.woff2',
  'fonts/nunito-latin-500-normal.woff2',
  'fonts/nunito-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Erst aus dem Speicher, sonst aus dem Netz
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((treffer) => treffer || fetch(e.request))
  );
});
