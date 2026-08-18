import { db } from '../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { NotificationCategory } from '../../types/notification';
import { createAuditLog } from '../audit/auditService';

export interface EventNotificationConfig {
  eventType: string;
  label: string;
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  isMandatory?: boolean;
}

export const DEFAULT_NOTIFICATION_MATRIX: EventNotificationConfig[] = [
  {
    eventType: 'ATTENDANCE_CORRECTION',
    label: 'Attendance Correction',
    category: 'ATTENDANCE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    isMandatory: true,
  },
  {
    eventType: 'AUTO_CHECKIN',
    label: 'Automatic Check-in Confirmation',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: true,
  },
  {
    eventType: 'CHECKOUT_REMINDER',
    label: 'End-of-day Checkout Reminder',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: true,
  },
  {
    eventType: 'LEAVE_APPROVED',
    label: 'Leave Request Approved',
    category: 'LEAVE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'LEAVE_REJECTED',
    label: 'Leave Request Rejected',
    category: 'LEAVE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'EXPENSE_APPROVED',
    label: 'Expense Claim Approved',
    category: 'EXPENSE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'EXPENSE_REJECTED',
    label: 'Expense Claim Rejected',
    category: 'EXPENSE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'TASK_ASSIGNED',
    label: 'New Task Assigned',
    category: 'PLANNER',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'TASK_OVERDUE',
    label: 'Task Overdue Warning',
    category: 'PLANNER',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'TEAM_ASSIGNMENT',
    label: 'Team Assignment / Update',
    category: 'SYSTEM',
    inApp: true,
    email: true,
    sms: false,
    push: true,
  },
  {
    eventType: 'ACCOUNT_STATUS_CHANGED',
    label: 'Account Status Update',
    category: 'SYSTEM',
    inApp: true,
    email: true,
    sms: true,
    push: true,
    isMandatory: true,
  },
  {
    eventType: 'ADMINISTRATIVE_ALERT',
    label: 'Critical Administrative Alert',
    category: 'SYSTEM',
    inApp: true,
    email: true,
    sms: true,
    push: true,
    isMandatory: true,
  },
  {
    eventType: 'SYSTEM_ALERT',
    label: 'General System Notification',
    category: 'SYSTEM',
    inApp: true,
    email: false,
    sms: false,
    push: true,
  },
  {
    eventType: 'CHAT_MESSAGE',
    label: 'Chat Message & Discussion Alert',
    category: 'CHAT',
    inApp: true,
    email: false,
    sms: false,
    push: true,
  },
  {
    eventType: 'CHAT_ADMIN_MESSAGE',
    label: 'Admin Chat & Broadcast Alert',
    category: 'CHAT',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    isMandatory: true,
  },
];

const CONFIG_DOC_PATH = 'notification_settings/admin_matrix_config';
const LOCAL_STORAGE_KEY = 'exfin_admin_notif_matrix';

/**
 * Fetch authoritative Admin Notification Matrix Configuration
 */
export async function getAdminNotificationMatrix(): Promise<EventNotificationConfig[]> {
  try {
    if (typeof window !== 'undefined' && navigator.onLine && db) {
      const docRef = doc(db, CONFIG_DOC_PATH);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.matrix) {
        const matrix = snap.data().matrix as EventNotificationConfig[];
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(matrix));
        return matrix;
      }
    }
  } catch (err) {
    console.warn('Failed to load admin notification matrix from server:', err);
  }

  // Fallback to local storage or defaults
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    // ignore
  }

  return DEFAULT_NOTIFICATION_MATRIX;
}

/**
 * Save updated Admin Notification Matrix Configuration with Audit Log
 */
export async function saveAdminNotificationMatrix(
  newMatrix: EventNotificationConfig[],
  adminUser: { name: string; role: string; employeeCode?: string }
): Promise<void> {
  const oldMatrix = await getAdminNotificationMatrix();

  // Save to LocalStorage immediately
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newMatrix));

  // Save to Firestore if online
  if (typeof window !== 'undefined' && navigator.onLine && db) {
    try {
      const docRef = doc(db, CONFIG_DOC_PATH);
      await setDoc(docRef, {
        matrix: newMatrix,
        updatedAt: new Date().toISOString(),
        updatedBy: adminUser.name || 'Admin',
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to save notification matrix to Firestore:', err);
    }
  }

  // Record Audit Log (Requirement 18)
  try {
    await createAuditLog({
      actionCategory: 'SYSTEM_SETTINGS' as any,
      action: 'Updated Notification Delivery Channel Matrix',
      performedByUserId: adminUser.employeeCode || 'ADMIN',
      performedByName: adminUser.name || 'Admin User',
      performedByRole: adminUser.role || 'ADMIN',
      employeeCode: adminUser.employeeCode || 'ADMIN',
      description: `Updated notification matrix config across ${newMatrix.length} event types.`,
      oldValue: oldMatrix,
      newValue: newMatrix,
      result: 'SUCCESS',
      source: adminUser.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN_PANEL',
    });
  } catch (auditErr) {
    console.warn('Failed to record audit log for notification matrix update:', auditErr);
  }
}
