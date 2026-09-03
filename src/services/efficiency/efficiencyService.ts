import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { EfficiencyWeightages, SystemSettings } from '../../types/efficiency';
import { TaskRecord } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { DailyWorkDetailRecord } from '../../types/workDetails';

const WEIGHTS_LOCAL_KEY = 'exfin_efficiency_weights';

export const DEFAULT_WEIGHTAGES: EfficiencyWeightages = {
  taskCompletion: 30,
  onTimeCompletion: 25,
  quality: 20,
  punctuality: 15,
  workload: 10
};

/**
 * Retrieves the currently configured efficiency weightages.
 * Tries Firestore first, falls back to LocalStorage, then defaults.
 */
export const getSavedWeightages = async (): Promise<EfficiencyWeightages> => {
  // 1. Try local cache first for instant load
  let cached: EfficiencyWeightages | null = null;
  try {
    const local = localStorage.getItem(WEIGHTS_LOCAL_KEY);
    if (local) {
      cached = JSON.parse(local);
    }
  } catch (err) {
    console.warn('Failed to read cached weightages:', err);
  }

  if (!db) {
    return cached || DEFAULT_WEIGHTAGES;
  }

  const reqId = Math.floor(Math.random() * 10000);
  const startTime = performance.now();
  console.log(`[EFFICIENCY_FIRESTORE_START] reqId=${reqId} path=system_settings/efficiency_config operation=getDoc filters=docRef("system_settings/efficiency_config") dateRange=N/A`);

  const pendingTimer = setTimeout(() => {
    console.warn(`[EFFICIENCY_FIRESTORE_WARNING >5000ms] reqId=${reqId} path=system_settings/efficiency_config still pending after 5000ms`);
  }, 5000);

  try {
    // 2. Fetch from Firestore
    const docRef = doc(db, 'system_settings', 'efficiency_config');
    const snap = await getDoc(docRef);
    clearTimeout(pendingTimer);
    const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
    
    if (snap.exists()) {
      const data = snap.data() as SystemSettings;
      const weightages: EfficiencyWeightages = {
        taskCompletion: data.efficiencyTaskCompletionWeight ?? DEFAULT_WEIGHTAGES.taskCompletion,
        onTimeCompletion: data.efficiencyOnTimeWeight ?? DEFAULT_WEIGHTAGES.onTimeCompletion,
        quality: data.efficiencyQualityWeight ?? DEFAULT_WEIGHTAGES.quality,
        punctuality: data.efficiencyPunctualityWeight ?? DEFAULT_WEIGHTAGES.punctuality,
        workload: data.efficiencyWorkloadWeight ?? DEFAULT_WEIGHTAGES.workload
      };
      
      console.log(`[EFFICIENCY_FIRESTORE_END] reqId=${reqId} path=system_settings/efficiency_config docsReturned=1 elapsedMs=${elapsedMs}ms source=remote`);
      // Update local storage
      localStorage.setItem(WEIGHTS_LOCAL_KEY, JSON.stringify(weightages));
      return weightages;
    } else {
      console.log(`[EFFICIENCY_FIRESTORE_END] reqId=${reqId} path=system_settings/efficiency_config docsReturned=0 (doc not found) elapsedMs=${elapsedMs}ms source=remote`);
    }
  } catch (error) {
    clearTimeout(pendingTimer);
    const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
    console.warn(`[EFFICIENCY_FIRESTORE_END_ERROR] reqId=${reqId} path=system_settings/efficiency_config elapsedMs=${elapsedMs}ms error=`, error);
  }

  return cached || DEFAULT_WEIGHTAGES;
};

/**
 * Saves and updates efficiency weightages. Validates that the sum is exactly 100%.
 */
export const saveWeightages = async (
  weightages: EfficiencyWeightages,
  userId: string,
  userName: string
): Promise<void> => {
  const { taskCompletion, onTimeCompletion, quality, punctuality, workload } = weightages;
  const total = taskCompletion + onTimeCompletion + quality + punctuality + workload;
  
  if (total !== 100) {
    throw new Error('Efficiency weightages must total 100%.');
  }

  // Update local storage first (offline-first)
  localStorage.setItem(WEIGHTS_LOCAL_KEY, JSON.stringify(weightages));

  if (!db) {
    throw new Error('Database is offline. Settings cached locally.');
  }

  try {
    const docRef = doc(db, 'system_settings', 'efficiency_config');
    const settingsPayload: any = {
      id: 'efficiency_config',
      efficiencyTaskCompletionWeight: taskCompletion,
      efficiencyOnTimeWeight: onTimeCompletion,
      efficiencyQualityWeight: quality,
      efficiencyPunctualityWeight: punctuality,
      efficiencyWorkloadWeight: workload,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, settingsPayload, { merge: true });
  } catch (err) {
    console.error('Failed to save weightages to Firestore:', err);
    throw err;
  }
};

export interface EfficiencyPeriodData {
  startDate: string;
  endDate: string;
  employees: any[];
  tasks: TaskRecord[];
  attendance: AttendanceRecord[];
  workDetails: DailyWorkDetailRecord[];
  weightages: EfficiencyWeightages;
  fetchedAt: number;
}

// Session-level period cache
const periodDataCache = new Map<string, EfficiencyPeriodData>();
let cachedEmployeesList: any[] | null = null;
let cachedEmployeesTimestamp = 0;

export const clearEfficiencyPeriodCache = (): void => {
  periodDataCache.clear();
  cachedEmployeesList = null;
  cachedEmployeesTimestamp = 0;
};

/**
 * Fetches all period-scoped inputs required for efficiency calculations concurrently.
 * Caches results during the app session for instant switching between periods.
 */
export const getEfficiencyPeriodData = async (
  startDateStr: string,
  endDateStr: string,
  forceRefresh = false
): Promise<EfficiencyPeriodData> => {
  const cacheKey = `${startDateStr}_${endDateStr}`;
  const now = Date.now();

  // Check session cache (valid for 5 minutes unless forceRefresh is set)
  if (!forceRefresh && periodDataCache.has(cacheKey)) {
    const cached = periodDataCache.get(cacheKey)!;
    if (now - cached.fetchedAt < 5 * 60 * 1000) {
      console.log(`[EFFICIENCY_CACHE_HIT] key=${cacheKey}`);
      return cached;
    }
  }

  const reqId = Math.floor(Math.random() * 10000);
  const startTime = performance.now();
  console.log(`[EFFICIENCY_PERIOD_FETCH_START] reqId=${reqId} range=${startDateStr}..${endDateStr}`);

  // Safe fetch helper for employees
  const fetchEmployeesSafe = async (): Promise<any[]> => {
    if (!forceRefresh && cachedEmployeesList && (now - cachedEmployeesTimestamp < 5 * 60 * 1000)) {
      return cachedEmployeesList;
    }
    if (!db) return cachedEmployeesList || [];
    try {
      const snap = await getDocs(collection(db, 'registrations'));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cachedEmployeesList = list;
      cachedEmployeesTimestamp = now;
      return list;
    } catch (err) {
      console.warn('[EFFICIENCY_PERIOD_FETCH_WARNING] path=registrations notice:', err);
      return cachedEmployeesList || [];
    }
  };

  // Safe fetch helper for attendance (period-scoped by date field)
  const fetchAttendanceSafe = async (): Promise<AttendanceRecord[]> => {
    if (!db) return [];
    try {
      const qAtt = query(
        collection(db, 'attendance'),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      const snap = await getDocs(qAtt);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
    } catch (err) {
      console.warn('[EFFICIENCY_PERIOD_FETCH_WARNING] path=attendance notice:', err);
      try {
        const snap = await getDocs(collection(db, 'attendance'));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      } catch (err2) {
        return [];
      }
    }
  };

  // Safe fetch helper for daily work details (period-scoped by date field)
  const fetchWorkDetailsSafe = async (): Promise<DailyWorkDetailRecord[]> => {
    if (!db) return [];
    try {
      const qWork = query(
        collection(db, 'daily_work_details'),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      const snap = await getDocs(qWork);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyWorkDetailRecord));
    } catch (err) {
      console.warn('[EFFICIENCY_PERIOD_FETCH_WARNING] path=daily_work_details notice:', err);
      try {
        const snap = await getDocs(collection(db, 'daily_work_details'));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyWorkDetailRecord));
      } catch (err2) {
        return [];
      }
    }
  };

  // Safe fetch helper for tasks
  const fetchTasksSafe = async (): Promise<TaskRecord[]> => {
    if (!db) return [];
    try {
      const snap = await getDocs(collection(db, 'tasks'));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskRecord));
    } catch (err) {
      console.warn('[EFFICIENCY_PERIOD_FETCH_WARNING] path=tasks notice:', err);
      return [];
    }
  };

  // Concurrent execution of all independent fetches
  const [employees, attendance, workDetails, tasks, weightages] = await Promise.all([
    fetchEmployeesSafe(),
    fetchAttendanceSafe(),
    fetchWorkDetailsSafe(),
    fetchTasksSafe(),
    getSavedWeightages()
  ]);

  const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
  console.log(`[EFFICIENCY_PERIOD_FETCH_END] reqId=${reqId} elapsedMs=${elapsedMs}ms emps=${employees.length} att=${attendance.length} work=${workDetails.length} tasks=${tasks.length}`);

  const result: EfficiencyPeriodData = {
    startDate: startDateStr,
    endDate: endDateStr,
    employees,
    tasks,
    attendance,
    workDetails,
    weightages,
    fetchedAt: now
  };

  periodDataCache.set(cacheKey, result);
  return result;
};

