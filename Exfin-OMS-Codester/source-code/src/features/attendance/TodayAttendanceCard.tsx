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
import { subscribeToAddressCacheUpdates } from '../../utils/addressFormatter';
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
  const [, setAddressCacheVersion] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = subscribeToAddressCacheUpdates(() => {
      setAddressCacheVersion((v) => v + 1);
    });
    return () => unsubscribe();
  }, []);

  // Update real-time counter if checked in
  useEffect(() => {
    if (todayRecord && todayRecord.checkInTime && !todayRecord.checkOutTime) {
      const timer = setInterval(() => {
        setNow(new Date());
      }, 10000);
      return () => clearInterval(timer);
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
  let statusColor = 'from-gray-800 to-gray-900 border-gray-500/30 text-gray-300';
  let badgeStyle = 'bg-gray-500/15 text-gray-300 border-gray-500/30';
  let StateIcon = Clock;

  if (isCheckedOut) {
    statusTitle = 'WORKDAY COMPLETED';
    statusBadgeText = 'Checked Out';
    statusColor = 'from-[#1A2E28] via-[#15342A] to-[#122A22] border-emerald-500/40 text-emerald-300';
    badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    StateIcon = CheckCircle2;
  } else if (isCheckedIn) {
    if (attendanceType === 'WFH') {
      statusTitle = 'WORK FROM HOME';
      statusBadgeText = 'WFH Active';
      statusColor = 'from-[#17223B] via-[#1A284A] to-[#141F38] border-blue-500/40 text-blue-300';
      badgeStyle = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      StateIcon = Home;
    } else if (attendanceType === 'CLIENT_VISIT') {
      statusTitle = 'CLIENT VISIT';
      statusBadgeText = todayRecord.clientName ? `Client: ${todayRecord.clientName}` : 'On-Site Visit';
      statusColor = 'from-[#281545] via-[#2F1752] to-[#22113B] border-purple-500/40 text-purple-300';
      badgeStyle = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      StateIcon = MapPin;
    } else if (attendanceType === 'OUTDOOR') {
      statusTitle = 'OUTDOOR WORK';
      statusBadgeText = todayRecord.outdoorType || 'Field Visit';
      statusColor = 'from-[#2B1D0E] via-[#332210] to-[#24170A] border-amber-500/40 text-amber-300';
      badgeStyle = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      StateIcon = Briefcase;
    } else {
      statusTitle = 'CHECKED IN';
      statusBadgeText = todayRecord.checkInMode === 'AUTO' ? 'Auto Check-In' : 'Office Attendance';
      statusColor = 'from-[#162C22] via-[#1B362A] to-[#12241C] border-emerald-500/40 text-emerald-300';
      badgeStyle = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      StateIcon = CheckCircle2;
    }
  }

  return (
    <Card className={`p-4 sm:p-5 bg-gradient-to-br ${statusColor} border shadow-2xl relative overflow-hidden transition-all duration-300`}>
      {/* Background Ambient Glow */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
            <StateIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-white/90">TODAY'S ATTENDANCE</h2>
            <p className="text-[10px] text-white/60 font-medium">Smart Attendance Engine</p>
          </div>
        </div>

        {/* Sync / Offline Status Indicator */}
        <div className="flex items-center gap-2">
          {isSyncing && (
            <span className="text-[9px] font-extrabold text-blue-300 bg-blue-500/20 px-2.5 py-0.5 rounded-full border border-blue-500/30 flex items-center gap-1 animate-pulse">
              <RotateCw className="w-2.5 h-2.5 animate-spin" /> Syncing...
            </span>
          )}
          {!isOnline && (
            <span className="text-[9px] font-extrabold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
              <WifiOff className="w-2.5 h-2.5" /> Saved locally
            </span>
          )}
          {todayRecord?.syncStatus === 'Pending' && isOnline && !isSyncing && (
            <span className="text-[9px] font-extrabold text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
              <AlertCircle className="w-2.5 h-2.5" /> Sync Pending
            </span>
          )}
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

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none mt-1">
            {statusTitle}
          </h1>

          {/* Time Summary */}
          <div className="mt-2 text-xs font-bold text-white/80">
            {isCheckedOut ? (
              <div className="flex flex-col gap-1 text-emerald-200">
                <span className="flex items-center gap-1">
                  <span>{todayRecord.checkInTime}</span>
                  <span>→</span>
                  <span>{todayRecord.checkOutTime}</span>
                </span>
                {todayRecord.checkOutMode && (
                  <span className="text-[10px] text-white/70 font-semibold uppercase tracking-wider">
                    Checkout Type: {todayRecord.checkOutMode === 'AUTO_SYSTEM' ? 'Automatic' : 'Manual'}
                  </span>
                )}
              </div>
            ) : isCheckedIn ? (
              <span className="text-white/90">
                Checked in at <span className="font-mono text-emerald-300">{todayRecord.checkInTime}</span>
              </span>
            ) : (
              <span className="text-white/60 font-medium">No check-in recorded for today yet.</span>
            )}
          </div>
        </div>

        {/* Right: Working Time Counter */}
        <div className="bg-black/25 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 flex flex-col items-start sm:items-end justify-center">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/60 flex items-center gap-1 mb-0.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            WORKING TIME
          </span>
          <span className="text-2xl sm:text-3xl font-black font-mono text-white tracking-tight">
            {workingTimeStr}
          </span>
          {isCheckedIn && !isCheckedOut && (
            <span className="text-[9px] font-bold text-emerald-400/90 flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> Live Session Active
            </span>
          )}
        </div>
      </div>

      {/* Visual Timeline Bar */}
      <div className="pt-3 border-t border-white/10">
        <div className="flex items-center justify-between text-[10px] font-bold text-white/70 mb-1.5">
          <span>CHECK-IN</span>
          <span>{isCheckedOut ? 'CHECK-OUT' : isCheckedIn ? 'LIVE PROGRESS' : 'READY FOR DUTY'}</span>
        </div>

        <div className="relative w-full h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/10 flex items-center p-0.5">
          {isCheckedIn ? (
            <motion.div 
              initial={{ width: '5%' }}
              animate={{ width: isCheckedOut ? '100%' : '70%' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                isCheckedOut 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                  : 'bg-gradient-to-r from-emerald-500 via-purple-500 to-amber-400 animate-pulse'
              }`}
            />
          ) : (
            <div className="w-0 h-full bg-gray-600 rounded-full" />
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-white/60 mt-1.5">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 text-xs">
            {/* Check-in Location */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 space-y-0.5">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                <span>Check-in Location</span>
                <span className="font-mono text-emerald-300">{checkIn.time}</span>
              </div>
              <div className="text-white font-medium truncate flex items-center gap-1" title={checkIn.location}>
                <span className="text-emerald-400">📍</span> {checkIn.location}
              </div>
              {checkIn.distance && (
                <div className="text-[10px] text-white/70 font-mono">
                  {checkIn.distance}
                </div>
              )}
            </div>

            {/* Checkout Location */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 space-y-0.5">
              <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center justify-between">
                <span>Checkout Location</span>
                <span className="font-mono text-purple-200">{checkout.time}</span>
              </div>
              <div className={`font-medium truncate flex items-center gap-1 ${checkout.isUnresolved ? 'text-amber-300 font-bold' : 'text-white'}`} title={checkout.location}>
                <span className={checkout.isUnresolved ? 'text-amber-400' : 'text-purple-400'}>📍</span> {checkout.location}
              </div>
              {checkout.distance && (
                <div className="text-[10px] text-white/70 font-mono">
                  {checkout.distance}
                </div>
              )}
            </div>

            {/* Current (Live) Location */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 space-y-0.5">
              <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
                <span>Current Location</span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                  currentLoc.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse' :
                  currentLoc.status === 'RECENT' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                  currentLoc.status === 'STALE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                  'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {currentLoc.status}
                </span>
              </div>
              <div className="text-white font-medium truncate flex items-center gap-1" title={currentLoc.location}>
                <span className="text-cyan-400">📍</span> {currentLoc.location}
              </div>
              {currentLoc.distance && (
                <div className="text-[10px] text-white/70 font-mono">
                  Distance: {currentLoc.distance}
                </div>
              )}
              {currentLoc.statusText && (
                <div className="text-[9px] text-cyan-200/80 font-mono flex items-center gap-1">
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
