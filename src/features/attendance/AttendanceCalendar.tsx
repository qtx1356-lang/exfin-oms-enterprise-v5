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

    // Iterate through all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${currentYear}-${mStr}-${dStr}`;

      if (dateStr > todayStr) continue; // skip future days

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

  // Working Days Calculation: Total non-Sunday days in month up to today (or total in month)
  const workingDaysInfo = useMemo(() => {
    let totalWorkingDaysInMonth = 0;
    let workingDaysElapsed = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isSunday = d.getDay() === 0; // 0 = Sunday
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

  // Attendance Rate Calculation
  const attendanceRate = useMemo(() => {
    const totalValidDays = monthlyStats.present + monthlyStats.leave;
    const denominator = workingDaysInfo.elapsed;
    if (denominator <= 0) return 100;
    const rate = Math.min(100, Math.round((totalValidDays / denominator) * 100));
    return isNaN(rate) ? 0 : rate;
  }, [monthlyStats, workingDaysInfo]);

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
    <div className="bg-[#171B1E] rounded-2xl border border-[#292F33] p-4 sm:p-6 shadow-md space-y-5 text-white font-sans">
      
      {/* ==================================================== */}
      {/* HEADER & MONTH NAVIGATION */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#292F33] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#111417] border border-[#292F33] flex items-center justify-center text-[#18C98F] shadow-inner">
            <CalendarIcon className="w-5 h-5 text-[#18C98F]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-white tracking-wide">
                Attendance Calendar
              </h2>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#111417] text-[#18C98F] border border-[#292F33] uppercase tracking-widest">
                History
              </span>
            </div>
            <p className="text-xs text-[#B7C0BC] mt-0.5">
              Monthly overview for <strong className="text-white">{employeeName}</strong>
            </p>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between sm:justify-end gap-2 bg-[#111417] p-1.5 rounded-2xl border border-[#292F33]">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-[#1D2226] hover:bg-[#292F33] text-[#B7C0BC] hover:text-white transition-all border border-[#292F33] active:scale-95"
            title="Previous Month"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs sm:text-sm font-black text-white px-3 tracking-wider font-mono">
            {monthTitle}
          </span>

          <button
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-[#1D2226] hover:bg-[#292F33] text-[#B7C0BC] hover:text-white transition-all border border-[#292F33] active:scale-95"
            title="Next Month"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Offline Warning Banner if selected month has no cached data offline */}
      {!isOnline && !hasDataForMonth && (
        <div className="p-3.5 bg-amber-950/60 border border-amber-500/40 text-amber-200 rounded-2xl text-xs font-medium flex items-center gap-2.5 shadow-sm">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Attendance history for this month isn't available offline.</span>
        </div>
      )}

      {/* ==================================================== */}
      {/* CALENDAR GRID */}
      {/* ==================================================== */}
      <div className="space-y-2">
        {/* Day Headers (MON to SUN) */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs font-black text-[#B7C0BC] uppercase tracking-wider py-1 border-b border-[#292F33]">
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span className="text-[#B7C0BC]">SAT</span>
          <span className="text-[#B7C0BC]/80">SUN</span>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty cells for starting day offset */}
          {Array.from({ length: startingDayOffset }).map((_, idx) => (
            <div key={`offset-${idx}`} className="h-16 sm:h-20 rounded-2xl bg-[#111417]/20 border border-transparent opacity-20 pointer-events-none" />
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

            // Compute cell border & badge styling
            let bgStyle = 'bg-[#111417] hover:bg-[#1D2226] border-[#292F33]';
            let statusIcon = '—';
            let statusLabel = 'No Record';
            let textColor = 'text-[#7E8985]';

            if (isFuture) {
              bgStyle = 'bg-[#111417] border-[#292F33] opacity-40';
              statusIcon = '○';
              statusLabel = 'Future';
              textColor = 'text-[#7E8985]/50';
            } else if (info.category === 'OFFICE') {
              bgStyle = 'bg-[#18C98F]/10 hover:bg-[#18C98F]/20 border-[#18C98F]/40 shadow-sm';
              statusIcon = '✓';
              statusLabel = 'Office';
              textColor = 'text-[#18C98F]';
            } else if (info.category === 'WFH') {
              bgStyle = 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]';
              statusIcon = '🏠';
              statusLabel = 'WFH';
              textColor = 'text-emerald-300';
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
                className={`relative h-16 sm:h-20 p-1.5 sm:p-2 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group active:scale-95 ${bgStyle} ${
                  isToday ? 'ring-2 ring-[#18C98F] ring-offset-2 ring-offset-[#171B1E] border-[#292F33]' : ''
                }`}
              >
                {/* Date Number + Today Highlight Badge */}
                <div className="flex justify-between items-center w-full">
                  <span className={`text-xs sm:text-sm font-black font-mono ${isToday ? 'text-white' : 'text-[#F5F7F6]'}`}>
                    {dayNumber}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-black bg-[#18C98F] text-[#0B0D0F] px-1.5 py-0.5 rounded-full shadow tracking-wider uppercase">
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
      <div className="pt-3 border-t border-[#292F33] flex flex-wrap items-center justify-center gap-3 sm:gap-5 text-[11px] font-bold text-[#B7C0BC]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#18C98F]" />
          <span>✓ Office</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div 
            className="w-full max-w-lg bg-[#171B1E] border border-[#292F33] rounded-t-2xl sm:rounded-2xl p-6 shadow-2xl space-y-5 animate-slide-up text-white relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#292F33] pb-4">
              <div>
                <p className="text-[10px] text-[#B7C0BC] font-extrabold uppercase tracking-widest flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-[#18C98F]" />
                  Day Attendance Details
                  {selectedDayDetail.isToday && (
                    <span className="bg-[#18C98F] text-[#0B0D0F] text-[9px] px-2 py-0.5 rounded-full font-black">
                      TODAY
                    </span>
                  )}
                </p>
                <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                  {selectedDayDetail.formattedDateLong}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="p-2 rounded-xl bg-[#1D2226] hover:bg-[#292F33] text-[#B7C0BC] hover:text-white transition-all border border-[#292F33]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attendance Status Badge Header */}
            <div className="p-4 rounded-2xl bg-[#111417] border border-[#292F33] flex items-center justify-between">
              <span className="text-xs font-bold text-[#B7C0BC]">Status</span>
              <span className={`px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 ${
                selectedDayDetail.category === 'OFFICE' ? 'bg-[#18C98F]/25 text-[#18C98F] border-[#18C98F]/40' :
                selectedDayDetail.category === 'WFH' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                selectedDayDetail.category === 'CLIENT_VISIT' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                selectedDayDetail.category === 'OUTDOOR' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                selectedDayDetail.category === 'LEAVE' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' :
                selectedDayDetail.category === 'ABSENT' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                'bg-slate-800 text-slate-300 border-slate-700'
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
                  <div className="p-3.5 bg-[#111417] rounded-2xl border border-[#292F33] space-y-1">
                    <p className="text-[10px] text-[#B7C0BC] font-bold uppercase">Check-In</p>
                    <p className="text-base font-black text-white">{selectedDayDetail.attendanceRecord.checkInTime}</p>
                    <p className="text-[9px] text-[#7E8985]">Source: {selectedDayDetail.attendanceRecord.checkInMode}</p>
                  </div>

                  <div className="p-3.5 bg-[#111417] rounded-2xl border border-[#292F33] space-y-1">
                    <p className="text-[10px] text-[#B7C0BC] font-bold uppercase">Check-Out</p>
                    <p className="text-base font-black text-white">{selectedDayDetail.attendanceRecord.checkOutTime || 'Pending'}</p>
                    <p className="text-[9px] text-[#7E8985]">
                      Source: {selectedDayDetail.attendanceRecord.checkOutMode === 'AUTO_SYSTEM' ? 'Automatic Checkout' : (selectedDayDetail.attendanceRecord.checkOutMode === 'MANUAL' ? 'Manual Checkout' : 'In Progress')}
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-[#111417] rounded-2xl border border-[#292F33] flex justify-between items-center text-xs">
                  <span className="font-bold text-[#B7C0BC]">Working Time</span>
                  <span className="font-black text-emerald-300 text-sm font-mono">
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
                  <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-xs space-y-2">
                    <p className="font-bold text-emerald-300 uppercase tracking-wider text-[10px]">Work From Home Details</p>
                    <p><strong className="text-[#B7C0BC]">Reason:</strong> {selectedDayDetail.attendanceRecord.wfhReason || 'N/A'}</p>
                    <p><strong className="text-[#B7C0BC]">Work Plan:</strong> {selectedDayDetail.attendanceRecord.workPlan || 'N/A'}</p>
                  </div>
                )}

                {selectedDayDetail.attendanceRecord.attendanceType === 'CLIENT_VISIT' && (
                  <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-xs space-y-2">
                    <p className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">Client Visit Details</p>
                    <p><strong className="text-[#B7C0BC]">Client:</strong> {selectedDayDetail.attendanceRecord.clientName || 'N/A'}</p>
                    <p><strong className="text-[#B7C0BC]">Location:</strong> {selectedDayDetail.attendanceRecord.clientLocation || 'N/A'}</p>
                    <p><strong className="text-[#B7C0BC]">Purpose:</strong> {selectedDayDetail.attendanceRecord.purpose || 'N/A'}</p>
                  </div>
                )}

                {selectedDayDetail.attendanceRecord.attendanceType === 'OUTDOOR' && (
                  <div className="p-4 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-xs space-y-2">
                    <p className="font-bold text-blue-300 uppercase tracking-wider text-[10px]">Outdoor Work Details</p>
                    <p><strong className="text-[#B7C0BC]">Type:</strong> {selectedDayDetail.attendanceRecord.outdoorType || 'N/A'}</p>
                    <p><strong className="text-[#B7C0BC]">Description:</strong> {selectedDayDetail.attendanceRecord.description || 'N/A'}</p>
                  </div>
                )}
              </div>
            ) : selectedDayDetail.leaveRecord ? (
              <div className="p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 text-xs space-y-2">
                <p className="font-bold text-cyan-300 uppercase tracking-wider text-[10px]">Approved Leave Details</p>
                <p><strong className="text-[#B7C0BC]">Duration:</strong> {selectedDayDetail.leaveRecord.startDate} to {selectedDayDetail.leaveRecord.endDate} ({selectedDayDetail.leaveRecord.totalDays} Days)</p>
                <p><strong className="text-[#B7C0BC]">Reason:</strong> {selectedDayDetail.leaveRecord.reason}</p>
              </div>
            ) : (
              <div className="p-5 bg-[#111417] rounded-2xl border border-[#292F33] text-center space-y-2">
                <p className="text-xs text-[#B7C0BC] font-medium">
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
                className="w-full py-3.5 bg-[#18C98F] hover:bg-[#10966D] text-[#0B0D0F] font-extrabold rounded-2xl text-xs transition-all shadow-lg active:scale-95"
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
