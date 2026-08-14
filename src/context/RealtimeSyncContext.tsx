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
import { isNotificationDeletedLocally, saveMultipleNotificationsLocally } from '../services/notification/notificationStorage';
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

    // 1. Tasks Listener (Identity isolated to assignedToEmployeeCodes with limit bound)
    const tasksQ = query(
      collection(db, 'tasks'),
      where('assignedToEmployeeCodes', 'array-contains', empCode),
      limit(100)
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

    // 2. Leaves Listener (Identity isolated to employeeCode with limit bound)
    const leavesQ = query(
      collection(db, 'leaves'),
      where('employeeCode', '==', empCode),
      limit(100)
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

    // 3. Attendance Listener (Robust identity isolation covering employeeId and employeeCode)
    const attendanceQueries = [];
    if (empCode) {
      attendanceQueries.push(
        query(collection(db, 'attendance'), where('employeeId', '==', empCode), limit(30))
      );
      attendanceQueries.push(
        query(collection(db, 'attendance'), where('employeeCode', '==', empCode), limit(30))
      );
    }
    const currentUserId = employeeData?.id || '';
    if (currentUserId && currentUserId !== empCode) {
      attendanceQueries.push(
        query(collection(db, 'attendance'), where('employeeId', '==', currentUserId), limit(30))
      );
      attendanceQueries.push(
        query(collection(db, 'attendance'), where('employeeCode', '==', currentUserId), limit(30))
      );
    }

    attendanceQueries.forEach((attQ) => {
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
            const prevMap = new Map<string, AttendanceRecord>();
            prevAtt.forEach(la => prevMap.set(la.id || la.docId || `${la.employeeId}_${la.date}`, la));

            serverList.forEach((sa) => {
              const key = sa.id || sa.docId || `${sa.employeeId}_${sa.date}`;
              const localRec = prevMap.get(key);

              let syncDecision = 'CREATED';
              let finalRec = sa;

              if (localRec) {
                const localPending = localRec.syncStatus === 'Pending';
                const serverUpdated = sa.updatedAt ? new Date(sa.updatedAt).getTime() : 0;
                const localUpdated = localRec.updatedAt ? new Date(localRec.updatedAt).getTime() : 0;
                const serverVersion = sa.version || 0;
                const localVersion = localRec.version || 0;
                const serverRectified = sa.manualRectified || sa.isAdminRectified || !!sa.correctedAt || sa.checkOutMode === 'MANUAL' || sa.checkoutType === 'MANUAL';
                const localRectified = localRec.manualRectified || localRec.isAdminRectified || !!localRec.correctedAt || localRec.checkOutMode === 'MANUAL' || localRec.checkoutType === 'MANUAL';

                // Check for Server 11:59 PM EOD Fallback vs Local Precise Exit Candidate
                const isServerEodFallback = 
                  sa.checkOutTime === '11:59 PM' && 
                  (sa.checkoutType === 'End-of-Day Settlement' || sa.checkOutMode === 'AUTO_SYSTEM' || !serverRectified);

                const hasLocalPreciseExit = 
                  !!(localRec.lastExitTime || localRec.exitTime || (localRec.checkOutTime && localRec.checkOutTime !== '11:59 PM'));

                if (isServerEodFallback && hasLocalPreciseExit && !serverRectified) {
                  syncDecision = 'LOCAL_PRECISE_EXIT_WINS';
                  finalRec = {
                    ...sa,
                    currentState: localRec.currentState || 'PENDING_FINAL_EXIT',
                    lastExitTime: localRec.lastExitTime || sa.lastExitTime,
                    exitTime: localRec.exitTime || sa.exitTime,
                    checkOutTime: (localRec.checkOutTime && localRec.checkOutTime !== '11:59 PM') ? localRec.checkOutTime : sa.checkOutTime,
                    checkOutMode: (localRec.checkOutTime && localRec.checkOutTime !== '11:59 PM') ? localRec.checkOutMode : sa.checkOutMode,
                    checkoutType: (localRec.checkOutTime && localRec.checkOutTime !== '11:59 PM') ? localRec.checkoutType : sa.checkoutType,
                    syncStatus: 'Pending' // Keep it pending so the local precise candidate is synced back to the server
                  };
                } else if (localPending && !serverRectified) {
                  syncDecision = 'LOCAL_PENDING';
                  finalRec = localRec;
                } else if (serverRectified || serverUpdated > localUpdated || serverVersion > localVersion || !localRectified) {
                  syncDecision = 'SERVER_NEWER';
                  finalRec = sa;
                } else if (localUpdated > serverUpdated) {
                  syncDecision = 'LOCAL_NEWER';
                  finalRec = localRec;
                } else {
                  syncDecision = 'SAME';
                  finalRec = sa;
                }
              } else {
                syncDecision = 'CREATED_FROM_SERVER';
                finalRec = sa;
              }

              // Diagnostic logging (Rule 20)
              console.log('--- ATTENDANCE SYNC DIAGNOSTIC LOG ---');
              console.log('CURRENT EMPLOYEE ID:', empCode, currentUserId);
              console.log('ATTENDANCE DATE:', sa.date);
              console.log('LOCAL ATTENDANCE:', localRec);
              console.log('SERVER ATTENDANCE:', sa);
              console.log('LOCAL UPDATED AT:', localRec?.updatedAt);
              console.log('SERVER UPDATED AT:', sa.updatedAt);
              console.log('LOCAL VERSION:', localRec?.version);
              console.log('SERVER VERSION:', sa.version);
              console.log('SYNC DECISION:', syncDecision);
              console.log('FINAL LOCAL ATTENDANCE:', finalRec);
              console.log('---------------------------------------');

              map.set(key, finalRec);
              saveAttendanceRecord(finalRec);
            });

            prevAtt.forEach((la) => {
              const key = la.id || la.docId || `${la.employeeId}_${la.date}`;
              if (!map.has(key)) {
                if (la.syncStatus === 'Pending') {
                  map.set(key, la);
                }
              }
            });

            return Array.from(map.values());
          });
        },
        (err) => console.warn('RealtimeSync: Attendance snapshot error:', err)
      );
      activeUnsubsRef.current.push(unsubAtt);
    });

    // 4. Expenses Listener (Identity isolated to employeeCode with limit bound)
    const expQ = query(
      collection(db, 'expenses'),
      where('employeeCode', '==', empCode),
      limit(100)
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

    // 5. Notifications Listener (Identity isolated to recipientEmployeeCode & recipientUserId with limit bounds)
    const notifQueries = [];
    if (empCode) {
      notifQueries.push(
        query(
          collection(db, 'notifications'),
          where('recipientEmployeeCode', '==', empCode),
          limit(50)
        )
      );
    }
    const empId = employeeData?.id || '';
    if (empId && empId !== empCode) {
      notifQueries.push(
        query(
          collection(db, 'notifications'),
          where('recipientUserId', '==', empId),
          limit(50)
        )
      );
    }
    if (employeeData?.isTeamLeader) {
      if (empId) {
        notifQueries.push(
          query(
            collection(db, 'notifications'),
            where('recipientTeamLeaderId', '==', empId),
            limit(50)
          )
        );
      }
      if (empCode && empCode !== empId) {
        notifQueries.push(
          query(
            collection(db, 'notifications'),
            where('recipientTeamLeaderId', '==', empCode),
            limit(50)
          )
        );
      }
    }

    const notifSnapshots: { [queryIndex: number]: NotificationRecord[] } = {};

    const unsubNotifsList = notifQueries.map((q, qIdx) => {
      return onSnapshot(
        q,
        (snapshot) => {
          const list: NotificationRecord[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data() as any;
            const deletedUserIds: string[] = d.deletedUserIds || [];
            
            // Check if deleted
            const isDeleted =
              d.deleted === true ||
              deletedUserIds.includes(empId) ||
              deletedUserIds.includes(empCode) ||
              isNotificationDeletedLocally(docSnap.id);

            if (isDeleted) {
              return;
            }

            const canonicalTime = d.timestamp || d.createdAt || new Date().toISOString();
            const record: NotificationRecord = {
              id: d.id || docSnap.id,
              type: d.type,
              category: d.category || 'SYSTEM',
              title: d.title || '',
              message: d.message || '',
              recipientUserId: d.recipientUserId || '',
              recipientEmployeeCode: d.recipientEmployeeCode || '',
              recipientRole: d.recipientRole || 'EMPLOYEE',
              recipientTeamLeaderId: d.recipientTeamLeaderId || '',
              priority: d.priority || 'NORMAL',
              route: d.route || '',
              entityId: d.entityId || '',
              entityType: d.entityType || '',
              read: d.read || false,
              timestamp: canonicalTime,
              createdAtDeviceTime: d.createdAtDeviceTime || canonicalTime,
              updatedAtDeviceTime: d.updatedAtDeviceTime || canonicalTime,
              serverSyncTime: d.serverSyncTime || '',
              syncStatus: 'SYNCED',
              deleted: d.deleted || false,
              deletedUserIds: deletedUserIds,
            };
            list.push(record);
          });

          notifSnapshots[qIdx] = list;

          // Merge all queries
          const mergedMap = new Map<string, NotificationRecord>();
          Object.values(notifSnapshots).forEach((arr) => {
            arr.forEach((n) => mergedMap.set(n.id, n));
          });

          const finalNotifsList = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          setNotifications(finalNotifsList);
          setUnreadNotificationCount(finalNotifsList.filter((n) => !n.read).length);

          // Save to local storage to keep it fully synchronized and dispatch update event
          saveMultipleNotificationsLocally(finalNotifsList);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('exfin-notifications-updated'));
          }
        },
        (err) => console.warn(`RealtimeSync: Notifications snapshot ${qIdx} error:`, err)
      );
    });

    activeUnsubsRef.current.push(...unsubNotifsList);

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

  const contextValue = React.useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  return (
    <RealtimeSyncContext.Provider value={contextValue}>
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
