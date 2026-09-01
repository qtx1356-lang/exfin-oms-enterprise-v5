export interface DailyWorkDetailRecord {
  id: string; // Composite key: `${employeeId}_${date}` or `${employeeCode}_${date}`
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department?: string;
  date: string; // YYYY-MM-DD in Asia/Kolkata
  workDetails: string;
  createdAt?: string;
  updatedAt?: string;
  createdAtDeviceTime?: string;
  updatedAtDeviceTime?: string;
  syncStatus?: 'Synced' | 'Pending Sync' | 'Sync Failed';
  serverSyncTime?: string;
}
