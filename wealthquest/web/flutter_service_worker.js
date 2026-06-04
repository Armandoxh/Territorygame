// Kill-switch service worker.
//
// Earlier builds registered Flutter's default caching service worker, which
// pins a whole app version and only updates on a second reload — confusing
// during active development. Builds now use `--pwa-strategy=none` (no service
// worker), but browsers that already installed the old worker will keep
// fetching THIS file as their update check. Serving this self-destructing
// worker forces those browsers to drop all caches, unregister, and reload
// into the fresh, un-cached app.
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});

// Never serve anything from cache — always hit the network.
self.addEventListener('fetch', function (event) {});
