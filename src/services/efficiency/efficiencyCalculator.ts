import { TaskRecord, getEffectiveTaskStatus } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { 
  EfficiencyBreakdown, 
  EfficiencyGrade, 
  EfficiencySnapshot, 
  EfficiencyWeightages, 
  getEfficiencyGrade 
} from '../../types/efficiency';

/**
 * Checks if a formatted time string (e.g. "09:30 AM") is late (after 09:30 AM).
 */
export const isLateCheckIn = (checkInTimeStr: string): boolean => {
  if (!checkInTimeStr) return false;
  try {
    const trimmed = checkInTimeStr.trim().toUpperCase();
    const parts = trimmed.split(' ');
    if (parts.length < 2) return false;
    const timePart = parts[0];
    const modifier = parts[1]; // AM or PM
    let [hours, minutes] = timePart.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    
    // threshold: 09:30 AM -> 9 hours 30 mins
    const minutesSinceMidnight = hours * 60 + minutes;
    const thresholdMinutes = 9 * 60 + 30;
    return minutesSinceMidnight > thresholdMinutes;
  } catch (err) {
    return false;
  }
};

/**
 * Calculates weekdays (Mon-Fri) in YYYY-MM-DD range, capping at today to avoid future planning skew.
 */
export const calculateExpectedWorkingDays = (startDateStr: string, endDateStr: string): number => {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const today = new Date();
    
    // Cap at today so we don't penalize for future days of the week/month
    const limitDate = end < today ? end : today;
    
    if (start > limitDate) return 0;
    
    let count = 0;
    const cur = new Date(start);
    while (cur <= limitDate) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) { // Not Sunday (0) or Saturday (6)
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count || 1; // Default to 1 to prevent division by zero
  } catch (err) {
    return 1;
  }
};

let calcInvocationCount = 0;

/**
 * Pure function to calculate efficiency breakdown and final score.
 */
export const calculateEfficiency = (
  employeeId: string,
  employeeCode: string,
  employeeName: string,
  department: string,
  teamLeaderId: string | null,
  startDateStr: string,
  endDateStr: string,
  tasks: TaskRecord[],
  attendanceRecords: AttendanceRecord[],
  weightages: EfficiencyWeightages
): { finalScore: number; grade: EfficiencyGrade; breakdown: EfficiencyBreakdown } => {
  calcInvocationCount++;
  const calcId = calcInvocationCount;
  const startTime = performance.now();

  console.log(`[EFFICIENCY_CALC_START] #${calcId} for employee=${employeeCode || employeeId} (${employeeName}) period=${startDateStr}..${endDateStr} inputTasks=${tasks.length} inputAtt=${attendanceRecords.length}`);
  
  // ----------------------------------------------------
  // 1. FILTER RELEVANT RECORDS FOR THE PERIOD
  // ----------------------------------------------------
  
  // Filter attendance records in period
  const periodAttendance = attendanceRecords.filter(rec => {
    const matchId = rec.employeeId && (rec.employeeId === employeeCode || rec.employeeId === employeeId);
    const matchCode = rec.employeeCode && (rec.employeeCode === employeeCode || rec.employeeCode === employeeId);
    const isEmp = matchId || matchCode;
    return isEmp && rec.date >= startDateStr && rec.date <= endDateStr;
  });

  // Filter tasks in period
  const periodTasks = tasks.filter(task => {
    const matchCode = task.assignedToEmployeeCodes && (
      task.assignedToEmployeeCodes.includes(employeeCode) || 
      task.assignedToEmployeeCodes.includes(employeeId)
    );
    const matchId = task.assignedToEmployeeIds && (
      task.assignedToEmployeeIds.includes(employeeId) || 
      task.assignedToEmployeeIds.includes(employeeCode)
    );
    const isAssigned = matchCode || matchId;
    
    if (!isAssigned) return false;
    
    // Task date is either due date or completed date
    const taskDate = task.dueDate || (task.completedAt ? task.completedAt.substring(0, 10) : task.createdAtDeviceTime.substring(0, 10));
    return taskDate >= startDateStr && taskDate <= endDateStr;
  });

  // Deduplicate tasks by ID to prevent inflation
  const dedupedTasksMap = new Map<string, TaskRecord>();
  periodTasks.forEach(t => {
    if (t.id) dedupedTasksMap.set(t.id, t);
  });
  const uniqueTasks = Array.from(dedupedTasksMap.values());

  // Filter out cancelled status if any exists
  const validTasks = uniqueTasks.filter(t => {
    const s = (t.status || '').toUpperCase().trim();
    return s !== 'CANCELLED' && s !== 'CANCEL';
  });

  const isCompletedTask = (t: TaskRecord): boolean => {
    const s = (t.status || '').toUpperCase().trim();
    return s === 'COMPLETED' || t.approvalStatus === 'APPROVED' || getEffectiveTaskStatus(t) === 'Completed';
  };

  const isOverdueTask = (t: TaskRecord): boolean => {
    return getEffectiveTaskStatus(t) === 'Overdue';
  };

  // ----------------------------------------------------
  // 2. TASK COMPLETION SCORE
  // ----------------------------------------------------
  const assignedTasksCount = validTasks.length;
  const completedTasksCount = validTasks.filter(isCompletedTask).length;
  
  const taskCompletionScore = assignedTasksCount > 0 
    ? Math.round((completedTasksCount / assignedTasksCount) * 100) 
    : -1; // NO DATA

  // ----------------------------------------------------
  // 3. ON-TIME COMPLETION SCORE
  // ----------------------------------------------------
  const completedTasks = validTasks.filter(isCompletedTask);
  
  let onTimeTasksCount = 0;
  completedTasks.forEach(task => {
    if (task.completedAt && task.dueDate) {
      const completedDateOnly = task.completedAt.substring(0, 10);
      if (completedDateOnly <= task.dueDate) {
        onTimeTasksCount++;
      }
    } else {
      // Fallback: check if effective status is not Overdue
      const effective = getEffectiveTaskStatus(task);
      if (effective === 'Completed') {
        onTimeTasksCount++;
      }
    }
  });

  const onTimeCompletionScore = completedTasksCount > 0
    ? Math.round((onTimeTasksCount / completedTasksCount) * 100)
    : -1; // NO DATA (Neutral state handled safely)

  // ----------------------------------------------------
  // 4. QUALITY / APPROVAL SCORE
  // ----------------------------------------------------
  // Filter completed tasks that have been reviewed (APPROVED or REVISION_REQUIRED / Revision Requested)
  const reviewedTasks = completedTasks.filter(t => 
    t.approvalStatus === 'APPROVED' || 
    t.approvalStatus === 'REVISION_REQUIRED' ||
    (t.revisions && t.revisions.length > 0)
  );
  
  const approvedTasksCount = completedTasks.filter(t => t.approvalStatus === 'APPROVED' || (!t.revisionCount && (!t.revisions || t.revisions.length === 0))).length;
  const revisionRequiredTasksCount = completedTasks.filter(t => t.approvalStatus === 'REVISION_REQUIRED' || (t.revisions && t.revisions.length > 0)).length;
  const totalRevisionRequests = completedTasks.reduce((sum, t) => sum + (t.revisionCount || t.revisions?.length || 0), 0);

  let qualityScore = -1; // Default to NO DATA
  
  if (completedTasksCount > 0) {
    if (reviewedTasks.length > 0) {
      const baseRatioScore = (approvedTasksCount / reviewedTasks.length) * 100;
      
      // Calculate progressive penalty for repeated revisions on each task
      let progressiveRevPenalty = 0;
      completedTasks.forEach(task => {
        const revs = task.revisionCount || task.revisions?.length || 0;
        if (revs === 1) {
          progressiveRevPenalty += 10;
        } else if (revs === 2) {
          progressiveRevPenalty += 25;
        } else if (revs >= 3) {
          progressiveRevPenalty += 50;
        }
      });
      
      // Normalize penalty across completed tasks
      const normalizedRevPenalty = progressiveRevPenalty / completedTasksCount;
      qualityScore = Math.max(0, Math.min(100, Math.round(baseRatioScore - normalizedRevPenalty)));
    } else {
      // If completed tasks exist but none are reviewed yet, give a neutral starting 100 points
      qualityScore = 100;
    }
  }

  // ----------------------------------------------------
  // 5. ATTENDANCE / PUNCTUALITY SCORE
  // ----------------------------------------------------
  const expectedWorkingDays = calculateExpectedWorkingDays(startDateStr, endDateStr);
  const attendanceDaysCount = periodAttendance.length;
  
  const validCheckInsCount = periodAttendance.filter(rec => rec.checkInTime).length;
  const validCheckOutsCount = periodAttendance.filter(rec => 
    rec.checkOutTime && 
    rec.checkOutTime !== 'N/A' && 
    rec.checkoutStatus !== 'UNRESOLVED' && 
    rec.checkoutStatus !== 'PENDING_ADMIN_REVIEW'
  ).length;
  const lateArrivalsCount = periodAttendance.filter(rec => {
    return isLateCheckIn(rec.checkInTime);
  }).length;

  let punctualityScore = -1; // Default to NO DATA
  
  if (attendanceDaysCount > 0) {
    const attendanceRate = Math.min(1, attendanceDaysCount / expectedWorkingDays);
    const onTimeCheckIns = attendanceDaysCount - lateArrivalsCount;
    const punctualityRatio = onTimeCheckIns / attendanceDaysCount;
    const checkoutRatio = validCheckOutsCount / attendanceDaysCount;
    
    // Punctuality Score composite:
    // 50% punctuality ratio, 30% attendance rate, 20% checkout logging compliance
    punctualityScore = Math.round(
      (punctualityRatio * 0.5 + attendanceRate * 0.3 + checkoutRatio * 0.2) * 100
    );
    punctualityScore = Math.max(0, Math.min(100, punctualityScore));
  }

  // ----------------------------------------------------
  // 6. WORKLOAD SCORE
  // ----------------------------------------------------
  let workloadScore = -1; // Default to NO DATA
  const overdueTasksCount = validTasks.filter(isOverdueTask).length;

  if (assignedTasksCount > 0) {
    // Average completion percentage of non-completed (active) tasks
    const activeTasks = validTasks.filter(t => !isCompletedTask(t));
    const activeCompletionSum = activeTasks.reduce((sum, t) => sum + (t.completionPercentage || 0), 0);
    const averageActiveCompletion = activeTasks.length > 0 ? activeCompletionSum / activeTasks.length : 0;
    
    // Normalized base: completed percentage of workload + partial progress on active
    const completedWeight = completedTasksCount / assignedTasksCount;
    const activeWeight = (activeTasks.length * (averageActiveCompletion / 100)) / assignedTasksCount;
    const workloadBase = (completedWeight + activeWeight) * 100;
    
    // Penalty for active overdue tasks in workload
    const workloadOverduePenalty = overdueTasksCount * 15;
    
    workloadScore = Math.max(0, Math.min(100, Math.round(workloadBase - workloadOverduePenalty)));
  }

  // ----------------------------------------------------
  // 7. PENALTIES (Controlled non-linear)
  // ----------------------------------------------------
  // Overdue Penalty: 1st task = 3pts, 2nd task = 7pts, 3+ tasks = 10pts
  let overduePenalty = 0;
  if (overdueTasksCount === 1) {
    overduePenalty = 3;
  } else if (overdueTasksCount === 2) {
    overduePenalty = 7;
  } else if (overdueTasksCount >= 3) {
    overduePenalty = 10;
  }

  // Revision Penalty: 1st = 2pts, 2nd = 5pts, 3rd = 8pts, 4+ = 10pts
  let revisionPenalty = 0;
  if (totalRevisionRequests === 1) {
    revisionPenalty = 2;
  } else if (totalRevisionRequests === 2) {
    revisionPenalty = 5;
  } else if (totalRevisionRequests === 3) {
    revisionPenalty = 8;
  } else if (totalRevisionRequests >= 4) {
    revisionPenalty = 10;
  }

  // ----------------------------------------------------
  // 8. FINAL SCORE & NORMALIZATION
  // ----------------------------------------------------
  const scores = [
    { score: taskCompletionScore, weight: weightages.taskCompletion },
    { score: onTimeCompletionScore, weight: weightages.onTimeCompletion },
    { score: qualityScore, weight: weightages.quality },
    { score: punctualityScore, weight: weightages.punctuality },
    { score: workloadScore, weight: weightages.workload }
  ];

  let sumOfAvailableWeights = 0;
  let weightedScoreSum = 0;

  scores.forEach(s => {
    if (s.score !== -1) {
      sumOfAvailableWeights += s.weight;
      weightedScoreSum += s.score * s.weight;
    }
  });

  const weightedBaseScore = sumOfAvailableWeights > 0
    ? weightedScoreSum / sumOfAvailableWeights
    : 0;

  // Final Score = Weighted Base - Overdue Penalty - Revision Penalty
  const calculatedFinalScore = sumOfAvailableWeights > 0
    ? Math.max(0, Math.min(100, Math.round(weightedBaseScore - overduePenalty - revisionPenalty)))
    : 0;

  const finalScore = calculatedFinalScore;
  const grade = getEfficiencyGrade(finalScore);

  const breakdown: EfficiencyBreakdown = {
    taskCompletionScore,
    onTimeCompletionScore,
    qualityScore,
    punctualityScore,
    workloadScore,
    
    assignedTasksCount,
    completedTasksCount,
    onTimeTasksCount,
    approvedTasksCount,
    revisionRequiredTasksCount,
    totalRevisionRequests,
    
    attendanceDaysCount,
    lateArrivalsCount,
    validCheckInsCount,
    validCheckOutsCount,
    
    overdueTasksCount,
    overduePenalty,
    revisionPenalty
  };

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  console.log(`[EFFICIENCY_CALC_END] #${calcId} employee=${employeeCode || employeeId} finalScore=${finalScore}% grade=${grade} elapsedMs=${durationMs}ms (totalCalculationsTotal=${calcInvocationCount})`);

  return {
    finalScore,
    grade,
    breakdown
  };
};
