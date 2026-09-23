import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { createAuditLog } from '../audit/auditService';

export interface InitiatePinResetParams {
  employeeDocId: string;
  employeeCode: string;
  employeeName: string;
  adminUserId: string;
  adminLoginId: string;
  adminRole: string;
  reason?: string;
}

export interface MarkPinResetCompletedParams {
  employeeDocId: string;
  employeeCode: string;
  employeeName: string;
}

/**
 * Initiates an authorized remote Security PIN reset signal for an employee.
 * Strictly adheres to Zero-Trust Architecture:
 * - NEVER transmits, creates, or stores plaintext PINs or temporary PINs.
 * - Sets a remote reset signal (status: 'PENDING', unique requestId, timestamp) on the employee's registration document.
 * - Records an immutable audit log entry.
 */
export async function initiateEmployeePinReset(
  params: InitiatePinResetParams
): Promise<{ success: boolean; error?: string; resetRequestId?: string }> {
  const {
    employeeDocId,
    employeeCode,
    employeeName,
    adminUserId,
    adminLoginId,
    adminRole,
    reason = 'Admin initiated Security PIN reset',
  } = params;

  if (!employeeDocId) {
    return { success: false, error: 'Target employee registration ID is required.' };
  }

  const activeDb = db.concrete || db;
  if (!activeDb) {
    return { success: false, error: 'Database service is unavailable.' };
  }

  try {
    const resetRequestId = `pin_reset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const resetTimestamp = new Date().toISOString();

    const regRef = doc(activeDb, 'registrations', employeeDocId);

    await updateDoc(regRef, {
      securityPinResetAt: resetTimestamp,
      securityPinResetBy: adminLoginId || adminUserId || 'Administrator',
      securityPinResetRequestId: resetRequestId,
      securityPinResetReason: reason,
      securityPinResetStatus: 'PENDING',
      hasSecurityPinConfigured: false,
    });

    // Record audit log entry
    await createAuditLog({
      action: 'SECURITY_PIN_RESET',
      actionCategory: 'Security',
      performedByUserId: adminUserId || 'admin',
      performedByName: adminLoginId || 'Administrator',
      performedByRole: adminRole || 'ADMIN',
      employeeCode,
      targetUserId: employeeDocId,
      targetUserName: employeeName,
      targetRecordId: employeeDocId,
      description: `Administrator initiated Security PIN reset for ${employeeName} (${employeeCode})`,
      result: 'SUCCESS',
      source: 'ADMIN_PANEL',
      metadata: {
        resetRequestId,
        employeeCode,
        reason,
        resetAt: resetTimestamp,
      },
    });

    return { success: true, resetRequestId };
  } catch (err: any) {
    console.error('Failed to initiate employee PIN reset:', err);
    return { success: false, error: err?.message || 'Failed to update remote reset signal.' };
  }
}

/**
 * Updates the remote registration document when an employee successfully sets up a new Security PIN
 * following an administrator reset.
 */
export async function markEmployeePinResetCompleted(
  params: MarkPinResetCompletedParams
): Promise<{ success: boolean; error?: string }> {
  const { employeeDocId, employeeCode, employeeName } = params;

  if (!employeeDocId) {
    return { success: false, error: 'Employee registration ID is required.' };
  }

  const activeDb = db.concrete || db;
  if (!activeDb) {
    return { success: false, error: 'Database service is unavailable.' };
  }

  try {
    const completedAt = new Date().toISOString();
    const regRef = doc(activeDb, 'registrations', employeeDocId);

    await updateDoc(regRef, {
      securityPinResetStatus: 'COMPLETED',
      hasSecurityPinConfigured: true,
      securityPinResetCompletedAt: completedAt,
      securityPinResetCompletedBy: employeeCode || 'EMPLOYEE',
    });

    await createAuditLog({
      action: 'SECURITY_PIN_RESET_COMPLETED',
      actionCategory: 'Security',
      performedByUserId: employeeCode || 'employee',
      performedByName: employeeName || 'Employee',
      performedByRole: 'EMPLOYEE',
      employeeCode,
      targetUserId: employeeDocId,
      targetUserName: employeeName,
      targetRecordId: employeeDocId,
      description: `Employee ${employeeName} (${employeeCode}) successfully created a new Security PIN after administrator reset`,
      result: 'SUCCESS',
      source: 'EMPLOYEE_APP',
      metadata: {
        employeeCode,
        completedAt,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to mark employee PIN reset as completed:', err);
    return { success: false, error: err?.message || 'Failed to update reset completion status.' };
  }
}

/**
 * Safely synchronizes the non-sensitive boolean indicator of whether a local Security PIN
 * is configured for this employee to their registration document in Firestore.
 * This never uploads PIN verifiers, salts, hashes, or credentials.
 */
export async function syncLocalPinStatusToRemote(
  employeeDocId: string,
  isConfigured: boolean
): Promise<void> {
  if (!employeeDocId) return;
  const activeDb = db.concrete || db;
  if (!activeDb || !navigator.onLine) return;

  try {
    const regRef = doc(activeDb, 'registrations', employeeDocId);
    await updateDoc(regRef, {
      hasSecurityPinConfigured: isConfigured,
    });
  } catch (err) {
    // Non-critical background sync error; silent ignore
    console.warn('Background sync of PIN configuration flag skipped:', err);
  }
}
