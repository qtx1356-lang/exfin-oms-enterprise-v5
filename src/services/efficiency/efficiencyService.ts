import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { EfficiencyWeightages, EfficiencySnapshot, SystemSettings } from '../../types/efficiency';

const WEIGHTS_LOCAL_KEY = 'exfin_efficiency_weights';
const SNAPSHOTS_LOCAL_KEY = 'exfin_efficiency_snapshots';

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

  const activeDb = await getDb();
  if (!activeDb) {
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
    const docRef = doc(activeDb, 'system_settings', 'efficiency_config');
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

  const activeDb = await getDb();
  if (!activeDb) {
    throw new Error('Database is offline. Settings cached locally.');
  }

  try {
    const docRef = doc(activeDb, 'system_settings', 'efficiency_config');
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

/**
 * Gets all saved snapshots from LocalStorage.
 */
export const getLocalSnapshots = (): EfficiencySnapshot[] => {
  try {
    const local = localStorage.getItem(SNAPSHOTS_LOCAL_KEY);
    return local ? JSON.parse(local) : [];
  } catch (err) {
    console.warn('Failed to load local snapshots:', err);
    return [];
  }
};

/**
 * Saves a local list of snapshots.
 */
export const saveLocalSnapshots = (snapshots: EfficiencySnapshot[]): void => {
  try {
    localStorage.setItem(SNAPSHOTS_LOCAL_KEY, JSON.stringify(snapshots));
  } catch (err) {
    console.warn('Failed to cache snapshots locally:', err);
  }
};

/**
 * Saves an efficiency snapshot. Saves locally first, then attempts to upload.
 */
export const saveEfficiencySnapshot = async (snapshot: EfficiencySnapshot): Promise<void> => {
  const snapshotId = snapshot.id || `${snapshot.employeeCode}_${snapshot.periodStart}_${snapshot.periodEnd}`;
  const localSnapshot: EfficiencySnapshot = {
    ...snapshot,
    id: snapshotId,
    syncStatus: 'Pending'
  };

  // 1. Save to LocalStorage
  const localList = getLocalSnapshots();
  const index = localList.findIndex(s => s.id === snapshotId);
  if (index >= 0) {
    localList[index] = localSnapshot;
  } else {
    localList.push(localSnapshot);
  }
  saveLocalSnapshots(localList);

  // 2. Try Firestore upload
  const activeDb = await getDb();
  if (!activeDb) {
    console.log('Database not available, snapshot saved locally (pending sync)');
    return;
  }

  try {
    const docRef = doc(activeDb, 'efficiency_snapshots', snapshotId);
    
    // Server payload has serverSyncTime added without overwriting calculatedAtDeviceTime
    const serverPayload = {
      ...localSnapshot,
      syncStatus: 'Synced',
      serverSyncTime: new Date().toISOString()
    };

    await setDoc(docRef, serverPayload, { merge: true });

    // Update local list to mark as synced
    const updatedList = getLocalSnapshots();
    const localIndex = updatedList.findIndex(s => s.id === snapshotId);
    if (localIndex >= 0) {
      updatedList[localIndex].syncStatus = 'Synced';
      updatedList[localIndex].serverSyncTime = serverPayload.serverSyncTime;
      saveLocalSnapshots(updatedList);
    }
  } catch (err) {
    console.warn('Error saving snapshot to Firestore, retained as pending sync:', err);
  }
};

/**
 * Fetch snapshots. Merges local pending snapshots with remote ones.
 */
export const getEfficiencySnapshots = async (employeeCode?: string): Promise<EfficiencySnapshot[]> => {
  const localSnapshots = getLocalSnapshots();
  let filteredLocal = employeeCode 
    ? localSnapshots.filter(s => s.employeeCode === employeeCode)
    : localSnapshots;

  const activeDb = await getDb();
  if (!activeDb) {
    return filteredLocal;
  }

  const reqId = Math.floor(Math.random() * 10000);
  const startTime = performance.now();
  const filtersLabel = employeeCode ? `where('employeeCode', '==', '${employeeCode}')` : 'none (all snapshots)';
  console.log(`[EFFICIENCY_FIRESTORE_START] reqId=${reqId} path=efficiency_snapshots operation=getDocs filters=${filtersLabel} dateRange=N/A`);

  const pendingTimer = setTimeout(() => {
    console.warn(`[EFFICIENCY_FIRESTORE_WARNING >5000ms] reqId=${reqId} path=efficiency_snapshots still pending after 5000ms`);
  }, 5000);

  try {
    const snapshotsCol = collection(activeDb, 'efficiency_snapshots');
    let q = snapshotsCol;
    if (employeeCode) {
      q = query(snapshotsCol, where('employeeCode', '==', employeeCode)) as any;
    }
    
    const querySnap = await getDocs(q);
    clearTimeout(pendingTimer);
    const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
    console.log(`[EFFICIENCY_FIRESTORE_END] reqId=${reqId} path=efficiency_snapshots docsReturned=${querySnap.size} elapsedMs=${elapsedMs}ms`);

    const remoteSnapshots: EfficiencySnapshot[] = [];
    querySnap.forEach(docSnap => {
      remoteSnapshots.push({
        id: docSnap.id,
        ...docSnap.data()
      } as EfficiencySnapshot);
    });

    // Merge: remote always wins unless local has syncStatus === 'Pending' (meaning offline-updated)
    const mergedMap = new Map<string, EfficiencySnapshot>();
    
    // Load remote first
    remoteSnapshots.forEach(s => {
      if (s.id) mergedMap.set(s.id, s);
    });

    // Overwrite or append local pending ones
    filteredLocal.forEach(s => {
      if (s.id && (s.syncStatus === 'Pending' || !mergedMap.has(s.id))) {
        mergedMap.set(s.id, s);
      }
    });

    const result = Array.from(mergedMap.values());
    
    // Sort by periodEnd desc
    result.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
    return result;
  } catch (err) {
    clearTimeout(pendingTimer);
    const elapsedMs = Math.round((performance.now() - startTime) * 100) / 100;
    console.warn(`[EFFICIENCY_FIRESTORE_END_ERROR] reqId=${reqId} path=efficiency_snapshots elapsedMs=${elapsedMs}ms error=`, err);
    return filteredLocal.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  }
};

/**
 * Automatically syncs any pending offline snapshots to Firestore.
 */
export const syncPendingSnapshots = async (): Promise<void> => {
  const activeDb = await getDb();
  if (!activeDb) return;
  
  const locals = getLocalSnapshots();
  const pendings = locals.filter(s => s.syncStatus === 'Pending');
  
  if (pendings.length === 0) return;
  
  console.log(`Syncing ${pendings.length} pending offline efficiency snapshots...`);
  
  for (const snap of pendings) {
    try {
      const snapshotId = snap.id || `${snap.employeeCode}_${snap.periodStart}_${snap.periodEnd}`;
      const docRef = doc(activeDb, 'efficiency_snapshots', snapshotId);
      
      const serverPayload = {
        ...snap,
        syncStatus: 'Synced',
        serverSyncTime: new Date().toISOString()
      };

      await setDoc(docRef, serverPayload, { merge: true });
      
      // Update in local cache
      const list = getLocalSnapshots();
      const idx = list.findIndex(s => s.id === snapshotId);
      if (idx >= 0) {
        list[idx].syncStatus = 'Synced';
        list[idx].serverSyncTime = serverPayload.serverSyncTime;
        saveLocalSnapshots(list);
      }
    } catch (err) {
      console.warn(`Failed to sync snapshot ${snap.id}:`, err);
    }
  }
};
