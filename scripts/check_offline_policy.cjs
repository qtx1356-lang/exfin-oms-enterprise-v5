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

// 2. Verify MainActivity.java does not contain native OFFLINE_HTML or loadDataWithBaseURL replacement
const mainActivityPaths = [
  path.join(ROOT_DIR, 'android/app/src/main/java/com/exfin/oms/MainActivity.java'),
  path.join(ROOT_DIR, 'Exfin-OMS-Codester/android/app/src/main/java/com/exfin/oms/MainActivity.java')
];

mainActivityPaths.forEach((maPath, idx) => {
  const label = idx === 0 ? 'Primary' : 'Codester Backup';
  runCheck(`MainActivity (${label}): Zero native OFFLINE_HTML replacement checks`, () => {
    if (fs.existsSync(maPath)) {
      const content = fs.readFileSync(maPath, 'utf8');
      if (content.includes('OFFLINE_HTML')) {
        throw new Error(`MainActivity contains hardcoded OFFLINE_HTML which could replace the React app on error. Check path: ${maPath}`);
      }
      if (content.includes('loadDataWithBaseURL')) {
        throw new Error(`MainActivity contains loadDataWithBaseURL call which could destroy the loaded React app. Check path: ${maPath}`);
      }
      if (!content.includes('BridgeActivity') || !content.includes('GeofencePlugin.class')) {
        throw new Error(`MainActivity is missing required BridgeActivity or GeofencePlugin initialization: ${maPath}`);
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

// 4. Verify public/service-worker.js does not contain OFFLINE_FALLBACK_HTML or manufactured offline pages
const swPaths = [
  path.join(ROOT_DIR, 'public/service-worker.js'),
  path.join(ROOT_DIR, 'Exfin-OMS-Codester/source-code/public/service-worker.js')
];

swPaths.forEach((swPath, idx) => {
  const label = idx === 0 ? 'Primary' : 'Codester Backup';
  runCheck(`Service Worker (${label}): Check zero OFFLINE_FALLBACK_HTML and valid shell caching`, () => {
    if (fs.existsSync(swPath)) {
      const content = fs.readFileSync(swPath, 'utf8');
      if (content.includes('OFFLINE_FALLBACK_HTML')) {
        throw new Error(`Service Worker at ${swPath} contains OFFLINE_FALLBACK_HTML which generates a full-screen offline page.`);
      }
      if (!content.includes('/index.html')) {
        throw new Error(`Service Worker at ${swPath} is missing required application shell /index.html caching.`);
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
