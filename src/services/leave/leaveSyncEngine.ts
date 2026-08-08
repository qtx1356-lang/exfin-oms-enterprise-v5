import { doc, getDoc, setDoc, collection, onSnapshot, query, where, limit } from 'firebase/firestore';
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

export interface LeaveSyncScopeOptions {
  employeeCode?: string;
  department?: string;
  isTeamLeader?: boolean;
  isAdminOrHR?: boolean;
}

export const syncPendingLeaves = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Leave Sync Engine: Device is offline. Skipping sync.');
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
    try {
      const docRef = doc(db, 'leaves', leave.id);
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      if (!docSnap.exists()) {
        const firestorePayload: LeaveRecord = {
          ...leave,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          createdAtDeviceTime: leave.createdAtDeviceTime,
          updatedAtDeviceTime: leave.updatedAtDeviceTime || new Date().toISOString(),
        };

        await setDoc(docRef, firestorePayload);
        console.log(`Leave Sync Engine: Successfully synced leave ID ${leave.id}`);
      } else {
        const existingData = docSnap.data() as LeaveRecord;
        await setDoc(
          docRef,
          {
            ...leave,
            syncStatus: 'Synced',
            serverSyncTime: serverSyncTime,
            createdAtDeviceTime: existingData.createdAtDeviceTime || leave.createdAtDeviceTime,
            updatedAtDeviceTime: leave.updatedAtDeviceTime || new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(`Leave Sync Engine: Updated synced leave ID ${leave.id}`);
      }

      recordSyncSuccess('Leave', leave.id);
      markLeaveSynced(leave.id, serverSyncTime);
      syncedCount++;
    } catch (err: any) {
      console.error(`Leave Sync Engine: Error syncing leave ID ${leave.id}:`, err);
      recordSyncFailure('Leave', leave.id, err?.message || 'Leave sync failed', `Leave ${leave.startDate} to ${leave.endDate}`);
      markLeaveSyncFailed(leave.id);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};

// Start real-time sync listeners for leaves and settings with scoped queries
export const startLeaveSyncListeners = (options?: LeaveSyncScopeOptions): (() => void) => {
  if (!db) return () => {};

  // Priority 2 FIX: Remove unbounded leaves collection listener. Use scoped query.
  let leavesQ;
  if (options?.isAdminOrHR) {
    leavesQ = query(collection(db, 'leaves'), limit(300));
  } else if (options?.isTeamLeader && options?.department) {
    leavesQ = query(collection(db, 'leaves'), where('office', '==', options.department));
  } else if (options?.employeeCode) {
    leavesQ = query(collection(db, 'leaves'), where('employeeCode', '==', options.employeeCode));
  } else {
    // If no specific options provided, query bounded by current employee if known, or avoid unbounded fetch
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

  // 2. Listen to leave config settings
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

  // 3. Listen to employee-specific allowances (scoped if employeeCode present)
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

export const startLeaveAutoSyncEngine = (options?: LeaveSyncScopeOptions, intervalMs = 15000): (() => void) => {
  const handleOnline = () => {
    console.log('Leave Sync Engine: Connectivity restored. Syncing pending leaves...');
    syncPendingLeaves();
  };

  window.addEventListener('online', handleOnline);

  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncPendingLeaves();
    }
  }, intervalMs);

  if (navigator.onLine) {
    syncPendingLeaves();
  }

  const unsubListeners = startLeaveSyncListeners(options);

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
    unsubListeners();
  };
};
