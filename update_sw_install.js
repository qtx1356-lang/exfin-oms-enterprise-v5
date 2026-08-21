const fs = require('fs');

let sw = fs.readFileSync('public/service-worker.js', 'utf8');

const newInstall = `self.addEventListener('install', (event) => {
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
          const scriptMatches = indexHtmlText.matchAll(/src=["'](\\/assets\\/[^"']+)["']/g);
          for (const match of scriptMatches) {
            assetUrls.add(match[1]);
          }
          const cssMatches = indexHtmlText.matchAll(/href=["'](\\/assets\\/[^"']+)["']/g);
          for (const match of cssMatches) {
            assetUrls.add(match[1]);
          }
          
          if (assetUrls.size > 0) {
            const dynamicFetchPromises = Array.from(assetUrls).map(async (url) => {
              const assetRes = await fetch(url, { cache: 'no-cache' });
              if (assetRes && (assetRes.status === 200 || assetRes.status === 0)) {
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
});`;

// Replace from self.addEventListener('install', ...) until the end of that block
sw = sw.replace(/self\.addEventListener\('install',[\s\S]+?(?=\/\/ Activate Event)/, newInstall + '\n\n');

fs.writeFileSync('public/service-worker.js', sw);
console.log("Updated service-worker.js install phase.");
