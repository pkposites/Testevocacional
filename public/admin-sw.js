// Service worker do painel admin: só recebe notificações. Não guarda páginas em cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Mapa da Carreira', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Mapa da Carreira', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icons/admin-192.png',
    badge: '/icons/admin-192.png',
    data: { url: data.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).pathname.startsWith('/admin')) { await c.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
