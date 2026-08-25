import React, { useEffect, useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';
import { Card } from '../../components/ui/Card';
import { 
  Calendar, 
  Clock, 
  UserCheck, 
  Hourglass,
  Bell,
  Wallet,
  Briefcase,
  Megaphone,
  MapPin,
  Building2,
  PhoneCall,
  Sparkles,
  Users,
  BarChart3,
  User,
  FileText,
  AlertCircle,
  MessageSquare,
  CheckSquare,
  ArrowRight,
  Sun,
  Moon,
  RotateCcw,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTodayAttendanceRecord, getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';
import { getStoredLeaves, getStoredLeaveConfig, getStoredEmployeeAllowances } from '../../services/leave/leaveStorage';
import { calculateLeaveBalance } from '../../services/leave/leaveService';
import { getStoredTasks } from '../../services/planner/taskStorage';
import { getStoredExpenseRecords } from '../../services/expenses/expenseStorage';
import { getSavedWeightages, DEFAULT_WEIGHTAGES } from '../../services/efficiency/efficiencyService';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { isSalaryLateCheckIn } from '../../services/salary/salaryService';
import { TaskRecord } from '../../types/planner';
import { ExpenseRecord } from '../../types/expense';
import { EfficiencyWeightages } from '../../types/efficiency';
import { Activity } from 'lucide-react';
import { MyDayTimeline } from '../../components/timeline/MyDayTimeline';
import { PerformanceSnapshot } from './PerformanceSnapshot';

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
}

const getWorkingDuration = (checkInStr?: string, checkOutStr?: string): string => {
  if (!checkInStr || checkInStr === '--:--') return '0h 0m';
  
  const parseTime = (timeStr: string): Date | null => {
    try {
      const now = new Date();
      const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (!match) return null;
      let h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const ampm = match[3];
      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      }
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      return d;
    } catch {
      return null;
    }
  };

  const startTime = parseTime(checkInStr);
  if (!startTime) return '0h 0m';

  const endTime = checkOutStr && checkOutStr !== '--:--' ? parseTime(checkOutStr) : new Date();
  if (!endTime) return '0h 0m';

  let diffMs = endTime.getTime() - startTime.getTime();
  if (diffMs < 0) diffMs = 0;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
};

const formatLeaveRange = (startDateStr: string, endDateStr: string): string => {
  try {
    if (!startDateStr) return 'Upcoming Leave';
    const start = new Date(startDateStr);
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!endDateStr || startDateStr === endDateStr) return startFormatted;
    const end = new Date(endDateStr);
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startFormatted} - ${endFormatted}`;
  } catch {
    return `${startDateStr} to ${endDateStr}`;
  }
};

const CardSkeleton = () => (
  <div className="bg-[#211044]/80 p-4 rounded-2xl border border-purple-500/20 animate-pulse space-y-2">
    <div className="h-3 w-1/3 bg-purple-500/20 rounded" />
    <div className="h-6 w-2/3 bg-purple-500/30 rounded" />
    <div className="h-3 w-1/2 bg-purple-500/20 rounded" />
  </div>
);

const CardError: React.FC<{ title: string; onRetry?: () => void }> = ({ title, onRetry }) => (
  <div className="bg-[#211044]/80 p-4 rounded-2xl border border-rose-500/30 flex items-center justify-between text-xs text-rose-200">
    <div className="flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
      <span>{title}: Unable to load</span>
    </div>
    {onRetry && (
      <button 
        onClick={onRetry}
        className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-lg font-bold text-[11px] text-rose-300 transition flex items-center gap-1"
      >
        <RotateCcw className="w-3 h-3" /> Retry
      </button>
    )}
  </div>
);

const getKolkataDateFromIso = (isoStr?: string | null): string => {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) {
    return isoStr;
  }
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
};

export const EmployeeDashboard: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const { notifications, unreadNotificationCount, tasks: syncTasks, leaves: syncLeaves, attendance: syncAttendance, expenses: syncExpenses } = useRealtimeSync();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaveBalance, setLeaveBalance] = useState({ available: 24, pending: 0, used: 0 });
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(null);
  const [showUnavailableMessage, setShowUnavailableMessage] = useState(false);

  // Section Loading & Error states
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  // Personal Work Pulse States
  const [activeView, setActiveView] = useState<'dashboard' | 'workpulse'>('dashboard');
  const [todayStr, setTodayStr] = useState<string>(getFormattedDateStr());

  // Periodically verify if the IST date has changed (midnight rollover)
  const todayStrRef = useRef<string>(todayStr);
  useEffect(() => {
    todayStrRef.current = todayStr;
  }, [todayStr]);

  useEffect(() => {
    const checkDateRollover = () => {
      const nowStr = getFormattedDateStr();
      if (nowStr !== todayStrRef.current) {
        console.log('IST date changed from', todayStrRef.current, 'to', nowStr);
        todayStrRef.current = nowStr;
        setTodayStr(nowStr);
      }
    };

    const interval = setInterval(checkDateRollover, 60000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDateRollover();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => {
    if (syncAttendance && syncAttendance.length > 0) return syncAttendance;
    return getStoredAttendanceRecords();
  });
  const [tasks, setTasks] = useState<TaskRecord[]>(() => {
    if (syncTasks && syncTasks.length > 0) return syncTasks;
    return getStoredTasks();
  });
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => {
    if (syncExpenses && syncExpenses.length > 0) return syncExpenses as ExpenseRecord[];
    return getStoredExpenseRecords();
  });
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [allLeaves, setAllLeaves] = useState<any[]>(() => {
    if (syncLeaves && syncLeaves.length > 0) return syncLeaves;
    return getStoredLeaves();
  });

  // Initialize data from local storage and keep in sync with RealtimeSyncContext
  useEffect(() => {
    logStartupTag('DASHBOARD_READY', 'Employee Dashboard fully mounted');
  }, []);

  useEffect(() => {
    if (syncAttendance && syncAttendance.length > 0) {
      setAttendanceRecords(prev => {
        if (prev === syncAttendance) return prev;
        if (prev.length === syncAttendance.length && prev[0]?.id === syncAttendance[0]?.id && prev[0]?.updatedAt === syncAttendance[0]?.updatedAt && prev[0]?.checkInTime === syncAttendance[0]?.checkInTime && prev[0]?.checkOutTime === syncAttendance[0]?.checkOutTime) {
          return prev;
        }
        return syncAttendance;
      });
    } else {
      const stored = getStoredAttendanceRecords();
      setAttendanceRecords(prev => {
        if (prev.length > 0 && stored.length === 0) return prev;
        if (prev === stored) return prev;
        if (prev.length === stored.length && prev[0]?.id === stored[0]?.id && prev[0]?.updatedAt === stored[0]?.updatedAt && prev[0]?.checkInTime === stored[0]?.checkInTime && prev[0]?.checkOutTime === stored[0]?.checkOutTime) {
          return prev;
        }
        return stored;
      });
    }
  }, [syncAttendance]);

  useEffect(() => {
    if (syncTasks && syncTasks.length > 0) {
      setTasks(prev => {
        if (prev === syncTasks) return prev;
        if (prev.length === syncTasks.length && prev[0]?.id === syncTasks[0]?.id && prev[0]?.status === syncTasks[0]?.status) {
          return prev;
        }
        return syncTasks;
      });
    } else {
      const stored = getStoredTasks();
      setTasks(prev => {
        if (prev.length > 0 && stored.length === 0) return prev;
        if (prev === stored) return prev;
        if (prev.length === stored.length && prev[0]?.id === stored[0]?.id && prev[0]?.status === stored[0]?.status) {
          return prev;
        }
        return stored;
      });
    }
  }, [syncTasks]);

  useEffect(() => {
    if (syncExpenses && syncExpenses.length > 0) {
      const syncExp = syncExpenses as ExpenseRecord[];
      setExpenses(prev => {
        if (prev === syncExp) return prev;
        if (prev.length === syncExp.length && prev[0]?.id === syncExp[0]?.id && prev[0]?.status === syncExp[0]?.status) {
          return prev;
        }
        return syncExp;
      });
    } else {
      const stored = getStoredExpenseRecords();
      setExpenses(prev => {
        if (prev.length > 0 && stored.length === 0) return prev;
        if (prev === stored) return prev;
        if (prev.length === stored.length && prev[0]?.id === stored[0]?.id && prev[0]?.status === stored[0]?.status) {
          return prev;
        }
        return stored;
      });
    }
  }, [syncExpenses]);

  useEffect(() => {
    if (syncLeaves && syncLeaves.length > 0) {
      setAllLeaves(prev => {
        if (prev === syncLeaves) return prev;
        if (prev.length === syncLeaves.length && prev[0]?.id === syncLeaves[0]?.id && prev[0]?.status === syncLeaves[0]?.status) {
          return prev;
        }
        return syncLeaves;
      });
    } else {
      const stored = getStoredLeaves();
      setAllLeaves(prev => {
        if (prev.length > 0 && stored.length === 0) return prev;
        if (prev === stored) return prev;
        if (prev.length === stored.length && prev[0]?.id === stored[0]?.id && prev[0]?.status === stored[0]?.status) {
          return prev;
        }
        return stored;
      });
    }
  }, [syncLeaves]);

  // Recalculate leave balance whenever allLeaves changes
  useEffect(() => {
    if (!employeeData) return;
    const empId = employeeData.id || employeeData.employeeCode || '';
    const dept = employeeData.office || 'Raniganj';
    const localConfig = getStoredLeaveConfig();
    const localAllowances = getStoredEmployeeAllowances();
    const bal = calculateLeaveBalance(empId, dept, allLeaves, localConfig, localAllowances);
    setLeaveBalance({
      available: bal.available,
      pending: bal.pending,
      used: bal.used,
    });
  }, [allLeaves, employeeData]);

  // Fetch weightages
  useEffect(() => {
    getSavedWeightages().then(weights => {
      setWeightages(weights);
    }).catch(err => {
      console.warn("Error fetching weightages:", err);
    });
  }, []);

  useEffect(() => {
    if (!db || !employeeData?.employeeCode) return;
    
    const q = query(
      collection(db, 'salaries'),
      where('employeeCode', '==', employeeData.employeeCode),
      limit(1)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setHasPayslips(!snap.empty);
    }, (err) => {
      console.error("Error checking payslips availability:", err);
      setHasPayslips(false);
    });
    
    return () => unsub();
  }, [employeeData?.employeeCode]);

  useEffect(() => {
    if (employeeData) {
      const empId = employeeData.id || employeeData.employeeCode || '';
      const dept = employeeData.office || 'Raniganj';
      const localLeaves = getStoredLeaves();
      const localConfig = getStoredLeaveConfig();
      const localAllowances = getStoredEmployeeAllowances();
      const bal = calculateLeaveBalance(empId, dept, localLeaves, localConfig, localAllowances);
      setLeaveBalance({
        available: bal.available,
        pending: bal.pending,
        used: bal.used,
      });
    }
  }, [employeeData?.id, employeeData?.employeeCode, employeeData?.office]);

  useEffect(() => {
    if (employeeData) {
      const empId = employeeData.employeeCode || employeeData.id || 'EMP-UNKNOWN';
      const todayStr = getFormattedDateStr();
      const rec = getTodayAttendanceRecord(empId, todayStr);
      setTodayAttendance(rec);
    }
  }, [employeeData?.employeeCode, employeeData?.id]);

  useEffect(() => {
    if (!employeeData?.employeeCode) {
      setNotificationsLoading(false);
      return;
    }
    setNotificationsLoading(true);
    setNotificationsError(null);

    if (!db) {
      setNotificationsLoading(false);
      return;
    }

    // Fetch announcements
    const announcementsQ = query(
      collection(db, 'announcements'),
      orderBy('date', 'desc'),
      limit(10)
    );
    const unsubAnnouncements = onSnapshot(announcementsQ, (snapshot) => {
      const allAnnouncements = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Filter targeted announcements
      const filtered = allAnnouncements.filter((ann) => {
        if (!employeeData || employeeData.status !== 'Approved') return false;
        if (employeeData.role === 'SUPER_ADMIN' || employeeData.role === 'ADMIN') return false;

        if (!ann.targetType || ann.targetType === 'ALL') {
          return true;
        }

        if (ann.targetType === 'DEPARTMENT') {
          const userDept = (employeeData.department || '').toLowerCase();
          const userOffice = (employeeData.office || '').toLowerCase();
          const targetVal = String(ann.targetValue).toLowerCase();
          return userDept === targetVal || userOffice === targetVal;
        }

        if (ann.targetType === 'DESIGNATION') {
          const userDesig = (employeeData.designation || '').toLowerCase();
          const targetVal = String(ann.targetValue).toLowerCase();
          return userDesig === targetVal;
        }

        if (ann.targetType === 'SELECTED') {
          const selectedCodes = Array.isArray(ann.targetValue) ? ann.targetValue : [];
          return selectedCodes.includes(employeeData.employeeCode);
        }

        return true;
      });

      setAnnouncements(filtered.slice(0, 3));
    }, (error) => {
      console.error('Error fetching announcements:', error);
    });

    return () => {
      unsubAnnouncements();
    };
  }, [employeeData?.employeeCode, employeeData?.department, employeeData?.office, employeeData?.designation, employeeData?.status, employeeData?.role]);

  if (!employeeData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center text-white">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
          <UserCheck className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-red-400 mb-2">Employee profile not found</h2>
        <p className="text-sm text-purple-200">We couldn't load your employee data. Please contact administrator.</p>
      </div>
    );
  }

  const todayDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  const quickActions = [
    { 
      icon: Calendar, 
      label: 'Apply Leave', 
      onClick: () => navigate('/leave'), 
      bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
    },
    { 
      icon: Wallet, 
      label: 'Expenses', 
      onClick: () => navigate('/expenses'), 
      bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
    },
    { 
      icon: FileText, 
      label: 'Payslip', 
      onClick: () => {
        if (hasPayslips === false) {
          setShowUnavailableMessage(true);
          setTimeout(() => setShowUnavailableMessage(false), 4500);
        } else {
          navigate('/payslip');
        }
      }, 
      bg: hasPayslips === false 
        ? 'bg-rose-500/10 text-rose-300/40 border-rose-500/10 opacity-50 cursor-not-allowed' 
        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
    },
    { 
      icon: MessageSquare, 
      label: 'Chat', 
      onClick: () => navigate('/chat'), 
      bg: 'bg-pink-500/20 text-pink-300 border-pink-500/30' 
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : null,
      onClick: () => navigate('/notifications'), 
      bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
    },
    { 
      icon: HelpCircle, 
      label: 'FAQ & Help', 
      onClick: () => navigate('/faq'), 
      bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' 
    },
    { 
      icon: User, 
      label: 'Profile', 
      onClick: () => navigate('/profile'), 
      bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
    },
    { 
      icon: Activity, 
      label: 'Work Pulse', 
      onClick: () => setActiveView('workpulse'), 
      bg: 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30' 
    },
    { 
      icon: Clock, 
      label: 'Work Hours', 
      onClick: () => navigate('/work-hours'), 
      bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
    },
  ];

  // -------------------------------------------------------------------------
  // SMART DAILY BRIEFING CALCULATIONS (FEATURE 5)
  // -------------------------------------------------------------------------
  const currentHour = new Date().getHours();
  const greetingPrefix = currentHour < 12 ? 'GOOD MORNING!' : currentHour < 17 ? 'GOOD AFTERNOON!' : 'GOOD EVENING!';

  // Today's attendance status & details
  const todayAttendanceRec = attendanceRecords.find(r => r.date === todayStr) || todayAttendance;

  const hasApprovedLeaveToday = allLeaves.some(l => 
    l.status === 'APPROVED' && 
    todayStr >= l.startDate && 
    todayStr <= l.endDate
  );

  let attendanceStatusLabel = 'Not Checked In';
  let attendanceBadgeColor = 'bg-[#211044] text-purple-200 border-purple-500/20';

  if (todayAttendanceRec) {
    if (todayAttendanceRec.attendanceType === 'WFH') {
      attendanceStatusLabel = 'WFH';
      attendanceBadgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    } else if (todayAttendanceRec.attendanceType === 'CLIENT_VISIT') {
      attendanceStatusLabel = 'Client Visit';
      attendanceBadgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    } else if (todayAttendanceRec.attendanceType === 'OUTDOOR') {
      attendanceStatusLabel = 'Outdoor Work';
      attendanceBadgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    } else if (todayAttendanceRec.checkOutTime && todayAttendanceRec.checkOutTime !== '--:--') {
      attendanceStatusLabel = 'Checked Out';
      attendanceBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    } else {
      attendanceStatusLabel = 'Checked In';
      attendanceBadgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  } else if (hasApprovedLeaveToday) {
    attendanceStatusLabel = 'On Leave';
    attendanceBadgeColor = 'bg-pink-500/20 text-pink-300 border-pink-500/30';
  }

  // Working Time duration
  const checkInTimeStr = todayAttendanceRec?.checkInTime;
  const checkOutTimeStr = todayAttendanceRec?.checkOutTime;
  const workingDurationStr = checkInTimeStr && checkInTimeStr !== '--:--'
    ? getWorkingDuration(checkInTimeStr, checkOutTimeStr)
    : (attendanceStatusLabel === 'WFH' || attendanceStatusLabel === 'Client Visit' ? 'Active Shift' : '0h 0m');

  // Tasks Filtered for CURRENT Employee ONLY
  const employeeId = employeeData.id || employeeData.employeeCode || '';
  const employeeCode = employeeData.employeeCode || '';

  const myTasks = tasks.filter(t => 
    (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(employeeCode)) ||
    (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(employeeId))
  );

  // Strict date isolation for today's tasks status & work progress
  const todayTasks = myTasks.filter(t => {
    const isCompleted = t.status === 'COMPLETED';
    if (isCompleted) {
      const completionDate = getKolkataDateFromIso(t.completedAt || t.lastModifiedAt);
      return completionDate === todayStr;
    } else {
      const dueKolkata = getKolkataDateFromIso(t.dueDate);
      return dueKolkata === todayStr;
    }
  });

  const assignedTaskCount = todayTasks.length;
  const completedTaskCount = todayTasks.filter(t => t.status === 'COMPLETED').length;
  const taskProgressPercentage = assignedTaskCount > 0 
    ? Math.round((completedTaskCount / assignedTaskCount) * 100) 
    : 0;

  // Next Task Selection
  const incompleteTasks = myTasks.filter(t => t.status !== 'COMPLETED');
  let nextTask: TaskRecord | null = null;

  if (incompleteTasks.length > 0) {
    const sortedIncomplete = [...incompleteTasks].sort((a, b) => {
      const dateA = a.dueDate || '9999-99-99';
      const dateB = b.dueDate || '9999-99-99';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const priorityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const pA = priorityWeight[a.priority || 'MEDIUM'] || 2;
      const pB = priorityWeight[b.priority || 'MEDIUM'] || 2;
      if (pB !== pA) return pB - pA;
      return (a.createdAtDeviceTime || '').localeCompare(b.createdAtDeviceTime || '');
    });
    nextTask = sortedIncomplete[0];
  }

  // Upcoming Leave Selection
  const upcomingLeaves = allLeaves
    .filter(l => l.status === 'APPROVED' && (l.endDate >= todayStr))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const nextUpcomingLeave = upcomingLeaves.length > 0 ? upcomingLeaves[0] : null;

  // Check for past unresolved attendance records requiring mandatory action
  const unresolvedAttendance = useMemo(() => {
    if (!employeeData) return null;
    const empId = employeeData.employeeCode || employeeData.id;
    const pastRecords = attendanceRecords
      .filter((r) => {
        const rEmp = r.employeeId || r.employeeCode;
        if (rEmp !== empId) return false;
        if (r.date >= todayStr) return false;
        if (r.checkoutStatus === 'UNRESOLVED' || r.checkoutStatus === 'PENDING_ADMIN_REVIEW') return true;
        const hasCheckout = !!(r.checkOutTime && r.checkOutTime !== '--:--');
        const isRectified = !!(r.manualRectified || r.isAdminRectified || r.correctedAt);
        return !hasCheckout && !isRectified && r.checkoutStatus !== 'COMPLETED';
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return pastRecords.length > 0 ? pastRecords[0] : null;
  }, [attendanceRecords, employeeData, todayStr]);

  // -------------------------------------------------------------------------
  // WORK PULSE CALCULATIONS
  // -------------------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const monthName = now.toLocaleString('default', { month: 'long' });

  let todayStatus: 'Present' | 'WFH' | 'Client Visit' | 'Outdoor Work' | 'Leave' | 'Not Checked In' | 'Absent' = 'Not Checked In';
  let todayMode: string = 'N/A';
  let todayCheckIn = todayAttendance?.checkInTime || '--:--';
  let todayCheckOut = todayAttendance?.checkOutTime || '--:--';
  let isCorrected = !!(todayAttendance?.correctionHistory && todayAttendance.correctionHistory.length > 0) || !!todayAttendance?.manualRectified;

  if (todayAttendance) {
    if (todayAttendance.attendanceType === 'WFH') {
      todayStatus = 'WFH';
      todayMode = 'WFH';
    } else if (todayAttendance.attendanceType === 'CLIENT_VISIT') {
      todayStatus = 'Client Visit';
      todayMode = 'Client Visit';
    } else if (todayAttendance.attendanceType === 'OUTDOOR') {
      todayStatus = 'Outdoor Work';
      todayMode = 'Outdoor Work';
    } else {
      todayStatus = 'Present';
      todayMode = 'Office';
    }
  } else if (hasApprovedLeaveToday) {
    todayStatus = 'Leave';
    todayMode = 'Leave';
  } else {
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isPastShiftEnd = currentHour > 18 || (currentHour === 18 && currentMinute > 0);
    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (isPastShiftEnd && !isWeekend) {
      todayStatus = 'Absent';
    } else {
      todayStatus = 'Not Checked In';
    }
  }

  // Monthly Attendance Metrics
  const currentMonthRecords = attendanceRecords.filter(r => r.date.startsWith(currentMonthStr));
  const presentRecords = currentMonthRecords.filter(r => ['OFFICE', 'WFH', 'CLIENT_VISIT', 'OUTDOOR'].includes(r.attendanceType || 'OFFICE'));
  const presentDaysCount = presentRecords.length;

  const lateDaysCount = currentMonthRecords.filter(r => r.checkInTime && isSalaryLateCheckIn(r.checkInTime)).length;
  const wfhDaysCount = currentMonthRecords.filter(r => r.attendanceType === 'WFH').length;
  const clientVisitDaysCount = currentMonthRecords.filter(r => r.attendanceType === 'CLIENT_VISIT').length;
  const outdoorDaysCount = currentMonthRecords.filter(r => r.attendanceType === 'OUTDOOR').length;

  let expectedWorkingDays = 0;
  let actualAbsentDays = 0;

  for (let d = 1; d <= now.getDate(); d++) {
    const dateObj = new Date(currentYear, currentMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      expectedWorkingDays++;
      
      const hasAtt = currentMonthRecords.some(r => r.date === dateStr);
      if (!hasAtt) {
        const hasLeave = allLeaves.some(l => 
          l.status === 'APPROVED' && 
          dateStr >= l.startDate && 
          dateStr <= l.endDate
        );
        if (!hasLeave) {
          actualAbsentDays++;
        }
      }
    }
  }

  const attendancePercentage = expectedWorkingDays > 0 
    ? Math.min(100, Math.max(0, Math.round((presentDaysCount / expectedWorkingDays) * 100)))
    : 100;

  const currentMonthTasks = myTasks.filter(t => {
    const taskDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime.substring(0, 10));
    return taskDate.startsWith(currentMonthStr);
  });
  
  const assignedTasksCount = currentMonthTasks.length;
  const completedTasksCount = currentMonthTasks.filter(t => t.status === 'COMPLETED').length;

  const currentMonthExpenses = expenses.filter(e => e.date && e.date.startsWith(currentMonthStr));
  const totalApprovedAmount = currentMonthExpenses.filter(e => e.status === 'APPROVED').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalPendingAmount = currentMonthExpenses.filter(e => e.status === 'PENDING').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalExpenseAmount = totalApprovedAmount + totalPendingAmount;

  const startDateStr = `${currentMonthStr}-01`;
  const endDateStr = `${currentMonthStr}-${String(new Date(currentYear, currentMonth + 1, 0).getDate()).padStart(2, '0')}`;
  
  const efficiencyResult = calculateEfficiency(
    employeeId,
    employeeCode,
    employeeData.name || 'Employee',
    employeeData.department || employeeData.office || 'Operations',
    employeeData.teamLeaderId || null,
    startDateStr,
    endDateStr,
    tasks,
    attendanceRecords,
    weightages
  );

  return (
    <>
      <div className="flex flex-col gap-5 pb-8 text-white">
        {/* Top Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#211044] border-2 border-[#7C3AED]/60 flex-shrink-0 shadow-lg ring-2 ring-purple-500/20">
              {employeeData.selfieUrl ? (
                <img src={employeeData.selfieUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="w-6 h-6 m-auto mt-3 text-purple-300" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-tight">
                {employeeData.name || 'Employee'}
              </h1>
              <p className="text-xs text-purple-300/80 font-medium mt-0.5">
                Code: <span className="text-purple-200 font-bold">{employeeData.employeeCode || 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-gradient-to-r from-[#2B1754] to-[#201042] border border-purple-500/35 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-200 shadow-md">
            <MapPin className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
            <span className="truncate max-w-[130px]">{employeeData.officeLocation || employeeData.workLocation || 'Raniganj HQ'}</span>
          </div>
        </div>

        {/* Greeting Banner */}
        <div className="text-left py-0.5">
          <h2 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#C4B5FD] via-[#A78BFA] to-[#818CF8] tracking-tight uppercase">
            {greetingPrefix}
          </h2>
        </div>

        {/* UNRESOLVED ATTENDANCE ACTION CARD */}
        {unresolvedAttendance && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-lg animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center flex-shrink-0 border border-amber-500/30">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Attendance Requires Action</h4>
                <p className="text-xs text-amber-200/90 mt-0.5">
                  Your checkout for <strong>{unresolvedAttendance.date}</strong> is {unresolvedAttendance.checkoutStatus === 'PENDING_ADMIN_REVIEW' ? 'awaiting Admin review' : 'unresolved'}.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/attendance')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-black rounded-xl transition-all flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto shadow-md"
            >
              <span>{unresolvedAttendance.checkoutStatus === 'PENDING_ADMIN_REVIEW' ? 'View Status' : 'Resolve Checkout'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TODAY OVERVIEW CARD */}
        <Card className="p-4 sm:p-5 bg-gradient-to-br from-[#1C1236] via-[#160A2D] to-[#120724] border-2 border-indigo-500/40 shadow-[0_8px_30px_rgba(99,102,241,0.15)] rounded-2xl relative overflow-hidden transition-all">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="border-b border-indigo-500/20 pb-3 mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-indigo-200 uppercase tracking-widest">
                TODAY OVERVIEW
              </h3>
            </div>
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#120722] border border-indigo-500/30 text-indigo-200 uppercase tracking-wider font-mono shadow-inner">
              {todayDate}
            </span>
          </div>

          {/* 2-Column Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs font-bold">
            {/* ATTENDANCE MINI-CARD */}
            <div className={`p-3 rounded-xl border-2 flex flex-col justify-between transition-all ${
              attendanceStatusLabel === 'Checked In' || attendanceStatusLabel === 'WFH' || attendanceStatusLabel === 'Client Visit' || attendanceStatusLabel === 'Outdoor Work'
                ? 'bg-gradient-to-br from-[#0D2E2B]/90 to-[#0A1E1E]/90 border-emerald-500/50 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : attendanceStatusLabel === 'Absent'
                ? 'bg-gradient-to-br from-[#2F121C]/90 to-[#1F0A12]/90 border-rose-500/50 text-rose-100 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                : 'bg-gradient-to-br from-[#12282C]/90 to-[#0C1B1E]/90 border-teal-500/40 text-teal-100 shadow-sm'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-teal-300/80">
                  ATTENDANCE
                </span>
                <UserCheck className="w-4 h-4 text-teal-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight truncate">
                  {attendanceStatusLabel}
                </p>
                <p className="text-[10px] font-medium text-teal-200/70 mt-0.5 truncate">
                  {checkInTimeStr && checkInTimeStr !== '--:--' ? `In at ${checkInTimeStr}` : 'Shift active'}
                </p>
              </div>
            </div>

            {/* WORKING TIME MINI-CARD */}
            <div className="p-3 rounded-xl border-2 border-amber-500/40 bg-gradient-to-br from-[#2A1D0C]/90 to-[#1C1205]/90 text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.12)] flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-amber-300/80">
                  WORKING TIME
                </span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-amber-300">
                  {workingDurationStr}
                </p>
                <p className="text-[10px] font-medium text-amber-200/70 mt-0.5">
                  Logged duration
                </p>
              </div>
            </div>

            {/* TASKS MINI-CARD */}
            <div className="p-3 rounded-xl border-2 border-cyan-500/40 bg-gradient-to-br from-[#0C2236]/90 to-[#081524]/90 text-cyan-100 shadow-[0_0_15px_rgba(6,182,212,0.12)] flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-cyan-300/80">
                  TASKS
                </span>
                <CheckSquare className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-cyan-200">
                  {completedTaskCount} / {assignedTaskCount} completed
                </p>
                <p className="text-[10px] font-medium text-cyan-300/70 mt-0.5">
                  {assignedTaskCount - completedTaskCount > 0 ? `${assignedTaskCount - completedTaskCount} remaining` : 'All tasks completed'}
                </p>
              </div>
            </div>

            {/* WORK PROGRESS MINI-CARD */}
            <div className="p-3 rounded-xl border-2 border-emerald-500/40 bg-gradient-to-br from-[#0B281D]/90 to-[#071B13]/90 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.12)] flex flex-col justify-between transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-300/80">
                  WORK PROGRESS
                </span>
                <BarChart3 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-emerald-300">
                  {taskProgressPercentage}%
                </p>
                <p className="text-[10px] font-medium text-emerald-200/70 mt-0.5">
                  Completion rate
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* ACTION REQUIRED */}
        {(() => {
          const dueTodayTasks = myTasks.filter(t => t.status !== 'COMPLETED' && t.dueDate === todayStr);
          const importantAlertsCount = dueTodayTasks.length;

          if (importantAlertsCount === 0) {
            return (
              <Card className="p-4 bg-gradient-to-r from-[#0B2A1A]/95 via-[#072215]/95 to-[#05180E]/95 border-2 border-emerald-500/40 shadow-[0_4px_20px_rgba(16,185,129,0.15)] rounded-2xl flex items-center justify-between transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-emerald-300 flex items-center gap-1.5">
                      <span>✓ All caught up</span>
                    </h4>
                    <p className="text-[11px] text-emerald-200/80 font-medium mt-0.5">
                      No action required right now.
                    </p>
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card className="p-4 sm:p-5 bg-gradient-to-br from-[#2E1B07]/95 via-[#201204]/95 to-[#160B02]/95 border-2 border-amber-500/50 shadow-[0_6px_25px_rgba(245,158,11,0.18)] rounded-2xl transition-all">
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black text-amber-300 uppercase tracking-widest">
                    ⚠️ ACTION REQUIRED
                  </h3>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {dueTodayTasks.length} {dueTodayTasks.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              
              <div className="space-y-2">
                {dueTodayTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 bg-[#1F1004]/70 p-3 rounded-xl border border-amber-500/25 text-xs">
                    <div className="truncate min-w-0 flex-1">
                      <p className="text-amber-200 font-extrabold truncate">{task.title}</p>
                      <p className="text-[10px] text-amber-300/70 font-medium mt-0.5">Due today • High Priority</p>
                    </div>
                    <button 
                      onClick={() => navigate('/planner')} 
                      className="text-[11px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:brightness-110 active:scale-95 px-3.5 py-1.5 rounded-xl transition shadow-md flex-shrink-0 flex items-center gap-1"
                    >
                      <span>Start</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* TODAY'S WORK CARD */}
        <Card className="p-4 sm:p-5 bg-gradient-to-br from-[#0B2A1E]/95 via-[#071F16]/95 to-[#05150E]/95 border-2 border-emerald-500/40 shadow-[0_8px_30px_rgba(16,185,129,0.15)] rounded-2xl relative overflow-hidden transition-all">
          <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="border-b border-emerald-500/20 pb-3 mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-emerald-200 uppercase tracking-widest">
                📈 TODAY'S WORK
              </h3>
            </div>
            <span className="text-emerald-300 font-mono text-sm font-black bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
              {taskProgressPercentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-[#05150E] h-3 rounded-full overflow-hidden border border-emerald-500/20 mb-4 p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
              style={{ width: `${taskProgressPercentage}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-emerald-200/90 mb-2">
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/15">
              <span className="text-emerald-300/70 text-[10px] uppercase font-bold block mb-0.5">Tasks Assigned</span>
              <span className="text-white font-black text-sm">{assignedTaskCount} Total Tasks</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/15">
              <span className="text-emerald-300/70 text-[10px] uppercase font-bold block mb-0.5">Tasks Completed</span>
              <span className="text-emerald-300 font-black text-sm">{completedTaskCount} Completed</span>
            </div>
          </div>

          {/* Next Task Focus if incomplete tasks exist */}
          {nextTask && (
            <div className="mt-2 p-3 rounded-xl bg-[#071912]/90 border border-emerald-500/25 flex items-center justify-between text-xs">
              <div className="truncate min-w-0 pr-2">
                <span className="text-[10px] uppercase font-extrabold text-emerald-400 tracking-wider block">Next Priority Task</span>
                <p className="text-white font-bold truncate mt-0.5">{nextTask.title}</p>
              </div>
              <button
                onClick={() => navigate('/planner')}
                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-[10px] font-extrabold shrink-0 transition"
              >
                View
              </button>
            </div>
          )}
        </Card>

        {/* MY DAY TIMELINE (FEATURE 6) */}
        <div className="bg-gradient-to-br from-[#1E113C] to-[#140A2D] border-2 border-purple-500/30 rounded-2xl overflow-hidden shadow-xl transition-all">
          <div 
            onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-purple-500/10 transition select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">TODAY'S TIMELINE</h3>
                <p className="text-[10px] text-purple-300/80 font-semibold mt-0.5">
                  {isTimelineExpanded ? 'Interactive hourly agenda and activity log' : 'Click to expand agenda tracker'}
                </p>
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-[#120722] border border-purple-500/30 flex items-center justify-center text-[#A78BFA]">
              <span className={`transform transition-transform duration-200 ${isTimelineExpanded ? 'rotate-90' : ''}`}>
                &rarr;
              </span>
            </div>
          </div>
          {isTimelineExpanded && (
            <div className="border-t border-purple-500/20 p-4 bg-[#120722]/60">
              <MyDayTimeline />
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div>
          {showUnavailableMessage && (
            <div className="bg-rose-950/80 border-2 border-rose-500/40 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-rose-200 mb-4 shadow-xl">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-white">Payslip Not Available Yet</p>
                <p className="text-purple-200/80 mt-1">Your salary record has not been generated by the administrator for any month yet.</p>
              </div>
            </div>
          )}
          <h2 className="text-xs font-black text-purple-300/80 uppercase tracking-widest mb-3">
            QUICK ACTIONS
          </h2>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {quickActions.map((action, idx) => (
              <button 
                key={idx}
                onClick={action.onClick}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-[#1C1036] to-[#140A2A] border border-purple-500/25 hover:border-purple-500/50 transition-all hover:scale-105 active:scale-95 shadow-lg group relative"
              >
                {action.badge && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-md animate-pulse">
                    {action.badge}
                  </span>
                )}
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-2 border ${action.bg}`}>
                  <action.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
                <span className="text-[10.5px] sm:text-[11.5px] font-extrabold text-purple-100 text-center leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <h2 className="text-xs font-black text-purple-300/80 uppercase tracking-widest flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-[#A78BFA]" />
              ANNOUNCEMENTS
            </h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {announcements.length > 0 ? (
              announcements.map((ann) => (
                <Card key={ann.id} className="p-3.5 bg-gradient-to-br from-[#1C1036] to-[#140A2A] border border-purple-500/25 shadow-lg">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-xs text-white">{ann.title}</h3>
                    <span className="text-[10px] font-semibold text-purple-300 bg-[#120722] px-2 py-0.5 rounded-full border border-purple-500/20">
                      {new Date(ann.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-purple-200/90 leading-relaxed line-clamp-2">
                    {ann.content}
                  </p>
                </Card>
              ))
            ) : (
              <div className="text-center py-5 text-purple-300/70 bg-[#140A2A] rounded-2xl border border-dashed border-purple-500/20">
                <p className="text-xs font-semibold">No recent announcements</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeView === 'workpulse' && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-50 bg-[#170B38] overflow-y-auto"
          >
            <div className="container mx-auto p-4 max-w-3xl">
              <div className="flex flex-col gap-5 pb-8 text-white min-h-screen">
                {/* Work Pulse Header */}
                <div className="flex flex-col gap-4 pt-2">
                  <button 
                    onClick={() => setActiveView('dashboard')} 
                    className="self-start p-2 px-3 bg-[#2D1B5A] border border-purple-500/30 rounded-xl hover:bg-[#3B2677] transition font-bold text-xs flex items-center gap-1.5 shadow-md text-white"
                  >
                    &larr; Back
                  </button>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-pink-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5" /> WORK PULSE
                      </p>
                      <h1 className="text-2xl font-black text-white leading-tight">
                        Your Work Pulse Snapshot
                      </h1>
                      <p className="text-xs text-purple-300 mt-1">Here's your personal work snapshot 👋</p>
                    </div>
                    <div className="bg-[#2D1B5A] border border-purple-500/20 px-3 py-1.5 rounded-full text-[10px] font-bold text-purple-200 mt-1">
                      {monthName} {currentYear}
                    </div>
                  </div>
                </div>

                {/* 1. Today's Attendance Status Card */}
                <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-xl pointer-events-none" />
                  <div className="flex justify-between items-center mb-4 border-b border-purple-500/15 pb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Today's Attendance Status</span>
                    <div className="flex items-center gap-1.5">
                      {isCorrected && (
                        <span className="text-[10px] font-extrabold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          Corrected
                        </span>
                      )}
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider
                        ${todayStatus === 'Present' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                          todayStatus === 'WFH' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                          todayStatus === 'Client Visit' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' :
                          todayStatus === 'Outdoor Work' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                          todayStatus === 'Leave' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                          todayStatus === 'Absent' ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
                          'bg-gray-500/15 text-gray-400 border border-gray-500/30'}`}
                      >
                        {todayStatus}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
                      <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Check-In</p>
                      <p className="font-extrabold text-sm text-white">{todayCheckIn}</p>
                    </div>
                    <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
                      <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Check-Out</p>
                      <p className="font-extrabold text-sm text-white">{todayCheckOut}</p>
                    </div>
                    <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10">
                      <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Mode</p>
                      <p className="font-extrabold text-sm text-white">{todayMode}</p>
                    </div>
                  </div>
                </Card>

                {/* 2. Monthly Attendance Summary Card */}
                <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
                  <div className="flex justify-between items-center mb-4 border-b border-purple-500/15 pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Monthly Attendance Summary</span>
                    <span className="text-[10px] text-purple-300/60 font-semibold">{monthName} Tracker</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="flex items-center gap-4 bg-[#211044] p-3 rounded-xl border border-purple-500/10">
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-purple-950"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-pink-500"
                            strokeDasharray={`${attendancePercentage}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-black text-white">{attendancePercentage}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-black text-white">Attendance Rate</p>
                        <p className="text-[10px] text-purple-300/80 mt-1">Logged <span className="text-white font-bold">{presentDaysCount}</span> out of <span className="text-white font-bold">{expectedWorkingDays}</span> expected working days</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center">
                        <p className="text-[9px] text-amber-300 font-bold mb-0.5">Late Days</p>
                        <p className="text-base font-black text-amber-400">{lateDaysCount}</p>
                      </div>
                      <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center">
                        <p className="text-[9px] text-rose-300 font-bold mb-0.5">Absent Days</p>
                        <p className="text-base font-black text-rose-400">{actualAbsentDays}</p>
                      </div>
                      <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center">
                        <p className="text-[9px] text-purple-300 font-bold mb-0.5">Present Days</p>
                        <p className="text-base font-black text-white">{presentDaysCount}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 3. Detailed Pulse Snapshot Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3.5 border-b border-purple-500/15 pb-2">
                      Leave & WFH Limits
                    </span>
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-purple-200">Work From Home (WFH)</span>
                          <span className={wfhDaysCount >= 2 ? 'text-rose-400' : 'text-blue-300'}>{wfhDaysCount} / 2 Used</span>
                        </div>
                        <div className="w-full bg-[#211044] h-2.5 rounded-full overflow-hidden border border-purple-500/10">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${wfhDaysCount >= 2 ? 'bg-rose-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, (wfhDaysCount / 2) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-purple-300/70 mt-1">Maximum limit is 2 WFH sessions allowed per month</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center">
                          <p className="text-[9px] text-indigo-300 font-bold mb-0.5">Client Visits</p>
                          <p className="text-sm font-black text-indigo-400">{clientVisitDaysCount} Days</p>
                        </div>
                        <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center">
                          <p className="text-[9px] text-purple-300 font-bold mb-0.5">Outdoor Work</p>
                          <p className="text-sm font-black text-purple-400">{outdoorDaysCount} Days</p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
                    <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3.5 border-b border-purple-500/15 pb-2">
                      Tasks & Expense Status
                    </span>
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-purple-200">Tasks Completed</span>
                          <span className="text-purple-300">{completedTasksCount} / {assignedTasksCount} Completed</span>
                        </div>
                        {assignedTasksCount > 0 ? (
                          <>
                            <div className="w-full bg-[#211044] h-2.5 rounded-full overflow-hidden border border-purple-500/10">
                              <div 
                                className="h-full bg-[#7C3AED] rounded-full transition-all duration-500"
                                style={{ width: `${(completedTasksCount / assignedTasksCount) * 100}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-purple-300/70 mt-1">Completion Rate: {Math.round((completedTasksCount / assignedTasksCount) * 100)}%</p>
                          </>
                        ) : (
                          <p className="text-xs text-purple-300/60 font-semibold italic bg-[#211044] p-2 rounded-lg text-center border border-purple-500/5 mt-1.5">No tasks assigned this month</p>
                        )}
                      </div>

                      <div className="bg-[#211044] p-3 rounded-xl border border-purple-500/10 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-purple-300/70 font-semibold">Total Expenses Requested</p>
                          <p className="font-black text-base text-white">₹{totalExpenseAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[9px] font-bold text-purple-300">
                          <span className="text-emerald-400">Approved: ₹{totalApprovedAmount.toLocaleString()}</span>
                          <span className="text-amber-400">Pending: ₹{totalPendingAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* 4. Performance Snapshot Card */}
                <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3.5 border-b border-purple-500/15 pb-2">
                    Performance Snapshot
                  </span>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 bg-[#211044] p-3.5 rounded-xl border border-purple-500/10 flex-1">
                      <div className="w-14 h-14 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400 font-black text-xl border border-pink-500/25 shrink-0 shadow-inner">
                        {efficiencyResult.finalScore === -1 ? 'N/A' : efficiencyResult.grade}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">Efficiency Score</p>
                        <p className="text-lg font-black text-pink-400 mt-0.5">
                          {efficiencyResult.finalScore === -1 ? 'NO DATA' : `${efficiencyResult.finalScore}%`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex-1 bg-[#211044] p-3 rounded-xl border border-purple-500/10 text-[10px] font-semibold text-purple-300">
                      <p className="font-extrabold text-white text-xs mb-1.5 border-b border-purple-500/10 pb-1">Applied Weightages</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex justify-between"><span>Task Completion:</span> <span className="text-white font-bold">{weightages.taskCompletion}%</span></div>
                        <div className="flex justify-between"><span>On-Time:</span> <span className="text-white font-bold">{weightages.onTimeCompletion}%</span></div>
                        <div className="flex justify-between"><span>Quality:</span> <span className="text-white font-bold">{weightages.quality}%</span></div>
                        <div className="flex justify-between"><span>Punctuality:</span> <span className="text-white font-bold">{weightages.punctuality}%</span></div>
                        <div className="flex justify-between"><span>Workload:</span> <span className="text-white font-bold">{weightages.workload}%</span></div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 5. Quick Navigation Links */}
                <div>
                  <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider mb-3">
                    Quick Links
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => navigate('/attendance')}
                      className="p-3.5 bg-[#2D1B5A] hover:bg-[#35206A] border border-purple-500/20 hover:border-purple-500/40 rounded-xl font-bold text-xs text-purple-200 transition text-left flex items-center justify-between group shadow-md"
                    >
                      <span>View Attendance History</span>
                      <span className="text-pink-400 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/leave')}
                      className="p-3.5 bg-[#2D1B5A] hover:bg-[#35206A] border border-purple-500/20 hover:border-purple-500/40 rounded-xl font-bold text-xs text-purple-200 transition text-left flex items-center justify-between group shadow-md"
                    >
                      <span>View Leave Status</span>
                      <span className="text-pink-400 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/expenses')}
                      className="p-3.5 bg-[#2D1B5A] hover:bg-[#35206A] border border-purple-500/20 hover:border-purple-500/40 rounded-xl font-bold text-xs text-purple-200 transition text-left flex items-center justify-between group shadow-md"
                    >
                      <span>View Expenses</span>
                      <span className="text-pink-400 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/planner')}
                      className="p-3.5 bg-[#2D1B5A] hover:bg-[#35206A] border border-purple-500/20 hover:border-purple-500/40 rounded-xl font-bold text-xs text-purple-200 transition text-left flex items-center justify-between group shadow-md"
                    >
                      <span>View Tasks</span>
                      <span className="text-pink-400 group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

