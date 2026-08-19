export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type LeaveApprovalStatus = 'PENDING' | 'TEAM_LEADER_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  approvalStatus: LeaveApprovalStatus;
  currentApproverRole: 'TEAM_LEADER' | 'ADMIN' | 'NONE';
  currentApproverId: string | null;
  currentApproverName: string | null;
  teamLeaderRemark: string | null;
  adminRemark: string | null;
  createdAtDeviceTime: string;
  updatedAtDeviceTime: string;
  submittedAtDeviceTime: string;
  teamLeaderReviewedAtDeviceTime: string | null;
  adminReviewedAtDeviceTime: string | null;
  serverSyncTime: string | null;
  syncStatus: 'Pending Sync' | 'Synced' | 'Sync Failed';
  overrideBy?: string | null;
  overrideByName?: string | null;
  overrideAtDeviceTime?: string | null;
  overrideReason?: string | null;
}

export interface LeaveBalance {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  annualAllowance: number;
  used: number;
  pending: number;
  available: number;
}

export interface LeaveConfig {
  id: string; // 'config'
  defaultAnnualAllowance: number;
  departmentAllowances?: Record<string, number>; // department -> allowance mapping
}

export interface EmployeeAllowance {
  id: string; // employeeId / registrationId
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  allowance: number; // custom allowance override
}
