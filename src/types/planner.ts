export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';

export type TaskApprovalStatus = 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUIRED';

export type AssignmentType = 'EMPLOYEE' | 'MULTIPLE_EMPLOYEES' | 'DEPARTMENT';

export type TaskSyncStatus = 'Pending Sync' | 'Synced' | 'Sync Failed';

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'EMPLOYEE' | 'ADMIN' | 'TEAM_LEADER';
  content: string;
  timestamp: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description: string;
  
  // Assignment details
  assignmentType: AssignmentType;
  assignedToEmployeeIds: string[];
  assignedToEmployeeCodes: string[];
  assignedToDepartment: string;
  
  // Team Leader link
  teamLeaderId?: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName?: string | null;
  
  // Creator metadata
  createdBy: string;
  createdByName: string;
  
  // Task properties
  priority: TaskPriority;
  status: TaskStatus;
  approvalStatus?: TaskApprovalStatus;
  completionPercentage: number; // 0 to 100
  
  // Timestamps & deadlines
  startDate?: string;
  dueDate: string; // ISO string or YYYY-MM-DD
  dueTime?: string; // e.g. "17:00"
  
  // Revision & Conflict Tracking (Priority 3)
  revision?: number;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
  hasConflict?: boolean;
  conflictDetails?: {
    serverVersion: Partial<TaskRecord>;
    localVersion: Partial<TaskRecord>;
    conflictTime: string;
  } | null;

  // Timestamps for audit & efficiency analysis
  createdAtDeviceTime: string;
  updatedAtDeviceTime: string;
  serverSyncTime?: string | null;
  syncStatus: TaskSyncStatus;
  
  // Progress & Remarks
  comments: TaskComment[];
  managerRemarks?: string | null;
  
  // Completion & Review tracking
  completedAt?: string | null;
  completedBy?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAtDeviceTime?: string | null;
  reviewedBy?: string | null;
  reviewedAtDeviceTime?: string | null;
  reviewRemark?: string | null;
  revisionCount?: number;
  
  // Historical / Efficiency tracking timestamps
  assignedTime?: string;
  startedTime?: string | null;
  dueTimestampMs?: number;
}

/**
 * Calculates whether a task is overdue dynamically based on current time.
 */
export const isTaskOverdue = (task: TaskRecord): boolean => {
  if (task.status === 'COMPLETED') return false;
  if (!task.dueDate) return false;
  
  let dueDateTimeMs: number;
  if (task.dueTime && task.dueDate.includes('T') === false) {
    dueDateTimeMs = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
  } else {
    dueDateTimeMs = new Date(task.dueDate).getTime();
  }

  if (isNaN(dueDateTimeMs)) return false;
  return Date.now() > dueDateTimeMs;
};

/**
 * Derives current effective status considering dynamic overdue calculation.
 */
export const getEffectiveTaskStatus = (task: TaskRecord): TaskStatus => {
  if (task.status === 'COMPLETED') return 'COMPLETED';
  if (isTaskOverdue(task)) return 'OVERDUE';
  return task.status;
};
