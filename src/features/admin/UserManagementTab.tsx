import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, getDocs, getDoc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { AppRole } from '../../types/roles';
import { updateUserRoleAndStatus } from '../../services/rbac/rbacService';
import { usePermission } from '../../context/PermissionContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { OrganizationSettingsTab } from './OrganizationSettingsTab';
import { ManagedUser } from '../../types/user';
import { ProfileEditModal } from '../../components/common/ProfileEditModal';
import { updateEmployeeProfile } from '../../services/admin/adminProfileService';
import {
  Users,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  Edit3,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building,
  Smartphone,
  Eye,
  RefreshCw,
} from 'lucide-react';


export const UserManagementTab: React.FC = () => {
  const { isSuperAdmin, isAdmin } = usePermission();
  const { user: adminUser, role: activeAdminRole, loginId } = useAdminAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isProfileEditModalOpen, setIsProfileEditModalOpen] = useState(false);

  // Edit form state
  const [editRole, setEditRole] = useState<AppRole>('EMPLOYEE');
  const [editStatus, setEditStatus] = useState<'Approved' | 'Suspended' | 'Pending Approval' | 'Rejected'>('Approved');
  const [editDepartment, setEditDepartment] = useState('Raniganj');
  const [editDesignation, setEditDesignation] = useState('');
  const [editIsTeamLeader, setEditIsTeamLeader] = useState(false);
  const [editTeamLeaderId, setEditTeamLeaderId] = useState('');
  const [editTeamMemberUids, setEditTeamMemberUids] = useState<string[]>([]);
  const [editLoginId, setEditLoginId] = useState('');

  const [activeSubTab, setActiveSubTab] = useState<'DIRECTORY' | 'ORG_SETTINGS'>('DIRECTORY');
  const [masterDepts, setMasterDepts] = useState<any[]>([]);
  const [masterDesigs, setMasterDesigs] = useState<any[]>([]);

  useEffect(() => {
    if (!db) return;
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMasterDepts(list);
    });

    const unsubDesigs = onSnapshot(collection(db, 'designations'), (snap) => {
      const list: any[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMasterDesigs(list);
    });

    return () => {
      unsubDepts();
      unsubDesigs();
    };
  }, []);

  // Team Member selector filter state
  const [teamMemberSearchTerm, setTeamMemberSearchTerm] = useState('');
  const [teamMemberDeptFilter, setTeamMemberDeptFilter] = useState('ALL');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch users from registrations and admin_users
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsubRegs = onSnapshot(collection(db, 'registrations'), async (snapshot) => {
      const regUsersMap = new Map<string, ManagedUser>();

      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const uRole: AppRole = data.role || (data.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE');
        regUsersMap.set(docSnap.id, {
          id: docSnap.id,
          employeeCode: data.employeeCode || docSnap.id,
          name: data.name || 'Unnamed Employee',
          mobileNumber: data.mobileNumber || 'N/A',
          office: data.office || 'Raniganj',
          designation: data.designation || '',
          role: uRole,
          status: data.status || 'Approved',
          isTeamLeader: !!data.isTeamLeader,
          assignedTeamLeaderId: data.assignedTeamLeaderId || '',
          assignedTeamLeaderName: data.assignedTeamLeaderName || '',
          teamMemberUids: Array.isArray(data.teamMemberUids) ? data.teamMemberUids : [],
          deviceId: data.deviceId || 'N/A',
          deviceModel: data.deviceModel || 'N/A',
          androidVersion: data.androidVersion || 'N/A',
          appVersion: data.appVersion || 'N/A',
          registrationDate: data.registrationDate || '',
          selfieUrl: data.selfieUrl || '',
          email: data.email || '',
          loginId: data.loginId || '',
        });
      });

      // Supplement with admin_users collection if any exist
      try {
        const adminSnaps = await getDocs(collection(db, 'admin_users'));
        adminSnaps.docs.forEach((docSnap) => {
          const aData = docSnap.data();
          const aRole = (aData.role as AppRole) || 'ADMIN';
          
          // Information Hiding: Normal Admins must NOT see or load any administrative users
          if (!isSuperAdmin() && (aRole === 'ADMIN' || aRole === 'SUPER_ADMIN')) {
            regUsersMap.delete(docSnap.id); // Remove from list if they were added from registrations
            return;
          }

          if (regUsersMap.has(docSnap.id)) {
            const existing = regUsersMap.get(docSnap.id)!;
            regUsersMap.set(docSnap.id, {
              ...existing,
              role: aRole,
              office: aData.authorizedOffice || existing.office,
              designation: aData.designation || existing.designation || 'Admin',
              loginId: isSuperAdmin() ? (aData.loginId || existing.loginId || '') : '',
              email: isSuperAdmin() ? (aData.email || existing.email || '') : '',
            });
          } else {
            // Include administrative users created directly or without registrations
            regUsersMap.set(docSnap.id, {
              id: docSnap.id,
              employeeCode: docSnap.id.slice(0, 8),
              name: aData.email ? aData.email.split('@')[0] : 'Admin User',
              mobileNumber: 'N/A',
              office: aData.authorizedOffice || 'ALL',
              designation: aData.designation || 'Admin',
              role: aRole,
              status: aData.active === false ? 'Suspended' : 'Approved',
              loginId: isSuperAdmin() ? (aData.loginId || '') : '',
              email: isSuperAdmin() ? (aData.email || '') : '',
            });
          }
        });
      } catch (e) {
        console.error('Error supplementing admin users:', e);
      }

      // Final pass: Ensure no admin leaks even from registrations collection
      const allUsers = Array.from(regUsersMap.values());
      const visibleUsers = isSuperAdmin() 
        ? allUsers 
        : allUsers.filter(u => u.role !== 'ADMIN' && u.role !== 'SUPER_ADMIN');

      setUsers(visibleUsers);
      setLoading(false);
    });

    return () => unsubRegs();
  }, [isSuperAdmin]);

  const teamLeaders = users.filter((u) => u.isTeamLeader || u.role === 'TEAM_LEADER');
  const activeSuperAdmins = users.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'Approved');

  // Filter users
  const filteredUsers = users.filter((u) => {
    // Redundant but safe check: Normal Admins never see Admin/Super Admin
    if (!isSuperAdmin() && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')) return false;

    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.mobileNumber && u.mobileNumber.includes(searchTerm));

    const matchesDept = departmentFilter === 'ALL' || u.office === departmentFilter;
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;

    return matchesSearch && matchesDept && matchesRole && matchesStatus;
  });

  const openEditModal = (u: ManagedUser) => {
    setSelectedUser(u);
    setEditRole(u.role);
    setEditStatus(u.status as any);
    setEditDepartment(u.office || 'Raniganj');
    setEditDesignation(u.designation || '');
    const isTl = !!u.isTeamLeader || u.role === 'TEAM_LEADER';
    setEditIsTeamLeader(isTl);
    setEditTeamLeaderId(u.assignedTeamLeaderId || '');
    setEditLoginId(u.loginId || '');

    // Pre-populate assigned team members if user is a Team Leader
    const existingMembers = users
      .filter((emp) => emp.assignedTeamLeaderId === u.id || (emp as any).teamLeaderUid === u.id)
      .map((emp) => emp.id);
    const initialMemberUids = Array.from(new Set([...(u.teamMemberUids || []), ...existingMembers]));
    setEditTeamMemberUids(initialMemberUids);

    setTeamMemberSearchTerm('');
    setTeamMemberDeptFilter('ALL');
    setStatusMessage(null);
    setIsEditModalOpen(true);
  };

  const openDetailModal = (u: ManagedUser) => {
    setSelectedUser(u);
    setIsDetailModalOpen(true);
  };

  const openProfileEditModal = (u: ManagedUser) => {
    setSelectedUser(u);
    setIsProfileEditModalOpen(true);
  };

  const handleUpdateProfile = async (uid: string, data: Record<string, any>, oldData: Record<string, any>) => {
    await updateEmployeeProfile(uid, data, {
        uid: adminUser?.uid || 'ADMIN_UID',
        email: adminUser?.email || 'admin@exfin.internal',
        role: activeAdminRole || 'ADMIN'
    }, oldData);
    setStatusMessage({ type: 'success', text: 'Employee profile updated successfully.' });
  };

  const toggleMemberSelection = (empId: string) => {
    setEditTeamMemberUids((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const eligibleEmployees = users.filter((u) => {
    if (selectedUser && u.id === selectedUser.id) return false; // Do not allow self assignment
    if (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') return false; // Exclude admins
    
    const matchesSearch =
      u.name.toLowerCase().includes(teamMemberSearchTerm.toLowerCase()) ||
      u.employeeCode.toLowerCase().includes(teamMemberSearchTerm.toLowerCase());
    const matchesDept = teamMemberDeptFilter === 'ALL' || u.office === teamMemberDeptFilter;

    return matchesSearch && matchesDept;
  });

  const handleSelectAllMembers = () => {
    const visibleIds = eligibleEmployees.map((e) => e.id);
    setEditTeamMemberUids((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleClearAllMembers = () => {
    const visibleIds = new Set(eligibleEmployees.map((e) => e.id));
    setEditTeamMemberUids((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setStatusMessage(null);

    // Security Check: Only Super Admin can modify Super Admin roles or assign Admin/Super Admin
    const targetIsSuperAdmin = selectedUser.role === 'SUPER_ADMIN';
    const assigningAdminOrSuper = editRole === 'ADMIN' || editRole === 'SUPER_ADMIN';

    if (!isSuperAdmin() && (targetIsSuperAdmin || assigningAdminOrSuper)) {
      setStatusMessage({
        type: 'error',
        text: 'You do not have permission to perform this action.',
      });
      setIsSubmitting(false);
      return;
    }

    // Protection: Prevent demoting/deactivating the last active Super Admin
    if (targetIsSuperAdmin && (editRole !== 'SUPER_ADMIN' || editStatus === 'Suspended')) {
      if (activeSuperAdmins.length <= 1) {
        setStatusMessage({
          type: 'error',
          text: 'Protected Operation: This account cannot be deactivated or have its role changed at this time.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    // Login ID validations
    const cleanedLoginId = editLoginId.trim().toLowerCase().replace(/\s+/g, '');
    const previousLoginId = (selectedUser.loginId || '').trim().toLowerCase().replace(/\s+/g, '');
    const isNewRoleAdmin = editRole === 'ADMIN' || editRole === 'SUPER_ADMIN' || editRole === 'HR';

    // Block non-Super Admins from modifying privileged credentials/login IDs
    if (targetIsSuperAdmin && !isSuperAdmin() && (cleanedLoginId !== previousLoginId)) {
      setStatusMessage({
        type: 'error',
        text: 'You do not have permission to perform this action.',
      });
      setIsSubmitting(false);
      return;
    }

    if (isNewRoleAdmin && cleanedLoginId !== previousLoginId) {
      if (!isSuperAdmin()) {
        setStatusMessage({
          type: 'error',
          text: 'You do not have permission to perform this action.',
        });
        setIsSubmitting(false);
        return;
      }

      if (!cleanedLoginId) {
        setStatusMessage({
          type: 'error',
          text: 'Validation Error: Login ID cannot be empty for administrative roles.',
        });
        setIsSubmitting(false);
        return;
      }

      // Check uniqueness of login ID globally
      try {
        const checkDoc = await getDoc(doc(db, 'login_ids', cleanedLoginId));
        if (checkDoc.exists()) {
          const checkData = checkDoc.data();
          if (checkData.uid !== selectedUser.id) {
            setStatusMessage({
              type: 'error',
              text: 'Duplicate Login ID: This Login ID is already assigned to another user.',
            });
            setIsSubmitting(false);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking login ID uniqueness:', err);
        setStatusMessage({
          type: 'error',
          text: 'Database Error: Could not verify Login ID uniqueness.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const selectedTL = teamLeaders.find((tl) => tl.id === editTeamLeaderId);
      const isTargetTl = editIsTeamLeader || editRole === 'TEAM_LEADER';

      await updateUserRoleAndStatus({
        userId: selectedUser.id,
        employeeCode: selectedUser.employeeCode,
        newRole: editRole,
        previousRole: selectedUser.role,
        newStatus: editStatus,
        previousStatus: selectedUser.status,
        department: editDepartment,
        designation: editDesignation,
        isTeamLeader: isTargetTl,
        assignedTeamLeaderId: editTeamLeaderId,
        assignedTeamLeaderName: selectedTL ? selectedTL.name : '',
        teamMemberUids: isTargetTl ? editTeamMemberUids : [],
        actorEmail: loginId || adminUser?.email || 'admin@exfin.internal',
        actorUid: adminUser?.uid || 'ADMIN_UID',
      });

      // Update loginId mapping based on the role and changes
      if (isSuperAdmin()) {
        if (!isNewRoleAdmin) {
          // If demoted from Admin, delete old loginId map
          if (previousLoginId) {
            await deleteDoc(doc(db, 'login_ids', previousLoginId));
          }
        } else if (cleanedLoginId !== previousLoginId) {
          // Delete old mapping if changed
          if (previousLoginId) {
            await deleteDoc(doc(db, 'login_ids', previousLoginId));
          }

          // Create new mapping
          const targetEmail = selectedUser.email || (selectedUser as any).email || '';
          await setDoc(doc(db, 'login_ids', cleanedLoginId), {
            email: targetEmail,
            uid: selectedUser.id,
          });

          // Set loginId in admin_users doc
          await setDoc(doc(db, 'admin_users', selectedUser.id), {
            loginId: cleanedLoginId,
          }, { merge: true });

          // Immutable Audit Log entry for Super Admin changing Login ID
          await addDoc(collection(db, 'audit_logs'), {
            actorUid: adminUser?.uid || 'SUPER_ADMIN_UID',
            actorEmail: loginId || adminUser?.email || 'super_admin@exfin.internal',
            actorRole: activeAdminRole || 'SUPER_ADMIN',
            action: 'SUPER_ADMIN_CHANGED_LOGIN_ID',
            targetType: 'USER',
            targetId: selectedUser.id,
            targetUid: selectedUser.id,
            oldLoginId: previousLoginId,
            newLoginId: cleanedLoginId,
            timestamp: new Date().toISOString(),
            deviceMetadata: navigator.userAgent,
            deviceInfo: navigator.userAgent,
          });
        }
      }

      setStatusMessage({ type: 'success', text: `User ${selectedUser.name} updated successfully!` });
      setTimeout(() => {
        setIsEditModalOpen(false);
        setSelectedUser(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setStatusMessage({ type: 'error', text: 'Failed to update user: ' + (err.message || 'Unknown error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteConfirmModal = (u: ManagedUser) => {
    if (!isSuperAdmin()) return;
    setSelectedUser(u);
    setIsDeleteModalOpen(true);
    setStatusMessage(null);
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (!isSuperAdmin()) {
      setStatusMessage({
        type: 'error',
        text: 'You do not have permission to perform this action.',
      });
      return;
    }

    // Protection: don't delete super admin or admin through this
    if (selectedUser.role === 'SUPER_ADMIN' || selectedUser.role === 'ADMIN') {
      setStatusMessage({
        type: 'error',
        text: 'Protected Operation: Admin/Super Admin accounts cannot be deleted through this interface.',
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const empCode = selectedUser.employeeCode;
      
      // 1. Delete all matching registrations by employee code
      const regsQ = query(collection(db, 'registrations'), where('employeeCode', '==', empCode));
      const regSnaps = await getDocs(regsQ);
      for (const d of regSnaps.docs) {
        await deleteDoc(doc(db, 'registrations', d.id));
      }

      // 2. Delete leaves
      const leavesQ = query(collection(db, 'leaves'), where('employeeCode', '==', empCode));
      const leavesSnaps = await getDocs(leavesQ);
      for (const d of leavesSnaps.docs) await deleteDoc(doc(db, 'leaves', d.id));

      // 3. Delete leave balances
      const balQ = query(collection(db, 'leave_balances'), where('employeeCode', '==', empCode));
      const balSnaps = await getDocs(balQ);
      for (const d of balSnaps.docs) await deleteDoc(doc(db, 'leave_balances', d.id));

      // 4. Delete tasks
      const tasksQ = query(collection(db, 'tasks'), where('employeeCode', '==', empCode));
      const tasksSnaps = await getDocs(tasksQ);
      for (const d of tasksSnaps.docs) await deleteDoc(doc(db, 'tasks', d.id));

      // 5. Delete attendance
      const attQ = query(collection(db, 'attendance'), where('employeeCode', '==', empCode));
      const attSnaps = await getDocs(attQ);
      for (const d of attSnaps.docs) await deleteDoc(doc(db, 'attendance', d.id));

      // 6. Delete expenses
      const expQ = query(collection(db, 'expenses'), where('employeeCode', '==', empCode));
      const expSnaps = await getDocs(expQ);
      for (const d of expSnaps.docs) await deleteDoc(doc(db, 'expenses', d.id));

      // 7. Delete efficiency snapshots
      const effQ = query(collection(db, 'efficiency_snapshots'), where('employeeCode', '==', empCode));
      const effSnaps = await getDocs(effQ);
      for (const d of effSnaps.docs) await deleteDoc(doc(db, 'efficiency_snapshots', d.id));

      // 8. Delete profile_change_requests
      const profQ = query(collection(db, 'profile_change_requests'), where('employeeCode', '==', empCode));
      const profSnaps = await getDocs(profQ);
      for (const d of profSnaps.docs) await deleteDoc(doc(db, 'profile_change_requests', d.id));

      // 8b. Delete notifications
      const notifQ = query(collection(db, 'notifications'), where('recipientEmployeeCode', '==', empCode));
      const notifSnaps = await getDocs(notifQ);
      for (const d of notifSnaps.docs) await deleteDoc(doc(db, 'notifications', d.id));

      // 9. Delete login_ids mapping if it exists
      if (selectedUser.loginId) {
         await deleteDoc(doc(db, 'login_ids', selectedUser.loginId));
      }

      // Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        actorUid: adminUser?.uid || 'SUPER_ADMIN_UID',
        actorEmail: loginId || adminUser?.email || 'super_admin@exfin.internal',
        actorRole: activeAdminRole || 'SUPER_ADMIN',
        action: 'SUPER_ADMIN_DELETED_EMPLOYEE',
        targetType: 'USER',
        targetId: selectedUser.id,
        employeeCode: empCode,
        employeeName: selectedUser.name,
        timestamp: new Date().toISOString(),
        recordsDeleted: regSnaps.size + leavesSnaps.size + balSnaps.size + tasksSnaps.size + attSnaps.size + expSnaps.size + effSnaps.size
      });

      setStatusMessage({ type: 'success', text: `Employee ${selectedUser.name} deleted successfully.` });
      setTimeout(() => {
        setIsDeleteModalOpen(false);
        setSelectedUser(null);
      }, 1500);

    } catch (err: any) {
      console.error('Error deleting user:', err);
      setStatusMessage({ type: 'error', text: 'Failed to delete employee: ' + (err.message || 'Unknown error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const departments = Array.from(
    new Set([
      ...users.map((u) => u.office || 'Raniganj'),
      ...masterDepts.filter((d) => d.active).map((d) => d.name),
    ])
  );

  const [isCleaning, setIsCleaning] = useState(false);

  const cleanupDuplicateDevices = async () => {
    if (!isSuperAdmin()) return;
    setIsCleaning(true);
    setStatusMessage({ type: 'success', text: 'Analyzing device records for duplicates...' });
    
    try {
      const regSnaps = await getDocs(collection(db, 'registrations'));
      const deviceMap = new Map<string, any[]>();
      
      regSnaps.docs.forEach(docSnap => {
        const data = docSnap.data();
        const deviceId = data.deviceId;
        if (deviceId && deviceId !== 'N/A') {
          const user = { id: docSnap.id, ...data };
          if (!deviceMap.has(deviceId)) {
            deviceMap.set(deviceId, []);
          }
          deviceMap.get(deviceId)!.push(user);
        }
      });
      
      let deletedCount = 0;
      const getCodeNum = (code: string) => parseInt(code.replace('EXFRNG', ''), 10) || 0;

      for (const [deviceId, users] of deviceMap.entries()) {
        if (users.length > 1) {
          // Sort by registrationDate descending (newest first)
          // Fallback to employee code sequence (higher number EXFRNG002 vs EXFRNG001) if dates are same
          users.sort((a, b) => {
            const dateA = new Date(a.registrationDate || 0).getTime();
            const dateB = new Date(b.registrationDate || 0).getTime();
            if (dateB !== dateA) return dateB - dateA;
            
            return getCodeNum(b.employeeCode) - getCodeNum(a.employeeCode);
          });
          
          // Keep the first one, delete the rest
          for (let i = 1; i < users.length; i++) {
            await deleteDoc(doc(db, 'registrations', users[i].id));
            deletedCount++;
          }
        }
      }
      
      setStatusMessage({ 
        type: 'success', 
        text: `Cleanup Complete: Removed ${deletedCount} duplicate device records. The newest registration for each device has been preserved.` 
      });
    } catch (err: any) {
      console.error('Error during device cleanup:', err);
      setStatusMessage({ type: 'error', text: 'Cleanup Failed: ' + (err.message || 'Unknown error') });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-black text-white">Central User Management</h2>
          </div>
          <p className="text-purple-300/70 text-xs sm:text-sm mt-1">
            Manage user roles, status activation, department scope, and team leader assignments enterprise-wide.
          </p>
        </div>
        
        {isSuperAdmin() && (
          <Button 
            onClick={cleanupDuplicateDevices} 
            disabled={isCleaning}
            variant="secondary"
            className="gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
            {isCleaning ? 'Cleaning...' : 'Cleanup Duplicates'}
          </Button>
        )}
      </div>

      {/* Sub tabs */}
      {isAdmin() && (
        <div className="flex bg-[#211044] p-1.5 rounded-2xl w-fit border border-purple-500/20">
          <button
            onClick={() => setActiveSubTab('DIRECTORY')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeSubTab === 'DIRECTORY'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-purple-300/80 hover:text-white'
            }`}
          >
            Employee Directory
          </button>
          <button
            onClick={() => setActiveSubTab('ORG_SETTINGS')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeSubTab === 'ORG_SETTINGS'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-purple-300/80 hover:text-white'
            }`}
          >
            Organization Settings (Departments & Designations)
          </button>
        </div>
      )}

      {activeSubTab === 'ORG_SETTINGS' ? (
        <OrganizationSettingsTab users={users} />
      ) : (
        <>
          {/* Filter and Search Bar */}
          <Card className="p-4 bg-[#2D1B5A] border-purple-500/20 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-purple-300/50" />
            <input
              type="text"
              placeholder="Search name, code, mobile..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400"
            />
          </div>

          {/* Department Filter */}
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
          >
            <option value="ALL">All Departments / Offices</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="TEAM_LEADER">Team Leader</option>
            <option value="HR">HR</option>
            {isSuperAdmin() && <option value="ADMIN">Admin</option>}
            {isSuperAdmin() && <option value="SUPER_ADMIN">Super Admin</option>}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
          >
            <option value="ALL">All Statuses</option>
            <option value="Approved">Approved / Active</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Suspended">Suspended / Deactivated</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </Card>

      {/* User Table */}
      <Card className="p-0 overflow-hidden bg-[#2D1B5A] border-purple-500/20">
        {loading ? (
          <div className="p-8 text-center text-purple-300/60 text-xs">Loading employee records...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-purple-300/60 text-xs">No employees found matching filter criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#211044] text-purple-200 text-xs font-bold uppercase tracking-wider border-b border-purple-500/20">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Office</th>
                  <th className="p-3">Team Leader</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 text-xs">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-white">{u.name}</div>
                      <div className="text-[10px] text-purple-300/60 font-mono">
                        {u.employeeCode} • {u.mobileNumber}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : u.role === 'ADMIN'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : u.role === 'HR'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : u.role === 'TEAM_LEADER'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/10 text-purple-200'
                        }`}
                      >
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-purple-200">
                      <div>{u.office || 'Raniganj'}</div>
                      {u.designation && <div className="text-[10px] text-purple-300/60 font-medium">{u.designation}</div>}
                    </td>
                    <td className="p-3 text-purple-300/80">
                      {u.isTeamLeader ? (
                        <span className="text-emerald-400 font-bold">Self (Team Leader)</span>
                      ) : u.assignedTeamLeaderName ? (
                        u.assignedTeamLeaderName
                      ) : (
                        <span className="text-purple-300/40">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.status === 'Approved'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : u.status === 'Suspended'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => openDetailModal(u)}
                          variant="secondary"
                          className="p-1.5 h-auto text-purple-300 hover:text-white"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          onClick={() => openProfileEditModal(u)}
                          className="p-1.5 h-auto bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white"
                          title="Edit Profile"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          onClick={() => openEditModal(u)}
                          disabled={!isSuperAdmin() && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')}
                          className="p-1.5 h-auto bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title={!isSuperAdmin() && (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') ? "You do not have permission to perform this action." : "Edit User Role / Status"}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                        {isSuperAdmin() && (
                          <Button
                            onClick={() => openDeleteConfirmModal(u)}
                            variant="secondary"
                            className="p-1.5 h-auto bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white"
                            title="Delete Employee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* DETAIL MODAL */}
      {isDetailModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#211044] border border-purple-500/30 rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedUser.name}</h3>
                <p className="text-xs text-purple-300/70 font-mono">{selectedUser.employeeCode}</p>
              </div>
              <Button onClick={() => setIsDetailModalOpen(false)} variant="secondary" className="p-1.5 h-auto text-xs">
                Close
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-1">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Role</span>
                <span className="text-white font-bold">{selectedUser.role}</span>
              </div>
              <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-1">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Status</span>
                <span className="text-emerald-300 font-bold">{selectedUser.status}</span>
              </div>
              <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-1">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Department</span>
                <span className="text-white font-bold">{selectedUser.office || 'Raniganj'}</span>
              </div>
              <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-1">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Designation</span>
                <span className="text-white font-bold">{selectedUser.designation || 'N/A'}</span>
              </div>
              <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-1 col-span-2">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Mobile</span>
                <span className="text-white font-bold">{selectedUser.mobileNumber || 'N/A'}</span>
              </div>
            </div>

            <div className="p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20 space-y-2 text-xs">
              <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Device Hardware Info</span>
              <div className="grid grid-cols-2 gap-2 text-purple-200">
                <div>Model: <strong className="text-white">{selectedUser.deviceModel || 'N/A'}</strong></div>
                <div>Android: <strong className="text-white">{selectedUser.androidVersion || 'N/A'}</strong></div>
                <div>App Version: <strong className="text-white">{selectedUser.appVersion || 'N/A'}</strong></div>
                <div className="truncate">Device ID: <strong className="text-white font-mono text-[10px]">{selectedUser.deviceId || 'N/A'}</strong></div>
              </div>
            </div>

            {selectedUser.selfieUrl && (
              <div className="space-y-1">
                <span className="text-[10px] text-purple-300/60 uppercase font-bold block">Registration Selfie</span>
                <img
                  src={selectedUser.selfieUrl}
                  alt="Registration Selfie"
                  className="w-full h-40 object-cover rounded-xl border border-purple-500/30"
                />
              </div>
            )}
          </div>
        </div>
      )}
      {isProfileEditModalOpen && selectedUser && (
        <ProfileEditModal
          user={selectedUser}
          isOpen={isProfileEditModalOpen}
          onClose={() => setIsProfileEditModalOpen(false)}
          onSave={handleUpdateProfile}
          departments={masterDepts}
          designations={masterDesigs}
        />
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#211044] border border-purple-500/30 rounded-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">Edit User Settings</h3>
                <p className="text-xs text-purple-300/70">{selectedUser.name} ({selectedUser.employeeCode})</p>
              </div>
              <Button onClick={() => setIsEditModalOpen(false)} variant="secondary" className="p-1.5 h-auto text-xs">
                Cancel
              </Button>
            </div>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Role Select */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Assigned Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AppRole)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="TEAM_LEADER">Team Leader</option>
                  <option value="HR">HR</option>
                  {isSuperAdmin() && <option value="ADMIN">Admin</option>}
                  {isSuperAdmin() && <option value="SUPER_ADMIN">Super Admin</option>}
                </select>
                {!isSuperAdmin() && (editRole === 'ADMIN' || editRole === 'SUPER_ADMIN') && (
                  <p className="text-[10px] text-amber-300/80 italic">You do not have permission to perform this action.</p>
                )}
              </div>

              {/* Login ID Input */}
              {(editRole === 'ADMIN' || editRole === 'SUPER_ADMIN' || editRole === 'HR') && (
                <div className="space-y-1">
                  <label className="text-purple-300 font-bold block flex items-center justify-between">
                    <span>Login ID (Username)</span>
                    {isSuperAdmin() && (
                      <span className="text-[10px] text-purple-400 font-medium">Lowercase, no spaces</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={editLoginId}
                    disabled={!isSuperAdmin() || (selectedUser?.role === 'SUPER_ADMIN' && !isSuperAdmin())}
                    onChange={(e) => setEditLoginId(e.target.value.toLowerCase().trim().replace(/\s+/g, ''))}
                    placeholder="e.g. admin"
                    className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {!isSuperAdmin() && (
                    <p className="text-[10px] text-amber-300/80 italic">You do not have permission to perform this action.</p>
                  )}
                </div>
              )}

              {/* Status Select */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  <option value="Approved">Approved (Active)</option>
                  <option value="Suspended">Suspended (Deactivated)</option>
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Department / Office</label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  {masterDepts
                    .filter((d) => d.active || d.name === editDepartment)
                    .map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} {!d.active && '(Inactive)'}
                      </option>
                    ))}
                  {editDepartment && !masterDepts.some((d) => d.name === editDepartment) && (
                    <option value={editDepartment}>{editDepartment} (Unmapped)</option>
                  )}
                  <option value="Raniganj">Raniganj (Default)</option>
                </select>
              </div>

              {/* Designation */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Designation</label>
                <select
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  <option value="">-- Select Designation --</option>
                  {masterDesigs
                    .filter((d) => d.active || d.name === editDesignation)
                    .map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} {!d.active && '(Inactive)'}
                      </option>
                    ))}
                  {editDesignation && !masterDesigs.some((d) => d.name === editDesignation) && (
                    <option value={editDesignation}>{editDesignation} (Unmapped)</option>
                  )}
                  <option value="Executive">Executive</option>
                  <option value="Team Leader">Team Leader</option>
                </select>
              </div>

              {/* Is Team Leader Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isTlCheck"
                  checked={editIsTeamLeader}
                  onChange={(e) => setEditIsTeamLeader(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="isTlCheck" className="text-purple-200 font-bold cursor-pointer">
                  Designate as Team Leader
                </label>
              </div>

              {/* ASSIGN TEAM MEMBERS SECTION */}
              {(editIsTeamLeader || editRole === 'TEAM_LEADER') && (
                <div className="space-y-3 pt-3 border-t border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <label className="text-purple-300 font-bold block text-xs">Assign Team Members</label>
                    <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      {editTeamMemberUids.length} Assigned
                    </span>
                  </div>

                  {/* Member Search & Department Filter */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={teamMemberSearchTerm}
                      onChange={(e) => setTeamMemberSearchTerm(e.target.value)}
                      className="px-2.5 py-1.5 bg-[#2D1B5A] border border-purple-500/30 rounded-lg text-xs text-white placeholder-purple-300/40 focus:outline-none"
                    />
                    <select
                      value={teamMemberDeptFilter}
                      onChange={(e) => setTeamMemberDeptFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-[#2D1B5A] border border-purple-500/30 rounded-lg text-xs text-white focus:outline-none"
                    >
                      <option value="ALL">All Depts</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select All / Clear All */}
                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="text-purple-300/60 font-medium">Eligible Employees</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllMembers}
                        className="text-purple-400 hover:text-purple-200 font-bold underline text-[10px]"
                      >
                        Select All
                      </button>
                      <span className="text-purple-500">•</span>
                      <button
                        type="button"
                        onClick={handleClearAllMembers}
                        className="text-purple-400 hover:text-purple-200 font-bold underline text-[10px]"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Member Checkbox List */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#1A0B36] border border-purple-500/20 rounded-xl">
                    {eligibleEmployees.length === 0 ? (
                      <div className="p-3 text-center text-purple-300/50 text-xs">No eligible employees found.</div>
                    ) : (
                      eligibleEmployees.map((emp) => {
                        const isChecked = editTeamMemberUids.includes(emp.id);
                        const currentTl = teamLeaders.find(
                          (tl) => tl.id === emp.assignedTeamLeaderId || tl.id === (emp as any).teamLeaderUid
                        );
                        const assignedToOther = currentTl && currentTl.id !== selectedUser.id;

                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border ${
                              isChecked
                                ? 'bg-purple-600/20 border-purple-500/40 text-white'
                                : 'bg-[#211044]/50 border-transparent hover:bg-purple-500/10 text-purple-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleMemberSelection(emp.id)}
                                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-500/40"
                              />
                              <div className="truncate">
                                <div className="font-bold text-xs text-white truncate">{emp.name}</div>
                                <div className="text-[10px] text-purple-300/60 font-mono">
                                  {emp.employeeCode} • {emp.office || 'Raniganj'}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0 ml-2">
                              {assignedToOther ? (
                                <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  TL: {currentTl.name}
                                </span>
                              ) : currentTl && currentTl.id === selectedUser.id ? (
                                <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  In Team
                                </span>
                              ) : (
                                <span className="text-[9px] text-purple-300/40 italic">Unassigned</span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {editTeamMemberUids.length === 0 && (
                    <div className="text-[11px] text-amber-300/90 italic bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-center font-medium">
                      No team members assigned
                    </div>
                  )}
                </div>
              )}

              {/* Assign Team Leader */}
              {!editIsTeamLeader && editRole !== 'TEAM_LEADER' && (
                <div className="space-y-1 pt-1">
                  <label className="text-purple-300 font-bold block">Assign Team Leader</label>
                  <select
                    value={editTeamLeaderId}
                    onChange={(e) => setEditTeamLeaderId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                  >
                    <option value="">No Team Leader Assigned</option>
                    {teamLeaders.map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.name} ({tl.office || 'Raniganj'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setIsEditModalOpen(false)} variant="secondary" className="flex-1 text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={isSubmitting}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-xs"
              >
                {isSubmitting ? 'Saving...' : 'Update User'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#211044] border border-red-500/50 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> Confirm Deletion
              </h3>
              <p className="text-xs text-purple-200 mt-2">
                Delete this employee and all associated data? This action is permanent and cannot be undone.
              </p>
            </div>

            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-xs">
              <span className="text-white font-bold block">{selectedUser.name}</span>
              <span className="text-red-300 font-mono block">{selectedUser.employeeCode}</span>
            </div>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsDeleteModalOpen(false)} variant="secondary" className="px-4 py-2 text-xs" disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleDeleteUser} className="px-4 py-2 text-xs bg-red-600 hover:bg-red-700 text-white border border-red-500" disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'DELETE'}
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
