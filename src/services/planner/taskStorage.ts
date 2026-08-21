import { TaskRecord } from '../../types/planner';

const STORAGE_KEY = 'exfin_planner_tasks_v1';

export const getStoredTasks = (): TaskRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local task records:', err);
    return [];
  }
};

export const saveTaskRecord = (task: TaskRecord): void => {
  try {
    const tasks = getStoredTasks();
    const existingIndex = tasks.findIndex((t) => t.id === task.id);
    if (existingIndex >= 0) {
      tasks[existingIndex] = task;
    } else {
      tasks.unshift(task);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save task locally:', err);
  }
};

export const saveMultipleTaskRecords = (newTasks: TaskRecord[]): void => {
  try {
    const existing = getStoredTasks();
    const map = new Map<string, TaskRecord>();
    
    // Existing tasks
    existing.forEach((t) => map.set(t.id, t));
    
    // Merge new tasks, giving priority to newly updated / synced items
    newTasks.forEach((t) => {
      const current = map.get(t.id);
      if (!current || current.syncStatus === 'Synced' || new Date(t.updatedAtDeviceTime) >= new Date(current.updatedAtDeviceTime)) {
        map.set(t.id, t);
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.error('Failed to save multiple tasks locally:', err);
  }
};

export const getPendingTasks = (): TaskRecord[] => {
  const tasks = getStoredTasks();
  return tasks.filter((t) => t.syncStatus === 'Pending Sync' || t.syncStatus === 'Sync Failed');
};

export const markTaskSyncedInLocal = (id: string, serverSyncTime: string): void => {
  try {
    const tasks = getStoredTasks();
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.syncStatus = 'Synced';
      task.serverSyncTime = serverSyncTime;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  } catch (err) {
    console.error('Failed to mark task synced locally:', err);
  }
};

export const markTaskSyncFailedInLocal = (id: string): void => {
  try {
    const tasks = getStoredTasks();
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.syncStatus = 'Sync Failed';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
  } catch (err) {
    console.error('Failed to mark task sync failed locally:', err);
  }
};

export const removePendingTask = (id: string): void => {
  try {
    const tasks = getStoredTasks();
    const filtered = tasks.filter((t) => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove pending task:', err);
  }
};
