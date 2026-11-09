// Offline support: network-first for app code, cache-first for heavy static libs. Never caches /api.
const V = 'cardioeng-v3';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/ai.js', '/js/store.js', '/js/pdfview.js', '/js/dict.js', '/js/review.js', '/js/speech.js', '/js/comm.js', '/js/search.js', '/js/activity.js',
  '/data/toc.js', '/data/glossary.js', '/data/notes.js', '/data/phrases.js', '/lib/pdfjs/pdf.min.js', '/lib/pdfjs/pdf.worker.min.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (u.pathname.startsWith('/lib/')) { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); return; }
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html'))));
});
