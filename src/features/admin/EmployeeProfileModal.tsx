import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  User, Phone, Mail, Building, Briefcase, Calendar, Smartphone, Shield, 
  CheckCircle2, XCircle, Clock, AlertTriangle, FileText, Activity, Check, X, 
  Lock, Unlock, ShieldAlert, CheckSquare, DollarSign, CalendarDays 
} from 'lucide-react';
import { db } from '../../services/firebase/config';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { ManagedUser } from '../../types/user';
import { createAuditLog } from '../../services/audit/auditService';
import { calculateLeaveBalance } from '../../services/leave/leaveService';
import { getStoredLeaveConfig, getStoredEmployeeAllowances } from '../../services/leave/leaveStorage';
import { calculateWorkingHours } from '../../services/attendance/smartAttendanceEngine';
import { approveExpenseClaim, isExpenseApproved, isExpensePending } from '../../services/expenses/expenseService';

interface EmployeeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee?: ManagedUser | null;
  adminUser?: { uid?: string; email?: string; displayName?: string; role?: string };
  onUpdate?: () => void;
}

export const EmployeeProfileModal: React.FC<EmployeeProfileModalProps> = ({
  isOpen,
  onClose,
  employee,
  adminUser,
  onUpdate,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'tasks' | 'leave' | 'expenses' | 'device' | 'activity'>('overview');
  
  // Real-time sub-collections state
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Status and Device Action State
  const [currentStatus, setCurrentStatus] = useState<string>(employee?.status || 'Active');
  const [deviceStatus, setDeviceStatus] = useState<string>(employee?.status || (employee as any)?.deviceStatus || 'Pending');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [approvingExpenseId, setApprovingExpenseId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const empCode = employee?.employeeCode || employee?.id || '';
  const empId = employee?.id || '';

  useEffect(() => {
    if (!isOpen || !db || !empCode) {
      setLoadingData(false);
      return;
    }
    setLoadingData(true);

    const unsubAtt = onSnapshot(
      query(collection(db, 'attendance'), where('employeeCode', '==', empCode)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAttendanceRecords(list);
      },
      (err) => {
        console.warn('Attendance listener error in Profile Modal:', err);
      }
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assignedToEmployeeCodes', 'array-contains', empCode)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTasks(list);
      },
      (err) => {
        console.warn('Tasks listener error in Profile Modal:', err);
      }
    );

    const unsubLeaves = onSnapshot(
      query(collection(db, 'leaves'), where('employeeCode', '==', empCode)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLeaves(list);
      },
      (err) => {
        console.warn('Leaves listener error in Profile Modal:', err);
      }
    );

    const unsubExp = onSnapshot(
      query(collection(db, 'expenses'), where('employeeCode', '==', empCode)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setExpenses(list);
      },
      (err) => {
        console.warn('Expenses listener error in Profile Modal:', err);
      }
    );

    const unsubAudit = onSnapshot(
      query(collection(db, 'audit_logs'), where('employeeCode', '==', empCode)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        setAuditLogs(list);
        setLoadingData(false);
      },
      (err) => {
        console.warn('Audit logs listener error in Profile Modal:', err);
        setLoadingData(false);
      }
    );

    return () => {
      unsubAtt();
      unsubTasks();
      unsubLeaves();
      unsubExp();
      unsubAudit();
    };
  }, [isOpen, empCode]);

  if (!isOpen) return null;

  if (!employee) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        <div className="bg-[#1F103F] border border-purple-500/30 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">Profile Unavailable</h3>
          <p className="text-xs text-purple-200">Profile information is temporarily unavailable.</p>
          <Button onClick={onClose} className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
            Close
          </Button>
        </div>
      </div>
    );
  }

  const safeAttendance = Array.isArray(attendanceRecords) ? attendanceRecords : [];
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeLeaves = Array.isArray(leaves) ? leaves : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : [];

  // Compute Today Attendance safely
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = safeAttendance.find(
    (r: any) => r && ((r.date || '').includes(todayStr) || (r.timestamp || '').includes(todayStr) || (r.createdAtDeviceTime || '').includes(todayStr))
  );

  // Compute This Month Attendance Summary safely
  const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthAttendance = safeAttendance.filter(
    (r: any) => r && ((r.date || r.timestamp || r.createdAtDeviceTime || '').includes(currentMonthPrefix))
  );
  const presentCount = monthAttendance.filter((r: any) => r && (r.status === 'Present' || r.type === 'Office')).length;
  const wfhCount = monthAttendance.filter((r: any) => r && (r.type === 'WFH' || r.isWFH)).length;
  const clientVisitCount = monthAttendance.filter((r: any) => r && (r.type === 'Client Visit' || r.isClientVisit)).length;
  const absentCount = monthAttendance.filter((r: any) => r && r.status === 'Absent').length;
  const leaveCount = safeLeaves.filter(
    (l: any) => l && l.status === 'APPROVED' && (l.fromDate || l.startDate || '').includes(currentMonthPrefix)
  ).length;

  // Task Summary safely
  const assignedTasksCount = safeTasks.length;
  const completedTasksCount = safeTasks.filter((t: any) => t && (t.status === 'Completed' || t.completed)).length;
  const pendingTasksCount = safeTasks.filter((t: any) => t && (t.status === 'Pending' || t.status === 'In Progress' || !t.completed)).length;
  const overdueTasksCount = safeTasks.filter((t: any) => {
    if (!t || t.completed || t.status === 'Completed') return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate).getTime() < Date.now();
  }).length;

  // Leave Balance (April 1 – March 31 leave year) with stored fallbacks
  const storedConfig = getStoredLeaveConfig();
  const storedAllowances = getStoredEmployeeAllowances();
  const leaveBal = calculateLeaveBalance(
    empId,
    employee.office || employee.department || 'Raniganj',
    safeLeaves,
    storedConfig,
    storedAllowances
  );

  // Last Sync Time formatting safely
  const lastSyncIso = employee.lastSyncTime || (employee as any).lastSeen || employee.updatedAt;
  const lastSyncFormatted = lastSyncIso ? new Date(lastSyncIso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  }) + ' IST' : 'Never synced';

  // Handle Employee Status Change
  const handleStatusChange = async (newStatus: string) => {
    if (!db) return;
    setIsUpdatingStatus(true);
    setActionMessage(null);

    try {
      const regRef = doc(db, 'registrations', employee.id);
      await updateDoc(regRef, {
        status: newStatus,
        statusUpdatedBy: adminUser.displayName || adminUser.email || 'Admin',
        statusUpdatedAt: new Date().toISOString(),
      });

      // Audit Log
      await createAuditLog({
        action: 'EMPLOYEE_STATUS_CHANGED',
        actionCategory: 'Administration',
        performedByUserId: adminUser.uid,
        performedByName: adminUser.displayName || adminUser.email || 'Admin',
        performedByRole: adminUser.role || 'ADMIN',
        employeeCode: empCode,
        targetUserId: empId,
        targetUserName: employee.name || 'Employee',
        targetRecordId: empId,
        description: `Changed employee status to ${newStatus} for ${employee.name} (${empCode})`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        metadata: { previousStatus: currentStatus, newStatus }
      });

      setCurrentStatus(newStatus);
      setActionMessage({ type: 'success', text: `Employee status successfully updated to ${newStatus}.` });
      if (onUpdate) onUpdate();
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setActionMessage({ type: 'error', text: err.message || 'Failed to update status.' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle Device Action (Approve, Reject, Block, Unblock)
  const handleDeviceAction = async (action: 'Approved' | 'Rejected' | 'Blocked' | 'Active') => {
    if (!db) return;
    setIsUpdatingStatus(true);
    setActionMessage(null);

    try {
      const regRef = doc(db, 'registrations', employee.id);
      await updateDoc(regRef, {
        status: action,
        deviceStatus: action,
        deviceActionUpdatedBy: adminUser.displayName || adminUser.email || 'Admin',
        deviceActionUpdatedAt: new Date().toISOString(),
      });

      await createAuditLog({
        action: `DEVICE_${action.toUpperCase()}`,
        actionCategory: 'Authentication',
        performedByUserId: adminUser.uid,
        performedByName: adminUser.displayName || adminUser.email || 'Admin',
        performedByRole: adminUser.role || 'ADMIN',
        employeeCode: empCode,
        targetUserId: empId,
        targetUserName: employee.name || 'Employee',
        targetRecordId: empId,
        description: `Performed device action ${action} for ${employee.name} (${empCode})`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        metadata: { deviceId: employee.deviceId, newDeviceStatus: action }
      });

      setDeviceStatus(action);
      setCurrentStatus(action);
      setActionMessage({ type: 'success', text: `Device status successfully set to ${action}.` });
      if (onUpdate) onUpdate();
    } catch (err: any) {
      console.error('Device action failed:', err);
      setActionMessage({ type: 'error', text: err.message || 'Failed to update device status.' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#1F103F] border border-purple-500/30 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 glass-card border-b border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#1A0B36] border-2 border-purple-500/40 overflow-hidden flex items-center justify-center shadow-inner">
              {employee.selfieUrl || employee.profilePhotoUrl ? (
                <img src={employee.selfieUrl || employee.profilePhotoUrl} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-purple-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white">{employee.name || 'Employee Profile'}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  currentStatus === 'Approved' || currentStatus === 'Active' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                  currentStatus === 'Suspended' || currentStatus === 'Blocked' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                  'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}>
                  {currentStatus}
                </span>
              </div>
              <p className="text-xs font-mono text-purple-300">{empCode} • {employee.office || 'Raniganj Office'}</p>
              <p className="text-[11px] text-purple-300/70">{employee.mobileNumber || 'No mobile number'} • {employee.email || 'No email'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* Status Selector Dropdown */}
            <div className="flex items-center gap-2 bg-[#1A0B36] px-3 py-1.5 rounded-xl border border-purple-500/30">
              <span className="text-[10px] font-bold text-purple-300 uppercase">Status:</span>
              <select
                value={currentStatus}
                disabled={isUpdatingStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="Active" className="bg-[#1F103F] text-white">Active</option>
                <option value="Approved" className="bg-[#1F103F] text-white">Approved</option>
                <option value="Inactive" className="bg-[#1F103F] text-white">Inactive</option>
                <option value="Suspended" className="bg-[#1F103F] text-white">Suspended</option>
                <option value="Blocked" className="bg-[#1F103F] text-white">Blocked</option>
              </select>
            </div>

            <button
              onClick={onClose}
              className="text-purple-300 hover:text-white p-2 rounded-xl bg-purple-900/30 hover:bg-purple-900/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className={`mx-6 mt-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            actionMessage.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
          }`}>
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {actionMessage.text}
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-6 pt-4 border-b border-purple-500/20 overflow-x-auto bg-[#1A0B36]/60">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'attendance', label: `Attendance (${attendanceRecords.length})` },
            { id: 'tasks', label: `Tasks (${tasks.length})` },
            { id: 'leave', label: `Leave (${leaves.length})` },
            { id: 'expenses', label: `Expenses (${expenses.length})` },
            { id: 'device', label: 'Device & Sync' },
            { id: 'activity', label: `Activity Log (${auditLogs.length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'glass-card text-amber-400 border-t-2 border-amber-400 shadow-md'
                  : 'text-purple-300/70 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Top Quick Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Employee Card */}
                <Card className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
                  <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2 border-b border-purple-500/10 pb-2">
                    <User className="w-4 h-4 text-purple-400" /> Employee Details
                  </h3>
                  <div className="space-y-2 text-xs text-purple-200">
                    <div className="flex justify-between"><span className="text-purple-300/70">Role:</span> <span className="font-bold text-white">{employee.role || (employee.isTeamLeader ? 'Team Leader' : 'Employee')}</span></div>
                    <div className="flex justify-between"><span className="text-purple-300/70">Team / Office:</span> <span className="font-bold text-white">{employee.office || 'Raniganj'}</span></div>
                    <div className="flex justify-between"><span className="text-purple-300/70">Joining Date:</span> <span className="font-bold text-white">{employee.joiningDate || employee.registrationDate ? new Date(employee.joiningDate || employee.registrationDate).toLocaleDateString() : 'N/A'}</span></div>
                    <div className="flex justify-between"><span className="text-purple-300/70">Device ID:</span> <span className="font-mono text-[10px] text-amber-300 truncate max-w-[150px]">{employee.deviceId || 'N/A'}</span></div>
                  </div>
                </Card>

                {/* Today Attendance Card */}
                <Card className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
                  <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2 border-b border-purple-500/10 pb-2">
                    <Clock className="w-4 h-4 text-emerald-400" /> Today Attendance
                  </h3>
                  {todayAttendance ? (
                    <div className="space-y-2 text-xs text-purple-200">
                      <div className="flex justify-between"><span className="text-purple-300/70">Status:</span> <span className="font-bold text-emerald-400">{todayAttendance.status || 'Present'}</span></div>
                      <div className="flex justify-between"><span className="text-purple-300/70">Check-in:</span> <span className="font-bold text-white">{todayAttendance.checkInTime || todayAttendance.checkIn || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-purple-300/70">Check-out:</span> <span className="font-bold text-white">{todayAttendance.checkOutTime || todayAttendance.checkOut || 'Active'}</span></div>
                      <div className="flex justify-between">
                        <span className="text-purple-300/70">Working Hours:</span> 
                        <span className="font-bold text-amber-300">
                          {(() => {
                            const cIn = todayAttendance.checkInTime || todayAttendance.checkIn;
                            const cOut = todayAttendance.checkOutTime || todayAttendance.checkOut;
                            if (cIn && cOut && cOut !== 'Active' && cOut !== '--:--' && cOut !== 'Pending' && cOut !== 'N/A' && cOut !== 'UNRESOLVED') {
                              const calc = calculateWorkingHours(cIn, cOut);
                              return calc || '—';
                            }
                            return cIn ? 'In Progress' : 'N/A';
                          })()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-xs text-purple-300/60 italic">No attendance recorded for today yet.</div>
                  )}
                </Card>

                {/* Device & Sync Status */}
                <Card className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3 shadow-lg">
                  <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2 border-b border-purple-500/10 pb-2">
                    <Smartphone className="w-4 h-4 text-amber-400" /> Device & Sync
                  </h3>
                  <div className="space-y-2 text-xs text-purple-200">
                    <div className="flex justify-between"><span className="text-purple-300/70">Device Model:</span> <span className="font-bold text-white truncate max-w-[160px]">{employee.deviceModel || 'Unknown Device'}</span></div>
                    <div className="flex justify-between"><span className="text-purple-300/70">Android / App:</span> <span className="font-bold text-white">v{employee.appVersion || '1.0'} (Android {employee.androidVersion || 'N/A'})</span></div>
                    <div className="flex justify-between"><span className="text-purple-300/70">Last Sync:</span> <span className="font-bold text-emerald-300">{lastSyncFormatted}</span></div>
                  </div>
                </Card>

              </div>

              {/* Summaries Grid: Attendance, Tasks, Leave */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Attendance Summary (This Month) */}
                <div className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-purple-200 uppercase flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-purple-400" /> This Month Attendance
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Present:</span> <span className="font-bold text-emerald-400">{presentCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">WFH:</span> <span className="font-bold text-blue-400">{wfhCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Client Visit:</span> <span className="font-bold text-amber-400">{clientVisitCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Leave:</span> <span className="font-bold text-purple-300">{leaveCount}</span></div>
                  </div>
                </div>

                {/* Task Summary */}
                <div className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-purple-200 uppercase flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-purple-400" /> Task Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Assigned:</span> <span className="font-bold text-white">{assignedTasksCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Completed:</span> <span className="font-bold text-emerald-400">{completedTasksCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Pending:</span> <span className="font-bold text-amber-400">{pendingTasksCount}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl flex justify-between"><span className="text-purple-300">Overdue:</span> <span className="font-bold text-rose-400">{overdueTasksCount}</span></div>
                  </div>
                </div>

                {/* Leave Summary (Apr-Mar) */}
                <div className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-purple-200 uppercase flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-400" /> Leave Balance (Apr–Mar)
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-[#1A0B36] rounded-xl text-center"><span className="text-[10px] text-purple-300/70 block">Available</span> <span className="font-bold text-emerald-400 text-sm">{leaveBal.available}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl text-center"><span className="text-[10px] text-purple-300/70 block">Used</span> <span className="font-bold text-amber-400 text-sm">{leaveBal.used}</span></div>
                    <div className="p-2 bg-[#1A0B36] rounded-xl text-center"><span className="text-[10px] text-purple-300/70 block">Pending</span> <span className="font-bold text-blue-400 text-sm">{leaveBal.pending}</span></div>
                  </div>
                </div>

              </div>

              {/* Quick Attendance Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-purple-200 uppercase">Latest Attendance Records</h4>
                <div className="glass-card border border-purple-500/20 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#1A0B36] text-purple-300 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Check-in</th>
                        <th className="p-3">Check-out</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Working Hours</th>
                        <th className="p-3">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-500/10">
                      {attendanceRecords.slice(0, 5).length > 0 ? (
                        attendanceRecords.slice(0, 5).map((att: any) => (
                          <tr key={att.id} className="hover:bg-purple-900/10">
                            <td className="p-3 font-medium text-white">{att.date || att.timestamp?.split('T')[0] || 'N/A'}</td>
                            <td className="p-3 text-emerald-300">{att.checkInTime || att.checkIn || 'N/A'}</td>
                            <td className="p-3 text-amber-300">{att.checkOutTime || att.checkOut || 'Active'}</td>
                            <td className="p-3"><span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 text-[10px]">{att.type || 'Office'}</span></td>
                            <td className="p-3 font-mono text-white">
                              {(() => {
                                const cIn = att.checkInTime || att.checkIn;
                                const cOut = att.checkOutTime || att.checkOut;
                                if (cIn && cOut && cOut !== 'Active' && cOut !== '--:--' && cOut !== 'Pending' && cOut !== 'N/A' && cOut !== 'UNRESOLVED') {
                                  const calc = calculateWorkingHours(cIn, cOut);
                                  return calc || '—';
                                }
                                return '—';
                              })()}
                            </td>
                            <td className="p-3 text-purple-300/70">{att.source || 'Automatic'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-purple-300/60 italic">No attendance records found for this employee.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ATTENDANCE TAB */}
          {activeTab === 'attendance' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-purple-200 uppercase">All Attendance Logs ({attendanceRecords.length})</h3>
              <div className="glass-card border border-purple-500/20 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1A0B36] text-purple-300 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Check-in</th>
                      <th className="p-3">Check-out</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/10">
                    {attendanceRecords.length > 0 ? (
                      attendanceRecords.map((att: any) => (
                        <tr key={att.id} className="hover:bg-purple-900/10">
                          <td className="p-3 font-medium text-white">{att.date || att.timestamp?.split('T')[0]}</td>
                          <td className="p-3 text-emerald-400 font-bold">{att.status || 'Present'}</td>
                          <td className="p-3 text-emerald-300">{att.checkInTime || att.checkIn || 'N/A'}</td>
                          <td className="p-3 text-amber-300">{att.checkOutTime || att.checkOut || 'N/A'}</td>
                          <td className="p-3">{att.type || 'Office'}</td>
                          <td className="p-3 font-mono text-white">
                            {(() => {
                              const cIn = att.checkInTime || att.checkIn;
                              const cOut = att.checkOutTime || att.checkOut;
                              if (cIn && cOut && cOut !== 'Active' && cOut !== '--:--' && cOut !== 'Pending' && cOut !== 'N/A' && cOut !== 'UNRESOLVED') {
                                const calc = calculateWorkingHours(cIn, cOut);
                                return calc || '—';
                              }
                              return '—';
                            })()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-purple-300/60 italic">No attendance history available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-purple-200 uppercase">Assigned Tasks ({tasks.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tasks.length > 0 ? (
                  tasks.map((task: any) => (
                    <div key={task.id} className="p-4 glass-card border border-purple-500/20 rounded-2xl space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm text-white">{task.title || task.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          task.status === 'Completed' || task.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {task.status || (task.completed ? 'Completed' : 'Pending')}
                        </span>
                      </div>
                      <p className="text-xs text-purple-200">{task.description || 'No description provided.'}</p>
                      <div className="flex justify-between text-[11px] text-purple-300/70 pt-2 border-t border-purple-500/10">
                        <span>Due: {task.dueDate || 'No due date'}</span>
                        <span className="font-mono">{task.priority || 'Normal'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-8 text-center text-purple-300/60 italic glass-card rounded-2xl border border-purple-500/20">
                    No tasks assigned to this employee.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* LEAVE TAB */}
          {activeTab === 'leave' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-purple-200 uppercase">Leave History ({leaves.length})</h3>
              <div className="glass-card border border-purple-500/20 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1A0B36] text-purple-300 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Leave Type</th>
                      <th className="p-3">From</th>
                      <th className="p-3">To</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/10">
                    {leaves.length > 0 ? (
                      leaves.map((l: any) => (
                        <tr key={l.id} className="hover:bg-purple-900/10">
                          <td className="p-3 font-bold text-white">{l.leaveType || l.type || 'Casual Leave'}</td>
                          <td className="p-3 text-purple-200">{l.fromDate || l.startDate}</td>
                          <td className="p-3 text-purple-200">{l.toDate || l.endDate}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              l.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300' :
                              l.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {l.status || 'PENDING'}
                            </span>
                          </td>
                          <td className="p-3 text-purple-300/80">{l.reason || 'N/A'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-purple-300/60 italic">No leave requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EXPENSES TAB */}
          {activeTab === 'expenses' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-purple-200 uppercase">Expense Claims ({expenses.length})</h3>
              <div className="glass-card border border-purple-500/20 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1A0B36] text-purple-300 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Category</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/10">
                    {expenses.length > 0 ? (
                      expenses.map((exp: any) => {
                        const isPending = isExpensePending(exp.status);
                        const isApproved = isExpenseApproved(exp.status);
                        const isApproving = approvingExpenseId === exp.id;

                        return (
                          <tr key={exp.id} className="hover:bg-purple-900/10">
                            <td className="p-3 font-bold text-white">{exp.category || exp.title}</td>
                            <td className="p-3 font-mono text-emerald-400">₹{exp.amount || 0}</td>
                            <td className="p-3 text-purple-200">{exp.date || exp.createdAt?.split('T')[0]}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isApproved ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {isApproved ? 'Approved' : exp.status || 'Pending'}
                              </span>
                            </td>
                            <td className="p-3 text-purple-300/80">{exp.description || 'N/A'}</td>
                            <td className="p-3 text-right whitespace-nowrap">
                              {isPending ? (
                                <button
                                  type="button"
                                  disabled={isApproving}
                                  onClick={async () => {
                                    setApprovingExpenseId(exp.id);
                                    try {
                                      await approveExpenseClaim(exp.id, {
                                        id: adminUser?.uid,
                                        name: adminUser?.displayName || adminUser?.email || 'Admin',
                                        role: adminUser?.role || 'ADMIN',
                                      });
                                      setActionMessage({ type: 'success', text: `Approved expense claim ₹${exp.amount}` });
                                      setTimeout(() => setActionMessage(null), 4000);
                                    } catch (err: any) {
                                      setActionMessage({ type: 'error', text: err.message || 'Failed to approve expense' });
                                    } finally {
                                      setApprovingExpenseId(null);
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg border border-emerald-400/40 transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>{isApproving ? 'Saving...' : 'Approve'}</span>
                                </button>
                              ) : isApproved ? (
                                <span className="text-[10px] text-emerald-400 font-semibold inline-flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Approved
                                </span>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-semibold">
                                  {exp.status}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-purple-300/60 italic">No expense records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DEVICE TAB */}
          {activeTab === 'device' && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-purple-200 uppercase">Device Registration & Management</h3>
              
              <div className="p-5 glass-card border border-purple-500/20 rounded-2xl space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between">
                    <span className="text-purple-300">Device Status:</span> 
                    <span className="font-bold text-emerald-400">{deviceStatus}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between">
                    <span className="text-purple-300">Device Model:</span> 
                    <span className="font-bold text-white">{employee.deviceModel || 'Unknown'}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between">
                    <span className="text-purple-300">Android Version:</span> 
                    <span className="font-bold text-white">{employee.androidVersion || 'N/A'}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between">
                    <span className="text-purple-300">App Version:</span> 
                    <span className="font-bold text-white">{employee.appVersion || '1.0.0'}</span>
                  </div>
                  <div className="p-3 bg-[#1A0B36] rounded-xl flex justify-between sm:col-span-2">
                    <span className="text-purple-300">Last Successful Sync:</span> 
                    <span className="font-bold text-amber-300">{lastSyncFormatted}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-purple-500/10 flex flex-wrap gap-3">
                  <Button
                    disabled={isUpdatingStatus}
                    onClick={() => handleDeviceAction('Approved')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve Device
                  </Button>
                  <Button
                    disabled={isUpdatingStatus}
                    onClick={() => handleDeviceAction('Rejected')}
                    className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4" /> Reject Device
                  </Button>
                  <Button
                    disabled={isUpdatingStatus}
                    onClick={() => handleDeviceAction('Blocked')}
                    className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Lock className="w-4 h-4" /> Block Device
                  </Button>
                  <Button
                    disabled={isUpdatingStatus}
                    onClick={() => handleDeviceAction('Active')}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Unlock className="w-4 h-4" /> Unblock Device
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVITY TAB (AUDIT LOGS) */}
          {activeTab === 'activity' && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-purple-200 uppercase">Employee Audit Trail ({auditLogs.length})</h3>
              <div className="space-y-2">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log: any) => (
                    <div key={log.id} className="p-3 glass-card border border-purple-500/20 rounded-xl text-xs flex justify-between items-center">
                      <div>
                        <span className="font-bold text-white">{log.performedByName || log.actorName || 'Admin'}</span>{' '}
                        <span className="text-purple-300/70">performed</span>{' '}
                        <span className="font-bold text-amber-300">{log.action}</span>
                        <p className="text-[11px] text-purple-200 mt-0.5">{log.description || log.details}</p>
                      </div>
                      <span className="text-[10px] font-mono text-purple-300/50">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-purple-300/60 italic glass-card rounded-2xl border border-purple-500/20">
                    No audit log entries for this employee yet.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
