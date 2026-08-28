import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  Home, 
  MapPin, 
  Briefcase, 
  Activity,
  AlertCircle
} from 'lucide-react';
import { AttendanceRecord, LiveEmployeeLocation } from '../../types/attendance';
import { Card } from '../../components/ui/Card';
import { calculateWorkingHours, parseAttendanceTimeToMinutes } from '../../services/attendance/smartAttendanceEngine';

interface TodayAttendanceCardProps {
  todayRecord: AttendanceRecord | null;
  isSyncing?: boolean;
  isOnline?: boolean;
  liveLocationData?: LiveEmployeeLocation | null;
}

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
};

export const TodayAttendanceCard: React.FC<TodayAttendanceCardProps> = ({
  todayRecord,
  isSyncing = false,
  isOnline = true,
  liveLocationData = null
}) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    if (todayRecord && todayRecord.checkInTime && !todayRecord.checkOutTime) {
      let timer: NodeJS.Timeout | null = null;

      const startTimer = () => {
        if (!timer) {
          setNow(new Date());
          timer = setInterval(() => {
            setNow(new Date());
          }, 15000);
        }
      };

      const stopTimer = () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };

      if (document.visibilityState === 'visible') {
        startTimer();
      }

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          startTimer();
        } else {
          stopTimer();
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        stopTimer();
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [todayRecord?.checkInTime, todayRecord?.checkOutTime]);

  const isCheckedIn = !!todayRecord && !!todayRecord.checkInTime && todayRecord.checkInTime !== '--:--';
  const isCheckedOut = !!todayRecord && !!todayRecord.checkOutTime && todayRecord.checkOutTime !== '--:--';
  const attendanceType = todayRecord?.attendanceType || 'OFFICE';

  let workingTimeStr = '--';

  if (isCheckedIn && todayRecord?.checkInTime) {
    if (isCheckedOut && todayRecord.checkOutTime) {
      const calculated = calculateWorkingHours(todayRecord.checkInTime, todayRecord.checkOutTime);
      workingTimeStr = calculated || '--';
    } else {
      const checkInMins = parseAttendanceTimeToMinutes(todayRecord.checkInTime);
      if (checkInMins !== null) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const nowSecs = now.getSeconds();
        const totalElapsedSecs = Math.max(0, (nowMins - checkInMins) * 60 + nowSecs);
        workingTimeStr = formatDuration(totalElapsedSecs);
      }
    }
  }

  let statusTitle = 'NOT CHECKED IN';
  let statusBadgeText = 'Not Started';
  let statusBorderColor = 'border-[#6366F1]/20';
  let badgeStyle = 'bg-[#171936] text-[#B9B9D0] border-[#6366F1]/20';
  let StateIcon = Clock;

  if (isCheckedOut) {
    statusTitle = 'CHECKED OUT';
    statusBadgeText = 'Workday Completed';
    statusBorderColor = 'border-emerald-500/30';
    badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    StateIcon = CheckCircle2;
  } else if (isCheckedIn) {
    if (attendanceType === 'WFH') {
      statusTitle = 'WORK FROM HOME';
      statusBadgeText = 'WFH Active';
      statusBorderColor = 'border-[#6366F1]/40';
      badgeStyle = 'bg-[#4F46E5]/15 text-[#818CF8] border-[#6366F1]/30';
      StateIcon = Home;
    } else if (attendanceType === 'CLIENT_VISIT') {
      statusTitle = 'CLIENT VISIT';
      statusBadgeText = todayRecord.clientName ? `Client: ${todayRecord.clientName}` : 'On-Site Visit';
      statusBorderColor = 'border-[#6366F1]/40';
      badgeStyle = 'bg-[#4F46E5]/15 text-[#818CF8] border-[#6366F1]/30';
      StateIcon = MapPin;
    } else if (attendanceType === 'OUTDOOR') {
      statusTitle = 'OUTDOOR WORK';
      statusBadgeText = todayRecord.outdoorType || 'Field Duty';
      statusBorderColor = 'border-amber-500/40';
      badgeStyle = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      StateIcon = Briefcase;
    } else {
      statusTitle = 'PRESENT';
      statusBadgeText = todayRecord.checkInMode === 'AUTO' ? 'Auto Check-In' : 'Office Attendance';
      statusBorderColor = 'border-emerald-500/30';
      badgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      StateIcon = CheckCircle2;
    }
  }

  const todayDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  return (
    <Card className={`p-4 sm:p-5 bg-[var(--app-bg-secondary)]/80 backdrop-blur-[14px] border ${statusBorderColor} shadow-2xl relative overflow-hidden transition-all duration-300 text-[var(--text-primary)]`}>
      {/* Background Subtle Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[var(--primary)]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--primary)]/20 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--card-bg)] border border-[var(--primary)]/20 flex items-center justify-center">
            <StateIcon className="w-4 h-4 text-[var(--primary-light)]" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">TODAY'S ATTENDANCE</h2>
            <p className="text-[10px] text-[var(--text-secondary)] font-medium">{todayDateFormatted}</p>
          </div>
        </div>

        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle} flex items-center gap-1.5`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {statusBadgeText}
        </span>
      </div>

      {/* Main Status Title & Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center mb-4">
        <div>
          <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-0.5">
            Current Status
          </span>

          <h1 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
            {statusTitle}
          </h1>

          <div className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
            {isCheckedOut ? (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Checked in {todayRecord.checkInTime} — Checked out {todayRecord.checkOutTime}
              </span>
            ) : isCheckedIn ? (
              <span className="text-[var(--text-primary)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Checked in at <strong className="text-emerald-400 font-mono">{todayRecord.checkInTime}</strong>
              </span>
            ) : (
              <span className="text-[var(--text-secondary)]">
                Check-in not yet recorded today
              </span>
            )}
          </div>
        </div>

        {/* Working Time Badge */}
        <div className="bg-[var(--card-bg)] p-3.5 rounded-2xl border border-[var(--primary)]/20 flex flex-col items-start sm:items-end justify-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary-light)] flex items-center gap-1 mb-0.5">
            <Activity className="w-3.5 h-3.5 text-[var(--primary-light)]" />
            WORKING TIME
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-[var(--text-primary)] tracking-tight">
            {workingTimeStr}
          </span>
        </div>
      </div>

      {/* Check-In & Checkout Display Cards */}
      <div className="pt-3 border-t border-[var(--primary)]/20">
        <div className="grid grid-cols-2 gap-3">
          {/* Check-In Box */}
          <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--primary)]/20 space-y-1">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
              CHECK-IN
            </span>
            <span className="text-base sm:text-lg font-black font-mono text-[var(--text-primary)] block">
              {todayRecord?.checkInTime || 'Not recorded'}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] font-medium block truncate">
              {isCheckedIn ? (attendanceType === 'OFFICE' ? 'Office HQ' : attendanceType.replace('_', ' ')) : 'Awaiting check-in'}
            </span>
          </div>

          {/* Checkout Box */}
          <div className="bg-[var(--card-bg)] p-3 rounded-xl border border-[var(--primary)]/20 space-y-1">
            <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
              CHECKOUT
            </span>
            <span className="text-base sm:text-lg font-black font-mono text-[var(--text-primary)] block">
              {todayRecord?.checkOutTime || 'Not recorded'}
            </span>
            <span className="text-[10px] text-[var(--text-secondary)] font-medium block truncate">
              {isCheckedOut ? 'Checkout recorded' : isCheckedIn ? 'Session in progress' : 'Not recorded'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
