import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useRegistration } from './RegistrationContext';
import { TaskRecord } from '../types/planner';
import { LeaveRecord } from '../types/leave';
import { AttendanceRecord } from '../types/attendance';
import { ExpenseRecord } from '../types/expense';
import { NotificationRecord } from '../types/notification';

import { queueTaskSync, syncPendingTasks } from '../services/planner/taskSyncEngine';
import { syncPendingLeaves } from '../services/leave/leaveSyncEngine';
import { syncPendingExpenseRecords } from '../services/expenses/expenseSyncEngine';
import { syncPendingAttendanceRecords } from '../services/attendance/syncEngine';
import { syncAllPendingRecords } from '../services/sync/globalSyncEngine';
import { saveTaskRecord, getStoredTasks } from '../services/planner/taskStorage';
import { saveLeaveRecord, getStoredLeaves } from '../services/leave/leaveStorage';
import { saveExpenseRecord, getStoredExpenseRecords } from '../services/expenses/expenseStorage';
import { saveAttendanceRecord, getStoredAttendanceRecords } from '../services/attendance/attendanceStorage';
import { logSyncListenerUpdate } from '../services/sync/syncPerformanceLogger';

export type SyncStateIndicator =
  | 'SYNCED'
  | 'SYNCING'
  | 'OFFLINE — SAVED LOCALLY'
  | 'RETRYING'
  | 'SYNC ERROR';

interface RealtimeSyncContextType {
  isOnline: boolean;
  syncState: SyncStateIndicator;
  tasks: TaskRecord[];
  leaves: LeaveRecord[];
  attendance: AttendanceRecord[];
  expenses: ExpenseRecord[];
  notifications: NotificationRecord[];
  unreadNotificationCount: number;

  updateTaskOptimistically: (task: TaskRecord) => Promise<void>;
  updateLeaveOptimistically: (leave: LeaveRecord) => Promise<void>;
  updateExpenseOptimistically: (expense: ExpenseRecord) => Promise<void>;
  updateAttendanceOptimistically: (attendance: AttendanceRecord) => Promise<void>;

  triggerManualSync: () => Promise<void>;
}

const RealtimeSyncContext = createContext<RealtimeSyncContextType | undefined>(
  undefined
);

export const RealtimeSyncProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { employeeData } = useRegistration();
  const empCode = employeeData?.employeeCode || employeeData?.id || '';

  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncStateIndicator>(
    navigator.onLine ? 'SYNCED' : 'OFFLINE — SAVED LOCALLY'
  );

  const [tasks, setTasks] = useState<TaskRecord[]>(() => getStoredTasks());
  const [leaves, setLeaves] = useState<LeaveRecord[]>(() => getStoredLeaves());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() =>
    getStoredAttendanceRecords()
  );
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() =>
    getStoredExpenseRecords()
  );
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  // Active snapshot unsubscriptions
  const activeUnsubsRef = useRef<(() => void)[]>([]);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncState('SYNCING');
      console.log('RealtimeSync: Internet restored. Synchronizing pending operations...');
      syncAllPendingRecords().then(() => {
        setSyncState('SYNCED');
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState('OFFLINE — SAVED LOCALLY');
      console.log('RealtimeSync: Device offline. Operations will be queued locally.');
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        console.log('RealtimeSync: App returned to foreground. Reconciling pending items...');
        syncAllPendingRecords();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Clean up previous listeners when employee changes
  const cleanupListeners = () => {
    activeUnsubsRef.current.forEach((unsub) => unsub());
    activeUnsubsRef.current = [];
  };

  // Setup real-time listeners for current employee identity strictly
  useEffect(() => {
    if (!empCode || !db) {
      cleanupListeners();
      return;
    }

    cleanupListeners();

    // 1. Tasks Listener (Identity isolated to assignedToEmployeeCodes)
    const tasksQ = query(
      collection(db, 'tasks'),
      where('assignedToEmployeeCodes', 'array-contains', empCode)
    );

    const unsubTasks = onSnapshot(
      tasksQ,
      (snapshot) => {
        const serverList: TaskRecord[] = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as TaskRecord;
          serverList.push(item);
          logSyncListenerUpdate('tasks', docSnap.id);
        });

        // Surgical state merge preserving local unsynced edits
        setTasks((prevTasks) => {
          const map = new Map<string, TaskRecord>();
          serverList.forEach((st) => map.set(st.id, st));

          prevTasks.forEach((lt) => {
            if (lt.syncStatus === 'Pending Sync' || lt.syncStatus === 'Syncing...') {
              map.set(lt.id, lt);
            }
          });

          return Array.from(map.values()).sort(
            (a, b) =>
              new Date(b.createdAtDeviceTime || 0).getTime() -
              new Date(a.createdAtDeviceTime || 0).getTime()
          );
        });
      },
      (err) => console.warn('RealtimeSync: Tasks snapshot error:', err)
    );
    activeUnsubsRef.current.push(unsubTasks);

    // 2. Leaves Listener (Identity isolated to employeeCode)
    const leavesQ = query(
      collection(db, 'leaves'),
      where('employeeCode', '==', empCode)
    );

    const unsubLeaves = onSnapshot(
      leavesQ,
      (snapshot) => {
        const serverList: LeaveRecord[] = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as LeaveRecord;
          serverList.push(item);
          logSyncListenerUpdate('leaves', docSnap.id);
        });

        setLeaves((prevLeaves) => {
          const map = new Map<string, LeaveRecord>();
          serverList.forEach((sl) => map.set(sl.id, sl));

          prevLeaves.forEach((ll) => {
            if (ll.syncStatus === 'Pending Sync' || ll.syncStatus === 'Syncing...') {
              map.set(ll.id, ll);
            }
          });

          return Array.from(map.values());
        });
      },
      (err) => console.warn('RealtimeSync: Leaves snapshot error:', err)
    );
    activeUnsubsRef.current.push(unsubLeaves);

    // 3. Attendance Listener (Identity isolated to employeeId / employeeCode)
    const attQ = query(
      collection(db, 'attendance'),
      where('employeeId', '==', empCode),
      limit(30)
    );

    const unsubAtt = onSnapshot(
      attQ,
      (snapshot) => {
        const serverList: AttendanceRecord[] = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as AttendanceRecord;
          serverList.push(item);
          logSyncListenerUpdate('attendance', docSnap.id);
        });

        setAttendance((prevAtt) => {
          const map = new Map<string, AttendanceRecord>();
          serverList.forEach((sa) => map.set(sa.id || sa.docId, sa));

          prevAtt.forEach((la) => {
            if (la.syncStatus === 'Pending Sync' || la.syncStatus === 'Syncing...') {
              map.set(la.id || la.docId, la);
            }
          });

          return Array.from(map.values());
        });
      },
      (err) => console.warn('RealtimeSync: Attendance snapshot error:', err)
    );
    activeUnsubsRef.current.push(unsubAtt);

    // 4. Expenses Listener (Identity isolated to employeeCode)
    const expQ = query(
      collection(db, 'expenses'),
      where('employeeCode', '==', empCode)
    );

    const unsubExpenses = onSnapshot(
      expQ,
      (snapshot) => {
        const serverList: ExpenseRecord[] = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...docSnap.data() } as ExpenseRecord;
          serverList.push(item);
          logSyncListenerUpdate('expenses', docSnap.id);
        });

        setExpenses((prevExpenses) => {
          const map = new Map<string, ExpenseRecord>();
          serverList.forEach((se) => map.set(se.id, se));

          prevExpenses.forEach((le) => {
            if (le.syncStatus === 'Pending Sync' || le.syncStatus === 'Syncing...') {
              map.set(le.id, le);
            }
          });

          return Array.from(map.values());
        });
      },
      (err) => console.warn('RealtimeSync: Expenses snapshot error:', err)
    );
    activeUnsubsRef.current.push(unsubExpenses);

    // 5. Notifications Listener (Identity isolated to recipientEmployeeCode)
    const notifQ = query(
      collection(db, 'notifications'),
      where('recipientEmployeeCode', '==', empCode),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubNotifications = onSnapshot(
      notifQ,
      (snapshot) => {
        const notifList: NotificationRecord[] = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
          const notif = { id: docSnap.id, ...docSnap.data() } as NotificationRecord;
          notifList.push(notif);
          if (!notif.read) {
            unreadCount++;
          }
          logSyncListenerUpdate('notifications', docSnap.id);
        });

        setNotifications(notifList);
        setUnreadNotificationCount(unreadCount);
      },
      (err) => console.warn('RealtimeSync: Notifications snapshot error:', err)
    );
    activeUnsubsRef.current.push(unsubNotifications);

    return () => {
      cleanupListeners();
    };
  }, [empCode]);

  // OPTIMISTIC TASK UPDATE
  const updateTaskOptimistically = useCallback(
    async (task: TaskRecord) => {
      setSyncState('SYNCING');
      const optimisticRecord: TaskRecord = {
        ...task,
        syncStatus: 'Pending Sync',
        updatedAtDeviceTime: new Date().toISOString(),
      };

      // 1. Surgical local state update
      setTasks((prev) =>
        prev.map((t) => (t.id === optimisticRecord.id ? optimisticRecord : t))
      );

      // 2. Queue background write
      queueTaskSync(optimisticRecord);

      if (navigator.onLine) {
        setSyncState('SYNCED');
      } else {
        setSyncState('OFFLINE — SAVED LOCALLY');
      }
    },
    []
  );

  // OPTIMISTIC LEAVE UPDATE
  const updateLeaveOptimistically = useCallback(
    async (leave: LeaveRecord) => {
      setSyncState('SYNCING');
      const optimisticRecord: LeaveRecord = {
        ...leave,
        syncStatus: 'Pending Sync',
        updatedAtDeviceTime: new Date().toISOString(),
      };

      // 1. Local storage & surgical state update
      saveLeaveRecord(optimisticRecord);
      setLeaves((prev) => {
        const exists = prev.some((l) => l.id === optimisticRecord.id);
        if (exists) {
          return prev.map((l) =>
            l.id === optimisticRecord.id ? optimisticRecord : l
          );
        }
        return [optimisticRecord, ...prev];
      });

      // 2. Background sync
      if (navigator.onLine) {
        await syncPendingLeaves();
        setSyncState('SYNCED');
      } else {
        setSyncState('OFFLINE — SAVED LOCALLY');
      }
    },
    []
  );

  // OPTIMISTIC EXPENSE UPDATE
  const updateExpenseOptimistically = useCallback(
    async (expense: ExpenseRecord) => {
      setSyncState('SYNCING');
      const optimisticRecord: ExpenseRecord = {
        ...expense,
        syncStatus: 'Pending Sync',
      };

      saveExpenseRecord(optimisticRecord);
      setExpenses((prev) => {
        const exists = prev.some((e) => e.id === optimisticRecord.id);
        if (exists) {
          return prev.map((e) =>
            e.id === optimisticRecord.id ? optimisticRecord : e
          );
        }
        return [optimisticRecord, ...prev];
      });

      if (navigator.onLine) {
        await syncPendingExpenseRecords();
        setSyncState('SYNCED');
      } else {
        setSyncState('OFFLINE — SAVED LOCALLY');
      }
    },
    []
  );

  // OPTIMISTIC ATTENDANCE UPDATE
  const updateAttendanceOptimistically = useCallback(
    async (attendanceRecord: AttendanceRecord) => {
      setSyncState('SYNCING');
      const optimisticRecord: AttendanceRecord = {
        ...attendanceRecord,
        syncStatus: 'Pending',
        createdAtDeviceTime:
          attendanceRecord.createdAtDeviceTime || new Date().toISOString(),
      };

      saveAttendanceRecord(optimisticRecord);
      setAttendance((prev) => {
        const idToMatch = optimisticRecord.id || optimisticRecord.docId;
        const exists = prev.some(
          (a) => (a.id || a.docId) === idToMatch
        );
        if (exists) {
          return prev.map((a) =>
            (a.id || a.docId) === idToMatch ? optimisticRecord : a
          );
        }
        return [optimisticRecord, ...prev];
      });

      if (navigator.onLine) {
        await syncPendingAttendanceRecords();
        setSyncState('SYNCED');
      } else {
        setSyncState('OFFLINE — SAVED LOCALLY');
      }
    },
    []
  );

  const triggerManualSync = useCallback(async () => {
    setSyncState('SYNCING');
    await syncAllPendingRecords();
    setSyncState('SYNCED');
  }, []);

  return (
    <RealtimeSyncContext.Provider
      value={{
        isOnline,
        syncState,
        tasks,
        leaves,
        attendance,
        expenses,
        notifications,
        unreadNotificationCount,
        updateTaskOptimistically,
        updateLeaveOptimistically,
        updateExpenseOptimistically,
        updateAttendanceOptimistically,
        triggerManualSync,
      }}
    >
      {children}
    </RealtimeSyncContext.Provider>
  );
};

export const useRealtimeSync = (): RealtimeSyncContextType => {
  const context = useContext(RealtimeSyncContext);
  if (!context) {
    throw new Error(
      'useRealtimeSync must be used within a RealtimeSyncProvider'
    );
  }
  return context;
};
