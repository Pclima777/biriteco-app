const CACHE = 'biriteco-v2';
const STATIC = ['/manifest.json', '/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Nunca intercepta chamadas da API
  if (e.request.url.includes('/api/')) return;

  // HTML sempre vem da rede (garante atualização automática)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Arquivos estáticos: cache primeiro
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
