export type EfficiencyGrade = 'Excellent' | 'Very Good' | 'Good' | 'Needs Improvement' | 'Critical';

export interface EfficiencyWeightages {
  taskCompletion: number;       // default: 30
  onTimeCompletion: number;     // default: 25
  quality: number;              // default: 20
  punctuality: number;          // default: 15
  workload: number;             // default: 10
}

export const DEFAULT_WEIGHTAGES: EfficiencyWeightages = {
  taskCompletion: 30,
  onTimeCompletion: 25,
  quality: 20,
  punctuality: 15,
  workload: 10
};

export type EfficiencyPeriodType = 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface EfficiencyPeriod {
  type: EfficiencyPeriodType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface EfficiencyBreakdown {
  taskCompletionScore: number;     // 0-100 or -1 for NO DATA
  onTimeCompletionScore: number;   // 0-100 or -1 for NO DATA
  qualityScore: number;            // 0-100 or -1 for NO DATA
  punctualityScore: number;        // 0-100 or -1 for NO DATA
  workloadScore: number;           // 0-100 or -1 for NO DATA
  
  // Counts and details used in calculation
  assignedTasksCount: number;
  completedTasksCount: number;
  onTimeTasksCount: number;
  approvedTasksCount: number;
  revisionRequiredTasksCount: number;
  totalRevisionRequests: number;
  
  attendanceDaysCount: number;
  lateArrivalsCount: number;
  validCheckInsCount: number;
  validCheckOutsCount: number;
  
  overdueTasksCount: number;
  overduePenalty: number;          // 0-10
  revisionPenalty: number;         // 0-10

  // Daily Work Details
  workDetailsSubmitted?: boolean;
  workDetailsCount?: number;
}

export interface SystemSettings {
  id: string; // 'efficiency_config' or similar
  efficiencyTaskCompletionWeight: number; // 30
  efficiencyOnTimeWeight: number;         // 25
  efficiencyQualityWeight: number;        // 20
  efficiencyPunctualityWeight: number;    // 15
  efficiencyWorkloadWeight: number;       // 10
  updatedAt: string;
  updatedBy: string;
  updatedByName: string;
}

export const getEfficiencyGrade = (score: number): EfficiencyGrade => {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Improvement';
  return 'Critical';
};
