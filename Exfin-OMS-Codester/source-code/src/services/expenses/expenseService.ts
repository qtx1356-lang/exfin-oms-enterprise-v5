import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ExpenseRecord, ExpenseStatus } from '../../types/expense';
import { saveExpenseRecord, getStoredExpenseRecords } from './expenseStorage';
import { createAuditLog } from '../audit/auditService';
import { NotificationType } from '../../types/notification';

export const reviewExpenseClaim = async (
  expenseId: string,
  action: 'APPROVE' | 'REJECT',
  admin: { id: string; name: string; role?: string },
  rejectionReason?: string,
  adminRemark?: string
): Promise<ExpenseRecord> => {
  if (!expenseId) {
    throw new Error('Expense ID is required.');
  }

  let currentExpense: ExpenseRecord | null = null;

  // 1. Try to read from Firestore if available
  if (db && navigator.onLine) {
    try {
      const docRef = doc(db, 'expenses', expenseId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        currentExpense = { id: snap.id, ...snap.data() } as ExpenseRecord;
      }
    } catch (err) {
      console.warn('Failed to fetch expense from Firestore:', err);
    }
  }

  // 2. Fallback to local storage
  if (!currentExpense) {
    const localRecords = getStoredExpenseRecords();
    currentExpense = localRecords.find((r) => r.id === expenseId) || null;
  }

  if (!currentExpense) {
    throw new Error('Expense record not found.');
  }

  // Guard against re-reviewing already approved or rejected claims
  const normalizedCurrentStatus = (currentExpense.status || '').toUpperCase();
  if (normalizedCurrentStatus === 'APPROVED' || normalizedCurrentStatus === 'REJECTED') {
    throw new Error(`Expense claim has already been ${normalizedCurrentStatus.toLowerCase()}.`);
  }

  const nowIso = new Date().toISOString();
  const nextStatus: ExpenseStatus = action === 'APPROVE' ? 'Approved' : 'Rejected';

  const updatedExpense: ExpenseRecord = {
    ...currentExpense,
    status: nextStatus,
    adminRemark: adminRemark?.trim() || null,
    rejectionReason: action === 'REJECT' ? (rejectionReason?.trim() || adminRemark?.trim() || 'Claim rejected by administrator') : null,
    actionedAt: nowIso,
    actionedBy: admin.name || 'Admin',
    approvedAt: action === 'APPROVE' ? nowIso : (currentExpense.approvedAt || null),
    approvedBy: action === 'APPROVE' ? admin.id : (currentExpense.approvedBy || null),
    approvedByName: action === 'APPROVE' ? admin.name : (currentExpense.approvedByName || null),
    rejectedAt: action === 'REJECT' ? nowIso : (currentExpense.rejectedAt || null),
    rejectedBy: action === 'REJECT' ? admin.id : (currentExpense.rejectedBy || null),
    rejectedByName: action === 'REJECT' ? admin.name : (currentExpense.rejectedByName || null),
    serverSyncTime: nowIso,
  };

  // 3. Save to local storage
  saveExpenseRecord(updatedExpense);

  // 4. Persist to Firestore if online
  if (db && navigator.onLine) {
    try {
      const docRef = doc(db, 'expenses', expenseId);
      // Remove any local base64 data to avoid oversized Firestore docs
      const { localReceiptData, ...payloadToPersist } = updatedExpense;
      await setDoc(docRef, payloadToPersist, { merge: true });
    } catch (err) {
      console.error('Failed to persist expense review to Firestore:', err);
      throw err;
    }
  }

  // 5. Create Audit Trail Log
  try {
    await createAuditLog({
      action: action === 'APPROVE' ? 'Expense Approval' : 'Expense Rejection',
      actionCategory: 'Expense',
      performedByUserId: admin.id,
      performedByName: admin.name,
      performedByRole: admin.role || 'ADMIN',
      employeeCode: updatedExpense.employeeCode,
      targetUserId: updatedExpense.employeeId,
      targetUserName: updatedExpense.employeeName,
      targetRecordId: updatedExpense.id,
      description: `${action === 'APPROVE' ? 'Approved' : 'Rejected'} expense claim of ₹${updatedExpense.amount} (${updatedExpense.category}) for ${updatedExpense.employeeName} (${updatedExpense.employeeCode})${action === 'REJECT' && updatedExpense.rejectionReason ? `. Reason: ${updatedExpense.rejectionReason}` : ''}`,
      result: 'SUCCESS',
      source: 'ADMIN_PANEL',
      metadata: {
        expenseId: updatedExpense.id,
        amount: updatedExpense.amount,
        category: updatedExpense.category,
        action,
        rejectionReason: updatedExpense.rejectionReason,
      },
    });
  } catch (auditErr) {
    console.warn('Audit logging failed for expense review:', auditErr);
  }

  // 6. Send Notification to Employee
  try {
    const { sendNotification } = await import('../notification/centralNotificationService');
    const notifType: NotificationType = action === 'APPROVE' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED';
    const notifTitle = action === 'APPROVE' ? 'Expense Claim Approved' : 'Expense Claim Rejected';
    const notifMessage = action === 'APPROVE'
      ? `Your expense claim of ₹${updatedExpense.amount} (${updatedExpense.category}) has been approved.`
      : `Your expense claim of ₹${updatedExpense.amount} (${updatedExpense.category}) was rejected.${updatedExpense.rejectionReason ? ` Reason: ${updatedExpense.rejectionReason}` : ''}`;

    await sendNotification({
      employeeCode: updatedExpense.employeeCode,
      type: notifType,
      category: 'EXPENSE',
      title: notifTitle,
      message: notifMessage,
      priority: action === 'REJECT' ? 'HIGH' : 'NORMAL',
      allowedChannels: ['IN_APP', 'PUSH'],
      entityId: expenseId,
      entityType: 'EXPENSE',
    });
  } catch (notifErr) {
    console.warn('Notification dispatch failed for expense review:', notifErr);
  }

  return updatedExpense;
};
