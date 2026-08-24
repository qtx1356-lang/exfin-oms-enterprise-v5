/**
 * Exfin OMS — Performance & Resource Lifecycle Diagnostics Utility
 * Tracks and audits active listeners, timers, subscriptions, and sync workers.
 */

export type PerfResourceType =
  | 'LOCATION_WATCH'
  | 'FIRESTORE_LISTENER'
  | 'ONLINE_LISTENER'
  | 'OFFLINE_LISTENER'
  | 'SYNC_WORKER'
  | 'SYNC_TIMER'
  | 'SERVICE_WORKER_HANDLER';

interface PerfCounters {
  locationWatchers: number;
  firestoreListeners: number;
  onlineListeners: number;
  offlineListeners: number;
  syncWorkers: number;
  activeTimers: number;
  serviceWorkerHandlers: number;
  syncCurrentlyRunning: boolean;
}

const counters: PerfCounters = {
  locationWatchers: 0,
  firestoreListeners: 0,
  onlineListeners: 0,
  offlineListeners: 0,
  syncWorkers: 0,
  activeTimers: 0,
  serviceWorkerHandlers: 0,
  syncCurrentlyRunning: false,
};

const MAX_TRACKED_RESOURCES = 200;
const activeResourceMap = new Map<string, { type: PerfResourceType; createdAt: number; label?: string }>();

export const trackResourceCreated = (type: PerfResourceType, id: string, label?: string): void => {
  switch (type) {
    case 'LOCATION_WATCH':
      counters.locationWatchers++;
      break;
    case 'FIRESTORE_LISTENER':
      counters.firestoreListeners++;
      break;
    case 'ONLINE_LISTENER':
      counters.onlineListeners++;
      break;
    case 'OFFLINE_LISTENER':
      counters.offlineListeners++;
      break;
    case 'SYNC_WORKER':
      counters.syncWorkers++;
      break;
    case 'SYNC_TIMER':
      counters.activeTimers++;
      break;
    case 'SERVICE_WORKER_HANDLER':
      counters.serviceWorkerHandlers++;
      break;
  }

  // Bounded retention: remove oldest entries if exceeding limit
  if (activeResourceMap.size >= MAX_TRACKED_RESOURCES) {
    const oldestKey = activeResourceMap.keys().next().value;
    if (oldestKey) {
      activeResourceMap.delete(oldestKey);
    }
  }

  activeResourceMap.set(id, { type, createdAt: Date.now(), label });

  if (process.env.NODE_ENV !== 'production' || (window as any).__EXFIN_PERF_DEBUG__) {
    console.log(`[PERF_RESOURCE_CREATED] ${type} (ID: ${id}) | Active count:`, getActiveCountForType(type));
  }
};

export const trackResourceCleaned = (type: PerfResourceType, id: string): void => {
  if (activeResourceMap.has(id)) {
    activeResourceMap.delete(id);
    switch (type) {
      case 'LOCATION_WATCH':
        counters.locationWatchers = Math.max(0, counters.locationWatchers - 1);
        break;
      case 'FIRESTORE_LISTENER':
        counters.firestoreListeners = Math.max(0, counters.firestoreListeners - 1);
        break;
      case 'ONLINE_LISTENER':
        counters.onlineListeners = Math.max(0, counters.onlineListeners - 1);
        break;
      case 'OFFLINE_LISTENER':
        counters.offlineListeners = Math.max(0, counters.offlineListeners - 1);
        break;
      case 'SYNC_WORKER':
        counters.syncWorkers = Math.max(0, counters.syncWorkers - 1);
        break;
      case 'SYNC_TIMER':
        counters.activeTimers = Math.max(0, counters.activeTimers - 1);
        break;
      case 'SERVICE_WORKER_HANDLER':
        counters.serviceWorkerHandlers = Math.max(0, counters.serviceWorkerHandlers - 1);
        break;
    }

    if (process.env.NODE_ENV !== 'production' || (window as any).__EXFIN_PERF_DEBUG__) {
      console.log(`[PERF_RESOURCE_CLEANED] ${type} (ID: ${id}) | Active count:`, getActiveCountForType(type));
    }
  }
};

export const setSyncRunningState = (isRunning: boolean): void => {
  counters.syncCurrentlyRunning = isRunning;
};

export const logPerfSyncEvent = (
  event: 'PERF_SYNC_STARTED' | 'PERF_SYNC_SKIPPED_ALREADY_RUNNING' | 'PERF_SYNC_COMPLETED',
  details?: string
): void => {
  if (process.env.NODE_ENV !== 'production' || (window as any).__EXFIN_PERF_DEBUG__) {
    console.log(`[${event}]`, details || '');
  }
};

export const getActiveCountForType = (type: PerfResourceType): number => {
  switch (type) {
    case 'LOCATION_WATCH':
      return counters.locationWatchers;
    case 'FIRESTORE_LISTENER':
      return counters.firestoreListeners;
    case 'ONLINE_LISTENER':
      return counters.onlineListeners;
    case 'OFFLINE_LISTENER':
      return counters.offlineListeners;
    case 'SYNC_WORKER':
      return counters.syncWorkers;
    case 'SYNC_TIMER':
      return counters.activeTimers;
    case 'SERVICE_WORKER_HANDLER':
      return counters.serviceWorkerHandlers;
    default:
      return 0;
  }
};

export interface ResourceSnapshot {
  locationWatchers: number;
  firestoreListeners: number;
  onlineListeners: number;
  offlineListeners: number;
  syncWorkers: number;
  syncTimers: number;
  serviceWorkerHandlers: number;
  isSyncEngineLocked: boolean;
}

export const getResourceSnapshot = (): ResourceSnapshot => {
  return {
    locationWatchers: counters.locationWatchers,
    firestoreListeners: counters.firestoreListeners,
    onlineListeners: counters.onlineListeners,
    offlineListeners: counters.offlineListeners,
    syncWorkers: counters.syncWorkers,
    syncTimers: counters.activeTimers,
    serviceWorkerHandlers: counters.serviceWorkerHandlers,
    isSyncEngineLocked: counters.syncCurrentlyRunning,
  };
};

export const getPerformanceDiagnosticsReport = () => {
  return {
    activeLocationWatchers: counters.locationWatchers,
    activeFirestoreListeners: counters.firestoreListeners,
    activeOnlineListeners: counters.onlineListeners,
    activeOfflineListeners: counters.offlineListeners,
    activeSyncWorkers: counters.syncWorkers,
    activeTimers: counters.activeTimers,
    serviceWorkerHandlers: counters.serviceWorkerHandlers,
    syncCurrentlyRunning: counters.syncCurrentlyRunning ? 'YES' : 'NO',
  };
};

if (typeof window !== 'undefined') {
  (window as any).__getPerfReport = getPerformanceDiagnosticsReport;
}
