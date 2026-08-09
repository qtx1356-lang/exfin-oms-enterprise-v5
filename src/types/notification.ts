export type NotificationType =
  | 'AUTO_CHECKIN'
  | 'MANUAL_CHECKIN'
  | 'CHECKOUT_REMINDER'
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
  | 'SYSTEM';

export type NotificationRecipientType = 'EMPLOYEE' | 'TEAM_LEADER' | 'ADMIN' | 'SUPER_ADMIN' | 'SYSTEM';

export interface NotificationRecord {
  id: string;
  type: NotificationType | string;
  category: NotificationCategory;
  title: string;
  message: string;
  recipientUserId: string;
  recipientEmployeeCode: string;
  recipientRole: string; // 'EMPLOYEE' | 'TEAM_LEADER' | 'ADMIN' | 'SUPER_ADMIN'
  recipientTeamLeaderId?: string;
  priority: NotificationPriority;
  route?: string; // Route path to deep-link
  entityId?: string; // Related task ID, leave ID, expense ID, etc.
  entityType?: string; // 'TASK' | 'LEAVE' | 'EXPENSE' | 'REGISTRATION' | 'ATTENDANCE'
  read: boolean;
  timestamp: string; // Canonical Firestore ISO timestamp
  createdAtDeviceTime: string; // Original event time
  updatedAtDeviceTime: string;
  serverSyncTime: string;
  syncStatus: 'PENDING' | 'SYNCED';
  deleted?: boolean;
  deletedUserIds?: string[];
  createdAt?: string; // Backward compatibility fallback
}
