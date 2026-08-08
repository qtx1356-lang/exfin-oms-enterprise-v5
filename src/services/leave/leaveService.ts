import { doc, setDoc, getDoc, collection, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { LeaveRecord, LeaveStatus, LeaveApprovalStatus, LeaveBalance, LeaveConfig, EmployeeAllowance } from '../../types/leave';
import {
  getStoredLeaves,
  saveLeave,
  saveMultipleLeaves,
  getStoredLeaveConfig,
  saveLeaveConfig,
  getStoredEmployeeAllowances,
  saveEmployeeAllowances,
  markLeaveSynced,
} from './leaveStorage';

// OperationType for firestore error info conforming to skill guidelines
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Calculate leave days
export const calculateLeaveDays = (startDateStr: string, endDateStr: string): number => {
  if (!startDateStr || !endDateStr) return 0;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

  if (endUTC < startUTC) return 0;

  const diffTime = Math.abs(endUTC - startUTC);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

// 2. Check Overlap
export const checkLeaveOverlap = (
  employeeId: string,
  startDateStr: string,
  endDateStr: string,
  allLeaves: LeaveRecord[],
  excludeLeaveId?: string
): boolean => {
  const newStart = new Date(startDateStr).getTime();
  const newEnd = new Date(endDateStr).getTime();

  return allLeaves.some((l) => {
    if (l.employeeId !== employeeId) return false;
    if (excludeLeaveId && l.id === excludeLeaveId) return false;
    if (l.status !== 'PENDING' && l.status !== 'APPROVED') return false;

    const existingStart = new Date(l.startDate).getTime();
    const existingEnd = new Date(l.endDate).getTime();

    return newStart <= existingStart ? newEnd >= existingStart : newStart <= existingEnd;
  });
};

// 3. Balance calculations
export const calculateLeaveBalance = (
  employeeId: string,
  department: string,
  allLeaves: LeaveRecord[],
  config: LeaveConfig,
  employeeAllowances: EmployeeAllowance[]
): LeaveBalance => {
  // Find custom allowance
  const empOverride = employeeAllowances.find((a) => a.id === employeeId || a.employeeId === employeeId);
  let annualAllowance = config.defaultAnnualAllowance;

  if (empOverride) {
    annualAllowance = empOverride.allowance;
  } else if (config.departmentAllowances && config.departmentAllowances[department] !== undefined) {
    annualAllowance = config.departmentAllowances[department];
  }

  // Calculate used and pending days
  const empLeaves = allLeaves.filter((l) => l.employeeId === employeeId);
  const used = empLeaves
    .filter((l) => l.status === 'APPROVED')
    .reduce((sum, l) => sum + l.totalDays, 0);

  const pending = empLeaves
    .filter((l) => l.status === 'PENDING')
    .reduce((sum, l) => sum + l.totalDays, 0);

  const available = annualAllowance - used - pending;

  // Find employee name and code from leaves if possible, or fallback
  const firstLeave = empLeaves[0];
  const employeeCode = firstLeave?.employeeCode || '';
  const employeeName = firstLeave?.employeeName || '';

  return {
    employeeId,
    employeeCode,
    employeeName,
    department,
    annualAllowance,
    used,
    pending,
    available,
  };
};

// 4. Create Leave Request
export const createLeaveRequest = async (
  employeeData: {
    id: string;
    employeeCode: string;
    name: string;
    office?: string;
    isTeamLeader?: boolean;
    teamLeaderId?: string | null;
    teamLeaderCode?: string | null;
    teamLeaderName?: string | null;
  },
  startDate: string,
  endDate: string,
  reason: string
): Promise<LeaveRecord> => {
  const allLeaves = getStoredLeaves();
  
  // Validate overlap
  if (checkLeaveOverlap(employeeData.id, startDate, endDate, allLeaves)) {
    throw new Error('You already have a leave request covering these dates.');
  }

  const totalDays = calculateLeaveDays(startDate, endDate);
  if (totalDays <= 0) {
    throw new Error('Invalid date range.');
  }

  // Calculate balance
  const config = getStoredLeaveConfig();
  const allowances = getStoredEmployeeAllowances();
  const balance = calculateLeaveBalance(employeeData.id, employeeData.office || 'Raniganj', allLeaves, config, allowances);

  if (balance.available < totalDays) {
    throw new Error(`Insufficient leave balance. Requested: ${totalDays} days, Available: ${balance.available} days.`);
  }

  const leaveId = `leave_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  // Determine current approver role
  const hasLeader = !!employeeData.teamLeaderId || !!employeeData.teamLeaderCode;
  const currentApproverRole = hasLeader ? 'TEAM_LEADER' : 'ADMIN';

  const leaveRecord: LeaveRecord = {
    id: leaveId,
    employeeId: employeeData.id,
    employeeCode: employeeData.employeeCode,
    employeeName: employeeData.name,
    department: employeeData.office || 'Raniganj',
    teamLeaderId: employeeData.teamLeaderId || null,
    teamLeaderName: employeeData.teamLeaderName || null,
    startDate,
    endDate,
    totalDays,
    reason,
    status: 'PENDING',
    approvalStatus: 'PENDING',
    currentApproverRole,
    currentApproverId: hasLeader ? (employeeData.teamLeaderId || null) : null,
    currentApproverName: hasLeader ? (employeeData.teamLeaderName || null) : null,
    teamLeaderRemark: null,
    adminRemark: null,
    createdAtDeviceTime: nowIso,
    updatedAtDeviceTime: nowIso,
    submittedAtDeviceTime: nowIso,
    teamLeaderReviewedAtDeviceTime: null,
    adminReviewedAtDeviceTime: null,
    serverSyncTime: null,
    syncStatus: 'Pending Sync',
  };

  // 1. Save locally
  saveLeave(leaveRecord);

  // 2. Try saving to Firestore
  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'leaves', leaveId), leaveRecord);
      markLeaveSynced(leaveId, new Date().toISOString());
      
      // Send notification: Leave Submitted (to team leader if exists, or admin)
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: employeeData.teamLeaderCode || 'ADMIN',
        type: 'LEAVE_SUBMITTED',
        title: 'New Leave Request Submitted',
        message: `${employeeData.name} requested leave from ${startDate} to ${endDate} (${totalDays} Days) for "${reason}".`,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });

      // Leave Approval Required notification
      const notifReqId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifReqId), {
        id: notifReqId,
        employeeCode: employeeData.teamLeaderCode || 'ADMIN',
        type: 'LEAVE_APPROVAL_REQUIRED',
        title: 'Leave Approval Required',
        message: `Leave approval required for ${employeeData.name} (${startDate} to ${endDate}).`,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });
    } catch (err) {
      console.warn('Could not sync leave record immediately. Saved offline.', err);
    }
  }

  return leaveRecord;
};

// 5. Cancel Leave Request (Employee)
export const cancelLeaveRequest = async (leaveId: string): Promise<LeaveRecord> => {
  const leaves = getStoredLeaves();
  const leave = leaves.find((l) => l.id === leaveId);
  if (!leave) throw new Error('Leave request not found.');

  if (leave.status !== 'PENDING') {
    throw new Error('Only pending leave requests can be cancelled.');
  }

  const nowIso = new Date().toISOString();
  const updatedLeave: LeaveRecord = {
    ...leave,
    status: 'CANCELLED',
    approvalStatus: 'CANCELLED',
    updatedAtDeviceTime: nowIso,
    syncStatus: 'Pending Sync',
  };

  saveLeave(updatedLeave);

  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'leaves', leaveId), updatedLeave, { merge: true });
      markLeaveSynced(leaveId, nowIso);

      // Notify Team Leader / Admin
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: leave.teamLeaderId ? 'TL' : 'ADMIN',
        type: 'LEAVE_CANCELLED',
        title: 'Leave Request Cancelled',
        message: `${leave.employeeName} cancelled their leave request from ${leave.startDate} to ${leave.endDate}.`,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });
    } catch (err) {
      console.warn('Could not sync leave cancellation immediately.', err);
    }
  }

  return updatedLeave;
};

// 6. Review Leave Request (Team Leader / Admin)
export const reviewLeaveRequest = async (
  leaveId: string,
  reviewerRole: 'TEAM_LEADER' | 'ADMIN',
  reviewer: { id: string; name: string },
  action: 'APPROVE' | 'REJECT',
  remark: string
): Promise<LeaveRecord> => {
  const leaves = getStoredLeaves();
  const leave = leaves.find((l) => l.id === leaveId);
  if (!leave) throw new Error('Leave request not found.');

  if (leave.status !== 'PENDING') {
    throw new Error('This leave request has already been finalized.');
  }

  if (action === 'REJECT' && !remark.trim()) {
    throw new Error('Rejection remark is required.');
  }

  const nowIso = new Date().toISOString();
  let updatedLeave: LeaveRecord = { ...leave };

  if (reviewerRole === 'TEAM_LEADER') {
    if (action === 'APPROVE') {
      updatedLeave.approvalStatus = 'TEAM_LEADER_APPROVED';
      // Route to Admin next
      updatedLeave.currentApproverRole = 'ADMIN';
      updatedLeave.currentApproverId = null;
      updatedLeave.currentApproverName = null;
    } else {
      updatedLeave.status = 'REJECTED';
      updatedLeave.approvalStatus = 'REJECTED';
      updatedLeave.currentApproverRole = 'NONE';
    }
    updatedLeave.teamLeaderRemark = remark;
    updatedLeave.teamLeaderReviewedAtDeviceTime = nowIso;
  } else if (reviewerRole === 'ADMIN') {
    if (action === 'APPROVE') {
      updatedLeave.status = 'APPROVED';
      updatedLeave.approvalStatus = 'APPROVED';
    } else {
      updatedLeave.status = 'REJECTED';
      updatedLeave.approvalStatus = 'REJECTED';
    }
    updatedLeave.adminRemark = remark;
    updatedLeave.adminReviewedAtDeviceTime = nowIso;
    updatedLeave.currentApproverRole = 'NONE';
  }

  updatedLeave.updatedAtDeviceTime = nowIso;
  updatedLeave.syncStatus = 'Pending Sync';

  saveLeave(updatedLeave);

  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'leaves', leaveId), updatedLeave, { merge: true });
      markLeaveSynced(leaveId, nowIso);

      // Create notifications
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let title = '';
      let message = '';
      let type = '';

      if (action === 'REJECT') {
        type = 'LEAVE_REJECTED';
        title = `Leave Request Rejected`;
        message = `Your leave request for ${leave.startDate} to ${leave.endDate} was rejected by ${reviewer.name}. Reason: ${remark}`;
      } else {
        if (reviewerRole === 'TEAM_LEADER') {
          type = 'LEAVE_APPROVED_BY_LEADER';
          title = `Leave Approved by Team Leader`;
          message = `Your leave request was approved by Team Leader ${reviewer.name} and is now pending Admin approval.`;
        } else {
          type = 'LEAVE_APPROVED';
          title = `Leave Request Fully Approved`;
          message = `Your leave request for ${leave.startDate} to ${leave.endDate} has been fully approved by Admin.`;
        }
      }

      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: leave.employeeCode,
        type,
        title,
        message,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });

      // If approved by TL, trigger a notification to admin
      if (reviewerRole === 'TEAM_LEADER' && action === 'APPROVE') {
        const adminNotifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, 'notifications', adminNotifId), {
          id: adminNotifId,
          employeeCode: 'ADMIN',
          type: 'LEAVE_APPROVAL_REQUIRED',
          title: 'Admin Review Required',
          message: `${leave.employeeName}'s leave request was approved by Team Leader ${reviewer.name} and requires Admin review.`,
          createdAt: nowIso,
          timestamp: nowIso,
          read: false,
        });
      }
    } catch (err) {
      console.warn('Could not sync leave review immediately.', err);
    }
  }

  return updatedLeave;
};

// 7. Admin Override (override TL decision)
export const adminOverrideLeave = async (
  leaveId: string,
  adminUser: { id: string; name: string },
  action: 'APPROVE' | 'REJECT',
  reason: string
): Promise<LeaveRecord> => {
  const leaves = getStoredLeaves();
  const leave = leaves.find((l) => l.id === leaveId);
  if (!leave) throw new Error('Leave request not found.');

  const nowIso = new Date().toISOString();
  const updatedLeave: LeaveRecord = {
    ...leave,
    status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    approvalStatus: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    currentApproverRole: 'NONE',
    adminRemark: `Admin Override: ${reason}`,
    adminReviewedAtDeviceTime: nowIso,
    updatedAtDeviceTime: nowIso,
    syncStatus: 'Pending Sync',
    overrideBy: adminUser.id,
    overrideByName: adminUser.name,
    overrideAtDeviceTime: nowIso,
    overrideReason: reason,
  };

  saveLeave(updatedLeave);

  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'leaves', leaveId), updatedLeave, { merge: true });
      markLeaveSynced(leaveId, nowIso);

      // Create notification
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: leave.employeeCode,
        type: 'LEAVE_APPROVED',
        title: `Leave Action Overridden by Admin`,
        message: `Your leave request from ${leave.startDate} to ${leave.endDate} was manually ${action === 'APPROVE' ? 'approved' : 'rejected'} by Admin. Override Reason: ${reason}`,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });
    } catch (err) {
      console.warn('Could not sync leave override immediately.', err);
    }
  }

  return updatedLeave;
};

// 8. Admin Leave configuration update (Firestore and Local)
export const updateLeaveConfig = async (config: LeaveConfig): Promise<void> => {
  saveLeaveConfig(config);
  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'system_settings', 'leave_settings'), config);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'system_settings/leave_settings');
    }
  }
};

// 9. Admin Employee Custom Allowance update (Firestore and Local)
export const updateEmployeeAllowance = async (allowance: EmployeeAllowance): Promise<void> => {
  const allowances = getStoredEmployeeAllowances();
  const existingIndex = allowances.findIndex((a) => a.id === allowance.id);
  if (existingIndex >= 0) {
    allowances[existingIndex] = allowance;
  } else {
    allowances.push(allowance);
  }
  saveEmployeeAllowances(allowances);

  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'leave_balances', allowance.id), allowance);

      // Trigger a notification to the employee
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const nowIso = new Date().toISOString();
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: allowance.employeeCode,
        type: 'BALANCE_CHANGED',
        title: 'Leave Allowance Updated',
        message: `Your total annual leave allowance has been updated to ${allowance.allowance} Days by Admin.`,
        createdAt: nowIso,
        timestamp: nowIso,
        read: false,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `leave_balances/${allowance.id}`);
    }
  }
};
