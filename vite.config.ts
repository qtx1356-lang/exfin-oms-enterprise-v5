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
        if (fs.existsSync(assetsDir) && fs.existsSync(swPath)) {
          const files = fs.readdirSync(assetsDir);
          const assetPaths = files
            .filter((f) => !f.endsWith('.map'))
            .map((f) => `/assets/${f}`);

          let swContent = fs.readFileSync(swPath, 'utf-8');
          const precacheArrayStr = JSON.stringify(
            ['/', '/index.html', '/manifest.json', '/favicon.ico', ...assetPaths],
            null,
            2
          );

          swContent = swContent.replace(
            /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
            `const PRECACHE_ASSETS = ${precacheArrayStr};`
          );

          fs.writeFileSync(swPath, swContent, 'utf-8');
          console.log(`[SW Plugin] Injected ${assetPaths.length} build assets into dist/service-worker.js precache`);
        }
      } catch (err) {
        console.warn('[SW Plugin] Error injecting precache assets:', err);
      }
    },
  };
}

export default defineConfig(() => {
  return {
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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'vendor-firebase';
              if (id.includes('@capacitor')) return 'vendor-capacitor';
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
              return 'vendor';
            }
            if (id.includes('/src/features/admin/') || id.includes('/src/features/adminPortal/')) {
              return 'admin-features';
            }
            if (id.includes('/src/features/') || id.includes('/src/services/') || id.includes('/src/context/')) {
              return 'core-app';
            }
          }
        }
      }
    }
  };
});
