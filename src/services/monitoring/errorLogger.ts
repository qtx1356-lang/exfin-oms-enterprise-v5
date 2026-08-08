export interface AppErrorLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  module: string;
  message: string;
  details?: any;
  userCode?: string;
}

const LOGS_STORAGE_KEY = 'exfin_app_error_logs_v1';

export const getAppErrorLogs = (): AppErrorLog[] => {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
};

export const logAppError = (
  level: 'INFO' | 'WARN' | 'ERROR',
  module: string,
  message: string,
  details?: any,
  userCode?: string
): AppErrorLog => {
  const logs = getAppErrorLogs();
  const logItem: AppErrorLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : undefined,
    userCode: userCode || 'ANONYMOUS',
  };

  // Keep max 200 logs locally
  const updatedLogs = [logItem, ...logs].slice(0, 200);
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(updatedLogs));
  } catch (err) {
    console.error('Failed to save log to localStorage:', err);
  }

  return logItem;
};

export const clearAppErrorLogs = (): void => {
  try {
    localStorage.removeItem(LOGS_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear error logs:', err);
  }
};
