// OFFLINE-FIRST CORE REQUIREMENT: APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. NETWORK FAILURE MUST NEVER REDIRECT TO OR REPLACE THE NORMAL APPLICATION SHELL WITH AN OFFLINE PAGE.

const CACHE_NAME = 'exfin-oms-v15-indigo-v15';
const DYNAMIC_CACHE_NAME = 'exfin-oms-v15-dynamic-v15';

// Core Application Shell Assets (Injected during build by Vite plugin)
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/assets/centralNotificationService-Cp7yIlGQ.js",
  "/assets/html2canvas.esm-QH1iLAAe.js",
  "/assets/index-BPaptBSB.js",
  "/assets/index-BcXXebAA.js",
  "/assets/index-D9cnsoeD.js",
  "/assets/index-lISAS8s0.css",
  "/assets/index.es-D_1sO-ka.js",
  "/assets/purify.es-DP5U8-sc.js",
  "/assets/web-C2vJgmiM.js",
  "/assets/web-C_nx7ta-.js",
  "/assets/web-CtHiQTh9.js",
  "/assets/web-LteW1msW.js"
];

// Fallback Embedded App Shell HTML (Injected during build by Vite plugin)
let fallbackAppShellText = "<!-- OFFLINE-FIRST CORE REQUIREMENT: APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. NETWORK FAILURE MUST NEVER REDIRECT TO OR REPLACE THE NORMAL APPLICATION SHELL WITH AN OFFLINE PAGE. -->\n<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\" />\n    <meta name=\"theme-color\" content=\"#0F1025\" />\n    <link rel=\"manifest\" href=\"/manifest.json\" />\n    <title>Office Management System v6.0</title>\n    <script>\n      window.__EXFIN_STARTUP_COUNT = (window.__EXFIN_STARTUP_COUNT || 0) + 1;\n      console.log('[OFFLINE-ROOT] JavaScript bundle executed, count:', window.__EXFIN_STARTUP_COUNT);\n      window.addEventListener('DOMContentLoaded', function() {\n        console.log('[OFFLINE-ROOT] DOMContentLoaded');\n      });\n\n      if ('serviceWorker' in navigator) {\n        navigator.serviceWorker.register('/service-worker.js', { scope: '/' })\n          .then(function (registration) {\n            if (registration.active) {\n              console.log('[STARTUP_PERF] [PWA_CACHE_READY] Service worker active and cache ready');\n            }\n            registration.onupdatefound = function () {\n              var installingWorker = registration.installing;\n              if (installingWorker) {\n                installingWorker.onstatechange = function () {\n                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {\n                    console.log('[STARTUP_PERF] [SERVICE_WORKER_UPDATED] New service worker version installed');\n                  }\n                };\n              }\n            };\n            registration.update().catch(function () {});\n          })\n          .catch(function (err) {\n            console.warn('Service worker registration failed:', err);\n          });\n      }\n    </script>\n    <script type=\"module\" crossorigin src=\"/assets/index-BPaptBSB.js\"></script>\n    <link rel=\"stylesheet\" crossorigin href=\"/assets/index-lISAS8s0.css\">\n  </head>\n  <body>\n    <div id=\"root\"></div>\n  </body>\n</html>\n";

// Helper to create synthetic HTML response
function createSyntheticAppShellResponse(htmlText) {
  const content = htmlText || '<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/><title>EXFIN OMS ENTERPRISE v6.0</title></head><body><div id="root"></div></body></html>';
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-App-Shell-Source': 'ServiceWorker-OfflineFirst',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}

// Helper to search across ALL caches in CacheStorage for an asset
async function matchAcrossAllCaches(requestOrUrl) {
  // 1. Try current primary cache
  const primaryCache = await caches.open(CACHE_NAME);
  const primaryMatch = await primaryCache.match(requestOrUrl, { ignoreSearch: true });
  if (primaryMatch) return primaryMatch;

  // 2. Try dynamic cache
  const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
  const dynamicMatch = await dynamicCache.match(requestOrUrl, { ignoreSearch: true });
  if (dynamicMatch) return dynamicMatch;

  // 3. Fallback across all other registered caches (legacy or transitional)
  const allCacheNames = await caches.keys();
  for (const name of allCacheNames) {
    if (name !== CACHE_NAME && name !== DYNAMIC_CACHE_NAME) {
      try {
        const c = await caches.open(name);
        const match = await c.match(requestOrUrl, { ignoreSearch: true });
        if (match) {
          // Promote into primary cache for faster next access
          primaryCache.put(requestOrUrl, match.clone()).catch(() => {});
          return match;
        }
      } catch (e) {}
    }
  }

  return null;
}

// Helper to validate if index.html is a valid app shell
async function isValidAppShell(response) {
  if (!response || (response.status !== 200 && response.status !== 304)) {
    return false;
  }
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('text/html')) {
    return false;
  }
  try {
    const clone = response.clone();
    const text = await clone.text();
    // A valid app shell must contain id="root" or id='root'
    if (!text.includes('id="root"') && !text.includes("id='root'")) {
      return false;
    }
    // Do not cache Cloudflare error pages or other standard error pages
    if (text.includes('cf-error-details') || text.includes('Cloudflare') || text.includes('error-code') || text.includes('Attention Required!')) {
      return false;
    }
    return true;
  } catch (err) {
    console.error('[SW] Error validating app shell:', err);
    return false;
  }
}

// Helper to handle recovery when a critical hashed JS asset fails to load
async function handleCriticalAssetFailure() {
  console.warn('[SW] Critical JS asset missing or corrupt. Initiating recovery...');
  try {
    const cache = await caches.open(CACHE_NAME);
    // 1. Invalidate stale cache
    await cache.delete('/index.html');
    await cache.delete('/');
    
    // 2. Try to fetch the newest index.html from network
    const netRes = await fetch('/index.html', { cache: 'no-cache' });
    if (netRes && (netRes.status === 200 || netRes.status === 304)) {
      const isValid = await isValidAppShell(netRes);
      if (isValid) {
        // Cache the new valid shell
        await cache.put('/index.html', netRes.clone());
        await cache.put('/', netRes);
        console.log('[SW] Successfully fetched and cached new application shell during recovery.');
      }
    }
  } catch (err) {
    console.error('[SW] Failed to fetch new application shell during recovery:', err);
  }
  
  // Return a controlled recovery script that reloads the app at most once.
  const recoveryJs = `
    (function() {
      console.warn('[EXFIN recovery] Stale JS asset detected. Initiating single-time recovery reload...');
      try {
        var attempts = parseInt(window.sessionStorage.getItem('exfin_recovery_attempts') || '0', 10);
        if (attempts < 1) {
          window.sessionStorage.setItem('exfin_recovery_attempts', (attempts + 1).toString());
          window.location.reload();
        } else {
          console.error('[EXFIN recovery] Recovery reload already attempted once. Aborting to prevent infinite loop.');
        }
      } catch (e) {
        console.error('[EXFIN recovery] Error during recovery check:', e);
      }
    })();
  `;
  return new Response(recoveryJs, {
    status: 200,
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  });
}

// Install Event: Precache Application Shell & Assets safely before activating
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      console.log('[SW] Pre-caching core application shell:', CACHE_NAME);
      const cache = await caches.open(CACHE_NAME);

      // We MUST fetch all PRECACHE_ASSETS successfully to consider the install successful.
      // If we are offline during install, we want it to FAIL so the previous working SW and cache are kept.
      const fetchPromises = PRECACHE_ASSETS.map(async (assetUrl) => {
        const response = await fetch(assetUrl, { cache: 'no-cache' });
        if (!response || (response.status !== 200 && response.status !== 304 && response.status !== 0)) {
          throw new Error('Failed to fetch ' + assetUrl);
        }
        await cache.put(assetUrl, response);
      });
      
      await Promise.all(fetchPromises);

      // Extract and cache any discovered assets from runtime index.html if possible
      try {
        const indexResponse = await cache.match('/index.html');
        if (indexResponse) {
          const indexHtmlText = await indexResponse.clone().text();
          if (indexHtmlText) {
            fallbackAppShellText = indexHtmlText;
          }
          
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
            const dynamicFetchPromises = Array.from(assetUrls).map(async (url) => {
              const assetRes = await fetch(url, { cache: 'no-cache' });
              if (assetRes && (assetRes.status === 200 || assetRes.status === 304 || assetRes.status === 0)) {
                await cache.put(url, assetRes);
              } else {
                throw new Error('Failed to fetch dynamic asset ' + url);
              }
            });
            await Promise.all(dynamicFetchPromises);
          }
        }
      } catch (err) {
        console.warn('[SW] Runtime asset discovery failed, failing install:', err);
        throw err;
      }

      console.log('[SW] Successfully precached all assets.');
      
      // Skip waiting immediately to activate new shell ONLY when all assets are successfully fetched
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1. Claim all open windows / WebViews immediately
      await self.clients.claim();
      console.log('[SW] Activated & claimed clients for', CACHE_NAME);

      // 2. Safe cache retirement: keep at least current & dynamic caches
      // and only delete very old caches after verifying primary cache has index.html
      const cacheNames = await caches.keys();
      const primaryCache = await caches.open(CACHE_NAME);
      const hasIndexHtml = await primaryCache.match('/index.html');

      if (hasIndexHtml) {
        // Delete all obsolete caches when new version is ready with index.html
        const oldCaches = cacheNames.filter(
          (cName) => cName !== CACHE_NAME && cName !== DYNAMIC_CACHE_NAME && cName.startsWith('exfin-oms-')
        );
        
        await Promise.all(
          oldCaches.map((cName) => {
            console.log('[SW] Retiring obsolete cache version:', cName);
            return caches.delete(cName);
          })
        );
      }
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

  // EXCLUSIONS — NEVER INTERFERE WITH SENSITIVE API / FIRESTORE / AUTH / REVERSE GEOCODING / DOWNLOADS
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/downloads/') ||
    url.pathname.endsWith('.apk') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('openstreetmap') ||
    url.hostname.includes('bigdatacloud') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // NAVIGATION REQUESTS (SPA Routes: /, /attendance, /planner, /expenses, /leave, /profile, /admin-portal, /x7Kp9, etc.)
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      (async () => {
        // ONLINE: Try the network first to fetch current index.html
        try {
          const networkResponse = await fetch(request);
          if (networkResponse) {
            const isValid = await isValidAppShell(networkResponse);
            if (isValid) {
              const responseToCache = networkResponse.clone();
              const cache = await caches.open(CACHE_NAME);
              await cache.put('/index.html', responseToCache.clone());
              await cache.put('/', responseToCache);
              return networkResponse;
            }
          }
        } catch (networkErr) {
          console.warn('[SW] Navigation network fetch failed, falling back to cached shell:', networkErr);
        }

        // OFFLINE: If network fails, serve last known-good cached index.html
        const cachedHtml = await matchAcrossAllCaches('/index.html') || await matchAcrossAllCaches('/');
        if (cachedHtml) {
          return cachedHtml;
        }

        // Absolute Fallback: Embedded application shell (NEVER fail or throw)
        if (fallbackAppShellText) {
          return createSyntheticAppShellResponse(fallbackAppShellText);
        }

        return createSyntheticAppShellResponse('');
      })()
    );
    return;
  }

  // STATIC APPLICATION ASSETS (JS chunks, CSS, images, icons, fonts, manifest)
  // CACHE-FIRST WITH MULTI-CACHE FALLBACK
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/sounds/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.ico';

  if (isStaticAsset) {
    event.respondWith(
      (async () => {
        // 1. Try cache match first across all caches
        const cachedResponse = await matchAcrossAllCaches(request) || await matchAcrossAllCaches(url.pathname);
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Fetch from network if not in cache
        try {
          const response = await fetch(request);
          if (response) {
            const contentType = response.headers.get('content-type') || '';
            const isHtmlForJsCss = (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) && contentType.includes('text/html');

            if (response.status === 200 && !isHtmlForJsCss) {
              const responseToCache = response.clone();
              const cache = await caches.open(CACHE_NAME);
              await cache.put(request, responseToCache);
              return response;
            }

            // Treat 404 or HTML content for JS/CSS as a missing/stale asset
            if (response.status === 404 || isHtmlForJsCss) {
              if (url.pathname.endsWith('.js')) {
                // If it's HTML, it's extremely likely a captive portal or offline proxy intercept.
                // Do not initiate a destructive reload loop. Just fail gracefully.
                console.warn('[SW] JS asset 404 or returned HTML (likely offline proxy/captive portal). Returning warning fallback.');
                return new Response('console.warn("JS asset load failed due to 404 or HTML intercept");', {
                  status: 200,
                  headers: { 'Content-Type': 'application/javascript' }
                });
              }
            }
          }
          return response;
        } catch (fetchErr) {
          // If network fetch failed (offline/DNS error) and we don't have the asset cached
          if (url.pathname.endsWith('.js')) {
            console.warn('[SW] Network error fetching JS asset (likely offline). Returning warning fallback.');
            return new Response('console.warn("JS asset load failed due to network error");', {
              status: 200,
              headers: { 'Content-Type': 'application/javascript' }
            });
          }

          // 3. Fallback: match by pathname without query params
          const pathnameMatch = await matchAcrossAllCaches(url.pathname);
          if (pathnameMatch) {
            return pathnameMatch;
          }

          // 4. Benign fallbacks for non-fatal assets to avoid throwing in WebView
          if (url.pathname.endsWith('.css')) {
            return new Response('/* offline fallback css */', {
              status: 200,
              headers: { 'Content-Type': 'text/css' }
            });
          }
          if (url.pathname.endsWith('.svg') || url.pathname.endsWith('.png') || url.pathname.endsWith('.ico')) {
            return new Response('', {
              status: 200,
              headers: { 'Content-Type': 'image/svg+xml' }
            });
          }

          throw fetchErr;
        }
      })()
    );
    return;
  }
});

