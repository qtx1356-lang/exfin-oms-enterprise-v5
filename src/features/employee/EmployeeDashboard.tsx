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
import { getTodayAttendanceRecord, getStoredAttendanceRecords, saveAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { syncPendingAttendanceRecords } from '../../services/attendance/syncEngine';
import { AttendanceRecord } from '../../types/attendance';
import { UnresolvedCheckoutModal } from '../../components/ui/UnresolvedCheckoutModal';
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
  <div className="bg-[var(--app-background-secondary)] p-4 rounded-2xl border border-[var(--border)] animate-pulse space-y-2">
    <div className="h-3 w-1/3 bg-[var(--border)] rounded" />
    <div className="h-6 w-2/3 bg-[var(--border)] rounded" />
    <div className="h-3 w-1/2 bg-[var(--border)] rounded" />
  </div>
);

const CardError: React.FC<{ title: string; onRetry?: () => void }> = ({ title, onRetry }) => (
  <div className="bg-[var(--app-background-secondary)] p-4 rounded-2xl border border-rose-500/30 flex items-center justify-between text-xs text-rose-500">
    <div className="flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
      <span>{title}: Unable to load</span>
    </div>
    {onRetry && (
      <button 
        onClick={onRetry}
        className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 rounded-lg font-bold text-[11px] text-rose-500 transition flex items-center gap-1"
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

const getStoredAnnouncements = (empCode?: string): Announcement[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    if (empCode) {
      const rawUser = localStorage.getItem(`exfin_cached_announcements_${empCode}`);
      if (rawUser) return JSON.parse(rawUser);
    }
    const globalRaw = localStorage.getItem('exfin_cached_announcements');
    if (globalRaw) return JSON.parse(globalRaw);
  } catch {}
  return [];
};

const getInitialHasPayslips = (empCode?: string): boolean | null => {
  try {
    if (typeof localStorage !== 'undefined') {
      if (empCode) {
        const cached = localStorage.getItem(`exfin_cached_has_payslips_${empCode}`);
        if (cached !== null) return cached === 'true';
      }
      const globalCached = localStorage.getItem('exfin_cached_has_payslips');
      if (globalCached !== null) return globalCached === 'true';
    }
  } catch {}
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  return null;
};

export const EmployeeDashboard: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const { notifications, unreadNotificationCount, tasks: syncTasks, leaves: syncLeaves, attendance: syncAttendance, expenses: syncExpenses } = useRealtimeSync();
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => getStoredAnnouncements(employeeData?.employeeCode));
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaveBalance, setLeaveBalance] = useState({ available: 24, pending: 0, used: 0 });
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(() => getInitialHasPayslips(employeeData?.employeeCode));
  const [showUnavailableMessage, setShowUnavailableMessage] = useState(false);
  const [showUnresolvedModal, setShowUnresolvedModal] = useState(false);
  const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false);

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
    if (!db || !employeeData?.employeeCode || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    
    const q = query(
      collection(db, 'salaries'),
      where('employeeCode', '==', employeeData.employeeCode),
      limit(1)
    );
    
    const unsub = onSnapshot(q, (snap) => {
      const exists = !snap.empty;
      setHasPayslips(exists);
      try {
        if (typeof localStorage !== 'undefined' && employeeData.employeeCode) {
          localStorage.setItem(`exfin_cached_has_payslips_${employeeData.employeeCode}`, String(exists));
          localStorage.setItem('exfin_cached_has_payslips', String(exists));
        }
      } catch {}
    }, (err) => {
      console.error("Error checking payslips availability:", err);
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setHasPayslips(false);
      }
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

    if (!db || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setNotificationsLoading(false);
      return;
    }

    // Fetch announcements in real-time
    const announcementsQ = query(
      collection(db, 'announcements'),
      limit(50)
    );
    const unsubAnnouncements = onSnapshot(announcementsQ, (snapshot) => {
      const allAnnouncements = snapshot.docs.map(doc => {
        const d = doc.data();
        const dateStr = d.date || d.createdAt || d.timestamp || d.createdAtDeviceTime || '';
        return {
          id: doc.id,
          ...d,
          date: dateStr,
          createdAt: dateStr
        };
      }) as any[];

      // Filter targeted announcements for this employee
      const filtered = allAnnouncements.filter((ann) => {
        if (!employeeData) return false;
        const status = (employeeData.status || 'Approved').toString().trim().toLowerCase();
        if (status !== 'approved') return false;
        if (employeeData.role === 'SUPER_ADMIN' || employeeData.role === 'ADMIN') return false;

        if (!ann.targetType || ann.targetType === 'ALL') {
          return true;
        }

        if (ann.targetType === 'DEPARTMENT') {
          const userDept = (employeeData.department || '').toLowerCase().trim();
          const userOffice = (employeeData.office || '').toLowerCase().trim();
          const targetVal = String(ann.targetValue || '').toLowerCase().trim();
          return userDept === targetVal || userOffice === targetVal;
        }

        if (ann.targetType === 'DESIGNATION') {
          const userDesig = (employeeData.designation || '').toLowerCase().trim();
          const targetVal = String(ann.targetValue || '').toLowerCase().trim();
          return userDesig === targetVal;
        }

        if (ann.targetType === 'SELECTED') {
          const selectedCodes = Array.isArray(ann.targetValue)
            ? ann.targetValue.map((c: any) => String(c).trim().toLowerCase())
            : [String(ann.targetValue || '').trim().toLowerCase()];
          const userCode = String(employeeData.employeeCode || '').trim().toLowerCase();
          const userId = String(employeeData.id || '').trim().toLowerCase();
          return selectedCodes.includes(userCode) || selectedCodes.includes(userId);
        }

        return true;
      });

      // Sort announcements descending by time
      filtered.sort((a, b) => {
        const timeA = new Date(a.date || a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.date || b.createdAt || b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      const topAnnouncements = filtered.slice(0, 3);
      setAnnouncements(topAnnouncements);
      setNotificationsLoading(false);

      // Persist to local cache for instant offline startup
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('exfin_cached_announcements', JSON.stringify(topAnnouncements));
          if (employeeData.employeeCode) {
            localStorage.setItem(`exfin_cached_announcements_${employeeData.employeeCode}`, JSON.stringify(topAnnouncements));
          }
        }
      } catch (err) {
        console.warn('Failed to cache announcements locally:', err);
      }
    }, (error) => {
      console.error('Error fetching announcements:', error);
      setNotificationsLoading(false);
    });

    return () => {
      unsubAnnouncements();
    };
  }, [employeeData?.employeeCode, employeeData?.department, employeeData?.office, employeeData?.designation, employeeData?.status, employeeData?.role]);

  if (!employeeData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center text-[var(--text-primary)]">
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
      bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
    },
    { 
      icon: Wallet, 
      label: 'Expenses', 
      onClick: () => navigate('/expenses'), 
      bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
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
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
    },
    { 
      icon: MessageSquare, 
      label: 'Chat', 
      onClick: () => navigate('/chat'), 
      bg: 'bg-cyan-50 text-cyan-700 border-cyan-200' 
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : null,
      onClick: () => navigate('/notifications'), 
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' 
    },
    { 
      icon: HelpCircle, 
      label: 'FAQ & Help', 
      onClick: () => navigate('/faq'), 
      bg: 'glass-inner-tile text-purple-200 border-purple-500/20' 
    },
    { 
      icon: User, 
      label: 'Profile', 
      onClick: () => navigate('/profile'), 
      bg: 'glass-inner-tile text-emerald-300 border-emerald-500/20' 
    },
    { 
      icon: Activity, 
      label: 'Work Pulse', 
      onClick: () => setActiveView('workpulse'), 
      bg: 'glass-inner-tile text-indigo-300 border-indigo-500/20' 
    },
    { 
      icon: Clock, 
      label: 'Work Hours', 
      onClick: () => navigate('/work-hours'), 
      bg: 'glass-inner-tile text-indigo-300 border-indigo-500/20' 
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
  let attendanceBadgeColor = 'glass-inner-tile text-purple-200 border-purple-500/20';

  if (todayAttendanceRec) {
    if (todayAttendanceRec.attendanceType === 'WFH') {
      attendanceStatusLabel = 'WFH';
      attendanceBadgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    } else if (todayAttendanceRec.attendanceType === 'CLIENT_VISIT') {
      attendanceStatusLabel = 'Client Visit';
      attendanceBadgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    } else if (todayAttendanceRec.attendanceType === 'OUTDOOR') {
      attendanceStatusLabel = 'Outdoor Work';
      attendanceBadgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (todayAttendanceRec.checkOutTime && todayAttendanceRec.checkOutTime !== '--:--') {
      attendanceStatusLabel = 'Checked Out';
      attendanceBadgeColor = 'bg-amber-50 text-amber-800 border-amber-200';
    } else {
      attendanceStatusLabel = 'Checked In';
      attendanceBadgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  } else if (hasApprovedLeaveToday) {
    attendanceStatusLabel = 'On Leave';
    attendanceBadgeColor = 'bg-pink-50 text-pink-700 border-pink-200';
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

  useEffect(() => {
    // Check if we need to show the popup for missed today
    let targetRecord = null;
    
    if (todayAttendance && !todayAttendance.checkOutTime && !todayAttendance.exitDetectedTime && !todayAttendance.exitTime) {
      // If they are checked in today, but their current distance is > 25, they missed the exit detection
      if (todayAttendance.attendanceType === 'OFFICE' || !todayAttendance.attendanceType) {
        if (todayAttendance.currentState === 'CHECKED_IN' && todayAttendance.currentDistance && todayAttendance.currentDistance > 25) {
          targetRecord = todayAttendance;
        }
      }
    }

    // Don't show if they already reported it
    if (targetRecord && targetRecord.checkoutSource !== 'EMPLOYEE_REPORTED') {
      setShowUnresolvedModal(true);
    } else {
      setShowUnresolvedModal(false);
    }
  }, [todayAttendance]);

  const handleUnresolvedCheckoutSubmit = async (time: string) => {
    // Determine which record we are resolving
    let targetRecord = null;
    if (todayAttendance && !todayAttendance.checkOutTime && todayAttendance.currentDistance && todayAttendance.currentDistance > 25) {
      targetRecord = todayAttendance;
    }
    
    if (!targetRecord) return;
    setIsSubmittingRecovery(true);
    try {
      const updatedRecord: AttendanceRecord = {
        ...targetRecord,
        checkOutTime: time,
        employeeProposedCheckoutTime: time,
        checkoutSource: 'EMPLOYEE_REPORTED',
        checkoutStatus: 'UNRESOLVED',
        attendanceStatus: 'UNRESOLVED',
        checkoutFinalizationSource: 'NONE',
        exitDetectionSource: 'NONE',
        checkoutFinalized: false,
        checkoutConfirmed: false,
        status: 'UNRESOLVED',
        syncStatus: 'Pending',
        updatedAt: new Date().toISOString(),
        version: (targetRecord.version || 1) + 1,
      };

      saveAttendanceRecord(updatedRecord);
      setAttendanceRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      setShowUnresolvedModal(false);

      if (navigator.onLine) {
        await syncPendingAttendanceRecords();
      }
    } catch (e) {
      console.error('Failed to submit unresolved checkout', e);
    } finally {
      setIsSubmittingRecovery(false);
    }
  };

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
      <div className="flex flex-col gap-5 pb-8 text-[var(--text-primary)]">
        {/* Top Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl overflow-hidden glass-inner-tile border-2 border-indigo-400/50 flex-shrink-0 shadow-lg">
              {employeeData.selfieUrl ? (
                <img src={employeeData.selfieUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="w-6 h-6 m-auto mt-3 text-[var(--primary-light)]" />
              )}
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-tight">
                {employeeData.name || 'Employee'}
              </h1>
              <p className="text-xs text-purple-200/80 font-medium mt-0.5">
                Code: <span className="text-cyan-300 font-bold">{employeeData.employeeCode || 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 glass-inner-tile border border-purple-500/20 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-200 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate max-w-[130px]">{employeeData.officeLocation || employeeData.workLocation || 'Raniganj HQ'}</span>
          </div>
        </div>

        {/* Greeting Banner */}
        <div className="text-left py-0.5">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
            {greetingPrefix}
          </h2>
        </div>

        {/* TODAY OVERVIEW CARD */}
        <Card className="p-4 sm:p-5 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] rounded-2xl relative overflow-hidden text-[var(--text-primary)]">
          <div className="border-b border-[var(--border)] pb-3 mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg glass-inner-tile border border-[var(--border)] text-[var(--primary-light)]">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">
                TODAY OVERVIEW
              </h3>
            </div>
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full glass-inner-tile border border-[var(--border)] text-[var(--text-muted)] uppercase tracking-wider font-mono">
              {todayDate}
            </span>
          </div>

          {/* 2-Column Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs font-bold">
            {/* ATTENDANCE MINI-CARD */}
            <div className="p-3 rounded-xl border border-[var(--border)] glass-inner-tile text-[var(--text-primary)] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">
                  ATTENDANCE
                </span>
                <UserCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight truncate text-[var(--text-primary)]">
                  {attendanceStatusLabel}
                </p>
                <p className="text-[10px] font-medium text-[var(--text-muted)] mt-0.5 truncate">
                  {checkInTimeStr && checkInTimeStr !== '--:--' ? `In at ${checkInTimeStr}` : 'Shift active'}
                </p>
              </div>
            </div>

            {/* WORKING TIME MINI-CARD */}
            <div className="p-3 rounded-xl border border-[var(--border)] glass-inner-tile text-[var(--text-primary)] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-amber-500">
                  WORKING TIME
                </span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-amber-500">
                  {workingDurationStr}
                </p>
                <p className="text-[10px] font-medium text-[var(--text-muted)] mt-0.5">
                  Logged duration
                </p>
              </div>
            </div>

            {/* TASKS MINI-CARD */}
            <div className="p-3 rounded-xl border border-[var(--border)] glass-inner-tile text-[var(--text-primary)] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-[var(--primary-light)]">
                  TASKS
                </span>
                <CheckSquare className="w-4 h-4 text-[var(--primary-light)]" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-[var(--primary-light)]">
                  {completedTaskCount} / {assignedTaskCount} completed
                </p>
                <p className="text-[10px] font-medium text-[var(--text-muted)] mt-0.5">
                  {assignedTaskCount - completedTaskCount > 0 ? `${assignedTaskCount - completedTaskCount} remaining` : 'All tasks completed'}
                </p>
              </div>
            </div>

            {/* WORK PROGRESS MINI-CARD */}
            <div className="p-3 rounded-xl border border-[var(--border)] glass-inner-tile text-[var(--text-primary)] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400">
                  WORK PROGRESS
                </span>
                <BarChart3 className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-black tracking-tight text-emerald-400">
                  {taskProgressPercentage}%
                </p>
                <p className="text-[10px] font-medium text-[var(--text-muted)] mt-0.5">
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
              <Card className="p-4 glass-card border border-[var(--border)] shadow-md rounded-2xl flex items-center justify-between text-[var(--text-primary)]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-xs text-emerald-300 flex items-center gap-1.5">
                      <span>✓ All caught up</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
                      No action required right now.
                    </p>
                  </div>
                </div>
              </Card>
            );
          }

          return (
            <Card className="p-4 sm:p-5 glass-card border border-amber-400/40 shadow-md rounded-2xl text-[var(--text-primary)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-400">
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
                  <div key={task.id} className="flex items-center justify-between gap-3 glass-inner-tile p-3 rounded-xl border border-[var(--border)] text-xs">
                    <div className="truncate min-w-0 flex-1">
                      <p className="text-[var(--text-primary)] font-extrabold truncate">{task.title}</p>
                      <p className="text-[10px] text-amber-300 font-medium mt-0.5">Due today • High Priority</p>
                    </div>
                    <button 
                      onClick={() => navigate('/planner')} 
                      className="text-[11px] font-black btn-primary text-[var(--text-primary)] hover:brightness-110 active:scale-95 px-3.5 py-1.5 rounded-xl transition shadow-md flex-shrink-0 flex items-center gap-1 cursor-pointer border border-[var(--border)]"
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
        <Card className="p-4 sm:p-5 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] rounded-2xl relative overflow-hidden text-[var(--text-primary)]">
          <div className="border-b border-[var(--border)] pb-3 mb-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg glass-inner-tile border border-[var(--border)] text-[var(--primary-light)]">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">
                📈 TODAY'S WORK
              </h3>
            </div>
            <span className="text-[var(--primary-light)] font-mono text-sm font-black glass-inner-tile px-2.5 py-0.5 rounded-full border border-[var(--border)]">
              {taskProgressPercentage}%
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-[var(--surface-elevated)] h-3 rounded-full overflow-hidden border border-[var(--border)] mb-4 p-0.5">
            <div 
              className="h-full gradient-bg-secondary rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
              style={{ width: `${taskProgressPercentage}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-[var(--text-muted)] mb-2">
            <div className="p-2.5 rounded-xl glass-inner-tile border border-[var(--border)] shadow-sm">
              <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold block mb-0.5">Tasks Assigned</span>
              <span className="text-[var(--text-primary)] font-black text-sm">{assignedTaskCount} Total Tasks</span>
            </div>
            <div className="p-2.5 rounded-xl glass-inner-tile border border-[var(--border)] shadow-sm">
              <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold block mb-0.5">Tasks Completed</span>
              <span className="text-emerald-400 font-black text-sm">{completedTaskCount} Completed</span>
            </div>
          </div>

          {/* Next Task Focus if incomplete tasks exist */}
          {nextTask && (
            <div className="mt-2 p-3 rounded-xl glass-inner-tile border border-[var(--border)] flex items-center justify-between text-xs shadow-sm">
              <div className="truncate min-w-0 pr-2">
                <span className="text-[10px] uppercase font-extrabold text-[var(--primary-light)] tracking-wider block">Next Priority Task</span>
                <p className="text-[var(--text-primary)] font-bold truncate mt-0.5">{nextTask.title}</p>
              </div>
              <button
                onClick={() => navigate('/planner')}
                className="px-3 py-1.5 bg-[var(--surface-inner)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] rounded-xl text-[10px] font-extrabold shrink-0 transition cursor-pointer"
              >
                View
              </button>
            </div>
          )}
        </Card>

        {/* MY DAY TIMELINE */}
        <div className="glass-card border border-[var(--border)] rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-[var(--text-primary)]">
          <div 
            onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--surface-hover)] transition select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl glass-inner-tile border border-[var(--border)] flex items-center justify-center text-[var(--primary-light)]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">TODAY'S TIMELINE</h3>
                <p className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                  {isTimelineExpanded ? 'Interactive hourly agenda and activity log' : 'Click to expand agenda tracker'}
                </p>
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg glass-inner-tile border border-[var(--border)] flex items-center justify-center text-[var(--primary-light)]">
              <span className={`transform transition-transform duration-200 ${isTimelineExpanded ? 'rotate-90' : ''}`}>
                &rarr;
              </span>
            </div>
          </div>
          {isTimelineExpanded && (
            <div className="border-t border-[var(--border)] p-4 glass-inner-tile">
              <MyDayTimeline />
            </div>
          )}
        </div>

        {/* Quick Actions Grid */}
        <div>
          {showUnavailableMessage && (
            <div className="bg-rose-500/20 border border-rose-500/40 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-rose-300 mb-4 shadow-md">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-[var(--text-primary)]">Payslip Not Available Yet</p>
                <p className="text-[var(--text-muted)] mt-1">Your salary record has not been generated by the administrator for any month yet.</p>
              </div>
            </div>
          )}
          <h2 className="text-xs font-black text-purple-200 uppercase tracking-widest mb-3">
            QUICK ACTIONS
          </h2>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {quickActions.map((action, idx) => (
              <button 
                key={idx}
                onClick={action.onClick}
                className="flex flex-col items-center justify-center p-3 rounded-2xl glass-card hover:brightness-110 border border-[var(--border)] transition-all hover:scale-105 active:scale-95 shadow-[0_8px_25px_rgba(30,41,100,0.15)] group relative cursor-pointer text-[var(--text-primary)]"
              >
                {action.badge && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-black bg-rose-500 text-white rounded-full shadow-md animate-pulse">
                    {action.badge}
                  </span>
                )}
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-2 border glass-inner-tile border-[var(--border)] text-[var(--primary-light)]">
                  <action.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
                <span className="text-[10.5px] sm:text-[11.5px] font-extrabold text-[var(--text-primary)] text-center leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <h2 className="text-xs font-black text-purple-200 uppercase tracking-widest flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-cyan-400" />
              ANNOUNCEMENTS
            </h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {announcements.length > 0 ? (
              announcements.map((ann) => (
                <Card key={ann.id} className="p-3.5 glass-card border border-[var(--border)] shadow-[0_8px_25px_rgba(30,41,100,0.15)] text-[var(--text-primary)]">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-xs text-[var(--text-primary)]">{ann.title}</h3>
                    <span className="text-[10px] font-semibold text-[var(--text-muted)] glass-inner-tile px-2 py-0.5 rounded-full border border-[var(--border)]">
                      {new Date(ann.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed line-clamp-2">
                    {ann.content}
                  </p>
                </Card>
              ))
            ) : (
              <div className="text-center py-5 text-purple-300 glass-inner-tile rounded-2xl border border-dashed border-purple-500/30">
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
            className="fixed inset-0 z-50 bg-[var(--app-background)] overflow-y-auto"
          >
            <div className="container mx-auto p-4 max-w-3xl">
              <div className="flex flex-col gap-5 pb-8 text-white min-h-screen">
                {/* Work Pulse Header */}
                <div className="flex flex-col gap-4 pt-2">
                  <button 
                    onClick={() => setActiveView('dashboard')} 
                    className="self-start p-2 px-3.5 btn-primary border border-[var(--border)] rounded-xl hover:brightness-110 transition font-bold text-xs flex items-center gap-1.5 shadow-md text-white cursor-pointer"
                  >
                    &larr; Back
                  </button>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-cyan-400" /> WORK PULSE
                      </p>
                      <h1 className="text-2xl font-black text-white leading-tight">
                        Your Work Pulse Snapshot
                      </h1>
                      <p className="text-xs text-purple-200/80 mt-1">Here's your personal work snapshot 👋</p>
                    </div>
                    <div className="glass-inner-tile border border-purple-500/30 px-3 py-1.5 rounded-full text-[10px] font-bold text-purple-200 mt-1 shadow-sm">
                      {monthName} {currentYear}
                    </div>
                  </div>
                </div>

                {/* 1. Today's Attendance Status Card */}
                <Card className="p-4 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] relative overflow-hidden text-[var(--text-primary)]">
                  <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Today's Attendance Status</span>
                    <div className="flex items-center gap-1.5">
                      {isCorrected && (
                        <span className="text-[10px] font-extrabold text-[var(--text-muted)] glass-inner-tile px-2 py-0.5 rounded border border-[var(--border)]">
                          Corrected
                        </span>
                      )}
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider
                        ${todayStatus === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          todayStatus === 'WFH' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                          todayStatus === 'Client Visit' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                          todayStatus === 'Outdoor Work' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                          todayStatus === 'Leave' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          todayStatus === 'Absent' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'}`}
                      >
                        {todayStatus}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="glass-inner-tile p-3 rounded-xl border border-[var(--border)]">
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mb-0.5">Check-In</p>
                      <p className="font-extrabold text-sm text-[var(--text-primary)]">{todayCheckIn}</p>
                    </div>
                    <div className="glass-inner-tile p-3 rounded-xl border border-[var(--border)]">
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mb-0.5">Check-Out</p>
                      <p className="font-extrabold text-sm text-[var(--text-primary)]">{todayCheckOut}</p>
                    </div>
                    <div className="glass-inner-tile p-3 rounded-xl border border-[var(--border)]">
                      <p className="text-[10px] text-[var(--text-muted)] font-semibold mb-0.5">Mode</p>
                      <p className="font-extrabold text-sm text-[var(--text-primary)]">{todayMode}</p>
                    </div>
                  </div>
                </Card>

                {/* 2. Monthly Attendance Summary Card */}
                <Card className="p-4 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-[var(--text-primary)]">
                  <div className="flex justify-between items-center mb-4 border-b border-[var(--border)] pb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Monthly Attendance Summary</span>
                    <span className="text-[10px] text-[var(--primary-light)] font-semibold">{monthName} Tracker</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="flex items-center gap-4 glass-inner-tile p-3 rounded-xl border border-[var(--border)]">
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <path
                            className="text-[var(--text-primary)]/10"
                            strokeWidth="3.5"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                          <path
                            className="text-[var(--primary-light)]"
                            strokeDasharray={`${attendancePercentage}, 100`}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            stroke="currentColor"
                            fill="none"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-black text-[var(--text-primary)]">{attendancePercentage}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-black text-[var(--text-primary)]">Attendance Rate</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-1">Logged <span className="text-[var(--text-primary)] font-bold">{presentDaysCount}</span> out of <span className="text-[var(--text-primary)] font-bold">{expectedWorkingDays}</span> expected working days</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="glass-inner-tile p-2.5 rounded-xl border border-[var(--border)] text-center">
                        <p className="text-[9px] text-amber-500 font-bold mb-0.5">Late Days</p>
                        <p className="text-base font-black text-amber-500">{lateDaysCount}</p>
                      </div>
                      <div className="glass-inner-tile p-2.5 rounded-xl border border-[var(--border)] text-center">
                        <p className="text-[9px] text-rose-400 font-bold mb-0.5">Absent Days</p>
                        <p className="text-base font-black text-rose-400">{actualAbsentDays}</p>
                      </div>
                      <div className="glass-inner-tile p-2.5 rounded-xl border border-[var(--border)] text-center">
                        <p className="text-[9px] text-emerald-400 font-bold mb-0.5">Present Days</p>
                        <p className="text-base font-black text-[var(--text-primary)]">{presentDaysCount}</p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 3. Detailed Pulse Snapshot Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-[var(--text-primary)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-3.5 border-b border-[var(--border)] pb-2">
                      Leave & WFH Limits
                    </span>
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-[var(--text-muted)]">Work From Home (WFH)</span>
                          <span className={wfhDaysCount >= 2 ? 'text-rose-400' : 'text-[var(--primary-light)]'}>{wfhDaysCount} / 2 Used</span>
                        </div>
                        <div className="w-full bg-[var(--surface-elevated)] h-2.5 rounded-full overflow-hidden border border-[var(--border)]">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${wfhDaysCount >= 2 ? 'bg-rose-500' : 'gradient-bg-primary'}`}
                            style={{ width: `${Math.min(100, (wfhDaysCount / 2) * 100)}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-[var(--text-muted)] mt-1">Maximum limit is 2 WFH sessions allowed per month</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div className="glass-inner-tile p-2.5 rounded-xl border border-[var(--border)] text-center">
                          <p className="text-[9px] text-[var(--primary-light)] font-bold mb-0.5">Client Visits</p>
                          <p className="text-sm font-black text-[var(--primary-light)]">{clientVisitDaysCount} Days</p>
                        </div>
                        <div className="glass-inner-tile p-2.5 rounded-xl border border-[var(--border)] text-center">
                          <p className="text-[9px] text-emerald-400 font-bold mb-0.5">Outdoor Work</p>
                          <p className="text-sm font-black text-emerald-400">{outdoorDaysCount} Days</p>
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-[var(--text-primary)]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-3.5 border-b border-[var(--border)] pb-2">
                      Tasks & Expense Status
                    </span>
                    <div className="flex flex-col gap-4">
                      <div>
                        <div className="flex justify-between items-center text-xs font-bold mb-1">
                          <span className="text-[var(--text-muted)]">Tasks Completed</span>
                          <span className="text-[var(--text-muted)]">{completedTasksCount} / {assignedTasksCount} Completed</span>
                        </div>
                        {assignedTasksCount > 0 ? (
                          <>
                            <div className="w-full bg-[var(--surface-elevated)] h-2.5 rounded-full overflow-hidden border border-[var(--border)]">
                              <div 
                                className="h-full gradient-bg-secondary rounded-full transition-all duration-500"
                                style={{ width: `${(completedTasksCount / assignedTasksCount) * 100}%` }}
                              />
                            </div>
                            <p className="text-[9px] text-[var(--text-muted)] mt-1">Completion Rate: {Math.round((completedTasksCount / assignedTasksCount) * 100)}%</p>
                          </>
                        ) : (
                          <p className="text-xs text-[var(--text-muted)] font-semibold italic glass-inner-tile p-2 rounded-lg text-center border border-[var(--border)] mt-1.5">No tasks assigned this month</p>
                        )}
                      </div>

                      <div className="glass-inner-tile p-3 rounded-xl border border-[var(--border)] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-[var(--text-muted)] font-semibold">Total Expenses Requested</p>
                          <p className="font-black text-base text-[var(--text-primary)]">₹{totalExpenseAmount.toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[9px] font-bold text-[var(--text-muted)]">
                          <span className="text-emerald-400">Approved: ₹{totalApprovedAmount.toLocaleString()}</span>
                          <span className="text-amber-500">Pending: ₹{totalPendingAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* 4. Performance Snapshot Card */}
                <Card className="p-4 glass-card border border-[var(--border)] shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-[var(--text-primary)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-3.5 border-b border-[var(--border)] pb-2">
                    Performance Snapshot
                  </span>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 glass-inner-tile p-3.5 rounded-xl border border-[var(--border)] flex-1">
                      <div className="w-14 h-14 rounded-xl bg-[var(--surface-inner)] flex items-center justify-center text-[var(--primary-light)] font-black text-xl border border-[var(--border)] shrink-0 shadow-inner">
                        {efficiencyResult.finalScore === -1 ? 'N/A' : efficiencyResult.grade}
                      </div>
                      <div>
                        <p className="text-sm font-black text-[var(--text-primary)]">Efficiency Score</p>
                        <p className="text-lg font-black text-[var(--primary-light)] mt-0.5">
                          {efficiencyResult.finalScore === -1 ? 'NO DATA' : `${efficiencyResult.finalScore}%`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex-1 glass-inner-tile p-3 rounded-xl border border-[var(--border)] text-[10px] font-semibold text-[var(--text-muted)]">
                      <p className="font-extrabold text-[var(--text-primary)] text-xs mb-1.5 border-b border-[var(--border)] pb-1">Applied Weightages</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="flex justify-between"><span>Task Completion:</span> <span className="text-[var(--text-primary)] font-bold">{weightages.taskCompletion}%</span></div>
                        <div className="flex justify-between"><span>On-Time:</span> <span className="text-[var(--text-primary)] font-bold">{weightages.onTimeCompletion}%</span></div>
                        <div className="flex justify-between"><span>Quality:</span> <span className="text-[var(--text-primary)] font-bold">{weightages.quality}%</span></div>
                        <div className="flex justify-between"><span>Punctuality:</span> <span className="text-[var(--text-primary)] font-bold">{weightages.punctuality}%</span></div>
                        <div className="flex justify-between"><span>Workload:</span> <span className="text-[var(--text-primary)] font-bold">{weightages.workload}%</span></div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* 5. Quick Navigation Links */}
                <div>
                  <h2 className="text-xs font-black text-purple-200 uppercase tracking-widest mb-3">
                    Quick Links
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => navigate('/attendance')}
                      className="p-3.5 glass-card hover:brightness-110 border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text-primary)] transition text-left flex items-center justify-between group shadow-md cursor-pointer"
                    >
                      <span>View Attendance History</span>
                      <span className="text-[var(--primary-light)] group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/leave')}
                      className="p-3.5 glass-card hover:brightness-110 border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text-primary)] transition text-left flex items-center justify-between group shadow-md cursor-pointer"
                    >
                      <span>View Leave Status</span>
                      <span className="text-[var(--primary-light)] group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/expenses')}
                      className="p-3.5 glass-card hover:brightness-110 border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text-primary)] transition text-left flex items-center justify-between group shadow-md cursor-pointer"
                    >
                      <span>View Expenses</span>
                      <span className="text-[var(--primary-light)] group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                    <button 
                      onClick={() => navigate('/planner')}
                      className="p-3.5 glass-card hover:brightness-110 border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text-primary)] transition text-left flex items-center justify-between group shadow-md cursor-pointer"
                    >
                      <span>View Tasks</span>
                      <span className="text-[var(--primary-light)] group-hover:translate-x-1.5 transition-transform">&rarr;</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {showUnresolvedModal && todayAttendance && (
        <UnresolvedCheckoutModal
          isOpen={showUnresolvedModal}
          onClose={() => setShowUnresolvedModal(false)}
          record={todayAttendance as AttendanceRecord}
          onSubmit={handleUnresolvedCheckoutSubmit}
          isSubmitting={isSubmittingRecovery}
        />
      )}
    </>
  );
};

