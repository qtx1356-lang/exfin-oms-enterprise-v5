import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import { db } from '../../services/firebase/config';
import { createNotification } from '../../services/notification/notificationService';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import {
  LogOut,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Smartphone,
  User,
  Phone,
  Calendar,
  Wifi,
  WifiOff,
  ShieldCheck,
  Shield,
  RefreshCw,
  Wallet,
  Paperclip,
  IndianRupee,
  Briefcase,
  Plus,
  Users,
  Building2,
  Sliders,
  Filter,
  CheckSquare,
  Sparkles,
  Layers,
  AlertTriangle,
  Edit3,
  MessageSquare,
  Send,
  Activity,
  KeyRound,
  Database,
  FileText,
  Settings,
  Info,
  MapPin,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useNavigate } from 'react-router-dom';
import { AttendanceRecord } from '../../types/attendance';
import { ExpenseRecord } from '../../types/expense';
import { TaskRecord, TaskPriority, TaskStatus, AssignmentType, TaskComment, getEffectiveTaskStatus } from '../../types/planner';
import { getStoredTasks, saveTaskRecord } from '../../services/planner/taskStorage';
import { EfficiencyDashboard } from '../efficiency/EfficiencyDashboard';
import { ReportsAnalyticsTab } from './ReportsAnalyticsTab';
import { RBACTab } from './RBACTab';
import { EmployeeProfilesTab } from './EmployeeProfilesTab';
import { AdminWorkPlannerTab } from './AdminWorkPlannerTab';
import { SystemHealthSection } from './SystemHealthSection';
import { UserManagementTab } from './UserManagementTab';
import { HRManagementTab } from './HRManagementTab';
import { LeaveRecord, LeaveConfig, EmployeeAllowance } from '../../types/leave';
import { reviewLeaveRequest, adminOverrideLeave, updateLeaveConfig, updateEmployeeAllowance, calculateLeaveBalance } from '../../services/leave/leaveService';
import { getStoredLeaves, getStoredLeaveConfig, getStoredEmployeeAllowances } from '../../services/leave/leaveStorage';

type Registration = {
  id: string;
  employeeCode: string;
  name: string;
  mobileNumber: string;
  deviceId: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  selfieUrl: string;
  registrationDate: string;
  status: string;
  rejectionReason?: string;
  office: string;
  isTeamLeader?: boolean;
  teamLeaderId?: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName?: string | null;
};

type AdminTab =
  | 'overview'
  | 'userManagement'
  | 'profiles'
  | 'hr'
  | 'attendance'
  | 'expenses'
  | 'planner'
  | 'leaves'
  | 'efficiency'
  | 'rbac'
  | 'registrations'
  | 'reports'
  | 'health'
  | 'sync';

export const AdminDashboard: React.FC = () => {
  const { logout, user: adminUser, role = 'ADMIN', authorizedOffice = 'ALL', loginId } = useAdminAuth();
  const navigate = useNavigate();
  const { hasFeatureAccess, isSuperAdmin } = usePermission();

  const canSeeOverview = isSuperAdmin() || hasFeatureAccess('dashboard');
  const canSeeReports = isSuperAdmin() || hasFeatureAccess('reports');
  const canSeeHealth = isSuperAdmin() || hasFeatureAccess('systemHealth');
  const canSeeUserManagement = isSuperAdmin() || hasFeatureAccess('userManagement');
  const canSeeProfiles = isSuperAdmin() || hasFeatureAccess('employeeManagement');
  const canSeeHr = isSuperAdmin() || hasFeatureAccess('hrManagement');
  const canSeeRbac = isSuperAdmin() || hasFeatureAccess('roleManagement') || hasFeatureAccess('featurePermissions');
  const canSeeRegistrations = isSuperAdmin() || hasFeatureAccess('deviceRegistration');
  const canSeeAttendance = isSuperAdmin() || hasFeatureAccess('attendance');
  const canSeeExpenses = isSuperAdmin() || hasFeatureAccess('expenses');
  const canSeePlanner = isSuperAdmin() || hasFeatureAccess('workPlanner');
  const canSeeLeaves = isSuperAdmin() || hasFeatureAccess('leave');
  const canSeeEfficiency = isSuperAdmin() || hasFeatureAccess('employeeEfficiency');

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

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  
  // Deduplicate registrations by deviceId, keeping the newest registrationDate
  const deduplicatedRegistrations = React.useMemo(() => {
    const map = new Map<string, Registration>();
    const getCodeNum = (code: string) => parseInt(code.replace('EXFRNG', ''), 10) || 0;

    registrations.forEach((reg) => {
      const existing = map.get(reg.deviceId);
      if (!existing) {
        map.set(reg.deviceId, reg);
      } else {
        const dateNew = new Date(reg.registrationDate || 0).getTime();
        const dateOld = new Date(existing.registrationDate || 0).getTime();
        
        if (dateNew > dateOld) {
          map.set(reg.deviceId, reg);
        } else if (dateNew === dateOld) {
          // Fallback to employee code sequence
          if (getCodeNum(reg.employeeCode) > getCodeNum(existing.employeeCode)) {
            map.set(reg.deviceId, reg);
          }
        }
      }
    });
    return Array.from(map.values());
  }, [registrations]);

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [leaveConfig, setLeaveConfig] = useState<LeaveConfig | null>(null);
  const [employeeAllowances, setEmployeeAllowances] = useState<EmployeeAllowance[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);
  const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);

  const [rejectionReason, setRejectionReason] = useState('');
  const [expenseRejectReason, setExpenseRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showExpenseRejectDialog, setShowExpenseRejectDialog] = useState(false);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // Admin Task Planner States
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [taskFilterDept, setTaskFilterDept] = useState<string>('All');
  const [taskFilterPriority, setTaskFilterPriority] = useState<string>('All');
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('All');
  const [adminRemarkInput, setAdminRemarkInput] = useState<string>('');

  // Form fields for Create / Edit Task
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDept, setTaskDept] = useState('Operations');
  const [taskAssignmentType, setTaskAssignmentType] = useState<AssignmentType>('EMPLOYEE');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskStartDate, setTaskStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [taskDueTime, setTaskDueTime] = useState('18:00');
  const [taskManagerRemarks, setTaskManagerRemarks] = useState('');

  // Leaves management
  const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
  const [leaveRemark, setLeaveRemark] = useState('');
  const [isOverridingDecision, setIsOverridingDecision] = useState(false);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [leaveTeamFilter, setLeaveTeamFilter] = useState<string>('ALL');
  const [leaveSearch, setLeaveSearch] = useState('');

  // Firestore subscriptions
  useEffect(() => {
    if (!db) return;

    let regsLoaded = false;
    let attendanceLoaded = false;
    let expensesLoaded = false;
    let tasksLoaded = false;
    let leavesLoaded = false;

    const checkAllLoaded = () => {
      if (regsLoaded && attendanceLoaded && expensesLoaded && tasksLoaded && leavesLoaded) {
        setIsDataLoading(false);
      }
    };

    // Listen to registrations
    const qRegs = query(collection(db, 'registrations'), orderBy('registrationDate', 'desc'));
    const unsubRegs = onSnapshot(qRegs, (snapshot) => {
      const regs: Registration[] = [];
      snapshot.forEach((doc) => {
        regs.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(regs);
      regsLoaded = true;
      checkAllLoaded();
    }, () => { regsLoaded = true; checkAllLoaded(); });

    // Listen to attendance
    const qAttendance = query(collection(db, 'attendance'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const firestoreAtt: AttendanceRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreAtt.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
      });
      setAttendanceRecords(firestoreAtt);
      attendanceLoaded = true;
      checkAllLoaded();
    }, () => { attendanceLoaded = true; checkAllLoaded(); });

    // Listen to expenses
    const qExpenses = query(collection(db, 'expenses'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const firestoreExp: ExpenseRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreExp.push({ id: doc.id, ...doc.data() } as ExpenseRecord);
      });
      setExpenseRecords(firestoreExp);
      expensesLoaded = true;
      checkAllLoaded();
    }, () => { expensesLoaded = true; checkAllLoaded(); });

    // Listen to tasks
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const firestoreTasks: TaskRecord[] = [];
      snapshot.forEach((docSnap) => {
        firestoreTasks.push({ id: docSnap.id, ...docSnap.data() } as TaskRecord);
      });
      setTasks(firestoreTasks);
      tasksLoaded = true;
      checkAllLoaded();
    }, () => { tasksLoaded = true; checkAllLoaded(); });

    // Listen to leaves
    const unsubLeaves = onSnapshot(collection(db, 'leaves'), (snapshot) => {
      const firestoreLeaves: LeaveRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreLeaves.push({ id: doc.id, ...doc.data() } as LeaveRecord);
      });
      setLeaves(firestoreLeaves);
      leavesLoaded = true;
      checkAllLoaded();
    }, () => { leavesLoaded = true; checkAllLoaded(); });

    return () => {
      unsubRegs();
      unsubAttendance();
      unsubExpenses();
      unsubTasks();
      unsubLeaves();
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const pendingRegCount = deduplicatedRegistrations.filter((r) => r.status === 'Pending Approval').length;
  const pendingExpenseCount = expenseRecords.filter((e) => e.status === 'PENDING').length;
  const pendingLeaveCount = leaves.filter((l) => l.status === 'PENDING').length;

  const consoleTitle = role === 'SUPER_ADMIN' ? 'Super Admin Console' : role === 'HR' ? 'HR Management Console' : 'Admin Operations Console';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#14082B] via-[#1D0C3C] to-[#250F4C] text-white">
      {/* Top Header */}
      <header className="bg-[#1A0B36]/90 backdrop-blur-md border-b border-amber-500/20 sticky top-0 z-40 px-4 py-3 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.4)]">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-wide">EXFIN OMS ENTERPRISE</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {consoleTitle}
              </span>
            </div>
            <p className="text-[11px] text-purple-300/70 font-medium">Enterprise Governance & Security Control Portal v6.0</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-white uppercase">{loginId || adminUser?.email?.split('@')[0] || 'Admin'}</div>
            <div className="text-[10px] text-amber-400 font-mono">
              {role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : role} • {authorizedOffice}
            </div>
          </div>
          <Button onClick={handleLogout} variant="secondary" className="gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Structured Navigation Bar */}
      <div className="bg-[#15092E] border-b border-purple-500/20 px-4 py-3 overflow-x-auto scrollbar-none">
        <div className="max-w-7xl mx-auto flex items-center gap-6 text-xs">
          {/* SECTION: ENTERPRISE */}
          {(canSeeOverview || canSeeReports || canSeeHealth) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider pr-1">Enterprise:</span>
              {canSeeOverview && (
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'overview' ? 'bg-amber-500 text-black shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Overview
                </button>
              )}
              {canSeeReports && (
                <button
                  onClick={() => setActiveTab('reports')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'reports' ? 'bg-amber-500 text-black shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Analytics
                </button>
              )}
              {canSeeHealth && (
                <button
                  onClick={() => setActiveTab('health')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'health' ? 'bg-amber-500 text-black shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  System Health
                </button>
              )}
            </div>
          )}

          {(canSeeOverview || canSeeReports || canSeeHealth) && (canSeeUserManagement || canSeeProfiles || canSeeHr) && (
            <div className="h-4 w-px bg-purple-500/20 shrink-0" />
          )}

          {/* SECTION: PEOPLE */}
          {(canSeeUserManagement || canSeeProfiles || canSeeHr) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold text-purple-400 uppercase tracking-wider pr-1">People:</span>
              {canSeeUserManagement && (
                <button
                  onClick={() => setActiveTab('userManagement')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'userManagement' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  User Directory & Roles
                </button>
              )}
              {canSeeProfiles && (
                <button
                  onClick={() => setActiveTab('profiles')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'profiles' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Employee Profiles
                </button>
              )}
              {canSeeHr && (
                <button
                  onClick={() => setActiveTab('hr')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'hr' ? 'bg-purple-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  HR Management
                </button>
              )}
            </div>
          )}

          {(canSeeUserManagement || canSeeProfiles || canSeeHr) && (canSeeRbac || canSeeRegistrations) && (
            <div className="h-4 w-px bg-purple-500/20 shrink-0" />
          )}

          {/* SECTION: SECURITY & RBAC */}
          {(canSeeRbac || canSeeRegistrations) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider pr-1">Security:</span>
              {canSeeRbac && (
                <button
                  onClick={() => setActiveTab('rbac')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'rbac' ? 'bg-emerald-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Roles & Permissions Matrix
                </button>
              )}
              {canSeeRegistrations && (
                <button
                  onClick={() => setActiveTab('registrations')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'registrations' ? 'bg-emerald-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Device Registrations ({pendingRegCount})
                </button>
              )}
            </div>
          )}

          {(canSeeRbac || canSeeRegistrations) && (canSeeAttendance || canSeeExpenses || canSeePlanner || canSeeLeaves || canSeeEfficiency) && (
            <div className="h-4 w-px bg-purple-500/20 shrink-0" />
          )}

          {/* SECTION: OPERATIONS */}
          {(canSeeAttendance || canSeeExpenses || canSeePlanner || canSeeLeaves || canSeeEfficiency) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider pr-1">Operations:</span>
              {canSeeAttendance && (
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'attendance' ? 'bg-blue-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Attendance
                </button>
              )}
              {canSeeExpenses && (
                <button
                  onClick={() => setActiveTab('expenses')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'expenses' ? 'bg-blue-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Expenses ({pendingExpenseCount})
                </button>
              )}
              {canSeePlanner && (
                <button
                  onClick={() => setActiveTab('planner')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'planner' ? 'bg-blue-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Work Planner
                </button>
              )}
              {canSeeLeaves && (
                <button
                  onClick={() => setActiveTab('leaves')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'leaves' ? 'bg-blue-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Leave Portal ({pendingLeaveCount})
                </button>
              )}
              {canSeeEfficiency && (
                <button
                  onClick={() => setActiveTab('efficiency')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    activeTab === 'efficiency' ? 'bg-blue-600 text-white shadow-md' : 'text-purple-300/80 hover:text-white bg-white/5'
                  }`}
                >
                  Efficiency
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && canSeeOverview && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-5 bg-[#250F4C] border border-amber-500/30 flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-300">
                  <Shield className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-[10px] text-amber-300 uppercase font-black">Security Context</div>
                  <div className="text-xl font-black text-white">{role}</div>
                </div>
              </Card>

              <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
                <div className="p-3 bg-purple-500/20 rounded-2xl text-purple-300">
                  <Users className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-[10px] text-purple-300 uppercase font-bold">Unique Devices</div>
                  <div className="text-xl font-black text-white">{deduplicatedRegistrations.length} Total</div>
                </div>
              </Card>

              <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
                <div className="p-3 bg-emerald-500/20 rounded-2xl text-emerald-300">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-[10px] text-purple-300 uppercase font-bold">Attendance Records</div>
                  <div className="text-xl font-black text-emerald-400">{attendanceRecords.length} Today</div>
                </div>
              </Card>

              <Card className="p-5 bg-[#250F4C] border border-purple-500/20 flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-2xl text-amber-300">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-[10px] text-purple-300 uppercase font-bold">Action Items</div>
                  <div className="text-xl font-black text-amber-300">
                    {pendingRegCount + pendingExpenseCount + pendingLeaveCount} Pending
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" /> Executive Controls & Administration
                </h3>
                <p className="text-xs text-purple-200/70">
                  You are operating with administrative privileges on the unified enterprise console.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  {canSeeUserManagement && (
                    <Button onClick={() => setActiveTab('userManagement')} className="bg-purple-600 hover:bg-purple-500 text-xs py-2.5">
                      User Management
                    </Button>
                  )}
                  {canSeeRbac && (
                    <Button onClick={() => setActiveTab('rbac')} className="bg-emerald-600 hover:bg-emerald-500 text-xs py-2.5">
                      Permissions Matrix
                    </Button>
                  )}
                  {canSeeHealth && (
                    <Button onClick={() => setActiveTab('health')} variant="secondary" className="text-xs py-2.5">
                      System Health
                    </Button>
                  )}
                  {canSeeReports && (
                    <Button onClick={() => setActiveTab('reports')} variant="secondary" className="text-xs py-2.5">
                      Enterprise Reports
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Immediate Attention Summary
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20">
                    <span className="text-purple-200 font-medium">Pending Device Registrations</span>
                    <span className="font-bold text-amber-400">{pendingRegCount}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20">
                    <span className="text-purple-200 font-medium">Pending Expense Claims</span>
                    <span className="font-bold text-amber-400">{pendingExpenseCount}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between items-center border border-purple-500/20">
                    <span className="text-purple-200 font-medium">Pending Leave Requests</span>
                    <span className="font-bold text-amber-400">{pendingLeaveCount}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* USER MANAGEMENT TAB */}
        {activeTab === 'userManagement' && canSeeUserManagement && <UserManagementTab />}

        {/* PROFILES TAB */}
        {activeTab === 'profiles' && canSeeProfiles && <EmployeeProfilesTab />}

        {/* HR MANAGEMENT TAB */}
        {activeTab === 'hr' && canSeeHr && <HRManagementTab />}

        {/* ROLES & PERMISSIONS MATRIX TAB */}
        {activeTab === 'rbac' && canSeeRbac && <RBACTab />}

        {/* REPORTS & ANALYTICS TAB */}
        {activeTab === 'reports' && canSeeReports && (
          <ReportsAnalyticsTab 
            role={role as 'ADMIN' | 'SUPER_ADMIN'}
            authorizedOffice={authorizedOffice}
            registrations={deduplicatedRegistrations}
            attendanceRecords={attendanceRecords}
            expenseRecords={expenseRecords}
            tasks={tasks}
            leaves={leaves}
            isLoading={isDataLoading}
          />
        )}

        {/* SYSTEM HEALTH TAB */}
        {activeTab === 'health' && canSeeHealth && <SystemHealthSection />}

        {/* EFFICIENCY TAB */}
        {activeTab === 'efficiency' && canSeeEfficiency && <EfficiencyDashboard />}

        {/* ATTENDANCE TAB */}
        {activeTab === 'attendance' && canSeeAttendance && (
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" /> Operational Attendance Records
              </h3>
              <div className="text-[10px] text-purple-300/60 italic">Click any record to view complete forensic details</div>
            </div>
            
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent pb-4">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold sticky top-0 z-10">
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Employee</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Code</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Date</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Mode</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-emerald-400">Check In</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">CI Mode</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-purple-200">Check Out</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">CO Mode</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Hours</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Distance</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Town/City</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Client/Outdoor</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Sync</th>
                    <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Conn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {attendanceRecords.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="p-12 text-center text-purple-300/60">
                        <EmptyState icon={Calendar} title="No Records" description="No attendance records logged yet." />
                      </td>
                    </tr>
                  ) : (
                    attendanceRecords.map((rec) => (
                      <tr 
                        key={rec.id} 
                        className="hover:bg-white/[0.05] cursor-pointer transition-colors group"
                        onClick={() => {
                          setSelectedAttendance(rec);
                          setShowAttendanceDetails(true);
                        }}
                      >
                        <td className="p-3 border-b border-purple-500/10">
                          <div className="font-bold text-white group-hover:text-amber-400 transition-colors">
                            {rec.employeeName || '—'}
                          </div>
                        </td>
                        <td className="p-3 border-b border-purple-500/10 font-mono text-purple-300 font-medium">
                          {rec.employeeId || rec.employeeCode || '—'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10 text-white whitespace-nowrap">
                          {rec.date}
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            rec.attendanceType === 'OFFICE' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                            rec.attendanceType === 'WFH' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' :
                            rec.attendanceType === 'CLIENT_VISIT' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                            'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          }`}>
                            {rec.attendanceType === 'OFFICE' ? 'Office' :
                             rec.attendanceType === 'WFH' ? 'WFH' :
                             rec.attendanceType === 'CLIENT_VISIT' ? 'Client' :
                             'Outdoor'}
                          </span>
                        </td>
                        <td className="p-3 border-b border-purple-500/10 text-emerald-400 font-bold whitespace-nowrap">
                          {rec.checkInTime}
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rec.checkInMode === 'AUTO' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-purple-500/10 text-purple-300'
                          }`}>
                            {rec.checkInMode === 'AUTO' ? 'Auto' : 'Manual'}
                          </span>
                        </td>
                        <td className="p-3 border-b border-purple-500/10 text-purple-200 whitespace-nowrap">
                          {rec.checkOutTime || '--:--'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rec.checkOutMode === 'MANUAL' ? 'bg-purple-500/10 text-purple-300' : 
                            rec.checkOutMode === 'AUTO_SYSTEM' ? 'bg-amber-500/10 text-amber-300' :
                            'bg-white/5 text-white/40'
                          }`}>
                            {rec.checkOutMode === 'MANUAL' ? 'Manual' : 
                             rec.checkOutMode === 'AUTO_SYSTEM' ? 'System' : 'N/A'}
                          </span>
                        </td>
                        <td className="p-3 border-b border-purple-500/10 font-bold text-white">
                          {rec.workingHours || '—'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10 text-purple-300 font-mono">
                          {rec.distance ? `${(rec.distance / 1000).toFixed(2)}km` : '—'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10 text-purple-200 truncate max-w-[120px]" title={rec.townCity}>
                          {rec.townCity || '—'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          {rec.attendanceType === 'CLIENT_VISIT' ? (
                            <div className="text-[10px] leading-tight">
                              <div className="text-white font-bold truncate max-w-[100px]">{rec.clientName}</div>
                              <div className="text-purple-300/60 truncate max-w-[100px]">{rec.clientLocation}</div>
                            </div>
                          ) : rec.attendanceType === 'OUTDOOR' ? (
                            <div className="text-[10px] font-bold text-amber-300">{rec.outdoorType || '—'}</div>
                          ) : '—'}
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            rec.syncStatus === 'Synced' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'
                          }`}>
                            {rec.syncStatus}
                          </span>
                        </td>
                        <td className="p-3 border-b border-purple-500/10">
                          {rec.isOffline ? (
                            <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                          ) : (
                            <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* EXPENSES TAB */}
        {activeTab === 'expenses' && canSeeExpenses && (
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" /> Expense Claims Audit
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold border-b border-purple-500/20">
                    <th className="p-3">Employee</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {expenseRecords.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-purple-300/60">No expense claims found.</td>
                    </tr>
                  ) : (
                    expenseRecords.map((exp) => (
                      <tr key={exp.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 font-bold text-white">{exp.employeeName} ({exp.employeeCode})</td>
                        <td className="p-3 text-purple-200">{exp.category}</td>
                        <td className="p-3 font-bold text-emerald-400">₹{exp.amount}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            exp.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {exp.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* PLANNER TAB */}
        {activeTab === 'planner' && canSeePlanner && (
          <AdminWorkPlannerTab />
        )}

        {/* LEAVES TAB */}
        {activeTab === 'leaves' && canSeeLeaves && (
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" /> Leave Requests Overview
            </h3>
            <div className="space-y-2">
              {leaves.length === 0 ? (
                <p className="text-xs text-purple-300/60 text-center py-6">No leave requests found.</p>
              ) : (
                leaves.map((l) => (
                  <div key={l.id} className="p-3 bg-[#1A0B36] rounded-xl border border-purple-500/20 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-white">{l.employeeName} ({l.leaveType})</div>
                      <div className="text-[10px] text-purple-300/60">{l.startDate} to {l.endDate} ({l.totalDays} Days)</div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                      {l.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* DEVICE REGISTRATIONS TAB */}
        {activeTab === 'registrations' && canSeeRegistrations && (
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" /> Device Registration Management
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold border-b border-purple-500/20">
                    <th className="p-3">Employee</th>
                    <th className="p-3">Device Model</th>
                    <th className="p-3">Office</th>
                    <th className="p-3">Device ID</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {deduplicatedRegistrations.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-purple-300/60">No device registrations found.</td>
                    </tr>
                  ) : (
                    deduplicatedRegistrations.map((reg) => (
                      <tr key={reg.id} className="hover:bg-white/[0.02]">
                        <td className="p-3 font-bold text-white">{reg.name} ({reg.employeeCode})</td>
                        <td className="p-3 text-purple-200">{reg.deviceModel} (Android {reg.androidVersion})</td>
                        <td className="p-3 text-purple-200">{reg.office}</td>
                        <td className="p-3 text-purple-200 font-mono text-[10px]">{reg.deviceId}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            reg.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {reg.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
      {/* Attendance Forensic Details Dialog */}
      <Dialog
        isOpen={showAttendanceDetails && !!selectedAttendance}
        onClose={() => setShowAttendanceDetails(false)}
        title="Attendance Forensic Audit"
      >
        {selectedAttendance && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-500/20">
            {/* Header: Employee Core Info */}
            <div className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-black text-xl shadow-lg">
                  {selectedAttendance.employeeName?.charAt(0) || 'U'}
                </div>
                <div>
                  <h4 className="text-lg font-black text-white">{selectedAttendance.employeeName}</h4>
                  <p className="text-xs text-purple-300 font-mono uppercase tracking-widest">{selectedAttendance.employeeId || selectedAttendance.employeeCode}</p>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[10px] text-purple-300/60 uppercase font-bold">Shift Date</div>
                  <div className="text-sm font-black text-white">{selectedAttendance.date}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Event Timeline */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-purple-300 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-3 h-3" /> Event Timeline
                </h5>
                <div className="space-y-2">
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex justify-between items-center">
                    <span className="text-[11px] text-emerald-300 font-bold">Check-In</span>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{selectedAttendance.checkInTime}</div>
                      <div className="text-[9px] text-emerald-300/60 font-mono uppercase">{selectedAttendance.checkInMode} Mode</div>
                    </div>
                  </div>
                  <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl flex justify-between items-center">
                    <span className="text-[11px] text-purple-300 font-bold">Check-Out</span>
                    <div className="text-right">
                      <div className="text-sm font-black text-white">{selectedAttendance.checkOutTime || '—'}</div>
                      <div className="text-[9px] text-purple-300/60 font-mono uppercase">{selectedAttendance.checkOutMode} Mode</div>
                    </div>
                  </div>
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center">
                    <span className="text-[11px] text-white/70 font-bold">Total Duration</span>
                    <span className="text-sm font-black text-white">{selectedAttendance.workingHours || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Geo-Forensics */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-amber-300 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-3 h-3" /> Geo-Forensics
                </h5>
                <div className="space-y-2">
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] text-amber-300 font-bold">Location</span>
                      <span className="text-[10px] text-amber-300/60 font-mono uppercase">{selectedAttendance.distance ? `${(selectedAttendance.distance).toFixed(0)}m from HQ` : '—'}</span>
                    </div>
                    <div className="text-xs text-white font-medium mb-2">{selectedAttendance.townCity || 'Unknown Location'}</div>
                    <div className="text-[9px] text-purple-300/40 font-mono">{selectedAttendance.latitude}, {selectedAttendance.longitude}</div>
                  </div>
                  
                  {/* Geo-Fencing Logs */}
                  {(selectedAttendance.exitTime || selectedAttendance.returnTime) && (
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl space-y-1">
                      <div className="text-[11px] text-red-300 font-bold">Geofence Violation Logs</div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/60">Last Exit:</span>
                        <span className="text-white font-bold">{selectedAttendance.exitTime || '—'}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-white/60">Last Return:</span>
                        <span className="text-white font-bold">{selectedAttendance.returnTime || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Context Specific Data */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-blue-300 uppercase tracking-widest flex items-center gap-2">
                <Briefcase className="w-3 h-3" /> Professional Context: {selectedAttendance.attendanceType}
              </h5>
              
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                {selectedAttendance.attendanceType === 'OFFICE' && (
                  <p className="text-xs text-blue-200">This record represents standard physical presence at the registered primary office geofence.</p>
                )}

                {selectedAttendance.attendanceType === 'WFH' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-blue-300/60 uppercase font-bold">WFH Reason</div>
                        <div className="text-xs text-white font-medium">{selectedAttendance.wfhReason || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-blue-300/60 uppercase font-bold">Monthly WFH Tally</div>
                        <div className="text-xs text-white font-medium">{selectedAttendance.monthlyWfhCount || 0} Records</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-300/60 uppercase font-bold">Planned Objectives</div>
                      <div className="text-xs text-white leading-relaxed mt-1">{selectedAttendance.workPlan || '—'}</div>
                    </div>
                  </div>
                )}

                {selectedAttendance.attendanceType === 'CLIENT_VISIT' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-blue-300/60 uppercase font-bold">Client Authority</div>
                        <div className="text-xs text-white font-black">{selectedAttendance.clientName || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-blue-300/60 uppercase font-bold">Site Location</div>
                        <div className="text-xs text-white font-medium">{selectedAttendance.clientLocation || '—'}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-300/60 uppercase font-bold">Mission Purpose</div>
                      <div className="text-xs text-white leading-relaxed mt-1">{selectedAttendance.purpose || '—'}</div>
                    </div>
                  </div>
                )}

                {selectedAttendance.attendanceType === 'OUTDOOR' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] text-blue-300/60 uppercase font-bold">Operational Type</div>
                        <div className="text-xs text-white font-black">{selectedAttendance.outdoorType || '—'}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-300/60 uppercase font-bold">Activity Description</div>
                      <div className="text-xs text-white leading-relaxed mt-1">{selectedAttendance.description || '—'}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* System Telemetry */}
            <div className="space-y-3">
              <h5 className="text-[10px] font-black text-purple-300/60 uppercase tracking-widest flex items-center gap-2">
                <Database className="w-3 h-3" /> System Metadata
              </h5>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 bg-white/5 rounded-lg">
                  <div className="text-[9px] text-purple-300/40 uppercase font-bold">Device Stamp</div>
                  <div className="text-[10px] text-white/60 truncate" title={selectedAttendance.createdAtDeviceTime}>{selectedAttendance.createdAtDeviceTime.split('T')[0]}</div>
                </div>
                <div className="p-2 bg-white/5 rounded-lg">
                  <div className="text-[9px] text-purple-300/40 uppercase font-bold">Sync State</div>
                  <div className="text-[10px] text-white/60 font-bold">{selectedAttendance.syncStatus}</div>
                  {selectedAttendance.serverSyncTime && (
                    <div className="text-[8px] text-emerald-400/60 font-mono mt-0.5 truncate">{selectedAttendance.serverSyncTime}</div>
                  )}
                </div>
                <div className="p-2 bg-white/5 rounded-lg">
                  <div className="text-[9px] text-purple-300/40 uppercase font-bold">Net Status</div>
                  <div className="text-[10px] text-white/60 font-bold">{selectedAttendance.isOffline ? 'OFFLINE' : 'ONLINE'}</div>
                  <div className="text-[8px] text-purple-300/40 mt-0.5">{selectedAttendance.reminderCount || 0} Reminders</div>
                </div>
              </div>
              {selectedAttendance.reason && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-[10px] text-amber-500 font-black uppercase">System Flag</div>
                    <div className="text-xs text-white">{selectedAttendance.reason}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-purple-500/20 flex justify-end">
              <Button onClick={() => setShowAttendanceDetails(false)} className="bg-purple-600 hover:bg-purple-500">
                Close Audit View
              </Button>
            </div>
          </div>
        )}
      </Dialog>

    </div>
  );
};
