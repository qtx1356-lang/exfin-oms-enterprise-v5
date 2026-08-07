import { AttendanceRecord } from '../../types/attendance';

const STORAGE_KEY = 'exfin_attendance_records_v1';

export const getStoredAttendanceRecords = (): AttendanceRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local attendance records:', err);
    return [];
  }
};

export const saveAttendanceRecord = (record: AttendanceRecord): void => {
  try {
    const records = getStoredAttendanceRecords();
    const existingIndex = records.findIndex(
      (r) => r.id === record.id || (r.docId && r.docId === record.docId)
    );
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save attendance record locally:', err);
  }
};

export const updateAttendanceRecord = (record: AttendanceRecord): void => {
  saveAttendanceRecord(record);
};

export const getTodayAttendanceRecord = (employeeId: string, dateStr: string): AttendanceRecord | null => {
  const records = getStoredAttendanceRecords();
  const targetDocId = `${employeeId}_${dateStr}`;
  return records.find((r) => r.docId === targetDocId || (r.employeeId === employeeId && r.date === dateStr)) || null;
};

export const getPendingAttendanceRecords = (): AttendanceRecord[] => {
  const records = getStoredAttendanceRecords();
  return records.filter((r) => r.syncStatus === 'Pending');
};

export const markRecordSyncedInLocal = (id: string, serverSyncTime: string): void => {
  try {
    const records = getStoredAttendanceRecords();
    const record = records.find((r) => r.id === id || r.docId === id);
    if (record) {
      record.syncStatus = 'Synced';
      record.serverSyncTime = serverSyncTime;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark record synced locally:', err);
  }
};
