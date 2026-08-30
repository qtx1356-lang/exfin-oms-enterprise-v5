import React, { useEffect, useState } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { LeaveRecord, LeaveBalance, LeaveConfig, EmployeeAllowance } from '../../types/leave';
import {
  calculateLeaveDays,
  checkLeaveOverlap,
  calculateLeaveBalance,
  createLeaveRequest,
  cancelLeaveRequest,
} from '../../services/leave/leaveService';
import {
  getStoredLeaveConfig,
  getStoredEmployeeAllowances,
} from '../../services/leave/leaveStorage';

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
  const { leaves: realtimeLeaves, isOnline, syncState, updateLeaveOptimistically, triggerManualSync } = useRealtimeSync();

  const empCode = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const empId = employeeData?.id || empCode;
  const empName = employeeData?.name || 'Employee';
  const empDept = employeeData?.office || 'Raniganj';

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Leave Data
  const config = getStoredLeaveConfig();
  const allowances = getStoredEmployeeAllowances();

  const leaves = realtimeLeaves.filter((l) => l.employeeId === empId || l.employeeCode === empCode);
  const balance = calculateLeaveBalance(empId, empDept, leaves, config, allowances);

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

  const handleManualSync = async () => {
    setIsSyncing(true);
    await triggerManualSync();
    setIsSyncing(false);
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

      await updateLeaveOptimistically(req);

      setFormSuccess(`Leave request submitted successfully for ${requestedDays} Day(s)!`);
      setReason('');
      setSelectedRangeStart(null);
      setSelectedRangeEnd(null);
      setStartDate('');
      setEndDate('');
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
        return 'bg-[#1D2329] text-zinc-400 border border-[#3A4148]';
      default:
        return 'bg-[#1D2329] text-[#B7C0BC] border border-[#3A4148]';
    }
  };

  const getSyncBadgeClass = (syncStatus: string) => {
    if (syncStatus === 'Synced') return 'text-emerald-400 bg-emerald-500/10';
    return 'text-amber-400 bg-amber-500/10';
  };

  const requestedLeaveDaysCount = startDate && endDate ? calculateLeaveDays(startDate, endDate) : 0;

  return (
    <div className="space-y-6">
      {/* Network & Sync Banner Removed */}

      {/* Main Leave Balance Dashboard (Redesigned) */}
      {(() => {
        // Calculate leave year: Apr 1 to Mar 31
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed, Apr = 3
        
        let startYear = currentYear;
        let endYear = currentYear + 1;
        if (currentMonth < 3) {
          startYear = currentYear - 1;
          endYear = currentYear;
        }
        
        const leaveYearStart = new Date(startYear, 3, 1);
        const leaveYearEnd = new Date(endYear, 2, 31, 23, 59, 59);

        // Filter leaves for current leave year
        const leaveYearRecords = leaves.filter(l => {
          const lDate = new Date(l.startDate);
          return lDate >= leaveYearStart && lDate <= leaveYearEnd;
        });

        // Calculate Used, Pending
        let used = 0;
        let pending = 0;
        leaveYearRecords.forEach(l => {
          if (l.status === 'APPROVED') used += l.totalDays;
          else if (l.status === 'PENDING') pending += l.totalDays;
        });

        const annualEntitlement = 22;
        const remaining = Math.max(0, annualEntitlement - used - pending);
        const usedPercent = Math.min(100, (used / annualEntitlement) * 100);
        const pendingPercent = Math.min(100, (pending / annualEntitlement) * 100);

        // Find upcoming leave
        const upcomingLeaves = leaves.filter(l => {
          const lStart = new Date(l.startDate);
          return lStart >= now && (l.status === 'APPROVED' || l.status === 'PENDING');
        }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        const nearestUpcoming = upcomingLeaves.length > 0 ? upcomingLeaves[0] : null;

        // Calendar variables
        const cYear = currentCalendarDate.getFullYear();
        const cMonth = currentCalendarDate.getMonth();
        const dInMonth = getDaysInMonth(cYear, cMonth);
        const firstDayIdx = getFirstDayOfMonth(cYear, cMonth);
        
        const calCells = [];
        for (let i = 0; i < firstDayIdx; i++) calCells.push(null);
        for (let d = 1; d <= dInMonth; d++) {
          const mStr = String(cMonth + 1).padStart(2, '0');
          const dStr = String(d).padStart(2, '0');
          calCells.push(`${cYear}-${mStr}-${dStr}`);
        }

        const handleCalNav = (offset: number) => {
          const nextDate = new Date(cYear, cMonth + offset, 1);
          // Restrict to leave year Apr - Mar? Or just let them navigate freely.
          // The prompt says "The employee can navigate: April -> March". We can just enforce bounds if needed, but simple changeMonth is fine.
          if (nextDate >= leaveYearStart && nextDate <= leaveYearEnd) {
             changeMonth(offset);
          } else if (offset === 0) {
             // reset to today if they are clicking a button
          } else {
             // Maybe allow navigation but just standard changeMonth
             changeMonth(offset);
          }
        };

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Balance & Upcoming */}
            <div className="lg:col-span-5 space-y-6">
              
              <Card className="p-6 bg-[#151515] border border-[#292929] rounded-[22px] shadow-lg text-[#FFFFFF]">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-sm font-black text-[#FFFFFF] flex items-center gap-2">
                      <CalendarDays className="w-4.5 h-4.5 text-[#D4AF37]" />
                      LEAVE BALANCE
                    </h2>
                    <p className="text-[11px] text-[#8A8A8A] mt-1">Leave Year: 1 Apr {startYear} — 31 Mar {endYear}</p>
                  </div>
                </div>

                <div className="flex justify-between items-end mb-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">Annual Entitlement</p>
                    <p className="text-3xl font-black text-[#FFFFFF]">{annualEntitlement}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">Remaining</p>
                    <p className="text-3xl font-black text-[#D4AF37]">{remaining}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="h-3 w-full bg-[#101010] rounded-full overflow-hidden flex mb-4 border border-[#292929]">
                  <div style={{ width: `${usedPercent}%` }} className="bg-emerald-500 h-full transition-all" />
                  <div style={{ width: `${pendingPercent}%` }} className="bg-amber-500 h-full transition-all" />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#292929]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-[10px] font-bold text-emerald-400 uppercase">Used</p>
                      <p className="text-sm font-black text-[#FFFFFF]">{used} Days</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-[10px] font-bold text-amber-400 uppercase">Pending</p>
                      <p className="text-sm font-black text-[#FFFFFF]">{pending} Days</p>
                    </div>
                  </div>
                </div>

                {used + pending >= annualEntitlement && (
                  <div className="mt-5 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2 text-[11px] text-amber-300">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                    <p>No leave balance remaining for this leave year. Further requests may be subject to unpaid leave.</p>
                  </div>
                )}
              </Card>

              <Card className="p-5 bg-[#151515] border border-[#292929] shadow-xl rounded-[22px] text-[#FFFFFF]">
                <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest mb-4">Upcoming Leave</h3>
                {nearestUpcoming ? (
                  <div className="bg-[#101010] p-4 rounded-xl border border-[#292929] flex justify-between items-center">
                    <div>
                      <p className="text-sm font-black text-[#FFFFFF]">{nearestUpcoming.startDate} <span className="text-[10px] text-[#8A8A8A] font-medium ml-1">to</span> {nearestUpcoming.endDate}</p>
                      <p className="text-[11px] text-[#8A8A8A] mt-0.5">{nearestUpcoming.totalDays} Day{nearestUpcoming.totalDays > 1 ? 's' : ''} • {nearestUpcoming.reason}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${getStatusBadgeClass(nearestUpcoming.status)}`}>
                      {nearestUpcoming.status}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-[#8A8A8A] italic p-3 bg-[#101010] rounded-xl border border-[#292929]">No upcoming leave.</p>
                )}
              </Card>
              
              {/* Dev Diagnostic */}
              {Boolean(typeof import.meta !== 'undefined' && import.meta?.env?.DEV) && (
                <div className="p-3 bg-[#111417] border border-[#3A4148] rounded-xl text-[10px] font-mono text-[#B7C0BC]/60 space-y-0.5">
                  <p className="font-bold text-[#F5F7F6]">LEAVE CALENDAR DIAGNOSTIC</p>
                  <p>Employee: <span className="text-white">{empName} ({empId})</span></p>
                  <p>Leave Year: <span className="text-white">APR 1 — MAR 31</span></p>
                  <p>Records: <span className="text-white">{leaveYearRecords.length} in year</span></p>
                  <p>Calculation: <span className="text-emerald-400">SUCCESS</span></p>
                </div>
              )}
            </div>

            {/* Right Column: Calendar Visualizer */}
            <div className="lg:col-span-7">
              <Card className="p-6 bg-[#151515] border border-[#292929] shadow-xl rounded-[22px] h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-sm font-black text-white flex items-center gap-2">
                    <CalendarIcon className="w-4.5 h-4.5 text-[#D4AF37]" />
                    Leave Calendar
                  </h2>
                  <div className="flex gap-2">
                    <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-[#1B1B1B] rounded-lg transition text-[#C7C7C7] bg-[#121212] border border-[#292929]">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="px-3 py-1.5 bg-[#121212] rounded-lg border border-[#292929] text-xs font-bold text-white min-w-[100px] text-center">
                      {monthNames[cMonth]} {cYear}
                    </div>
                    <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-[#1B1B1B] rounded-lg transition text-[#C7C7C7] bg-[#121212] border border-[#292929]">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 bg-[#121212] border border-[#292929] rounded-2xl p-4 sm:p-6 flex flex-col">
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {weekdayNames.map((n) => (
                      <span key={n} className="text-[10px] font-bold text-[#8A8A8A] py-2 uppercase tracking-wider">
                        {n}
                      </span>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 sm:gap-2 flex-1">
                    {calCells.map((dayStr, idx) => {
                      if (!dayStr) return <div key={`empty-${idx}`} className="p-2" />;
                      
                      const dObj = new Date(dayStr);
                      const dNum = dObj.getDate();
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isToday = dayStr === todayStr;

                      // Check if day is a leave day
                      const leaveOnDay = leaves.find(l => {
                        return dayStr >= l.startDate && dayStr <= l.endDate && l.status !== 'CANCELLED';
                      });

                      let cellClass = 'bg-[#151515]/50 border border-[#292929]/40 text-[#C7C7C7]';

                      if (leaveOnDay) {
                         if (leaveOnDay.status === 'APPROVED') {
                           cellClass = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100 font-bold';
                         } else if (leaveOnDay.status === 'PENDING') {
                           cellClass = 'bg-amber-500/20 border-amber-500/40 text-amber-100 font-bold';
                         } else if (leaveOnDay.status === 'REJECTED') {
                           cellClass = 'bg-rose-500/20 border-rose-500/40 text-rose-100 font-bold opacity-60';
                         }
                      } else if (isToday) {
                         cellClass = 'bg-[#D4AF37]/20 border-[#D4AF37] text-white font-black ring-2 ring-[#D4AF37]/30';
                      }

                      return (
                        <div key={dayStr} className={`relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl transition ${cellClass}`}>
                           <span className="text-xs sm:text-sm">{dNum}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="flex gap-4 justify-center mt-6 pt-4 border-t border-[#292929]">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500/40"></div><span className="text-[10px] text-[#C7C7C7]">Approved</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500/40"></div><span className="text-[10px] text-[#C7C7C7]">Pending</span></div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37]/20 border border-[#D4AF37]"></div><span className="text-[10px] text-[#C7C7C7]">Today</span></div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );
      })()}

      {/* Grid: Apply Leave Form + Leave History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Apply Leave Card */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="p-5 bg-[#151515] border border-[#292929] shadow-xl">
            <h2 className="text-sm font-black text-white mb-4 flex items-center gap-2 border-b border-[#292929] pb-2.5">
              <CalendarDays className="w-4.5 h-4.5 text-[#D4AF37]" />
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
                  <label className="text-xs font-bold text-[#B7C0BC]">
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
                <div className="bg-[#111417] border border-[#3A4148] rounded-2xl p-3.5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-white">
                      {monthNames[calendarMonth]} {calendarYear}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => changeMonth(-1)}
                        className="p-1 hover:bg-[#1D2329] rounded-lg transition text-[#B7C0BC]"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => changeMonth(1)}
                        className="p-1 hover:bg-[#1D2329] rounded-lg transition text-[#B7C0BC]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {weekdayNames.map((n) => (
                      <span key={n} className="text-[10px] font-bold text-[#B7C0BC]/50 py-1 uppercase">
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

                      let cellClass = 'hover:bg-[#1B1B1B] text-[#C7C7C7]';
                      if (isSelectedStart || isSelectedEnd) {
                        cellClass = 'bg-[#D4AF37] text-[#080808] font-bold shadow-md';
                      } else if (isInRange) {
                        cellClass = 'bg-[#D4AF37]/20 text-[#D4AF37] font-semibold';
                      } else if (isPast) {
                        cellClass = 'text-[#8A8A8A]/30 hover:bg-[#1B1B1B]/50';
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
                <div className="p-3 bg-[#121212] border border-[#292929] rounded-2xl grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] text-[#8A8A8A] font-semibold">Start Date</p>
                    <p className="text-white font-black">{startDate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#8A8A8A] font-semibold">End Date</p>
                    <p className="text-white font-black">{endDate || 'Select end date...'}</p>
                  </div>
                  {requestedLeaveDaysCount > 0 && (
                    <div className="col-span-2 pt-1 border-t border-[#292929] mt-1 flex justify-between items-center text-xs">
                      <span className="text-[#C7C7C7] font-bold">Total Duration:</span>
                      <span className="text-[#D4AF37] font-black text-sm">{requestedLeaveDaysCount} Days</span>
                    </div>
                  )}
                </div>
              )}

              {/* Leave Reason */}
              <div>
                <label className="block text-xs font-bold text-[#C7C7C7] mb-1.5">
                  Reason for Leave Request
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="E.g., Medical, Family Emergency, urgent personal work..."
                  rows={3}
                  className="w-full bg-[#121212] border border-[#292929] focus:border-[#D4AF37]/60 rounded-xl p-3 text-xs text-white focus:outline-none placeholder-[#8A8A8A]"
                />
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting || !startDate || !endDate}
                className="w-full bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] font-bold p-3 rounded-xl transition flex justify-center items-center gap-2 shadow-md"
              >
                <Send className="w-3.5 h-3.5 text-[#080808]" />
                {isSubmitting ? 'Submitting Leave...' : 'Submit Leave Request'}
              </Button>
            </form>
          </Card>

          {/* Quick info panel */}
          <Card className="p-4 bg-[#151515] border border-[#292929] text-xs text-[#8A8A8A] space-y-2">
            <h3 className="font-bold text-[#C7C7C7] flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#D4AF37]" /> Leave Policy Guidelines
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
          <Card className="p-5 bg-[#171B1F] border border-[#3A4148] shadow-xl min-h-[400px] flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#292929] pb-4 mb-4">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-[#D4AF37]" />
                My Leave History
              </h2>
              <div className="flex gap-1 bg-[#101010] p-1 rounded-xl border border-[#292929] text-xs self-start">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-lg transition-all font-semibold ${
                      statusFilter === status
                        ? 'bg-[#D4AF37] text-black shadow-md font-bold'
                        : 'text-[#C7C7C7]/70 hover:text-white'
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
                    className="p-3.5 bg-[#151515] hover:bg-[#1B1B1B] rounded-2xl border border-[#292929] transition cursor-pointer flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center"
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
                      <div className="text-[11px] text-[#B7C0BC] leading-tight line-clamp-1">
                        Reason: "{leave.reason}"
                      </div>
                      <div className="flex gap-3 text-[10px] text-[#B7C0BC]/40">
                        <span>Submitted: {new Date(leave.submittedAtDeviceTime).toLocaleDateString()}</span>
                        {leave.teamLeaderName && (
                          <span>TL: {leave.teamLeaderName}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end gap-2 w-full sm:w-auto justify-between border-t border-[#3A4148]/20 sm:border-0 pt-2 sm:pt-0">
                      <span className="text-sm font-black text-white">
                        {leave.totalDays} Day{leave.totalDays > 1 ? 's' : ''}
                      </span>
                      {/* Sync Badge Removed */}
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex items-center justify-center py-12">
                  <EmptyState
                    title="No Leave Records"
                    description="No leave records yet."
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
          <div className="space-y-4 text-xs text-[#C7C7C7]">
            <div className="grid grid-cols-2 gap-3.5 bg-[#121212] p-4 rounded-2xl border border-[#292929]">
              <div>
                <p className="text-[10px] text-[#8A8A8A] font-bold uppercase">Date Range</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {selectedLeave.startDate} — {selectedLeave.endDate}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#8A8A8A] font-bold uppercase">Total Duration</p>
                <p className="text-xs font-black text-white mt-0.5">{selectedLeave.totalDays} Day(s)</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-[#292929]">
                <p className="text-[10px] text-[#8A8A8A] font-bold uppercase">Reason</p>
                <p className="text-xs text-white mt-0.5">"{selectedLeave.reason}"</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-bold text-white">Approval Path Status</h3>
              <div className="space-y-2 bg-[#121212] p-3.5 rounded-2xl border border-[#292929]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-[#8A8A8A]">Current Level Status</span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${getStatusBadgeClass(selectedLeave.status)}`}>
                    {selectedLeave.status}
                  </span>
                </div>
                
                {selectedLeave.teamLeaderId && (
                  <div className="pt-2 border-t border-[#292929] space-y-1">
                    <p className="font-bold text-[#C7C7C7]">Team Leader Review</p>
                    <div className="flex justify-between text-[11px]">
                      <span>TL: {selectedLeave.teamLeaderName}</span>
                      <span className="font-semibold text-[#D4AF37]">{selectedLeave.approvalStatus === 'PENDING' ? 'Pending Review' : 'Reviewed'}</span>
                    </div>
                    {selectedLeave.teamLeaderRemark && (
                      <p className="bg-[#1B1B1B] p-2 rounded-xl border border-[#292929] italic text-[#C7C7C7] text-[11px]">
                        TL Remark: "{selectedLeave.teamLeaderRemark}"
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-[#292929] space-y-1">
                  <p className="font-bold text-[#C7C7C7]">Admin Final Review</p>
                  <div className="flex justify-between text-[11px]">
                    <span>Admin Status</span>
                    <span className="font-semibold text-[#D4AF37]">
                      {selectedLeave.status === 'PENDING' && selectedLeave.approvalStatus !== 'TEAM_LEADER_APPROVED'
                        ? 'Awaiting Team Leader'
                        : selectedLeave.status === 'PENDING'
                        ? 'Awaiting Admin Review'
                        : selectedLeave.status}
                    </span>
                  </div>
                  {selectedLeave.adminRemark && (
                    <p className="bg-[#1B1B1B] p-2 rounded-xl border border-[#292929] italic text-[#C7C7C7] text-[11px]">
                      Admin Remark: "{selectedLeave.adminRemark}"
                    </p>
                  )}
                </div>

                {/* Override indicators */}
                {selectedLeave.overrideBy && (
                  <div className="pt-2 border-t border-[#292929] space-y-1 bg-amber-500/5 p-2 rounded-xl border border-amber-500/10">
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
            <div className="flex justify-between items-center text-[10px] text-[#8A8A8A] px-1 pt-1">
              <span>Device Created: {new Date(selectedLeave.createdAtDeviceTime).toLocaleString()}</span>
            </div>

            {/* Cancel Button */}
            {selectedLeave.status === 'PENDING' && (
              <Button
                onClick={() => handleCancelRequest(selectedLeave.id)}
                disabled={isCancelling}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold p-3 rounded-xl transition flex justify-center items-center gap-1.5 mt-2 shadow-md"
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
