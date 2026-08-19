/**
 * EXFIN OMS Static Policy & Regression Checker
 * Verifies that the core offline-first startup and zero URL exposure constraints are satisfied.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;

function runCheck(name, fn) {
  totalChecks++;
  console.log(`[CHECK] ${name}...`);
  try {
    fn();
    console.log(`  => PASS\n`);
    passedChecks++;
  } catch (err) {
    console.error(`  => FAIL: ${err.message}\n`);
  }
}

// 1. Verify capacitor.config.ts has no server.url redirect
runCheck('Capacitor Config: No server.url redirects', () => {
  const capConfigPath = path.join(ROOT_DIR, 'capacitor.config.ts');
  if (fs.existsSync(capConfigPath)) {
    const content = fs.readFileSync(capConfigPath, 'utf8');
    if (content.includes('url:') && !content.includes('//')) {
      throw new Error('Detected active server.url parameter in capacitor.config.ts! This forces remote loading and breaks offline startup.');
    }
  } else {
    console.log('  (capacitor.config.ts not found in root, skipping)');
  }
});

// 2. Verify MainActivity.java main-frame error protection
const mainActivityPaths = [
  path.join(ROOT_DIR, 'android/app/src/main/java/com/exfin/oms/MainActivity.java'),
  path.join(ROOT_DIR, 'Exfin-OMS-Codester/android/app/src/main/java/com/exfin/oms/MainActivity.java')
];

mainActivityPaths.forEach((maPath, idx) => {
  const label = idx === 0 ? 'Primary' : 'Codester Backup';
  runCheck(`MainActivity (${label}): Main-frame subresource protection checks`, () => {
    if (fs.existsSync(maPath)) {
      const content = fs.readFileSync(maPath, 'utf8');
      if (!content.includes('failingUrl.equals("https://localhost")') || !content.includes('endsWith("/index.html")')) {
        throw new Error(`MainActivity is missing the mandatory check to ensure subresource errors do not wipe out the React page. Check path: ${maPath}`);
      }
      if (!content.includes('onReceivedSslError') || !content.includes('error.getUrl()')) {
        throw new Error('MainActivity is missing SSL error frame checking, which could allow external resource SSL errors to trigger a false offline page.');
      }
    } else {
      console.log(`  (MainActivity not found at ${maPath}, skipping)`);
    }
  });
});

// 3. Verify ErrorBoundary.tsx does not leak raw technical error fields in UI
const boundaryPaths = [
  path.join(ROOT_DIR, 'src/app/ErrorBoundary.tsx'),
  path.join(ROOT_DIR, 'Exfin-OMS-Codester/source-code/src/app/ErrorBoundary.tsx')
];

boundaryPaths.forEach((ebPath, idx) => {
  const label = idx === 0 ? 'Primary' : 'Codester Backup';
  runCheck(`ErrorBoundary (${label}): No raw technical error rendering in UI`, () => {
    if (fs.existsSync(ebPath)) {
      const content = fs.readFileSync(ebPath, 'utf8');
      
      // Match typical UI rendering patterns
      if (content.includes('{this.state.error?.message}') || content.includes('{this.state.error?.stack}')) {
        throw new Error(`Detected potential raw error/stack trace rendering in: ${ebPath}`);
      }
      if (content.includes('error.toString()') && !content.includes('console.')) {
        throw new Error(`Detected potential user-facing error.toString() call in UI rendering: ${ebPath}`);
      }
    } else {
      console.log(`  (ErrorBoundary not found at ${ebPath}, skipping)`);
    }
  });
});

// 4. Verify public/service-worker.js OFFLINE_FALLBACK_HTML doesn't contain URLs
const swPaths = [
  path.join(ROOT_DIR, 'public/service-worker.js'),
  path.join(ROOT_DIR, 'Exfin-OMS-Codester/source-code/public/service-worker.js')
];

swPaths.forEach((swPath, idx) => {
  const label = idx === 0 ? 'Primary' : 'Codester Backup';
  runCheck(`Service Worker (${label}): Check zero URL exposure in OFFLINE_FALLBACK_HTML`, () => {
    if (fs.existsSync(swPath)) {
      const content = fs.readFileSync(swPath, 'utf8');
      const match = content.match(/const OFFLINE_FALLBACK_HTML = `([\s\S]*?)`;/);
      if (match) {
        const fallbackHtml = match[1];
        if (fallbackHtml.includes('http://') || fallbackHtml.includes('https://') || fallbackHtml.includes('localhost')) {
          throw new Error(`OFFLINE_FALLBACK_HTML in ${swPath} contains exposed URL endpoints or localhost keywords in UI.`);
        }
      }
    } else {
      console.log(`  (Service worker not found at ${swPath}, skipping)`);
    }
  });
});

console.log(`=== POLICY CHECK COMPLETED: ${passedChecks}/${totalChecks} PASSED ===`);
if (passedChecks < totalChecks) {
  process.exit(1);
} else {
  process.exit(0);
}
