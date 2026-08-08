import React, { useEffect, useState } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { LeaveRecord, LeaveBalance, LeaveConfig, EmployeeAllowance } from '../../types/leave';
import {
  calculateLeaveDays,
  checkLeaveOverlap,
  calculateLeaveBalance,
  createLeaveRequest,
  cancelLeaveRequest,
} from '../../services/leave/leaveService';
import {
  getStoredLeaves,
  getStoredLeaveConfig,
  getStoredEmployeeAllowances,
} from '../../services/leave/leaveStorage';
import {
  syncPendingLeaves,
  startLeaveAutoSyncEngine,
} from '../../services/leave/leaveSyncEngine';

import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';

import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Send,
  X,
  Info,
  CalendarDays,
  FileText,
  User,
  Check,
  AlertTriangle,
} from 'lucide-react';

export const LeaveScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const empCode = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const empId = employeeData?.id || empCode;
  const empName = employeeData?.name || 'Employee';
  const empDept = employeeData?.office || 'Raniganj';

  // Network & Sync States
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Leave Data
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [config, setConfig] = useState<LeaveConfig>({ id: 'config', defaultAnnualAllowance: 24, departmentAllowances: {} });
  const [allowances, setAllowances] = useState<EmployeeAllowance[]>([]);
  const [balance, setBalance] = useState<LeaveBalance>({
    employeeId: empId,
    employeeCode: empCode,
    employeeName: empName,
    department: empDept,
    annualAllowance: 24,
    used: 0,
    pending: 0,
    available: 24,
  });

  // Filter Status
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');

  // New Request Form States
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [formSuccess, setFormSuccess] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Interactive Calendar Selection
  const [currentCalendarDate, setCurrentCalendarDate] = useState<Date>(new Date());
  const [selectedRangeStart, setSelectedRangeStart] = useState<string | null>(null);
  const [selectedRangeEnd, setSelectedRangeEnd] = useState<string | null>(null);

  // Selected Leave detail modal
  const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Connectivity and Sync listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Start auto sync engine with scoped options
    const cleanupSync = startLeaveAutoSyncEngine({
      employeeCode: empCode,
      department: empDept,
      isTeamLeader: employeeData?.isTeamLeader,
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cleanupSync();
    };
  }, []);

  // Sync / Load data
  const loadData = () => {
    const localLeaves = getStoredLeaves();
    const localConfig = getStoredLeaveConfig();
    const localAllowances = getStoredEmployeeAllowances();

    // Only filter for this employee
    const filteredLeaves = localLeaves.filter((l) => l.employeeId === empId);

    setLeaves(filteredLeaves);
    setConfig(localConfig);
    setAllowances(localAllowances);

    const calculatedBalance = calculateLeaveBalance(empId, empDept, localLeaves, localConfig, localAllowances);
    setBalance(calculatedBalance);
  };

  useEffect(() => {
    loadData();

    // Setup an interval to check local storage updates (e.g. from sync snapshots)
    const intervalId = setInterval(() => {
      loadData();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [empId, empDept]);

  const handleManualSync = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await syncPendingLeaves();
      loadData();
    } catch (err) {
      console.error('Manual sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calendar Helper Logic
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay(); // 0 = Sunday, 1 = Monday, etc.
  };

  const handleCalendarDayClick = (dayStr: string) => {
    setFormError('');
    setFormSuccess('');

    if (!selectedRangeStart || (selectedRangeStart && selectedRangeEnd)) {
      setSelectedRangeStart(dayStr);
      setSelectedRangeEnd(null);
      setStartDate(dayStr);
      setEndDate('');
    } else {
      const startMs = new Date(selectedRangeStart).getTime();
      const clickMs = new Date(dayStr).getTime();

      if (clickMs < startMs) {
        // Reset start date to clicked day
        setSelectedRangeStart(dayStr);
        setStartDate(dayStr);
      } else {
        setSelectedRangeEnd(dayStr);
        setEndDate(dayStr);
      }
    }
  };

  const clearCalendarSelection = () => {
    setSelectedRangeStart(null);
    setSelectedRangeEnd(null);
    setStartDate('');
    setEndDate('');
    setFormError('');
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + offset, 1);
    setCurrentCalendarDate(newDate);
  };

  // Form Submission
  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!startDate) {
      setFormError('Please select a start date.');
      return;
    }
    if (!endDate) {
      setFormError('Please select an end date.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Please provide a reason for the leave.');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      setFormError('End date cannot be before start date.');
      return;
    }

    const requestedDays = calculateLeaveDays(startDate, endDate);
    if (balance.available < requestedDays) {
      setFormError(`Insufficient leave balance. Requested: ${requestedDays} Days, Available: ${balance.available} Days.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const req = await createLeaveRequest(
        {
          id: empId,
          employeeCode: empCode,
          name: empName,
          office: empDept,
          isTeamLeader: employeeData?.isTeamLeader,
          teamLeaderId: employeeData?.teamLeaderId,
          teamLeaderCode: employeeData?.teamLeaderCode,
          teamLeaderName: employeeData?.teamLeaderName,
        },
        startDate,
        endDate,
        reason
      );

      setFormSuccess(`Leave request submitted successfully for ${requestedDays} Day(s)!`);
      setReason('');
      setSelectedRangeStart(null);
      setSelectedRangeEnd(null);
      setStartDate('');
      setEndDate('');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'An error occurred while submitting.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Request
  const handleCancelRequest = async (leaveId: string) => {
    setIsCancelling(true);
    try {
      await cancelLeaveRequest(leaveId);
      loadData();
      setSelectedLeave(null);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel leave request.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Calendar render details
  const calendarYear = currentCalendarDate.getFullYear();
  const calendarMonth = currentCalendarDate.getMonth();
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const firstDayIndex = getFirstDayOfMonth(calendarYear, calendarMonth);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Construct calendar cells
  const calendarCells = [];
  // Empty slots for padding
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push(null);
  }
  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push(dateStr);
  }

  // Filter history leaves
  const filteredLeaves = leaves.filter((l) => {
    if (statusFilter === 'ALL') return true;
    return l.status === statusFilter;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      case 'PENDING':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/30';
      case 'REJECTED':
        return 'bg-rose-500/20 text-rose-300 border border-rose-500/30';
      case 'CANCELLED':
        return 'bg-purple-900/40 text-purple-300/70 border border-purple-800';
      default:
        return 'bg-purple-500/10 text-purple-300 border border-purple-500/20';
    }
  };

  const getSyncBadgeClass = (syncStatus: string) => {
    if (syncStatus === 'Synced') return 'text-emerald-400 bg-emerald-500/10';
    return 'text-amber-400 bg-amber-500/10';
  };

  const requestedLeaveDaysCount = startDate && endDate ? calculateLeaveDays(startDate, endDate) : 0;

  return (
    <div className="space-y-6">
      {/* Network & Sync Banner */}
      <div className="flex items-center justify-between p-3.5 bg-[#25144A] rounded-2xl border border-purple-500/20">
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <Wifi className="w-3.5 h-3.5" /> Online Mode
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <WifiOff className="w-3.5 h-3.5" /> Offline Mode (Saved locally)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {leaves.some((l) => l.syncStatus === 'Pending Sync') && (
            <span className="text-[10px] text-amber-300 font-extrabold uppercase animate-pulse">
              Pending Sync
            </span>
          )}
          <button
            onClick={handleManualSync}
            disabled={!isOnline || isSyncing}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition shadow-lg shadow-purple-900/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            Sync Now
          </button>
        </div>
      </div>

      {/* Main Leave Balance Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-[#1E0B45] border border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-purple-300/80 uppercase tracking-wider">Annual Allowance</span>
            <CalendarIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">{balance.annualAllowance} Days</p>
            <p className="text-[10px] text-purple-300/50 mt-1">Configured by Admin</p>
          </div>
        </Card>

        <Card className="p-4 bg-[#1E0B45] border border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-emerald-300/80 uppercase tracking-wider">Approved / Used</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-400">{balance.used} Days</p>
            <p className="text-[10px] text-purple-300/50 mt-1">Deducted from balance</p>
          </div>
        </Card>

        <Card className="p-4 bg-[#1E0B45] border border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-amber-300/80 uppercase tracking-wider">Pending Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-amber-400">{balance.pending} Days</p>
            <p className="text-[10px] text-purple-300/50 mt-1">Temporarily reserved</p>
          </div>
        </Card>

        <Card className="p-4 bg-[#230C52] border-2 border-purple-500/40 relative overflow-hidden flex flex-col justify-between shadow-lg shadow-purple-950/50">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[11px] font-bold text-purple-200 uppercase tracking-wider">Available Balance</span>
            <div className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
          </div>
          <div>
            <p className="text-2xl font-black text-white">{balance.available} Days</p>
            <p className="text-[10px] text-purple-300/60 mt-1 font-semibold">Ready to request</p>
          </div>
        </Card>
      </div>

      {/* Grid: Apply Leave Form + Leave History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Apply Leave Card */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-5 bg-[#1C0940] border border-purple-500/20 shadow-xl">
            <h2 className="text-sm font-black text-white mb-4 flex items-center gap-2 border-b border-purple-500/15 pb-2.5">
              <CalendarDays className="w-4.5 h-4.5 text-[#7C3AED]" />
              Apply Leave Request
            </h2>

            <form onSubmit={handleSubmitLeave} className="space-y-4">
              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-300 font-medium">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-rose-400" />
                  <div>{formError}</div>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-400" />
                  <div>{formSuccess}</div>
                </div>
              )}

              {/* Range Selector Visual Calendar */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-bold text-purple-200">
                    Select Date Range on Calendar
                  </label>
                  {(startDate || endDate) && (
                    <button
                      type="button"
                      onClick={clearCalendarSelection}
                      className="text-[10px] font-bold text-rose-300 hover:text-rose-400 transition"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {/* Inline custom visual calendar */}
                <div className="bg-[#230F4F] border border-purple-500/20 rounded-2xl p-3.5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-white">
                      {monthNames[calendarMonth]} {calendarYear}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="p-1 hover:bg-[#341C6C] rounded-lg transition text-purple-300"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="p-1 hover:bg-[#341C6C] rounded-lg transition text-purple-300"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {weekdayNames.map((n) => (
                      <span key={n} className="text-[10px] font-bold text-purple-300/50 py-1 uppercase">
                        {n}
                      </span>
                    ))}

                    {calendarCells.map((dayStr, idx) => {
                      if (!dayStr) return <div key={`empty-${idx}`} />;

                      const dObj = new Date(dayStr);
                      const dNum = dObj.getDate();
                      
                      const isSelectedStart = startDate === dayStr;
                      const isSelectedEnd = endDate === dayStr;
                      
                      let isInRange = false;
                      if (startDate && endDate) {
                        const startVal = new Date(startDate).getTime();
                        const endVal = new Date(endDate).getTime();
                        const curVal = dObj.getTime();
                        isInRange = curVal > startVal && curVal < endVal;
                      }

                      const todayStr = new Date().toISOString().split('T')[0];
                      const isPast = dayStr < todayStr;

                      let cellClass = 'hover:bg-[#3E2180] text-purple-100';
                      if (isSelectedStart || isSelectedEnd) {
                        cellClass = 'bg-[#7C3AED] text-white font-black shadow-md shadow-purple-900/40';
                      } else if (isInRange) {
                        cellClass = 'bg-[#7C3AED]/30 text-purple-200 font-semibold';
                      } else if (isPast) {
                        cellClass = 'text-purple-300/40 hover:bg-[#2C165F]';
                      }

                      return (
                        <button
                          key={dayStr}
                          type="button"
                          onClick={() => handleCalendarDayClick(dayStr)}
                          className={`text-xs py-1.5 rounded-lg transition ${cellClass} font-medium`}
                        >
                          {dNum}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Selected Dates summary */}
              {startDate && (
                <div className="p-3 bg-[#1A0A38] border border-purple-500/10 rounded-2xl grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-purple-300/60 font-semibold">Start Date</p>
                    <p className="text-white font-black">{startDate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-purple-300/60 font-semibold">End Date</p>
                    <p className="text-white font-black">{endDate || 'Select end date...'}</p>
                  </div>
                  {requestedLeaveDaysCount > 0 && (
                    <div className="col-span-2 pt-1 border-t border-purple-500/10 mt-1 flex justify-between items-center text-xs">
                      <span className="text-purple-300/80 font-bold">Total Duration:</span>
                      <span className="text-[#A78BFA] font-black text-sm">{requestedLeaveDaysCount} Days</span>
                    </div>
                  )}
                </div>
              )}

              {/* Leave Reason */}
              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1.5">
                  Reason for Leave Request
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="E.g., Medical, Family Emergency, urgent personal work..."
                  rows={3}
                  className="w-full bg-[#230F4F] border border-purple-500/20 focus:border-purple-500/60 rounded-xl p-3 text-xs text-white focus:outline-none placeholder-purple-300/30"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting || !startDate || !endDate}
                className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold p-3 rounded-xl transition flex justify-center items-center gap-2 shadow-lg shadow-purple-900/40"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Submitting Leave...' : 'Submit Leave Request'}
              </Button>
            </form>
          </Card>

          {/* Quick info panel */}
          <Card className="p-4 bg-[#1E0B45]/50 border border-purple-500/10 text-xs text-purple-200/70 space-y-2">
            <h3 className="font-bold text-purple-300 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#7C3AED]" /> Leave Policy Guidelines
            </h3>
            <ul className="list-disc list-inside space-y-1 text-[11px] pl-1 leading-normal">
              <li>Weekends are counted in the total duration selection.</li>
              <li>Pending requests reserve your leave balance immediately.</li>
              <li>Leaves can only be directly cancelled while still <strong>PENDING</strong>.</li>
              <li>Requests are routed to Team Leader first, followed by Admin final approval.</li>
            </ul>
          </Card>
        </div>

        {/* Right: History & List */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 bg-[#1C0940] border border-purple-500/20 shadow-xl min-h-[400px] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-purple-500/15 pb-4 mb-4">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-[#7C3AED]" />
                My Leave History
              </h2>
              <div className="flex gap-1 bg-[#25134F] p-1 rounded-xl border border-purple-500/10 text-xs self-start">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                      statusFilter === status
                        ? 'bg-[#7C3AED] text-white shadow-md'
                        : 'text-purple-300/70 hover:text-white'
                    }`}
                  >
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 space-y-3">
              {filteredLeaves.length > 0 ? (
                filteredLeaves.map((leave) => (
                  <div
                    key={leave.id}
                    onClick={() => setSelectedLeave(leave)}
                    className="p-3.5 bg-[#22104E] hover:bg-[#2C175F] rounded-2xl border border-purple-500/15 transition cursor-pointer flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">
                          {leave.startDate} to {leave.endDate}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(leave.status)}`}>
                          {leave.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-purple-200/70 leading-tight line-clamp-1">
                        Reason: "{leave.reason}"
                      </div>
                      <div className="flex gap-3 text-[10px] text-purple-300/40">
                        <span>Submitted: {new Date(leave.submittedAtDeviceTime).toLocaleDateString()}</span>
                        {leave.teamLeaderName && (
                          <span>TL: {leave.teamLeaderName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end gap-2 w-full sm:w-auto justify-between border-t border-purple-500/5 sm:border-0 pt-2 sm:pt-0">
                      <span className="text-sm font-black text-purple-200">
                        {leave.totalDays} Day{leave.totalDays > 1 ? 's' : ''}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${getSyncBadgeClass(leave.syncStatus)}`}>
                        {leave.syncStatus}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center py-12">
                  <EmptyState
                    title="No Leave Records"
                    description="No leave requests found matching the current status filter."
                    icon={CalendarIcon}
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Selected Leave Detail Dialog */}
      {selectedLeave && (
        <Dialog
          isOpen={true}
          onClose={() => setSelectedLeave(null)}
          title="Leave Request Details"
        >
          <div className="space-y-4 text-xs text-purple-200">
            <div className="grid grid-cols-2 gap-3.5 bg-[#22104E] p-4 rounded-2xl border border-purple-500/10">
              <div>
                <p className="text-[10px] text-purple-300/50 font-bold uppercase">Date Range</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {selectedLeave.startDate} — {selectedLeave.endDate}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/50 font-bold uppercase">Total Duration</p>
                <p className="text-xs font-black text-white mt-0.5">{selectedLeave.totalDays} Day(s)</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-purple-500/5">
                <p className="text-[10px] text-purple-300/50 font-bold uppercase">Reason</p>
                <p className="text-xs text-white mt-0.5">"{selectedLeave.reason}"</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-bold text-purple-300">Approval Path Status</h3>
              <div className="space-y-2 bg-[#22104E] p-3.5 rounded-2xl border border-purple-500/10">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-purple-300/70">Current Level Status</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(selectedLeave.status)}`}>
                    {selectedLeave.status}
                  </span>
                </div>
                
                {selectedLeave.teamLeaderId && (
                  <div className="pt-2 border-t border-purple-500/5 space-y-1">
                    <p className="font-bold text-purple-300/80">Team Leader Review</p>
                    <div className="flex justify-between text-[11px]">
                      <span>TL: {selectedLeave.teamLeaderName}</span>
                      <span className="font-semibold text-[#A78BFA]">{selectedLeave.approvalStatus === 'PENDING' ? 'Pending Review' : 'Reviewed'}</span>
                    </div>
                    {selectedLeave.teamLeaderRemark && (
                      <p className="bg-[#1A0A3A] p-2 rounded-xl border border-purple-500/10 italic text-purple-200/90 text-[11px]">
                        TL Remark: "{selectedLeave.teamLeaderRemark}"
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-purple-500/5 space-y-1">
                  <p className="font-bold text-purple-300/80">Admin Final Review</p>
                  <div className="flex justify-between text-[11px]">
                    <span>Admin Status</span>
                    <span className="font-semibold text-[#A78BFA]">
                      {selectedLeave.status === 'PENDING' && selectedLeave.approvalStatus !== 'TEAM_LEADER_APPROVED'
                        ? 'Awaiting Team Leader'
                        : selectedLeave.status === 'PENDING'
                        ? 'Awaiting Admin Review'
                        : selectedLeave.status}
                    </span>
                  </div>
                  {selectedLeave.adminRemark && (
                    <p className="bg-[#1A0A3A] p-2 rounded-xl border border-purple-500/10 italic text-purple-200/90 text-[11px]">
                      Admin Remark: "{selectedLeave.adminRemark}"
                    </p>
                  )}
                </div>

                {/* Override indicators */}
                {selectedLeave.overrideBy && (
                  <div className="pt-2 border-t border-purple-500/5 space-y-1 bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
                    <p className="font-bold text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> Admin Manual Override
                    </p>
                    <p className="text-[11px]">Overridden by: {selectedLeave.overrideByName}</p>
                    <p className="italic text-[11px]">"Reason: {selectedLeave.overrideReason}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Sync Metadata */}
            <div className="flex justify-between items-center text-[10px] text-purple-300/40 px-1 pt-1">
              <span>Device Created: {new Date(selectedLeave.createdAtDeviceTime).toLocaleString()}</span>
              <span>Sync: {selectedLeave.syncStatus}</span>
            </div>

            {/* Cancel Button */}
            {selectedLeave.status === 'PENDING' && (
              <Button
                onClick={() => handleCancelRequest(selectedLeave.id)}
                disabled={isCancelling}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold p-3 rounded-xl transition flex justify-center items-center gap-1.5 mt-2 shadow-lg shadow-rose-950/40"
              >
                <X className="w-3.5 h-3.5" />
                {isCancelling ? 'Cancelling Leave...' : 'Cancel Leave Request'}
              </Button>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
};
