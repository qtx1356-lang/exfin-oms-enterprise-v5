import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  Calendar, 
  Award, 
  Sparkles, 
  ChevronRight, 
  X, 
  BarChart3,
  Briefcase,
  Info,
  Check
} from 'lucide-react';
import { TaskRecord, getEffectiveTaskStatus } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { LeaveRecord } from '../../types/leave';
import { EfficiencySnapshot, EfficiencyWeightages } from '../../types/efficiency';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES, getSavedWeightages, getEfficiencySnapshots } from '../../services/efficiency/efficiencyService';

interface PerformanceSnapshotProps {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department?: string;
  tasks: TaskRecord[];
  attendanceRecords: AttendanceRecord[];
  leaves?: LeaveRecord[];
  isOnline?: boolean;
}

const getInitialWeightages = (): EfficiencyWeightages => {
  try {
    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem('exfin_efficiency_weights');
      if (local) return JSON.parse(local);
    }
  } catch {}
  return DEFAULT_WEIGHTAGES;
};

const getInitialHistoricalSnapshots = (employeeCode?: string): EfficiencySnapshot[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem('exfin_efficiency_snapshots');
      if (local) {
        const parsed: EfficiencySnapshot[] = JSON.parse(local);
        return employeeCode ? parsed.filter(s => s.employeeCode === employeeCode) : parsed;
      }
    }
  } catch {}
  return [];
};

export const PerformanceSnapshot: React.FC<PerformanceSnapshotProps> = ({
  employeeId,
  employeeCode,
  employeeName,
  department = 'Operations',
  tasks,
  attendanceRecords,
  leaves = [],
  isOnline = true
}) => {
  // Modal State for "MY PERFORMANCE" Detail View
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Weightages and Snapshots
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(getInitialWeightages);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<EfficiencySnapshot[]>(() => 
    getInitialHistoricalSnapshots(employeeCode)
  );
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');

  // Async load weightages & historical snapshots after main dashboard mounts
  useEffect(() => {
    let isMounted = true;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    const loadPerformanceData = async () => {
      try {
        const [savedWeights, snapshots] = await Promise.all([
          getSavedWeightages(),
          getEfficiencySnapshots(employeeCode || undefined)
        ]);
        if (isMounted) {
          setWeightages(savedWeights);
          setHistoricalSnapshots(snapshots);
          setLastUpdatedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      } catch (err) {
        console.warn('Error loading performance data asynchronously:', err);
      }
    };

    loadPerformanceData();

    return () => {
      isMounted = false;
    };
  }, [employeeCode]);

  // Current Date Helper
  const todayObj = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = todayObj.getFullYear();
    const m = String(todayObj.getMonth() + 1).padStart(2, '0');
    const d = String(todayObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [todayObj]);

  const currentYear = todayObj.getFullYear();
  const currentMonth = todayObj.getMonth();
  const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const monthName = todayObj.toLocaleString('default', { month: 'long' });

  // ----------------------------------------------------
  // 1. FILTER TASKS FOR CURRENT EMPLOYEE ONLY
  // ----------------------------------------------------
  const myTasks = useMemo(() => {
    if (!employeeCode && !employeeId) return [];
    return tasks.filter(t => 
      (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(employeeCode)) ||
      (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(employeeId)) ||
      (t.assignedToEmployeeCodes && employeeCode && t.assignedToEmployeeCodes.some(c => c === employeeCode))
    );
  }, [tasks, employeeCode, employeeId]);

  // Filter current month tasks
  const monthTasks = useMemo(() => {
    return myTasks.filter(t => {
      const taskDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime.substring(0, 10));
      return taskDate.startsWith(currentMonthPrefix);
    });
  }, [myTasks, currentMonthPrefix]);

  // ----------------------------------------------------
  // 2. FILTER ATTENDANCE FOR CURRENT EMPLOYEE ONLY
  // ----------------------------------------------------
  const myAttendance = useMemo(() => {
    if (!employeeCode && !employeeId) return [];
    return attendanceRecords.filter(r => 
      r.employeeId === employeeCode || r.employeeId === employeeId
    );
  }, [attendanceRecords, employeeCode, employeeId]);

  const monthAttendance = useMemo(() => {
    return myAttendance.filter(r => r.date && r.date.startsWith(currentMonthPrefix));
  }, [myAttendance, currentMonthPrefix]);

  // Attendance Counts
  const attendanceCounts = useMemo(() => {
    let office = 0;
    let wfh = 0;
    let clientVisit = 0;
    let outdoor = 0;

    monthAttendance.forEach(r => {
      if (r.attendanceType === 'WFH') wfh++;
      else if (r.attendanceType === 'CLIENT_VISIT') clientVisit++;
      else if (r.attendanceType === 'OUTDOOR') outdoor++;
      else office++;
    });

    const presentTotal = office + wfh + clientVisit + outdoor;

    // Approved leaves count in current month
    const approvedLeavesCount = leaves.filter(l => {
      if (l.employeeId !== employeeId && l.employeeCode !== employeeCode) return false;
      if (l.status !== 'APPROVED') return false;
      const startPrefix = l.startDate ? l.startDate.slice(0, 7) : '';
      const endPrefix = l.endDate ? l.endDate.slice(0, 7) : '';
      return startPrefix === currentMonthPrefix || endPrefix === currentMonthPrefix;
    }).reduce((sum, l) => sum + (l.totalDays || 1), 0);

    return {
      present: presentTotal,
      office,
      wfh,
      clientVisit,
      outdoor,
      leave: approvedLeavesCount
    };
  }, [monthAttendance, leaves, employeeId, employeeCode, currentMonthPrefix]);

  // ----------------------------------------------------
  // 3. TASK PERFORMANCE BREAKDOWN
  // ----------------------------------------------------
  const taskStats = useMemo(() => {
    const assigned = monthTasks.length;
    const completed = monthTasks.filter(t => getEffectiveTaskStatus(t) === 'Completed' || (t.status || '').toUpperCase() === 'COMPLETED').length;
    const inProgress = monthTasks.filter(t => getEffectiveTaskStatus(t) === 'In Progress' || (t.status || '').toUpperCase() === 'IN_PROGRESS').length;
    const overdue = monthTasks.filter(t => getEffectiveTaskStatus(t) === 'Overdue' || (t.status || '').toUpperCase() === 'OVERDUE').length;
    
    const completionRate = assigned > 0 
      ? Math.round((completed / assigned) * 100) 
      : 0;

    return {
      assigned,
      completed,
      inProgress,
      overdue,
      completionRate,
      hasTasks: assigned > 0
    };
  }, [monthTasks]);

  // ----------------------------------------------------
  // 4. EFFICIENCY SCORE COMPUTATION (EXISTING FORMULA ONLY)
  // ----------------------------------------------------
  const currentMonthStartDate = `${currentMonthPrefix}-01`;
  const currentMonthEndDate = `${currentMonthPrefix}-${String(new Date(currentYear, currentMonth + 1, 0).getDate()).padStart(2, '0')}`;

  const efficiencyResult = useMemo(() => {
    // If no tasks AND no attendance records exist at all, mark as unavailable
    if (monthTasks.length === 0 && monthAttendance.length === 0) {
      return null;
    }

    return calculateEfficiency(
      employeeId,
      employeeCode,
      employeeName,
      department,
      null,
      currentMonthStartDate,
      currentMonthEndDate,
      tasks,
      attendanceRecords,
      weightages
    );
  }, [employeeId, employeeCode, employeeName, department, currentMonthStartDate, currentMonthEndDate, tasks, attendanceRecords, weightages, monthTasks, monthAttendance]);

  // ----------------------------------------------------
  // 5. PREVIOUS PERIOD & PERFORMANCE TREND
  // ----------------------------------------------------
  const previousMonthPrefix = useMemo(() => {
    const prevDate = new Date(currentYear, currentMonth - 1, 1);
    const pY = prevDate.getFullYear();
    const pM = String(prevDate.getMonth() + 1).padStart(2, '0');
    return `${pY}-${pM}`;
  }, [currentYear, currentMonth]);

  const prevMonthStartDate = `${previousMonthPrefix}-01`;
  const prevMonthEndDate = `${previousMonthPrefix}-${String(new Date(currentYear, currentMonth, 0).getDate()).padStart(2, '0')}`;

  const previousEfficiencyResult = useMemo(() => {
    // Check if previous month tasks or attendance exist
    const prevTasks = myTasks.filter(t => {
      const d = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime.substring(0, 10));
      return d.startsWith(previousMonthPrefix);
    });
    const prevAtt = myAttendance.filter(r => r.date && r.date.startsWith(previousMonthPrefix));

    if (prevTasks.length === 0 && prevAtt.length === 0) {
      return null;
    }

    return calculateEfficiency(
      employeeId,
      employeeCode,
      employeeName,
      department,
      null,
      prevMonthStartDate,
      prevMonthEndDate,
      tasks,
      attendanceRecords,
      weightages
    );
  }, [employeeId, employeeCode, employeeName, department, previousMonthPrefix, prevMonthStartDate, prevMonthEndDate, tasks, attendanceRecords, weightages, myTasks, myAttendance]);

  const trendData = useMemo(() => {
    // Check if historical snapshot or previous calculation exists
    const prevScore = previousEfficiencyResult ? previousEfficiencyResult.finalScore : 
      (historicalSnapshots.length > 0 ? historicalSnapshots[0].finalScore : null);

    if (prevScore === null || efficiencyResult === null) {
      return {
        hasData: false,
        prevScore: null,
        currentScore: efficiencyResult ? efficiencyResult.finalScore : null,
        status: 'Not enough data yet'
      };
    }

    const currentScore = efficiencyResult.finalScore;
    const diff = currentScore - prevScore;

    let state: 'Improving' | 'Stable' | 'Needs Attention' = 'Stable';
    if (diff >= 3) state = 'Improving';
    else if (diff <= -3) state = 'Needs Attention';

    return {
      hasData: true,
      prevScore,
      currentScore,
      diff,
      state
    };
  }, [efficiencyResult, previousEfficiencyResult, historicalSnapshots]);

  // ----------------------------------------------------
  // 6. WEEKLY PROGRESS (CURRENT WEEK MON - FRI)
  // ----------------------------------------------------
  const weeklyProgress = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon...
    const distanceToMon = (dayOfWeek + 6) % 7; // Mon = 0
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMon);

    const weekDays: { label: string; dateStr: string; completionRate: number; taskCount: number; isFuture: boolean }[] = [];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    let totalTasksInWeek = 0;

    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayNum}`;

      const isFuture = dateStr > todayStr;

      // Find tasks assigned to employee for this specific day
      const dayTasks = myTasks.filter(t => {
        const taskDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime.substring(0, 10));
        return taskDate === dateStr;
      });

      totalTasksInWeek += dayTasks.length;

      let rate = 0;
      if (dayTasks.length > 0) {
        const done = dayTasks.filter(t => t.status === 'COMPLETED').length;
        rate = Math.round((done / dayTasks.length) * 100);
      } else {
        // Fallback: check if attendance logged on that day
        const dayAtt = myAttendance.find(r => r.date === dateStr);
        if (dayAtt && !isFuture) {
          rate = 100; // Present with full attendance
        }
      }

      weekDays.push({
        label: labels[i],
        dateStr,
        completionRate: isFuture ? 0 : rate,
        taskCount: dayTasks.length,
        isFuture
      });
    }

    const hasReliableData = totalTasksInWeek > 0 || myAttendance.some(r => r.date >= weekDays[0].dateStr && r.date <= weekDays[4].dateStr);

    return {
      hasReliableData,
      weekDays
    };
  }, [myTasks, myAttendance, todayStr]);

  // ----------------------------------------------------
  // 7. REAL POSITIVE FEEDBACK GENERATOR
  // ----------------------------------------------------
  const positiveMessage = useMemo(() => {
    if (taskStats.hasTasks && taskStats.completed === taskStats.assigned) {
      return "Great work! You completed all assigned tasks.";
    }
    if (attendanceCounts.present >= 15) {
      return "Excellent attendance this month.";
    }
    if (trendData.hasData && trendData.state === 'Improving') {
      return "Your task completion and efficiency are improving!";
    }
    if (taskStats.completed > 0) {
      return "Good steady progress on your tasks. Keep up the momentum!";
    }
    return null;
  }, [taskStats, attendanceCounts, trendData]);

  // ----------------------------------------------------
  // RENDER COMPONENT
  // ----------------------------------------------------
  return (
    <>
      <div 
        onClick={() => setShowDetailModal(true)}
        className="bg-gradient-to-br from-[#173A32] via-[#112C26] to-[#0E2520] border border-[#2A5B50] rounded-[26px] p-5 shadow-lg cursor-pointer hover:border-[#19C7C0]/50 transition-all group relative overflow-hidden text-[#F4FAF7] font-sans"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#19C7C0]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[#2A5B50] mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#19C7C0]/20 border border-[#19C7C0]/30 flex items-center justify-center text-[#19C7C0] shadow-inner">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-[#F4FAF7] tracking-wide uppercase">
                PERFORMANCE SNAPSHOT
              </h2>
              <p className="text-[10px] text-[#C7DAD3] font-semibold">
                Personal Progress Overview ({monthName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-[#C7DAD3] bg-[#112C26] px-3 py-1 rounded-full border border-[#2A5B50] group-hover:text-[#19C7C0] transition">
            <span>View Details</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#19C7C0] group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Main 4 Grid Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* 1. PERFORMANCE RING (Efficiency Score) */}
          <div className="bg-[#112C26] rounded-2xl p-3.5 border border-[#2A5B50] flex items-center gap-3.5 shadow-sm">
            <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
              {efficiencyResult ? (
                <>
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-[#173A32]"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-[#19C7C0]"
                      strokeDasharray={`${efficiencyResult.finalScore}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-black text-[#F4FAF7]">{efficiencyResult.finalScore}%</span>
                  </div>
                </>
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#173A32] border border-[#2A5B50] flex items-center justify-center text-[#C7DAD3]">
                  <BarChart3 className="w-5 h-5 opacity-50" />
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-extrabold text-[#C7DAD3] uppercase tracking-wider">Efficiency</p>
              {efficiencyResult ? (
                <>
                  <p className="text-lg font-black text-[#F4FAF7] leading-tight">{efficiencyResult.finalScore}%</p>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-[#19C7C0]/20 text-[#19C7C0] border border-[#19C7C0]/30">
                    {efficiencyResult.grade}
                  </span>
                </>
              ) : (
                <p className="text-xs font-bold text-[#F2C75C] mt-0.5 leading-snug">
                  Not available yet
                </p>
              )}
            </div>
          </div>

          {/* 2. TASK PERFORMANCE */}
          <div className="bg-[#112C26] rounded-2xl p-3.5 border border-[#2A5B50] flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-extrabold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#35C98A]" /> Tasks
              </span>
              <span className="text-[10px] font-black text-[#35C98A] font-mono">
                {taskStats.completionRate}% Rate
              </span>
            </div>

            {taskStats.hasTasks ? (
              <div className="space-y-1 my-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#C7DAD3]">Completed:</span>
                  <span className="font-black text-[#F4FAF7]">{taskStats.completed} / {taskStats.assigned}</span>
                </div>
                <div className="w-full bg-[#173A32] h-1.5 rounded-full overflow-hidden border border-[#2A5B50]">
                  <div 
                    className="bg-[#35C98A] h-full rounded-full transition-all duration-500"
                    style={{ width: `${taskStats.completionRate}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-[#9FB9AF] italic my-1">
                No tasks assigned this month
              </p>
            )}
          </div>

          {/* 3. ATTENDANCE PERFORMANCE */}
          <div className="bg-[#112C26] rounded-2xl p-3.5 border border-[#2A5B50] flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-extrabold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-[#19C7C0]" /> Attendance
              </span>
              <span className="text-[10px] font-black text-[#C7DAD3]">
                {monthName}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 text-center my-1">
              <div className="bg-[#173A32] p-1 rounded-lg border border-[#2A5B50]">
                <p className="text-[8px] text-[#C7DAD3] font-bold">Present</p>
                <p className="text-xs font-black text-[#F4FAF7]">{attendanceCounts.present}</p>
              </div>
              <div className="bg-[#35C98A]/10 p-1 rounded-lg border border-[#35C98A]/20">
                <p className="text-[8px] text-[#35C98A] font-bold">WFH</p>
                <p className="text-xs font-black text-[#35C98A]">{attendanceCounts.wfh}</p>
              </div>
              <div className="bg-[#F2C75C]/10 p-1 rounded-lg border border-[#F2C75C]/20">
                <p className="text-[8px] text-[#F2C75C] font-bold">Client</p>
                <p className="text-xs font-black text-[#F2C75C]">{attendanceCounts.clientVisit}</p>
              </div>
              <div className="bg-[#19C7C0]/10 p-1 rounded-lg border border-[#19C7C0]/20">
                <p className="text-[8px] text-[#19C7C0] font-bold">Leave</p>
                <p className="text-xs font-black text-[#19C7C0]">{attendanceCounts.leave}</p>
              </div>
            </div>
          </div>

          {/* 4. PERFORMANCE TREND */}
          <div className="bg-[#112C26] rounded-2xl p-3.5 border border-[#2A5B50] flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-extrabold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-[#19C7C0]" /> Trend
            </span>

            {trendData.hasData ? (
              <div className="flex items-center justify-between my-1">
                <div>
                  <span className="text-[9px] text-[#9FB9AF] block">Previous vs Current</span>
                  <p className="text-xs font-black text-[#F4FAF7]">
                    {trendData.prevScore}% &rarr; {trendData.currentScore}%
                  </p>
                </div>

                <div className={`px-2 py-1 rounded-xl text-[10px] font-black border flex items-center gap-1 ${
                  trendData.state === 'Improving' ? 'bg-[#35C98A]/20 text-[#35C98A] border-[#35C98A]/30' :
                  trendData.state === 'Needs Attention' ? 'bg-[#EF6B73]/20 text-[#EF6B73] border-[#EF6B73]/30' :
                  'bg-[#19C7C0]/20 text-[#19C7C0] border-[#19C7C0]/30'
                }`}>
                  {trendData.state === 'Improving' && <TrendingUp className="w-3 h-3" />}
                  {trendData.state === 'Needs Attention' && <TrendingDown className="w-3 h-3" />}
                  <span>{trendData.state === 'Improving' ? '↑ Improving' : trendData.state === 'Needs Attention' ? '↓ Needs Attention' : '→ Stable'}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs font-semibold text-[#9FB9AF] italic my-1">
                Not enough data yet
              </p>
            )}
          </div>

        </div>

        {/* Positive Feedback Banner (if applicable) */}
        {positiveMessage && (
          <div className="mt-3.5 p-2.5 bg-[#19C7C0]/15 border border-[#19C7C0]/30 rounded-2xl text-xs font-bold text-[#F4FAF7] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#F2C75C] shrink-0" />
            <span>{positiveMessage}</span>
          </div>
        )}

        {/* Offline indicator */}
        {!isOnline && lastUpdatedTime && (
          <p className="text-[10px] text-[#9FB9AF] mt-2 text-right italic font-mono">
            Cached values • Last updated: {lastUpdatedTime}
          </p>
        )}
      </div>

      {/* ==================================================== */}
      {/* "MY PERFORMANCE" DEDICATED MODAL VIEW */}
      {/* ==================================================== */}
      <AnimatePresence>
        {showDetailModal && (
          <div 
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fade-in"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-[#173A32] border border-[#2A5B50] rounded-[28px] p-5 sm:p-6 shadow-2xl text-[#F4FAF7] space-y-5 max-h-[90vh] overflow-y-auto relative font-sans"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-[#2A5B50] pb-4">
                <div>
                  <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#19C7C0]" />
                    MY PERFORMANCE
                  </p>
                  <h2 className="text-xl sm:text-2xl font-black text-[#F4FAF7] mt-1">
                    {employeeName}
                  </h2>
                  <p className="text-xs text-[#C7DAD3] font-medium">
                    Employee Code: <strong className="text-[#F4FAF7]">{employeeCode}</strong> • {department}
                  </p>
                </div>

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 rounded-xl bg-[#112C26] hover:bg-[#21483E] text-[#C7DAD3] hover:text-[#F4FAF7] transition-all border border-[#2A5B50] cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Overall Efficiency Card */}
              <div className="p-4 rounded-2xl bg-[#112C26] border border-[#2A5B50] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                    {efficiencyResult ? (
                      <>
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9155" className="stroke-[#173A32] fill-none stroke-[3.5]" />
                          <circle 
                            cx="18" 
                            cy="18" 
                            r="15.9155" 
                            className="stroke-[#19C7C0] fill-none stroke-[3.5]" 
                            strokeDasharray={`${efficiencyResult.finalScore}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-black text-[#F4FAF7]">{efficiencyResult.finalScore}%</span>
                        </div>
                      </>
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-[#173A32] border border-[#2A5B50] flex items-center justify-center text-[#C7DAD3] text-xs font-bold">
                        N/A
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold text-[#C7DAD3] uppercase tracking-wider">Overall Efficiency Score</span>
                    <h3 className="text-xl font-black text-[#F4FAF7] leading-tight">
                      {efficiencyResult ? `${efficiencyResult.finalScore}%` : 'Not available yet'}
                    </h3>
                    {efficiencyResult && (
                      <span className="text-xs font-bold text-[#C7DAD3] mt-0.5 block">
                        Grade: <strong className="text-[#F2C75C]">{efficiencyResult.grade}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs bg-[#173A32] p-3 rounded-xl border border-[#2A5B50] w-full sm:w-auto">
                  <p className="text-[10px] text-[#C7DAD3] font-bold uppercase">Period</p>
                  <p className="font-mono text-[#F4FAF7] font-bold mt-0.5">{monthName} {currentYear}</p>
                </div>
              </div>

              {/* Task Performance Detailed Breakdown */}
              <div className="p-4 bg-[#112C26] rounded-2xl border border-[#2A5B50] space-y-3">
                <div className="flex justify-between items-center border-b border-[#2A5B50] pb-2">
                  <span className="text-xs font-black text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#35C98A]" /> Task Performance
                  </span>
                  <span className="text-xs font-black text-[#35C98A] font-mono">
                    {taskStats.completionRate}% Completion Rate
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-[#173A32] rounded-xl border border-[#2A5B50]">
                    <p className="text-[10px] font-bold text-[#C7DAD3] uppercase">Assigned</p>
                    <p className="text-base font-black text-[#F4FAF7]">{taskStats.assigned}</p>
                  </div>
                  <div className="p-2.5 bg-[#35C98A]/10 rounded-xl border border-[#35C98A]/30">
                    <p className="text-[10px] font-bold text-[#35C98A] uppercase">Completed</p>
                    <p className="text-base font-black text-[#35C98A]">{taskStats.completed}</p>
                  </div>
                  <div className="p-2.5 bg-[#F2C75C]/10 rounded-xl border border-[#F2C75C]/30">
                    <p className="text-[10px] font-bold text-[#F2C75C] uppercase">In Progress</p>
                    <p className="text-base font-black text-[#F2C75C]">{taskStats.inProgress}</p>
                  </div>
                </div>
              </div>

              {/* Attendance Detailed Breakdown */}
              <div className="p-4 bg-[#112C26] rounded-2xl border border-[#2A5B50] space-y-3">
                <div className="flex justify-between items-center border-b border-[#2A5B50] pb-2">
                  <span className="text-xs font-black text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-[#19C7C0]" /> Attendance Breakdown
                  </span>
                  <span className="text-xs font-black text-[#C7DAD3]">
                    {attendanceCounts.present} Days Logged
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-[#173A32] rounded-xl border border-[#2A5B50]">
                    <p className="text-[10px] font-bold text-[#C7DAD3] uppercase">Office</p>
                    <p className="text-base font-black text-[#F4FAF7]">{attendanceCounts.office}</p>
                  </div>
                  <div className="p-2.5 bg-[#35C98A]/10 rounded-xl border border-[#35C98A]/30">
                    <p className="text-[10px] font-bold text-[#35C98A] uppercase">WFH</p>
                    <p className="text-base font-black text-[#35C98A]">{attendanceCounts.wfh}</p>
                  </div>
                  <div className="p-2.5 bg-[#F2C75C]/10 rounded-xl border border-[#F2C75C]/30">
                    <p className="text-[10px] font-bold text-[#F2C75C] uppercase">Client</p>
                    <p className="text-base font-black text-[#F2C75C]">{attendanceCounts.clientVisit}</p>
                  </div>
                  <div className="p-2.5 bg-[#19C7C0]/10 rounded-xl border border-[#19C7C0]/30">
                    <p className="text-[10px] font-bold text-[#19C7C0] uppercase">Leave</p>
                    <p className="text-base font-black text-[#19C7C0]">{attendanceCounts.leave}</p>
                  </div>
                </div>
              </div>

              {/* Weekly Progress Bar Chart */}
              <div className="p-4 bg-[#112C26] rounded-2xl border border-[#2A5B50] space-y-3">
                <div className="flex justify-between items-center border-b border-[#2A5B50] pb-2">
                  <span className="text-xs font-black text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#19C7C0]" /> Weekly Progress (This Week)
                  </span>
                </div>

                {weeklyProgress.hasReliableData ? (
                  <div className="space-y-2 pt-1">
                    {weeklyProgress.weekDays.map(day => (
                      <div key={day.dateStr} className="flex items-center gap-3 text-xs">
                        <span className="w-8 font-bold text-[#C7DAD3]">{day.label}</span>
                        <div className="flex-1 bg-[#173A32] h-3 rounded-full overflow-hidden border border-[#2A5B50]">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${day.isFuture ? 'bg-[#21483E]' : 'bg-[#19C7C0]'}`}
                            style={{ width: `${day.completionRate}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-black font-mono text-[#F4FAF7]">
                          {day.isFuture ? '—' : `${day.completionRate}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#9FB9AF] italic py-2">
                    Not enough weekly activity recorded yet.
                  </p>
                )}
              </div>

              {/* Performance Trend Detail */}
              <div className="p-4 bg-[#112C26] rounded-2xl border border-[#2A5B50] flex justify-between items-center text-xs">
                <div>
                  <span className="text-[#C7DAD3] font-bold uppercase text-[10px]">Performance Trend</span>
                  <p className="font-black text-[#F4FAF7] text-sm mt-0.5">
                    {trendData.hasData ? `${trendData.prevScore}% → ${trendData.currentScore}%` : 'Not enough data yet'}
                  </p>
                </div>
                {trendData.hasData && (
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                    trendData.state === 'Improving' ? 'bg-[#35C98A]/20 text-[#35C98A] border-[#35C98A]/30' :
                    trendData.state === 'Needs Attention' ? 'bg-[#EF6B73]/20 text-[#EF6B73] border-[#EF6B73]/30' :
                    'bg-[#19C7C0]/20 text-[#19C7C0] border-[#19C7C0]/30'
                  }`}>
                    {trendData.state === 'Improving' ? '↑ Improving' : trendData.state === 'Needs Attention' ? '↓ Needs Attention' : '→ Stable'}
                  </span>
                )}
              </div>

              {/* Modal Close Action */}
              <div className="pt-2">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full py-3.5 bg-[#19C7C0] hover:bg-[#19C7C0]/90 text-[#112C26] font-extrabold rounded-2xl text-xs transition-all shadow-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
