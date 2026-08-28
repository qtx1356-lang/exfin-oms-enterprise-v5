import React, { useState, useEffect, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  X, 
  CheckCircle2, 
  Home, 
  MapPin, 
  Palmtree, 
  AlertCircle, 
  MinusCircle, 
  Info,
  Car,
  Briefcase,
  Search,
  Filter,
  List
} from 'lucide-react';
import { AttendanceRecord, AttendanceType } from '../../types/attendance';
import { LeaveRecord } from '../../types/leave';
import { getStoredLeaves } from '../../services/leave/leaveStorage';
import { calculateWorkingHours } from '../../services/attendance/smartAttendanceEngine';

interface AttendanceCalendarProps {
  employeeId: string;
  employeeName: string;
  attendanceRecords: AttendanceRecord[];
  onRefreshRecords?: () => void;
}

export type AttendanceDayCategory = 
  | 'OFFICE'
  | 'WFH'
  | 'CLIENT_VISIT'
  | 'OUTDOOR'
  | 'LEAVE'
  | 'ABSENT'
  | 'NO_RECORD'
  | 'FUTURE';

export interface DayDetailData {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  formattedDateLong: string;
  category: AttendanceDayCategory;
  attendanceRecord?: AttendanceRecord | null;
  leaveRecord?: LeaveRecord | null;
  isToday: boolean;
  isFuture: boolean;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  employeeId,
  employeeName,
  attendanceRecords,
}) => {
  // Navigation State - default to current month/year
  const todayDate = new Date();
  const [currentYear, setCurrentYear] = useState<number>(todayDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(todayDate.getMonth()); // 0-indexed (0=Jan, 11=Dec)

  // Selected Day Detail Modal
  const [selectedDayDetail, setSelectedDayDetail] = useState<DayDetailData | null>(null);

  // Online / Offline state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Today string YYYY-MM-DD in local time
  const todayStr = useMemo(() => {
    const y = todayDate.getFullYear();
    const m = String(todayDate.getMonth() + 1).padStart(2, '0');
    const d = String(todayDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Filter records strictly belonging to CURRENT registered employee
  const currentEmployeeRecords = useMemo(() => {
    if (!employeeId) return [];
    return attendanceRecords.filter(r => r.employeeId === employeeId);
  }, [attendanceRecords, employeeId]);

  // Load leaves belonging to CURRENT registered employee
  const currentEmployeeLeaves = useMemo(() => {
    if (!employeeId) return [];
    const allLeaves = getStoredLeaves();
    return allLeaves.filter(
      l => l.employeeId === employeeId && l.status === 'APPROVED'
    );
  }, [employeeId]);

  // Handle month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Format month title (e.g. "AUGUST 2026")
  const monthTitle = useMemo(() => {
    const date = new Date(currentYear, currentMonth, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }, [currentYear, currentMonth]);

  // Days calculations for calendar grid
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  // Offset for Monday-based week start (Mon=0, Tue=1, ..., Sun=6)
  const startingDayOffset = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // Sun=0, Mon=1...
    return (firstDay + 6) % 7;
  }, [currentYear, currentMonth]);

  // Check if selected month has any records or leaves offline
  const selectedMonthPrefix = useMemo(() => {
    const mStr = String(currentMonth + 1).padStart(2, '0');
    return `${currentYear}-${mStr}`;
  }, [currentYear, currentMonth]);

  const monthRecords = useMemo(() => {
    return currentEmployeeRecords.filter(r => r.date && r.date.startsWith(selectedMonthPrefix));
  }, [currentEmployeeRecords, selectedMonthPrefix]);

  const monthLeaves = useMemo(() => {
    return currentEmployeeLeaves.filter(l => {
      const startPrefix = l.startDate ? l.startDate.slice(0, 7) : '';
      const endPrefix = l.endDate ? l.endDate.slice(0, 7) : '';
      return startPrefix === selectedMonthPrefix || endPrefix === selectedMonthPrefix;
    });
  }, [currentEmployeeLeaves, selectedMonthPrefix]);

  const hasDataForMonth = monthRecords.length > 0 || monthLeaves.length > 0 || selectedMonthPrefix === todayStr.slice(0, 7);

  // Helper to map a specific date string (YYYY-MM-DD) to its attendance category & records
  const getDayInfo = (dateStr: string) => {
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    // 1. Check for Attendance Record
    const attRecord = monthRecords.find(r => r.date === dateStr) || 
      currentEmployeeRecords.find(r => r.date === dateStr) || null;

    if (attRecord) {
      let category: AttendanceDayCategory = 'OFFICE';
      if (attRecord.attendanceType === 'WFH') category = 'WFH';
      else if (attRecord.attendanceType === 'CLIENT_VISIT') category = 'CLIENT_VISIT';
      else if (attRecord.attendanceType === 'OUTDOOR') category = 'OUTDOOR';
      else category = 'OFFICE';

      return {
        category,
        attendanceRecord: attRecord,
        leaveRecord: null,
        isToday,
        isFuture: false
      };
    }

    // 2. Check for Approved Leave
    const targetTime = new Date(dateStr).getTime();
    const leaveRecord = currentEmployeeLeaves.find(l => {
      if (l.status !== 'APPROVED') return false;
      const startTime = new Date(l.startDate).getTime();
      const endTime = new Date(l.endDate).getTime();
      return targetTime >= startTime && targetTime <= endTime;
    }) || null;

    if (leaveRecord) {
      return {
        category: 'LEAVE' as AttendanceDayCategory,
        attendanceRecord: null,
        leaveRecord,
        isToday,
        isFuture: false
      };
    }

    // 3. Future Date
    if (isFuture) {
      return {
        category: 'FUTURE' as AttendanceDayCategory,
        attendanceRecord: null,
        leaveRecord: null,
        isToday: false,
        isFuture: true
      };
    }

    // 4. Past or Today Date without record or leave
    return {
      category: 'NO_RECORD' as AttendanceDayCategory,
      attendanceRecord: null,
      leaveRecord: null,
      isToday,
      isFuture: false
    };
  };

  // Monthly summary stats
  const monthlyStats = useMemo(() => {
    let officeCount = 0;
    let wfhCount = 0;
    let clientVisitCount = 0;
    let outdoorCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${currentYear}-${mStr}-${dStr}`;

      if (dateStr > todayStr) continue;

      const info = getDayInfo(dateStr);
      if (info.category === 'OFFICE') officeCount++;
      else if (info.category === 'WFH') wfhCount++;
      else if (info.category === 'CLIENT_VISIT') clientVisitCount++;
      else if (info.category === 'OUTDOOR') outdoorCount++;
      else if (info.category === 'LEAVE') leaveCount++;
      else if (info.category === 'ABSENT') absentCount++;
    }

    const totalPresent = officeCount + wfhCount + clientVisitCount + outdoorCount;

    return {
      present: totalPresent,
      office: officeCount,
      wfh: wfhCount,
      clientVisit: clientVisitCount,
      outdoor: outdoorCount,
      leave: leaveCount,
      absent: absentCount
    };
  }, [currentYear, currentMonth, daysInMonth, todayStr, monthRecords, currentEmployeeLeaves]);

  // Working Days Calculation
  const workingDaysInfo = useMemo(() => {
    let totalWorkingDaysInMonth = 0;
    let workingDaysElapsed = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isSunday = d.getDay() === 0;
      if (!isSunday) {
        totalWorkingDaysInMonth++;
        const mStr = String(currentMonth + 1).padStart(2, '0');
        const dStr = String(day).padStart(2, '0');
        const dateStr = `${currentYear}-${mStr}-${dStr}`;
        if (dateStr <= todayStr) {
          workingDaysElapsed++;
        }
      }
    }

    return {
      totalInMonth: totalWorkingDaysInMonth,
      elapsed: Math.max(1, workingDaysElapsed)
    };
  }, [currentYear, currentMonth, daysInMonth, todayStr]);

  // Day click handler
  const handleDayClick = (dayNumber: number) => {
    const mStr = String(currentMonth + 1).padStart(2, '0');
    const dStr = String(dayNumber).padStart(2, '0');
    const dateStr = `${currentYear}-${mStr}-${dStr}`;

    const dObj = new Date(currentYear, currentMonth, dayNumber);
    const formattedDateLong = dObj.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const info = getDayInfo(dateStr);

    setSelectedDayDetail({
      dateStr,
      dayNumber,
      formattedDateLong,
      category: info.category,
      attendanceRecord: info.attendanceRecord,
      leaveRecord: info.leaveRecord,
      isToday: info.isToday,
      isFuture: info.isFuture
    });
  };

  return (
    <div className="bg-[var(--app-bg-secondary)] rounded-2xl border border-[var(--primary)]/20 p-4 sm:p-6 shadow-2xl space-y-5 text-[var(--text-primary)] font-sans">
      
      {/* ==================================================== */}
      {/* HEADER & MONTH NAVIGATION */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--primary)]/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--card-bg)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--primary)] shadow-inner">
            <CalendarIcon className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[var(--text-primary)] tracking-wide">
                Attendance Calendar
              </h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--card-bg)] text-[var(--primary)] border border-[var(--primary)]/20 uppercase tracking-widest">
                History
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Monthly overview for <strong className="text-[var(--text-primary)]">{employeeName}</strong>
            </p>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between sm:justify-end gap-2 bg-[var(--app-bg-primary)] p-1.5 rounded-2xl border border-[var(--primary)]/20">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--app-bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--primary)]/20 active:scale-95 cursor-pointer"
            title="Previous Month"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] px-3 tracking-wider font-mono">
            {monthTitle}
          </span>

          <button
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--app-bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--primary)]/20 active:scale-95 cursor-pointer"
            title="Next Month"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Offline Warning Banner if selected month has no cached data offline */}
      {!isOnline && !hasDataForMonth && (
        <div className="p-3.5 bg-amber-950/40 border border-amber-500/30 text-amber-200 rounded-2xl text-xs font-medium flex items-center gap-2.5 shadow-sm">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Attendance history for this month isn't available offline.</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* CALENDAR GRID */}
      {/* ==================================================== */}
      <div className="space-y-2">
        {/* Day Headers (MON to SUN) */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider py-1 border-b border-[var(--primary)]/20">
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span className="text-[var(--text-secondary)]">SAT</span>
          <span className="text-[var(--text-secondary)]/80">SUN</span>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty cells for starting day offset */}
          {Array.from({ length: startingDayOffset }).map((_, idx) => (
            <div key={`offset-${idx}`} className="h-16 sm:h-20 rounded-2xl bg-[var(--card-bg)]/30 border border-transparent opacity-20 pointer-events-none" />
          ))}

          {/* Actual Month Days */}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const dayNumber = idx + 1;
            const mStr = String(currentMonth + 1).padStart(2, '0');
            const dStr = String(dayNumber).padStart(2, '0');
            const dateStr = `${currentYear}-${mStr}-${dStr}`;

            const info = getDayInfo(dateStr);
            const isToday = info.isToday;
            const isFuture = info.isFuture;

            let bgStyle = 'bg-[var(--card-bg)] hover:bg-[var(--app-bg-primary)] border-[var(--primary)]/10';
            let statusIcon = '—';
            let statusLabel = 'No Record';
            let textColor = 'text-[var(--text-secondary)]';

            if (isFuture) {
              bgStyle = 'bg-[var(--card-bg)] border-[var(--primary)]/10 opacity-30';
              statusIcon = '○';
              statusLabel = 'Future';
              textColor = 'text-[var(--text-secondary)]/40';
            } else if (info.category === 'OFFICE') {
              bgStyle = 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/40 shadow-sm';
              statusIcon = '✓';
              statusLabel = 'Office';
              textColor = 'text-emerald-400';
            } else if (info.category === 'WFH') {
              bgStyle = 'bg-[var(--primary)]/10 hover:bg-[var(--primary)]/15 border-[var(--primary)]/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]';
              statusIcon = '🏠';
              statusLabel = 'WFH';
              textColor = 'text-[var(--primary-light)]';
            } else if (info.category === 'CLIENT_VISIT') {
              bgStyle = 'bg-amber-950/40 hover:bg-amber-900/60 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)]';
              statusIcon = '📍';
              statusLabel = 'Client';
              textColor = 'text-amber-300';
            } else if (info.category === 'OUTDOOR') {
              bgStyle = 'bg-blue-950/40 hover:bg-blue-900/60 border-blue-500/40';
              statusIcon = '🚗';
              statusLabel = 'Outdoor';
              textColor = 'text-blue-300';
            } else if (info.category === 'LEAVE') {
              bgStyle = 'bg-cyan-950/40 hover:bg-cyan-900/60 border-cyan-500/40';
              statusIcon = '🏖';
              statusLabel = 'Leave';
              textColor = 'text-cyan-300';
            } else if (info.category === 'ABSENT') {
              bgStyle = 'bg-rose-950/40 hover:bg-rose-900/60 border-rose-500/40';
              statusIcon = '○';
              statusLabel = 'Absent';
              textColor = 'text-rose-300';
            }

            return (
              <button
                key={dateStr}
                onClick={() => handleDayClick(dayNumber)}
                className={`relative h-16 sm:h-20 p-1.5 sm:p-2 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group active:scale-95 cursor-pointer ${bgStyle} ${
                  isToday ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--app-bg-secondary)] border-[var(--primary)]/20' : ''
                }`}
              >
                {/* Date Number + Today Highlight Badge */}
                <div className="flex justify-between items-center w-full">
                  <span className={`text-xs sm:text-sm font-black font-mono ${isToday ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {dayNumber}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-bold bg-[var(--primary)] text-white px-1.5 py-0.5 rounded-full shadow tracking-wider uppercase">
                      TODAY
                    </span>
                  )}
                </div>

                {/* Status Indicator */}
                <div className="w-full flex items-center gap-1 overflow-hidden">
                  <span className={`text-xs sm:text-sm flex-shrink-0 ${textColor}`}>
                    {statusIcon}
                  </span>
                  <span className={`text-[9px] sm:text-[10px] font-bold truncate leading-tight ${textColor}`}>
                    {statusLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================================================== */}
      {/* LEGEND */}
      {/* ==================================================== */}
      <div className="pt-3 border-t border-[var(--primary)]/20 flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-[11px] font-bold text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>✓ Office</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)]" />
          <span>🏠 WFH</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>📍 Client Visit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span>🏖 Leave</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span>○ Absent</span>
        </div>
      </div>

      {/* ==================================================== */}
      {/* DAY DETAILS MODAL / BOTTOM SHEET */}
      {/* ==================================================== */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div 
            className="w-full max-w-lg bg-[var(--app-bg-secondary)] border border-[var(--primary)]/20 rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl space-y-5 animate-slide-up text-[var(--text-primary)] relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[var(--primary)]/20 pb-4">
              <div>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-[var(--primary)]" />
                  Day Attendance Details
                  {selectedDayDetail.isToday && (
                    <span className="bg-[var(--primary)] text-white text-[9px] px-2 py-0.5 rounded-full font-bold">
                      TODAY
                    </span>
                  )}
                </p>
                <h3 className="text-lg sm:text-xl font-black text-[var(--text-primary)] mt-1">
                  {selectedDayDetail.formattedDateLong}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="p-2 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--app-bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all border border-[var(--primary)]/20 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attendance Status Badge Header */}
            <div className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--primary)]/20 flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Status</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                selectedDayDetail.category === 'OFFICE' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' :
                selectedDayDetail.category === 'WFH' ? 'bg-[var(--primary)]/15 text-[var(--primary-light)] border-[var(--primary)]/40' :
                selectedDayDetail.category === 'CLIENT_VISIT' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                selectedDayDetail.category === 'OUTDOOR' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                selectedDayDetail.category === 'LEAVE' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                selectedDayDetail.category === 'ABSENT' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--primary)]/20'
              }`}>
                {selectedDayDetail.category === 'OFFICE' && '✓ OFFICE'}
                {selectedDayDetail.category === 'WFH' && '🏠 WFH'}
                {selectedDayDetail.category === 'CLIENT_VISIT' && '📍 CLIENT VISIT'}
                {selectedDayDetail.category === 'OUTDOOR' && '🚗 OUTDOOR WORK'}
                {selectedDayDetail.category === 'LEAVE' && '🏖 LEAVE'}
                {selectedDayDetail.category === 'ABSENT' && '○ ABSENT'}
                {selectedDayDetail.category === 'NO_RECORD' && '— NO RECORD'}
                {selectedDayDetail.category === 'FUTURE' && '○ FUTURE DATE'}
              </span>
            </div>

            {/* Details Content depending on Record Type */}
            {selectedDayDetail.attendanceRecord ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 bg-[var(--card-bg)] rounded-2xl border border-[var(--primary)]/20 space-y-1">
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">Check-In</p>
                    <p className="text-base font-black text-[var(--text-primary)]">{selectedDayDetail.attendanceRecord.checkInTime}</p>
                    <p className="text-[9px] text-[var(--text-secondary)]">Source: {selectedDayDetail.attendanceRecord.checkInMode}</p>
                  </div>

                  <div className="p-3.5 bg-[var(--card-bg)] rounded-2xl border border-[var(--primary)]/20 space-y-1">
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">Check-Out</p>
                    <p className="text-base font-black text-[var(--text-primary)]">{selectedDayDetail.attendanceRecord.checkOutTime || 'Pending'}</p>
                    <p className="text-[9px] text-[var(--text-secondary)]">
                      Source: {selectedDayDetail.attendanceRecord.checkOutMode === 'AUTO_SYSTEM' ? 'Automatic Checkout' : (selectedDayDetail.attendanceRecord.checkOutMode === 'MANUAL' ? 'Manual Checkout' : 'In Progress')}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[var(--card-bg)] rounded-2xl border border-[var(--primary)]/20 flex justify-between items-center text-xs">
                  <span className="font-bold text-[var(--text-secondary)]">Working Time</span>
                  <span className="font-bold text-[var(--primary-light)] text-sm font-mono">
                    {(() => {
                      const rec = selectedDayDetail.attendanceRecord;
                      if (!rec) return '--';
                      if (rec.checkoutStatus === 'UNRESOLVED') {
                        return <span className="text-rose-400">UNRESOLVED</span>;
                      }
                      const hasCheckout = !!(
                        rec.checkOutTime &&
                        rec.checkOutTime !== '--:--' &&
                        rec.checkOutTime !== 'Pending' &&
                        rec.checkOutTime !== 'N/A' &&
                        rec.checkOutTime !== 'UNRESOLVED'
                      );
                      if (hasCheckout && rec.checkInTime && rec.checkInTime !== '--:--') {
                        const calculated = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);
                        return calculated || '—';
                      }
                      if (rec.checkInTime && rec.checkInTime !== '--:--') {
                        return selectedDayDetail.isToday ? 'In Progress' : <span className="text-rose-400">UNRESOLVED</span>;
                      }
                      return '--';
                    })()}
                  </span>
                </div>

                {/* Mode Specific Additional Info */}
                {selectedDayDetail.attendanceRecord.attendanceType === 'WFH' && (
                  <div className="p-4 bg-[var(--primary)]/10 rounded-2xl border border-[var(--primary)]/20 text-xs space-y-2">
                    <p className="font-bold text-[var(--primary-light)] uppercase tracking-wider text-[10px]">Work From Home Details</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Reason:</strong> {selectedDayDetail.attendanceRecord.wfhReason || 'N/A'}</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Work Plan:</strong> {selectedDayDetail.attendanceRecord.workPlan || 'N/A'}</p>
                  </div>
                )}

                {selectedDayDetail.attendanceRecord.attendanceType === 'CLIENT_VISIT' && (
                  <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-xs space-y-2">
                    <p className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">Client Visit Details</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Client:</strong> {selectedDayDetail.attendanceRecord.clientName || 'N/A'}</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Location:</strong> {selectedDayDetail.attendanceRecord.clientLocation || 'N/A'}</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Purpose:</strong> {selectedDayDetail.attendanceRecord.purpose || 'N/A'}</p>
                  </div>
                )}

                {selectedDayDetail.attendanceRecord.attendanceType === 'OUTDOOR' && (
                  <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-xs space-y-2">
                    <p className="font-bold text-blue-300 uppercase tracking-wider text-[10px]">Outdoor Work Details</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Type:</strong> {selectedDayDetail.attendanceRecord.outdoorType || 'N/A'}</p>
                    <p><strong className="text-[var(--text-secondary)] font-bold">Description:</strong> {selectedDayDetail.attendanceRecord.description || 'N/A'}</p>
                  </div>
                )}
              </div>
            ) : selectedDayDetail.leaveRecord ? (
              <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-xs space-y-2">
                <p className="font-bold text-cyan-300 uppercase tracking-wider text-[10px]">Approved Leave Details</p>
                <p><strong className="text-[var(--text-secondary)] font-bold">Duration:</strong> {selectedDayDetail.leaveRecord.startDate} to {selectedDayDetail.leaveRecord.endDate} ({selectedDayDetail.leaveRecord.totalDays} Days)</p>
                <p><strong className="text-[var(--text-secondary)] font-bold">Reason:</strong> {selectedDayDetail.leaveRecord.reason}</p>
              </div>
            ) : (
              <div className="p-5 bg-[var(--card-bg)] rounded-2xl border border-[var(--primary)]/20 text-center space-y-2">
                <p className="text-xs text-[var(--text-secondary)] font-medium">
                  {selectedDayDetail.isFuture 
                    ? 'This is a future date. No attendance records exist yet.' 
                    : 'No attendance record found for this date.'}
                </p>
              </div>
            )}

            {/* Modal Close Action */}
            <div className="pt-2">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="w-full py-3.5 bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white font-bold rounded-2xl text-xs transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
