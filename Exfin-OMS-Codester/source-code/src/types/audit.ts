export type AuditActionCategory =
  | 'Authentication'
  | 'Attendance'
  | 'Employee'
  | 'Leave'
  | 'Expense'
  | 'Tasks'
  | 'Notifications'
  | 'Administration'
  | 'Security'
  | 'System';

export type AuditSource = 'EMPLOYEE_APP' | 'ADMIN_PANEL' | 'SUPER_ADMIN' | 'SYSTEM';

export type AuditResult = 'SUCCESS' | 'FAILED';

export interface DeviceInfo {
  model?: string;
  os?: string;
  appVersion?: string;
  browser?: string;
  deviceType?: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string; // ISO string
  action: string;
  actionCategory: AuditActionCategory;
  performedByUserId: string;
  performedByName: string;
  performedByRole: string; // EMPLOYEE | TEAM_LEADER | ADMIN | SUPER_ADMIN | SYSTEM
  employeeCode?: string;
  targetUserId?: string;
  targetUserName?: string;
  targetRecordId?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  result: AuditResult;
  failureReason?: string;
  source: AuditSource;
  deviceInfo?: DeviceInfo;
  metadata?: Record<string, any>;
}
