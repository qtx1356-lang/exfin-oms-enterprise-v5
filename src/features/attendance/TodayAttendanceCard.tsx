import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, 
  Clock, 
  Home, 
  MapPin, 
  Briefcase, 
  LogOut, 
  Sparkles, 
  RotateCw, 
  WifiOff, 
  Activity,
  AlertCircle
} from 'lucide-react';
import { AttendanceRecord, LiveEmployeeLocation } from '../../types/attendance';
import { Card } from '../../components/ui/Card';
import { getCheckInLocationDetails, getCheckoutLocationDetails, getCurrentLocationDetails } from '../../utils/attendanceUtils';
import { calculateWorkingHours, parseAttendanceTimeToMinutes } from '../../services/attendance/smartAttendanceEngine';

interface TodayAttendanceCardProps {
  todayRecord: AttendanceRecord | null;
  isSyncing?: boolean;
  isOnline?: boolean;
  liveLocationData?: LiveEmployeeLocation | null;
}

const parseTimeString = (timeStr?: string): Date | null => {
  if (!timeStr || timeStr === '--:--') return null;
  try {
    const match = timeStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm) {
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  } catch {
    return null;
  }
};

const formatDuration = (seconds: number): string => {
  if (seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m ${secs}s`;
};

export const TodayAttendanceCard: React.FC<TodayAttendanceCardProps> = ({
  todayRecord,
  isSyncing = false,
  isOnline = true,
  liveLocationData = null
}) => {
  const [now, setNow] = useState<Date>(new Date());

  // Update real-time counter if checked in, paused when hidden to save CPU/battery
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

  // Determine current attendance state
  const isCheckedIn = !!todayRecord && !!todayRecord.checkInTime && todayRecord.checkInTime !== '--:--';
  const isCheckedOut = !!todayRecord && !!todayRecord.checkOutTime && todayRecord.checkOutTime !== '--:--';
  const attendanceType = todayRecord?.attendanceType || 'OFFICE';

  // Compute working time duration
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

  // Derive visual theme and labels
  let statusTitle = 'NOT CHECKED IN';
  let statusBadgeText = 'Your workday hasn\'t started';
  let statusBorderColor = 'border-[rgba(167,139,250,0.18)]';
  let badgeStyle = 'bg-[rgba(139,92,246,0.08)] text-[#A7B0BE] border-[rgba(167,139,250,0.18)]';
  let StateIcon = Clock;

  if (isCheckedOut) {
    statusTitle = 'WORKDAY COMPLETED';
    statusBadgeText = 'Checked Out';
    statusBorderColor = 'border-[rgba(16,185,129,0.35)]';
    badgeStyle = 'bg-[rgba(16,185,129,0.15)] text-[#10B981] border-[rgba(16,185,129,0.3)]';
    StateIcon = CheckCircle2;
  } else if (isCheckedIn) {
    if (attendanceType === 'WFH') {
      statusTitle = 'WORK FROM HOME';
      statusBadgeText = 'WFH Active';
      statusBorderColor = 'border-[rgba(0,245,255,0.35)]';
      badgeStyle = 'bg-[rgba(0,245,255,0.12)] text-[#00F5FF] border-[rgba(0,245,255,0.25)]';
      StateIcon = Home;
    } else if (attendanceType === 'CLIENT_VISIT') {
      statusTitle = 'CLIENT VISIT';
      statusBadgeText = todayRecord.clientName ? `Client: ${todayRecord.clientName}` : 'On-Site Visit';
      statusBorderColor = 'border-[rgba(0,245,255,0.35)]';
      badgeStyle = 'bg-[rgba(0,245,255,0.12)] text-[#00F5FF] border-[rgba(0,245,255,0.25)]';
      StateIcon = MapPin;
    } else if (attendanceType === 'OUTDOOR') {
      statusTitle = 'OUTDOOR WORK';
      statusBadgeText = todayRecord.outdoorType || 'Field Visit';
      statusBorderColor = 'border-[rgba(245,158,11,0.35)]';
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/25';
      StateIcon = Briefcase;
    } else {
      if (todayRecord.returningToOffice) {
        statusTitle = 'CHECKED IN (AWAY)';
        statusBadgeText = 'Returning to Office';
        statusBorderColor = 'border-[rgba(167,139,250,0.25)]';
        badgeStyle = 'bg-[rgba(139,92,246,0.12)] text-[#A7B0BE] border-[rgba(167,139,250,0.25)]';
        StateIcon = MapPin;
      } else {
        statusTitle = 'CHECKED IN';
        statusBadgeText = todayRecord.checkInMode === 'AUTO' ? 'Auto Check-In' : 'Office Attendance';
        statusBorderColor = 'border-[rgba(16,185,129,0.35)]';
        badgeStyle = 'bg-[rgba(16,185,129,0.15)] text-[#10B981] border-[rgba(16,185,129,0.3)]';
        StateIcon = CheckCircle2;
      }
    }
  }

  return (
    <Card className={`p-4 sm:p-5 bg-[rgba(139,92,246,0.08)] backdrop-blur-[16px] border ${statusBorderColor} shadow-[0_8px_32px_rgba(0,0,0,0.35)] relative overflow-hidden transition-all duration-300`}>
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[rgba(0,245,255,0.05)] rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-[rgba(167,139,250,0.18)] mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[rgba(139,92,246,0.12)] border border-[rgba(167,139,250,0.25)] flex items-center justify-center">
            <StateIcon className="w-4 h-4 text-[#00F5FF]" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#F8FAFC]">TODAY'S ATTENDANCE</h2>
            <p className="text-[10px] text-[#A7B0BE] font-medium">Smart Attendance Engine</p>
          </div>
        </div>
      </div>

      {/* Main Status & Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center mb-4">
        {/* Left: Status Title & Timestamps */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeStyle} flex items-center gap-1`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {statusBadgeText}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight leading-none mt-1">
            {statusTitle}
          </h1>

          {/* Time Summary */}
          <div className="mt-2 text-xs font-bold text-[#A7B0BE]">
            {isCheckedOut ? (
              <div className="flex flex-col gap-1 text-emerald-300">
                <span className="flex items-center gap-1">
                  <span>{todayRecord.checkInTime}</span>
                  <span>→</span>
                  <span>{todayRecord.checkOutTime}</span>
                </span>
                {todayRecord.checkOutMode && (
                  <span className="text-[10px] text-[#667085] font-semibold uppercase tracking-wider">
                    Checkout Type: {todayRecord.checkOutMode === 'AUTO_SYSTEM' ? 'Automatic' : 'Manual'}
                  </span>
                )}
              </div>
            ) : isCheckedIn ? (
              <span className="text-[#F8FAFC]">
                Checked in at <span className="font-mono text-[#10B981]">{todayRecord.checkInTime}</span>
              </span>
            ) : (
              <span className="text-[#667085] font-medium">No check-in recorded for today yet.</span>
            )}
          </div>
        </div>

        {/* Right: Working Time Counter */}
        <div className="bg-[rgba(12,15,22,0.85)] backdrop-blur-md p-3.5 rounded-2xl border border-[rgba(167,139,250,0.18)] flex flex-col items-start sm:items-end justify-center">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#00F5FF] flex items-center gap-1 mb-0.5">
            <Activity className="w-3 h-3 text-[#00F5FF]" />
            WORKING TIME
          </span>
          <span className="text-2xl sm:text-3xl font-black font-mono text-[#F8FAFC] tracking-tight">
            {workingTimeStr}
          </span>
          {isCheckedIn && !isCheckedOut && (
            <span className="text-[9px] font-bold text-[#10B981] flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" /> Live Session Active
            </span>
          )}
        </div>
      </div>

      {/* Visual Timeline Bar */}
      <div className="pt-3 border-t border-[rgba(167,139,250,0.18)]">
        <div className="flex items-center justify-between text-[10px] font-bold text-[#A7B0BE] mb-1.5">
          <span>CHECK-IN</span>
          <span>{isCheckedOut ? 'CHECK-OUT' : isCheckedIn ? 'LIVE PROGRESS' : 'READY FOR DUTY'}</span>
        </div>

        <div className="relative w-full h-2.5 bg-[rgba(8,11,15,0.7)] rounded-full overflow-hidden border border-[rgba(167,139,250,0.18)] flex items-center p-0.5">
          {isCheckedIn ? (
            <motion.div 
              initial={{ width: '5%' }}
              animate={{ width: isCheckedOut ? '100%' : '70%' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                isCheckedOut 
                  ? 'bg-gradient-to-r from-[#10B981] to-[#00F5FF]' 
                  : 'bg-gradient-to-r from-[#10B981] via-[#8B5CF6] to-[#00F5FF] animate-pulse'
              }`}
            />
          ) : (
            <div className="w-0 h-full bg-[#4B5563] rounded-full" />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#667085] mt-1.5">
          <span>{todayRecord?.checkInTime || '--:--'}</span>
          <span>{todayRecord?.checkOutTime || (isCheckedIn ? 'Now' : '--:--')}</span>
        </div>
      </div>

      {/* Separate Check-in, Checkout, and Current Location Display */}
      {todayRecord && isCheckedIn && (() => {
        const checkIn = getCheckInLocationDetails(todayRecord);
        const checkout = getCheckoutLocationDetails(todayRecord);
        const currentLoc = getCurrentLocationDetails(todayRecord, liveLocationData);

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-[rgba(167,139,250,0.18)] text-xs">
            {/* Check-in Location */}
            <div className="bg-[rgba(12,15,22,0.85)] p-2.5 rounded-xl border border-[rgba(167,139,250,0.18)] space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                <span>Check-in Location</span>
                <span className="font-mono text-emerald-300">{checkIn.time}</span>
              </div>
              <div className="text-[#F8FAFC] font-medium truncate flex items-center gap-1" title={checkIn.location}>
                <span className="text-emerald-400">📍</span> {checkIn.location}
              </div>
              {checkIn.distance && (
                <div className="text-[10px] text-[#A7B0BE] font-mono">
                  {checkIn.distance}
                </div>
              )}
            </div>

            {/* Checkout Location */}
            <div className="bg-[rgba(12,15,22,0.85)] p-2.5 rounded-xl border border-[rgba(167,139,250,0.18)] space-y-0.5">
              <div className="text-[10px] font-bold text-[#A78BFA] uppercase tracking-wider flex items-center justify-between">
                <span>Checkout Location</span>
                <span className="font-mono text-[#A78BFA]">{checkout.time}</span>
              </div>
              <div className={`font-medium truncate flex items-center gap-1 ${checkout.isUnresolved ? 'text-amber-300 font-bold' : 'text-[#F8FAFC]'}`} title={checkout.location}>
                <span className={checkout.isUnresolved ? 'text-amber-400' : 'text-[#8B5CF6]'}>📍</span> {checkout.location}
              </div>
              {checkout.distance && (
                <div className="text-[10px] text-[#A7B0BE] font-mono">
                  {checkout.distance}
                </div>
              )}
            </div>

            {/* Current (Live) Location */}
            <div className="bg-[rgba(12,15,22,0.85)] p-2.5 rounded-xl border border-[rgba(167,139,250,0.18)] space-y-0.5">
              <div className="text-[10px] font-bold text-[#00F5FF] uppercase tracking-wider flex items-center justify-between">
                <span>Current Location</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                  currentLoc.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse' :
                  currentLoc.status === 'RECENT' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' :
                  currentLoc.status === 'STALE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {currentLoc.status}
                </span>
              </div>
              <div className="text-[#F8FAFC] font-medium truncate flex items-center gap-1" title={currentLoc.location}>
                <span className="text-[#00F5FF]">📍</span> {currentLoc.location}
              </div>
              {currentLoc.distance && (
                <div className="text-[10px] text-[#A7B0BE] font-mono">
                  Distance: {currentLoc.distance}
                </div>
              )}
              {currentLoc.statusText && (
                <div className="text-[9px] text-[#00F5FF]/80 font-mono flex items-center gap-1">
                  <span>⏱</span> {currentLoc.statusText}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </Card>
  );
};
