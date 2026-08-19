export type ProfileChangeRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface EmployeeProfile {
  id: string; // registration or user document ID
  uid: string; // Firebase Auth UID
  employeeCode: string;
  name: string;
  mobileNumber: string;
  email: string;
  department: string; // Office / Dept
  designation: string;
  teamLeaderCode?: string | null;
  teamLeaderName?: string | null;
  joiningDate?: string;
  employmentStatus?: 'Active' | 'On Leave' | 'Terminated' | string;
  profilePhotoUrl?: string | null;
  localPhotoData?: string | null;
  officeLocation?: string;
  reportingManager?: string;
  workLocation?: string;
  emergencyContact?: string;
  role?: string; // EMPLOYEE | TEAM_LEADER | HR | ADMIN | SUPER_ADMIN
  baseSalary?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileChangeRequest {
  id: string;
  uid: string;
  employeeCode: string;
  employeeName: string;
  field: 'mobileNumber' | 'email' | 'emergencyContact' | 'profilePhotoUrl';
  fieldLabel: string;
  oldValue: string | null;
  requestedValue: string;
  reason: string;
  status: ProfileChangeRequestStatus;
  createdAtDeviceTime: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  syncStatus?: 'Synced' | 'Pending Sync' | 'Sync Failed';
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetEmployeeUid: string;
  targetEmployeeCode: string;
  fieldChanged: string;
  oldValue?: string | null;
  newValue?: string | null;
  timestamp: string;
  reason?: string;
}
