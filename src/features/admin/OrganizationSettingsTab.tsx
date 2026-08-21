import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { Department, Designation } from '../../types/organization';
import { ManagedUser } from '../../types/user';
import {
  addDepartment,
  updateDepartment,
  toggleDepartmentActive,
  addDesignation,
  updateDesignation,
  toggleDesignationActive,
} from '../../services/organization/organizationService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Building2,
  Briefcase,
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
} from 'lucide-react';

interface OrganizationSettingsTabProps {
  users: ManagedUser[];
}

export const OrganizationSettingsTab: React.FC<OrganizationSettingsTabProps> = ({ users }) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);

  // Search terms
  const [deptSearch, setDeptSearch] = useState('');
  const [desigSearch, setDesigSearch] = useState('');

  // Modals / Form States
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [deptFormType, setDeptFormType] = useState<'ADD' | 'EDIT'>('ADD');
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [deptError, setDeptError] = useState<string | null>(null);

  const [isDesigModalOpen, setIsDesigModalOpen] = useState(false);
  const [desigFormType, setDesigFormType] = useState<'ADD' | 'EDIT'>('ADD');
  const [selectedDesig, setSelectedDesig] = useState<Designation | null>(null);
  const [desigName, setDesigName] = useState('');
  const [desigDesc, setDesigDesc] = useState('');
  const [desigError, setDesigError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  // Realtime listeners for Departments and Designations
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsubDepts = onSnapshot(collection(db, 'departments'), (snapshot) => {
      const depts: Department[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        depts.push({
          id: docSnap.id,
          name: data.name || '',
          description: data.description || '',
          active: data.active !== false,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
        });
      });
      // Sort alphabetically
      depts.sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(depts);
    }, (err) => {
      console.error('Error fetching departments:', err);
    });

    const unsubDesigs = onSnapshot(collection(db, 'designations'), (snapshot) => {
      const desigs: Designation[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        desigs.push({
          id: docSnap.id,
          name: data.name || '',
          description: data.description || '',
          active: data.active !== false,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
        });
      });
      // Sort alphabetically
      desigs.sort((a, b) => a.name.localeCompare(b.name));
      setDesignations(desigs);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching designations:', err);
      setLoading(false);
    });

    return () => {
      unsubDepts();
      unsubDesigs();
    };
  }, []);

  // Compute stats: active employee counts
  const getDeptEmployeeCount = (dept: Department) => {
    return users.filter(
      (u) =>
        u.status === 'Approved' &&
        (u.office?.toLowerCase().trim() === dept.name.toLowerCase().trim() ||
          (u as any).departmentName?.toLowerCase().trim() === dept.name.toLowerCase().trim() ||
          (u as any).departmentId === dept.id)
    ).length;
  };

  const getDesigEmployeeCount = (desig: Designation) => {
    return users.filter(
      (u) =>
        u.status === 'Approved' &&
        ((u as any).designationName?.toLowerCase().trim() === desig.name.toLowerCase().trim() ||
          (u as any).designationId === desig.id)
    ).length;
  };

  // --- Department Handlers ---
  const handleOpenDeptAdd = () => {
    setDeptFormType('ADD');
    setSelectedDept(null);
    setDeptName('');
    setDeptDesc('');
    setDeptError(null);
    setIsDeptModalOpen(true);
  };

  const handleOpenDeptEdit = (dept: Department) => {
    setDeptFormType('EDIT');
    setSelectedDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description);
    setDeptError(null);
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptError(null);

    const nameTrimmed = deptName.trim();
    if (!nameTrimmed) {
      setDeptError('Department Name cannot be empty.');
      return;
    }

    if (nameTrimmed.length > 100) {
      setDeptError('Department Name cannot exceed 100 characters.');
      return;
    }

    // Duplicate check
    const isDuplicate = departments.some(
      (d) =>
        d.name.toLowerCase().trim() === nameTrimmed.toLowerCase() &&
        (deptFormType === 'ADD' || (selectedDept && d.id !== selectedDept.id))
    );

    if (isDuplicate) {
      setDeptError(`A department with the name "${nameTrimmed}" already exists.`);
      return;
    }

    setActionLoading(true);
    try {
      if (deptFormType === 'ADD') {
        await addDepartment(nameTrimmed, deptDesc);
      } else if (selectedDept) {
        await updateDepartment(selectedDept.id, nameTrimmed, deptDesc);
      }
      setIsDeptModalOpen(false);
    } catch (err: any) {
      console.error('Error saving department:', err);
      setDeptError(err.message || 'Failed to save department.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDeptActive = async (dept: Department) => {
    const isCurrentlyInUse = getDeptEmployeeCount(dept) > 0;
    if (dept.active && isCurrentlyInUse) {
      const confirmDeactivate = window.confirm(
        `Warning: This department has active employees assigned to it. Deactivating it will not change existing employee profile data, but will prevent this department from being selected for new assignments. Do you want to continue deactivating?`
      );
      if (!confirmDeactivate) return;
    }

    try {
      await toggleDepartmentActive(dept.id, dept.active);
    } catch (err) {
      console.error('Error toggling department active status:', err);
      alert('Failed to update status.');
    }
  };

  // --- Designation Handlers ---
  const handleOpenDesigAdd = () => {
    setDesigFormType('ADD');
    setSelectedDesig(null);
    setDesigName('');
    setDesigDesc('');
    setDesigError(null);
    setIsDesigModalOpen(true);
  };

  const handleOpenDesigEdit = (desig: Designation) => {
    setDesigFormType('EDIT');
    setSelectedDesig(desig);
    setDesigName(desig.name);
    setDesigDesc(desig.description);
    setDesigError(null);
    setIsDesigModalOpen(true);
  };

  const handleSaveDesig = async (e: React.FormEvent) => {
    e.preventDefault();
    setDesigError(null);

    const nameTrimmed = desigName.trim();
    if (!nameTrimmed) {
      setDesigError('Designation Name cannot be empty.');
      return;
    }

    if (nameTrimmed.length > 100) {
      setDesigError('Designation Name cannot exceed 100 characters.');
      return;
    }

    // Duplicate check
    const isDuplicate = designations.some(
      (d) =>
        d.name.toLowerCase().trim() === nameTrimmed.toLowerCase() &&
        (desigFormType === 'ADD' || (selectedDesig && d.id !== selectedDesig.id))
    );

    if (isDuplicate) {
      setDesigError(`A designation with the name "${nameTrimmed}" already exists.`);
      return;
    }

    setActionLoading(true);
    try {
      if (desigFormType === 'ADD') {
        await addDesignation(nameTrimmed, desigDesc);
      } else if (selectedDesig) {
        await updateDesignation(selectedDesig.id, nameTrimmed, desigDesc);
      }
      setIsDesigModalOpen(false);
    } catch (err: any) {
      console.error('Error saving designation:', err);
      setDesigError(err.message || 'Failed to save designation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDesigActive = async (desig: Designation) => {
    const isCurrentlyInUse = getDesigEmployeeCount(desig) > 0;
    if (desig.active && isCurrentlyInUse) {
      const confirmDeactivate = window.confirm(
        `Warning: This designation has active employees assigned to it. Deactivating it will not change existing employee profile data, but will prevent this designation from being selected for new assignments. Do you want to continue deactivating?`
      );
      if (!confirmDeactivate) return;
    }

    try {
      await toggleDesignationActive(desig.id, desig.active);
    } catch (err) {
      console.error('Error toggling designation active status:', err);
      alert('Failed to update status.');
    }
  };

  // Filtering lists
  const filteredDepts = departments.filter((d) =>
    d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
    d.description.toLowerCase().includes(deptSearch.toLowerCase())
  );

  const filteredDesigs = designations.filter((d) =>
    d.name.toLowerCase().includes(desigSearch.toLowerCase()) ||
    d.description.toLowerCase().includes(desigSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-purple-300/60 text-xs">
        Loading organization structure master lists...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* DEPARTMENTS COLUMN */}
      <Card className="p-6 bg-[#2D1B5A] border-purple-500/20 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-black text-white">Departments</h3>
          </div>
          <Button
            onClick={handleOpenDeptAdd}
            className="bg-purple-600 hover:bg-purple-500 text-xs py-1.5 h-8 gap-1 rounded-xl"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Department
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-purple-300/50" />
          <input
            type="text"
            placeholder="Search departments..."
            value={deptSearch}
            onChange={(e) => setDeptSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400"
          />
        </div>

        {/* Department List */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-500/20">
          {filteredDepts.length === 0 ? (
            <div className="text-center py-8 text-purple-300/40 text-xs">
              No departments defined. Click "Add Department" to get started.
            </div>
          ) : (
            filteredDepts.map((dept) => {
              const empCount = getDeptEmployeeCount(dept);
              return (
                <div
                  key={dept.id}
                  className={`p-3.5 rounded-xl border transition-all flex justify-between items-start gap-4 ${
                    dept.active
                      ? 'bg-[#211044]/60 border-purple-500/10 hover:border-purple-500/30'
                      : 'bg-[#170B38]/40 border-purple-500/5 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-white">{dept.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          dept.active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {dept.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {dept.description && (
                      <p className="text-xs text-purple-300/70 line-clamp-2 leading-relaxed">
                        {dept.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-purple-300/50">
                      <Users className="w-3 h-3 text-purple-400" />
                      <span>{empCount} Active Employees Assigned</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      onClick={() => handleOpenDeptEdit(dept)}
                      variant="secondary"
                      className="p-1.5 h-auto text-purple-300 hover:text-white hover:bg-white/5 border-none bg-transparent"
                      title="Edit Department"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleToggleDeptActive(dept)}
                      variant="secondary"
                      className={`p-1.5 h-auto border-none bg-transparent ${
                        dept.active
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-purple-300/40 hover:text-purple-300'
                      }`}
                      title={dept.active ? 'Deactivate Department' : 'Activate Department'}
                    >
                      {dept.active ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* DESIGNATIONS COLUMN */}
      <Card className="p-6 bg-[#2D1B5A] border-purple-500/20 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-black text-white">Designations</h3>
          </div>
          <Button
            onClick={handleOpenDesigAdd}
            className="bg-purple-600 hover:bg-purple-500 text-xs py-1.5 h-8 gap-1 rounded-xl"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Designation
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-purple-300/50" />
          <input
            type="text"
            placeholder="Search designations..."
            value={desigSearch}
            onChange={(e) => setDesigSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-[#211044] border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400"
          />
        </div>

        {/* Designation List */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-500/20">
          {filteredDesigs.length === 0 ? (
            <div className="text-center py-8 text-purple-300/40 text-xs">
              No designations defined. Click "Add Designation" to get started.
            </div>
          ) : (
            filteredDesigs.map((desig) => {
              const empCount = getDesigEmployeeCount(desig);
              return (
                <div
                  key={desig.id}
                  className={`p-3.5 rounded-xl border transition-all flex justify-between items-start gap-4 ${
                    desig.active
                      ? 'bg-[#211044]/60 border-purple-500/10 hover:border-purple-500/30'
                      : 'bg-[#170B38]/40 border-purple-500/5 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-white">{desig.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          desig.active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {desig.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {desig.description && (
                      <p className="text-xs text-purple-300/70 line-clamp-2 leading-relaxed">
                        {desig.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-purple-300/50">
                      <Users className="w-3 h-3 text-purple-400" />
                      <span>{empCount} Active Employees Assigned</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      onClick={() => handleOpenDesigEdit(desig)}
                      variant="secondary"
                      className="p-1.5 h-auto text-purple-300 hover:text-white hover:bg-white/5 border-none bg-transparent"
                      title="Edit Designation"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleToggleDesigActive(desig)}
                      variant="secondary"
                      className={`p-1.5 h-auto border-none bg-transparent ${
                        desig.active
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-purple-300/40 hover:text-purple-300'
                      }`}
                      title={desig.active ? 'Deactivate Designation' : 'Activate Designation'}
                    >
                      {desig.active ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* DEPARTMENT FORM MODAL */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 bg-[#0F0726]/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-[#211044] border border-purple-500/30 rounded-[24px] max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <h4 className="text-lg font-black text-white">
              {deptFormType === 'ADD' ? 'Add Department' : 'Edit Department'}
            </h4>

            <form onSubmit={handleSaveDept} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  Department Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Sales, Human Resources"
                  className="w-full px-4 py-2.5 bg-[#170B38] border border-purple-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  Description (Optional)
                </label>
                <textarea
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Optional brief description of the department's scope"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[#170B38] border border-purple-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              {deptError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-300 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{deptError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2 justify-end">
                <Button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  variant="secondary"
                  className="bg-transparent border border-purple-500/20 text-purple-300 hover:bg-white/5"
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving...' : 'Save Department'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DESIGNATION FORM MODAL */}
      {isDesigModalOpen && (
        <div className="fixed inset-0 bg-[#0F0726]/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-[#211044] border border-purple-500/30 rounded-[24px] max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <h4 className="text-lg font-black text-white">
              {desigFormType === 'ADD' ? 'Add Designation' : 'Edit Designation'}
            </h4>

            <form onSubmit={handleSaveDesig} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  Designation Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={desigName}
                  onChange={(e) => setDesigName(e.target.value)}
                  placeholder="e.g. Sales Officer, HR Executive"
                  className="w-full px-4 py-2.5 bg-[#170B38] border border-purple-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-purple-300 uppercase tracking-wider block">
                  Description (Optional)
                </label>
                <textarea
                  value={desigDesc}
                  onChange={(e) => setDesigDesc(e.target.value)}
                  placeholder="Optional brief description of the designation responsibilities"
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[#170B38] border border-purple-500/30 rounded-xl text-sm text-white focus:outline-none focus:border-purple-400 resize-none"
                />
              </div>

              {desigError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5 text-xs text-red-300 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{desigError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2 justify-end">
                <Button
                  type="button"
                  onClick={() => setIsDesigModalOpen(false)}
                  variant="secondary"
                  className="bg-transparent border border-purple-500/20 text-purple-300 hover:bg-white/5"
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-extrabold"
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Saving...' : 'Save Designation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
