/* Gaden Hub service worker: makes repeat visits fast and the app shell open offline.
   Pages are network-first (so new deploys show immediately); images are cached after first use.
   Supabase/API traffic is never touched. Bump V to force every device to drop old caches. */
const V = 'gh-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/assets/img/logo.png'];
const SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== V).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms)); }

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);

  // Page loads: network first (4s), then the cached app shell.
  if (r.mode === 'navigate') {
    e.respondWith(
      Promise.race([fetch(r), timeout(4000)]).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put('/', copy)); }
        return res;
      }).catch(() => caches.match('/').then(m => m || Response.error()))
    );
    return;
  }

  // Pinned Supabase library from the CDN: cache first.
  if (r.url.startsWith(SUPA_JS)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const c = res.clone(); caches.open(V).then(ch => ch.put(r, c)); return res; })));
    return;
  }

  // Everything else from another site (Supabase API, fonts, analytics): leave alone.
  if (u.origin !== location.origin) return;
  if (u.pathname === '/sw.js') return;

  // Our own images, icons and manifest: serve cached copy, refresh in background.
  if (/^\/(assets\/|icon-|favicon|og-image|manifest)/.test(u.pathname)) {
    e.respondWith(caches.open(V).then(c => c.match(r).then(m => {
      const net = fetch(r).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => m);
      return m || net;
    })));
  }
});
