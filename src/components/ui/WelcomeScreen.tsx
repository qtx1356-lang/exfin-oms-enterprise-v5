import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, ArrowRight, UserCheck, Sparkles, Building2, CheckCircle2, Zap, Shield, Clock, Target, Lock, Check } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';
import { speakWelcomeGreeting } from '../../services/notification/alertSoundService';
import { GreetingPeriodKey } from '../../services/voice/greetingAssets';
import { getTodayAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr, parseAttendanceTimeToMinutes, getFormattedTimeStr } from '../../services/attendance/automaticAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';

interface WelcomeScreenProps {
  onProceed?: () => void;
}

const getTime = () => new Date().toISOString().substring(11, 23);

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onProceed }) => {
  const { status, employeeData } = useRegistration();
  const { locationStatus, distance, formattedDistance, isInsideGeofence, locationState, isGpsOff, isPermissionDenied, isLocationUnavailable } = useLocationContext();

  useEffect(() => {
    console.log(`[FLICKER-TRACE] WelcomeScreen MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] WelcomeScreen UNMOUNT ${getTime()}`);
  }, []);

  // Try reading cached employee data immediately from localStorage for 0ms render
  const [cachedName] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('cached_registration_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.name || '';
      }
    } catch (e) {}
    return '';
  });

  // Load today's authoritative attendance record
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [liveDuration, setLiveDuration] = useState<string>('');

  const refreshAttendance = React.useCallback(() => {
    if (!employeeData) return;
    const empId = employeeData.employeeCode || employeeData.uid || employeeData.id;
    const today = getFormattedDateStr();
    const record = getTodayAttendanceRecord(empId, today);
    setAttendance(record);
    
    // Diagnostic logging as requested
    console.log('[WelcomeAttendance]', {
      employeeCode: employeeData.employeeCode,
      todayDate: today,
      attendanceRecordFound: !!record,
      status: record?.currentState || record?.status || (record?.checkOutTime ? 'CHECKED_OUT' : (record?.checkInTime ? 'CHECKED_IN' : 'N/A')),
      checkInTime: record?.checkInTime,
      checkOutTime: record?.checkOutTime
    });
  }, [employeeData]);

  useEffect(() => {
    refreshAttendance();

    // Subscribe to attendance updates
    const handleUpdate = () => refreshAttendance();
    window.addEventListener('exfin-attendance-updated', handleUpdate);
    window.addEventListener('exfin-checkout-confirmation-needed', handleUpdate);
    
    // Fallback refresh on resume
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshAttendance();
    });
    window.addEventListener('focus', handleUpdate);
    window.addEventListener('online', handleUpdate);
    window.addEventListener('pageshow', handleUpdate);

    return () => {
      window.removeEventListener('exfin-attendance-updated', handleUpdate);
      window.removeEventListener('exfin-checkout-confirmation-needed', handleUpdate);
      window.removeEventListener('visibilitychange', handleUpdate);
      window.removeEventListener('focus', handleUpdate);
      window.removeEventListener('online', handleUpdate);
      window.removeEventListener('pageshow', handleUpdate);
    };
  }, [refreshAttendance]);

  // Live Duration Update
  useEffect(() => {
    if (!attendance || !attendance.checkInTime || attendance.checkOutTime) {
      setLiveDuration('');
      return;
    }

    const updateDuration = () => {
      const inMins = parseAttendanceTimeToMinutes(attendance.checkInTime);
      if (inMins === null) return;
      
      const now = new Date();
      // Use Asia/Kolkata minutes for "now" consistent with the engine
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false
        });
        const parts = formatter.formatToParts(now);
        const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
        const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
        const nowMins = h * 60 + m;
        
        let diff = nowMins - inMins;
        if (diff < 0) diff = 0; 
        
        const hh = Math.floor(diff / 60);
        const mm = diff % 60;
        setLiveDuration(`${hh}h ${mm}m`);
      } catch (e) {
        setLiveDuration('--');
      }
    };

    updateDuration();
    const interval = setInterval(updateDuration, 60000);
    return () => clearInterval(interval);
  }, [attendance]);

  useEffect(() => {
    logStartupTag('WELCOME_RENDER', 'Instant Welcome screen rendered on UI');
  }, []);

  const [greetingInfo] = useState<{ label: string; periodKey: GreetingPeriodKey }>(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { label: 'Good Morning', periodKey: 'good_morning' };
    if (hour >= 12 && hour < 17) return { label: 'Good Afternoon', periodKey: 'good_afternoon' };
    return { label: 'Good Evening', periodKey: 'good_evening' };
  });

  const displayName = employeeData?.name || cachedName;
  const isRegistered = status === 'Approved' || !!displayName;

  // Extract the employee's first name from the full name safely, filtering placeholders
  const firstName = React.useMemo(() => {
    if (!displayName) return null;
    const trimmed = displayName.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (
      lower === 'undefined' || 
      lower === 'null' || 
      lower === 'user' || 
      lower === 'employee' || 
      lower === 'admin'
    ) {
      return null;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 0) return null;

    const first = parts[0];
    const isTitle = /^(mr|ms|mrs|dr|prof)\.?$/i.test(first);
    if (isTitle && parts.length > 1) {
      return parts[1];
    }
    return first;
  }, [displayName]);

  useEffect(() => {
    logStartupTag('WELCOME_RENDER', 'Instant Welcome screen rendered on UI');
    try {
      const sessionKey = 'exfin_session_greeting_played';
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');

        // Trigger personalized native voice greeting with the first name if available
        const greetingSentence = firstName ? `${greetingInfo.label}, ${firstName}.` : `${greetingInfo.label}.`;
        speakWelcomeGreeting(greetingSentence, greetingInfo.periodKey);
      }
    } catch (e) {
      console.warn('[WelcomeScreen] Greeting initialization error:', e);
    }
  }, [firstName, greetingInfo.periodKey, greetingInfo.label]);

  // Derive Location & Distance display states dynamically
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isLocationLoading = locationStatus === 'loading' && distance === null && !isOffline;
  const isLocationError = (locationStatus === 'error' || isPermissionDenied || isGpsOff || isLocationUnavailable || isOffline) && distance === null;

  return (
    <div className="fixed inset-0 bg-[#071A2B] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#F8FAFC] overflow-y-auto relative overflow-hidden">
      {/* Subtle Teal/Emerald Atmospheric Gradient Glow */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[#10B981]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[#0A2638]/60 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon (Verified User Icon) */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[#10B981]/30 bg-[#092438]/80 backdrop-blur-[14px] flex items-center justify-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#0D3045] border border-[#10B981]/50 flex items-center justify-center shadow-lg">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#10B981]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#10B981]" />
              )}
            </div>
          </div>
        </div>

        {/* Time-Aware Greeting & Employee Name */}
        <div className="flex flex-col items-center text-center">
          <div className="text-[#94A3B8] text-sm sm:text-base font-semibold tracking-wide flex items-center justify-center gap-1.5">
            <span className="text-[#10B981] text-xl">☀️</span>
            <span>{greetingInfo.label} 👋</span>
          </div>

          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight leading-tight uppercase">
            {status === 'unregistered' ? (
              <>Register Device</>
            ) : (
              <>{displayName || 'SANJIV SINHA'}</>
            )}
          </h1>
          <p className="mt-2 text-[11px] font-bold text-[#10B981] tracking-widest uppercase">
            EXFIN OMS • SMART APP
          </p>
        </div>

        {/* 1. Automatic Attendance Card */}
        <div className="w-full py-4 px-4 bg-[#0D3045] border border-[#16465A] rounded-2xl flex flex-col items-center text-center shadow-lg">
          <p className="text-xs sm:text-sm font-bold text-[#10B981] tracking-wider flex items-center justify-center gap-1.5 uppercase">
            <Sparkles className="w-4 h-4 text-[#10B981] shrink-0" />
            <span>AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1 font-medium">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* 2. Location / Attendance Intelligence Card */}
        <div className="w-full bg-[#0D3045] p-5 rounded-2xl border border-[#16465A] text-center shadow-xl">
          {/* Header Centered */}
          <div className="flex items-center justify-center gap-2 mb-4 border-b border-[#16465A] pb-3">
            <MapPin className="w-4 h-4 text-[#F43F5E]" />
            <span className="text-xs font-black uppercase tracking-widest text-[#94A3B8]">
              LOCATION INTELLIGENCE
            </span>
          </div>

          {/* 2-Column Metric Layout - All Centered */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            
            {/* Left Top: Status */}
            <div className="flex flex-col items-center text-center space-y-1">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                STATUS
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-bold text-[#94A3B8] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-bold text-[#94A3B8] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-bold text-[#10B981] flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> INSIDE
                </span>
              ) : (
                <span className="text-sm font-bold text-[#F43F5E] flex items-center justify-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0" /> OUTSIDE
                </span>
              )}
            </div>

            {/* Right Top: Distance */}
            <div className="flex flex-col items-center text-center space-y-1 border-l border-[#16465A] pl-4">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                DISTANCE
              </span>
              {distance !== null ? (
                <span className="text-sm font-bold text-[#F8FAFC] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-bold text-[#94A3B8] block">
                  Locating...
                </span>
              ) : isGpsOff || isPermissionDenied || isLocationError ? (
                <span className="text-sm font-bold text-[#F59E0B] block leading-tight">
                  GPS unavailable
                </span>
              ) : (
                <span className="text-sm font-bold text-[#F43F5E] block leading-tight">
                  Unavailable
                </span>
              )}
            </div>

            {/* Left Bottom: Radius */}
            <div className="flex flex-col items-center text-center space-y-1 pt-3 border-t border-[#16465A]">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                RADIUS
              </span>
              <span className="text-sm font-bold text-[#F8FAFC] block">
                25 m
              </span>
            </div>

            {/* Right Bottom: Attendance (Replaced Geofence with dynamic latest check-in/out) */}
            <div className="flex flex-col items-center text-center space-y-1 pt-3 border-t border-l border-[#16465A] pl-4">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                ATTENDANCE
              </span>
              {!attendance ? (
                <>
                  <span className="text-xs font-bold text-[#94A3B8] block leading-snug">
                    Attendance
                  </span>
                  <span className="text-[11px] font-medium text-[#94A3B8] block leading-tight">
                    No attendance yet
                  </span>
                </>
              ) : attendance.checkOutTime ? (
                <>
                  <span className="text-xs font-bold text-[#F43F5E] block leading-snug">
                    CHECKED OUT
                  </span>
                  <div className="text-[10px] text-[#F8FAFC] flex flex-col gap-0.5 mt-0.5">
                    <span>In: {attendance.checkInTime}</span>
                    <span>Out: {attendance.checkOutTime}</span>
                    <span className="text-[#10B981] font-bold">Total: {attendance.workingHours || '--'}</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-[#10B981] block leading-snug">
                    CHECKED IN
                  </span>
                  <div className="text-[10px] text-[#F8FAFC] flex flex-col gap-0.5 mt-0.5">
                    <span>In: {attendance.checkInTime}</span>
                    <span className="text-cyan-400 font-bold">Duration: {liveDuration || '--'}</span>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {/* 3. Feature Card (4 equal-width features: Secure, Smart, Precise, Verified) */}
        <div className="w-full bg-[#0D3045] p-4 rounded-2xl grid grid-cols-4 gap-2 text-center shadow-lg border border-[#16465A]">
          {/* Secure Tile */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-[#092438] text-[#10B981] flex items-center justify-center mb-1 border border-[#16465A]">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Secure</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-[#092438] text-[#22D3EE] flex items-center justify-center mb-1 border border-[#16465A]">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Smart</span>
          </div>

          {/* Precise Tile */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-[#092438] text-[#22D3EE] flex items-center justify-center mb-1 border border-[#16465A]">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Precise</span>
          </div>

          {/* Verified Tile */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-[#092438] text-[#10B981] flex items-center justify-center mb-1 border border-[#16465A]">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Verified</span>
          </div>
        </div>

      </div>

      {/* 4. Enter Workspace Button */}
      <div className="w-full max-w-sm pt-2 pb-4 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[56px] py-4 px-6 bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-white font-black uppercase tracking-[0.1em] text-sm sm:text-base rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/20 active:scale-[0.98]"
        >
          <span>{status === 'unregistered' ? 'Proceed to Setup' : 'Enter Workspace'}</span>
          <ArrowRight className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
};

