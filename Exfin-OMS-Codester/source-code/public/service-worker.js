// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// OFFLINE-FIRST STARTUP
const CACHE_NAME = 'exfin-oms-v5-cache-v5';
const DYNAMIC_CACHE_NAME = 'exfin-oms-v5-dynamic-v5';

// Core Application Shell Assets
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
];

// Fallback HTML if both network and cache are completely empty
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>You're offline</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #0f172a;
            color: #f8fafc;
            text-align: center;
            padding: 24px;
            box-sizing: border-box;
        }
        .card {
            background-color: #1e293b;
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 20px;
            padding: 32px 24px;
            max-width: 360px;
            width: 100%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        .icon {
            font-size: 44px;
            margin-bottom: 16px;
        }
        h1 {
            font-size: 20px;
            margin: 0 0 10px;
            font-weight: 700;
            color: #ffffff;
        }
        p {
            font-size: 14px;
            color: #94a3b8;
            line-height: 1.5;
            margin: 0 0 24px;
        }
        .btn {
            background-color: #7c3aed;
            color: #ffffff;
            border: none;
            padding: 12px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
        }
        .btn:active {
            background-color: #6d28d9;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">📡</div>
        <h1>You're offline</h1>
        <p>Check your internet connection and try again.</p>
        <button class="btn" onclick="window.location.reload()">Retry</button>
    </div>
</body>
</html>`;

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

// Activate Event: Clean up outdated shell caches
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
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      caches.match('/index.html')
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Background update — wrapped in try/catch to prevent sync throws (like only-if-cached) from breaking the promise chain
            try {
              fetch(request.url).then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put('/index.html', networkResponse.clone());
                    cache.put('/', networkResponse);
                  });
                }
              }).catch(() => {});
            } catch (err) {
              // Ignore synchronous fetch errors in background
            }
            return cachedResponse;
          }

          // Not in cache, fetch from network safely
          let fetchPromise;
          try {
            // Chrome sometimes throws synchronously here if offline and cache is 'only-if-cached'
            fetchPromise = fetch(request);
          } catch (err) {
            fetchPromise = Promise.reject(err);
          }

          return fetchPromise
            .then((response) => {
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put('/index.html', responseToCache);
                  cache.put('/', responseToCache.clone());
                });
                return response;
              }
              // If network returns 404/500, fallback to root if available
              return caches.match('/').then((rootResponse) => {
                return rootResponse || new Response(OFFLINE_FALLBACK_HTML, {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
              });
            })
            .catch(() => {
              // Network failed (offline), fallback to root or fallback HTML
              return caches.match('/').then((rootResponse) => {
                return rootResponse || new Response(OFFLINE_FALLBACK_HTML, {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
              });
            });
        })
        .catch(() => {
          // Absolute worst-case scenario (e.g. caches.match throws)
          return new Response(OFFLINE_FALLBACK_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
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

        let fetchPromise;
        try {
          fetchPromise = fetch(request);
        } catch (err) {
          fetchPromise = Promise.reject(err);
        }

        return fetchPromise
          .then((response) => {
            if (!response || response.status !== 200) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });

            return response;
          })
          .catch(() => {
            // Return cached version if query parameter differences exist
            return caches.match(url.pathname).then((res) => {
              // NEVER return undefined to event.respondWith as it causes net::ERR_FAILED
              return res || new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
          });
      }).catch(() => {
        // Fallback for cache errors
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
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
