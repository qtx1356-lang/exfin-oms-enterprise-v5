import { getDb } from '../firebase/config';
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
  whatsapp: boolean;
  isMandatory?: boolean;
}

export const DEFAULT_NOTIFICATION_MATRIX: EventNotificationConfig[] = [
  {
    eventType: 'AUTO_CHECK_IN',
    label: 'Automatic Check-in Confirmation',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'MANUAL_CHECK_IN',
    label: 'Manual Office Check-in',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'CHECK_OUT',
    label: 'Office Check-out Confirmation',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'WFH',
    label: 'Work From Home (WFH) Attendance',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'CLIENT_VISIT',
    label: 'Client Visit Attendance',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'OUTDOOR_WORK',
    label: 'Outdoor Work Attendance',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'LATE_CHECK_IN',
    label: 'Late Check-in Alert',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'OUTSIDE_OFFICE',
    label: 'Outside Office / Geofence Exit Alert',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'MISSING_CHECKOUT_REMINDER',
    label: 'Missing Checkout Reminder',
    category: 'ATTENDANCE',
    inApp: true,
    email: false,
    sms: false,
    push: false,
    whatsapp: true,
  },
  {
    eventType: 'ATTENDANCE_CORRECTION',
    label: 'Attendance Correction',
    category: 'ATTENDANCE',
    inApp: true,
    email: true,
    sms: false,
    push: false,
    whatsapp: true,
    isMandatory: true,
  },
  {
    eventType: 'LEAVE_APPROVED',
    label: 'Leave Request Approved',
    category: 'LEAVE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'LEAVE_REJECTED',
    label: 'Leave Request Rejected',
    category: 'LEAVE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'EXPENSE_APPROVED',
    label: 'Expense Claim Approved',
    category: 'EXPENSE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'EXPENSE_REJECTED',
    label: 'Expense Claim Rejected',
    category: 'EXPENSE',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'TASK_ASSIGNED',
    label: 'New Task Assigned',
    category: 'PLANNER',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'TASK_OVERDUE',
    label: 'Task Overdue Warning',
    category: 'PLANNER',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'TEAM_ASSIGNMENT',
    label: 'Team Assignment / Update',
    category: 'SYSTEM',
    inApp: true,
    email: true,
    sms: false,
    push: true,
    whatsapp: false,
  },
  {
    eventType: 'ACCOUNT_STATUS_CHANGED',
    label: 'Account Status Update',
    category: 'SYSTEM',
    inApp: true,
    email: true,
    sms: true,
    push: true,
    whatsapp: true,
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
    whatsapp: true,
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
    whatsapp: false,
  },
];

const CONFIG_DOC_PATH = 'notification_settings/admin_matrix_config';
const LOCAL_STORAGE_KEY = 'exfin_admin_notif_matrix';

/**
 * Helper to normalize and merge matrix configuration with defaults
 */
function normalizeMatrix(rawMatrix: EventNotificationConfig[]): EventNotificationConfig[] {
  const merged = DEFAULT_NOTIFICATION_MATRIX.map((defaultItem) => {
    const existing = rawMatrix.find((r) => r.eventType === defaultItem.eventType);
    if (!existing) return defaultItem;
    return {
      ...defaultItem,
      ...existing,
      push: defaultItem.category === 'ATTENDANCE' ? false : (existing.push ?? defaultItem.push),
      whatsapp: existing.whatsapp !== undefined ? existing.whatsapp : defaultItem.whatsapp,
    };
  });
  return merged;
}

/**
 * Fetch authoritative Admin Notification Matrix Configuration
 */
export async function getAdminNotificationMatrix(): Promise<EventNotificationConfig[]> {
  try {
    if (typeof window !== 'undefined' && navigator.onLine) {
      const activeDb = await getDb();
      if (activeDb) {
        const docRef = doc(activeDb, CONFIG_DOC_PATH);
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data()?.matrix) {
          const matrix = normalizeMatrix(snap.data().matrix as EventNotificationConfig[]);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(matrix));
          return matrix;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load admin notification matrix from server:', err);
  }

  // Fallback to local storage or defaults
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return normalizeMatrix(JSON.parse(raw));
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
  if (typeof window !== 'undefined' && navigator.onLine) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const docRef = doc(activeDb, CONFIG_DOC_PATH);
        await setDoc(docRef, {
          matrix: newMatrix,
          updatedAt: new Date().toISOString(),
          updatedBy: adminUser.name || 'Admin',
        }, { merge: true });
      }
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
