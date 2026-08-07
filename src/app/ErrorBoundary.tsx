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
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
          <div className="bg-surface-variant p-6 rounded-2xl max-w-md w-full shadow-sm">
            <h2 className="text-xl font-bold text-on-primary-container mb-2">Something went wrong</h2>
            <p className="text-sm text-outline mb-4">The application encountered an unexpected error.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-primary text-on-primary px-4 py-2 rounded-full font-medium text-sm hover:opacity-90 transition-opacity"
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
