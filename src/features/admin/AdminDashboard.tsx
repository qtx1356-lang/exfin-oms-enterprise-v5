import React, { useEffect, useState, Suspense, useMemo } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import { getAdminDb } from '../../services/firebase/config';
import {
  LogOut,
  Clock,
  Smartphone,
  User,
  Calendar,
  Wifi,
  ShieldCheck,
  Wallet,
  IndianRupee,
  Briefcase,
  Users,
  Building2,
  CheckSquare,
  Sparkles,
  MessageSquare,
  Activity,
  KeyRound,
  LayoutDashboard,
  Brain,
  HelpCircle,
  Mail,
  Megaphone,
  X,
  Menu,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { collection, onSnapshot } from 'firebase/firestore';
import { Button } from '../../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { LoadingScreen } from '../../components/ui/LoadingScreen';
import { listenConversations } from '../../services/chat/chatService';
import { ChangePasswordModal } from '../../components/admin/ChangePasswordModal';

// Lazy load tab components
const EfficiencyDashboard = React.lazy(() => import('../efficiency/EfficiencyDashboard').then(m => ({ default: m.EfficiencyDashboard })));
const ReportsAnalyticsTab = React.lazy(() => import('./ReportsAnalyticsTab').then(m => ({ default: m.ReportsAnalyticsTab })));
const RBACTab = React.lazy(() => import('./RBACTab').then(m => ({ default: m.RBACTab })));
const EmployeeProfilesTab = React.lazy(() => import('./EmployeeProfilesTab').then(m => ({ default: m.EmployeeProfilesTab })));
const AdminWorkPlannerTab = React.lazy(() => import('./AdminWorkPlannerTab').then(m => ({ default: m.AdminWorkPlannerTab })));
const SystemHealthSection = React.lazy(() => import('./SystemHealthSection').then(m => ({ default: m.SystemHealthSection })));
const UserManagementTab = React.lazy(() => import('./UserManagementTab').then(m => ({ default: m.UserManagementTab })));
const TeamManagementTab = React.lazy(() => import('./TeamManagementTab').then(m => ({ default: m.TeamManagementTab })));
const HRManagementTab = React.lazy(() => import('./HRManagementTab').then(m => ({ default: m.HRManagementTab })));
const OrganizationSettingsTab = React.lazy(() => import('./OrganizationSettingsTab').then(m => ({ default: m.OrganizationSettingsTab })));
const SalaryManagementTab = React.lazy(() => import('./SalaryManagementTab').then(m => ({ default: m.SalaryManagementTab })));
const AdminChatTab = React.lazy(() => import('./AdminChatTab').then(m => ({ default: m.AdminChatTab })));
const NotificationManagement = React.lazy(() => import('./NotificationManagement').then(m => ({ default: m.NotificationManagement })));
const OfficePulse = React.lazy(() => import('./OfficePulse').then(m => ({ default: m.OfficePulse })));
const AttendanceIntelligence = React.lazy(() => import('./AttendanceIntelligence').then(m => ({ default: m.AttendanceIntelligence })));
const SmartDailyBrief = React.lazy(() => import('./SmartDailyBrief').then(m => ({ default: m.SmartDailyBrief })));
const AuditLogTab = React.lazy(() => import('./AuditLogTab').then(m => ({ default: m.AuditLogTab })));
const PendingDeviceApprovalsTab = React.lazy(() => import('./PendingDeviceApprovalsTab').then(m => ({ default: m.PendingDeviceApprovalsTab })));
const AdminFAQScreen = React.lazy(() => import('../help/AdminFAQScreen').then(m => ({ default: m.AdminFAQScreen })));
const AdminWorkHoursTab = React.lazy(() => import('./AdminWorkHoursTab').then(m => ({ default: m.AdminWorkHoursTab })));
const AdminLeaveManagementTab = React.lazy(() => import('./AdminLeaveManagementTab').then(m => ({ default: m.AdminLeaveManagementTab })));
const AdminExpensesTab = React.lazy(() => import('./AdminExpensesTab').then(m => ({ default: m.AdminExpensesTab })));
const AdminSecurityTab = React.lazy(() => import('./AdminSecurityTab').then(m => ({ default: m.AdminSecurityTab })));
const DailyAdminReportTab = React.lazy(() => import('./DailyAdminReportTab').then(m => ({ default: m.DailyAdminReportTab })));

// Tab definitions
type AdminTab = 
  | 'overview' 
  | 'registrations' 
  | 'pendingDeviceApprovals'
  | 'attendance' 
  | 'attendanceIntelligence'
  | 'workHours'
  | 'expenses' 
  | 'planner' 
  | 'leaves' 
  | 'hr' 
  | 'salaries'
  | 'organization' 
  | 'profiles' 
  | 'efficiency' 
  | 'reports' 
  | 'health' 
  | 'rbac' 
  | 'chat'
  | 'userManagement'
  | 'teamManagement'
  | 'dailyReport'
  | 'announcements'
  | 'officePulse'
  | 'faq'
  | 'adminSecurity'
  | 'auditLog';
const RegistrationsTab = React.lazy(() => import('./RegistrationsTab').then(m => ({ default: m.RegistrationsTab })));
const AdminAttendanceTab = React.lazy(() => import('./AdminAttendanceTab').then(m => ({ default: m.AdminAttendanceTab })));
const AdminOverviewTab = React.lazy(() => import('./AdminOverviewTab').then(m => ({ default: m.AdminOverviewTab })));

export const AdminDashboard: React.FC = () => {
  const { logout, user: adminUser, role = 'ADMIN', authorizedOffice = 'ALL', loginId, mustChangePassword } = useAdminAuth();
  const navigate = useNavigate();
  const { hasFeatureAccess, isSuperAdmin, isAdmin } = usePermission();

  const [totalUnreadChatCount, setTotalUnreadChatCount] = useState(0);
  const [showSelfChangePasswordModal, setShowSelfChangePasswordModal] = useState(false);

  useEffect(() => {
    if (!loginId) return;
    const unsub = listenConversations(loginId, (convs) => {
      const sum = convs.reduce((acc, c) => acc + (c.unreadCounts?.[loginId] || 0), 0);
      setTotalUnreadChatCount(sum);
    });
    return () => unsub();
  }, [loginId]);

  const canSeeOverview = isSuperAdmin() || hasFeatureAccess('dashboard');
  const canSeeReports = isSuperAdmin() || hasFeatureAccess('reports');
  const canSeeHealth = isSuperAdmin() || hasFeatureAccess('systemHealth');
  const canSeeUserManagement = isSuperAdmin() || hasFeatureAccess('userManagement');
  const canSeeOrganization = isSuperAdmin() || hasFeatureAccess('userManagement') || hasFeatureAccess('hrManagement') || role === 'ADMIN';
  const canSeeProfiles = isSuperAdmin() || hasFeatureAccess('employeeManagement');
  const canSeeHr = isSuperAdmin() || hasFeatureAccess('hrManagement');
  const canSeeSalaries = isSuperAdmin() || hasFeatureAccess('hrManagement') || hasFeatureAccess('employeeManagement');
  const canSeeRbac = isSuperAdmin() || hasFeatureAccess('roleManagement') || hasFeatureAccess('featurePermissions');
  const canSeeRegistrations = isSuperAdmin() || hasFeatureAccess('deviceRegistration');
  const canSeeAttendance = isSuperAdmin() || hasFeatureAccess('attendance');
  const canSeeExpenses = isSuperAdmin() || hasFeatureAccess('expenses');
  const canSeePlanner = isSuperAdmin() || hasFeatureAccess('workPlanner');
  const canSeeLeaves = isSuperAdmin() || hasFeatureAccess('leave');
  const canSeeEfficiency = isSuperAdmin() || hasFeatureAccess('employeeEfficiency');
  const canSeeAnnouncements = isSuperAdmin() || hasFeatureAccess('notifications');

  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (isSuperAdmin() || hasFeatureAccess('dashboard')) return 'overview';
    if (hasFeatureAccess('attendance')) return 'attendance';
    if (hasFeatureAccess('expenses')) return 'expenses';
    if (hasFeatureAccess('workPlanner')) return 'planner';
    if (hasFeatureAccess('leave')) return 'leaves';
    if (hasFeatureAccess('employeeEfficiency')) return 'efficiency';
    if (hasFeatureAccess('reports')) return 'reports';
    if (hasFeatureAccess('employeeManagement')) return 'profiles';
    if (hasFeatureAccess('hrManagement')) return 'hr';
    if (hasFeatureAccess('deviceRegistration')) return 'registrations';
    if (hasFeatureAccess('userManagement')) return 'userManagement';
    if (hasFeatureAccess('systemHealth')) return 'health';
    if (hasFeatureAccess('roleManagement') || hasFeatureAccess('featurePermissions')) return 'rbac';
    return 'overview';
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeEmpCodes, setActiveEmpCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | null = null;

    getAdminDb().then((activeDb) => {
      if (!isMounted || !activeDb) return;
      unsub = onSnapshot(collection(activeDb, 'registrations'), (snap) => {
        const codes = new Set<string>();
        snap.forEach(doc => {
          const data = doc.data();
          if (data.employeeCode) codes.add(String(data.employeeCode));
          if (data.employeeId) codes.add(String(data.employeeId));
          codes.add(doc.id);
        });
        setActiveEmpCodes(codes);
      });
    }).catch(err => console.warn('AdminDashboard registrations listener error:', err));

    return () => {
      isMounted = false;
      if (unsub) unsub();
    };
  }, []);

  const handleSmartBriefNavigation = (tabName: AdminTab, _filter?: string) => {
    setActiveTab(tabName);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/x7Kp9/login');
  };

  const consoleTitle = role === 'SUPER_ADMIN' ? 'Super Admin Console' : role === 'HR' ? 'HR Management Console' : 'Admin Operations Console';

  const navGroups = [
    {
      title: 'ENTERPRISE',
      items: [
        { id: 'overview' as AdminTab, label: 'Overview', icon: LayoutDashboard, visible: canSeeOverview },
        { id: 'officePulse' as AdminTab, label: 'Office Pulse', icon: Sparkles, visible: canSeeOverview },
        { id: 'attendanceIntelligence' as AdminTab, label: 'Attendance Intelligence', icon: Brain, visible: canSeeOverview },
        { id: 'reports' as AdminTab, label: 'Analytics', icon: Activity, visible: canSeeReports },
        { id: 'health' as AdminTab, label: 'System Health', icon: Wifi, visible: canSeeHealth },
      ],
    },
    {
      title: 'PEOPLE & HR',
      items: [
        { id: 'userManagement' as AdminTab, label: 'User Directory & Roles', icon: Users, visible: canSeeUserManagement },
        { id: 'teamManagement' as AdminTab, label: 'Team Management', icon: Users, visible: canSeeUserManagement },
        { id: 'organization' as AdminTab, label: 'Departments & Designations', icon: Building2, visible: canSeeOrganization },
        { id: 'profiles' as AdminTab, label: 'Employee Profiles', icon: User, visible: canSeeProfiles },
        { id: 'hr' as AdminTab, label: 'HR Management', icon: Briefcase, visible: canSeeHr },
        { id: 'salaries' as AdminTab, label: 'Salary Generation', icon: IndianRupee, visible: canSeeSalaries },
      ],
    },
    {
      title: 'SECURITY & RBAC',
      items: [
        { id: 'rbac' as AdminTab, label: 'Roles & Permissions Matrix', icon: KeyRound, visible: canSeeRbac },
        { id: 'adminSecurity' as AdminTab, label: 'Admin Passwords & Security', icon: ShieldCheck, visible: isSuperAdmin() },
        { id: 'pendingDeviceApprovals' as AdminTab, label: 'Pending Device Approvals', icon: Smartphone, visible: canSeeRegistrations },
        { id: 'registrations' as AdminTab, label: 'Device Registrations', icon: Smartphone, visible: canSeeRegistrations },
        { id: 'auditLog' as AdminTab, label: 'Audit Log', icon: ShieldCheck, visible: isSuperAdmin() },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { id: 'attendance' as AdminTab, label: 'Attendance', icon: Clock, visible: canSeeAttendance },
        { id: 'workHours' as AdminTab, label: 'Work Hours', icon: Clock, visible: canSeeAttendance },
        { id: 'expenses' as AdminTab, label: 'Expenses', icon: Wallet, visible: canSeeExpenses },
        { id: 'planner' as AdminTab, label: 'Work Planner', icon: CheckSquare, visible: canSeePlanner },
        { id: 'leaves' as AdminTab, label: 'Leave Portal', icon: Calendar, visible: canSeeLeaves },
        { id: 'efficiency' as AdminTab, label: 'Team Efficiency', icon: Sparkles, visible: canSeeEfficiency },
      ],
    },
    {
      title: 'COMMUNICATION',
      items: [
        { id: 'chat' as AdminTab, label: 'Internal Chat', icon: MessageSquare, badge: totalUnreadChatCount, visible: true },
        { id: 'dailyReport' as AdminTab, label: 'Daily Admin Email', icon: Mail, visible: isSuperAdmin() },
        { id: 'announcements' as AdminTab, label: 'Announcements & Alerts', icon: Megaphone, visible: canSeeAnnouncements },
      ],
    },
    {
      title: 'SUPPORT',
      items: [
        { id: 'faq' as AdminTab, label: 'Admin Help & FAQ', icon: HelpCircle, visible: true },
      ],
    },
  ];

  const renderNavItems = () => (
    <div className="space-y-6">
      {navGroups.map((group) => {
        const visibleItems = group.items.filter((item) => item.visible);
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.title} className="space-y-1">
            <h3 className="px-3 text-[10px] font-black uppercase tracking-wider text-purple-400/70 mb-2">
              {group.title}
            </h3>
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isSelected = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-500/20 to-purple-600/30 text-amber-300 font-extrabold border-l-4 border-amber-400 shadow-md'
                      : 'text-purple-200/80 hover:text-white hover:bg-white/5 font-semibold border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-amber-400' : 'text-purple-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-screen bg-gradient-to-b from-[#14082B] via-[#1D0C3C] to-[#250F4C] text-white overflow-hidden">
      {/* DESKTOP FIXED LEFT SIDEBAR */}
      <aside className="w-64 bg-[#170932] border-r border-amber-500/20 flex flex-col h-full shrink-0 hidden lg:flex z-30 shadow-2xl">
        {/* Sidebar Brand Header */}
        <div className="p-4 border-b border-purple-500/20 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)] shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white tracking-wider truncate">Office Management System</h1>
            <p className="text-[10px] text-amber-400 font-bold uppercase truncate">{consoleTitle}</p>
          </div>
        </div>

        {/* Sidebar Navigation Items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-thin scrollbar-thumb-purple-900/50">
          {renderNavItems()}
        </div>

        {/* Sidebar User Footer */}
        <div className="p-4 border-t border-purple-500/20 bg-[#120629]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">{loginId || adminUser?.email?.split('@')[0] || 'Admin'}</p>
              <p className="text-[10px] text-amber-400 font-mono truncate">{role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : role} • {authorizedOffice}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                onClick={() => setShowSelfChangePasswordModal(true)}
                variant="secondary"
                className="p-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 text-xs"
                title="Change My Password"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
              </Button>
              <Button
                onClick={handleLogout}
                variant="secondary"
                className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER OVERLAY */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 lg:hidden transition-opacity"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* MOBILE DRAWER SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-[#170932] border-r border-amber-500/20 z-50 flex flex-col lg:hidden transition-transform duration-300 ease-in-out shadow-2xl ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-purple-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-md shrink-0">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-wider">Office Management System</h1>
              <p className="text-[10px] text-amber-400 font-bold uppercase">{consoleTitle}</p>
            </div>
          </div>
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-2 rounded-xl bg-purple-900/40 text-purple-200 hover:text-white border border-purple-500/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-thin">
          {renderNavItems()}
        </div>

        <div className="p-4 border-t border-purple-500/20 bg-[#120629]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">{loginId || adminUser?.email?.split('@')[0] || 'Admin'}</p>
              <p className="text-[10px] text-amber-400 font-mono truncate">{role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : role} • {authorizedOffice}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                onClick={() => {
                  setIsMobileSidebarOpen(false);
                  setShowSelfChangePasswordModal(true);
                }}
                variant="secondary"
                className="p-2 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 text-xs"
                title="Change My Password"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
              </Button>
              <Button
                onClick={handleLogout}
                variant="secondary"
                className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="bg-[#1A0B36]/90 backdrop-blur-md border-b border-amber-500/20 px-4 py-3 flex items-center justify-between gap-4 shadow-xl shrink-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2 rounded-xl bg-purple-900/40 text-purple-200 hover:text-white border border-purple-500/30 lg:hidden shrink-0"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide truncate">
                {activeTab === 'overview' && 'Overview Dashboard'}
                {activeTab === 'officePulse' && 'Office Pulse'}
                {activeTab === 'reports' && 'Analytics & Reports'}
                {activeTab === 'health' && 'System Health & Security'}
                {activeTab === 'userManagement' && 'User Directory & Roles'}
                {activeTab === 'teamManagement' && 'Team Management'}
                {activeTab === 'organization' && 'Departments & Designations'}
                {activeTab === 'profiles' && 'Employee Profiles'}
                {activeTab === 'hr' && 'HR Management'}
                {activeTab === 'salaries' && 'Salary Generation'}
                {activeTab === 'rbac' && 'Roles & Permissions Matrix'}
                {activeTab === 'adminSecurity' && 'Admin Passwords & Security'}
                {activeTab === 'registrations' && 'Device Registrations'}
                {activeTab === 'attendance' && 'Attendance Logs'}
                {activeTab === 'workHours' && 'Work Hours Analytics'}
                {activeTab === 'expenses' && 'Expense Claims'}
                {activeTab === 'planner' && 'Work Planner'}
                {activeTab === 'leaves' && 'Leave Portal'}
                {activeTab === 'efficiency' && 'Team Efficiency'}
                {activeTab === 'chat' && 'Internal Communications'}
                {activeTab === 'announcements' && 'Announcements & Alerts'}
              </h2>
              <p className="text-[10px] text-purple-300/70 font-medium truncate hidden sm:block">
                Office Management System Governance Portal v6.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden md:block">
              <div className="text-xs font-bold text-white uppercase">{loginId || adminUser?.email?.split('@')[0] || 'Admin'}</div>
              <div className="text-[10px] text-amber-400 font-mono">
                {role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : role} • {authorizedOffice}
              </div>
            </div>
            <Button
              onClick={() => setShowSelfChangePasswordModal(true)}
              variant="secondary"
              className="gap-1.5 bg-purple-900/40 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 text-xs px-2.5 py-1.5"
              title="Change My Password"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Password</span>
            </Button>
            <Button
              onClick={handleLogout}
              variant="secondary"
              className="gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-3 py-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="w-12 h-12 text-purple-500 animate-spin" />
              <div className="text-purple-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Initializing Component...</div>
            </div>
          }>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && canSeeOverview && (
              <AdminOverviewTab
                role={role}
                authorizedOffice={authorizedOffice}
                loginId={loginId || ''}
                adminEmail={adminUser?.email || ''}
                onNavigateToTab={handleSmartBriefNavigation}
                canSeeAttendance={canSeeAttendance}
                canSeeRegistrations={canSeeRegistrations}
                canSeeUserManagement={canSeeUserManagement}
                canSeeRbac={canSeeRbac}
                canSeeHealth={canSeeHealth}
                canSeeReports={canSeeReports}
                canSeeOverview={canSeeOverview}
              />
            )}

            {/* OFFICE PULSE TAB */}
            {activeTab === 'officePulse' && canSeeOverview && (
              <OfficePulse 
                role={role}
                authorizedOffice={authorizedOffice}
              />
            )}

            {/* ATTENDANCE INTELLIGENCE TAB */}
            {activeTab === 'attendanceIntelligence' && canSeeOverview && (
              <AttendanceIntelligence 
                role={role}
                authorizedOffice={authorizedOffice}
              />
            )}

            {/* USER MANAGEMENT TAB */}
            {activeTab === 'userManagement' && canSeeUserManagement && (
              <UserManagementTab />
            )}

            {/* TEAM MANAGEMENT TAB */}
            {activeTab === 'teamManagement' && canSeeUserManagement && (
              <TeamManagementTab />
            )}

            {/* DEPARTMENTS & DESIGNATIONS TAB */}
            {activeTab === 'organization' && canSeeOrganization && (
              <OrganizationSettingsTab />
            )}

            {/* PROFILES TAB */}
            {activeTab === 'profiles' && canSeeProfiles && <EmployeeProfilesTab />}

            {/* HR MANAGEMENT TAB */}
            {activeTab === 'hr' && canSeeHr && <HRManagementTab />}

            {/* SALARY MANAGEMENT TAB */}
            {activeTab === 'salaries' && canSeeSalaries && <SalaryManagementTab />}

            {/* ROLES & PERMISSIONS MATRIX TAB */}
            {activeTab === 'rbac' && canSeeRbac && <RBACTab />}

            {/* ADMIN PASSWORDS & SECURITY TAB (SUPER ADMIN ONLY) */}
            {activeTab === 'adminSecurity' && (
              isSuperAdmin() ? (
                <AdminSecurityTab />
              ) : (
                <Card className="p-8 glass-card border border-rose-500/30 text-center space-y-4">
                  <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
                  <h2 className="text-lg font-bold text-white">Access Denied</h2>
                  <p className="text-xs text-purple-200">Password management is restricted exclusively to Super Administrators.</p>
                </Card>
              )
            )}

            {/* REPORTS & ANALYTICS TAB */}
            {activeTab === 'reports' && canSeeReports && (
              <ReportsAnalyticsTab 
                role={role as 'ADMIN' | 'SUPER_ADMIN'}
                authorizedOffice={authorizedOffice}
              />
            )}

            {/* SYSTEM HEALTH TAB */}
            {activeTab === 'health' && canSeeHealth && <SystemHealthSection />}

            {/* WORK HOURS TAB */}
            {activeTab === 'workHours' && canSeeAttendance && (
              <AdminWorkHoursTab />
            )}

            {/* EFFICIENCY TAB */}
            {activeTab === 'efficiency' && canSeeEfficiency && <EfficiencyDashboard />}

            {/* INTERNAL CHAT TAB */}
            {activeTab === 'chat' && <AdminChatTab />}

            {/* ANNOUNCEMENTS & ALERTS TAB */}
            {activeTab === 'announcements' && canSeeAnnouncements && <NotificationManagement />}

            {/* DAILY ADMIN REPORT TAB (SUPER-ADMIN ONLY) */}
            {activeTab === 'dailyReport' && isSuperAdmin() && <DailyAdminReportTab />}

            {/* FAQ TAB */}
            {activeTab === 'faq' && <AdminFAQScreen />}

            {/* PENDING DEVICE APPROVALS TAB */}
            {activeTab === 'pendingDeviceApprovals' && canSeeRegistrations && <PendingDeviceApprovalsTab />}

            {/* AUDIT LOG TAB (SUPER ADMIN ONLY) */}
            {activeTab === 'auditLog' && (
              isSuperAdmin() ? (
                <AuditLogTab />
              ) : (
                <Card className="p-8 glass-card border border-rose-500/30 text-center space-y-4">
                  <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
                  <h2 className="text-lg font-bold text-white">Access Denied</h2>
                  <p className="text-xs text-purple-200">The Audit Log is restricted exclusively to Super Administrators. You do not have permission to view this section.</p>
                </Card>
              )
            )}

            {/* ATTENDANCE TAB */}
            {activeTab === 'attendance' && canSeeAttendance && (
              <AdminAttendanceTab role={role} isSuperAdmin={isSuperAdmin} />
            )}

            {/* EXPENSES TAB */}
            {activeTab === 'expenses' && canSeeExpenses && (
              <AdminExpensesTab activeEmpCodes={activeEmpCodes} />
            )}

            {/* PLANNER TAB */}
            {activeTab === 'planner' && canSeePlanner && (
              <AdminWorkPlannerTab />
            )}

            {/* LEAVES TAB */}
            {activeTab === 'leaves' && canSeeLeaves && (
              <AdminLeaveManagementTab activeEmpCodes={activeEmpCodes} />
            )}

            {/* DEVICE REGISTRATIONS TAB */}
            {activeTab === 'registrations' && canSeeRegistrations && (
              <RegistrationsTab />
            )}
          </Suspense>
        </main>

        {/* Admin Self Change Password Modal */}
        <ChangePasswordModal
          isOpen={showSelfChangePasswordModal || !!mustChangePassword}
          onClose={() => setShowSelfChangePasswordModal(false)}
          isMandatory={!!mustChangePassword}
        />
      </div>
    </div>
  );
};
