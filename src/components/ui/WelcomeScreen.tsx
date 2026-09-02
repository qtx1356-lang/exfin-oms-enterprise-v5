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
    <div className="welcome-screen-scope fixed inset-0 bg-[#071A2B] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#F8FAFC] overflow-y-auto relative overflow-hidden">
      {/* Scoped Styling for Welcome Screen Visual Upgrades */}
      <style>{`
        .welcome-screen-scope {
          background-color: #071A2B !important;
          color: #F8FAFC !important;
        }

        .welcome-card {
          background: linear-gradient(180deg, #0D2B40 0%, #081D2C 100%) !important;
          border: 1.5px solid rgba(34, 211, 238, 0.35) !important;
          box-shadow: 0 12px 32px rgba(3, 12, 22, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
          position: relative;
          overflow: hidden;
        }

        .welcome-card-active {
          border-color: rgba(16, 185, 129, 0.45) !important;
          box-shadow: 0 12px 32px rgba(3, 12, 22, 0.65), 0 0 18px rgba(16, 185, 129, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
        }

        .welcome-inner-tile {
          background: rgba(8, 30, 46, 0.85) !important;
          border: 1px solid rgba(34, 211, 238, 0.25) !important;
        }

        @keyframes welcomeBorderMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }

        .welcome-border-light {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent 0%, rgba(34, 211, 238, 0.85) 50%, transparent 100%);
          animation: welcomeBorderMove 5s linear infinite;
          pointer-events: none;
        }

        @keyframes welcomeDotPulse {
          0%, 100% { opacity: 0.6; transform: scale(0.95); box-shadow: 0 0 4px rgba(16, 185, 129, 0.4); }
          50% { opacity: 1; transform: scale(1.2); box-shadow: 0 0 10px #10B981; }
        }

        .welcome-status-dot {
          animation: welcomeDotPulse 2s ease-in-out infinite;
        }

        @keyframes welcomeAvatarRingPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; box-shadow: 0 0 10px rgba(34, 211, 238, 0.2); }
          50% { transform: scale(1.08); opacity: 0.95; box-shadow: 0 0 22px rgba(34, 211, 238, 0.45); }
        }

        .welcome-avatar-ring {
          animation: welcomeAvatarRingPulse 3.5s ease-in-out infinite;
        }

        @keyframes welcomeRadarExpand {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        .welcome-radar-ring {
          animation: welcomeRadarExpand 3s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }

        @keyframes welcomeInsideGlow {
          0%, 100% { transform: scale(1); opacity: 0.4; filter: blur(3px); }
          50% { transform: scale(1.35); opacity: 0.85; filter: blur(6px); }
        }

        .welcome-inside-glow {
          animation: welcomeInsideGlow 2.5s ease-in-out infinite;
        }

        @keyframes welcomeScanLine {
          0% { top: -10%; opacity: 0; }
          15% { opacity: 0.2; }
          85% { opacity: 0.2; }
          100% { top: 110%; opacity: 0; }
        }

        .welcome-scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, #22D3EE, transparent);
          animation: welcomeScanLine 6s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes welcomeIconPulse {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); filter: drop-shadow(0 0 6px #10B981); }
        }

        .welcome-sparkle-pulse {
          animation: welcomeIconPulse 3s ease-in-out infinite;
        }

        @keyframes welcomeTilePulse {
          0%, 100% { border-color: rgba(34, 211, 238, 0.25); box-shadow: none; }
          50% { border-color: rgba(34, 211, 238, 0.6); box-shadow: 0 0 12px rgba(34, 211, 238, 0.22); }
        }

        .welcome-tile-1 { animation: welcomeTilePulse 4s ease-in-out infinite 0s; }
        .welcome-tile-2 { animation: welcomeTilePulse 4s ease-in-out infinite 0.8s; }
        .welcome-tile-3 { animation: welcomeTilePulse 4s ease-in-out infinite 1.6s; }
        .welcome-tile-4 { animation: welcomeTilePulse 4s ease-in-out infinite 2.4s; }

        @keyframes welcomeShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(220%); }
        }

        .welcome-btn-shimmer {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 35%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transform: skewX(-20deg);
          animation: welcomeShimmer 4s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes welcomeFloatParticle {
          0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.25; }
          50% { transform: translateY(-12px) translateX(8px); opacity: 0.55; }
        }

        .welcome-p1 { animation: welcomeFloatParticle 7s ease-in-out infinite 0s; }
        .welcome-p2 { animation: welcomeFloatParticle 9s ease-in-out infinite 2s; }
        .welcome-p3 { animation: welcomeFloatParticle 8s ease-in-out infinite 4s; }

        @media (prefers-reduced-motion: reduce) {
          .welcome-border-light,
          .welcome-status-dot,
          .welcome-avatar-ring,
          .welcome-radar-ring,
          .welcome-inside-glow,
          .welcome-scan-line,
          .welcome-sparkle-pulse,
          .welcome-tile-1,
          .welcome-tile-2,
          .welcome-tile-3,
          .welcome-tile-4,
          .welcome-btn-shimmer,
          .welcome-p1,
          .welcome-p2,
          .welcome-p3 {
            animation: none !important;
            opacity: 0.4 !important;
          }
        }
      `}</style>

      {/* Atmospheric Background Lights */}
      <div className="fixed top-16 right-8 w-[450px] h-[450px] bg-[#10B981]/12 rounded-full blur-[130px] pointer-events-none -z-10" />
      <div className="fixed bottom-16 left-6 w-[400px] h-[400px] bg-[#22D3EE]/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      
      {/* Decorative Ambient Floating Points */}
      <div className="welcome-p1 fixed top-1/4 left-8 w-1.5 h-1.5 bg-[#22D3EE] rounded-full blur-[1px] pointer-events-none -z-10" />
      <div className="welcome-p2 fixed top-1/2 right-10 w-2 h-2 bg-[#10B981] rounded-full blur-[1px] pointer-events-none -z-10" />
      <div className="welcome-p3 fixed bottom-1/3 left-12 w-1.5 h-1.5 bg-[#3B82F6] rounded-full blur-[1px] pointer-events-none -z-10" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Avatar with Smart Ring */}
        <div className="relative flex items-center justify-center my-1">
          <div className="welcome-avatar-ring absolute w-24 h-24 rounded-full border border-[#22D3EE]/50 pointer-events-none" />
          <div className="w-20 h-20 rounded-full border-1.5 border-[#10B981]/60 bg-[#092438] flex items-center justify-center shadow-2xl relative z-10">
            <div className="w-16 h-16 rounded-full bg-[#0D3045] border border-[#10B981]/60 flex items-center justify-center shadow-lg">
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
          
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <span className="welcome-status-dot w-2 h-2 rounded-full bg-[#10B981] inline-block" />
            <p className="text-[11px] font-bold text-[#10B981] tracking-widest uppercase">
              EXFIN OMS • SMART APP
            </p>
          </div>
        </div>

        {/* 1. Automatic Attendance Card */}
        <div className="welcome-card w-full py-4 px-4 rounded-2xl flex flex-col items-center text-center shadow-xl relative">
          <div className="welcome-border-light" />
          <p className="text-xs sm:text-sm font-bold text-[#10B981] tracking-wider flex items-center justify-center gap-1.5 uppercase">
            <Sparkles className="welcome-sparkle-pulse w-4 h-4 text-[#10B981] shrink-0" />
            <span>AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[11px] text-[#94A3B8] mt-1 font-medium">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* 2. Location / Attendance Intelligence Card */}
        <div className="welcome-card welcome-card-active w-full p-5 rounded-2xl text-center shadow-2xl relative">
          <div className="welcome-border-light" />
          <div className="welcome-scan-line" />

          {/* Header Centered */}
          <div className="flex items-center justify-center gap-2 mb-4 border-b border-[#22D3EE]/25 pb-3">
            <div className="relative flex items-center justify-center">
              <div className="welcome-radar-ring absolute w-5 h-5 rounded-full border border-[#F43F5E] pointer-events-none" />
              <MapPin className="w-4 h-4 text-[#F43F5E] relative z-10 shrink-0" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-[#22D3EE]">
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
                <span className="text-sm font-bold text-[#10B981] flex items-center justify-center gap-1.5">
                  <div className="relative flex items-center justify-center">
                    <div className="welcome-inside-glow absolute w-3.5 h-3.5 rounded-full bg-[#10B981]" />
                    <CheckCircle2 className="w-4 h-4 shrink-0 relative z-10 text-[#10B981]" />
                  </div>
                  <span>INSIDE</span>
                </span>
              ) : (
                <span className="text-sm font-bold text-[#F43F5E] flex items-center justify-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0" /> OUTSIDE
                </span>
              )}
            </div>

            {/* Right Top: Distance */}
            <div className="flex flex-col items-center text-center space-y-1 border-l border-[#22D3EE]/20 pl-4">
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
            <div className="flex flex-col items-center text-center space-y-1 pt-3 border-t border-[#22D3EE]/20">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                RADIUS
              </span>
              <span className="text-sm font-bold text-[#F8FAFC] block">
                25 m
              </span>
            </div>

            {/* Right Bottom: Attendance */}
            <div className="flex flex-col items-center text-center space-y-1 pt-3 border-t border-l border-[#22D3EE]/20 pl-4">
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
        <div className="welcome-card w-full p-3.5 rounded-2xl grid grid-cols-4 gap-2 text-center shadow-xl relative">
          <div className="welcome-border-light" />

          {/* Secure Tile */}
          <div className="welcome-inner-tile welcome-tile-1 flex flex-col items-center justify-center p-2 rounded-xl transition-all">
            <div className="w-7 h-7 rounded-lg bg-[#071A2B] text-[#10B981] flex items-center justify-center mb-1 border border-[#10B981]/40">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Secure</span>
          </div>

          {/* Smart Tile */}
          <div className="welcome-inner-tile welcome-tile-2 flex flex-col items-center justify-center p-2 rounded-xl transition-all">
            <div className="w-7 h-7 rounded-lg bg-[#071A2B] text-[#22D3EE] flex items-center justify-center mb-1 border border-[#22D3EE]/40">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Smart</span>
          </div>

          {/* Precise Tile */}
          <div className="welcome-inner-tile welcome-tile-3 flex flex-col items-center justify-center p-2 rounded-xl transition-all">
            <div className="w-7 h-7 rounded-lg bg-[#071A2B] text-[#22D3EE] flex items-center justify-center mb-1 border border-[#22D3EE]/40">
              <Target className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Precise</span>
          </div>

          {/* Verified Tile */}
          <div className="welcome-inner-tile welcome-tile-4 flex flex-col items-center justify-center p-2 rounded-xl transition-all">
            <div className="w-7 h-7 rounded-lg bg-[#071A2B] text-[#10B981] flex items-center justify-center mb-1 border border-[#10B981]/40">
              <Check className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">Verified</span>
          </div>
        </div>

      </div>

      {/* 4. Enter Workspace Button */}
      <div className="w-full max-w-sm pt-2 pb-4 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[56px] py-4 px-6 bg-gradient-to-r from-[#10B981] via-[#0EA5E9] to-[#22D3EE] text-white font-black uppercase tracking-[0.1em] text-sm sm:text-base rounded-2xl shadow-[0_10px_28px_rgba(16,185,129,0.35)] flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/30 active:scale-[0.98] relative overflow-hidden"
        >
          <div className="welcome-btn-shimmer" />
          <span className="relative z-10">{status === 'unregistered' ? 'Proceed to Setup' : 'Enter Workspace'}</span>
          <ArrowRight className="w-5 h-5 text-white relative z-10" />
        </button>
      </div>
    </div>
  );
};


