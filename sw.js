/* X-Wallet V15.2.3 — fast parallel update-first PWA app shell with progress reporting. */
const CACHE_NAME = 'x-wallet-app-shell-v15.2.3';
const UPDATE_MARKER = new URL('__xwallet_sw_update_marker__', self.registration.scope).toString();
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=15.2.3',
  './core.js?v=15.2.3',
  './security.js?v=15.2.3',
  './storage.js?v=15.2.3',
  './backup.js?v=15.2.3',
  './financial-engine.js?v=15.2.3',
  './components.js?v=15.2.3',
  './settings.js?v=15.2.3',
  './dashboard.js?v=15.2.3',
  './transactions.js?v=15.2.3',
  './migration.js?v=15.2.3',
  './accounts.js?v=15.2.3',
  './installments.js?v=15.2.3',
  './cards.js?v=15.2.3',
  './reports.js?v=15.2.3',
  './payroll.js?v=15.2.3',
  './analytics.js?v=15.2.3',
  './quick-entry.js?v=15.2.3',
  './sync.js?v=15.2.3',
  './management.js?v=15.2.3',
  './cloud-backup.js?v=15.2.3',
  './single-currency.js?v=15.2.3',
  './app.js?v=15.2.3',
  './version.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

async function broadcastUpdateProgress(loaded, total, stage) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    for (const c of clients) {
      c.postMessage({ type: 'SW_UPDATE_PROGRESS', loaded, total, pct, stage: stage || 'downloading' });
    }
  } catch (_) {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const existing = await caches.keys();
    const hasPreviousAppShell = existing.some(name => name.startsWith('x-wallet-app-shell-') && name !== CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    const total = ASSETS.length;
    let loaded = 0;
    await broadcastUpdateProgress(0, total, 'downloading');

    const BATCH_SIZE = 6;
    for (let i = 0; i < ASSETS.length; i += BATCH_SIZE) {
      const batch = ASSETS.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async asset => {
        const response = await fetch(asset, { cache: 'reload' });
        if (!response || (!response.ok && response.type !== 'opaque')) {
          throw new Error(`X-Wallet update asset failed: ${asset}`);
        }
        await cache.put(asset, response);
        loaded++;
        await broadcastUpdateProgress(loaded, total, 'downloading');
      }));
    }

    if (hasPreviousAppShell) {
      await cache.put(UPDATE_MARKER, new Response('refresh-existing-clients', {
        headers: { 'Content-Type': 'text/plain' }
      }));
    }
    await broadcastUpdateProgress(total, total, 'activating');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const shouldRefreshClients = !!(await cache.match(UPDATE_MARKER));
    if (shouldRefreshClients) await cache.delete(UPDATE_MARKER);

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith('x-wallet-app-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));

    await self.clients.claim();

    if (shouldRefreshClients) {
      await broadcastUpdateProgress(ASSETS.length, ASSETS.length, 'reloading');
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const scope = new URL(self.registration.scope);
      await Promise.allSettled(windows.map(client => {
        const current = new URL(client.url);
        if (current.origin !== scope.origin || !current.pathname.startsWith(scope.pathname)) return Promise.resolve();
        current.searchParams.set('_xw_sw_update', CACHE_NAME);
        return client.navigate(current.toString());
      }));
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const netFetch = fetch(event.request).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || netFetch;
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
  }
});
