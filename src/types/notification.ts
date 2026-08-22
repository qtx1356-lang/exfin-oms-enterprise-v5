export type NotificationType =
  | 'AUTO_CHECKIN'
  | 'MANUAL_CHECKIN'
  | 'CHECKOUT_REMINDER'
  | 'ATTENDANCE_CORRECTION'
  | 'ATTENDANCE_UNRESOLVED'
  | 'ANNOUNCEMENT'
  | 'EOD_CLOSURE'
  | 'OFFLINE_PENDING'
  | 'OFFLINE_SYNCED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_UPDATED'
  | 'TASK_DEADLINE_APPROACHING'
  | 'TASK_OVERDUE'
  | 'TASK_COMPLETED'
  | 'TASK_APPROVED'
  | 'TASK_REVISION_REQUIRED'
  | 'MANAGER_REMARK_ADDED'
  | 'LEAVE_SUBMITTED'
  | 'LEAVE_APPROVAL_REQUIRED'
  | 'LEAVE_TL_APPROVED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'LEAVE_BALANCE_CHANGED'
  | 'EXPENSE_SUBMITTED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  | 'DEVICE_SUBMITTED'
  | 'DEVICE_APPROVED'
  | 'DEVICE_REJECTED'
  | 'DEVICE_REVISION_REQUIRED'
  | 'EFFICIENCY_UPDATED'
  | 'SYSTEM_ALERT';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type NotificationCategory =
  | 'ATTENDANCE'
  | 'PLANNER'
  | 'LEAVE'
  | 'EXPENSE'
  | 'DEVICE'
  | 'EFFICIENCY'
  | 'TEAM'
  | 'ACCOUNT'
  | 'ADMINISTRATIVE'
  | 'SYSTEM';

export type NotificationRecipientType = 'EMPLOYEE' | 'TEAM_LEADER' | 'ADMIN' | 'SUPER_ADMIN' | 'SYSTEM';

export type ChannelDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED' | 'FAILED'
  | 'BLOCKED'
  | 'NOT_REQUIRED'
  | 'NOT_CONFIGURED';

export interface NotificationRecord {
  id: string; // notificationId
  notificationId?: string;
  type: NotificationType | string;
  category: NotificationCategory;
  title: string;
  message: string;
  recipientUserId: string;
  recipientEmployeeCode: string;
  recipientMobile?: string;
  recipientEmail?: string;
  recipientRole: string; // 'EMPLOYEE' | 'TEAM_LEADER' | 'ADMIN' | 'SUPER_ADMIN'
  recipientTeamLeaderId?: string;
  priority: NotificationPriority;
  route?: string; // Route path to deep-link
  entityId?: string; // Related task ID, leave ID, expense ID, etc.
  relatedRecordId?: string;
  entityType?: string; // 'TASK' | 'LEAVE' | 'EXPENSE' | 'REGISTRATION' | 'ATTENDANCE'
  read: boolean;
  isRead?: boolean;
  readAt?: string;
  timestamp: string; // Canonical Firestore ISO timestamp
  createdAtDeviceTime: string; // Original event time
  updatedAtDeviceTime: string;
  serverSyncTime: string;
  syncStatus: 'PENDING' | 'SYNCED';
  deleted?: boolean;
  deletedUserIds?: string[];
  createdAt?: string; // Backward compatibility fallback
  channels?: string[]; // 'IN_APP', 'EMAIL', 'SMS', 'PUSH'
  
  // Independent channel delivery statuses
  inAppStatus?: ChannelDeliveryStatus;
  emailStatus?: ChannelDeliveryStatus;
  smsStatus?: ChannelDeliveryStatus;
  pushStatus?: ChannelDeliveryStatus;
  
  source?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export const parseTimestamp = (ts: any): Date | null => {
  if (!ts) return null;
  
  // If it's already a JS Date
  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
  }
  
  // If it's a Firestore Timestamp object with toDate()
  if (typeof ts === 'object' && typeof ts.toDate === 'function') {
    try {
      const d = ts.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      // fallback
    }
  }
  
  // If it's an object with {seconds, nanoseconds}
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    try {
      const seconds = Number((ts as any).seconds);
      const nanoseconds = 'nanoseconds' in ts ? Number((ts as any).nanoseconds) : 0;
      const d = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
      return isNaN(d.getTime()) ? null : d;
    } catch {
      // fallback
    }
  }
  
  // If it's a number (Unix timestamp or milliseconds)
  if (typeof ts === 'number') {
    // If it's in seconds (e.g. 10 digits instead of 13), convert to ms
    const ms = ts < 9999999999 ? ts * 1000 : ts;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // If it's a string, try parsing it
  if (typeof ts === 'string') {
    // Check if it's a numeric string
    if (/^\d+$/.test(ts)) {
      const num = Number(ts);
      const ms = num < 9999999999 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
};
