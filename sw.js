// Keeps the app opening when Wi-Fi drops. Always tries the network first, so updates arrive as soon as they are published.
const SHELL = 'wt-shell-v2';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', 'index.html', 'supa.js', 'manifest.json', 'icon.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const shell = u.origin === location.origin || /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.host);
  if (!shell) return; // database and files go straight to the network (the app keeps its own copy of what it has opened)
  e.respondWith(fetch(e.request).then((r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then((m) => m || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

// Supervisor alerts
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (er) { d = { title: 'Walker Traveler', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Walker Traveler', { body: d.body || '', tag: d.tag || undefined, renotify: true, requireInteraction: true, icon: 'icon.png', badge: 'icon.png', vibrate: [200, 100, 200, 100, 300], data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } } return self.clients.openWindow(url); }));
});
