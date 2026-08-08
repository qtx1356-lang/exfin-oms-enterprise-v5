import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppRole, RoleFeaturePermissions } from '../../types/roles';

export interface AuditLogEntry {
  actorEmail: string;
  actorUid: string;
  action: string;
  targetType: 'ROLE' | 'USER' | 'FEATURE_PERMISSION' | 'SYSTEM';
  targetId: string;
  previousValue?: any;
  newValue?: any;
  timestamp: string;
  deviceInfo?: string;
}

export const logAuditEvent = async (entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> => {
  if (!db) return;
  try {
    await addDoc(collection(db, 'audit_logs'), {
      ...entry,
      timestamp: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

export const saveRolePermissionsToFirestore = async (
  roleId: AppRole,
  permissions: Record<string, boolean>,
  actorEmail: string,
  actorUid: string,
  previousPermissions?: Record<string, boolean>
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const nowIso = new Date().toISOString();

  // 1. Update roles collection
  const roleRef = doc(db, 'roles', roleId);
  const rolePayload = {
    roleId,
    name: roleId,
    enabled: true,
    permissions,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };

  await setDoc(roleRef, rolePayload, { merge: true });

  // 2. Also save to /systemSettings/permissions for normalized settings backup
  const sysRef = doc(db, 'systemSettings', `permissions_${roleId}`);
  await setDoc(sysRef, {
    role: roleId,
    permissions,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  }, { merge: true });

  // 3. Log audit event
  await logAuditEvent({
    actorEmail,
    actorUid,
    action: `FEATURE_PERMISSIONS_UPDATED_${roleId}`,
    targetType: 'FEATURE_PERMISSION',
    targetId: roleId,
    previousValue: previousPermissions || null,
    newValue: permissions,
    deviceInfo: navigator.userAgent,
  });

  // 4. Invalidate local roles cache
  try {
    localStorage.removeItem('roles_cache');
  } catch (e) {
    console.error('Failed to invalidate local roles cache:', e);
  }
};

export const updateUserRoleAndStatus = async (params: {
  userId: string;
  employeeCode?: string;
  newRole: AppRole;
  previousRole?: AppRole;
  newStatus?: 'Pending Approval' | 'Approved' | 'Rejected' | 'Suspended';
  previousStatus?: string;
  department?: string;
  assignedTeamLeaderId?: string;
  assignedTeamLeaderName?: string;
  isTeamLeader?: boolean;
  actorEmail: string;
  actorUid: string;
}): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const {
    userId,
    employeeCode,
    newRole,
    previousRole,
    newStatus,
    previousStatus,
    department,
    assignedTeamLeaderId,
    assignedTeamLeaderName,
    isTeamLeader,
    actorEmail,
    actorUid,
  } = params;

  const nowIso = new Date().toISOString();

  // 1. Update in registrations collection (or employee document)
  const regRef = doc(db, 'registrations', userId);
  const updateData: any = {
    role: newRole,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };

  if (newStatus) updateData.status = newStatus;
  if (department !== undefined) updateData.office = department;
  if (isTeamLeader !== undefined) updateData.isTeamLeader = isTeamLeader;
  if (assignedTeamLeaderId !== undefined) updateData.assignedTeamLeaderId = assignedTeamLeaderId;
  if (assignedTeamLeaderName !== undefined) updateData.assignedTeamLeaderName = assignedTeamLeaderName;

  await updateDoc(regRef, updateData).catch(async () => {
    // If updateDoc fails, try setDoc with merge
    await setDoc(regRef, updateData, { merge: true });
  });

  // 2. If changing to ADMIN or SUPER_ADMIN or HR, ensure admin_users document is updated
  if (newRole === 'ADMIN' || newRole === 'SUPER_ADMIN' || newRole === 'HR') {
    const adminRef = doc(db, 'admin_users', userId);
    await setDoc(adminRef, {
      uid: userId,
      role: newRole,
      authorizedOffice: department || 'ALL',
      updatedAt: nowIso,
      updatedBy: actorEmail,
    }, { merge: true });
  }

  // 3. Log audit event
  await logAuditEvent({
    actorEmail,
    actorUid,
    action: `USER_ROLE_AND_STATUS_UPDATED_${userId}`,
    targetType: 'USER',
    targetId: userId,
    previousValue: { role: previousRole, status: previousStatus },
    newValue: { role: newRole, status: newStatus, department, isTeamLeader },
    deviceInfo: navigator.userAgent,
  });

  // 4. Create system notification for user
  try {
    await addDoc(collection(db, 'notifications'), {
      id: `NOTIF_${Date.now()}_${userId.slice(0, 5)}`,
      recipientUserId: userId,
      recipientEmployeeCode: employeeCode || 'ALL',
      recipientRole: newRole,
      title: 'Role / Account Status Updated',
      message: `Your account role has been updated to ${newRole}${newStatus ? ` with status ${newStatus}` : ''}.`,
      type: 'ROLE_UPDATE',
      read: false,
      createdAtDeviceTime: nowIso,
      syncStatus: 'Synced',
    });
  } catch (err) {
    console.error('Failed to send role update notification:', err);
  }
};
