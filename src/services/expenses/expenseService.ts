import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ExpenseRecord } from '../../types/expense';
import { saveExpenseRecord, getStoredExpenseRecords } from './expenseStorage';
import { createAuditLog, getClientDeviceInfo } from '../audit/auditService';
import { sendNotification } from '../notification/centralNotificationService';

export interface AdminActorInfo {
  id?: string;
  name?: string;
  role?: string;
  loginId?: string;
}

/**
 * Status determination helpers (case-insensitive for resilience)
 */
export const isExpensePending = (status?: string | null): boolean => {
  if (!status) return true;
  const s = status.trim().toLowerCase();
  return s === 'pending' || s === 'unapproved' || s === 'pending approval';
};

export const isExpenseApproved = (status?: string | null): boolean => {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'approved';
};

export const isExpenseRejected = (status?: string | null): boolean => {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'rejected';
};

/**
 * Approves an expense claim authoritatively.
 * Updates Firestore document in the 'expenses' collection and local cache.
 * Sends notifications & audit log.
 */
export const approveExpenseClaim = async (
  expenseId: string,
  adminInfo?: AdminActorInfo
): Promise<ExpenseRecord> => {
  if (!expenseId) {
    throw new Error('Expense ID is required for approval.');
  }

  // 1. Fetch existing record to validate
  let existingRecord: ExpenseRecord | null = null;

  // Try local cache first
  const stored = getStoredExpenseRecords();
  const fromLocal = stored.find((r) => r.id === expenseId);
  if (fromLocal) {
    existingRecord = fromLocal;
  }

  // If db available, try fetching current authoritative state from Firestore
  if (db) {
    try {
      const docRef = doc(db, 'expenses', expenseId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        existingRecord = { id: snap.id, ...snap.data() } as ExpenseRecord;
      }
    } catch (fetchErr) {
      console.warn('Could not fetch expense doc from Firestore before approval:', fetchErr);
    }
  }

  if (existingRecord && isExpenseApproved(existingRecord.status)) {
    console.log(`Expense ${expenseId} is already approved.`);
    return existingRecord;
  }

  const nowIso = new Date().toISOString();
  const approverName = adminInfo?.name || adminInfo?.loginId || adminInfo?.id || 'Admin';

  const updatedPayload: Partial<ExpenseRecord> = {
    status: 'Approved',
    approvedAt: nowIso,
    approvedBy: approverName,
    syncStatus: 'Synced',
    serverSyncTime: nowIso,
  };

  // 2. Persist to authoritative Firestore database
  if (!db) {
    throw new Error('Firestore database instance is not available.');
  }

  const docRef = doc(db, 'expenses', expenseId);
  await setDoc(docRef, updatedPayload, { merge: true });

  // 3. Construct updated full record
  const updatedRecord: ExpenseRecord = {
    ...(existingRecord || {
      id: expenseId,
      employeeId: 'UNKNOWN',
      employeeName: 'Unknown',
      employeeCode: 'UNKNOWN',
      amount: 0,
      category: 'Miscellaneous',
      date: nowIso.split('T')[0],
      description: '',
      createdAtDeviceTime: nowIso,
    }),
    ...updatedPayload,
    status: 'Approved',
    syncStatus: 'Synced',
  };

  // 4. Update local storage cache
  saveExpenseRecord(updatedRecord);

  // 5. Create Audit Log
  try {
    await createAuditLog({
      action: 'Expense Approval',
      actionCategory: 'Expense',
      performedByUserId: adminInfo?.id || adminInfo?.loginId || 'admin',
      performedByName: approverName,
      performedByRole: adminInfo?.role || 'ADMIN',
      employeeCode: updatedRecord.employeeCode,
      targetUserId: updatedRecord.employeeId,
      targetUserName: updatedRecord.employeeName,
      targetRecordId: expenseId,
      description: `Approved expense claim ₹${updatedRecord.amount} (${updatedRecord.category}) for ${updatedRecord.employeeName} (${updatedRecord.employeeCode})`,
      oldValue: { status: existingRecord?.status || 'Pending' },
      newValue: { status: 'Approved', approvedAt: nowIso, approvedBy: approverName },
      result: 'SUCCESS',
      source: 'ADMIN_PANEL',
      deviceInfo: getClientDeviceInfo(),
      metadata: {
        amount: updatedRecord.amount,
        category: updatedRecord.category,
        date: updatedRecord.date,
        merchant: updatedRecord.merchant || null,
      },
    });
  } catch (auditErr) {
    console.warn('Failed to record expense approval audit log:', auditErr);
  }

  // 6. Send push/in-app notification to the employee
  try {
    await sendNotification({
      employeeCode: updatedRecord.employeeCode || updatedRecord.employeeId,
      type: 'EXPENSE_APPROVED',
      category: 'EXPENSE',
      title: 'Expense Claim Approved',
      message: `Your expense claim of ₹${updatedRecord.amount} (${updatedRecord.category}) has been approved.`,
      priority: 'NORMAL',
      allowedChannels: ['IN_APP', 'PUSH'],
      entityId: expenseId,
      entityType: 'EXPENSE',
    });
  } catch (notifErr) {
    console.warn('Failed to send expense approval notification:', notifErr);
  }

  // 7. Dispatch global custom event for any live UI listeners
  try {
    window.dispatchEvent(new CustomEvent('exfin-expense-updated', { detail: updatedRecord }));
  } catch {}

  return updatedRecord;
};

/**
 * Rejects an expense claim authoritatively.
 */
export const rejectExpenseClaim = async (
  expenseId: string,
  rejectionReason: string,
  adminInfo?: AdminActorInfo
): Promise<ExpenseRecord> => {
  if (!expenseId) {
    throw new Error('Expense ID is required for rejection.');
  }

  let existingRecord: ExpenseRecord | null = null;
  const stored = getStoredExpenseRecords();
  const fromLocal = stored.find((r) => r.id === expenseId);
  if (fromLocal) existingRecord = fromLocal;

  if (db) {
    try {
      const docRef = doc(db, 'expenses', expenseId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        existingRecord = { id: snap.id, ...snap.data() } as ExpenseRecord;
      }
    } catch (e) {
      console.warn('Could not fetch expense doc before rejection:', e);
    }
  }

  const nowIso = new Date().toISOString();
  const reviewerName = adminInfo?.name || adminInfo?.loginId || adminInfo?.id || 'Admin';

  const updatedPayload: Partial<ExpenseRecord> = {
    status: 'Rejected',
    rejectionReason: rejectionReason?.trim() || 'Rejected by administrator',
    rejectedAt: nowIso,
    rejectedBy: reviewerName,
    syncStatus: 'Synced',
    serverSyncTime: nowIso,
  };

  if (!db) {
    throw new Error('Firestore database instance is not available.');
  }

  const docRef = doc(db, 'expenses', expenseId);
  await setDoc(docRef, updatedPayload, { merge: true });

  const updatedRecord: ExpenseRecord = {
    ...(existingRecord || {
      id: expenseId,
      employeeId: 'UNKNOWN',
      employeeName: 'Unknown',
      employeeCode: 'UNKNOWN',
      amount: 0,
      category: 'Miscellaneous',
      date: nowIso.split('T')[0],
      description: '',
      createdAtDeviceTime: nowIso,
    }),
    ...updatedPayload,
    status: 'Rejected',
    syncStatus: 'Synced',
  };

  saveExpenseRecord(updatedRecord);

  // Audit log
  try {
    await createAuditLog({
      action: 'Expense Rejection',
      actionCategory: 'Expense',
      performedByUserId: adminInfo?.id || adminInfo?.loginId || 'admin',
      performedByName: reviewerName,
      performedByRole: adminInfo?.role || 'ADMIN',
      employeeCode: updatedRecord.employeeCode,
      targetUserId: updatedRecord.employeeId,
      targetUserName: updatedRecord.employeeName,
      targetRecordId: expenseId,
      description: `Rejected expense claim ₹${updatedRecord.amount} (${updatedRecord.category}) for ${updatedRecord.employeeName} (${updatedRecord.employeeCode}). Reason: ${updatedPayload.rejectionReason}`,
      oldValue: { status: existingRecord?.status || 'Pending' },
      newValue: { status: 'Rejected', rejectionReason: updatedPayload.rejectionReason },
      result: 'SUCCESS',
      source: 'ADMIN_PANEL',
      deviceInfo: getClientDeviceInfo(),
      metadata: {
        amount: updatedRecord.amount,
        category: updatedRecord.category,
        date: updatedRecord.date,
        rejectionReason: updatedPayload.rejectionReason,
      },
    });
  } catch (auditErr) {
    console.warn('Failed to record expense rejection audit log:', auditErr);
  }

  // Push / In-App Notification
  try {
    await sendNotification({
      employeeCode: updatedRecord.employeeCode || updatedRecord.employeeId,
      type: 'EXPENSE_REJECTED',
      category: 'EXPENSE',
      title: 'Expense Claim Rejected',
      message: `Your expense claim of ₹${updatedRecord.amount} (${updatedRecord.category}) was rejected. Reason: ${updatedPayload.rejectionReason}`,
      priority: 'HIGH',
      allowedChannels: ['IN_APP', 'PUSH'],
      entityId: expenseId,
      entityType: 'EXPENSE',
    });
  } catch (notifErr) {
    console.warn('Failed to send expense rejection notification:', notifErr);
  }

  try {
    window.dispatchEvent(new CustomEvent('exfin-expense-updated', { detail: updatedRecord }));
  } catch {}

  return updatedRecord;
};
