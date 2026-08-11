import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
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
  CheckCircle2
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

export const EmployeeDashboard: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaveBalance, setLeaveBalance] = useState({ available: 24, pending: 0, used: 0 });
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(null);
  const [showUnavailableMessage, setShowUnavailableMessage] = useState(false);

  // Section Loading & Error states
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  // Personal Work Pulse States
  const [activeView, setActiveView] = useState<'dashboard' | 'workpulse'>('dashboard');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [allLeaves, setAllLeaves] = useState<any[]>([]);

  // Initialize data from local storage
  useEffect(() => {
    logStartupTag('DASHBOARD_READY', 'Employee Dashboard fully mounted');
    setAttendanceRecords(getStoredAttendanceRecords());
    setTasks(getStoredTasks());
    setExpenses(getStoredExpenseRecords());
    setAllLeaves(getStoredLeaves());
  }, []);

  // Real-time listener for Attendance
  useEffect(() => {
    if (!employeeData?.employeeCode) {
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    setAttendanceError(null);

    if (!db) {
      setAttendanceLoading(false);
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('employeeId', '==', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
      setAttendanceRecords(list);
      setAttendanceLoading(false);
    }, (err) => {
      console.warn("Attendance snapshot error:", err);
      setAttendanceError("Unable to load");
      setAttendanceLoading(false);
    });
    return () => unsub();
  }, [employeeData]);

  // Real-time listener for Tasks
  useEffect(() => {
    if (!employeeData?.employeeCode) {
      setTasksLoading(false);
      return;
    }
    setTasksLoading(true);
    setTasksError(null);

    if (!db) {
      setTasksLoading(false);
      return;
    }

    const q = query(
      collection(db, 'tasks'),
      where('assignedToEmployeeCodes', 'array-contains', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setTasks(list);
      setTasksLoading(false);
    }, (err) => {
      console.warn("Tasks snapshot error:", err);
      setTasksError("Unable to load");
      setTasksLoading(false);
    });
    return () => unsub();
  }, [employeeData]);

  // Real-time listener for Expenses
  useEffect(() => {
    if (!db || !employeeData?.employeeCode) return;
    const q = query(
      collection(db, 'expenses'),
      where('employeeCode', '==', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setExpenses(list);
    }, (err) => {
      console.warn("Expenses snapshot error:", err);
    });
    return () => unsub();
  }, [employeeData]);

  // Real-time listener for Leaves (to update leave summary dynamically)
  useEffect(() => {
    if (!employeeData?.employeeCode) {
      setLeavesLoading(false);
      return;
    }
    setLeavesLoading(true);
    setLeavesError(null);

    if (!db) {
      setLeavesLoading(false);
      return;
    }

    const q = query(
      collection(db, 'leaves'),
      where('employeeCode', '==', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setAllLeaves(list);
      
      const empId = employeeData.id || employeeData.employeeCode || '';
      const dept = employeeData.office || 'Raniganj';
      const localConfig = getStoredLeaveConfig();
      const localAllowances = getStoredEmployeeAllowances();
      const bal = calculateLeaveBalance(empId, dept, list, localConfig, localAllowances);
      setLeaveBalance({
        available: bal.available,
        pending: bal.pending,
        used: bal.used,
      });
      setLeavesLoading(false);
    }, (err) => {
      console.warn("Leaves snapshot error:", err);
      setLeavesError("Unable to load");
      setLeavesLoading(false);
    });
    return () => unsub();
  }, [employeeData]);

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
  }, [employeeData]);

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
  }, [employeeData]);

  useEffect(() => {
    if (employeeData) {
      const empId = employeeData.employeeCode || employeeData.id || 'EMP-UNKNOWN';
      const todayStr = getFormattedDateStr();
      const rec = getTodayAttendanceRecord(empId, todayStr);
      setTodayAttendance(rec);
    }
  }, [employeeData]);

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

    // Fetch notifications
    const notificationsQ = query(
      collection(db, 'notifications'),
      where('recipientEmployeeCode', '==', employeeData.employeeCode)
    );
    const unsubNotifications = onSnapshot(notificationsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      const sorted = data.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      setNotifications(sorted);
      setNotificationsLoading(false);
    }, (error) => {
      console.error('Error fetching notifications:', error);
      setNotificationsError("Unable to load");
      setNotificationsLoading(false);
    });

    return () => {
      unsubAnnouncements();
      unsubNotifications();
    };
  }, [employeeData]);

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
    { icon: UserCheck, label: 'Attendance', onClick: () => navigate('/attendance'), bg: 'bg-[#7C3AED]/20 text-[#A78BFA] border-purple-500/30' },
    { icon: Activity, label: 'Work Pulse', onClick: () => setActiveView('workpulse'), bg: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
    { icon: Briefcase, label: 'Work Planner', onClick: () => navigate('/planner'), bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    ...(employeeData.isTeamLeader ? [
      { icon: Users, label: 'My Team', onClick: () => navigate('/my-team'), bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
    ] : []),
    { icon: BarChart3, label: 'Efficiency', onClick: () => navigate('/efficiency'), bg: 'bg-[#7C3AED]/20 text-purple-300 border-purple-500/30' },
    { icon: Wallet, label: 'Expenses', onClick: () => navigate('/expenses'), bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    { icon: Calendar, label: 'Leave', onClick: () => navigate('/leave'), bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
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
        : 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
    },
    { icon: User, label: 'Profile', onClick: () => navigate('/profile'), bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
    { icon: MessageSquare, label: 'Chat', onClick: () => navigate('/chat'), bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  ];

  // -------------------------------------------------------------------------
  // SMART DAILY BRIEFING CALCULATIONS (FEATURE 5)
  // -------------------------------------------------------------------------
  const currentHour = new Date().getHours();
  const greetingPrefix = currentHour < 12 ? 'GOOD MORNING!' : currentHour < 17 ? 'GOOD AFTERNOON!' : 'GOOD EVENING!';

  // Today's attendance status & details
  const todayStr = getFormattedDateStr();
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

  const assignedTaskCount = myTasks.length;
  const completedTaskCount = myTasks.filter(t => t.status === 'COMPLETED').length;
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

  // Unread Notifications Count
  const unreadNotificationCount = notifications.filter(n => !n.read).length;

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
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#211044] border-2 border-[#7C3AED]/50 flex-shrink-0 shadow-lg">
              {employeeData.selfieUrl ? (
                <img src={employeeData.selfieUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <UserCheck className="w-6 h-6 m-auto mt-3 text-purple-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white leading-none">
                  {employeeData.name || 'Employee'}
                </h1>
              </div>
              <p className="text-xs text-purple-300/80 font-medium mt-1">
                Code: <span className="text-white font-bold">{employeeData.employeeCode || 'N/A'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#2D1B5A] border border-purple-500/30 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-200 shadow-md">
            <MapPin className="w-3.5 h-3.5 text-[#A78BFA]" />
            <span>{employeeData.officeLocation || employeeData.workLocation || 'Raniganj HQ'}</span>
          </div>
        </div>

        {/* 1. TODAY AT A GLANCE (FEATURE 5 - SMART DAILY BRIEFING DASHBOARD) */}
        <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-[#2D1B5A] via-[#35206A] to-[#211044] border border-purple-500/30 shadow-2xl rounded-[28px]">
          <div className="absolute -top-10 -right-10 w-44 h-44 bg-[#7C3AED]/20 rounded-full blur-3xl pointer-events-none" />

          {/* Header Greeting */}
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div>
              <p className="text-xs font-black text-amber-300 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                ✨ {greetingPrefix}
              </p>
              <h1 className="text-2xl font-black text-white tracking-tight">Today at a Glance</h1>
            </div>
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#211044]/90 border border-purple-500/30 text-purple-200 shadow-inner">
              {todayDate}
            </span>
          </div>

          {/* Quick Glance Metrics Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 relative z-10 p-3 bg-[#211044]/70 backdrop-blur-md rounded-2xl border border-purple-500/20 mb-5">
            <div className="flex flex-col p-2.5 bg-[#2D1B5A]/60 rounded-xl border border-purple-500/10">
              <span className="text-[10px] font-semibold text-purple-300/80">Attendance</span>
              <span className="text-xs font-black text-white mt-0.5 leading-snug">{attendanceStatusLabel}</span>
            </div>

            <div className="flex flex-col p-2.5 bg-[#2D1B5A]/60 rounded-xl border border-purple-500/10">
              <span className="text-[10px] font-semibold text-purple-300/80">Working Time</span>
              <span className="text-xs font-black text-amber-300 mt-0.5 leading-snug">{workingDurationStr}</span>
            </div>

            <div className="flex flex-col p-2.5 bg-[#2D1B5A]/60 rounded-xl border border-purple-500/10">
              <span className="text-[10px] font-semibold text-purple-300/80">Tasks</span>
              <div className="text-[11px] font-black leading-tight mt-0.5 space-y-0.5">
                <div className="text-purple-100">{assignedTaskCount} assigned</div>
                <div className="text-emerald-300">{completedTaskCount} completed</div>
              </div>
            </div>

            <div 
              onClick={() => navigate('/notifications')}
              className="flex flex-col p-2.5 bg-[#2D1B5A]/60 rounded-xl border border-purple-500/10 hover:border-purple-500/40 cursor-pointer transition"
            >
              <span className="text-[10px] font-semibold text-purple-300/80 flex items-center justify-between">
                Notifications
                {unreadNotificationCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
              </span>
              <span className="text-xs font-black text-pink-300 mt-0.5 leading-snug">
                {unreadNotificationCount} unread
              </span>
            </div>

            <div 
              onClick={() => navigate('/leave')}
              className="flex flex-col p-2.5 bg-[#2D1B5A]/60 rounded-xl border border-purple-500/10 hover:border-purple-500/40 cursor-pointer transition col-span-2 sm:col-span-1"
            >
              <span className="text-[10px] font-semibold text-purple-300/80">Leave</span>
              <span className="text-[11px] font-black text-purple-200 mt-0.5 leading-snug line-clamp-2">
                {nextUpcomingLeave ? formatLeaveRange(nextUpcomingLeave.startDate, nextUpcomingLeave.endDate) : 'No upcoming leave'}
              </span>
            </div>
          </div>

          {/* Detailed Briefing Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 relative z-10">
            
            {/* 2. ATTENDANCE CARD */}
            {attendanceLoading ? <CardSkeleton /> : attendanceError ? <CardError title="Attendance" onRetry={() => setAttendanceRecords(getStoredAttendanceRecords())} /> : (
              <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-4 border border-purple-500/25 flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-400" /> Attendance State
                  </span>
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${attendanceBadgeColor}`}>
                    {attendanceStatusLabel}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-purple-300/70 font-medium">Check-In Time:</span>
                    <span className="font-bold text-white">{todayAttendanceRec?.checkInTime || 'Not Checked In'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-purple-300/70 font-medium">Currently Working / Shift:</span>
                    <span className="font-bold text-amber-300">{workingDurationStr}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 3 & 7. TASK SUMMARY & DAILY PROGRESS */}
            {tasksLoading ? <CardSkeleton /> : tasksError ? <CardError title="Tasks" onRetry={() => setTasks(getStoredTasks())} /> : (
              <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-4 border border-purple-500/25 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-emerald-400" /> Tasks Today
                  </span>
                  <span className="text-xs font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    {taskProgressPercentage}% Done
                  </span>
                </div>
                <div className="text-xs flex justify-between text-purple-200 mb-2">
                  <span>Assigned: <strong className="text-white">{assignedTaskCount}</strong></span>
                  <span>Completed: <strong className="text-emerald-300">{completedTaskCount}</strong></span>
                </div>
                {/* Visual Progress Bar */}
                <div>
                  <div className="flex justify-between text-[10px] font-extrabold text-purple-300 uppercase tracking-widest mb-1">
                    <span>Today's Progress</span>
                    <span>{taskProgressPercentage}%</span>
                  </div>
                  <div className="w-full bg-[#2D1B5A] h-2.5 rounded-full overflow-hidden border border-purple-500/20">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                      style={{ width: `${taskProgressPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. NEXT TASK CARD */}
            {tasksLoading ? <CardSkeleton /> : tasksError ? <CardError title="Next Task" onRetry={() => setTasks(getStoredTasks())} /> : (
              <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-4 border border-purple-500/25 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" /> Next Task
                  </span>
                  {nextTask && (
                    <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      {nextTask.priority || 'Medium'} Priority
                    </span>
                  )}
                </div>

                {nextTask ? (
                  <div>
                    <h3 className="font-black text-sm text-white line-clamp-1 mb-1">{nextTask.title || 'Untitled Task'}</h3>
                    <div className="flex justify-between items-center text-[11px] text-purple-300/80 mb-2">
                      <span>Due: {nextTask.dueDate ? nextTask.dueDate : 'Today'}</span>
                      <span>Progress: {nextTask.completionPercentage !== undefined ? nextTask.completionPercentage : (nextTask.status === 'IN_PROGRESS' ? 50 : 0)}%</span>
                    </div>
                    <button
                      onClick={() => navigate('/planner')}
                      className="w-full py-2 px-3 bg-[#7C3AED]/30 hover:bg-[#7C3AED]/50 border border-purple-500/30 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1.5 transition active:scale-98"
                    >
                      <span>Continue Task</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="py-2 text-center text-xs text-purple-300/70">
                    {assignedTaskCount > 0 ? 'All tasks completed 🎉' : 'No tasks assigned'}
                  </div>
                )}
              </div>
            )}

            {/* 5 & 6. LEAVE & NOTIFICATION SUMMARY */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 5. LEAVE SUMMARY */}
              {leavesLoading ? <CardSkeleton /> : leavesError ? <CardError title="Leave" onRetry={() => setAllLeaves(getStoredLeaves())} /> : (
                <div 
                  onClick={() => navigate('/leave')}
                  className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/25 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 transition"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    <Calendar className="w-3.5 h-3.5 text-purple-400" /> Upcoming Leave
                  </div>
                  <div className="my-1.5">
                    {nextUpcomingLeave ? (
                      <>
                        <p className="font-bold text-xs text-white leading-tight">
                          {formatLeaveRange(nextUpcomingLeave.startDate, nextUpcomingLeave.endDate)}
                        </p>
                        <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 inline-block mt-1">
                          Approved
                        </span>
                      </>
                    ) : (
                      <p className="text-xs font-medium text-purple-300/70 italic">No upcoming leave</p>
                    )}
                  </div>
                </div>
              )}

              {/* 6. NOTIFICATION SUMMARY */}
              {notificationsLoading ? <CardSkeleton /> : notificationsError ? <CardError title="Notifications" onRetry={() => {}} /> : (
                <div 
                  onClick={() => navigate('/notifications')}
                  className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/25 flex flex-col justify-between cursor-pointer hover:border-purple-500/40 transition"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-pink-300">
                    <Bell className="w-3.5 h-3.5 text-amber-400" /> Notifications
                  </div>
                  <div className="my-1.5">
                    <p className="font-black text-sm text-white">
                      {unreadNotificationCount} unread
                    </p>
                    <span className="text-[10px] font-bold text-pink-300/80 hover:text-white flex items-center gap-1 mt-1">
                      View All &rarr;
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </Card>

        {/* MY DAY TIMELINE (FEATURE 6) */}
        <MyDayTimeline />

        {/* PERFORMANCE SNAPSHOT */}
        <PerformanceSnapshot
          employeeId={employeeData?.id || ''}
          employeeCode={employeeData?.employeeCode || ''}
          employeeName={employeeData?.name || 'Employee'}
          department={employeeData?.department || employeeData?.office || 'Operations'}
          tasks={tasks}
          attendanceRecords={attendanceRecords}
          leaves={allLeaves}
          isOnline={navigator.onLine}
        />

        {/* Your Work Pulse Snapshot Card */}
        <Card 
          className="p-4 bg-gradient-to-r from-[#2D1B5A] to-[#3B1F70] border border-pink-500/20 hover:border-pink-500/35 transition cursor-pointer relative overflow-hidden shadow-xl"
          onClick={() => setActiveView('workpulse')}
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-pink-500/5 rounded-full blur-xl pointer-events-none" />
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/15">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-pink-400" /> Your Work Pulse Snapshot
            </span>
            <span className="text-[10px] text-pink-300/80 font-bold hover:text-white transition flex items-center gap-1">
              Open Details <span className="text-pink-400">&rarr;</span>
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-[#211044]/90 p-2 rounded-xl border border-purple-500/10">
              <p className="text-[9px] text-purple-300/70 font-semibold mb-0.5">Attendance Rate</p>
              <p className="text-sm font-black text-pink-300">{attendancePercentage}%</p>
            </div>
            <div className="bg-[#211044]/90 p-2 rounded-xl border border-purple-500/10">
              <p className="text-[9px] text-purple-300/70 font-semibold mb-0.5">WFH Usage</p>
              <p className="text-sm font-black text-blue-300">{wfhDaysCount} / 2</p>
            </div>
            <div className="bg-[#211044]/90 p-2 rounded-xl border border-purple-500/10">
              <p className="text-[9px] text-purple-300/70 font-semibold mb-0.5">Performance</p>
              <p className="text-sm font-black text-emerald-400">
                {efficiencyResult.finalScore === -1 ? 'N/A' : `${efficiencyResult.finalScore}%`}
              </p>
            </div>
          </div>
        </Card>

        {/* Compact Leave Status Card */}
        <Card 
          className="p-4 bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/35 transition cursor-pointer relative overflow-hidden"
          onClick={() => navigate('/leave')}
        >
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/15">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-400" /> My Leave Status
            </span>
            <span className="text-[10px] text-purple-300/60 font-bold hover:text-white transition">
              Apply / History &rarr;
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Available Balance</p>
              <p className="text-sm font-black text-white">{leaveBalance.available} Days</p>
            </div>
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Pending Leave</p>
              <p className="text-sm font-black text-amber-400">{leaveBalance.pending} Days</p>
            </div>
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-[#10B981] font-semibold mb-0.5">Used Leave</p>
              <p className="text-sm font-black text-emerald-400">{leaveBalance.used} Days</p>
            </div>
          </div>
        </Card>

        {/* Quick Actions Grid */}
        <div>
          {showUnavailableMessage && (
            <div className="bg-rose-950/60 border border-rose-500/30 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-rose-200 mb-4 shadow-lg">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold text-white">Payslip Not Available Yet</p>
                <p className="text-purple-200/80 mt-1">Your salary record has not been generated by the administrator for any month yet.</p>
              </div>
            </div>
          )}
          <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider mb-3">
            Quick Actions
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action, idx) => (
              <button 
                key={idx}
                onClick={action.onClick}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/40 transition-all hover:scale-105 active:scale-95 shadow-lg group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 border ${action.bg}`}>
                  <action.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
                <span className="text-[11px] font-bold text-purple-100 text-center leading-tight">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Profile Card */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20">
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/15">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#A78BFA]" /> Profile Information
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {employeeData.status || 'Active'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Department</p>
              <p className="font-bold text-white">{employeeData.department || employeeData.office || 'Operations'}</p>
            </div>
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Designation</p>
              <p className="font-bold text-white">{employeeData.designation || 'Staff Executive'}</p>
            </div>
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
              <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Office Location</p>
              <p className="font-bold text-white">{employeeData.officeLocation || employeeData.workLocation || 'Raniganj HQ'}</p>
            </div>
            <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-purple-300/70 font-semibold">Registered Mobile</p>
                <p className="font-bold text-white">{employeeData.mobileNumber || 'N/A'}</p>
              </div>
              <PhoneCall className="w-4 h-4 text-purple-300/60" />
            </div>
          </div>
        </Card>

        {/* Announcements */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-[#A78BFA]" />
              Announcements
            </h2>
          </div>
          <div className="flex flex-col gap-2.5">
            {announcements.length > 0 ? (
              announcements.map((ann) => (
                <Card key={ann.id} className="p-3.5 bg-[#2D1B5A] border border-purple-500/20">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-xs text-white">{ann.title}</h3>
                    <span className="text-[10px] font-semibold text-purple-300 bg-[#211044] px-2 py-0.5 rounded-full border border-purple-500/20">
                      {new Date(ann.date).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-purple-200/90 leading-relaxed line-clamp-2">
                    {ann.content}
                  </p>
                </Card>
              ))
            ) : (
              <div className="text-center py-5 text-purple-300/70 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
                <p className="text-xs font-semibold">No recent announcements</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Notifications */}
        <div>
          <div className="flex justify-between items-center mb-2.5">
            <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="w-4 h-4 text-amber-400" />
              Recent Notifications
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {notifications.length > 0 ? (
              notifications.slice(0, 3).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3 p-3 bg-[#2D1B5A] rounded-2xl border border-purple-500/20">
                  <div className="w-2 h-2 rounded-full bg-[#7C3AED] mt-1.5 flex-shrink-0 shadow-[0_0_8px_#7C3AED]" />
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-white mb-0.5">{notif.title}</h3>
                    <p className="text-[11px] text-purple-200/80 leading-tight">{notif.message}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-purple-300/60">
                    {new Date(notif.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center py-5 text-purple-300/70 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
                <p className="text-xs font-semibold">No new notifications</p>
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

