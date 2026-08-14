const CACHE_NAME = 'exfin-v14';

// Assets to cache on install (optional/default shell assets)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Offline fallback page or just use index.html as the shell
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('ServiceWorker: Pre-caching app shell');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Keep only the current cache version, delete other exfin caches
          if (cacheName.startsWith('exfin-') && cacheName !== CACHE_NAME) {
            console.log('ServiceWorker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('ServiceWorker: Activated and claiming clients');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // 1. Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Bypass service worker for dev server internal requests or hot reloads
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.search.includes('t=') ||
    url.search.includes('v=')
  ) {
    return;
  }

  // 3. EXCLUSIONS (NEVER CACHE)
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname.includes('identitytoolkit') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // 4. NAVIGATION REQUESTS (index.html / App Shell)
  // Strategy: Network-First, Fallback to Cache
  const isNavigation = request.mode === 'navigate' || 
                       url.pathname === '/' || 
                       url.pathname === '/index.html';

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If successful (status 200), cache it and return
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Cache both the exact request and '/' and '/index.html' to ensure availability
              cache.put('/', responseToCache.clone());
              cache.put('/index.html', responseToCache.clone());
            });
            return response;
          }
          // If not 200 (e.g. error page from server), try cache
          return caches.match(OFFLINE_URL);
        })
        .catch((err) => {
          console.log('ServiceWorker: Navigation fetch failed, serving offline shell', err);
          // Fallback to cached index.html or root
          return caches.match(OFFLINE_URL).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // 5. STATIC ASSETS (Vite assets, images, icons, fonts, etc.)
  // Strategy: Cache-First, Fallback to Network (and then cache)
  const isStaticAsset = 
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.gif') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.ttf') ||
    url.pathname.endsWith('.json');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(request)
          .then((response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });

            return response;
          })
          .catch((err) => {
            console.error('ServiceWorker: Static asset fetch failed', err);
            // Just return whatever fetch would have returned (the error)
            return null;
          });
      })
    );
    return;
  }

  // 6. DEFAULT: Go directly to network (no caching)
});

// Push notification event handler for Android & Web Push
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'EXFIN OMS';
    const options = {
      body: payload.message || payload.body || '',
      icon: '/manifest-icon-192.png',
      badge: '/manifest-icon-192.png',
      data: {
        route: payload.route || '/notifications',
        entityType: payload.entityType,
        entityId: payload.entityId,
        notifId: payload.id,
      },
      tag: payload.id || 'exfin_push_' + Date.now(),
      renotify: false,
      vibrate: [200, 100, 200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error('ServiceWorker push event error:', err);
  }
});

// Notification click router handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetRoute = notifData.route || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetRoute);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetRoute);
      }
    })
  );
});
