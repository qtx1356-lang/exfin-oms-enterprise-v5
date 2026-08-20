const fs = require('fs');
let code = fs.readFileSync('public/service-worker.js', 'utf8');
code = code.replace(`            if (!response || response.status !== 200) {
              return response;
            }
            const responseToCache = response.clone();`, `            if (!response || response.status !== 200) {
              return response;
            }
            const contentType = response.headers.get('content-type');
            if (url.pathname.endsWith('.js') && contentType && contentType.includes('text/html')) {
              console.warn('[SW] SPA fallback detected for JS chunk. Returning offline cache fallback.');
              return caches.match(url.pathname);
            }
            const responseToCache = response.clone();`);
fs.writeFileSync('public/service-worker.js', code);
