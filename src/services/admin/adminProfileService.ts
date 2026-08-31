import { doc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { getDb } from '../../services/firebase/config';
import { AuditLogEntry } from '../../types/profile';

export const updateEmployeeProfile = async (
  uid: string,
  updatedData: Record<string, any>,
  actor: { uid: string; email: string; role: string },
  oldData: Record<string, any>
): Promise<void> => {
  const activeDb = await getDb();
  if (!activeDb) throw new Error('Database not connected');
  
  // Basic security check: Only Admin or Super Admin can update profiles
  if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: Insufficient permissions');
  }

  const regRef = doc(activeDb, 'registrations', uid);
  const now = new Date().toISOString();

  // 1. Update Profile
  await updateDoc(regRef, {
    ...updatedData,
    updatedAt: now,
  });

  // 2. Audit Log
  const fieldsChanged = Object.keys(updatedData);
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  
  fieldsChanged.forEach(field => {
    oldValues[field] = oldData[field];
    newValues[field] = updatedData[field];
  });

  const auditEntry: AuditLogEntry = {
    id: `audit_admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actorUid: actor.uid,
    actorName: actor.email, // Using email as name for now, or could fetch name
    actorRole: actor.role,
    action: 'ADMIN_UPDATED_EMPLOYEE_PROFILE',
    targetEmployeeUid: uid,
    targetEmployeeCode: oldData.employeeCode,
    fieldChanged: fieldsChanged.join(', '),
    oldValue: JSON.stringify(oldValues),
    newValue: JSON.stringify(newValues),
    timestamp: now,
    reason: 'Admin panel manual update',
  };

  await addDoc(collection(activeDb, 'audit_logs'), auditEntry);
};
