export type TaskPriority = 
  | 'Critical' 
  | 'High' 
  | 'Medium' 
  | 'Low' 
  | 'CRITICAL' 
  | 'HIGH' 
  | 'MEDIUM' 
  | 'LOW' 
  | 'URGENT';

export type CanonicalTaskPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export const getCanonicalPriority = (priority?: TaskPriority | string | null): CanonicalTaskPriority => {
  if (!priority) return 'Medium';
  const p = priority.toUpperCase().trim();
  if (p === 'CRITICAL' || p === 'URGENT') return 'Critical';
  if (p === 'HIGH') return 'High';
  if (p === 'LOW') return 'Low';
  return 'Medium';
};

export type TaskStatus = 
  | 'Assigned'
  | 'In Progress'
  | 'Submitted'
  | 'Completed'
  | 'Revision Requested'
  | 'Overdue'
  | 'Cancelled'
  // Legacy compatibility aliases
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'CANCELLED';

export type CanonicalTaskStatus = 
  | 'Assigned'
  | 'In Progress'
  | 'Submitted'
  | 'Completed'
  | 'Revision Requested'
  | 'Overdue'
  | 'Cancelled';

export type TaskApprovalStatus = 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUIRED';

export type AssignmentType = 'EMPLOYEE' | 'MULTIPLE_EMPLOYEES' | 'DEPARTMENT';

export type TaskSyncStatus = 'Pending Sync' | 'Synced' | 'Sync Failed' | 'Syncing...';

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: 'EMPLOYEE' | 'ADMIN' | 'TEAM_LEADER';
  content: string;
  timestamp: string;
}

export interface TaskRevision {
  revisionNumber: number;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string; // ISO string
  resubmittedAt?: string | null;
  resubmissionNote?: string | null;
}

export interface TaskHistoryEvent {
  id: string;
  action: 'CREATED' | 'STARTED' | 'PROGRESS_UPDATED' | 'SUBMITTED' | 'COMPLETED' | 'REVISION_REQUESTED' | 'RESUBMITTED' | 'REASSIGNED' | 'EDITED' | 'CANCELLED';
  performedBy: string;
  performedByName: string;
  timestamp: string;
  details?: string;
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
  expectedCompletionTime?: string | null; // Expected completion time (e.g., "17:00" or duration note)
  
  // Revision Tracking (Requirement 6)
  revisionCount?: number;
  revisions?: TaskRevision[];
  currentRevisionReason?: string | null;

  // History & Audit Log (Requirement 4)
  history?: TaskHistoryEvent[];
  
  // Timestamps for audit & efficiency analysis
  assignedTime?: string;
  startedTime?: string | null;
  submittedAt?: string | null;
  submittedBy?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  
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

  // Storage & Sync
  createdAtDeviceTime: string;
  updatedAtDeviceTime: string;
  serverSyncTime?: string | null;
  syncStatus: TaskSyncStatus;
  
  // Progress & Remarks
  comments: TaskComment[];
  managerRemarks?: string | null;
  
  // Legacy tracking fields for backwards compatibility
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAtDeviceTime?: string | null;
  reviewedBy?: string | null;
  reviewedAtDeviceTime?: string | null;
  reviewRemark?: string | null;
  dueTimestampMs?: number;
}

/**
 * Calculates whether a task is overdue dynamically based on current time.
 * Rule: current time > due date/time AND task is not Completed or Cancelled.
 */
export const isTaskOverdue = (task: TaskRecord): boolean => {
  const rawStatus = (task.status || '').toUpperCase().trim();
  if (rawStatus === 'COMPLETED' || rawStatus === 'CANCELLED' || rawStatus === 'CANCEL') return false;
  if (task.approvalStatus === 'APPROVED') return false;
  if (!task.dueDate) return false;
  
  let dueDateTimeMs: number;
  if (task.dueTime && !task.dueDate.includes('T')) {
    dueDateTimeMs = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime();
  } else {
    if (task.dueDate.length === 10 && !task.dueDate.includes('T')) {
      // Default to end of due date (23:59:59)
      dueDateTimeMs = new Date(`${task.dueDate}T23:59:59`).getTime();
    } else {
      dueDateTimeMs = new Date(task.dueDate).getTime();
    }
  }

  if (isNaN(dueDateTimeMs)) return false;
  return Date.now() > dueDateTimeMs;
};

/**
 * Derives current canonical task status considering dynamic overdue calculation.
 */
export const getNormalizedTaskStatus = (task: TaskRecord): CanonicalTaskStatus => {
  const rawStatus = (task.status || '').toUpperCase().trim();
  
  if (rawStatus === 'CANCELLED' || rawStatus === 'CANCEL') {
    return 'Cancelled';
  }
  
  if (rawStatus === 'COMPLETED' || task.approvalStatus === 'APPROVED') {
    return 'Completed';
  }

  if (rawStatus === 'REVISION REQUESTED' || rawStatus === 'REVISION_REQUESTED' || task.approvalStatus === 'REVISION_REQUIRED') {
    return 'Revision Requested';
  }

  if (rawStatus === 'SUBMITTED' || task.approvalStatus === 'PENDING_REVIEW') {
    return 'Submitted';
  }

  if (isTaskOverdue(task)) {
    return 'Overdue';
  }

  if (rawStatus === 'IN PROGRESS' || rawStatus === 'IN_PROGRESS' || (task.completionPercentage > 0 && task.completionPercentage < 100)) {
    return 'In Progress';
  }

  return 'Assigned';
};

/**
 * Derives current effective status considering dynamic overdue calculation (backwards-compatible).
 */
export const getEffectiveTaskStatus = (task: TaskRecord): CanonicalTaskStatus => {
  return getNormalizedTaskStatus(task);
};
