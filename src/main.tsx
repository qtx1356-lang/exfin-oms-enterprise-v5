// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import './services/startup/startupPerformanceLogger';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && window.location.search.indexOf('boottest=2') !== -1) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="min-height: 100vh; background-color: #0F1025; color: #FFFFFF; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
        <div style="background-color: #1E1F41; border: 1px solid #10B981; border-radius: 20px; padding: 40px; max-width: 500px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <h1 style="color: #10B981; font-weight: 900; font-size: 24px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 2px;">Exfin Module Boot Test</h1>
          <div style="background-color: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 12px; padding: 20px; margin-bottom: 25px; font-family: monospace; font-size: 13px; text-align: left; line-height: 1.6; color: #34D399;">
            <p style="margin: 0;">🌐 URL: ${window.location.href}</p>
            <p style="margin: 5px 0 0 0;">📦 JS Bundle Parse: OK</p>
            <p style="margin: 5px 0 0 0;">⚡ main.tsx Entry: EXECUTED OK</p>
          </div>
          <p style="color: #B9B9D0; font-size: 14px; line-height: 1.5; margin-bottom: 30px;">
            This confirms that the browser successfully downloaded and parsed the compiled JS bundle file, and executed the first line of the application entry point.
          </p>
          <button onclick="window.location.search = ''" style="background-image: linear-gradient(to right, #059669, #10B981); color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: bold; font-size: 13px; cursor: pointer; transition: opacity 0.2s;">
            Return to Normal App
          </button>
        </div>
      </div>
    `;
    throw new Error('STOP_RENDER_MODULE_BOOT_TEST');
  }
}

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
