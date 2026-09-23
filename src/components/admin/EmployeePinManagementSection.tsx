import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  KeyRound,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Building,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { ResetPinConfirmationModal } from './ResetPinConfirmationModal';
import { initiateEmployeePinReset } from '../../services/security/adminPinResetService';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';

export interface EmployeePinItem {
  id: string; // Firestore registration document ID
  employeeCode: string;
  name: string;
  department: string;
  office: string;
  status: string;
  hasSecurityPinConfigured?: boolean;
  securityPinResetStatus?: 'PENDING' | 'COMPLETED' | string;
  securityPinResetAt?: string;
  securityPinResetBy?: string;
  securityPinResetRequestId?: string;
  securityPinResetReason?: string;
  securityPinResetCompletedAt?: string;
  securityPinResetCompletedBy?: string;
}

export const EmployeePinManagementSection: React.FC = () => {
  const { user, loginId, role } = useAdminAuth();
  const { hasPermission, isSuperAdmin, isAdmin } = usePermission();

  const canManagePin = isSuperAdmin() || isAdmin() || hasPermission('employeeManagement');

  const [employees, setEmployees] = useState<EmployeePinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');

  // Confirmation Modal state
  const [targetEmployee, setTargetEmployee] = useState<EmployeePinItem | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Load employees from registrations collection
  const loadEmployees = useCallback(() => {
    const activeDb = db.concrete || db;
    if (!activeDb) {
      setLoading(false);
      return () => {};
    }

    setLoading(true);
    const q = query(collection(activeDb, 'registrations'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: EmployeePinItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            employeeCode: data.employeeCode || d.id,
            name: data.name || 'Unnamed Employee',
            department: data.department || data.office || 'General',
            office: data.office || '',
            status: data.status || 'Approved',
            hasSecurityPinConfigured: data.hasSecurityPinConfigured,
            securityPinResetStatus: data.securityPinResetStatus,
            securityPinResetAt: data.securityPinResetAt,
            securityPinResetBy: data.securityPinResetBy,
            securityPinResetRequestId: data.securityPinResetRequestId,
            securityPinResetReason: data.securityPinResetReason,
            securityPinResetCompletedAt: data.securityPinResetCompletedAt,
            securityPinResetCompletedBy: data.securityPinResetCompletedBy,
          });
        });

        // Sort by employee code / name
        list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
        setEmployees(list);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to listen to registrations for PIN management:', err);
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  useEffect(() => {
    const unsub = loadEmployees();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [loadEmployees]);

  // Handle PIN reset confirmation
  const handleConfirmReset = async (reason?: string) => {
    if (!targetEmployee) return;

    const result = await initiateEmployeePinReset({
      employeeDocId: targetEmployee.id,
      employeeCode: targetEmployee.employeeCode,
      employeeName: targetEmployee.name,
      adminUserId: user?.uid || 'admin',
      adminLoginId: loginId || user?.email?.split('@')[0] || 'Administrator',
      adminRole: role,
      reason,
    });

    if (result.success) {
      setActionSuccessMessage(
        `Reset signal transmitted for ${targetEmployee.name} (${targetEmployee.employeeCode}). Local PIN will be invalidated when device syncs.`
      );
      setTimeout(() => setActionSuccessMessage(null), 5000);
    } else {
      throw new Error(result.error || 'Failed to trigger reset signal.');
    }
  };

  // Derive distinct departments
  const departments = Array.from(new Set(employees.map((e) => e.department).filter(Boolean)));

  // Helper to determine accurate status
  const getPinStatusInfo = (emp: EmployeePinItem) => {
    if (emp.securityPinResetStatus === 'PENDING') {
      return {
        label: 'Reset Pending',
        badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
        dotClass: 'bg-amber-400',
        icon: AlertTriangle,
        code: 'PENDING',
      };
    }

    if (emp.hasSecurityPinConfigured || emp.securityPinResetStatus === 'COMPLETED') {
      return {
        label: 'PIN Active',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
        dotClass: 'bg-emerald-400',
        icon: CheckCircle2,
        code: 'ACTIVE',
      };
    }

    return {
      label: 'PIN Not Configured',
      badgeClass: 'bg-slate-500/15 text-slate-300 border border-slate-500/30',
      dotClass: 'bg-slate-400',
      icon: HelpCircle,
      code: 'NOT_CONFIGURED',
    };
  };

  // Filtered employees
  const filteredEmployees = employees.filter((emp) => {
    const statusInfo = getPinStatusInfo(emp);

    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = filterStatus === 'ALL' || statusInfo.code === filterStatus;
    const matchesDept = filterDepartment === 'ALL' || emp.department === filterDepartment;

    return matchesSearch && matchesStatus && matchesDept;
  });

  // Metrics
  const totalCount = employees.length;
  const pendingCount = employees.filter((e) => e.securityPinResetStatus === 'PENDING').length;
  const activeCount = employees.filter(
    (e) => e.securityPinResetStatus !== 'PENDING' && (e.hasSecurityPinConfigured || e.securityPinResetStatus === 'COMPLETED')
  ).length;
  const notConfiguredCount = totalCount - pendingCount - activeCount;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold rounded-2xl flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-300 hover:text-white px-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Security Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-5 bg-[#210D44]/90 border border-purple-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <User className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
              Total Workforce
            </span>
            <span className="text-2xl font-black text-white">{totalCount}</span>
          </div>
        </Card>

        <Card className="p-5 bg-[#210D44]/90 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
              PIN Active
            </span>
            <span className="text-2xl font-black text-emerald-400">{activeCount}</span>
          </div>
        </Card>

        <Card className="p-5 bg-[#210D44]/90 border border-amber-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
              Reset Pending
            </span>
            <span className="text-2xl font-black text-amber-400">{pendingCount}</span>
          </div>
        </Card>

        <Card className="p-5 bg-[#210D44]/90 border border-slate-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-500/20 border border-slate-500/30 flex items-center justify-center text-slate-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Not Configured
            </span>
            <span className="text-2xl font-black text-slate-300">{notConfiguredCount}</span>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-[#210D44]/80 border border-purple-500/20 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by Employee Name, Code, or Dept..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs sm:text-sm text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="px-3 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All PIN States</option>
              <option value="ACTIVE">PIN Active</option>
              <option value="PENDING">Reset Pending</option>
              <option value="NOT_CONFIGURED">PIN Not Configured</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Employee PIN Roster Table */}
      <Card className="bg-[#210D44]/90 border border-purple-500/20 rounded-[28px] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-white">
            <thead className="bg-[#170932] text-purple-300 uppercase text-[10px] tracking-wider border-b border-purple-500/20">
              <tr>
                <th className="py-4 px-5">Employee</th>
                <th className="py-4 px-4">Employee Code</th>
                <th className="py-4 px-4">Department</th>
                <th className="py-4 px-4">Security PIN Status</th>
                <th className="py-4 px-4">Last Reset / Request</th>
                <th className="py-4 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-purple-300">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
                    Loading employee security records...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-purple-300/70">
                    No employee records found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const statusInfo = getPinStatusInfo(emp);
                  const StatusIcon = statusInfo.icon;
                  const isPending = emp.securityPinResetStatus === 'PENDING';

                  return (
                    <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Employee Info */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-black text-sm">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-extrabold text-white">{emp.name}</div>
                            <div className="text-[11px] text-purple-300/70">{emp.office || emp.department}</div>
                          </div>
                        </div>
                      </td>

                      {/* Employee Code */}
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 font-mono text-xs font-bold text-purple-200">
                          {emp.employeeCode}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-4 px-4">
                        <div className="text-xs text-purple-300 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>{emp.department}</span>
                        </div>
                      </td>

                      {/* Security PIN Status */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${statusInfo.badgeClass}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotClass}`} />
                            <StatusIcon className="w-3 h-3" />
                            <span>{statusInfo.label}</span>
                          </span>
                          <div className="text-[10px] text-purple-400/60 font-mono block">
                            Device PIN Status
                          </div>
                        </div>
                      </td>

                      {/* Last Reset / Request */}
                      <td className="py-4 px-4 text-xs text-purple-300/80">
                        {emp.securityPinResetAt ? (
                          <div>
                            <div className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{new Date(emp.securityPinResetAt).toLocaleDateString()}</span>
                            </div>
                            {emp.securityPinResetBy && (
                              <div className="text-[10px] text-purple-400">By: {emp.securityPinResetBy}</div>
                            )}
                            {emp.securityPinResetCompletedAt && (
                              <div className="text-[10px] text-emerald-400">
                                Completed: {new Date(emp.securityPinResetCompletedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-purple-400/50 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-5 text-right">
                        {canManagePin ? (
                          <Button
                            onClick={() => setTargetEmployee(emp)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow flex items-center gap-1.5 ml-auto ${
                              isPending
                                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                : 'bg-[#170932] hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset Security PIN</span>
                          </Button>
                        ) : (
                          <span className="text-purple-400/40 text-xs">Unauthorized</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Reset Confirmation Modal */}
      {targetEmployee && (
        <ResetPinConfirmationModal
          isOpen={!!targetEmployee}
          onClose={() => setTargetEmployee(null)}
          onConfirm={handleConfirmReset}
          employee={{
            name: targetEmployee.name,
            employeeCode: targetEmployee.employeeCode,
            department: targetEmployee.department,
          }}
        />
      )}
    </div>
  );
};
