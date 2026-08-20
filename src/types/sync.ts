export type SyncModule =
  | 'Attendance'
  | 'Expenses'
  | 'WorkPlanner'
  | 'Leave'
  | 'Profile'
  | 'Notifications';

export type SyncRecordStatus = 'pending' | 'syncing' | 'failed' | 'resolved';

export interface SyncRecordItem {
  id: string;
  module: SyncModule;
  recordId: string;
  recordType: string;
  createdAtDeviceTime: string;
  status: SyncRecordStatus;
  attemptCount: number;
  lastError?: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  payloadSummary?: string;
  payload?: any;
  isDeadLetter?: boolean;
}

export interface SyncSummary {
  status: 'synced' | 'syncing' | 'offline' | 'sync_failed' | 'pending';
  totalPending: number;
  totalFailed: number;
  lastSyncTime: string | null;
  moduleCounts: Record<SyncModule, { pending: number; failed: number }>;
}

export interface SystemHealthSummary {
  online: boolean;
  firebaseConnected: boolean;
  pendingSyncCount: number;
  failedSyncCount: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  serviceWorkerVersion: string;
  appVersion: string;
  backupStatus: string;
  failedByModule: Record<SyncModule, number>;
  errorFrequencyLast24h: number;
}
