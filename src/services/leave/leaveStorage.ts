import { LeaveRecord, LeaveConfig, EmployeeAllowance } from '../../types/leave';

const LEAVES_STORAGE_KEY = 'exfin_leaves_v1';
const LEAVE_CONFIG_STORAGE_KEY = 'exfin_leave_config_v1';
const EMPLOYEE_ALLOWANCES_STORAGE_KEY = 'exfin_employee_allowances_v1';

export const getStoredLeaves = (): LeaveRecord[] => {
  try {
    const data = localStorage.getItem(LEAVES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local leave records:', err);
    return [];
  }
};

export const saveLeave = (leave: LeaveRecord): void => {
  try {
    const leaves = getStoredLeaves();
    const existingIndex = leaves.findIndex((l) => l.id === leave.id);
    if (existingIndex >= 0) {
      leaves[existingIndex] = leave;
    } else {
      leaves.unshift(leave);
    }
    localStorage.setItem(LEAVES_STORAGE_KEY, JSON.stringify(leaves));
  } catch (err) {
    console.error('Failed to save leave locally:', err);
  }
};

export const saveMultipleLeaves = (newLeaves: LeaveRecord[]): void => {
  try {
    const existing = getStoredLeaves();
    const map = new Map<string, LeaveRecord>();
    
    existing.forEach((l) => map.set(l.id, l));
    
    newLeaves.forEach((l) => {
      const current = map.get(l.id);
      if (!current || current.syncStatus === 'Synced' || new Date(l.updatedAtDeviceTime) >= new Date(current.updatedAtDeviceTime)) {
        map.set(l.id, l);
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
    );

    localStorage.setItem(LEAVES_STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to save multiple leaves locally:', err);
  }
};

export const getPendingLeaves = (): LeaveRecord[] => {
  const leaves = getStoredLeaves();
  return leaves.filter((l) => l.syncStatus === 'Pending Sync');
};

export const markLeaveSynced = (id: string, serverSyncTime: string): void => {
  try {
    const leaves = getStoredLeaves();
    const leave = leaves.find((l) => l.id === id);
    if (leave) {
      leave.syncStatus = 'Synced';
      leave.serverSyncTime = serverSyncTime;
      localStorage.setItem(LEAVES_STORAGE_KEY, JSON.stringify(leaves));
    }
  } catch (err) {
    console.error('Failed to mark leave synced locally:', err);
  }
};

export const markLeaveSyncFailed = (id: string): void => {
  try {
    const leaves = getStoredLeaves();
    const leave = leaves.find((l) => l.id === id);
    if (leave) {
      leave.syncStatus = 'Sync Failed';
      localStorage.setItem(LEAVES_STORAGE_KEY, JSON.stringify(leaves));
    }
  } catch (err) {
    console.error('Failed to mark leave sync failed locally:', err);
  }
};

// Leave configurations caching
export const getStoredLeaveConfig = (): LeaveConfig => {
  try {
    const data = localStorage.getItem(LEAVE_CONFIG_STORAGE_KEY);
    return data ? JSON.parse(data) : { id: 'config', defaultAnnualAllowance: 24, departmentAllowances: {} };
  } catch (err) {
    console.error('Failed to parse leave config:', err);
    return { id: 'config', defaultAnnualAllowance: 24, departmentAllowances: {} };
  }
};

export const saveLeaveConfig = (config: LeaveConfig): void => {
  try {
    localStorage.setItem(LEAVE_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save leave config locally:', err);
  }
};

export const getStoredEmployeeAllowances = (): EmployeeAllowance[] => {
  try {
    const data = localStorage.getItem(EMPLOYEE_ALLOWANCES_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse employee allowances:', err);
    return [];
  }
};

export const saveEmployeeAllowances = (allowances: EmployeeAllowance[]): void => {
  try {
    localStorage.setItem(EMPLOYEE_ALLOWANCES_STORAGE_KEY, JSON.stringify(allowances));
  } catch (err) {
    console.error('Failed to save employee allowances locally:', err);
  }
};
