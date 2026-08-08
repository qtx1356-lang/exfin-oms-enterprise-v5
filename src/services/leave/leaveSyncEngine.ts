import { doc, getDoc, setDoc, collection, onSnapshot, query } from 'firebase/firestore';
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

      markLeaveSynced(leave.id, serverSyncTime);
      syncedCount++;
    } catch (err) {
      console.error(`Leave Sync Engine: Error syncing leave ID ${leave.id}:`, err);
      markLeaveSyncFailed(leave.id);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};

// Start real-time sync listeners for leaves and settings
export const startLeaveSyncListeners = (): (() => void) => {
  if (!db) return () => {};

  // 1. Listen to all leaves to keep local cache updated
  const leavesQ = query(collection(db, 'leaves'));
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

  // 3. Listen to employee-specific allowances
  const unsubAllowances = onSnapshot(
    collection(db, 'leave_balances'),
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

export const startLeaveAutoSyncEngine = (intervalMs = 15000): (() => void) => {
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

  const unsubListeners = startLeaveSyncListeners();

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
    unsubListeners();
  };
};
