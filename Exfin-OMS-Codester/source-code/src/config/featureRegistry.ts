import { AppRole } from '../types/roles';

export interface FeatureDefinition {
  id: string;
  name: string;
  category: 'Core Modules' | 'Management' | 'Admin & Security';
  description: string;
  defaultRoles: Record<AppRole, boolean>;
  isCriticalForSuperAdmin?: boolean; // Cannot be disabled for Super Admin to prevent lockout
}

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // Core Modules
  {
    id: 'dashboard',
    name: 'Dashboard',
    category: 'Core Modules',
    description: 'Main dashboard view and enterprise metric widgets',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'attendance',
    name: 'Attendance',
    category: 'Core Modules',
    description: 'GeoFenced attendance check-in/check-out and history',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'expenses',
    name: 'Expenses',
    category: 'Core Modules',
    description: 'Expense claims submission, tracking, and approvals',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'workPlanner',
    name: 'Work Planner',
    category: 'Core Modules',
    description: 'Daily task planner, activity logging, and progress tracking',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'myTeam',
    name: 'My Team',
    category: 'Core Modules',
    description: 'Team Leader member overview, live locations, and team task allocation',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: true, HR: false, ADMIN: false, SUPER_ADMIN: true },
  },
  {
    id: 'employeeEfficiency',
    name: 'Employee Efficiency',
    category: 'Core Modules',
    description: 'Efficiency scores, productivity analytics, and benchmark metrics',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'leave',
    name: 'Leave',
    category: 'Core Modules',
    description: 'Leave request applications, leave balances, and approvals',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'notifications',
    name: 'Notifications',
    category: 'Core Modules',
    description: 'Real-time enterprise alerts and announcements',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'reports',
    name: 'Reports',
    category: 'Core Modules',
    description: 'Exportable PDF/Excel reports and aggregate analytics',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'profile',
    name: 'Profile',
    category: 'Core Modules',
    description: 'Personal profile management, settings, and credentials',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'syncCenter',
    name: 'Sync Center',
    category: 'Core Modules',
    description: 'Offline queue status, sync center monitoring, and conflict resolution',
    defaultRoles: { EMPLOYEE: true, TEAM_LEADER: true, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },

  // Management
  {
    id: 'hrManagement',
    name: 'HR Management',
    category: 'Management',
    description: 'HR employee directory, leave configurations, and policy enforcement',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'employeeManagement',
    name: 'Employee Management',
    category: 'Management',
    description: 'Employee profiles, department assignments, and onboarding',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: true, ADMIN: true, SUPER_ADMIN: true },
  },
  {
    id: 'deviceRegistration',
    name: 'Device Registration',
    category: 'Management',
    description: 'Device binding approvals and registration management',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: false, ADMIN: true, SUPER_ADMIN: true },
  },

  // Admin & Security
  {
    id: 'userManagement',
    name: 'User Management',
    category: 'Admin & Security',
    description: 'Centralized user status, activation/deactivation, and role assignment',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: false, ADMIN: true, SUPER_ADMIN: true },
    isCriticalForSuperAdmin: true,
  },
  {
    id: 'systemHealth',
    name: 'System Health',
    category: 'Admin & Security',
    description: 'System diagnostic metrics, error monitoring logs, and disaster recovery',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: false, ADMIN: true, SUPER_ADMIN: true },
    isCriticalForSuperAdmin: true,
  },
  {
    id: 'roleManagement',
    name: 'Role Management',
    category: 'Admin & Security',
    description: 'Define enterprise roles and configure security privileges',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: false, ADMIN: false, SUPER_ADMIN: true },
    isCriticalForSuperAdmin: true,
  },
  {
    id: 'featurePermissions',
    name: 'Feature Permissions',
    category: 'Admin & Security',
    description: 'Granular feature-based permission matrix management',
    defaultRoles: { EMPLOYEE: false, TEAM_LEADER: false, HR: false, ADMIN: false, SUPER_ADMIN: true },
    isCriticalForSuperAdmin: true,
  },
];
