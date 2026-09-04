// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.

import './services/startup/startupPerformanceLogger';
import React, { Component, StrictMode } from 'react';
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
      console.warn('[OMS-STARTUP] Dynamic chunk load failure detected:', errorMsg);
      try {
        const reloadKey = 'exfin_chunk_reload_attempt';
        const alreadyAttempted = sessionStorage.getItem(reloadKey);
        if (!alreadyAttempted) {
          sessionStorage.setItem(reloadKey, 'true');
          console.log('[OMS-STARTUP] Reloading with fresh cache to resolve chunk version mismatch...');
          window.location.reload();
        }
      } catch (err) {
        console.error('[OMS-STARTUP] Error initiating chunk reload recovery:', err);
      }
    }
  });

  // 2. Unhandled rejection logger for production observability
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[OMS-OBSERVABILITY] Unhandled Promise Rejection:', event.reason?.message || event.reason);
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

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Simple Error Boundary for the root level to catch React rendering errors
class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  public state: RootErrorBoundaryState;
  public declare props: RootErrorBoundaryProps;

  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[FATAL] React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'monospace', color: '#F87171', background: '#0F1025', minHeight: '100vh' }}>
          <h2 style={{ color: '#EF4444' }}>Application Error</h2>
          <p>The application encountered an unexpected error and could not render.</p>
          <pre style={{ background: '#171938', padding: '12px', borderRadius: '8px', overflowX: 'auto', fontSize: '12px' }}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px', background: '#10B981', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <RootErrorBoundary>
          {(() => {
            console.log('[OFFLINE-ROOT] React root mounted');
            return <App />;
          })()}
        </RootErrorBoundary>
      </StrictMode>,
    );
  } catch (renderErr) {
    console.error('[FATAL] Exception inside createRoot / render:', renderErr);
  }
} else {
  console.error('[FATAL] Root DOM element #root not found in document.');
}

