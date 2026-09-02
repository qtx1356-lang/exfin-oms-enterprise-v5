export type SensitiveActionId =
  | 'ATTENDANCE_CHECKOUT'
  | 'ATTENDANCE_CHECKOUT_RESOLUTION'
  | 'EXPENSE_SUBMIT'
  | 'LEAVE_SUBMIT'
  | 'PLANNER_SUBMIT_DELIVERABLE'
  | 'PLANNER_COMPLETE_TASK'
  | 'PLANNER_SAVE_DAILY_WORK'
  | 'ADMIN_DELETE'
  | 'ADMIN_APPROVE_SENSITIVE'
  | 'ADMIN_REJECT_SENSITIVE';

export interface SensitiveActionPolicy {
  id: SensitiveActionId;
  title: string;
  description: string;
  requiresVerification: boolean;
  confirmationPrompt?: string;
}

export interface VerificationSessionInfo {
  isActive: boolean;
  expiresAtMs: number;
  lastVerifiedAtMs: number;
  remainingSeconds: number;
}

export interface VerificationResult {
  success: boolean;
  error?: string;
}
