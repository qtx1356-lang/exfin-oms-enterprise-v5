import { AppRole } from './roles';

export interface ManagedUser {
  id: string; // registrationId or uid
  employeeCode: string;
  name: string;
  mobileNumber?: string;
  office?: string;
  designation?: string;
  role: AppRole;
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Suspended';
  isTeamLeader?: boolean;
  assignedTeamLeaderId?: string;
  assignedTeamLeaderName?: string;
  teamMemberUids?: string[];
  deviceId?: string;
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;
  registrationDate?: string;
  selfieUrl?: string;
  loginId?: string;
  email?: string;
}
