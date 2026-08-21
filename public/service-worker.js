// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.

const CACHE_NAME = 'exfin-oms-v8-cache-v8';
const DYNAMIC_CACHE_NAME = 'exfin-oms-v8-dynamic-v8';

// Core Application Shell Assets (Injected during build by Vite plugin)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Fallback Embedded App Shell HTML (Injected during build by Vite plugin)
let fallbackAppShellText = '';

// Helper to create synthetic HTML response
function createSyntheticAppShellResponse(htmlText) {
  return new Response(htmlText || '<!doctype html><html><head><meta charset="utf-8"/><title>EXFIN OMS</title></head><body><div id="root"></div></body></html>', {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-App-Shell-Source': 'ServiceWorker-Embedded',
    },
  });
}

// Install Event: Precache Application Shell & Assets safely before activating
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[SW] Pre-caching core application shell:', CACHE_NAME);
      const cache = await caches.open(CACHE_NAME);

      // If embedded fallback HTML is available, seed / and /index.html immediately
      if (fallbackAppShellText) {
        try {
          await cache.put('/index.html', createSyntheticAppShellResponse(fallbackAppShellText));
          await cache.put('/', createSyntheticAppShellResponse(fallbackAppShellText));
        } catch (seedErr) {
          console.warn('[SW] Could not seed embedded app shell:', seedErr);
        }
      }

      // Precache all defined build assets
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl, { cache: 'no-cache' });
            if (response && (response.status === 200 || response.status === 304)) {
              await cache.put(assetUrl, response);
            }
          } catch (e) {
            console.warn('[SW] Failed to precache asset:', assetUrl, e);
          }
        })
      );

      // Extract and cache any discovered assets from runtime index.html if possible
      try {
        const response = await fetch('/index.html', { cache: 'no-cache' });
        if (response && (response.status === 200 || response.status === 304)) {
          const indexHtmlText = await response.clone().text();
          if (indexHtmlText) {
            fallbackAppShellText = indexHtmlText;
          }
          await cache.put('/index.html', response.clone());
          await cache.put('/', response);

          const assetUrls = new Set();
          const scriptMatches = indexHtmlText.matchAll(/src=["'](\/assets\/[^"']+)["']/g);
          for (const match of scriptMatches) {
            assetUrls.add(match[1]);
          }
          const cssMatches = indexHtmlText.matchAll(/href=["'](\/assets\/[^"']+)["']/g);
          for (const match of cssMatches) {
            assetUrls.add(match[1]);
          }

          if (assetUrls.size > 0) {
            await Promise.allSettled(
              Array.from(assetUrls).map(async (url) => {
                try {
                  const assetRes = await fetch(url);
                  if (assetRes && assetRes.status === 200) {
                    await cache.put(url, assetRes);
                  }
                } catch (e) {}
              })
            );
          }
        }
      } catch (err) {
        console.warn('[SW] Runtime asset discovery warning:', err);
      }

      // Safe skipWaiting: Only after cache population is completed
      await self.skipWaiting();
    })()
  );
});

// Activate Event: Maintain usable caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME && cacheName.startsWith('exfin-oms-')) {
            console.log('[SW] Safely retiring obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
      console.log('[SW] Activated & claiming clients for', CACHE_NAME);
      return self.clients.claim();
    })()
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
      (async () => {
        try {
          // Attempt network fetch
          const networkResponse = await fetch(request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 304)) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseToCache.clone());
              cache.put('/', responseToCache);
            }).catch(() => {});
            return networkResponse;
          }

          // If server returns 404/500 for SPA subroute, fallback to cached index.html
          const cachedIndex = await caches.match('/index.html', { ignoreSearch: true });
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/', { ignoreSearch: true });
          if (cachedRoot) return cachedRoot;
          return networkResponse;
        } catch (networkErr) {
          // Network failed (offline / network error / disconnected) -> ALWAYS return cached application shell
          const cachedIndex = await caches.match('/index.html', { ignoreSearch: true });
          if (cachedIndex) return cachedIndex;

          const cachedRoot = await caches.match('/', { ignoreSearch: true });
          if (cachedRoot) return cachedRoot;

          // Search across all existing caches for any index.html
          const cacheKeys = await caches.keys();
          for (const cName of cacheKeys) {
            const c = await caches.open(cName);
            const matchIndex = await c.match('/index.html', { ignoreSearch: true });
            if (matchIndex) return matchIndex;
            const matchRoot = await c.match('/', { ignoreSearch: true });
            if (matchRoot) return matchRoot;
          }

          // Use pre-embedded fallback HTML from bundle build
          if (fallbackAppShellText) {
            return createSyntheticAppShellResponse(fallbackAppShellText);
          }

          return createSyntheticAppShellResponse('');
        }
      })()
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
      (async () => {
        // 1. Try cache match first across all caches
        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Fetch from network
        try {
          const response = await fetch(request);
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            }).catch(() => {});
          }
          return response;
        } catch (fetchErr) {
          // 3. Fallback: match by pathname without query params
          const pathnameMatch = await caches.match(url.pathname, { ignoreSearch: true });
          if (pathnameMatch) {
            return pathnameMatch;
          }
          throw fetchErr;
        }
      })()
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
