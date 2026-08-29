// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
declare global {
  interface Window {
    __updateBootStatus?: (msg: string) => void;
    __showFatalError?: (title: string, err: any) => void;
  }
}

if (typeof window !== 'undefined' && window.__updateBootStatus) {
  window.__updateBootStatus('BOOT: JavaScript loaded');
}

import './services/startup/startupPerformanceLogger';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error and dynamic chunk load recovery handler
if (typeof window !== 'undefined') {
  // 1. Chunk load error detector
  window.addEventListener('error', (event) => {
    const errorMsg = event.message || (event.error && event.error.message) || '';
    const isChunkError =
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('missing or corrupt') ||
      errorMsg.includes('Importing a module script failed');

    if (isChunkError) {
      console.warn('[EXFIN-STARTUP] Dynamic chunk load failure detected:', errorMsg);
      try {
        const reloadKey = 'exfin_chunk_reload_attempt';
        const alreadyAttempted = sessionStorage.getItem(reloadKey);
        if (!alreadyAttempted) {
          sessionStorage.setItem(reloadKey, 'true');
          console.log('[EXFIN-STARTUP] Reloading with fresh cache to resolve chunk version mismatch...');
          window.location.reload();
        }
      } catch (err) {
        console.error('[EXFIN-STARTUP] Error initiating chunk reload recovery:', err);
      }
    }
  });

  // 2. Unhandled rejection logger for production observability
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[EXFIN-OBSERVABILITY] Unhandled Promise Rejection:', event.reason?.message || event.reason);
  });

  // 3. Clear single-recovery marker upon successful startup when online
  if (window.sessionStorage) {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        window.sessionStorage.removeItem('exfin_recovery_attempts');
        window.sessionStorage.removeItem('exfin_chunk_reload_attempt');
      }
    } catch (e) {
      console.error('Failed to clear recovery attempts:', e);
    }
  }
}

if (typeof window !== 'undefined' && window.__updateBootStatus) {
  window.__updateBootStatus('BOOT: React initialization');
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        {(() => {
          if (typeof window !== 'undefined' && window.__updateBootStatus) {
            window.__updateBootStatus('BOOT: React mounted');
          }
          console.log('[OFFLINE-ROOT] React root mounted');
          return <App />;
        })()}
      </StrictMode>,
    );
  } catch (renderErr) {
    console.error('[FATAL] Exception inside createRoot / render:', renderErr);
    if (typeof window !== 'undefined' && window.__showFatalError) {
      window.__showFatalError('React createRoot / render Exception', renderErr);
    }
  }
} else {
  console.error('[FATAL] Root DOM element #root not found in document.');
  if (typeof window !== 'undefined' && window.__showFatalError) {
    window.__showFatalError('DOM Element Missing', '#root div not found in index.html');
  }
}

