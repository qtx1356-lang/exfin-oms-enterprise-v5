import { getDb } from '../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { TaskRecord } from '../../types/planner';
import { createNotification } from '../notification/notificationService';

const TRACKED_24H_KEY = 'exfin_deadline_24h_fired_ids';
const TRACKED_2H_KEY = 'exfin_deadline_2h_fired_ids';

const loadFiredSet = (key: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      return new Set(JSON.parse(raw));
    }
  } catch (e) {}
  return new Set();
};

const markFired = (key: string, id: string): void => {
  try {
    const set = loadFiredSet(key);
    set.add(id);
    const arr = Array.from(set).slice(-300);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch (e) {}
};

const isFired = (key: string, id: string): boolean => {
  const set = loadFiredSet(key);
  return set.has(id);
};

export const getTaskDueMs = (task: TaskRecord): number | null => {
  if (!task.dueDate) return null;
  try {
    let dueStr = task.dueDate;
    if (task.dueTime && !dueStr.includes('T')) {
      dueStr = `${task.dueDate}T${task.dueTime}:00`;
    }
    const ms = new Date(dueStr).getTime();
    return isNaN(ms) ? null : ms;
  } catch (e) {
    return null;
  }
};

export const isTaskCompleted = (task: TaskRecord): boolean => {
  const s = (task.status || '').toUpperCase().trim();
  if (s === 'COMPLETED' || s === 'CANCELLED' || s === 'CANCEL') return true;
  if (task.completedAt) return true;
  if (task.approvalStatus === 'APPROVED') return true;
  return false;
};

export const checkTaskDeadlinesForEmployee = (
  tasks: TaskRecord[],
  employeeCode: string
): void => {
  if (!employeeCode || !tasks || tasks.length === 0) return;

  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  tasks.forEach((task) => {
    // 1. Skip if task is completed
    if (isTaskCompleted(task)) {
      return;
    }

    // 2. Check valid due date
    const dueMs = getTaskDueMs(task);
    if (!dueMs) return;

    const timeRemainingMs = dueMs - nowMs;

    // Skip if already overdue or completed
    if (timeRemainingMs <= 0) return;

    const notif24hId = `deadline_24h_${task.id}_${employeeCode}`;
    const notif2hId = `deadline_2h_${task.id}_${employeeCode}`;

    // 3. 2-Hour Approaching Deadline Alert (HIGH Priority)
    if (timeRemainingMs <= TWO_HOURS_MS) {
      if (!isFired(TRACKED_2H_KEY, notif2hId)) {
        markFired(TRACKED_2H_KEY, notif2hId);
        markFired(TRACKED_24H_KEY, notif24hId); // Suppress 24h if 2h triggered

        createNotification({
          id: notif2hId,
          recipientEmployeeCode: employeeCode,
          type: 'TASK_DEADLINE_APPROACHING',
          category: 'PLANNER',
          priority: 'HIGH',
          title: 'Task Deadline Approaching! ⏳',
          message: `Task "${task.title}" is due in less than 2 hours (${task.dueTime || 'soon'})!`,
          entityId: task.id,
          entityType: 'TASK',
          route: '/planner',
        });
      }
      return;
    }

    // 4. 24-Hour Tomorrow Deadline Alert (NORMAL Priority)
    if (timeRemainingMs <= ONE_DAY_MS && timeRemainingMs > TWO_HOURS_MS) {
      if (!isFired(TRACKED_24H_KEY, notif24hId)) {
        markFired(TRACKED_24H_KEY, notif24hId);

        createNotification({
          id: notif24hId,
          recipientEmployeeCode: employeeCode,
          type: 'TASK_DEADLINE_APPROACHING',
          category: 'PLANNER',
          priority: 'NORMAL',
          title: 'Task Deadline Tomorrow 📅',
          message: `Task "${task.title}" is due tomorrow (${task.dueDate} ${task.dueTime || ''}).`,
          entityId: task.id,
          entityType: 'TASK',
          route: '/planner',
        });
      }
    }
  });
};

// Real-time Firestore listener for employee task deadlines
export const initTaskDeadlineMonitor = (employeeCode: string): (() => void) => {
  if (!employeeCode) return () => {};
  let unsub: (() => void) | undefined;
  let isCancelled = false;

  (async () => {
    try {
      const activeDb = await getDb();
      if (isCancelled || !activeDb) return;

      const q = query(
        collection(activeDb, 'tasks'),
        where('assignedToEmployeeCodes', 'array-contains', employeeCode)
      );

      unsub = onSnapshot(
        q,
        (snapshot) => {
          const tasks: TaskRecord[] = [];
          snapshot.forEach((docSnap) => {
            tasks.push({ id: docSnap.id, ...docSnap.data() } as TaskRecord);
          });
          checkTaskDeadlinesForEmployee(tasks, employeeCode);
        },
        (err) => {
          console.warn('Task deadline monitor listener error:', err);
        }
      );
    } catch (err) {
      console.warn('Task deadline monitor init error:', err);
    }
  })();

  const intervalId = setInterval(() => {
    // Re-check
  }, 5 * 60 * 1000);

  return () => {
    isCancelled = true;
    if (unsub) unsub();
    clearInterval(intervalId);
  };
};
