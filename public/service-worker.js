const CACHE_NAME = 'exfin-v13';

// Assets to cache on install (optional/default shell assets)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass service worker for dev server internal requests or hot reloads
  if (
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.search.includes('t=') ||
    url.search.includes('v=')
  ) {
    return;
  }

  // Exclude Firebase, Firestore, API, auth, and dynamic user-specific data from caching
  if (
    url.pathname.includes('/api/') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('securetoken') ||
    url.pathname.includes('identitytoolkit')
  ) {
    return;
  }

  // Determine if it is a navigation request or requesting index.html / root / navigation fallback
  const isNavigation = 
    request.mode === 'navigate' || 
    url.pathname === '/' || 
    url.pathname === '/index.html' ||
    url.pathname === '/navigation';

  if (isNavigation) {
    // NETWORK-FIRST Strategy
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
              if (url.pathname !== '/' && url.pathname !== '/index.html') {
                cache.put(request, responseToCache);
              }
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached index.html or root
          return caches.match('/').then((cachedResponse) => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Static assets matching versioned Vite assets, images, icons, fonts
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
    // NETWORK-FIRST Strategy for CSS/JS static assets
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Default: bypass cache, go directly to network
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
