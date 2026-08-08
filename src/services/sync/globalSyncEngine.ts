import { syncPendingAttendanceRecords } from '../attendance/syncEngine';
import { syncPendingExpenseRecords } from '../expenses/expenseSyncEngine';
import { syncPendingTasks } from '../planner/taskSyncEngine';
import { syncPendingLeaves } from '../leave/leaveSyncEngine';
import { syncPendingProfileChanges } from '../profile/profileService';
import { syncPendingNotifications } from '../notification/notificationService';
import { getDeadLetterQueue, retryDeadLetterItem } from './syncQueueService';
import { setLastSyncTime } from './syncFailureService';

export const syncAllPendingRecords = async (): Promise<{
  totalSynced: number;
  totalErrors: number;
}> => {
  if (!navigator.onLine) {
    return { totalSynced: 0, totalErrors: 0 };
  }

  // Retry any failed dead-letter queue items
  const queue = getDeadLetterQueue();
  queue.forEach((item) => {
    if (item.status === 'failed' || item.status === 'pending') {
      retryDeadLetterItem(item.id);
    }
  });

  let totalSynced = 0;
  let totalErrors = 0;

  try {
    const attRes = await syncPendingAttendanceRecords();
    totalSynced += attRes.syncedCount;
    totalErrors += attRes.errorsCount;
  } catch (e) {
    console.error('Global Sync: Error syncing attendance:', e);
  }

  try {
    const expRes = await syncPendingExpenseRecords();
    totalSynced += expRes.syncedCount;
    totalErrors += expRes.errorsCount;
  } catch (e) {
    console.error('Global Sync: Error syncing expenses:', e);
  }

  try {
    const taskRes = await syncPendingTasks();
    totalSynced += taskRes.syncedCount;
    totalErrors += taskRes.errorsCount;
  } catch (e) {
    console.error('Global Sync: Error syncing tasks:', e);
  }

  try {
    const leaveRes = await syncPendingLeaves();
    totalSynced += leaveRes.syncedCount;
    totalErrors += leaveRes.errorsCount;
  } catch (e) {
    console.error('Global Sync: Error syncing leaves:', e);
  }

  try {
    const profileRes = await syncPendingProfileChanges();
    totalSynced += profileRes.syncedCount;
    totalErrors += profileRes.errorsCount;
  } catch (e) {
    console.error('Global Sync: Error syncing profile changes:', e);
  }

  try {
    await syncPendingNotifications();
  } catch (e) {
    console.error('Global Sync: Error syncing notifications:', e);
  }

  if (totalSynced > 0) {
    setLastSyncTime();
  }

  return { totalSynced, totalErrors };
};
