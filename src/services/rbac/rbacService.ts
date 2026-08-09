import { doc, setDoc, updateDoc, addDoc, collection, serverTimestamp, getDocs, getDoc, query, where, deleteDoc } from 'firebase/firestore';
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
  designation?: string;
  assignedTeamLeaderId?: string;
  assignedTeamLeaderName?: string;
  isTeamLeader?: boolean;
  teamMemberUids?: string[];
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
    designation,
    assignedTeamLeaderId,
    assignedTeamLeaderName,
    isTeamLeader,
    teamMemberUids,
    actorEmail,
    actorUid,
  } = params;

  const nowIso = new Date().toISOString();

  // 1. Fetch current target user registration document
  const regRef = doc(db, 'registrations', userId);
  const targetRegSnap = await getDoc(regRef).catch(() => null);
  const targetData = targetRegSnap?.exists() ? targetRegSnap.data() : {};
  const targetName = targetData.name || 'Employee';
  const targetCode = targetData.employeeCode || employeeCode || userId;

  const effectiveIsTeamLeader = (isTeamLeader !== undefined ? isTeamLeader : (targetData.isTeamLeader || false)) || newRole === 'TEAM_LEADER';

  const updateData: any = {
    role: newRole,
    updatedAt: nowIso,
    updatedBy: actorEmail,
  };

  if (newStatus) updateData.status = newStatus;
  if (department !== undefined) updateData.office = department;
  if (designation !== undefined) updateData.designation = designation;
  updateData.isTeamLeader = effectiveIsTeamLeader;

  if (assignedTeamLeaderId !== undefined) {
    updateData.assignedTeamLeaderId = assignedTeamLeaderId || null;
    updateData.teamLeaderUid = assignedTeamLeaderId || null;
    updateData.teamLeaderId = assignedTeamLeaderId || null;
    updateData.assignedTeamLeaderName = assignedTeamLeaderName || null;
  }

  // 2. Handle Team Leader member assignments
  if (effectiveIsTeamLeader && newStatus !== 'Suspended') {
    const newMemberUids = teamMemberUids || [];
    updateData.teamMemberUids = newMemberUids;

    const oldMemberUids: string[] = Array.isArray(targetData.teamMemberUids) ? targetData.teamMemberUids : [];
    const addedMemberUids = newMemberUids.filter((id) => !oldMemberUids.includes(id));
    const removedMemberUids = oldMemberUids.filter((id) => !newMemberUids.includes(id));

    // Process all currently assigned team members
    for (const memberId of newMemberUids) {
      if (memberId === userId) continue; // Do not allow self assignment
      try {
        const mRef = doc(db, 'registrations', memberId);
        const mSnap = await getDoc(mRef);
        if (mSnap.exists()) {
          const mData = mSnap.data();
          const prevTlId = mData.assignedTeamLeaderId || mData.teamLeaderUid || mData.teamLeaderId;

          // If member previously belonged to another TL, remove from old TL's teamMemberUids
          if (prevTlId && prevTlId !== userId) {
            try {
              const oldTlRef = doc(db, 'registrations', prevTlId);
              const oldTlSnap = await getDoc(oldTlRef);
              if (oldTlSnap.exists()) {
                const oldTlData = oldTlSnap.data();
                const updatedOldUids = (oldTlData.teamMemberUids || []).filter((id: string) => id !== memberId);
                await updateDoc(oldTlRef, { teamMemberUids: updatedOldUids, updatedAt: nowIso });

                await addDoc(collection(db, 'notifications'), {
                  id: `NOTIF_${Date.now()}_${prevTlId.slice(0, 5)}`,
                  recipientUserId: prevTlId,
                  recipientEmployeeCode: oldTlData.employeeCode || 'ALL',
                  recipientRole: 'TEAM_LEADER',
                  title: 'Team Assignment Update',
                  message: `Employee ${mData.name || memberId} was reassigned to another team.`,
                  type: 'TEAM_UPDATE',
                  read: false,
                  createdAtDeviceTime: nowIso,
                  syncStatus: 'Synced',
                });
              }
            } catch (tlErr) {
              console.warn('Error removing member from old Team Leader:', tlErr);
            }
          }

          // Update member record to point to this Team Leader
          await updateDoc(mRef, {
            assignedTeamLeaderId: userId,
            assignedTeamLeaderName: targetName,
            teamLeaderUid: userId,
            teamLeaderId: userId,
            teamLeaderCode: targetCode,
            updatedAt: nowIso,
          });

          // Notify newly added member
          if (addedMemberUids.includes(memberId)) {
            await addDoc(collection(db, 'notifications'), {
              id: `NOTIF_${Date.now()}_${memberId.slice(0, 5)}`,
              recipientUserId: memberId,
              recipientEmployeeCode: mData.employeeCode || 'ALL',
              recipientRole: mData.role || 'EMPLOYEE',
              title: 'Team Leader Assigned',
              message: `Your Team Leader has been set to ${targetName}.`,
              type: 'TEAM_UPDATE',
              read: false,
              createdAtDeviceTime: nowIso,
              syncStatus: 'Synced',
            });
          }
        }
      } catch (mErr) {
        console.error(`Error assigning member ${memberId}:`, mErr);
      }
    }

    // Unassign removed members
    for (const remId of removedMemberUids) {
      try {
        const remRef = doc(db, 'registrations', remId);
        const remSnap = await getDoc(remRef);
        if (remSnap.exists()) {
          const remData = remSnap.data();
          await updateDoc(remRef, {
            assignedTeamLeaderId: null,
            assignedTeamLeaderName: null,
            teamLeaderUid: null,
            teamLeaderId: null,
            teamLeaderCode: null,
            updatedAt: nowIso,
          });

          await addDoc(collection(db, 'notifications'), {
            id: `NOTIF_${Date.now()}_${remId.slice(0, 5)}`,
            recipientUserId: remId,
            recipientEmployeeCode: remData.employeeCode || 'ALL',
            recipientRole: remData.role || 'EMPLOYEE',
            title: 'Team Assignment Changed',
            message: 'Your Team Leader assignment has been removed.',
            type: 'TEAM_UPDATE',
            read: false,
            createdAtDeviceTime: nowIso,
            syncStatus: 'Synced',
          });
        }
      } catch (remErr) {
        console.error(`Error unassigning removed member ${remId}:`, remErr);
      }
    }

    // Audit log entry for team member assignment
    await logAuditEvent({
      actorEmail,
      actorUid,
      action: `TEAM_LEADER_ASSIGNED_MEMBERS_${userId}`,
      targetType: 'USER',
      targetId: userId,
      previousValue: oldMemberUids,
      newValue: newMemberUids,
      deviceInfo: navigator.userAgent,
    });
  } else if (!effectiveIsTeamLeader || newStatus === 'Suspended') {
    // Role changed from TL to non-TL or TL deactivated
    const oldMemberUids: string[] = Array.isArray(targetData.teamMemberUids) ? targetData.teamMemberUids : [];
    updateData.teamMemberUids = [];
    updateData.isTeamLeader = false;

    // Unassign all former members
    for (const memberId of oldMemberUids) {
      try {
        const mRef = doc(db, 'registrations', memberId);
        const mSnap = await getDoc(mRef);
        if (mSnap.exists()) {
          const mData = mSnap.data();
          await updateDoc(mRef, {
            assignedTeamLeaderId: null,
            assignedTeamLeaderName: null,
            teamLeaderUid: null,
            teamLeaderId: null,
            teamLeaderCode: null,
            updatedAt: nowIso,
          });

          await addDoc(collection(db, 'notifications'), {
            id: `NOTIF_${Date.now()}_${memberId.slice(0, 5)}`,
            recipientUserId: memberId,
            recipientEmployeeCode: mData.employeeCode || 'ALL',
            recipientRole: mData.role || 'EMPLOYEE',
            title: 'Team Assignment Updated',
            message: 'Your Team Leader role was changed or deactivated.',
            type: 'TEAM_UPDATE',
            read: false,
            createdAtDeviceTime: nowIso,
            syncStatus: 'Synced',
          });
        }
      } catch (err) {
        console.error('Error clearing member team leader:', err);
      }
    }
  }

  // Save changes to target user's registration
  await updateDoc(regRef, updateData).catch(async () => {
    await setDoc(regRef, updateData, { merge: true });
  });

  // 3. If changing to ADMIN or SUPER_ADMIN or HR, ensure admin_users document is updated
  if (newRole === 'ADMIN' || newRole === 'SUPER_ADMIN' || newRole === 'HR') {
    const adminRef = doc(db, 'admin_users', userId);
    const updatePayload: any = {
      uid: userId,
      role: newRole,
      authorizedOffice: department || 'ALL',
      updatedAt: nowIso,
      updatedBy: actorEmail,
      active: newStatus !== 'Suspended',
    };
    if (newStatus) updatePayload.status = newStatus;
    if (targetData && targetData.email) {
      updatePayload.email = targetData.email;
    }
    await setDoc(adminRef, updatePayload, { merge: true });
  } else {
    // If demoted from Admin, delete from admin_users and login_ids mapping to revoke access
    const adminRef = doc(db, 'admin_users', userId);
    const adminDoc = await getDoc(adminRef).catch(() => null);
    if (adminDoc?.exists()) {
      const adminData = adminDoc.data();
      if (adminData.loginId) {
        await deleteDoc(doc(db, 'login_ids', adminData.loginId)).catch(() => null);
      }
      await deleteDoc(adminRef).catch(() => null);
    }
  }

  // 4. Log main user role/status audit event
  await logAuditEvent({
    actorEmail,
    actorUid,
    action: `USER_ROLE_AND_STATUS_UPDATED_${userId}`,
    targetType: 'USER',
    targetId: userId,
    previousValue: { role: previousRole, status: previousStatus },
    newValue: { role: newRole, status: newStatus, department, isTeamLeader: effectiveIsTeamLeader, teamMemberUids },
    deviceInfo: navigator.userAgent,
  });

  // 5. Create system notification for user
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
