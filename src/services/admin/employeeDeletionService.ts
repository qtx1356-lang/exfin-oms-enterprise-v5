import { db } from '../firebase/config';
import { 
  collection, 
  doc, 
  getDocs, 
  deleteDoc, 
  query, 
  where, 
  updateDoc, 
  arrayRemove, 
  writeBatch 
} from 'firebase/firestore';
import { createAuditLog } from '../audit/auditService';

export interface DeletionSummary {
  attendanceCount: number;
  expensesCount: number;
  leavesCount: number;
  tasksCount: number;
  efficiencyCount: number;
  notificationsCount: number;
  hasRegistration: boolean;
}

export async function fetchEmployeeDeletionSummary(employee: { id: string; employeeCode?: string; name?: string }): Promise<DeletionSummary> {
  if (!db) return { attendanceCount: 0, expensesCount: 0, leavesCount: 0, tasksCount: 0, efficiencyCount: 0, notificationsCount: 0, hasRegistration: false };

  const empId = employee.id;
  const empCode = employee.employeeCode;

  try {
    const [attSnap, expSnap, leaveSnap, taskSnap, effSnap, notifSnap, regSnap] = await Promise.all([
      getDocs(query(collection(db, 'attendance'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'expenses'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'leaves'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'tasks'), where('assigneeId', '==', empId))),
      empCode ? getDocs(query(collection(db, 'efficiency_snapshots'), where('employeeCode', '==', empCode))) : Promise.resolve({ size: 0, docs: [] } as any),
      empCode ? getDocs(query(collection(db, 'notifications'), where('recipientEmployeeCode', '==', empCode))) : Promise.resolve({ size: 0, docs: [] } as any),
      getDocs(query(collection(db, 'registrations'), where('employeeCode', '==', empCode)))
    ]);

    // Also check employeeCode-based queries if employeeId didn't cover all
    let attendanceDocs = attSnap.docs;
    let expenseDocs = expSnap.docs;
    let leaveDocs = leaveSnap.docs;
    let taskDocs = taskSnap.docs;

    if (empCode && empCode !== empId) {
      const [attCodeSnap, expCodeSnap, leaveCodeSnap, taskCodeSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'expenses'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'leaves'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'tasks'), where('assigneeCode', '==', empCode)))
      ]);
      
      // Deduplicate by ID
      const attMap = new Map();
      attSnap.docs.forEach(d => attMap.set(d.id, d));
      attCodeSnap.docs.forEach(d => attMap.set(d.id, d));
      attendanceDocs = Array.from(attMap.values());

      const expMap = new Map();
      expSnap.docs.forEach(d => expMap.set(d.id, d));
      expCodeSnap.docs.forEach(d => expMap.set(d.id, d));
      expenseDocs = Array.from(expMap.values());

      const leaveMap = new Map();
      leaveSnap.docs.forEach(d => leaveMap.set(d.id, d));
      leaveCodeSnap.docs.forEach(d => leaveMap.set(d.id, d));
      leaveDocs = Array.from(leaveMap.values());

      const taskMap = new Map();
      taskSnap.docs.forEach(d => taskMap.set(d.id, d));
      taskCodeSnap.docs.forEach(d => taskMap.set(d.id, d));
      taskDocs = Array.from(taskMap.values());
    }

    return {
      attendanceCount: attendanceDocs.length,
      expensesCount: expenseDocs.length,
      leavesCount: leaveDocs.length,
      tasksCount: taskDocs.length,
      efficiencyCount: effSnap.size,
      notificationsCount: notifSnap.size,
      hasRegistration: regSnap.size > 0 || !!empId
    };
  } catch (err) {
    console.error('Failed to fetch deletion summary:', err);
    return { attendanceCount: 0, expensesCount: 0, leavesCount: 0, tasksCount: 0, efficiencyCount: 0, notificationsCount: 0, hasRegistration: true };
  }
}

export async function executeEmployeeDeletion(params: {
  employee: { id: string; employeeCode?: string; name?: string; deviceId?: string };
  deletionType: 'DATA_ONLY' | 'COMPLETE';
  adminUser: { uid: string; email?: string; displayName?: string; role?: string };
}): Promise<{ success: boolean; message: string; details: Record<string, boolean> }> {
  const { employee, deletionType, adminUser } = params;
  if (!db) throw new Error('Database not initialized');

  const empId = employee.id;
  const empCode = employee.employeeCode;
  const details: Record<string, boolean> = {
    attendance: false,
    expenses: false,
    leaves: false,
    tasks: false,
    efficiency: false,
    notifications: false,
    registration: false
  };

  try {
    // 1. Fetch all records associated with employee
    const [attSnap, expSnap, leaveSnap, taskSnap, effSnap, notifSnap] = await Promise.all([
      getDocs(query(collection(db, 'attendance'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'expenses'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'leaves'), where('employeeId', '==', empId))),
      getDocs(query(collection(db, 'tasks'), where('assigneeId', '==', empId))),
      empCode ? getDocs(query(collection(db, 'efficiency_snapshots'), where('employeeCode', '==', empCode))) : Promise.resolve({ docs: [] } as any),
      empCode ? getDocs(query(collection(db, 'notifications'), where('recipientEmployeeCode', '==', empCode))) : Promise.resolve({ docs: [] } as any)
    ]);

    // Also query by employeeCode if available
    let allAttDocs = [...attSnap.docs];
    let allExpDocs = [...expSnap.docs];
    let allLeaveDocs = [...leaveSnap.docs];
    let allTaskDocs = [...taskSnap.docs];

    if (empCode && empCode !== empId) {
      const [attCodeSnap, expCodeSnap, leaveCodeSnap, taskCodeSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendance'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'expenses'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'leaves'), where('employeeCode', '==', empCode))),
        getDocs(query(collection(db, 'tasks'), where('assigneeCode', '==', empCode)))
      ]);

      const attMap = new Map();
      allAttDocs.forEach(d => attMap.set(d.id, d));
      attCodeSnap.docs.forEach(d => attMap.set(d.id, d));
      allAttDocs = Array.from(attMap.values());

      const expMap = new Map();
      allExpDocs.forEach(d => expMap.set(d.id, d));
      expCodeSnap.docs.forEach(d => expMap.set(d.id, d));
      allExpDocs = Array.from(expMap.values());

      const leaveMap = new Map();
      allLeaveDocs.forEach(d => leaveMap.set(d.id, d));
      leaveCodeSnap.docs.forEach(d => leaveMap.set(d.id, d));
      allLeaveDocs = Array.from(leaveMap.values());

      const taskMap = new Map();
      allTaskDocs.forEach(d => taskMap.set(d.id, d));
      taskCodeSnap.docs.forEach(d => taskMap.set(d.id, d));
      allTaskDocs = Array.from(taskMap.values());
    }

    // Execute deletions in batches (max 500 per batch)
    let batch = writeBatch(db);
    let operationCount = 0;

    const commitBatchIfNeeded = async () => {
      if (operationCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    };

    // Delete Attendance
    for (const d of allAttDocs) {
      batch.delete(d.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.attendance = true;

    // Delete Expenses
    for (const d of allExpDocs) {
      batch.delete(d.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.expenses = true;

    // Delete Leaves
    for (const d of allLeaveDocs) {
      batch.delete(d.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.leaves = true;

    // Handle Tasks (Shared safety: if multi-assignee task, remove assignee. If exclusive, delete.)
    for (const taskDoc of allTaskDocs) {
      const data = taskDoc.data();
      const assignees = data.assignedToEmployeeCodes || [];
      if (assignees.length > 1 && empCode) {
        batch.update(taskDoc.ref, {
          assignedToEmployeeCodes: arrayRemove(empCode),
          assignedToIds: arrayRemove(empId)
        });
      } else {
        batch.delete(taskDoc.ref);
      }
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.tasks = true;

    // Delete Efficiency Snapshots
    for (const d of effSnap.docs) {
      batch.delete(d.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.efficiency = true;

    // Delete Notifications
    for (const d of notifSnap.docs) {
      batch.delete(d.ref);
      operationCount++;
      await commitBatchIfNeeded();
    }
    details.notifications = true;

    // If COMPLETE deletion, delete registration document as well
    if (deletionType === 'COMPLETE') {
      // Check registration doc by ID or employeeCode query
      const regDocRef = doc(db, 'registrations', empId);
      batch.delete(regDocRef);
      operationCount++;

      if (empCode && empCode !== empId) {
        const regQuery = await getDocs(query(collection(db, 'registrations'), where('employeeCode', '==', empCode)));
        for (const regDoc of regQuery.docs) {
          batch.delete(regDoc.ref);
          operationCount++;
        }
      }

      details.registration = true;
    }

    await batch.commit();

    // Create Audit Log (Preserved even after employee deletion)
    const actionName = deletionType === 'COMPLETE' ? 'EMPLOYEE_COMPLETELY_DELETED' : 'EMPLOYEE_DATA_DELETED';
    await createAuditLog({
      action: actionName,
      actionCategory: 'Administration',
      performedByUserId: adminUser.uid,
      performedByName: adminUser.displayName || adminUser.email || 'Super Admin',
      performedByRole: adminUser.role || 'SUPER_ADMIN',
      employeeCode: empCode || empId,
      targetUserId: empId,
      targetUserName: employee.name || 'Unknown Employee',
      targetRecordId: empId,
      description: `Super Admin ${adminUser.displayName || adminUser.email} performed ${deletionType === 'COMPLETE' ? 'Complete Deletion' : 'Data-Only Deletion'} for employee ${employee.name} (${empCode}).`,
      result: 'SUCCESS',
      source: 'SUPER_ADMIN',
      metadata: {
        deletionType,
        affectedCollections: details,
        deviceId: employee.deviceId
      }
    });

    const successMsg = deletionType === 'COMPLETE' 
      ? 'Employee completely deleted.' 
      : 'Employee data deleted successfully.';

    return { success: true, message: successMsg, details };

  } catch (err: any) {
    console.error('Employee deletion execution failed:', err);

    try {
      await createAuditLog({
        action: deletionType === 'COMPLETE' ? 'EMPLOYEE_COMPLETELY_DELETED' : 'EMPLOYEE_DATA_DELETED',
        actionCategory: 'Administration',
        performedByUserId: adminUser.uid,
        performedByName: adminUser.displayName || adminUser.email || 'Super Admin',
        performedByRole: adminUser.role || 'SUPER_ADMIN',
        employeeCode: empCode || empId,
        targetUserId: empId,
        targetUserName: employee.name || 'Unknown Employee',
        targetRecordId: empId,
        description: `Failed to perform ${deletionType} for employee ${employee.name}`,
        result: 'FAILED',
        failureReason: err.message || 'Unknown error',
        source: 'SUPER_ADMIN'
      });
    } catch (logErr) {}

    throw err;
  }
}
