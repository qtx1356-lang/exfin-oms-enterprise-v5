import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

function swPrecachePlugin(): Plugin {
  return {
    name: 'sw-precache-plugin',
    closeBundle() {
      try {
        const distDir = path.resolve(__dirname, 'dist');
        const assetsDir = path.resolve(distDir, 'assets');
        const swPath = path.resolve(distDir, 'service-worker.js');
        const indexHtmlPath = path.resolve(distDir, 'index.html');

        if (fs.existsSync(swPath)) {
          let assetPaths: string[] = [];
          if (fs.existsSync(assetsDir)) {
            const files = fs.readdirSync(assetsDir);
            assetPaths = files
              .filter((f) => !f.endsWith('.map'))
              .map((f) => `/assets/${f}`);
          }

          let swContent = fs.readFileSync(swPath, 'utf-8');
          const precacheArrayStr = JSON.stringify(
            [
              '/',
              '/index.html',
              '/manifest.json',
              '/manifest-icon-192.png',
              '/manifest-icon-512.png',
              '/favicon.ico',
              ...assetPaths
            ],
            null,
            2
          );

          // 1. Inject PRECACHE_ASSETS
          swContent = swContent.replace(
            /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
            `const PRECACHE_ASSETS = ${precacheArrayStr};`
          );

          // 2. Inject dynamic build version for CACHE_NAME to guarantee fresh cache on deployment
          const buildHash = Date.now().toString(36);
          const cacheVersion = `exfin-oms-v${buildHash}`;
          swContent = swContent.replace(
            /const CACHE_NAME = ['"][^'"]*['"];/,
            `const CACHE_NAME = '${cacheVersion}';`
          );

          // 3. Inject embedded Fallback App Shell HTML
          if (fs.existsSync(indexHtmlPath)) {
            const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');
            swContent = swContent.replace(
              /let fallbackAppShellText = '';/,
              `let fallbackAppShellText = ${JSON.stringify(indexHtmlContent)};`
            );
          }

          fs.writeFileSync(swPath, swContent, 'utf-8');
          console.log(`[SW Plugin] Injected ${assetPaths.length} build assets & embedded fallback app shell into dist/service-worker.js (Cache: ${cacheVersion})`);
        }
      } catch (err) {
        console.warn('[SW Plugin] Error injecting precache assets:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    },
    plugins: [react(), tailwindcss(), swPrecachePlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) {
                return 'vendor-pdf';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('@capacitor')) {
                return 'vendor-capacitor';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});