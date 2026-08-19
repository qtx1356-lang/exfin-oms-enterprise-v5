import { SyncModule, SyncRecordItem, SyncSummary } from '../../types/sync';
import {
  getDeadLetterQueue,
  retryDeadLetterItem,
  removeDeadLetterItem,
  clearDeadLetterQueue,
} from './syncQueueService';
import { getPendingAttendanceRecords, removePendingAttendanceRecord } from '../attendance/attendanceStorage';
import { getPendingExpenseRecords, removePendingExpenseRecord } from '../expenses/expenseStorage';
import { getPendingTasks, removePendingTask } from '../planner/taskStorage';
import { getPendingLeaves, removePendingLeave } from '../leave/leaveStorage';
import {
  getPendingProfileRequests,
  removePendingProfileRequest,
  getPendingPhotoUploads,
  removePendingPhotoUpload,
} from '../profile/profileStorage';
import { getPendingNotifications, removePendingNotification } from '../notification/notificationStorage';
import { syncAllPendingRecords } from './globalSyncEngine';

const LAST_SYNC_TIME_KEY = 'exfin_last_successful_sync_time';

export const setLastSyncTime = (timestamp?: string): void => {
  const ts = timestamp || new Date().toISOString();
  try {
    localStorage.setItem(LAST_SYNC_TIME_KEY, ts);
  } catch (e) {
    console.error('Failed to save last sync time:', e);
  }
};

export const getLastSyncTime = (): string | null => {
  try {
    return localStorage.getItem(LAST_SYNC_TIME_KEY);
  } catch (e) {
    return null;
  }
};

export const getAllSyncRecords = (): SyncRecordItem[] => {
  const deadLetter = getDeadLetterQueue();
  const deadLetterMap = new Map(deadLetter.map((item) => [item.id, item]));

  const records: SyncRecordItem[] = [];

  // 1. Attendance
  const pendingAtt = getPendingAttendanceRecords();
  pendingAtt.forEach((rec) => {
    const key = `Attendance_${rec.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Attendance',
      recordId: rec.id,
      recordType: rec.checkOutTime ? 'Attendance Check-out' : 'Attendance Check-in',
      createdAtDeviceTime: rec.createdAtDeviceTime || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Attendance for ${rec.employeeName || rec.employeeId || 'employee'}`,
      payload: rec,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  // 2. Expenses
  const pendingExp = getPendingExpenseRecords();
  pendingExp.forEach((exp) => {
    const key = `Expenses_${exp.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Expenses',
      recordId: exp.id,
      recordType: `Expense: ${exp.category || 'Claim'}`,
      createdAtDeviceTime: exp.createdAtDeviceTime || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Expense ₹${exp.amount || 0} (${exp.category || 'General'})`,
      payload: exp,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  // 3. WorkPlanner
  const pendingTasks = getPendingTasks();
  pendingTasks.forEach((task) => {
    const key = `WorkPlanner_${task.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'WorkPlanner',
      recordId: task.id,
      recordType: `Task: ${task.title || 'Work Task'}`,
      createdAtDeviceTime: task.createdAtDeviceTime || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Task "${task.title}"`,
      payload: task,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  // 4. Leave
  const pendingLeaves = getPendingLeaves();
  pendingLeaves.forEach((leave) => {
    const key = `Leave_${leave.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Leave',
      recordId: leave.id,
      recordType: `Leave Request (${leave.totalDays} Days)`,
      createdAtDeviceTime: leave.createdAtDeviceTime || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Leave (${leave.startDate} to ${leave.endDate})`,
      payload: leave,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  // 5. Profile
  const pendingReqs = getPendingProfileRequests();
  pendingReqs.forEach((req) => {
    const key = `Profile_${req.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Profile',
      recordId: req.id,
      recordType: `Profile Request: ${req.fieldLabel}`,
      createdAtDeviceTime: req.createdAtDeviceTime || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Request to change ${req.fieldLabel} to ${req.requestedValue}`,
      payload: req,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  const pendingPhotos = getPendingPhotoUploads();
  pendingPhotos.forEach((photo) => {
    const key = `Profile_Photo_${photo.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Profile',
      recordId: photo.id,
      recordType: 'Profile Photo Upload',
      createdAtDeviceTime: photo.timestamp || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Photo upload for ${photo.employeeCode}`,
      payload: { ...photo, base64Data: '[IMAGE_DATA]' },
      isDeadLetter: dl?.status === 'failed',
    });
  });

  // 6. Notifications
  const pendingNotifs = getPendingNotifications();
  pendingNotifs.forEach((notif) => {
    const key = `Notifications_${notif.id}`;
    const dl = deadLetterMap.get(key);
    records.push({
      id: key,
      module: 'Notifications',
      recordId: notif.id,
      recordType: `Notification: ${notif.title || 'Alert'}`,
      createdAtDeviceTime: notif.createdAtDeviceTime || notif.timestamp || new Date().toISOString(),
      status: dl ? (dl.status === 'failed' ? 'failed' : dl.status) : 'pending',
      attemptCount: dl ? dl.attemptCount : 0,
      lastError: dl?.failureReason || undefined,
      lastAttemptAt: dl?.lastAttemptAt || undefined,
      nextRetryAt: dl?.nextRetryAt || undefined,
      payloadSummary: dl?.payloadSummary || `Alert "${notif.title}"`,
      payload: notif,
      isDeadLetter: dl?.status === 'failed',
    });
  });

  return records;
};

export const getSyncSummary = (): SyncSummary => {
  const records = getAllSyncRecords();
  const online = navigator.onLine;

  let totalPending = 0;
  let totalFailed = 0;

  const moduleCounts: Record<SyncModule, { pending: number; failed: number }> = {
    Attendance: { pending: 0, failed: 0 },
    Expenses: { pending: 0, failed: 0 },
    WorkPlanner: { pending: 0, failed: 0 },
    Leave: { pending: 0, failed: 0 },
    Profile: { pending: 0, failed: 0 },
    Notifications: { pending: 0, failed: 0 },
  };

  records.forEach((r) => {
    if (r.status === 'failed' || r.isDeadLetter) {
      totalFailed++;
      moduleCounts[r.module].failed++;
    } else {
      totalPending++;
      moduleCounts[r.module].pending++;
    }
  });

  let status: SyncSummary['status'] = 'synced';
  if (!online) {
    status = 'offline';
  } else if (totalFailed > 0) {
    status = 'sync_failed';
  } else if (totalPending > 0) {
    status = 'pending';
  }

  return {
    status,
    totalPending,
    totalFailed,
    lastSyncTime: getLastSyncTime(),
    moduleCounts,
  };
};

export const retrySyncRecord = async (recordId: string): Promise<boolean> => {
  retryDeadLetterItem(recordId);
  const result = await syncAllPendingRecords();
  if (result.totalSynced > 0) {
    setLastSyncTime();
  }
  return result.totalErrors === 0;
};

export const retryAllSyncRecords = async (): Promise<{ totalSynced: number; totalErrors: number }> => {
  const deadLetter = getDeadLetterQueue();
  deadLetter.forEach((item) => {
    retryDeadLetterItem(item.id);
  });
  const res = await syncAllPendingRecords();
  if (res.totalSynced > 0) {
    setLastSyncTime();
  }
  return res;
};

export const safeRemoveSyncRecord = (record: SyncRecordItem): void => {
  removeDeadLetterItem(record.id);

  switch (record.module) {
    case 'Attendance':
      removePendingAttendanceRecord(record.recordId);
      break;
    case 'Expenses':
      removePendingExpenseRecord(record.recordId);
      break;
    case 'WorkPlanner':
      removePendingTask(record.recordId);
      break;
    case 'Leave':
      removePendingLeave(record.recordId);
      break;
    case 'Profile':
      removePendingProfileRequest(record.recordId);
      removePendingPhotoUpload(record.recordId);
      break;
    case 'Notifications':
      removePendingNotification(record.recordId);
      break;
  }
};
