import { collection, addDoc } from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { APP_VERSION } from '../../config/version';

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  category: 'runtime' | 'firebase' | 'sync' | 'permission' | 'storage' | 'unhandled';
  severity: 'info' | 'warning' | 'error' | 'critical';
  context?: Record<string, any>;
  appVersion: string;
}

const STORAGE_KEY = 'exfin_error_logs_v1';
const MAX_LOGS = 100;

function sanitizeObject(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('credential') ||
      lowerKey.includes('apikey') ||
      lowerKey.includes('auth')
    ) {
      redacted[key] = '***REDACTED***';
    } else if (typeof value === 'object') {
      redacted[key] = sanitizeObject(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export const getRecentErrors = (): ErrorLogEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to parse local error logs:', err);
    return [];
  }
};

export const getLastError = (): ErrorLogEntry | null => {
  const logs = getRecentErrors();
  return logs.length > 0 ? logs[0] : null;
};

export const clearErrorLogs = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear error logs:', e);
  }
};

export const logError = (
  error: Error | string,
  category: ErrorLogEntry['category'] = 'runtime',
  severity: ErrorLogEntry['severity'] = 'error',
  context?: Record<string, any>
): void => {
  try {
    const message = typeof error === 'string' ? error : error?.message || 'Unknown error';
    const stack = typeof error === 'object' && error?.stack ? error.stack : undefined;
    const sanitizedContext = context ? sanitizeObject(context) : undefined;

    const entry: ErrorLogEntry = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      message,
      stack,
      category,
      severity,
      context: sanitizedContext,
      appVersion: APP_VERSION,
    };

    // Store in localStorage
    const logs = getRecentErrors();
    logs.unshift(entry);
    if (logs.length > MAX_LOGS) {
      logs.length = MAX_LOGS;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (err) {
      console.warn('Failed to write error log to localStorage:', err);
    }

    // Best effort Firestore sync
    if (navigator.onLine && severity === 'critical') {
      (async () => {
        try {
          const activeDb = await getDb();
          if (activeDb) {
            await addDoc(collection(activeDb, 'system_error_logs'), entry);
          }
        } catch (e) {
          console.warn('Firestore error log upload failed:', e);
        }
      })();
    }
  } catch (outerErr) {
    // Non-blocking catch all
    console.warn('Error inside errorLogger:', outerErr);
  }
};

// Auto register global listeners
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    logError(
      event.error || event.message || 'Global Window Error',
      'unhandled',
      'error',
      { filename: event.filename, lineno: event.lineno, colno: event.colno }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError(
      event.reason instanceof Error ? event.reason : String(event.reason || 'Unhandled Promise Rejection'),
      'unhandled',
      'warning'
    );
  });
}
