// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import './services/startup/startupPerformanceLogger';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';


// Clear SW single-recovery marker upon successful startup (only when online)
if (typeof window !== 'undefined' && window.sessionStorage) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      window.sessionStorage.removeItem('exfin_recovery_attempts');
    }
  } catch (e) {
    console.error('Failed to clear recovery attempts:', e);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {(() => {
      console.log('[OFFLINE-ROOT] React root mounted');
      return <App />;
    })()}
  </StrictMode>,
);
