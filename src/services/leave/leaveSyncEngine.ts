import { doc, setDoc, collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase/config';
import { LeaveRecord, LeaveConfig, EmployeeAllowance } from '../../types/leave';
import {
  getPendingLeaves,
  markLeaveSynced,
  markLeaveSyncFailed,
  saveMultipleLeaves,
  saveLeaveConfig,
  saveEmployeeAllowances,
} from './leaveStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';
import {
  logSyncStart,
  logSyncLocalUpdate,
  logSyncServerWrite,
  logSyncServerConfirm,
  logSyncComplete,
} from '../sync/syncPerformanceLogger';

export interface LeaveSyncScopeOptions {
  employeeCode?: string;
  department?: string;
  isTeamLeader?: boolean;
  isAdminOrHR?: boolean;
}

export const syncPendingLeaves = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Leave Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Leave Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pendingLeaves = getPendingLeaves();
  if (pendingLeaves.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Leave Sync Engine: Found ${pendingLeaves.length} pending leave records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const leave of pendingLeaves) {
    let attempt = 0;
    let success = false;
    const maxAttempts = 3;

    logSyncStart('Leave', leave.id);
    logSyncLocalUpdate('Leave', leave.id);

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        logSyncServerWrite('Leave', leave.id);
        const docRef = doc(db, 'leaves', leave.id);
        const serverSyncTime = new Date().toISOString();

        // Direct surgical merge write without roundtrip getDoc
        const firestorePayload: Partial<LeaveRecord> = {
          ...leave,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          updatedAtDeviceTime: leave.updatedAtDeviceTime || new Date().toISOString(),
        };

        await setDoc(docRef, firestorePayload, { merge: true });

        logSyncServerConfirm('Leave', leave.id);
        recordSyncSuccess('Leave', leave.id);
        markLeaveSynced(leave.id, serverSyncTime);
        logSyncComplete('Leave', leave.id);

        syncedCount++;
        success = true;
      } catch (err: any) {
        console.error(
          `Leave Sync Engine: Error syncing leave ID ${leave.id} (Attempt ${attempt}/${maxAttempts}):`,
          err
        );

        if (attempt < maxAttempts) {
          const backoffMs = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
          await new Promise((res) => setTimeout(res, backoffMs));
        } else {
          recordSyncFailure(
            'Leave',
            leave.id,
            err?.message || 'Leave sync failed',
            `Leave ${leave.startDate} to ${leave.endDate}`,
            leave.employeeCode,
            leave
          );
          markLeaveSyncFailed(leave.id);
          errorsCount++;
        }
      }
    }
  }

  return { syncedCount, errorsCount };
};

// Start real-time sync listeners for leaves and settings with scoped queries
export const startLeaveSyncListeners = (options?: LeaveSyncScopeOptions): (() => void) => {
  if (!db) return () => {};

  let leavesQ;
  if (options?.isAdminOrHR) {
    leavesQ = query(collection(db, 'leaves'), limit(300));
  } else if (options?.isTeamLeader && options?.department) {
    leavesQ = query(collection(db, 'leaves'), where('office', '==', options.department));
  } else if (options?.employeeCode) {
    leavesQ = query(collection(db, 'leaves'), where('employeeCode', '==', options.employeeCode));
  } else {
    leavesQ = query(collection(db, 'leaves'), limit(50));
  }

  const unsubLeaves = onSnapshot(
    leavesQ,
    (snapshot) => {
      const serverLeaves: LeaveRecord[] = [];
      snapshot.forEach((docSnap) => {
        serverLeaves.push(docSnap.data() as LeaveRecord);
      });
      saveMultipleLeaves(serverLeaves);
    },
    (err) => {
      console.error('Leave Sync Engine: Error subscribing to leaves collection:', err);
    }
  );

  const unsubConfig = onSnapshot(
    doc(db, 'system_settings', 'leave_settings'),
    (docSnap) => {
      if (docSnap.exists()) {
        saveLeaveConfig(docSnap.data() as LeaveConfig);
      }
    },
    (err) => {
      console.error('Leave Sync Engine: Error subscribing to leave settings config:', err);
    }
  );

  let allowancesQ;
  if (options?.employeeCode && !options.isAdminOrHR) {
    allowancesQ = query(collection(db, 'leave_balances'), where('employeeCode', '==', options.employeeCode));
  } else {
    allowancesQ = query(collection(db, 'leave_balances'), limit(100));
  }

  const unsubAllowances = onSnapshot(
    allowancesQ,
    (snapshot) => {
      const serverAllowances: EmployeeAllowance[] = [];
      snapshot.forEach((docSnap) => {
        serverAllowances.push(docSnap.data() as EmployeeAllowance);
      });
      saveEmployeeAllowances(serverAllowances);
    },
    (err) => {
      console.error('Leave Sync Engine: Error subscribing to leave balances collection:', err);
    }
  );

  return () => {
    unsubLeaves();
    unsubConfig();
    unsubAllowances();
  };
};

export const startLeaveAutoSyncEngine = (options?: LeaveSyncScopeOptions): (() => void) => {
  const handleOnline = () => {
    console.log('Leave Sync Engine: Connectivity restored. Syncing pending leaves...');
    syncPendingLeaves();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('Leave Sync Engine: App returned to foreground. Syncing pending leaves...');
      syncPendingLeaves();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  if (navigator.onLine) {
    syncPendingLeaves();
  }

  const unsubListeners = startLeaveSyncListeners(options);

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    unsubListeners();
  };
};
