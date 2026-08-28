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
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] flex flex-col items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] p-6 rounded-2xl max-w-2xl w-full shadow-2xl border border-rose-500/40">
            <h2 className="text-xl font-bold text-rose-400 mb-2">Application Exception Caught</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">The application encountered an unhandled runtime error:</p>
            {this.state.error && (
              <div className="bg-rose-950/80 p-4 rounded-xl text-xs text-rose-200 mb-4 overflow-auto max-h-96 font-mono whitespace-pre-wrap border border-rose-500/30">
                <p className="font-bold text-rose-300 mb-1">ERROR: {this.state.error.message}</p>
                <p className="text-rose-400/80 text-[11px] font-mono leading-relaxed">{this.state.error.stack}</p>
              </div>
            )}
            <button 
              onClick={() => window.location.reload()}
              className="bg-[var(--primary)] text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-[var(--primary-dark)] transition-colors shadow-lg"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}
