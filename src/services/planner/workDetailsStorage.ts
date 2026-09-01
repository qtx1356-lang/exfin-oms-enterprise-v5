import { DailyWorkDetailRecord } from '../../types/workDetails';

const STORAGE_KEY = 'exfin_daily_work_details_v1';

export const getStoredWorkDetails = (): DailyWorkDetailRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local work detail records:', err);
    return [];
  }
};

export const saveWorkDetailRecord = (record: DailyWorkDetailRecord): void => {
  try {
    const records = getStoredWorkDetails();
    // Unique record key: `${employeeId}_${date}` or `${employeeCode}_${date}`
    const existingIndex = records.findIndex(
      (r) => (r.id === record.id) || 
             (r.employeeCode === record.employeeCode && r.date === record.date) ||
             (r.employeeId === record.employeeId && r.date === record.date)
    );
    if (existingIndex >= 0) {
      records[existingIndex] = { ...records[existingIndex], ...record };
    } else {
      records.unshift(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save work detail locally:', err);
  }
};

export const saveMultipleWorkDetailRecords = (newRecords: DailyWorkDetailRecord[]): void => {
  try {
    const existing = getStoredWorkDetails();
    const map = new Map<string, DailyWorkDetailRecord>();
    
    // Existing records
    existing.forEach((r) => {
      const key = `${r.employeeCode || r.employeeId}_${r.date}`;
      map.set(key, r);
    });
    
    // Merge new records
    newRecords.forEach((r) => {
      const key = `${r.employeeCode || r.employeeId}_${r.date}`;
      const current = map.get(key);
      if (!current || current.syncStatus === 'Synced' || new Date(r.updatedAtDeviceTime || r.updatedAt || 0) >= new Date(current.updatedAtDeviceTime || current.updatedAt || 0)) {
        map.set(key, r);
      }
    });

    const merged = Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to save multiple work details locally:', err);
  }
};

export const getPendingWorkDetails = (): DailyWorkDetailRecord[] => {
  const records = getStoredWorkDetails();
  return records.filter((r) => r.syncStatus === 'Pending Sync' || r.syncStatus === 'Sync Failed');
};

export const markWorkDetailSyncedInLocal = (id: string, serverSyncTime: string): void => {
  try {
    const records = getStoredWorkDetails();
    const record = records.find((r) => r.id === id);
    if (record) {
      record.syncStatus = 'Synced';
      record.serverSyncTime = serverSyncTime;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark work detail synced locally:', err);
  }
};

export const markWorkDetailSyncFailedInLocal = (id: string): void => {
  try {
    const records = getStoredWorkDetails();
    const record = records.find((r) => r.id === id);
    if (record) {
      record.syncStatus = 'Sync Failed';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark work detail sync failed locally:', err);
  }
};
