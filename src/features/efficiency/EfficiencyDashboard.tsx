import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { Card } from '../../components/ui/Card';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Award, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  BarChart3, 
  Sliders, 
  Settings, 
  Download, 
  AlertCircle, 
  Check, 
  RotateCcw, 
  Search, 
  Users, 
  ChevronRight, 
  Sparkles, 
  Printer,
  ShieldAlert,
  HelpCircle,
  FileSpreadsheet,
  Activity,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { TaskRecord, getEffectiveTaskStatus } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { EfficiencyBreakdown, EfficiencyGrade, EfficiencySnapshot, EfficiencyWeightages } from '../../types/efficiency';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES, getSavedWeightages, saveWeightages, getEfficiencySnapshots, saveEfficiencySnapshot } from '../../services/efficiency/efficiencyService';
import { getRecordWorkingMinutes, formatMinutesToDuration, calculateMonthlySummary } from '../../utils/workHoursCalc';
import { isAttendanceCheckoutUnresolved } from '../../utils/attendanceUtils';

interface EfficiencyDashboardProps {
  customEmployeeCode?: string; // Admin or TL can pass this to inspect a specific employee
  embedded?: boolean; // True when showing inside Admin/TL panels
}

let effDashMountCount = 0;
let effDashRenderCount = 0;
let effDashEffectCount = 0;
let activeListeners = 0;

export const EfficiencyDashboard: React.FC<EfficiencyDashboardProps> = ({ 
  customEmployeeCode,
  embedded = false
}) => {
  const mountTimeRef = React.useRef(performance.now());
  effDashRenderCount++;

  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

  // Active role detection
  const isAdmin = Boolean(adminUser);
  const isTeamLeader = Boolean(employeeData?.isTeamLeader) || employeeData?.role === 'TEAM_LEADER';
  const activeEmployeeCode = employeeData?.employeeCode || '';
  const activeEmployeeId = employeeData?.id || '';

  // Selected Employee Code
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string>(customEmployeeCode || activeEmployeeCode);

  useEffect(() => {
    effDashMountCount++;
    console.log(`[EFFICIENCY_PERF_START] Component mount #${effDashMountCount} embedded=${embedded} activeEmpCode="${activeEmployeeCode}" activeEmpId="${activeEmployeeId}" isAdmin=${isAdmin} isTeamLeader=${isTeamLeader} selectedEmpCode="${selectedEmployeeCode}"`);
  }, []);

  useEffect(() => {
    if (customEmployeeCode) {
      setSelectedEmployeeCode(customEmployeeCode);
    }
  }, [customEmployeeCode]);

  // Main View Mode: 'MY_PERFORMANCE' | 'MY_TEAM_PERFORMANCE' | 'SETTINGS'
  const [viewMode, setViewMode] = useState<'MY_PERFORMANCE' | 'MY_TEAM_PERFORMANCE' | 'SETTINGS'>(() => {
    return isTeamLeader && !customEmployeeCode ? 'MY_PERFORMANCE' : 'MY_PERFORMANCE';
  });

  // Main UI State
  const { tasks: syncTasks = [], attendance: syncAttendance = [] } = useRealtimeSync();

  const [tasks, setTasks] = useState<TaskRecord[]>(() => {
    return (!customEmployeeCode || customEmployeeCode === activeEmployeeCode) ? syncTasks : [];
  });
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => {
    return (!customEmployeeCode || customEmployeeCode === activeEmployeeCode) ? syncAttendance : [];
  });
  const [allEmployees, setAllEmployees] = useState<any[]>(() => employeeData ? [employeeData] : []);
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<EfficiencySnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);

  // Report generation state
  const [reportState, setReportState] = useState<'idle' | 'preparing' | 'success' | 'failure'>('idle');
  const [reportError, setReportError] = useState<string | null>(null);

  // Period Selection: THIS_WEEK | THIS_MONTH | PREVIOUS_MONTH | CUSTOM
  type PeriodFilterType = 'THIS_WEEK' | 'THIS_MONTH' | 'PREVIOUS_MONTH' | 'CUSTOM';
  const [periodFilter, setPeriodFilter] = useState<PeriodFilterType>('THIS_MONTH');

  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });

  // Dates Calculation based on period selection
  const { startDate, endDate, prevStartDate, prevEndDate, periodLabel } = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);

    let start = '';
    let end = todayStr;
    let prevStart = '';
    let prevEnd = '';
    let label = 'This Month';

    if (periodFilter === 'THIS_WEEK') {
      label = 'This Week';
      const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon...
      const distToMon = (dayOfWeek + 6) % 7;
      const mon = new Date(today);
      mon.setDate(today.getDate() - distToMon);
      start = mon.toISOString().substring(0, 10);
      end = todayStr;

      // Previous Week
      const prevMon = new Date(mon);
      prevMon.setDate(mon.getDate() - 7);
      prevStart = prevMon.toISOString().substring(0, 10);

      const prevSun = new Date(mon);
      prevSun.setDate(mon.getDate() - 1);
      prevEnd = prevSun.toISOString().substring(0, 10);
    } else if (periodFilter === 'THIS_MONTH') {
      label = 'This Month';
      const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start = mStart.toISOString().substring(0, 10);
      end = todayStr;

      // Previous Month
      const pmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prevStart = pmStart.toISOString().substring(0, 10);

      const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      prevEnd = pmEnd.toISOString().substring(0, 10);
    } else if (periodFilter === 'PREVIOUS_MONTH') {
      label = 'Previous Month';
      const pmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      start = pmStart.toISOString().substring(0, 10);

      const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      end = pmEnd.toISOString().substring(0, 10);

      // Two Months Ago
      const p2mStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      prevStart = p2mStart.toISOString().substring(0, 10);

      const p2mEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
      prevEnd = p2mEnd.toISOString().substring(0, 10);
    } else {
      label = 'Custom Period';
      start = customStartDate;
      end = customEndDate;

      try {
        const diffMs = new Date(end).getTime() - new Date(start).getTime();
        const durationDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        const pd1 = new Date(start);
        pd1.setDate(pd1.getDate() - durationDays);
        prevStart = pd1.toISOString().substring(0, 10);

        const pd2 = new Date(start);
        pd2.setDate(pd2.getDate() - 1);
        prevEnd = pd2.toISOString().substring(0, 10);
      } catch (err) {
        prevStart = start;
        prevEnd = end;
      }
    }

    return { startDate: start, endDate: end, prevStartDate: prevStart, prevEndDate: prevEnd, periodLabel: label };
  }, [periodFilter, customStartDate, customEndDate]);

  // Administration State
  const [adminWeights, setAdminWeights] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsSuccess, setWeightsSuccess] = useState(false);

  // ----------------------------------------------------
  // TARGET EMPLOYEE IDENTITY RESOLUTION
  // ----------------------------------------------------
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeCode) return employeeData || null;
    return allEmployees.find(e => 
      e.employeeCode === selectedEmployeeCode || 
      e.id === selectedEmployeeCode || 
      e.uid === selectedEmployeeCode
    ) || (selectedEmployeeCode === activeEmployeeCode ? employeeData : null);
  }, [allEmployees, selectedEmployeeCode, activeEmployeeCode, employeeData]);

  // Fallback Rule: IF selected employee exists THEN use selected employee. ELSE use current logged-in employee.
  const targetEmpCode = selectedEmployee?.employeeCode || selectedEmployeeCode || activeEmployeeCode;
  const targetEmpId = selectedEmployee?.id || selectedEmployee?.uid || targetEmpCode || activeEmployeeId;

  // Sync tasks and attendance when selecting the active logged-in employee
  useEffect(() => {
    if (targetEmpCode === activeEmployeeCode && !isAdmin && !isTeamLeader) {
      setTasks(syncTasks);
      setAttendance(syncAttendance);
    }
  }, [syncTasks, syncAttendance, targetEmpCode, activeEmployeeCode, isAdmin, isTeamLeader]);

  // Firestore Subscriptions
  useEffect(() => {
    effDashEffectCount++;
    activeListeners++;

    if (!db) {
      setOfflineMode(true);
      setLoading(false);
      return;
    }

    getSavedWeightages().then(w => {
      setWeightages(w);
      setAdminWeights(w);
    });

    const targetCode = targetEmpCode;
    const targetId = targetEmpId;

    if (!targetCode) {
      setLoading(false);
      return;
    }

    const unsubs: (() => void)[] = [];

    // 1. REGISTRATIONS LISTENER (Background view for Admin / Team Leader only, non-blocking)
    if (isAdmin || isTeamLeader) {
      const unsubRegs = onSnapshot(collection(db, 'registrations'), (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllEmployees(list);
      }, (err) => {
        console.warn('[EFFICIENCY_FIRESTORE_ERROR] path=registrations notice:', err);
      });
      unsubs.push(unsubRegs);
    } else if (employeeData) {
      setAllEmployees([employeeData]);
    }

    // 2. UNIFIED TASKS & ATTENDANCE LISTENERS FOR ADMINS & TEAM LEADERS
    if (isAdmin || isTeamLeader) {
      setLoading(true);

      const unsubTasks = onSnapshot(collection(db, 'tasks'), (snap) => {
        const list: TaskRecord[] = [];
        snap.docs.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() } as TaskRecord);
        });
        setTasks(list);
        setLoading(false);
      }, (err) => {
        console.warn('[EFFICIENCY_FIRESTORE_ERROR] path=tasks notice:', err);
        setLoading(false);
      });
      unsubs.push(unsubTasks);

      const unsubAtt = onSnapshot(collection(db, 'attendance'), (snap) => {
        const list: AttendanceRecord[] = [];
        snap.docs.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
        });
        setAttendance(list);
        setLoading(false);
      }, (err) => {
        console.warn('[EFFICIENCY_FIRESTORE_ERROR] path=attendance notice:', err);
        setLoading(false);
      });
      unsubs.push(unsubAtt);
    } else {
      // If we are inspecting ourselves as a standard employee, our local sync hook does the work
      setLoading(false);
    }

    return () => {
      activeListeners--;
      unsubs.forEach(unsub => unsub());
    };
  }, [targetEmpCode, targetEmpId, activeEmployeeCode, isAdmin, isTeamLeader]);

  // Fetch snapshots
  useEffect(() => {
    if (targetEmpCode) {
      getEfficiencySnapshots(targetEmpCode).then(snaps => {
        setHistoricalSnapshots(snaps);
      });
    }
  }, [targetEmpCode]);

  // Authorized Employees Filter (Privacy Enforced)
  const myTeamMembers = useMemo(() => {
    if (!isTeamLeader) return [];
    return allEmployees.filter(e => 
      e.status === 'Approved' && 
      (e.teamLeaderCode === activeEmployeeCode || e.teamLeaderId === activeEmployeeId || e.teamLeaderCode === activeEmployeeId)
    );
  }, [allEmployees, isTeamLeader, activeEmployeeCode, activeEmployeeId]);

  const authorizedEmployees = useMemo(() => {
    if (isAdmin) {
      return allEmployees.filter(e => e.status === 'Approved');
    }
    if (isTeamLeader) {
      return [
        ...allEmployees.filter(e => e.employeeCode === activeEmployeeCode),
        ...myTeamMembers
      ];
    }
    return allEmployees.filter(e => e.employeeCode === activeEmployeeCode);
  }, [allEmployees, isAdmin, isTeamLeader, activeEmployeeCode, myTeamMembers]);

  // ----------------------------------------------------
  // WORK HOURS COMPUTATION (Respecting Unresolved Checkouts)
  // ----------------------------------------------------
  const selectedEmployeeAttendance = useMemo(() => {
    if (!targetEmpCode) return [];
    return attendance.filter(r => {
      const matchCode = r.employeeCode && (r.employeeCode === targetEmpCode || r.employeeCode === targetEmpId);
      const matchId = r.employeeId && (r.employeeId === targetEmpCode || r.employeeId === targetEmpId);
      const isEmp = matchCode || matchId;
      return isEmp && r.date >= startDate && r.date <= endDate;
    });
  }, [attendance, targetEmpCode, targetEmpId, startDate, endDate]);

  const workHoursMetrics = useMemo(() => {
    let totalMinutes = 0;
    let daysWithWork = 0;
    let unresolvedCount = 0;

    selectedEmployeeAttendance.forEach(rec => {
      if (isAttendanceCheckoutUnresolved(rec) || rec.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
        unresolvedCount++;
      } else {
        const mins = getRecordWorkingMinutes(rec);
        if (mins > 0) {
          totalMinutes += mins;
          daysWithWork++;
        }
      }
    });

    const avgMinutesPerDay = daysWithWork > 0 ? Math.round(totalMinutes / daysWithWork) : 0;

    // Monthly Work Hours for current calendar month
    const today = new Date();
    const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const monthlySummary = calculateMonthlySummary(
      attendance.filter(r => {
        const matchCode = r.employeeCode && (r.employeeCode === targetEmpCode || r.employeeCode === targetEmpId);
        const matchId = r.employeeId && (r.employeeId === targetEmpCode || r.employeeId === targetEmpId);
        return matchCode || matchId;
      }),
      currentMonthPrefix
    );

    return {
      totalFormatted: formatMinutesToDuration(totalMinutes),
      totalMinutes,
      avgFormatted: formatMinutesToDuration(avgMinutesPerDay),
      daysWithWork,
      unresolvedCount,
      monthlyTotalFormatted: formatMinutesToDuration(monthlySummary.totalMinutes)
    };
  }, [selectedEmployeeAttendance, attendance, targetEmpCode, targetEmpId]);

  // ----------------------------------------------------
  // EFFICIENCY COMPUTATIONS
  // ----------------------------------------------------
  const currentCalculation = useMemo(() => {
    if (!targetEmpCode) return null;
    const emp = selectedEmployee || {
      id: targetEmpId,
      employeeCode: targetEmpCode,
      name: targetEmpCode,
      department: 'Operations',
      teamLeaderId: null
    };

    const calcResult = calculateEfficiency(
      emp.id || targetEmpId,
      emp.employeeCode || targetEmpCode,
      emp.name || emp.employeeCode || 'Employee',
      emp.department || 'Operations',
      emp.teamLeaderId || null,
      startDate,
      endDate,
      tasks,
      attendance,
      weightages
    );

    // Filter attendance records in the period to print detailed logs
    const filteredAttendance = attendance.filter(r => {
      const matchCode = r.employeeCode && (r.employeeCode === targetEmpCode || r.employeeCode === targetEmpId);
      const matchId = r.employeeId && (r.employeeId === targetEmpCode || r.employeeId === targetEmpId);
      const isEmp = matchCode || matchId;
      return isEmp && r.date >= startDate && r.date <= endDate;
    });

    // Filter tasks in the period to print detailed logs
    const filteredTasks = tasks.filter(t => {
      const matchCode = t.assignedToEmployeeCodes && (
        t.assignedToEmployeeCodes.includes(targetEmpCode) ||
        (targetEmpId && t.assignedToEmployeeCodes.includes(targetEmpId))
      );
      const matchId = t.assignedToEmployeeIds && (
        t.assignedToEmployeeIds.includes(targetEmpCode) ||
        (targetEmpId && t.assignedToEmployeeIds.includes(targetEmpId))
      );
      const isAssigned = matchCode || matchId;
      if (!isAssigned) return false;
      const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : '');
      return tDate >= startDate && tDate <= endDate;
    });

    console.log(`[EFFICIENCY_DIAGNOSTIC_COMPARE]
- Mode: ${targetEmpCode === activeEmployeeCode ? "EMPLOYEE_DEVICE" : "TEAM_LEADER_INDIVIDUAL"}
- Selected Employee Code: ${targetEmpCode}
- Selected Employee ID: ${targetEmpId}
- Date Range: ${startDate} to ${endDate}
- Raw Attendance Count (before filtering): ${attendance.length}
- Filtered Attendance Count (within date range): ${filteredAttendance.length}
- Raw Tasks Count (before filtering): ${tasks.length}
- Filtered Tasks Count (within date range): ${filteredTasks.length}
- Work Hours Calculated: ${calcResult.breakdown.validCheckOutsCount > 0 ? calcResult.breakdown.validCheckOutsCount : 0} checkout logs
- Final Efficiency Score (%): ${calcResult.finalScore}%
- Component Scores:
  * Task Completion Score: ${calcResult.breakdown.taskCompletionScore}% (assigned: ${calcResult.breakdown.assignedTasksCount}, completed: ${calcResult.breakdown.completedTasksCount})
  * On-Time Completion Score: ${calcResult.breakdown.onTimeCompletionScore}% (on-time: ${calcResult.breakdown.onTimeTasksCount})
  * Quality Score: ${calcResult.breakdown.qualityScore}% (revisions: ${calcResult.breakdown.totalRevisionRequests})
  * Punctuality Score: ${calcResult.breakdown.punctualityScore}% (attendance: ${calcResult.breakdown.attendanceDaysCount}, late: ${calcResult.breakdown.lateArrivalsCount})
  * Workload Score: ${calcResult.breakdown.workloadScore}% (overdue: ${calcResult.breakdown.overdueTasksCount})
`);

    return calcResult;
  }, [selectedEmployee, targetEmpCode, targetEmpId, startDate, endDate, tasks, attendance, weightages]);

  const previousCalculation = useMemo(() => {
    if (!targetEmpCode) return null;
    const emp = selectedEmployee || {
      id: targetEmpId,
      employeeCode: targetEmpCode,
      name: targetEmpCode,
      department: 'Operations',
      teamLeaderId: null
    };

    return calculateEfficiency(
      emp.id || targetEmpId,
      emp.employeeCode || targetEmpCode,
      emp.name || emp.employeeCode || 'Employee',
      emp.department || 'Operations',
      emp.teamLeaderId || null,
      prevStartDate,
      prevEndDate,
      tasks,
      attendance,
      weightages
    );
  }, [selectedEmployee, targetEmpCode, targetEmpId, prevStartDate, prevEndDate, tasks, attendance, weightages]);

  // Leaderboard Ranking
  const companyLeaderboard = useMemo(() => {
    const list = (isAdmin ? allEmployees : authorizedEmployees).filter(e => e.status === 'Approved');
    return list.map(emp => {
      const calc = calculateEfficiency(
        emp.id || emp.employeeCode,
        emp.employeeCode,
        emp.name || 'Employee',
        emp.department || 'Operations',
        emp.teamLeaderId || null,
        startDate,
        endDate,
        tasks,
        attendance,
        weightages
      );
      return {
        employee: emp,
        score: calc.finalScore,
        grade: calc.grade,
        breakdown: calc.breakdown
      };
    }).sort((a, b) => b.score - a.score);
  }, [isAdmin, allEmployees, authorizedEmployees, startDate, endDate, tasks, attendance, weightages]);

  const currentRank = useMemo(() => {
    if (!targetEmpCode || !companyLeaderboard.length) return null;
    const idx = companyLeaderboard.findIndex(i => i.employee.employeeCode === targetEmpCode || i.employee.id === targetEmpId);
    return idx !== -1 ? idx + 1 : null;
  }, [companyLeaderboard, targetEmpCode, targetEmpId]);

  // Monthly Comparison Stats
  const monthlyComparisonStats = useMemo(() => {
    if (!currentCalculation) return null;
    const currScore = currentCalculation.finalScore;
    const prevScore = previousCalculation ? previousCalculation.finalScore : currScore;
    const diff = currScore - prevScore;
    
    let pctImprovement = 0;
    if (prevScore > 0) {
      pctImprovement = Math.round(((currScore - prevScore) / prevScore) * 100);
    } else if (currScore > 0) {
      pctImprovement = 100;
    }

    // Neutral wording logic strictly: Improved, Stable, Needs Attention
    let statusWording: 'Improved' | 'Stable' | 'Needs Attention' = 'Stable';
    if (diff >= 3) statusWording = 'Improved';
    else if (diff <= -3) statusWording = 'Needs Attention';

    return {
      currScore,
      prevScore,
      diff,
      pctImprovement,
      statusWording
    };
  }, [currentCalculation, previousCalculation]);

  // Task Breakdown Counts
  const periodTasks = useMemo(() => {
    if (!targetEmpCode) return [];
    return tasks.filter(t => {
      const matchCode = t.assignedToEmployeeCodes && (
        t.assignedToEmployeeCodes.includes(targetEmpCode) ||
        (targetEmpId && t.assignedToEmployeeCodes.includes(targetEmpId))
      );
      const matchId = t.assignedToEmployeeIds && (
        t.assignedToEmployeeIds.includes(targetEmpCode) ||
        (targetEmpId && t.assignedToEmployeeIds.includes(targetEmpId))
      );
      const isAssigned = matchCode || matchId;
      if (!isAssigned) return false;
      const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : '');
      return tDate >= startDate && tDate <= endDate;
    });
  }, [tasks, targetEmpCode, targetEmpId, startDate, endDate]);

  const taskMetrics = useMemo(() => {
    const assigned = periodTasks.length;
    const completed = periodTasks.filter(t => getEffectiveTaskStatus(t) === 'Completed').length;
    const overdue = periodTasks.filter(t => getEffectiveTaskStatus(t) === 'Overdue').length;
    const pending = periodTasks.filter(t => {
      const s = getEffectiveTaskStatus(t);
      return s === 'Assigned' || s === 'In Progress' || s === 'Submitted' || s === 'Revision Requested';
    }).length;

    const revisionRequestsCount = periodTasks.reduce((sum, t) => sum + (t.revisionCount || t.revisions?.length || 0), 0);

    return {
      assigned,
      completed,
      overdue,
      pending,
      revisionRequestsCount
    };
  }, [periodTasks]);

  // ----------------------------------------------------
  // TEAM LEADER METRICS SUMMARY
  // ----------------------------------------------------
  const teamMetricsSummary = useMemo(() => {
    if (!myTeamMembers.length) return null;

    let totalTeamScore = 0;
    let totalTeamWorkMins = 0;
    let totalTeamAssigned = 0;
    let totalTeamCompleted = 0;
    let totalTeamOverdue = 0;
    let totalTeamRevisions = 0;
    let totalLateCheckIns = 0;
    let totalAttDays = 0;

    const memberBreakdowns = myTeamMembers.map(member => {
      const mCode = member.employeeCode;
      
      // Efficiency
      const calc = calculateEfficiency(
        member.id || mCode,
        mCode,
        member.name || 'Team Member',
        member.department || 'Operations',
        activeEmployeeCode,
        startDate,
        endDate,
        tasks,
        attendance,
        weightages
      );

      // Work hours
      const mAtt = attendance.filter(r => (r.employeeId === mCode || r.employeeCode === mCode) && r.date >= startDate && r.date <= endDate);
      let mWorkMins = 0;
      let mUnresolved = 0;
      let mLate = 0;

      mAtt.forEach(r => {
        if (isAttendanceCheckoutUnresolved(r)) {
          mUnresolved++;
        } else {
          mWorkMins += getRecordWorkingMinutes(r);
        }
        if (r.checkInTime) {
          // Late arrival check
          const timeParts = r.checkInTime.split(' ');
          if (timeParts.length >= 2) {
            const [h, m] = timeParts[0].split(':').map(Number);
            const isPM = timeParts[1].toUpperCase() === 'PM';
            let hour = h;
            if (isPM && hour < 12) hour += 12;
            if (!isPM && hour === 12) hour = 0;
            if (hour * 60 + m > 9 * 60 + 30) mLate++;
          }
        }
      });

      // Tasks
      const mTasks = tasks.filter(t => {
        const isA = (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(mCode)) ||
                    (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(mCode));
        if (!isA) return false;
        const d = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : '');
        return d >= startDate && d <= endDate;
      });

      const mComp = mTasks.filter(t => getEffectiveTaskStatus(t) === 'Completed').length;
      const mOverdue = mTasks.filter(t => getEffectiveTaskStatus(t) === 'Overdue').length;
      const mRevs = mTasks.reduce((s, t) => s + (t.revisionCount || t.revisions?.length || 0), 0);

      totalTeamScore += calc.finalScore;
      totalTeamWorkMins += mWorkMins;
      totalTeamAssigned += mTasks.length;
      totalTeamCompleted += mComp;
      totalTeamOverdue += mOverdue;
      totalTeamRevisions += mRevs;
      totalLateCheckIns += mLate;
      totalAttDays += mAtt.length;

      return {
        member,
        score: calc.finalScore,
        grade: calc.grade,
        workHoursFormatted: formatMinutesToDuration(mWorkMins),
        unresolvedCount: mUnresolved,
        tasksAssigned: mTasks.length,
        tasksCompleted: mComp,
        overdueTasks: mOverdue,
        revisions: mRevs,
        lateArrivals: mLate,
        attendanceDays: mAtt.length
      };
    }).sort((a, b) => b.score - a.score);

    const avgTeamScore = Math.round(totalTeamScore / myTeamMembers.length);
    const teamPunctualityPct = totalAttDays > 0 ? Math.round(((totalAttDays - totalLateCheckIns) / totalAttDays) * 100) : 100;

    return {
      avgTeamScore,
      totalTeamWorkHoursFormatted: formatMinutesToDuration(totalTeamWorkMins),
      totalTeamAssigned,
      totalTeamCompleted,
      totalTeamOverdue,
      totalTeamRevisions,
      teamPunctualityPct,
      memberBreakdowns
    };
  }, [myTeamMembers, activeEmployeeCode, startDate, endDate, tasks, attendance, weightages]);

  // Handle Save Snapshot
  const handleSaveSnapshot = async () => {
    if (!currentCalculation || !selectedEmployeeCode) return;
    const emp = selectedEmployee || {
      id: selectedEmployeeCode,
      employeeCode: selectedEmployeeCode,
      name: selectedEmployeeCode,
      department: 'Operations',
      teamLeaderId: null
    };

    const snapshot: EfficiencySnapshot = {
      employeeId: emp.id || emp.employeeCode,
      employeeCode: emp.employeeCode,
      employeeName: emp.name || 'Employee',
      department: emp.department || 'Operations',
      teamLeaderId: emp.teamLeaderId || null,
      teamLeaderCode: emp.teamLeaderCode || null,
      teamLeaderName: emp.teamLeaderName || null,
      
      periodStart: startDate,
      periodEnd: endDate,
      periodType: periodFilter === 'THIS_WEEK' ? 'WEEKLY' : periodFilter === 'THIS_MONTH' ? 'MONTHLY' : 'CUSTOM',
      
      taskCompletionScore: currentCalculation.breakdown.taskCompletionScore,
      onTimeCompletionScore: currentCalculation.breakdown.onTimeCompletionScore,
      qualityScore: currentCalculation.breakdown.qualityScore,
      punctualityScore: currentCalculation.breakdown.punctualityScore,
      workloadScore: currentCalculation.breakdown.workloadScore,
      
      overduePenalty: currentCalculation.breakdown.overduePenalty,
      revisionPenalty: currentCalculation.breakdown.revisionPenalty,
      
      finalScore: currentCalculation.finalScore,
      grade: currentCalculation.grade,
      
      weightagesUsed: weightages,
      breakdown: currentCalculation.breakdown,
      calculatedAtDeviceTime: new Date().toISOString(),
      serverSyncTime: null
    };

    try {
      await saveEfficiencySnapshot(snapshot);
      const snaps = await getEfficiencySnapshots(selectedEmployeeCode);
      setHistoricalSnapshots(snaps);
      alert('Efficiency snapshot saved successfully!');
    } catch (err) {
      alert('Saved locally. Will sync when online.');
    }
  };

  // Administration Weightages Submit
  const handleSaveWeightages = async (e: React.FormEvent) => {
    e.preventDefault();
    setWeightsError(null);
    setWeightsSuccess(false);

    const total = adminWeights.taskCompletion + 
                  adminWeights.onTimeCompletion + 
                  adminWeights.quality + 
                  adminWeights.punctuality + 
                  adminWeights.workload;

    if (total !== 100) {
      setWeightsError('Efficiency weightages must total exactly 100%.');
      return;
    }

    try {
      await saveWeightages(
        adminWeights, 
        adminUser?.uid || employeeData?.id || 'ADMIN', 
        adminUser?.email || employeeData?.name || 'Administrator'
      );
      setWeightages(adminWeights);
      setWeightsSuccess(true);
      setTimeout(() => setWeightsSuccess(false), 3000);
    } catch (err) {
      setWeightsError(err instanceof Error ? err.message : 'Failed to save weightages.');
    }
  };

  // Export PDF Dossier
  const handleExportPDF = () => {
    if (!currentCalculation || !selectedEmployeeCode) return;
    setReportState('preparing');

    setTimeout(() => {
      try {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const primaryColor = [33, 16, 68];
        const accentColor = [124, 58, 237];

        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(15, 15, 180, 24, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Office Management System', 22, 26);

        doc.setFontSize(8);
        doc.setTextColor(200, 180, 255);
        doc.text('EMPLOYEE PERFORMANCE DOSSIER', 22, 32);

        doc.text(`Period: ${startDate} to ${endDate}`, 140, 26);
        doc.text(`Employee Code: ${selectedEmployeeCode}`, 140, 32);

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(10);
        doc.text(`Employee: ${selectedEmployee?.name || selectedEmployeeCode}`, 15, 48);
        doc.text(`Department: ${selectedEmployee?.department || 'Operations'}`, 15, 54);
        doc.text(`Overall Efficiency Score: ${currentCalculation.finalScore}% (${currentCalculation.grade})`, 15, 60);

        doc.text(`Total Work Hours: ${workHoursMetrics.totalFormatted}`, 15, 70);
        doc.text(`Tasks Completed: ${taskMetrics.completed} / ${taskMetrics.assigned}`, 15, 76);
        doc.text(`Overdue Tasks: ${taskMetrics.overdue}`, 15, 82);
        doc.text(`Revision Requests: ${taskMetrics.revisionRequestsCount}`, 15, 88);

        doc.save(`Performance_Report_${selectedEmployeeCode}_${startDate}.pdf`);
        setReportState('success');
        setTimeout(() => setReportState('idle'), 3000);
      } catch (err) {
        setReportError('Failed to generate PDF report.');
        setReportState('failure');
      }
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white space-y-3 font-sans">
        <Sparkles className="w-10 h-10 text-[#18C98F] animate-spin" />
        <p className="text-sm font-bold text-[#B7C0BC] animate-pulse">
          Loading Performance Intelligence...
        </p>
      </div>
    );
  }

  const bd = currentCalculation ? currentCalculation.breakdown : null;

  const renderElapsedMs = Math.round((performance.now() - mountTimeRef.current) * 100) / 100;
  console.log(`[EFFICIENCY_RENDER] #${effDashRenderCount} elapsedSinceMount=${renderElapsedMs}ms loading=${loading} tasksCount=${tasks.length} attCount=${attendance.length} empsCount=${allEmployees.length} viewMode=${viewMode} period=${periodFilter} selectedEmp=${selectedEmployeeCode}`);

  return (
    <div className="space-y-6 font-sans text-white pb-12 max-w-7xl mx-auto">
      
      {/* HEADER BAR */}
      <div className="bg-[#171B1E] border border-[#3A4148] rounded-3xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#18C98F]/20 border border-[#18C98F]/30 flex items-center justify-center text-[#18C98F]">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-white tracking-wide uppercase">
              EMPLOYEE PERFORMANCE DASHBOARD
            </h1>
          </div>
          <p className="text-xs text-[#7E8985] mt-1 font-medium">
            Office Management System Real-time Efficiency & Work Analytics Engine
          </p>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* VIEW TOGGLE FOR TEAM LEADERS & ADMINS */}
          {(isTeamLeader || isAdmin) && (
            <div className="bg-[#111417] p-1 rounded-2xl border border-[#3A4148] flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewMode('MY_PERFORMANCE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  viewMode === 'MY_PERFORMANCE'
                    ? 'bg-[#18C98F] text-[#0B0D0F] shadow-md'
                    : 'text-[#B7C0BC] hover:text-white'
                }`}
              >
                Individual
              </button>
              {isTeamLeader && (
                <button
                  type="button"
                  onClick={() => setViewMode('MY_TEAM_PERFORMANCE')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                    viewMode === 'MY_TEAM_PERFORMANCE'
                      ? 'bg-[#18C98F] text-[#0B0D0F] shadow-md'
                      : 'text-[#B7C0BC] hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  My Team
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setViewMode('SETTINGS')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                    viewMode === 'SETTINGS'
                      ? 'bg-[#18C98F] text-[#0B0D0F] shadow-md'
                      : 'text-[#B7C0BC] hover:text-white'
                  }`}
                  title="Weightage Settings"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* EMPLOYEE SELECTOR (If Admin or Team Leader) */}
          {(isAdmin || (isTeamLeader && viewMode === 'MY_PERFORMANCE')) && authorizedEmployees.length > 1 && (
            <div className="relative">
              <select
                value={selectedEmployeeCode}
                onChange={(e) => setSelectedEmployeeCode(e.target.value)}
                className="bg-[#111417] text-white text-xs font-bold px-3 py-2 rounded-2xl border border-[#3A4148] focus:outline-none focus:border-[#18C98F] cursor-pointer pr-8"
              >
                {authorizedEmployees.map(emp => (
                  <option key={emp.employeeCode} value={emp.employeeCode} className="bg-[#171B1E]">
                    {emp.name} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PERIOD FILTER SELECTOR */}
          <div className="bg-[#111417] p-1 rounded-2xl border border-[#3A4148] flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setPeriodFilter('THIS_WEEK')}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition-all ${
                periodFilter === 'THIS_WEEK' ? 'bg-[#18C98F] text-[#0B0D0F]' : 'text-[#B7C0BC] hover:text-white'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setPeriodFilter('THIS_MONTH')}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition-all ${
                periodFilter === 'THIS_MONTH' ? 'bg-[#18C98F] text-[#0B0D0F]' : 'text-[#B7C0BC] hover:text-white'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setPeriodFilter('PREVIOUS_MONTH')}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition-all ${
                periodFilter === 'PREVIOUS_MONTH' ? 'bg-[#18C98F] text-[#0B0D0F]' : 'text-[#B7C0BC] hover:text-white'
              }`}
            >
              Prev Month
            </button>
          </div>

          {/* EXPORT BUTTON */}
          <button
            type="button"
            onClick={handleExportPDF}
            className="px-3 py-2 rounded-2xl bg-[#1D2226] hover:bg-[#3A4148] border border-[#3A4148] text-[#B7C0BC] text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95"
            title="Download Performance Report"
          >
            <Download className="w-3.5 h-3.5 text-[#18C98F]" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* CUSTOM DATE RANGE PICKER (If selected) */}
      {periodFilter === 'CUSTOM' && (
        <div className="bg-[#171B1E] p-3.5 rounded-2xl border border-[#3A4148] flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[#7E8985] font-bold">Start:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-[#111417] text-white px-2.5 py-1 rounded-xl border border-[#3A4148] font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#7E8985] font-bold">End:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-[#111417] text-white px-2.5 py-1 rounded-xl border border-[#3A4148] font-mono"
            />
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW 1: MY PERFORMANCE (INDIVIDUAL VIEW) */}
      {/* ==================================================== */}
      {viewMode === 'MY_PERFORMANCE' && (
        <>
          {/* EMPTY DATA STATE NOTICE */}
          {!loading && taskMetrics.assigned === 0 && workHoursMetrics.daysWithWork === 0 && (
            <div className="bg-[#171B1E] border border-amber-500/30 rounded-2xl p-4 flex items-center gap-3 text-amber-300 text-xs shadow-md">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400" />
              <div>
                <p className="font-bold text-amber-300">No Efficiency Data Available For Selected Period</p>
                <p className="text-[11px] text-[#B7C0BC] mt-0.5">
                  {selectedEmployee?.name || targetEmpCode} ({targetEmpCode}) has no recorded attendance or task activity for {periodLabel}.
                </p>
              </div>
            </div>
          )}

          {/* TOP SUMMARY GRID (12 CORE METRICS) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            
            {/* 1. Overall Efficiency Score */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-md">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Efficiency</span>
                <Sparkles className="w-3.5 h-3.5 text-[#18C98F]" />
              </div>
              <div className="my-2">
                <p className="text-2xl font-black text-white leading-none">
                  {currentCalculation ? `${currentCalculation.finalScore}%` : 'N/A'}
                </p>
                <p className="text-[10px] font-bold text-amber-400 mt-1">
                  Grade: {currentCalculation ? currentCalculation.grade : 'N/A'}
                </p>
              </div>
              <p className="text-[9px] text-[#7E8985] font-mono">
                {currentRank ? `Rank #${currentRank} in company` : 'Standard Rating'}
              </p>
            </div>

            {/* 2. Total Work Hours */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Work Hours</span>
                <Clock className="w-3.5 h-3.5 text-[#18C98F]" />
              </div>
              <div className="my-2">
                <p className="text-xl font-black text-white leading-none">
                  {workHoursMetrics.totalFormatted}
                </p>
                {workHoursMetrics.unresolvedCount > 0 && (
                  <p className="text-[9px] font-bold text-rose-300 mt-1">
                    {workHoursMetrics.unresolvedCount} Unresolved
                  </p>
                )}
              </div>
              <p className="text-[9px] text-[#7E8985]">{periodLabel}</p>
            </div>

            {/* 3. Average Daily Work Hours */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Avg Daily Hours</span>
                <Activity className="w-3.5 h-3.5 text-[#18C98F]" />
              </div>
              <div className="my-2">
                <p className="text-xl font-black text-white leading-none">
                  {workHoursMetrics.avgFormatted}
                </p>
              </div>
              <p className="text-[9px] text-[#7E8985]">{workHoursMetrics.daysWithWork} Active Days</p>
            </div>

            {/* 4. Monthly Work Hours */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Monthly Hours</span>
                <Calendar className="w-3.5 h-3.5 text-[#18C98F]" />
              </div>
              <div className="my-2">
                <p className="text-xl font-black text-white leading-none">
                  {workHoursMetrics.monthlyTotalFormatted}
                </p>
              </div>
              <p className="text-[9px] text-[#7E8985]">Current Calendar Month</p>
            </div>

            {/* 5. Tasks Assigned / Completed */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Task Status</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="my-2">
                <p className="text-xl font-black text-emerald-300 leading-none">
                  {taskMetrics.completed} / {taskMetrics.assigned}
                </p>
                <p className="text-[9px] text-[#7E8985] font-bold mt-1">
                  {taskMetrics.pending} Pending
                </p>
              </div>
              <p className="text-[9px] text-[#7E8985]">
                {taskMetrics.assigned > 0 ? `${Math.round((taskMetrics.completed / taskMetrics.assigned) * 100)}% Rate` : 'No Tasks'}
              </p>
            </div>

            {/* 6. Overdue & Revisions */}
            <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] flex flex-col justify-between shadow-sm">
              <div className="flex items-center justify-between text-[#7E8985]">
                <span className="text-[10px] font-extrabold uppercase tracking-wider">Quality Logs</span>
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="my-2">
                <p className="text-xl font-black text-white leading-none">
                  <span className={taskMetrics.overdue > 0 ? 'text-rose-400' : 'text-white'}>{taskMetrics.overdue}</span> Overdue
                </p>
                <p className="text-[9px] text-amber-300 font-bold mt-1">
                  {taskMetrics.revisionRequestsCount} Revisions
                </p>
              </div>
              <p className="text-[9px] text-[#7E8985]">Penalties Applied</p>
            </div>

          </div>

          {/* MONTHLY COMPARISON CARD */}
          {monthlyComparisonStats && (
            <div className="bg-[#171B1E] p-5 rounded-3xl border border-[#3A4148] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#18C98F]/20 border border-[#18C98F]/30 flex items-center justify-center text-[#18C98F]">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black text-[#7E8985] uppercase tracking-widest">
                    PERIOD COMPARISON
                  </span>
                  <h3 className="text-lg font-black text-white">
                    Current Score: {monthlyComparisonStats.currScore}% vs Previous: {monthlyComparisonStats.prevScore}%
                  </h3>
                  <p className="text-xs text-[#7E8985] mt-0.5">
                    Difference: <strong className={monthlyComparisonStats.diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                      {monthlyComparisonStats.diff >= 0 ? `+${monthlyComparisonStats.diff}%` : `${monthlyComparisonStats.diff}%`}
                    </strong> ({monthlyComparisonStats.pctImprovement >= 0 ? `+${monthlyComparisonStats.pctImprovement}%` : `${monthlyComparisonStats.pctImprovement}%`} relative)
                  </p>
                </div>
              </div>

              {/* Neutral Wording Status Badge */}
              <div className={`px-4 py-2 rounded-2xl text-xs font-black border flex items-center gap-2 ${
                monthlyComparisonStats.statusWording === 'Improved' 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                  : monthlyComparisonStats.statusWording === 'Needs Attention'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-[#1D2226] text-[#B7C0BC] border-[#3A4148]'
              }`}>
                {monthlyComparisonStats.statusWording === 'Improved' && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
                {monthlyComparisonStats.statusWording === 'Needs Attention' && <ArrowDownRight className="w-4 h-4 text-amber-400" />}
                {monthlyComparisonStats.statusWording === 'Stable' && <Minus className="w-4 h-4 text-[#7E8985]" />}
                <span>{monthlyComparisonStats.statusWording}</span>
              </div>
            </div>
          )}

          {/* PERFORMANCE BREAKDOWN CARDS (6 CARDS WITH EXISTING WEIGHTAGES) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black uppercase text-[#B7C0BC] tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#18C98F]" />
                Performance Breakdown
              </h2>
              <span className="text-[10px] text-[#7E8985] font-mono">
                Formula Weightages Totalling 100%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              
              {/* Card 1: Attendance Punctuality */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#18C98F]" /> 1. Attendance Punctuality
                  </span>
                  <span className="text-xs font-black text-amber-300 font-mono">
                    {weightages.punctuality}% Weight
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Punctuality Score:</span>
                    <span className="font-black text-white">{bd ? `${bd.punctualityScore}%` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Days Logged:</span>
                    <span className="font-extrabold text-[#B7C0BC]">{bd ? bd.attendanceDaysCount : 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Late Arrivals:</span>
                    <span className={`font-extrabold ${bd && bd.lateArrivalsCount > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {bd ? bd.lateArrivalsCount : 0}
                    </span>
                  </div>
                  <div className="w-full bg-[#111417] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#18C98F] h-full rounded-full transition-all"
                      style={{ width: `${bd ? Math.max(0, bd.punctualityScore) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Work-Hour Consistency */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#18C98F]" /> 2. Work-Hour Consistency
                  </span>
                  <span className="text-xs font-black text-pink-300 font-mono">
                    {weightages.workload}% Weight
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Logged Duration:</span>
                    <span className="font-black text-white">{workHoursMetrics.totalFormatted}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Avg Daily Duration:</span>
                    <span className="font-extrabold text-[#B7C0BC]">{workHoursMetrics.avgFormatted}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Unresolved Checkout:</span>
                    <span className={`font-extrabold ${workHoursMetrics.unresolvedCount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {workHoursMetrics.unresolvedCount > 0 ? `${workHoursMetrics.unresolvedCount} (0 hrs credit)` : 'Clean'}
                    </span>
                  </div>
                  <div className="w-full bg-[#111417] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#18C98F] h-full rounded-full transition-all"
                      style={{ width: `${bd ? Math.max(0, bd.workloadScore) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Task Completion */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 3. Task Completion
                  </span>
                  <span className="text-xs font-black text-emerald-300 font-mono">
                    {weightages.taskCompletion}% Weight
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Completion Score:</span>
                    <span className="font-black text-white">{bd ? `${bd.taskCompletionScore}%` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Completed vs Assigned:</span>
                    <span className="font-extrabold text-[#B7C0BC]">{taskMetrics.completed} / {taskMetrics.assigned}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">On-time Completion:</span>
                    <span className="font-extrabold text-emerald-300">{bd ? bd.onTimeTasksCount : 0} Tasks</span>
                  </div>
                  <div className="w-full bg-[#111417] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-[#18C98F] h-full rounded-full transition-all"
                      style={{ width: `${bd ? Math.max(0, bd.taskCompletionScore) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Overdue-Task Penalty */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" /> 4. Overdue Penalty
                  </span>
                  <span className="text-xs font-black text-rose-300 font-mono">
                    Deduction
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Overdue Tasks:</span>
                    <span className="font-black text-rose-300">{taskMetrics.overdue}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Applied Deduction:</span>
                    <span className="font-black text-rose-400">-{bd ? bd.overduePenalty : 0} pts</span>
                  </div>
                  <p className="text-[10px] text-[#7E8985] italic pt-1">
                    Graduated deduction based on overdue task volume.
                  </p>
                </div>
              </div>

              {/* Card 5: Revision Penalty */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <RotateCcw className="w-4 h-4 text-amber-400" /> 5. Revision Penalty
                  </span>
                  <span className="text-xs font-black text-amber-300 font-mono">
                    Quality ({weightages.quality}%)
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Total Revisions:</span>
                    <span className="font-black text-amber-300">{taskMetrics.revisionRequestsCount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Applied Deduction:</span>
                    <span className="font-black text-amber-400">-{bd ? bd.revisionPenalty : 0} pts</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Quality Score:</span>
                    <span className="font-extrabold text-[#B7C0BC]">{bd ? `${bd.qualityScore}%` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Card 6: Overall Efficiency Summary */}
              <div className="bg-[#171B1E] p-4 rounded-2xl border border-[#3A4148] space-y-3">
                <div className="flex items-center justify-between border-b border-[#3A4148] pb-2">
                  <span className="text-xs font-black text-[#B7C0BC] uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#18C98F]" /> 6. Overall Score
                  </span>
                  <span className="text-xs font-black text-cyan-300 font-mono">
                    Composite 100%
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Final Score:</span>
                    <span className="font-black text-xl text-white">
                      {currentCalculation ? `${currentCalculation.finalScore}%` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#7E8985]">Performance Standing:</span>
                    <span className="font-bold text-amber-300">
                      {currentCalculation ? currentCalculation.grade : 'N/A'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    className="w-full mt-2 py-1.5 bg-[#18C98F] hover:bg-[#10966D] text-[#0B0D0F] rounded-xl font-bold text-xs transition"
                  >
                    Save Snapshot
                  </button>
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* ==================================================== */}
      {/* VIEW 2: MY TEAM PERFORMANCE (TEAM LEADER VIEW) */}
      {/* ==================================================== */}
      {viewMode === 'MY_TEAM_PERFORMANCE' && isTeamLeader && (
        <div className="space-y-5">
          {/* TEAM SUMMARY CARD */}
          {teamMetricsSummary ? (
            <div className="bg-[#171B1E] p-5 rounded-3xl border border-[#3A4148] shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#3A4148] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#18C98F]/20 border border-[#18C98F]/30 flex items-center justify-center text-[#18C98F]">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white uppercase tracking-wide">
                      MY TEAM PERFORMANCE SUMMARY
                    </h2>
                    <p className="text-xs text-[#7E8985]">
                      {myTeamMembers.length} Assigned Team Members • {periodLabel}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-[#7E8985] font-bold uppercase">Avg Team Efficiency</span>
                  <p className="text-2xl font-black text-amber-400 leading-none mt-0.5">
                    {teamMetricsSummary.avgTeamScore}%
                  </p>
                </div>
              </div>

              {/* TEAM METRICS GRID */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Team Members</p>
                  <p className="text-lg font-black text-white">{myTeamMembers.length}</p>
                </div>
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Total Work Hours</p>
                  <p className="text-lg font-black text-white">{teamMetricsSummary.totalTeamWorkHoursFormatted}</p>
                </div>
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Tasks Completed</p>
                  <p className="text-lg font-black text-[#18C98F]">
                    {teamMetricsSummary.totalTeamCompleted} / {teamMetricsSummary.totalTeamAssigned}
                  </p>
                </div>
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Overdue Tasks</p>
                  <p className="text-lg font-black text-rose-300">{teamMetricsSummary.totalTeamOverdue}</p>
                </div>
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Total Revisions</p>
                  <p className="text-lg font-black text-amber-300">{teamMetricsSummary.totalTeamRevisions}</p>
                </div>
                <div className="bg-[#1D2226] p-3 rounded-2xl border border-[#3A4148]">
                  <p className="text-[9px] font-bold text-[#7E8985] uppercase">Punctuality</p>
                  <p className="text-lg font-black text-cyan-300">{teamMetricsSummary.teamPunctualityPct}%</p>
                </div>
              </div>
            </div>
          ) : (
            <Card className="p-8 bg-[#171B1E] border border-[#3A4148] text-center">
              <Users className="w-10 h-10 text-[#18C98F] mx-auto mb-2 opacity-50" />
              <h3 className="text-base font-bold text-white">No Team Members Assigned</h3>
              <p className="text-xs text-[#7E8985] mt-1">
                There are currently no team members registered with you as their Team Leader.
              </p>
            </Card>
          )}

          {/* TEAM MEMBERS DETAILED BREAKDOWN TABLE */}
          {teamMetricsSummary && teamMetricsSummary.memberBreakdowns.length > 0 && (
            <div className="bg-[#171B1E] rounded-3xl border border-[#3A4148] overflow-hidden shadow-xl">
              <div className="p-4 bg-[#111417] border-b border-[#3A4148] flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-[#B7C0BC] tracking-wider">
                  Team Member Individual Performance
                </h3>
                <span className="text-[10px] text-[#7E8985] font-mono">
                  Privacy Enforced • Assigned Team Only
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#111417] text-[#7E8985] font-extrabold uppercase text-[9.5px] tracking-wider border-b border-[#3A4148]">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Work Hours</th>
                      <th className="py-3 px-4">Tasks Done</th>
                      <th className="py-3 px-4">Overdue</th>
                      <th className="py-3 px-4">Revisions</th>
                      <th className="py-3 px-4">Late Arrivals</th>
                      <th className="py-3 px-4 text-right">Efficiency Score</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3A4148] font-medium">
                    {teamMetricsSummary.memberBreakdowns.map((item) => (
                      <tr key={item.member.employeeCode} className="hover:bg-[#1D2226]/50 transition">
                        <td className="py-3.5 px-4 font-black text-white">
                          {item.member.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#7E8985]">
                          {item.member.employeeCode}
                        </td>
                        <td className="py-3.5 px-4 text-[#B7C0BC] font-bold">
                          {item.workHoursFormatted}
                          {item.unresolvedCount > 0 && (
                            <span className="block text-[9px] text-rose-300">({item.unresolvedCount} unresolved)</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-emerald-300 font-black">
                          {item.tasksCompleted} / {item.tasksAssigned}
                        </td>
                        <td className="py-3.5 px-4 text-rose-300 font-bold">
                          {item.overdueTasks}
                        </td>
                        <td className="py-3.5 px-4 text-amber-300 font-bold">
                          {item.revisions}
                        </td>
                        <td className="py-3.5 px-4 text-[#7E8985]">
                          {item.lateArrivals}
                        </td>
                        <td className="py-3.5 px-4 text-right font-black text-amber-300 text-sm">
                          {item.score}% ({item.grade})
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeCode(item.member.employeeCode);
                              setViewMode('MY_PERFORMANCE');
                            }}
                            className="px-2.5 py-1 rounded-xl bg-[#1D2226] hover:bg-[#3A4148] border border-[#3A4148] text-white hover:text-[#18C98F] text-[10px] font-bold transition"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* VIEW 3: SETTINGS (ADMIN WEIGHTAGES CONFIG) */}
      {/* ==================================================== */}
      {viewMode === 'SETTINGS' && isAdmin && (
        <Card className="p-6 bg-[#171B1E] border border-[#3A4148] rounded-3xl space-y-5">
          <div className="flex items-center gap-3 border-b border-[#3A4148] pb-4">
            <Sliders className="w-6 h-6 text-[#18C98F]" />
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                Configure Efficiency Weightages
              </h2>
              <p className="text-xs text-[#7E8985]">
                Adjust the weights for the 5 efficiency parameters. Total must equal 100%.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveWeightages} className="space-y-4 max-w-lg">
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#B7C0BC] font-bold mb-1">
                  Task Completion Weight (%):
                </label>
                <input
                  type="number"
                  value={adminWeights.taskCompletion}
                  onChange={(e) => setAdminWeights({ ...adminWeights, taskCompletion: Number(e.target.value) })}
                  className="w-full bg-[#111417] text-white p-2.5 rounded-xl border border-[#3A4148]"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-[#B7C0BC] font-bold mb-1">
                  On-Time Completion Weight (%):
                </label>
                <input
                  type="number"
                  value={adminWeights.onTimeCompletion}
                  onChange={(e) => setAdminWeights({ ...adminWeights, onTimeCompletion: Number(e.target.value) })}
                  className="w-full bg-[#111417] text-white p-2.5 rounded-xl border border-[#3A4148]"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-[#B7C0BC] font-bold mb-1">
                  Quality Score Weight (%):
                </label>
                <input
                  type="number"
                  value={adminWeights.quality}
                  onChange={(e) => setAdminWeights({ ...adminWeights, quality: Number(e.target.value) })}
                  className="w-full bg-[#111417] text-white p-2.5 rounded-xl border border-[#3A4148]"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-[#B7C0BC] font-bold mb-1">
                  Attendance Punctuality Weight (%):
                </label>
                <input
                  type="number"
                  value={adminWeights.punctuality}
                  onChange={(e) => setAdminWeights({ ...adminWeights, punctuality: Number(e.target.value) })}
                  className="w-full bg-[#111417] text-white p-2.5 rounded-xl border border-[#3A4148]"
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-[#B7C0BC] font-bold mb-1">
                  Workload / Consistency Weight (%):
                </label>
                <input
                  type="number"
                  value={adminWeights.workload}
                  onChange={(e) => setAdminWeights({ ...adminWeights, workload: Number(e.target.value) })}
                  className="w-full bg-[#111417] text-white p-2.5 rounded-xl border border-[#3A4148]"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            {weightsError && (
              <p className="text-xs text-rose-300 font-bold bg-rose-950/40 p-2.5 rounded-xl border border-rose-500/30">
                {weightsError}
              </p>
            )}

            {weightsSuccess && (
              <p className="text-xs text-emerald-300 font-bold bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-500/30">
                Weightages saved successfully!
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#18C98F] hover:bg-[#10966D] text-[#0B0D0F] font-extrabold text-xs rounded-xl transition shadow-lg"
              >
                Save Weightages
              </button>
              <button
                type="button"
                onClick={() => setAdminWeights(DEFAULT_WEIGHTAGES)}
                className="px-4 py-2.5 bg-[#1D2226] hover:bg-[#3A4148] text-white text-xs font-bold rounded-xl border border-[#3A4148]"
              >
                Reset Defaults
              </button>
            </div>
          </form>
        </Card>
      )}

    </div>
  );
};
