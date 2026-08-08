export type AppRole = 'EMPLOYEE' | 'TEAM_LEADER' | 'HR' | 'ADMIN' | 'SUPER_ADMIN';

export type FeatureKey =
  | 'attendance'
  | 'expenses'
  | 'workPlanner'
  | 'myTeam'
  | 'employeeEfficiency'
  | 'leave'
  | 'notifications'
  | 'reports'
  | 'deviceRegistration'
  | 'employeeManagement'
  | 'teamManagement'
  | 'roleManagement'
  | 'systemSettings'
  | 'departmentManagement'
  | 'adminManagement'
  | 'hrManagement';

export interface RoleFeaturePermissions {
  roleId: AppRole;
  name: string;
  description: string;
  enabled: boolean;
  permissions: Record<FeatureKey, boolean>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Record<FeatureKey, boolean>> = {
  EMPLOYEE: {
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: false,
    deviceRegistration: false,
    employeeManagement: false,
    teamManagement: false,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: false,
    adminManagement: false,
    hrManagement: false,
  },
  TEAM_LEADER: {
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: true,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: false,
    deviceRegistration: false,
    employeeManagement: false,
    teamManagement: false,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: false,
    adminManagement: false,
    hrManagement: false,
  },
  HR: {
    attendance: true,
    expenses: true,
    workPlanner: false,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    deviceRegistration: false,
    employeeManagement: true,
    teamManagement: false,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: false,
    adminManagement: false,
    hrManagement: false,
  },
  ADMIN: {
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    deviceRegistration: true,
    employeeManagement: true,
    teamManagement: true,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: true,
    adminManagement: false,
    hrManagement: true,
  },
  SUPER_ADMIN: {
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: true,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    deviceRegistration: true,
    employeeManagement: true,
    teamManagement: true,
    roleManagement: true,
    systemSettings: true,
    departmentManagement: true,
    adminManagement: true,
    hrManagement: true,
  },
};
