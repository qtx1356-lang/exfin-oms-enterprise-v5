// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.

const CACHE_NAME = 'exfin-oms-v8-cache-v8';
const DYNAMIC_CACHE_NAME = 'exfin-oms-v8-dynamic-v8';

// Core Application Shell Assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

let fallbackAppShellText = '';

// Install Event: Precache Application Shell & Extract Bundle Assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching core application shell:', CACHE_NAME);
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl);
            if (response && response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch (e) {
            console.warn('[SW] Failed to precache asset:', assetUrl, e);
          }
        })
      );

      // Pre-cache runtime bundle assets by fetching index.html and parsing script & link tags
      try {
        const response = await fetch('/index.html');
        if (response && (response.status === 200 || response.status === 304)) {
          fallbackAppShellText = await response.clone().text();
          await cache.put('/index.html', response.clone());
          await cache.put('/', response);

          const assetUrls = new Set();
          const scriptMatches = fallbackAppShellText.matchAll(/src=["'](\/assets\/[^"']+)["']/g);
          for (const match of scriptMatches) {
            assetUrls.add(match[1]);
          }
          const cssMatches = fallbackAppShellText.matchAll(/href=["'](\/assets\/[^"']+)["']/g);
          for (const match of cssMatches) {
            assetUrls.add(match[1]);
          }

          if (assetUrls.size > 0) {
            console.log(`[SW] Pre-caching ${assetUrls.size} discovered bundle assets`);
            await Promise.allSettled(
              Array.from(assetUrls).map(async (url) => {
                try {
                  const assetRes = await fetch(url);
                  if (assetRes && assetRes.status === 200) {
                    await cache.put(url, assetRes);
                  }
                } catch (e) {
                  console.warn('[SW] Failed to precache asset:', url, e);
                }
              })
            );
          }
        }
      } catch (err) {
        console.warn('[SW] Runtime asset discovery warning:', err);
      }
    })
  );
});

// Activate Event: Unconditionally clean up all outdated shell caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[SW] Deleting obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Activated & claiming clients for', CACHE_NAME);
      return self.clients.claim();
    })
  );
});

// Fetch Event: Routing & Caching Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Exclude internal dev requests
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.search.includes('t=')
  ) {
    return;
  }

  // EXCLUSIONS — NEVER INTERFERE WITH SENSITIVE API / FIRESTORE / AUTH DATA
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // NAVIGATION REQUESTS (SPA Routes: /, /attendance, /planner, /employee, /admin-portal, etc.)
  // Network-First with Instant Offline Fallback to Cached index.html
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 304)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseToCache.clone());
              cache.put('/', responseToCache);
            }).catch(() => {});
            return networkResponse;
          }
          // On non-200/304 server response (e.g. 404 for deep SPA subpaths on some hosts), fall back to cached index.html
          return caches.match('/index.html', { ignoreSearch: true }).then((cachedIndex) => {
            if (cachedIndex) return cachedIndex;
            return caches.match('/', { ignoreSearch: true }).then((cachedRoot) => {
              if (cachedRoot) return cachedRoot;
              return networkResponse;
            });
          });
        })
        .catch(async () => {
          // Network request failed (offline / network error / disconnected) -> ALWAYS return cached application shell
          const cachedIndex = await caches.match('/index.html', { ignoreSearch: true });
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/', { ignoreSearch: true });
          if (cachedRoot) return cachedRoot;

          if (fallbackAppShellText) {
            return new Response(fallbackAppShellText, {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }

          // Search any HTML cache entry
          const cache = await caches.open(CACHE_NAME);
          const keys = await cache.keys();
          for (const key of keys) {
            if (key.url.endsWith('.html') || key.url.endsWith('/')) {
              const res = await cache.match(key);
              if (res) return res;
            }
          }

          return new Response('<!doctype html><html><head><meta charset="utf-8"/><title>EXFIN OMS</title></head><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // STATIC APPLICATION ASSETS (JS chunks, CSS, images, icons, fonts)
  // Cache-First with Dynamic Cache Fallback
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname === '/manifest.json';

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            }).catch(() => {});

            return response;
          })
          .catch(() => {
            // Return cached version matching pathname if query parameter differences exist
            return caches.match(url.pathname, { ignoreSearch: true });
          });
      })
    );
    return;
  }
});

// Push Notification Handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'EXFIN OMS';
    const options = {
      body: payload.message || payload.body || '',
      icon: '/manifest.json',
      badge: '/manifest.json',
      data: {
        route: payload.route || '/notifications',
        id: payload.id,
      },
      tag: payload.id || 'exfin_push',
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('[SW] Push notification error:', err);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification.data?.route || '/notifications';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(route) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(route);
    })
  );
});
