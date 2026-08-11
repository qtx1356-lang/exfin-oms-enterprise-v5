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
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<EfficiencySnapshot[]>([]);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('');

  // Async load weightages & historical snapshots after main dashboard mounts
  useEffect(() => {
    let isMounted = true;

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
    const completed = monthTasks.filter(t => t.status === 'COMPLETED').length;
    const inProgress = monthTasks.filter(t => t.status === 'IN_PROGRESS').length;
    const overdue = monthTasks.filter(t => getEffectiveTaskStatus(t) === 'OVERDUE').length;
    
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
        className="bg-gradient-to-br from-[#2D1B5A] via-[#35206A] to-[#211044] border border-purple-500/30 rounded-[26px] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] cursor-pointer hover:border-purple-400/50 transition-all group relative overflow-hidden text-white font-sans"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#7C3AED]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-purple-500/20 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#7C3AED]/20 border border-purple-500/30 flex items-center justify-center text-[#A78BFA] shadow-inner">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
                PERFORMANCE SNAPSHOT
              </h2>
              <p className="text-[10px] text-purple-300/80 font-semibold">
                Personal Progress Overview ({monthName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-purple-300 bg-[#211044]/90 px-3 py-1 rounded-full border border-purple-500/30 group-hover:text-white transition">
            <span>View Details</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#A78BFA] group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Main 4 Grid Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* 1. PERFORMANCE RING (Efficiency Score) */}
          <div className="bg-[#211044]/80 rounded-2xl p-3.5 border border-purple-500/20 flex items-center gap-3.5 shadow-sm">
            <div className="relative w-14 h-14 flex-shrink-0 flex items-center justify-center">
              {efficiencyResult ? (
                <>
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-purple-950"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-[#7C3AED]"
                      strokeDasharray={`${efficiencyResult.finalScore}, 100`}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-black text-white">{efficiencyResult.finalScore}%</span>
                  </div>
                </>
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-900/40 border border-purple-500/20 flex items-center justify-center text-purple-300">
                  <BarChart3 className="w-5 h-5 opacity-50" />
                </div>
              )}
            </div>

            <div>
              <p className="text-[10px] font-extrabold text-purple-300/80 uppercase tracking-wider">Efficiency</p>
              {efficiencyResult ? (
                <>
                  <p className="text-lg font-black text-white leading-tight">{efficiencyResult.finalScore}%</p>
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/30">
                    {efficiencyResult.grade}
                  </span>
                </>
              ) : (
                <p className="text-xs font-bold text-amber-300/90 mt-0.5 leading-snug">
                  Not available yet
                </p>
              )}
            </div>
          </div>

          {/* 2. TASK PERFORMANCE */}
          <div className="bg-[#211044]/80 rounded-2xl p-3.5 border border-purple-500/20 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Tasks
              </span>
              <span className="text-[10px] font-black text-emerald-300 font-mono">
                {taskStats.completionRate}% Rate
              </span>
            </div>

            {taskStats.hasTasks ? (
              <div className="space-y-1 my-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-purple-300/80">Completed:</span>
                  <span className="font-black text-white">{taskStats.completed} / {taskStats.assigned}</span>
                </div>
                <div className="w-full bg-purple-950 h-1.5 rounded-full overflow-hidden border border-purple-500/20">
                  <div 
                    className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${taskStats.completionRate}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-purple-300/60 italic my-1">
                No tasks assigned this month
              </p>
            )}
          </div>

          {/* 3. ATTENDANCE PERFORMANCE */}
          <div className="bg-[#211044]/80 rounded-2xl p-3.5 border border-purple-500/20 flex flex-col justify-between shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-purple-400" /> Attendance
              </span>
              <span className="text-[10px] font-black text-purple-200">
                {monthName}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 text-center my-1">
              <div className="bg-purple-950/60 p-1 rounded-lg border border-purple-500/10">
                <p className="text-[8px] text-purple-300 font-bold">Present</p>
                <p className="text-xs font-black text-white">{attendanceCounts.present}</p>
              </div>
              <div className="bg-emerald-950/40 p-1 rounded-lg border border-emerald-500/20">
                <p className="text-[8px] text-emerald-300 font-bold">WFH</p>
                <p className="text-xs font-black text-emerald-300">{attendanceCounts.wfh}</p>
              </div>
              <div className="bg-amber-950/40 p-1 rounded-lg border border-amber-500/20">
                <p className="text-[8px] text-amber-300 font-bold">Client</p>
                <p className="text-xs font-black text-amber-300">{attendanceCounts.clientVisit}</p>
              </div>
              <div className="bg-cyan-950/40 p-1 rounded-lg border border-cyan-500/20">
                <p className="text-[8px] text-cyan-300 font-bold">Leave</p>
                <p className="text-xs font-black text-cyan-300">{attendanceCounts.leave}</p>
              </div>
            </div>
          </div>

          {/* 4. PERFORMANCE TREND */}
          <div className="bg-[#211044]/80 rounded-2xl p-3.5 border border-purple-500/20 flex flex-col justify-between shadow-sm">
            <span className="text-[10px] font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1 mb-1">
              <TrendingUp className="w-3 h-3 text-pink-400" /> Trend
            </span>

            {trendData.hasData ? (
              <div className="flex items-center justify-between my-1">
                <div>
                  <span className="text-[9px] text-purple-300/70 block">Previous vs Current</span>
                  <p className="text-xs font-black text-white">
                    {trendData.prevScore}% &rarr; {trendData.currentScore}%
                  </p>
                </div>

                <div className={`px-2 py-1 rounded-xl text-[10px] font-black border flex items-center gap-1 ${
                  trendData.state === 'Improving' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  trendData.state === 'Needs Attention' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                  'bg-purple-500/20 text-purple-200 border-purple-500/30'
                }`}>
                  {trendData.state === 'Improving' && <TrendingUp className="w-3 h-3" />}
                  {trendData.state === 'Needs Attention' && <TrendingDown className="w-3 h-3" />}
                  <span>{trendData.state === 'Improving' ? '↑ Improving' : trendData.state === 'Needs Attention' ? '↓ Needs Attention' : '→ Stable'}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs font-semibold text-purple-300/70 italic my-1">
                Not enough data yet
              </p>
            )}
          </div>

        </div>

        {/* Positive Feedback Banner (if applicable) */}
        {positiveMessage && (
          <div className="mt-3.5 p-2.5 bg-[#7C3AED]/15 border border-purple-500/25 rounded-2xl text-xs font-bold text-purple-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{positiveMessage}</span>
          </div>
        )}

        {/* Offline indicator */}
        {!isOnline && lastUpdatedTime && (
          <p className="text-[10px] text-purple-300/60 mt-2 text-right italic font-mono">
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
              className="w-full max-w-2xl bg-[#1D0C3E] border border-purple-500/40 rounded-[28px] p-5 sm:p-6 shadow-2xl text-white space-y-5 max-h-[90vh] overflow-y-auto relative font-sans"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-purple-500/25 pb-4">
                <div>
                  <p className="text-[10px] text-purple-300 font-extrabold uppercase tracking-widest flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#7C3AED]" />
                    MY PERFORMANCE
                  </p>
                  <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                    {employeeName}
                  </h2>
                  <p className="text-xs text-purple-300/80 font-medium">
                    Employee Code: <strong className="text-white">{employeeCode}</strong> • {department}
                  </p>
                </div>

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 text-purple-200 hover:text-white transition-all border border-purple-500/30"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Overall Efficiency Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#2D1B5A] to-[#3B2272] border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                    {efficiencyResult ? (
                      <>
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9155" className="stroke-purple-950 fill-none stroke-[3.5]" />
                          <circle 
                            cx="18" 
                            cy="18" 
                            r="15.9155" 
                            className="stroke-[#7C3AED] fill-none stroke-[3.5]" 
                            strokeDasharray={`${efficiencyResult.finalScore}, 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-black text-white">{efficiencyResult.finalScore}%</span>
                        </div>
                      </>
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-purple-900/40 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold">
                        N/A
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wider">Overall Efficiency Score</span>
                    <h3 className="text-xl font-black text-white leading-tight">
                      {efficiencyResult ? `${efficiencyResult.finalScore}%` : 'Not available yet'}
                    </h3>
                    {efficiencyResult && (
                      <span className="text-xs font-bold text-purple-300 mt-0.5 block">
                        Grade: <strong className="text-amber-300">{efficiencyResult.grade}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs bg-purple-950/70 p-3 rounded-xl border border-purple-500/20 w-full sm:w-auto">
                  <p className="text-[10px] text-purple-300 font-bold uppercase">Period</p>
                  <p className="font-mono text-white font-bold mt-0.5">{monthName} {currentYear}</p>
                </div>
              </div>

              {/* Task Performance Detailed Breakdown */}
              <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 space-y-3">
                <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                  <span className="text-xs font-black text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Task Performance
                  </span>
                  <span className="text-xs font-black text-emerald-300 font-mono">
                    {taskStats.completionRate}% Completion Rate
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-purple-900/40 rounded-xl border border-purple-500/20">
                    <p className="text-[10px] font-bold text-purple-300 uppercase">Assigned</p>
                    <p className="text-base font-black text-white">{taskStats.assigned}</p>
                  </div>
                  <div className="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-500/30">
                    <p className="text-[10px] font-bold text-emerald-300 uppercase">Completed</p>
                    <p className="text-base font-black text-emerald-300">{taskStats.completed}</p>
                  </div>
                  <div className="p-2.5 bg-amber-950/40 rounded-xl border border-amber-500/30">
                    <p className="text-[10px] font-bold text-amber-300 uppercase">In Progress</p>
                    <p className="text-base font-black text-amber-300">{taskStats.inProgress}</p>
                  </div>
                </div>
              </div>

              {/* Attendance Detailed Breakdown */}
              <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 space-y-3">
                <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                  <span className="text-xs font-black text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-purple-300" /> Attendance Breakdown
                  </span>
                  <span className="text-xs font-black text-purple-300">
                    {attendanceCounts.present} Days Logged
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-purple-900/40 rounded-xl border border-purple-500/20">
                    <p className="text-[10px] font-bold text-purple-300 uppercase">Office</p>
                    <p className="text-base font-black text-white">{attendanceCounts.office}</p>
                  </div>
                  <div className="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-500/30">
                    <p className="text-[10px] font-bold text-emerald-300 uppercase">WFH</p>
                    <p className="text-base font-black text-emerald-300">{attendanceCounts.wfh}</p>
                  </div>
                  <div className="p-2.5 bg-amber-950/40 rounded-xl border border-amber-500/30">
                    <p className="text-[10px] font-bold text-amber-300 uppercase">Client</p>
                    <p className="text-base font-black text-amber-300">{attendanceCounts.clientVisit}</p>
                  </div>
                  <div className="p-2.5 bg-cyan-950/40 rounded-xl border border-cyan-500/30">
                    <p className="text-[10px] font-bold text-cyan-300 uppercase">Leave</p>
                    <p className="text-base font-black text-cyan-300">{attendanceCounts.leave}</p>
                  </div>
                </div>
              </div>

              {/* Weekly Progress Bar Chart */}
              <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 space-y-3">
                <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                  <span className="text-xs font-black text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-pink-400" /> Weekly Progress (This Week)
                  </span>
                </div>

                {weeklyProgress.hasReliableData ? (
                  <div className="space-y-2 pt-1">
                    {weeklyProgress.weekDays.map(day => (
                      <div key={day.dateStr} className="flex items-center gap-3 text-xs">
                        <span className="w-8 font-bold text-purple-300">{day.label}</span>
                        <div className="flex-1 bg-purple-950 h-3 rounded-full overflow-hidden border border-purple-500/20">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${day.isFuture ? 'bg-purple-800/30' : 'bg-[#7C3AED]'}`}
                            style={{ width: `${day.completionRate}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-black font-mono text-purple-200">
                          {day.isFuture ? '—' : `${day.completionRate}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-purple-300/60 italic py-2">
                    Not enough weekly activity recorded yet.
                  </p>
                )}
              </div>

              {/* Performance Trend Detail */}
              <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 flex justify-between items-center text-xs">
                <div>
                  <span className="text-purple-300 font-bold uppercase text-[10px]">Performance Trend</span>
                  <p className="font-black text-white text-sm mt-0.5">
                    {trendData.hasData ? `${trendData.prevScore}% → ${trendData.currentScore}%` : 'Not enough data yet'}
                  </p>
                </div>
                {trendData.hasData && (
                  <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                    trendData.state === 'Improving' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                    trendData.state === 'Needs Attention' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                    'bg-purple-500/20 text-purple-200 border-purple-500/30'
                  }`}>
                    {trendData.state === 'Improving' ? '↑ Improving' : trendData.state === 'Needs Attention' ? '↓ Needs Attention' : '→ Stable'}
                  </span>
                )}
              </div>

              {/* Modal Close Action */}
              <div className="pt-2">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-extrabold rounded-2xl text-xs transition-all shadow-lg active:scale-95"
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
