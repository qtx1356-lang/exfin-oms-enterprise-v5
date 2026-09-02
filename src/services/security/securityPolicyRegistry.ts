import { SensitiveActionId, SensitiveActionPolicy } from '../../types/security';

export const SENSITIVE_ACTION_POLICIES: Record<SensitiveActionId, SensitiveActionPolicy> = {
  ATTENDANCE_CHECKOUT: {
    id: 'ATTENDANCE_CHECKOUT',
    title: 'Manual Check-Out',
    description: 'Perform official office check-out for today',
    requiresVerification: true,
  },
  ATTENDANCE_CHECKOUT_RESOLUTION: {
    id: 'ATTENDANCE_CHECKOUT_RESOLUTION',
    title: 'Submit Proposed Checkout Resolution',
    description: 'Submit past unresolved checkout time proposal',
    requiresVerification: true,
  },
  EXPENSE_SUBMIT: {
    id: 'EXPENSE_SUBMIT',
    title: 'Final Submit Expense Claim',
    description: 'Submit expense claim for manager approval and payout',
    requiresVerification: true,
  },
  LEAVE_SUBMIT: {
    id: 'LEAVE_SUBMIT',
    title: 'Final Submit Leave Request',
    description: 'Submit leave request for admin review',
    requiresVerification: true,
  },
  PLANNER_SUBMIT_DELIVERABLE: {
    id: 'PLANNER_SUBMIT_DELIVERABLE',
    title: 'Submit Deliverable',
    description: 'Submit task deliverable or revision for approval',
    requiresVerification: true,
  },
  PLANNER_COMPLETE_TASK: {
    id: 'PLANNER_COMPLETE_TASK',
    title: 'Mark Task 100% Completed',
    description: 'Mark assigned task as fully completed',
    requiresVerification: true,
  },
  PLANNER_SAVE_DAILY_WORK: {
    id: 'PLANNER_SAVE_DAILY_WORK',
    title: 'Save/Submit Daily Work Details',
    description: 'Save daily work log for efficiency score evaluation',
    requiresVerification: true,
  },
  ADMIN_DELETE: {
    id: 'ADMIN_DELETE',
    title: 'Delete Employee/Record',
    description: 'Permanently remove administrative or employee data',
    requiresVerification: true,
    confirmationPrompt: 'Are you sure you want to permanently delete this record?',
  },
  ADMIN_APPROVE_SENSITIVE: {
    id: 'ADMIN_APPROVE_SENSITIVE',
    title: 'Approve Sensitive Request',
    description: 'Approve financial, leave, or administrative request',
    requiresVerification: true,
  },
  ADMIN_REJECT_SENSITIVE: {
    id: 'ADMIN_REJECT_SENSITIVE',
    title: 'Reject Sensitive Request',
    description: 'Reject financial, leave, or administrative request',
    requiresVerification: true,
  },
};

export function getActionPolicy(actionId: SensitiveActionId): SensitiveActionPolicy {
  return SENSITIVE_ACTION_POLICIES[actionId] || {
    id: actionId,
    title: 'Sensitive Operation',
    description: 'Perform protected sensitive system action',
    requiresVerification: true,
  };
}
