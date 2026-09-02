import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, ArrowRight, UserCheck, Sparkles, Building2, CheckCircle2, Zap, Shield, Clock, Target, Lock, Check, Volume2 } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';
import { initializeSpeech, speakGreeting, stopGreeting, isSpeechAvailable } from '../../services/speech/greetingSpeechService';
import { playGreetingAudio, preloadGreetingAudio, stopGreetingAudio } from '../../services/audio/greetingAudioService';
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
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const speechTriggeredRef = React.useRef<boolean>(false);

  const refreshAttendance = React.useCallback(() => {
    if (!employeeData) return;
    const empId = employeeData.employeeCode || employeeData.uid || employeeData.id;
    const today = getFormattedDateStr();
    const record = getTodayAttendanceRecord(empId, today);
    setAttendance(record);
    
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

  const [greetingInfo] = useState<{ label: string; periodKey: GreetingPeriodKey }>(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { label: 'Good Morning', periodKey: 'good_morning' };
    if (hour >= 12 && hour < 17) return { label: 'Good Afternoon', periodKey: 'good_afternoon' };
    return { label: 'Good Evening', periodKey: 'good_evening' };
  });

  const displayName = employeeData?.name || cachedName;
  const isRegistered = status === 'Approved' || !!displayName;

  // Extract employee's first name safely
  const firstName = React.useMemo(() => {
    if (!displayName) return null;
    const trimmed = displayName.trim();
    if (!trimmed) return null;

    const lower = trimmed.toLowerCase();
    if (['undefined', 'null', 'user', 'employee', 'admin'].includes(lower)) {
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

  // Voice initialization & Audio handlers
  useEffect(() => {
    preloadGreetingAudio();
    const cleanupSpeech = initializeSpeech();
    return () => {
      cleanupSpeech();
      stopGreeting();
      stopGreetingAudio();
    };
  }, []);

  const handleSpeakerTap = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Stop any in-flight SpeechSynthesis immediately
    stopGreeting();
    // Synchronously initiate local bundled WAV audio playback
    setIsSpeaking(true);
    playGreetingAudio(greetingInfo.periodKey, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  }, [greetingInfo.periodKey]);

  const handleSpeakGreeting = React.useCallback((isUserGesture = false) => {
    const greetingSentence = firstName ? `${greetingInfo.label}, ${firstName}.` : `${greetingInfo.label}.`;
    speakGreeting(greetingSentence, {
      isUserGesture,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  }, [firstName, greetingInfo.label]);

  useEffect(() => {
    logStartupTag('WELCOME_RENDER', 'Instant Welcome screen rendered on UI');
    const sessionKey = 'exfin_welcome_speech_spoken_session';

    if (!speechTriggeredRef.current && !sessionStorage.getItem(sessionKey)) {
      speechTriggeredRef.current = true;
      sessionStorage.setItem(sessionKey, 'true');

      // Attempt automatic speech greeting on entry
      handleSpeakGreeting(false);
    }
  }, [handleSpeakGreeting]);

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

        @keyframes welcomeRobotFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-7px); }
        }

        .welcome-robot-float {
          animation: welcomeRobotFloat 4s ease-in-out infinite;
        }

        @keyframes welcomeRobotHeadTilt {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(2.5deg); }
        }

        .welcome-robot-head {
          animation: welcomeRobotHeadTilt 6s ease-in-out infinite;
        }

        @keyframes welcomeRobotArmWave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-14deg); }
          75% { transform: rotate(8deg); }
        }

        .welcome-robot-arm-wave {
          animation: welcomeRobotArmWave 5s ease-in-out infinite;
        }

        @keyframes welcomeRobotEyeGlow {
          0%, 88%, 100% { opacity: 0.9; transform: scaleY(1); }
          94% { opacity: 0.2; transform: scaleY(0.15); }
        }

        .welcome-robot-eyes {
          animation: welcomeRobotEyeGlow 4.5s ease-in-out infinite;
        }

        @keyframes welcomeRobotCorePulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50% { transform: scale(1.25); opacity: 1; }
        }

        .welcome-robot-core {
          animation: welcomeRobotCorePulse 2.5s ease-in-out infinite;
        }

        @keyframes robotHudSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes welcomeWavebar {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
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
          .welcome-p3,
          .welcome-robot-float,
          .welcome-robot-head,
          .welcome-robot-arm-wave,
          .welcome-robot-eyes,
          .welcome-robot-core {
            animation: none !important;
            opacity: 0.5 !important;
          }
        }
      `}</style>

      {/* Atmospheric Background Lights */}
      <div className="fixed top-12 right-6 w-[450px] h-[450px] bg-[#10B981]/12 rounded-full blur-[130px] pointer-events-none -z-10" />
      <div className="fixed bottom-12 left-4 w-[400px] h-[400px] bg-[#22D3EE]/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      
      {/* Decorative Ambient Floating Points */}
      <div className="welcome-p1 fixed top-1/4 left-8 w-1.5 h-1.5 bg-[#22D3EE] rounded-full blur-[1px] pointer-events-none -z-10" />
      <div className="welcome-p2 fixed top-1/2 right-10 w-2 h-2 bg-[#10B981] rounded-full blur-[1px] pointer-events-none -z-10" />
      <div className="welcome-p3 fixed bottom-1/3 left-12 w-1.5 h-1.5 bg-[#3B82F6] rounded-full blur-[1px] pointer-events-none -z-10" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-4">
        
        {/* Top Hero: Animated Smart Assistant Robot & Speech Bubble */}
        <div className="flex flex-col items-center text-center my-0.5 relative z-10">
          
          {/* Futuristic Speech Bubble */}
          <div className="mb-2 px-3.5 py-1.5 rounded-2xl bg-[#092438]/90 border border-[#22D3EE]/50 shadow-[0_0_18px_rgba(34,211,238,0.25)] backdrop-blur-md flex items-center gap-2 relative">
            <span className="text-xs font-black text-[#22D3EE] tracking-wide uppercase">
              {greetingInfo.label}!
            </span>

            {/* Animated Audio Waveform Equalizer when speaking */}
            <div className="flex items-center gap-1 h-4 px-0.5" title={isSpeaking ? "Assistant Speaking" : "Assistant Ready"}>
              <span className={`w-0.5 bg-[#10B981] rounded-full transition-all ${isSpeaking ? 'h-3.5 animate-[welcomeWavebar_0.5s_ease-in-out_infinite]' : 'h-1.5'}`} />
              <span className={`w-0.5 bg-[#22D3EE] rounded-full transition-all ${isSpeaking ? 'h-4 animate-[welcomeWavebar_0.5s_ease-in-out_infinite_0.15s]' : 'h-2.5'}`} />
              <span className={`w-0.5 bg-[#10B981] rounded-full transition-all ${isSpeaking ? 'h-3 animate-[welcomeWavebar_0.5s_ease-in-out_infinite_0.3s]' : 'h-1.5'}`} />
            </div>

            {/* Speaker Button (Explicit Tap to Play Bundled Greeting Audio) */}
            <button
              type="button"
              onClick={handleSpeakerTap}
              className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full border transition-all duration-300 flex items-center justify-center shrink-0 cursor-pointer ${
                isSpeaking
                  ? 'bg-[#10B981]/25 border-[#10B981] text-[#10B981] shadow-[0_0_12px_rgba(16,185,129,0.6)] scale-110'
                  : 'bg-[#092438] border-[#22D3EE]/40 text-[#22D3EE] hover:border-[#22D3EE] hover:text-[#38BDF8] hover:shadow-[0_0_10px_rgba(34,211,238,0.35)] active:scale-95'
              }`}
              title="Tap to hear greeting"
              aria-label="Tap to hear greeting audio"
            >
              <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-pulse' : ''}`} />
            </button>

            {/* Pointer Arrow */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#092438] border-r border-b border-[#22D3EE]/50 rotate-45" />
          </div>

          {/* Animated Smart Robot SVG Container */}
          <div className="relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32">
            {/* Background HUD Rings */}
            <div className="absolute inset-0 rounded-full border border-dashed border-[#22D3EE]/35 animate-[robotHudSpin_20s_linear_infinite] pointer-events-none" />
            <div className="absolute inset-2 rounded-full border border-dotted border-[#10B981]/30 animate-[robotHudSpin_15s_linear_infinite_reverse] pointer-events-none" />
            <div className="absolute w-24 h-24 bg-[#22D3EE]/15 rounded-full blur-xl pointer-events-none" />

            <svg
              viewBox="0 0 160 160"
              className="w-28 h-28 sm:w-32 sm:h-32 relative z-10 drop-shadow-[0_8px_22px_rgba(34,211,238,0.3)]"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="robotBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1E3A8A" />
                  <stop offset="50%" stopColor="#0F172A" />
                  <stop offset="100%" stopColor="#0B1329" />
                </linearGradient>
                <linearGradient id="visorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0284C7" />
                  <stop offset="50%" stopColor="#0369A1" />
                  <stop offset="100%" stopColor="#082F49" />
                </linearGradient>
                <linearGradient id="armGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#0284C7" />
                </linearGradient>
                <filter id="cyanGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <g className="welcome-robot-float">
                <ellipse cx="80" cy="150" rx="28" ry="5" fill="#030E17" opacity="0.6" />

                {/* Torso */}
                <path
                  d="M 52 90 C 52 82, 108 82, 108 90 L 102 124 C 102 130, 58 130, 58 124 Z"
                  fill="url(#robotBodyGrad)"
                  stroke="#22D3EE"
                  strokeWidth="1.5"
                />
                <circle cx="80" cy="104" r="8" fill="#092438" stroke="#10B981" strokeWidth="1.5" />
                <circle cx="80" cy="104" r="4" fill="#10B981" className="welcome-robot-core" filter="url(#cyanGlow)" />

                {/* Shoulders */}
                <circle cx="50" cy="92" r="5" fill="#1E293B" stroke="#22D3EE" strokeWidth="1" />
                <circle cx="110" cy="92" r="5" fill="#1E293B" stroke="#22D3EE" strokeWidth="1" />

                {/* Left Arm */}
                <path d="M 47 94 C 40 102, 42 115, 45 120" fill="none" stroke="url(#armGrad)" strokeWidth="4" strokeLinecap="round" />
                <circle cx="45" cy="121" r="3" fill="#22D3EE" />

                {/* Right Arm Waving */}
                <g className="welcome-robot-arm-wave" style={{ transformOrigin: '110px 92px' }}>
                  <path d="M 113 94 C 122 100, 126 108, 128 116" fill="none" stroke="url(#armGrad)" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="128" cy="117" r="3.5" fill="#22D3EE" filter="url(#cyanGlow)" />
                  <path d="M 126 114 L 131 113 M 128 117 L 132 117 M 127 120 L 131 120" stroke="#38BDF8" strokeWidth="1.2" strokeLinecap="round" />
                </g>

                {/* Head */}
                <g className="welcome-robot-head" style={{ transformOrigin: '80px 75px' }}>
                  <line x1="80" y1="36" x2="80" y2="24" stroke="#22D3EE" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="80" cy="22" r="3.5" fill="#10B981" className="welcome-robot-core" filter="url(#cyanGlow)" />

                  <rect x="52" y="34" width="56" height="46" rx="23" fill="url(#robotBodyGrad)" stroke="#22D3EE" strokeWidth="1.5" />
                  <rect x="57" y="42" width="46" height="30" rx="13" fill="url(#visorGrad)" stroke="#0ea5e9" strokeWidth="1" />
                  <path d="M 62 46 C 72 44, 88 44, 98 46" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.3" strokeLinecap="round" />

                  {/* Digital Eyes */}
                  <g className="welcome-robot-eyes">
                    <ellipse cx="70" cy="56" rx="5" ry="6" fill="#22D3EE" filter="url(#cyanGlow)" />
                    <ellipse cx="69" cy="54" rx="1.5" ry="2" fill="#FFFFFF" />

                    <ellipse cx="90" cy="56" rx="5" ry="6" fill="#22D3EE" filter="url(#cyanGlow)" />
                    <ellipse cx="89" cy="54" rx="1.5" ry="2" fill="#FFFFFF" />
                  </g>

                  <path d="M 75 66 Q 80 69 85 66" fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />
                </g>
              </g>
            </svg>
          </div>
        </div>

        {/* Time-Aware Greeting & Employee Name */}
        <div className="flex flex-col items-center text-center">
          <div className="text-[#94A3B8] text-sm sm:text-base font-semibold tracking-wide flex items-center justify-center gap-1.5">
            <span className="text-[#10B981] text-xl">☀️</span>
            <span>{greetingInfo.label} 👋</span>
          </div>

          <h1 className="mt-0.5 text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight leading-tight uppercase">
            {status === 'unregistered' ? (
              <>Register Device</>
            ) : (
              <>{displayName || 'SANJIV SINHA'}</>
            )}
          </h1>
          
          <div className="mt-1.5 flex items-center justify-center gap-1.5">
            <span className="welcome-status-dot w-2 h-2 rounded-full bg-[#10B981] inline-block" />
            <p className="text-[11px] font-bold text-[#10B981] tracking-widest uppercase">
              EXFIN OMS • SMART APP
            </p>
          </div>
        </div>

        {/* 1. Automatic Attendance Card */}
        <div className="welcome-card w-full py-3.5 px-4 rounded-2xl flex flex-col items-center text-center shadow-xl relative">
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
        <div className="welcome-card welcome-card-active w-full p-4 sm:p-5 rounded-2xl text-center shadow-2xl relative">
          <div className="welcome-border-light" />
          <div className="welcome-scan-line" />

          {/* Header Centered */}
          <div className="flex items-center justify-center gap-2 mb-3.5 border-b border-[#22D3EE]/25 pb-2.5">
            <div className="relative flex items-center justify-center">
              <div className="welcome-radar-ring absolute w-5 h-5 rounded-full border border-[#F43F5E] pointer-events-none" />
              <MapPin className="w-4 h-4 text-[#F43F5E] relative z-10 shrink-0" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-[#22D3EE]">
              LOCATION INTELLIGENCE
            </span>
          </div>

          {/* 2-Column Metric Layout - All Centered */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
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
            <div className="flex flex-col items-center text-center space-y-1 pt-2.5 border-t border-[#22D3EE]/20">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                RADIUS
              </span>
              <span className="text-sm font-bold text-[#F8FAFC] block">
                25 m
              </span>
            </div>

            {/* Right Bottom: Attendance */}
            <div className="flex flex-col items-center text-center space-y-1 pt-2.5 border-t border-l border-[#22D3EE]/20 pl-4">
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
        <div className="welcome-card w-full p-3 rounded-2xl grid grid-cols-4 gap-1.5 text-center shadow-xl relative">
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


