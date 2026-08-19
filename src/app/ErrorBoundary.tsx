import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    (this as any).setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const errMsg = (this.state.error?.message || '').toLowerCase();
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      // Check if this is a transient chunk/import/fetch error
      const isTransientError = 
        errMsg.includes('chunk') ||
        errMsg.includes('import') ||
        errMsg.includes('failed to load') ||
        errMsg.includes('fetch') ||
        errMsg.includes('network') ||
        errMsg.includes('offline');

      // If the device is online but we encountered a transient fetch/chunk/network error,
      // attempt an internal automatic recovery (reload) once to restore startup state
      if (typeof navigator !== 'undefined' && navigator.onLine && isTransientError) {
        try {
          const lastReload = sessionStorage.getItem('last_transient_error_reload');
          const now = Date.now();
          if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
            sessionStorage.setItem('last_transient_error_reload', now.toString());
            console.warn('ErrorBoundary: Caught transient fetch/chunk error while online. Retrying/recovering internally...', this.state.error);
            window.location.reload();
            return null; // Render nothing while the page reloads
          }
        } catch (e) {
          console.error('Failed to perform automatic recovery:', e);
        }
      }

      if (isOffline) {
        return (
          <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex flex-col items-center justify-center p-6 box-border font-sans">
            <div className="bg-[#1e293b] border border-purple-500/30 rounded-[20px] p-8 max-w-[360px] w-full text-center shadow-2xl">
              <div className="text-4xl mb-4">📡</div>
              <h1 className="text-xl font-bold text-white mb-2">You're offline</h1>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Check your internet connection and try again.
              </p>
              <button 
                onClick={this.handleRetry}
                className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-3 px-6 rounded-xl text-sm font-semibold transition-colors shadow-md cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex flex-col items-center justify-center p-6 box-border font-sans">
          <div className="bg-[#1e293b] border border-purple-500/30 rounded-[20px] p-8 max-w-[360px] w-full text-center shadow-2xl">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              An unexpected error occurred. Please try reloading the application.
            </p>
            <button 
              onClick={this.handleRetry}
              className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white py-3 px-6 rounded-xl text-sm font-semibold transition-colors shadow-md cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

