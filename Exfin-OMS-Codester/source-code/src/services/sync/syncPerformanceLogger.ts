// High-Precision Diagnostic Performance Logger for Sync Operations
interface PerformanceRecord {
  startTime: number;
  localUpdateTime?: number;
  serverWriteTime?: number;
  serverConfirmTime?: number;
  listenerUpdateTime?: number;
}

const activePerfMap = new Map<string, PerformanceRecord>();

export const logSyncStart = (operationName: string, id: string): void => {
  const key = `${operationName}_${id}`;
  activePerfMap.set(key, {
    startTime: performance.now(),
  });
  console.log(`[SYNC_START] ${operationName} (ID: ${id}) at ${new Date().toISOString()}`);
};

export const logSyncLocalUpdate = (operationName: string, id: string): number => {
  const key = `${operationName}_${id}`;
  const record = activePerfMap.get(key) || { startTime: performance.now() };
  const now = performance.now();
  const elapsedMs = Math.round(now - record.startTime);
  record.localUpdateTime = now;
  activePerfMap.set(key, record);

  console.log(
    `[SYNC_LOCAL_UPDATE] ${operationName} (ID: ${id}) - Local UI update: ${elapsedMs}ms`
  );
  return elapsedMs;
};

export const logSyncServerWrite = (operationName: string, id: string): void => {
  const key = `${operationName}_${id}`;
  const record = activePerfMap.get(key);
  if (record) {
    record.serverWriteTime = performance.now();
  }
  console.log(`[SYNC_SERVER_WRITE] ${operationName} (ID: ${id}) sent to server`);
};

export const logSyncServerConfirm = (operationName: string, id: string): number => {
  const key = `${operationName}_${id}`;
  const record = activePerfMap.get(key);
  const now = performance.now();
  const startMs = record ? record.startTime : now;
  const elapsedMs = Math.round(now - startMs);

  if (record) {
    record.serverConfirmTime = now;
  }

  console.log(
    `[SYNC_SERVER_CONFIRM] ${operationName} (ID: ${id}) - Server confirmation: ${elapsedMs}ms`
  );
  return elapsedMs;
};

export const logSyncListenerUpdate = (
  collectionName: string,
  recordId: string,
  startTimeMs?: number
): number => {
  const now = performance.now();
  const elapsedMs = startTimeMs ? Math.round(now - startTimeMs) : 0;

  console.log(
    `[SYNC_LISTENER_UPDATE] Collection: ${collectionName} (ID: ${recordId}) - Listener-to-UI update: ${elapsedMs > 0 ? `${elapsedMs}ms` : 'instant'}`
  );
  return elapsedMs;
};

export const logSyncComplete = (operationName: string, id: string): void => {
  const key = `${operationName}_${id}`;
  const record = activePerfMap.get(key);
  if (record) {
    const totalMs = Math.round(performance.now() - record.startTime);
    console.log(
      `[SYNC_COMPLETE] ${operationName} (ID: ${id}) completed in ${totalMs}ms`
    );
    activePerfMap.delete(key);
  } else {
    console.log(`[SYNC_COMPLETE] ${operationName} (ID: ${id}) completed`);
  }
};
