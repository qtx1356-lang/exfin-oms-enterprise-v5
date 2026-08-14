/**
 * Centralized Network Status Service for Exfin OMS
 * Provides clean online/offline event tracking and network error classification.
 */

export type NetworkErrorType = 
  | 'NETWORK_OFFLINE' 
  | 'NETWORK_TIMEOUT' 
  | 'SERVER_ERROR' 
  | 'AUTH_ERROR' 
  | 'PERMISSION_ERROR' 
  | 'FIRESTORE_ERROR' 
  | 'UNKNOWN_ERROR';

export interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  lastOnlineAt: string;
}

type NetworkStatusListener = (status: NetworkStatus) => void;

class NetworkStatusManager {
  private isOnline: boolean;
  private lastOnlineAt: string;
  private listeners: Set<NetworkStatusListener> = new Set();

  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.lastOnlineAt = new Date().toISOString();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  private handleOnline = () => {
    this.isOnline = true;
    this.lastOnlineAt = new Date().toISOString();
    this.notify();
  };

  private handleOffline = () => {
    this.isOnline = false;
    this.notify();
  };

  private notify() {
    const currentStatus = this.getStatus();
    this.listeners.forEach((listener) => {
      try {
        listener(currentStatus);
      } catch (err) {
        console.error('Error in network status listener:', err);
      }
    });
  }

  public getStatus(): NetworkStatus {
    return {
      isOnline: this.isOnline,
      isOffline: !this.isOnline,
      lastOnlineAt: this.lastOnlineAt,
    };
  }

  public subscribe(listener: NetworkStatusListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public classifyError(error: any): NetworkErrorType {
    if (!this.isOnline || (error && error.message && error.message.includes('offline'))) {
      return 'NETWORK_OFFLINE';
    }

    if (!error) return 'UNKNOWN_ERROR';

    const msg = (error.message || '').toLowerCase();
    const code = (error.code || '').toLowerCase();

    if (code.includes('timeout') || msg.includes('timeout') || msg.includes('network request failed')) {
      return 'NETWORK_TIMEOUT';
    }

    if (code.includes('auth/') || code.includes('unauthenticated') || msg.includes('unauthorized') || msg.includes('invalid-credential')) {
      return 'AUTH_ERROR';
    }

    if (code.includes('permission-denied') || msg.includes('insufficient permissions') || msg.includes('access denied')) {
      return 'PERMISSION_ERROR';
    }

    if (code.includes('unavailable') || code.includes('resource-exhausted') || code.includes('firestore')) {
      return 'FIRESTORE_ERROR';
    }

    if (code.includes('500') || msg.includes('internal server error')) {
      return 'SERVER_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }
}

export const networkStatusService = new NetworkStatusManager();
