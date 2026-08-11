import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
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
  MessageSquare
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
}

export const EmployeeDashboard: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaveBalance, setLeaveBalance] = useState({ available: 24, pending: 0, used: 0 });
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(null);
  const [showUnavailableMessage, setShowUnavailableMessage] = useState(false);

  // Personal Work Pulse States
  const [activeView, setActiveView] = useState<'dashboard' | 'workpulse'>('dashboard');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [allLeaves, setAllLeaves] = useState<any[]>([]);

  // Initialize data from local storage
  useEffect(() => {
    setAttendanceRecords(getStoredAttendanceRecords());
    setTasks(getStoredTasks());
    setExpenses(getStoredExpenseRecords());
    setAllLeaves(getStoredLeaves());
  }, []);

  // Real-time listener for Attendance
  useEffect(() => {
    if (!db || !employeeData?.employeeCode) return;
    const q = query(
      collection(db, 'attendance'),
      where('employeeId', '==', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
      setAttendanceRecords(list);
    }, (err) => {
      console.warn("Attendance snapshot error:", err);
    });
    return () => unsub();
  }, [employeeData]);

  // Real-time listener for Tasks
  useEffect(() => {
    if (!db || !employeeData?.employeeCode) return;
    const q = query(
      collection(db, 'tasks'),
      where('assignedToEmployeeCodes', 'array-contains', employeeData.employeeCode)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setTasks(list);
    }, (err) => {
      console.warn("Tasks snapshot error:", err);
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
    if (!db || !employeeData?.employeeCode) return;
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
    }, (err) => {
      console.warn("Leaves snapshot error:", err);
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
    if (!db) return;

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
        // Exclude pending, rejected, or suspended employees, or Super Admin/Admin
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
      where('recipientEmployeeCode', '==', employeeData?.employeeCode || ''),
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const unsubNotifications = onSnapshot(notificationsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(data);
    }, (error) => {
      console.error('Error fetching notifications:', error);
    });

    return () => {
      unsubAnnouncements();
      unsubNotifications();
    };
  }, []);

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
  // WORK PULSE CALCULATIONS
  // -------------------------------------------------------------------------
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`; // YYYY-MM
  const monthName = now.toLocaleString('default', { month: 'long' });

  // Today's attendance status & details
  const todayStr = getFormattedDateStr();
  const hasApprovedLeaveToday = allLeaves.some(l => 
    l.status === 'APPROVED' && 
    todayStr >= l.startDate && 
    todayStr <= l.endDate
  );

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
    // Past shift end check (6:00 PM is 18:00)
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

  // Expected working days up to today
  let expectedWorkingDays = 0;
  let actualAbsentDays = 0;

  for (let d = 1; d <= now.getDate(); d++) {
    const dateObj = new Date(currentYear, currentMonth, d);
    const dayOfWeek = dateObj.getDay();
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
    // Mon-Fri are working days
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

  // Tasks Summary
  const employeeId = employeeData.id || employeeData.employeeCode || '';
  const employeeCode = employeeData.employeeCode || '';
  const empTasks = tasks.filter(t => 
    (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(employeeCode)) ||
    (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(employeeId))
  );
  
  // Tasks specifically within the current month
  const currentMonthTasks = empTasks.filter(t => {
    const taskDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime.substring(0, 10));
    return taskDate.startsWith(currentMonthStr);
  });
  
  const assignedTasksCount = currentMonthTasks.length;
  const completedTasksCount = currentMonthTasks.filter(t => t.status === 'COMPLETED').length;

  // Expense Summary
  const currentMonthExpenses = expenses.filter(e => e.date && e.date.startsWith(currentMonthStr));
  const totalApprovedAmount = currentMonthExpenses.filter(e => e.status === 'APPROVED').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalPendingAmount = currentMonthExpenses.filter(e => e.status === 'PENDING').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalExpenseAmount = totalApprovedAmount + totalPendingAmount;

  // Efficiency / Performance calculation
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

  if (activeView === 'workpulse') {
    return (
      <div className="flex flex-col gap-5 pb-8 text-white min-h-screen">
        {/* Work Pulse Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveView('dashboard')} 
              className="p-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl hover:bg-[#3B2677] transition font-bold text-xs flex items-center gap-1.5 shadow-md"
            >
              &larr; Back
            </button>
            <div>
              <h1 className="text-xl font-black text-white leading-none flex items-center gap-2">
                <Activity className="w-5 h-5 text-pink-400" /> Your Work Pulse
              </h1>
              <p className="text-xs text-purple-300 mt-1">Here's your work snapshot, {employeeData.name || 'Employee'} 👋</p>
            </div>
          </div>
          <div className="bg-[#2D1B5A] border border-purple-500/20 px-3 py-1 rounded-full text-[10px] font-bold text-purple-200">
            {monthName} {currentYear}
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
            {/* Circular Progress & Present Days */}
            <div className="flex items-center gap-4 bg-[#211044] p-3 rounded-xl border border-purple-500/10">
              {/* SVG Ring */}
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

            {/* Other Status Days Row */}
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
          {/* Leave & WFH Usage Card */}
          <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3.5 border-b border-purple-500/15 pb-2">
              Leave & WFH Limits
            </span>
            <div className="flex flex-col gap-4">
              {/* WFH Progress */}
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

              {/* Client visits & Outdoor */}
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

          {/* Tasks & Expenses Card */}
          <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-300 block mb-3.5 border-b border-purple-500/15 pb-2">
              Tasks & Expense Status
            </span>
            <div className="flex flex-col gap-4">
              {/* Tasks Progress */}
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

              {/* Expense Tracker */}
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
    );
  }

  return (
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

      {/* Today Status Hero Banner */}
      <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-[#2D1B5A] via-[#35206A] to-[#211044] border border-purple-500/30 shadow-2xl">
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-[#7C3AED]/15 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300 flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Today's Overview
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">{todayDate}</h2>
          </div>
          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[#211044] border border-purple-500/30 text-purple-200">
            Shift End: 06:00 PM
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 relative z-10">
          <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/20">
            <p className="text-[11px] font-semibold text-purple-300/80 mb-1 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#10B981]" /> Check-In
            </p>
            <p className="font-black text-base text-white">
              {todayAttendance ? todayAttendance.checkInTime : 'Not Checked In'}
            </p>
            {todayAttendance && (
              <span className="inline-block text-[10px] font-extrabold text-[#10B981] mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {todayAttendance.checkInMode}
              </span>
            )}
          </div>

          <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/20">
            <p className="text-[11px] font-semibold text-purple-300/80 mb-1 flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-400" /> Check-Out
            </p>
            <p className="font-black text-base text-white">
              {todayAttendance?.checkOutTime || '--:--'}
            </p>
            {todayAttendance?.checkOutTime && todayAttendance?.checkOutMode && todayAttendance.checkOutMode !== 'N/A' && (
              <span className="inline-block text-[10px] font-extrabold text-amber-300 mt-1 bg-amber-500/10 px-2 py-0.5 rounded-md">
                {todayAttendance.checkOutMode}
              </span>
            )}
          </div>
        </div>
      </Card>

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
            notifications.map((notif) => (
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
  );
};
