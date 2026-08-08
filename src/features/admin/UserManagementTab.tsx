import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, doc, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { AppRole } from '../../types/roles';
import { updateUserRoleAndStatus } from '../../services/rbac/rbacService';
import { usePermission } from '../../context/PermissionContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Users,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  Edit3,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building,
  Smartphone,
  Eye,
  RefreshCw,
} from 'lucide-react';

export interface ManagedUser {
  id: string; // registrationId or uid
  employeeCode: string;
  name: string;
  mobileNumber?: string;
  office?: string;
  role: AppRole;
  status: 'Pending Approval' | 'Approved' | 'Rejected' | 'Suspended';
  isTeamLeader?: boolean;
  assignedTeamLeaderId?: string;
  assignedTeamLeaderName?: string;
  deviceId?: string;
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;
  registrationDate?: string;
  selfieUrl?: string;
}

export const UserManagementTab: React.FC = () => {
  const { isSuperAdmin, isAdmin } = usePermission();
  const { user: adminUser, role: activeAdminRole } = useAdminAuth();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Edit form state
  const [editRole, setEditRole] = useState<AppRole>('EMPLOYEE');
  const [editStatus, setEditStatus] = useState<'Approved' | 'Suspended' | 'Pending Approval' | 'Rejected'>('Approved');
  const [editDepartment, setEditDepartment] = useState('Raniganj');
  const [editIsTeamLeader, setEditIsTeamLeader] = useState(false);
  const [editTeamLeaderId, setEditTeamLeaderId] = useState('');

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
          role: uRole,
          status: data.status || 'Approved',
          isTeamLeader: !!data.isTeamLeader,
          assignedTeamLeaderId: data.assignedTeamLeaderId || '',
          assignedTeamLeaderName: data.assignedTeamLeaderName || '',
          deviceId: data.deviceId || 'N/A',
          deviceModel: data.deviceModel || 'N/A',
          androidVersion: data.androidVersion || 'N/A',
          appVersion: data.appVersion || 'N/A',
          registrationDate: data.registrationDate || '',
          selfieUrl: data.selfieUrl || '',
        });
      });

      // Supplement with admin_users collection if any exist
      try {
        const adminSnaps = await getDocs(collection(db, 'admin_users'));
        adminSnaps.docs.forEach((docSnap) => {
          const aData = docSnap.data();
          if (regUsersMap.has(docSnap.id)) {
            const existing = regUsersMap.get(docSnap.id)!;
            regUsersMap.set(docSnap.id, {
              ...existing,
              role: (aData.role as AppRole) || existing.role,
              office: aData.authorizedOffice || existing.office,
            });
          }
        });
      } catch (e) {
        console.error('Error supplementing admin users:', e);
      }

      setUsers(Array.from(regUsersMap.values()));
      setLoading(false);
    });

    return () => unsubRegs();
  }, []);

  const teamLeaders = users.filter((u) => u.isTeamLeader || u.role === 'TEAM_LEADER');
  const activeSuperAdmins = users.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'Approved');

  // Filter users
  const filteredUsers = users.filter((u) => {
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
    setEditIsTeamLeader(!!u.isTeamLeader || u.role === 'TEAM_LEADER');
    setEditTeamLeaderId(u.assignedTeamLeaderId || '');
    setStatusMessage(null);
    setIsEditModalOpen(true);
  };

  const openDetailModal = (u: ManagedUser) => {
    setSelectedUser(u);
    setIsDetailModalOpen(true);
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
        text: 'Security Policy Violation: Only Super Admins can manage Admin or Super Admin roles.',
      });
      setIsSubmitting(false);
      return;
    }

    // Protection: Prevent demoting/deactivating the last active Super Admin
    if (targetIsSuperAdmin && (editRole !== 'SUPER_ADMIN' || editStatus === 'Suspended')) {
      if (activeSuperAdmins.length <= 1) {
        setStatusMessage({
          type: 'error',
          text: 'Protected Super Admin Operation: Cannot revoke or deactivate the last Super Admin in the system.',
        });
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const selectedTL = teamLeaders.find((tl) => tl.id === editTeamLeaderId);

      await updateUserRoleAndStatus({
        userId: selectedUser.id,
        employeeCode: selectedUser.employeeCode,
        newRole: editRole,
        previousRole: selectedUser.role,
        newStatus: editStatus,
        previousStatus: selectedUser.status,
        department: editDepartment,
        isTeamLeader: editIsTeamLeader || editRole === 'TEAM_LEADER',
        assignedTeamLeaderId: editTeamLeaderId,
        assignedTeamLeaderName: selectedTL ? selectedTL.name : '',
        actorEmail: adminUser?.email || 'admin@exfin.internal',
        actorUid: adminUser?.uid || 'ADMIN_UID',
      });

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

  const departments = Array.from(new Set(users.map((u) => u.office || 'Raniganj')));

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
      </div>

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
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super Admin</option>
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
                    <td className="p-3 text-purple-200">{u.office || 'Raniganj'}</td>
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
                          onClick={() => openEditModal(u)}
                          className="p-1.5 h-auto bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white"
                          title="Edit User Role / Status"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
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

      {/* EDIT MODAL */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#211044] border border-purple-500/30 rounded-2xl max-w-md w-full p-6 space-y-4">
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
                  <option value="ADMIN">Admin</option>
                  <option value="SUPER_ADMIN">Super Admin</option>
                </select>
                {!isSuperAdmin() && (
                  <p className="text-[10px] text-amber-300/80 italic">Only Super Admins can assign Admin or Super Admin roles.</p>
                )}
              </div>

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
                <input
                  type="text"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                />
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
    </div>
  );
};
