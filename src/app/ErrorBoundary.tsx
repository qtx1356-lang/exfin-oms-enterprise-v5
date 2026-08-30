import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[EXFIN-FATAL] React Error Boundary caught unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('exfin_chunk_reload_attempt');
        window.sessionStorage.removeItem('exfin_recovery_attempts');
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  private handleHardReset = async () => {
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      window.sessionStorage.clear();
      window.location.href = '/';
    } catch {
      window.location.reload();
    }
  };

  private sanitizeErrorMessage(msg?: string): string {
    if (!msg) return 'An unexpected application startup error occurred.';
    return msg
      .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
      .replace(/eyJ[0-9A-Za-z-_]+\.[0-9A-Za-z-_]+\.[0-9A-Za-z-_]+/g, '[REDACTED_JWT]');
  }

  public render() {
    if (this.state.hasError) {
      const sanitizedMessage = this.sanitizeErrorMessage(this.state.error?.message);

      return (
        <div className="min-h-screen bg-[var(--app-background)] text-[var(--text-primary)] flex flex-col items-center justify-center p-4 font-sans">
          <div className="bg-[var(--app-background-secondary)] p-6 rounded-2xl max-w-xl w-full shadow-2xl border border-rose-500/40">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-black">
                !
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Application Failed to Start</h2>
                <p className="text-xs text-slate-400">A runtime error prevented the application from rendering.</p>
              </div>
            </div>

            <div className="glass-inner-tile p-4 rounded-xl text-xs text-rose-200 mb-5 overflow-auto max-h-64 font-mono border border-rose-500/20">
              <p className="font-bold text-rose-300 mb-1">ERROR: {sanitizedMessage}</p>
              {this.state.error?.stack && (
                <p className="text-slate-400 text-[11px] leading-relaxed whitespace-pre-wrap">
                  {this.sanitizeErrorMessage(this.state.error.stack.split('\n').slice(0, 5).join('\n'))}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg text-center"
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleHardReset}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded-xl text-xs border border-slate-700 transition-colors text-center"
              >
                Clear Cache & Restart
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

