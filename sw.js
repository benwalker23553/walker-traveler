// Keeps the app opening when Wi-Fi drops. Always tries the network first, so updates arrive as soon as they are published.
const SHELL = 'wt-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', 'index.html', 'supa.js', 'manifest.json', 'icon.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const shell = u.origin === location.origin || /cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.host);
  if (!shell) return; // database and files go straight to the network (the app keeps its own copy of what it has opened)
  e.respondWith(fetch(e.request).then((r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request).then((m) => m || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
