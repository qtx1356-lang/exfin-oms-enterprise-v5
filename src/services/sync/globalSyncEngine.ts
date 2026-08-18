import { syncPendingAttendanceRecords } from '../attendance/syncEngine';
import { syncPendingExpenseRecords } from '../expenses/expenseSyncEngine';
import { syncPendingTasks } from '../planner/taskSyncEngine';
import { syncPendingLeaves } from '../leave/leaveSyncEngine';
import { syncPendingProfileChanges } from '../profile/profileService';
import { syncPendingNotifications } from '../notification/notificationService';
import { getDeadLetterQueue, retryDeadLetterItem } from './syncQueueService';
import { setLastSyncTime } from './syncFailureService';
import { logStartupTag } from '../startup/startupPerformanceLogger';
import {
  setSyncRunningState,
  logPerfSyncEvent,
  trackResourceCreated,
  trackResourceCleaned,
} from '../monitoring/performanceDiagnostics';

let isSyncRunning = false;

export const isGlobalSyncInProgress = (): boolean => isSyncRunning;

export const syncAllPendingRecords = async (): Promise<{
  totalSynced: number;
  totalErrors: number;
}> => {
  if (!navigator.onLine) {
    return { totalSynced: 0, totalErrors: 0 };
  }

  // IDEMPOTENT SINGLE-FLIGHT LOCK: Prevent duplicate concurrent sync loops
  if (isSyncRunning) {
    logPerfSyncEvent(
      'PERF_SYNC_SKIPPED_ALREADY_RUNNING',
      'Concurrent sync invocation prevented by active sync coordinator lock'
    );
    return { totalSynced: 0, totalErrors: 0 };
  }

  isSyncRunning = true;
  setSyncRunningState(true);
  const syncWorkerId = `sync_${Date.now()}`;
  trackResourceCreated('SYNC_WORKER', syncWorkerId, 'global_sync_coordinator');
  logPerfSyncEvent('PERF_SYNC_STARTED', 'Single-flight sync coordinator activated');
  logStartupTag('SYNC_STARTED', 'Starting synchronization of all pending offline records');

  let totalSynced = 0;
  let totalErrors = 0;

  try {
    // Retry any failed dead-letter queue items
    const queue = getDeadLetterQueue();
    queue.forEach((item) => {
      if (item.status === 'failed' || item.status === 'pending') {
        retryDeadLetterItem(item.id);
      }
    });

    try {
      const attRes = await syncPendingAttendanceRecords();
      totalSynced += attRes.syncedCount;
      totalErrors += attRes.errorsCount;
    } catch (e) {
      console.error('Global Sync: Error syncing attendance:', e);
      totalErrors += 1;
    }

    try {
      const expRes = await syncPendingExpenseRecords();
      totalSynced += expRes.syncedCount;
      totalErrors += expRes.errorsCount;
    } catch (e) {
      console.error('Global Sync: Error syncing expenses:', e);
      totalErrors += 1;
    }

    try {
      const taskRes = await syncPendingTasks();
      totalSynced += taskRes.syncedCount;
      totalErrors += taskRes.errorsCount;
    } catch (e) {
      console.error('Global Sync: Error syncing tasks:', e);
      totalErrors += 1;
    }

    try {
      const leaveRes = await syncPendingLeaves();
      totalSynced += leaveRes.syncedCount;
      totalErrors += leaveRes.errorsCount;
    } catch (e) {
      console.error('Global Sync: Error syncing leaves:', e);
      totalErrors += 1;
    }

    try {
      const profileRes = await syncPendingProfileChanges();
      totalSynced += profileRes.syncedCount;
      totalErrors += profileRes.errorsCount;
    } catch (e) {
      console.error('Global Sync: Error syncing profile changes:', e);
      totalErrors += 1;
    }

    try {
      await syncPendingNotifications();
    } catch (e) {
      console.error('Global Sync: Error syncing notifications:', e);
    }

    if (totalSynced > 0) {
      setLastSyncTime();
    }

    if (totalErrors > 0 && totalSynced === 0) {
      logStartupTag('SYNC_FAILED', `Sync failed with ${totalErrors} errors`);
    } else {
      logStartupTag('SYNC_COMPLETED', `Sync completed. Synced: ${totalSynced}, Errors: ${totalErrors}`);
    }
  } finally {
    isSyncRunning = false;
    setSyncRunningState(false);
    trackResourceCleaned('SYNC_WORKER', syncWorkerId);
    logPerfSyncEvent(
      'PERF_SYNC_COMPLETED',
      `Single-flight sync completed. Synced: ${totalSynced}, Errors: ${totalErrors}`
    );
    // Dispatch custom event to notify UI components without polling
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-sync-summary-updated'));
    }

    if (totalErrors > 0 && navigator.onLine) {
      console.log('Global Sync: Errors encountered, scheduling controlled background retry in 30 seconds...');
      setTimeout(() => {
        if (navigator.onLine && !isGlobalSyncInProgress()) {
          syncAllPendingRecords();
        }
      }, 30000);
    }
  }

  return { totalSynced, totalErrors };
};

