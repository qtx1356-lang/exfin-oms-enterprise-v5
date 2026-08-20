export type AppRole = 'EMPLOYEE' | 'TEAM_LEADER' | 'HR' | 'ADMIN' | 'SUPER_ADMIN';

export type FeatureKey =
  | 'dashboard'
  | 'attendance'
  | 'expenses'
  | 'workPlanner'
  | 'myTeam'
  | 'employeeEfficiency'
  | 'leave'
  | 'notifications'
  | 'reports'
  | 'profile'
  | 'syncCenter'
  | 'deviceRegistration'
  | 'employeeManagement'
  | 'teamManagement'
  | 'roleManagement'
  | 'systemSettings'
  | 'departmentManagement'
  | 'adminManagement'
  | 'hrManagement'
  | 'userManagement'
  | 'systemHealth'
  | 'featurePermissions';

export interface RoleFeaturePermissions {
  roleId: AppRole;
  name: string;
  description: string;
  enabled: boolean;
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Record<string, boolean>> = {
  EMPLOYEE: {
    dashboard: true,
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: false,
    profile: true,
    syncCenter: true,
    deviceRegistration: false,
    employeeManagement: false,
    teamManagement: false,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: false,
    adminManagement: false,
    hrManagement: false,
    userManagement: false,
    systemHealth: false,
    featurePermissions: false,
  },
  TEAM_LEADER: {
    dashboard: true,
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: true,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    profile: true,
    syncCenter: true,
    deviceRegistration: false,
    employeeManagement: false,
    teamManagement: true,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: false,
    adminManagement: false,
    hrManagement: false,
    userManagement: false,
    systemHealth: false,
    featurePermissions: false,
  },
  HR: {
    dashboard: true,
    attendance: true,
    expenses: true,
    workPlanner: false,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    profile: true,
    syncCenter: true,
    deviceRegistration: false,
    employeeManagement: true,
    teamManagement: false,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: true,
    adminManagement: false,
    hrManagement: true,
    userManagement: false,
    systemHealth: false,
    featurePermissions: false,
  },
  ADMIN: {
    dashboard: true,
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: false,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    profile: true,
    syncCenter: true,
    deviceRegistration: true,
    employeeManagement: true,
    teamManagement: true,
    roleManagement: false,
    systemSettings: false,
    departmentManagement: true,
    adminManagement: false,
    hrManagement: true,
    userManagement: true,
    systemHealth: true,
    featurePermissions: false,
  },
  SUPER_ADMIN: {
    dashboard: true,
    attendance: true,
    expenses: true,
    workPlanner: true,
    myTeam: true,
    employeeEfficiency: true,
    leave: true,
    notifications: true,
    reports: true,
    profile: true,
    syncCenter: true,
    deviceRegistration: true,
    employeeManagement: true,
    teamManagement: true,
    roleManagement: true,
    systemSettings: true,
    departmentManagement: true,
    adminManagement: true,
    hrManagement: true,
    userManagement: true,
    systemHealth: true,
    featurePermissions: true,
  },
};
