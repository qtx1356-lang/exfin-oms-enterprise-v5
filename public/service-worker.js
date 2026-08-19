// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// OFFLINE-FIRST STARTUP
const CACHE_NAME = 'exfin-oms-v5-cache-v6';
const DYNAMIC_CACHE_NAME = 'exfin-oms-v5-dynamic-v6';

// Core Application Shell Assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

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
            } else {
              console.warn('[SW] Failed to fetch for precache:', assetUrl, response?.status);
            }
          } catch (e) {
            console.warn('[SW] Failed to precache asset:', assetUrl, e);
          }
        })
      );

      // Pre-cache runtime bundle assets by fetching index.html and parsing script & link tags
      try {
        const response = await fetch('/index.html');
        if (response && response.status === 200) {
          const htmlText = await response.clone().text();
          await cache.put('/index.html', response.clone());
          await cache.put('/', response);

          const assetUrls = new Set();
          const scriptMatches = htmlText.matchAll(/src=["'](\/assets\/[^"']+)["']/g);
          for (const match of scriptMatches) {
            assetUrls.add(match[1]);
          }
          const cssMatches = htmlText.matchAll(/href=["'](\/assets\/[^"']+)["']/g);
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

// Activate Event: Clean up outdated shell caches safely
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.match('/index.html'))
      .then((indexResponse) => {
        const isNewCacheValid = !!indexResponse;
        return caches.keys().then((cacheNames) => {
          return Promise.all(
            cacheNames.map((cacheName) => {
              if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                // Only delete old caches if the new cache has a valid index.html
                if (isNewCacheValid) {
                  console.log('[SW] Deleting obsolete cache:', cacheName);
                  return caches.delete(cacheName);
                } else {
                  console.warn('[SW] Preserving obsolete cache due to invalid new cache:', cacheName);
                }
              }
            })
          );
        });
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

  // Exclude internal dev requests, but DO NOT exclude navigation requests
  if (
    request.mode !== 'navigate' && (
      url.pathname.startsWith('/src/') ||
      url.pathname.startsWith('/@') ||
      url.search.includes('t=') ||
      url.search.includes('v=')
    )
  ) {
    return;
  }

  // EXCLUSIONS — NEVER CACHE SENSITIVE API / FIRESTORE / AUTH DATA
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

  // NAVIGATION REQUESTS (SPA Routes: /, /attendance, /planner, /employee, etc.)
  // Strategy:
  // 1. Network first: fetch latest index.html to avoid stale bundles after deployment
  // 2. Network failure (offline): return cached /index.html or /
  // 3. Both fail: do NOT manufacture an offline HTML page
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('/index.html', responseToCache);
              cache.put('/', responseToCache.clone());
            }).catch(() => {});
            return networkResponse;
          }
          // If network returned non-200, fallback to cached index
          return caches.match('/index.html').then((cachedIndex) => {
            return cachedIndex || caches.match('/').then((cachedRoot) => {
              return cachedRoot || networkResponse;
            });
          });
        })
        .catch(() => {
          // Network offline -> return cached application shell
          return caches.match('/index.html').then((cachedIndex) => {
            if (cachedIndex) {
              return cachedIndex;
            }
            return caches.match('/').then((cachedRoot) => {
              if (cachedRoot) {
                return cachedRoot;
              }
              // Both network and cache unavailable: let browser handle normally
              return Promise.reject(new Error('Network unavailable and no cached application shell found'));
            });
          });
        })
    );
    return;
  }

  // STATIC APPLICATION ASSETS (JS chunks, CSS, images, icons, fonts)
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
      caches.match(request).then((cachedResponse) => {
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
            // Return cached version if query parameter differences exist
            return caches.match(url.pathname);
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
