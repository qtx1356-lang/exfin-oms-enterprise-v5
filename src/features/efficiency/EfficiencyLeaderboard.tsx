import React, { useState, useMemo, useEffect } from 'react';
import { 
  Trophy, 
  Users, 
  Sparkles, 
  Award, 
  TrendingUp, 
  Calendar,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  ArrowLeft
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { TaskRecord } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { DailyWorkDetailRecord } from '../../types/workDetails';
import { EfficiencyGrade, EfficiencyWeightages, DEFAULT_WEIGHTAGES } from '../../types/efficiency';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { getSavedWeightages } from '../../services/efficiency/efficiencyService';
import { getKolkataDateStr } from '../../utils/workHoursCalc';

export type LeaderboardPeriod = 'THIS_WEEK' | 'CURRENT_MONTH' | 'PREVIOUS_MONTH';

export interface EfficiencyLeaderboardProps {
  allEmployees?: any[];
  tasks?: TaskRecord[];
  attendance?: AttendanceRecord[];
  workDetails?: DailyWorkDetailRecord[];
  weightages?: EfficiencyWeightages;
  activeEmployeeCode?: string;
  activeEmployeeId?: string;
  loading?: boolean;
  onSelectEmployee?: (employeeCode: string) => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
}

/**
 * Format YYYY-MM-DD range into en-US string in Asia/Kolkata (e.g. "Aug 31 – Sep 2, 2026")
 */
export const formatKolkataPeriodRange = (startDateStr: string, endDateStr: string): string => {
  if (!startDateStr || !endDateStr) return '';
  try {
    const [y1, m1, d1] = startDateStr.split('-').map(Number);
    const [y2, m2, d2] = endDateStr.split('-').map(Number);
    
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const monthStr1 = months[date1.getMonth()];
    const monthStr2 = months[date2.getMonth()];
    const year1 = date1.getFullYear();
    const year2 = date2.getFullYear();

    if (year1 === year2) {
      if (monthStr1 === monthStr2) {
        if (d1 === d2) {
          return `${monthStr1} ${d1}, ${year1}`;
        }
        return `${monthStr1} ${d1} – ${d2}, ${year1}`;
      }
      return `${monthStr1} ${d1} – ${monthStr2} ${d2}, ${year1}`;
    }
    return `${monthStr1} ${d1}, ${year1} – ${monthStr2} ${d2}, ${year2}`;
  } catch (err) {
    return `${startDateStr} – ${endDateStr}`;
  }
};

/**
 * Helper to calculate period boundaries in Asia/Kolkata timezone
 */
export const getKolkataPeriodDates = (period: LeaderboardPeriod): { startDate: string; endDate: string; label: string } => {
  const kolkataTodayStr = getKolkataDateStr();
  const [kYear, kMonth, kDay] = kolkataTodayStr.split('-').map(Number);
  const referenceDate = new Date(kYear, kMonth - 1, kDay);

  let startDate = '';
  let endDate = kolkataTodayStr;
  let label = 'This Week';

  if (period === 'THIS_WEEK') {
    label = 'This Week';
    // Monday 00:00:00 Asia/Kolkata through today
    const dayOfWeek = referenceDate.getDay(); // 0 = Sun, 1 = Mon...
    const distToMon = (dayOfWeek + 6) % 7;
    const mon = new Date(referenceDate);
    mon.setDate(referenceDate.getDate() - distToMon);
    startDate = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    endDate = kolkataTodayStr;
  } else if (period === 'CURRENT_MONTH') {
    label = 'Current Month';
    // 1st of current month through today
    startDate = `${kYear}-${String(kMonth).padStart(2, '0')}-01`;
    endDate = kolkataTodayStr;
  } else if (period === 'PREVIOUS_MONTH') {
    label = 'Previous Month';
    // Complete previous month (1st to last day)
    const pmStart = new Date(kYear, kMonth - 2, 1);
    startDate = `${pmStart.getFullYear()}-${String(pmStart.getMonth() + 1).padStart(2, '0')}-01`;

    const pmEnd = new Date(kYear, kMonth - 1, 0);
    endDate = `${pmEnd.getFullYear()}-${String(pmEnd.getMonth() + 1).padStart(2, '0')}-${String(pmEnd.getDate()).padStart(2, '0')}`;
  }

  return { startDate, endDate, label };
};

export const EfficiencyLeaderboard: React.FC<EfficiencyLeaderboardProps> = ({
  allEmployees: propEmployees,
  tasks: propTasks,
  attendance: propAttendance,
  workDetails: propWorkDetails,
  weightages: propWeightages,
  activeEmployeeCode = '',
  activeEmployeeId = '',
  loading: propLoading = false,
  onSelectEmployee,
  onClose,
  title = '🏆 Efficiency Leaderboard',
  subtitle = 'Employee efficiency rankings'
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<LeaderboardPeriod>('THIS_WEEK');

  // Internal state for standalone usage
  const [internalEmployees, setInternalEmployees] = useState<any[]>([]);
  const [internalTasks, setInternalTasks] = useState<TaskRecord[]>([]);
  const [internalAttendance, setInternalAttendance] = useState<AttendanceRecord[]>([]);
  const [internalWorkDetails, setInternalWorkDetails] = useState<DailyWorkDetailRecord[]>([]);
  const [internalWeightages, setInternalWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [isFetchingLocal, setIsFetchingLocal] = useState<boolean>(false);

  // Helper to check if provided dataset covers multiple employees or if we need to fetch global Firestore collections
  const isMultiUserDataset = (records: any[], getEmpKey: (r: any) => string): boolean => {
    if (!records || records.length === 0) return false;
    const uniqueKeys = new Set<string>();
    for (const r of records) {
      const key = getEmpKey(r);
      if (key) uniqueKeys.add(String(key).trim().toUpperCase());
      if (uniqueKeys.size > 1) return true;
    }
    return false;
  };

  const usePropEmployees = Boolean(propEmployees && propEmployees.length > 0);
  const usePropTasks = Boolean(
    propTasks && 
    propTasks.length > 0 && 
    isMultiUserDataset(propTasks, t => t.assignedToEmployeeCodes?.[0] || (t as any).assigneeCode || (t as any).employeeCode || (t as any).employeeId || '')
  );
  const usePropAttendance = Boolean(
    propAttendance && 
    propAttendance.length > 0 && 
    isMultiUserDataset(propAttendance, a => a.employeeCode || a.employeeId || '')
  );
  const usePropWorkDetails = Boolean(
    propWorkDetails && 
    propWorkDetails.length > 0 && 
    isMultiUserDataset(propWorkDetails, w => w.employeeCode || w.employeeId || '')
  );

  // Determine whether to use props or internal state
  const employeesToUse = usePropEmployees ? propEmployees! : internalEmployees;
  const tasksToUse = usePropTasks ? propTasks! : internalTasks;
  const attendanceToUse = usePropAttendance ? propAttendance! : internalAttendance;
  const workDetailsToUse = usePropWorkDetails ? propWorkDetails! : internalWorkDetails;
  const weightagesToUse = propWeightages || internalWeightages;

  // Realtime Firestore fallback if props are not provided or are single-user scoped
  useEffect(() => {
    const needsEmployees = !usePropEmployees;
    const needsTasks = !usePropTasks;
    const needsAttendance = !usePropAttendance;
    const needsWorkDetails = !usePropWorkDetails;

    if (!needsEmployees && !needsTasks && !needsAttendance && !needsWorkDetails) {
      return;
    }

    setIsFetchingLocal(true);
    const unsubs: (() => void)[] = [];

    if (needsEmployees) {
      const unsub = onSnapshot(collection(db, 'registrations'), (snap) => {
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInternalEmployees(list);
        setIsFetchingLocal(false);
      }, (err) => {
        console.warn('Leaderboard registrations sub notice:', err);
        setIsFetchingLocal(false);
      });
      unsubs.push(unsub);
    }

    if (needsTasks) {
      const unsub = onSnapshot(collection(db, 'tasks'), (snap) => {
        const list: TaskRecord[] = [];
        snap.docs.forEach(doc => list.push({ id: doc.id, ...doc.data() } as TaskRecord));
        setInternalTasks(list);
      }, (err) => {
        console.warn('Leaderboard tasks sub notice:', err);
      });
      unsubs.push(unsub);
    }

    if (needsAttendance) {
      const unsub = onSnapshot(collection(db, 'attendance'), (snap) => {
        const list: AttendanceRecord[] = [];
        snap.docs.forEach(doc => list.push({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setInternalAttendance(list);
      }, (err) => {
        console.warn('Leaderboard attendance sub notice:', err);
      });
      unsubs.push(unsub);
    }

    if (needsWorkDetails) {
      const unsub = onSnapshot(collection(db, 'daily_work_details'), (snap) => {
        const list: DailyWorkDetailRecord[] = [];
        snap.docs.forEach(doc => list.push({ id: doc.id, ...doc.data() } as DailyWorkDetailRecord));
        setInternalWorkDetails(list);
      }, (err) => {
        console.warn('Leaderboard daily_work_details sub notice:', err);
      });
      unsubs.push(unsub);
    }

    if (!propWeightages) {
      getSavedWeightages().then(w => setInternalWeightages(w)).catch(() => {});
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [usePropEmployees, usePropTasks, usePropAttendance, usePropWorkDetails, propWeightages]);

  // Calculate Asia/Kolkata date range for selected period
  const periodInfo = useMemo(() => {
    return getKolkataPeriodDates(selectedPeriod);
  }, [selectedPeriod]);

  // Filter eligible employees (Approved or non-rejected active registrations)
  const eligibleEmployees = useMemo(() => {
    return (employeesToUse || []).filter(e => {
      const status = (e.status || '').toLowerCase();
      // Exclude explicitly rejected or pending approvals if status is set
      if (status === 'rejected' || status === 'pending') return false;
      const code = e.employeeCode || e.id;
      return Boolean(code);
    });
  }, [employeesToUse]);

  // Calculate efficiency score for each eligible employee using canonical engine
  const leaderboardItems = useMemo(() => {
    const { startDate, endDate } = periodInfo;
    const normActiveCode = String(activeEmployeeCode || '').trim().toUpperCase();
    const normActiveId = String(activeEmployeeId || '').trim().toUpperCase();

    const results = eligibleEmployees.map(emp => {
      const empCode = String(emp.employeeCode || emp.id || '').trim();
      const empId = String(emp.id || emp.employeeCode || '').trim();
      const empName = emp.name || emp.displayName || empCode || 'Employee';
      const department = emp.department || 'Operations';
      const teamLeaderId = emp.teamLeaderId || null;

      const calc = calculateEfficiency(
        empId,
        empCode,
        empName,
        department,
        teamLeaderId,
        startDate,
        endDate,
        tasksToUse,
        attendanceToUse,
        weightagesToUse,
        workDetailsToUse
      );

      if (process.env.NODE_ENV !== 'production') {
        console.log(`Leaderboard calculation: ${empCode} (${empName}) → attendance: ${calc.breakdown.attendanceDaysCount}, tasks: ${calc.breakdown.assignedTasksCount}, workDetails: ${calc.breakdown.workDetailsCount} → ${calc.finalScore >= 0 ? calc.finalScore + '%' : 'No data'}`);
      }

      const normEmpCode = empCode.toUpperCase();
      const normEmpId = empId.toUpperCase();

      const isCurrentUser = Boolean(
        (normActiveCode && (normEmpCode === normActiveCode || normEmpId === normActiveCode)) ||
        (normActiveId && (normEmpCode === normActiveId || normEmpId === normActiveId))
      );

      return {
        employee: emp,
        employeeCode: empCode,
        employeeId: empId,
        employeeName: empName,
        department,
        score: calc.finalScore,
        grade: calc.grade,
        breakdown: calc.breakdown,
        isCurrentUser,
        profilePhotoUrl: emp.profilePhotoUrl || emp.selfieUrl || null
      };
    });

    // Primary sort: score descending
    // Secondary sort: employee name ascending (deterministic tie-breaking)
    // Tertiary sort: employee code ascending
    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const nameCompare = a.employeeName.localeCompare(b.employeeName);
      if (nameCompare !== 0) return nameCompare;
      return a.employeeCode.localeCompare(b.employeeCode);
    });

    return results;
  }, [eligibleEmployees, periodInfo, tasksToUse, attendanceToUse, weightagesToUse, workDetailsToUse, activeEmployeeCode, activeEmployeeId]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalCount = leaderboardItems.length;
    const validScores = leaderboardItems.filter(item => item.score >= 0);
    const validCount = validScores.length;

    let averageEfficiency = -1;
    if (validCount > 0) {
      const sum = validScores.reduce((acc, curr) => acc + curr.score, 0);
      averageEfficiency = Math.round(sum / validCount);
    }

    const topPerformer = validScores.length > 0 ? validScores[0] : null;

    return {
      totalEmployees: totalCount,
      validEmployeesCount: validCount,
      averageEfficiency,
      topPerformer
    };
  }, [leaderboardItems]);

  const dateRangeFormatted = formatKolkataPeriodRange(periodInfo.startDate, periodInfo.endDate);

  // Grade badge styling helper
  const getGradeBadge = (score: number, grade: EfficiencyGrade) => {
    if (score < 0 || grade === ('N/A' as any)) {
      return (
        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/50">
          No efficiency data
        </span>
      );
    }
    switch (grade) {
      case 'Excellent':
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            Excellent
          </span>
        );
      case 'Very Good':
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/40">
            Very Good
          </span>
        );
      case 'Good':
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            Good
          </span>
        );
      case 'Needs Improvement':
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Needs Improvement
          </span>
        );
      case 'Critical':
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Critical
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/50">
            {grade}
          </span>
        );
    }
  };

  // Medal or rank badge helper
  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="w-8 h-8 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center font-black text-amber-300 text-sm shadow-md">
          🥇 1
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="w-8 h-8 rounded-full bg-slate-300/20 border border-slate-300/50 flex items-center justify-center font-black text-slate-200 text-sm shadow-md">
          🥈 2
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="w-8 h-8 rounded-full bg-amber-700/20 border border-amber-600/50 flex items-center justify-center font-black text-amber-500 text-sm shadow-md">
          🥉 3
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center font-extrabold text-slate-300 text-xs">
        #{rank}
      </div>
    );
  };

  const isLoading = propLoading || isFetchingLocal;

  return (
    <div className="space-y-4">
      {/* OPTIONAL BACK BUTTON HEADER IF RENDERED MODAL / SCREEN */}
      {onClose && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 px-3.5 btn-primary border border-[var(--border)] rounded-xl hover:brightness-110 transition font-bold text-xs flex items-center gap-1.5 shadow-md text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      )}

      {/* PERIOD TABS & HEADER CONTROL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--surface-inner)] p-3.5 rounded-2xl border border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-black text-[var(--text-primary)] uppercase tracking-wide">
              {title}
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-mono">
            Asia/Kolkata • {dateRangeFormatted}
          </p>
        </div>

        {/* THREE PERIOD FILTERS */}
        <div className="bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border)] flex items-center gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSelectedPeriod('THIS_WEEK')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              selectedPeriod === 'THIS_WEEK'
                ? 'bg-[var(--button-primary)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => setSelectedPeriod('CURRENT_MONTH')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              selectedPeriod === 'CURRENT_MONTH'
                ? 'bg-[var(--button-primary)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Current Month
          </button>
          <button
            type="button"
            onClick={() => setSelectedPeriod('PREVIOUS_MONTH')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
              selectedPeriod === 'PREVIOUS_MONTH'
                ? 'bg-[var(--button-primary)] text-white shadow-md'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Previous Month
          </button>
        </div>
      </div>

      {/* COMPACT SUMMARY HEADER */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--surface-inner)] p-3.5 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
            Period
          </span>
          <p className="text-sm font-black text-[var(--text-primary)] mt-1">
            {periodInfo.label}
          </p>
          <p className="text-[9.5px] font-mono text-[var(--text-secondary)] mt-0.5">
            {dateRangeFormatted}
          </p>
        </div>

        <div className="bg-[var(--surface-inner)] p-3.5 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
            Employees
          </span>
          <p className="text-xl font-black text-[var(--text-primary)] mt-1">
            {summary.totalEmployees}
          </p>
          <p className="text-[9.5px] text-[var(--text-secondary)] mt-0.5">
            Eligible for ranking
          </p>
        </div>

        <div className="bg-[var(--surface-inner)] p-3.5 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
            Average Efficiency
          </span>
          <p className="text-xl font-black text-cyan-400 mt-1">
            {summary.averageEfficiency >= 0 ? `${summary.averageEfficiency}%` : 'N/A'}
          </p>
          <p className="text-[9.5px] text-[var(--text-secondary)] mt-0.5">
            Across {summary.validEmployeesCount} active employees
          </p>
        </div>

        <div className="bg-[var(--surface-inner)] p-3.5 rounded-2xl border border-[var(--border)] flex flex-col justify-between">
          <span className="text-[10px] font-extrabold text-[var(--text-secondary)] uppercase tracking-wider">
            Top Performer
          </span>
          {summary.topPerformer ? (
            <div>
              <p className="text-sm font-black text-emerald-400 truncate mt-1">
                {summary.topPerformer.employeeName}
              </p>
              <p className="text-[10px] font-extrabold text-amber-300">
                Score: {summary.topPerformer.score}% ({summary.topPerformer.grade})
              </p>
            </div>
          ) : (
            <p className="text-sm font-bold text-[var(--text-secondary)] mt-1">
              N/A
            </p>
          )}
        </div>
      </div>

      {/* MAIN UNIVERSAL CARD LEADERBOARD CONTAINER */}
      <div 
        className="rounded-3xl p-4 sm:p-5 border shadow-2xl space-y-4"
        style={{
          backgroundImage: 'linear-gradient(180deg, #3A4775 0%, #2F3C63 100%)',
          backgroundColor: '#34436F',
          borderColor: 'rgba(120, 150, 210, 0.20)'
        }}
      >
        {/* LEADERBOARD CARD TITLE */}
        <div className="flex items-center justify-between pb-3 border-b border-blue-400/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300">
              <Trophy className="w-5 h-5 drop-shadow" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>🏆 EFFICIENCY LEADERBOARD</span>
              </h3>
              <p className="text-xs text-blue-100 font-medium">
                {subtitle} ({leaderboardItems.length} listed)
              </p>
            </div>
          </div>

          <span className="text-[10px] font-mono font-bold bg-white/10 text-blue-100 px-2.5 py-1 rounded-full border border-white/20">
            {periodInfo.label}
          </span>
        </div>

        {/* LOADING STATE */}
        {isLoading ? (
          <div className="py-12 text-center text-blue-100 space-y-2">
            <div className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold">Loading leaderboard...</p>
          </div>
        ) : leaderboardItems.length === 0 ? (
          /* EMPTY STATE */
          <div className="py-10 text-center bg-[var(--surface-inner)] rounded-2xl border border-[var(--border)] p-6">
            <AlertCircle className="w-8 h-8 text-amber-300 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-white">No efficiency data available for this period.</p>
            <p className="text-xs text-blue-200 mt-1">There are no eligible employee records for {periodInfo.label}.</p>
          </div>
        ) : (
          /* ALL ELIGIBLE EMPLOYEES LIST */
          <div className="space-y-2.5">
            {leaderboardItems.map((item, index) => {
              const rank = index + 1;
              const isUser = item.isCurrentUser;

              return (
                <div
                  key={item.employeeCode || item.employeeId || index}
                  onClick={() => onSelectEmployee?.(item.employeeCode)}
                  className={`group relative p-3.5 sm:p-4 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                    isUser
                      ? 'bg-[var(--surface-inner)] border-2 border-cyan-400 shadow-lg shadow-cyan-950/40 ring-2 ring-cyan-400/30'
                      : 'bg-[var(--surface-inner)] hover:bg-[var(--surface-elevated)] border border-[var(--border)] hover:border-white/25 shadow-md'
                  }`}
                >
                  {/* LEFT COLUMN: RANK + AVATAR + NAME & CODE */}
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* RANK POSITION BADGE */}
                    <div className="flex-shrink-0">
                      {getRankBadge(rank)}
                    </div>

                    {/* AVATAR / INITIALS */}
                    <div className="relative flex-shrink-0">
                      {item.profilePhotoUrl ? (
                        <img
                          src={item.profilePhotoUrl}
                          alt={item.employeeName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border-2 border-white/20"
                          onError={(e) => {
                            // Fallback on image load error
                            (e.target as HTMLElement).style.display = 'none';
                            const fallback = (e.target as HTMLElement).nextElementSibling;
                            if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-800 border-2 border-white/20 items-center justify-center font-black text-white text-sm shadow-inner ${item.profilePhotoUrl ? 'hidden' : 'flex'}`}
                      >
                        {item.employeeName.substring(0, 2).toUpperCase()}
                      </div>
                    </div>

                    {/* NAME & EMPLOYEE CODE */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-white truncate group-hover:text-cyan-300 transition-colors">
                          {item.employeeName}
                        </h4>
                        {isUser && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 tracking-wider">
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-300 font-mono">
                        <span>{item.employeeCode}</span>
                        {item.department && (
                          <>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 font-sans text-[11px] truncate">{item.department}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: EFFICIENCY SCORE & GRADE */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                    {/* GRADE BADGE */}
                    <div className="text-left sm:text-right">
                      {getGradeBadge(item.score, item.grade)}
                    </div>

                    {/* PERCENTAGE SCORE DISPLAY */}
                    <div className="text-right min-w-[70px]">
                      {item.score >= 0 ? (
                        <div>
                          <p className="text-xl font-black text-white leading-none tracking-tight">
                            {item.score}%
                          </p>
                          <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                            Efficiency
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-lg font-black text-slate-400 leading-none">
                            —
                          </p>
                          <p className="text-[9px] font-medium text-slate-500 mt-0.5">
                            No data
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
