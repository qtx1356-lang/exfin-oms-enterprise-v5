import React, { useEffect, useState } from "react";
import { Edit, Search, Filter, User, CheckCircle2, ShieldCheck, Mail, Phone, Building2, Briefcase, Trash2, Users } from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { db } from "../../services/firebase/config";
import { collection, onSnapshot, getDocs, doc, deleteDoc } from "firebase/firestore";
import { ProfileEditModal } from "../../components/common/ProfileEditModal";
import { ManagedUser } from "../../types/user";
import { updateEmployeeProfile } from "../../services/admin/adminProfileService";
import { updateUserRoleAndStatus } from "../../services/rbac/rbacService";

export const UserManagementTab: React.FC = () => {
  const { user, role, loginId } = useAdminAuth();
  
  const [employees, setEmployees] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDept, setFilterDept] = useState("ALL");
  const [filterDesig, setFilterDesig] = useState("ALL");
  const [filterRole, setFilterRole] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  useEffect(() => {
    if (!db) return;
    
    // Load Departments
    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const depts: any[] = [];
      snap.forEach(d => depts.push({ id: d.id, ...d.data() }));
      setDepartments(depts);
    });

    // Load Designations
    const unsubDesigs = onSnapshot(collection(db, 'designations'), (snap) => {
      const desigs: any[] = [];
      snap.forEach(d => desigs.push({ id: d.id, ...d.data() }));
      setDesignations(desigs);
    });

    // Load Employees
    const unsubEmps = onSnapshot(collection(db, 'registrations'), (snap) => {
      const emps: ManagedUser[] = [];
      snap.forEach(d => {
        const data = d.data();
        emps.push({ id: d.id, ...data } as ManagedUser);
      });
      setEmployees(emps);
      setLoading(false);
    });

    return () => {
      unsubDepts();
      unsubDesigs();
      unsubEmps();
    };
  }, []);

  const handleEditClick = (emp: ManagedUser) => {
    setSelectedUser(emp);
    setIsModalOpen(true);
  };

  const handleSaveProfile = async (uid: string, data: Record<string, any>, oldData: Record<string, any>) => {
    if (!user) return;
    
    try {
      const actor = {
        uid: user.uid,
        email: loginId || user.email || 'Unknown',
        role: role || 'ADMIN'
      };
      
      // Call updateUserRoleAndStatus to process role, status, department, designation, and Team Leader assignments
      await updateUserRoleAndStatus({
        userId: uid,
        employeeCode: oldData.employeeCode,
        newRole: data.role || oldData.role || 'EMPLOYEE',
        previousRole: oldData.role,
        newStatus: data.status || oldData.status,
        previousStatus: oldData.status,
        department: data.office,
        designation: data.designation,
        assignedTeamLeaderId: data.assignedTeamLeaderId,
        assignedTeamLeaderName: data.assignedTeamLeaderName,
        assignedTeamLeaderCode: data.assignedTeamLeaderCode,
        isTeamLeader: data.isTeamLeader,
        actorEmail: actor.email,
        actorUid: actor.uid,
      });

      // Update basic details (name, phone, email, photo)
      const extraFields: Record<string, any> = {};
      if (data.name !== undefined) extraFields.name = data.name;
      if (data.mobileNumber !== undefined) extraFields.mobileNumber = data.mobileNumber;
      if (data.email !== undefined) extraFields.email = data.email;
      if (data.profilePhotoUrl !== undefined) extraFields.profilePhotoUrl = data.profilePhotoUrl;

      if (Object.keys(extraFields).length > 0) {
        await updateEmployeeProfile(uid, extraFields, actor, oldData);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Update failed', err);
      alert(err.message || 'Failed to update profile.');
    }
  };
  
  const handleDeleteEmployee = async (emp: ManagedUser) => {
    if (!window.confirm(`Are you sure you want to completely delete employee ${emp.name}? This cannot be undone.`)) {
       return;
    }
    
    try {
       await deleteDoc(doc(db, 'registrations', emp.id));
    } catch (err: any) {
       alert(err.message || "Failed to delete employee.");
    }
  };

  const filteredEmployees = employees.filter(emp => {
    // Search
    const search = searchTerm.toLowerCase();
    const matchesSearch = 
      (emp.name || '').toLowerCase().includes(search) ||
      (emp.employeeCode || '').toLowerCase().includes(search) ||
      (emp.email || '').toLowerCase().includes(search) ||
      (emp.mobileNumber || '').toLowerCase().includes(search) ||
      (emp.office || '').toLowerCase().includes(search);
      
    if (!matchesSearch) return false;

    // Filters
    if (filterDept !== 'ALL' && emp.office !== filterDept && (emp as any).departmentName !== filterDept) return false;
    if (filterDesig !== 'ALL' && emp.designation !== filterDesig) return false;
    if (filterRole !== 'ALL' && emp.role !== filterRole && !(filterRole === 'TEAM_LEADER' && emp.isTeamLeader)) return false;
    if (filterStatus !== 'ALL' && emp.status !== filterStatus) return false;
    
    // Role visibility logic
    if (role === 'ADMIN') {
      if (emp.role === 'SUPER_ADMIN' || emp.role === 'ADMIN') {
         return false;
      }
    }

    return true;
  });

  if (loading) {
     return <div className="p-8 text-center text-purple-300">Loading user management...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-[#2D1B5A] border border-purple-500/20 p-4 rounded-[20px] shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
            <input
              type="text"
              placeholder="Search by name, code, email, department, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#1A0B2E] border border-purple-500/20 rounded-xl text-white text-xs focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="px-3 py-2 bg-[#1A0B2E] border border-purple-500/20 rounded-xl text-white text-xs focus:outline-none font-bold"
          >
            <option value="ALL">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
          
          <select
            value={filterDesig}
            onChange={(e) => setFilterDesig(e.target.value)}
            className="px-3 py-2 bg-[#1A0B2E] border border-purple-500/20 rounded-xl text-white text-xs focus:outline-none font-bold"
          >
            <option value="ALL">All Designations</option>
            {designations.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-[#1A0B2E] border border-purple-500/20 rounded-xl text-white text-xs focus:outline-none font-bold"
          >
            <option value="ALL">All Roles</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="TEAM_LEADER">Team Leader</option>
            <option value="HR">HR</option>
            {role === 'SUPER_ADMIN' && <option value="ADMIN">Admin</option>}
            {role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-[#1A0B2E] border border-purple-500/20 rounded-xl text-white text-xs focus:outline-none font-bold"
          >
            <option value="ALL">All Statuses</option>
            <option value="Pending Approval">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-[#2D1B5A] border border-purple-500/20 rounded-[20px] shadow-xl overflow-x-auto">
        <table className="w-full text-left min-w-max border-collapse">
          <thead>
            <tr className="bg-purple-900/30 border-b border-purple-500/20 text-[10px] font-black tracking-wider text-purple-300 uppercase">
              <th className="px-4 py-3">Profile</th>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Team Leader / Assignment</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-purple-900/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="w-10 h-10 rounded-full bg-[#1A0B2E] border border-purple-500/30 overflow-hidden flex items-center justify-center">
                      {(emp as any).profilePhotoUrl || emp.selfieUrl ? (
                        <img src={(emp as any).profilePhotoUrl || emp.selfieUrl} alt={emp.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-purple-300/50" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-white text-sm">{emp.name || 'Unknown'}</div>
                    <div className="text-[10px] text-purple-300/70 flex items-center gap-1 mt-0.5">
                      {emp.email || 'No Email'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded bg-[#1A0B2E] border border-purple-500/20 font-mono text-purple-300 text-[10px] font-bold">
                      {emp.employeeCode || 'N/A'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-purple-200">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Building2 className="w-3.5 h-3.5 text-purple-400" />
                      {emp.office || (emp as any).departmentName || 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-purple-200">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                      {emp.designation || 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-purple-200">
                    {emp.isTeamLeader || emp.role === 'TEAM_LEADER' ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase flex items-center gap-1 w-max">
                        <Users className="w-3 h-3 text-amber-400" />
                        Team Leader
                      </span>
                    ) : (emp as any).assignedTeamLeaderName || (emp as any).teamLeaderName ? (
                      <div className="flex items-center gap-1 text-[11px] text-purple-200 font-bold">
                        <Users className="w-3 h-3 text-purple-400 shrink-0" />
                        <span>{(emp as any).assignedTeamLeaderName || (emp as any).teamLeaderName}</span>
                      </div>
                    ) : (
                      <span className="text-purple-300/40 text-[10px] italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[9px] font-black uppercase flex items-center gap-1 w-max">
                      <ShieldCheck className="w-3 h-3" />
                      {emp.role?.replace('_', ' ') || 'EMPLOYEE'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase flex items-center gap-1 w-max ${
                      emp.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      emp.status === 'Rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEditClick(emp)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg transition-all shadow-md flex items-center gap-1.5"
                      >
                        <Edit className="w-3.5 h-3.5 text-white" />
                        <span className="text-xs font-bold text-white">Edit</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-purple-300/40 text-sm">
                  No employees found matching criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <ProfileEditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          user={selectedUser}
          onSave={handleSaveProfile}
          departments={departments}
          designations={designations}
          allUsers={employees}
        />
      )}
    </div>
  );
};

