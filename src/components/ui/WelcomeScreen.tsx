import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, ArrowRight, UserCheck, Sparkles, Building2, CheckCircle2, Zap, Shield, Clock, Target, Lock, Check } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';
import { speakWelcomeGreeting } from '../../services/notification/alertSoundService';
import { GreetingPeriodKey } from '../../services/voice/greetingAssets';

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

  const [showAlertToast, setShowAlertToast] = useState(false);

  useEffect(() => {
    logStartupTag('WELCOME_RENDER', 'Instant Welcome screen rendered on UI');
    if (firstName) {
      try {
        const sessionKey = `exfin_greeting_shown_${greetingInfo.periodKey}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, 'true');
          setShowAlertToast(true);

          // Trigger high-quality studio female voice greeting with the first name
          const greetingSentence = `${greetingInfo.label}, ${firstName}.`;
          speakWelcomeGreeting(greetingSentence, greetingInfo.periodKey);

          const t = setTimeout(() => setShowAlertToast(false), 4000);
          return () => clearTimeout(t);
        }
      } catch (e) {}
    }
  }, [firstName, greetingInfo.periodKey, greetingInfo.label]);

  // Derive Location & Distance display states dynamically
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isLocationLoading = locationStatus === 'loading' && distance === null && !isOffline;
  const isLocationError = (locationStatus === 'error' || isPermissionDenied || isGpsOff || isLocationUnavailable || isOffline) && distance === null;

  return (
    <div className="fixed inset-0 bg-[var(--app-bg)] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[var(--text-primary)] overflow-y-auto relative overflow-hidden">
      {/* Time-of-Day Welcome Alert Toast */}
      {showAlertToast && (
        <div className="absolute top-4 left-4 right-4 z-50 mx-auto max-w-sm glass-card-elevated border-[var(--aurora-emerald)]/40 p-4 flex items-center gap-3 backdrop-blur-xl">
          <div className="w-10 h-10 rounded-xl bg-[var(--aurora-emerald)]/10 border border-[var(--aurora-emerald)]/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[var(--aurora-emerald)]" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-bold text-[var(--aurora-emerald)] uppercase tracking-wider">Welcome Alert</p>
            <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
              {greetingInfo.label}, {displayName || 'Executive'}!
            </p>
          </div>
        </div>
      )}

      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--aurora-teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[var(--aurora-emerald)]/30 bg-[var(--card-surface)]/80 backdrop-blur-[14px] flex items-center justify-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[var(--card-bg)] border border-[var(--aurora-emerald)]/50 flex items-center justify-center shadow-lg">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[var(--aurora-emerald)]" />
              ) : (
                <Building2 className="w-8 h-8 text-[var(--aurora-emerald)]" />
              )}
            </div>
          </div>
        </div>

        {/* Time-Aware Greeting */}
        <div>
          <div className="text-[var(--text-secondary)] text-sm sm:text-base font-semibold tracking-wide flex items-center justify-center gap-1.5">
            <span className="text-[var(--aurora-emerald)] text-xl">☀️</span>
            <span>{greetingInfo.label}</span>
          </div>

          {/* Employee Welcome */}
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-tight uppercase aurora-text">
            {displayName ? (
              <>
                <span className="block text-lg sm:text-xl font-bold text-[var(--text-secondary)]">Welcome back,</span>
                <span className="text-[var(--text-primary)] font-extrabold text-2xl sm:text-3xl block mt-0.5">
                  {displayName}
                </span>
              </>
            ) : status === 'unregistered' ? (
              <>Register Device</>
            ) : (
              <>Welcome to Workspace</>
            )}
          </h1>
          <p className="text-[11px] font-bold text-[var(--aurora-emerald)] tracking-widest uppercase mt-2">
            EXFIN OMS • EMERALD AURORA
          </p>
        </div>

        {/* Automation Banner Card */}
        <div className="w-full py-4 px-4 glass-card border-[var(--aurora-emerald)]/20 text-center shadow-lg">
          <p className="text-xs sm:text-sm font-bold text-[var(--aurora-emerald)] tracking-wider flex items-center justify-center gap-1.5 uppercase">
            <Sparkles className="w-4 h-4 text-[var(--aurora-emerald)] shrink-0" />
            <span>AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1 font-medium italic">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full glass-card-elevated p-5 rounded-2xl border text-left shadow-xl transition-all ${
          isLocationLoading
            ? 'border-[var(--border)]'
            : isInsideGeofence
              ? 'border-[var(--success)]/40 aurora-glow-emerald'
              : 'border-[var(--danger)]/40 aurora-glow-teal opacity-90'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-3">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[var(--aurora-emerald)]' : isInsideGeofence ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`} />
            <span className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">
              Location Intelligence
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-bold text-[var(--text-secondary)] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-bold text-[var(--text-secondary)] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-bold text-[var(--success)] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> IN OFFICE
                </span>
              ) : (
                <span className="text-sm font-bold text-[var(--danger)] flex items-center gap-1">
                  <MapPin className="w-4 h-4 shrink-0" /> OUTSIDE
                </span>
              )}
            </div>

            {/* Row 1, Col 2: Distance */}
            <div className="space-y-1 border-l border-[var(--border)] pl-4">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-bold text-[var(--text-primary)] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-bold text-[var(--text-secondary)] block">
                  Locating...
                </span>
              ) : isGpsOff || isPermissionDenied || isLocationError ? (
                <span className="text-sm font-bold text-[var(--warning)] block leading-tight">
                  GPS unavailable
                </span>
              ) : (
                <span className="text-sm font-bold text-[var(--danger)] block leading-tight">
                  Unavailable
                </span>
              )}
            </div>

            {/* Row 2, Col 1: Office Radius */}
            <div className="space-y-1 pt-3 border-t border-[var(--border)]">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                Radius
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-3 border-t border-l border-[var(--border)] pl-4">
              <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-bold text-[var(--text-secondary)] block">
                  Checking...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-bold text-[var(--danger)] block text-[10px]">
                  UNAVAILABLE
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-bold text-[var(--success)] block">
                  VERIFIED
                </span>
              ) : (
                <span className="text-sm font-bold text-[var(--danger)] block">
                  FAILED
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full glass-card p-4 rounded-2xl grid grid-cols-4 gap-2 text-center shadow-lg border-[var(--border)]">
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[var(--card-surface)] text-[var(--aurora-emerald)] flex items-center justify-center mb-1 border border-[var(--border)]">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[var(--text-primary)] block leading-tight">Secure</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[var(--card-surface)] text-[var(--aurora-teal)] flex items-center justify-center mb-1 border border-[var(--border)]">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[var(--text-primary)] block leading-tight">Smart</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[var(--card-surface)] text-[var(--aurora-cyan)] flex items-center justify-center mb-1 border border-[var(--border)]">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[var(--text-primary)] block leading-tight">Precise</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[var(--card-surface)] text-[var(--aurora-emerald)] flex items-center justify-center mb-1 border border-[var(--border)]">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[var(--text-primary)] block leading-tight">Verified</span>
          </div>
        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-4 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[56px] py-4 px-6 aurora-bg text-white font-black uppercase tracking-[0.1em] text-sm sm:text-base rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-white/20 active:scale-[0.98] aurora-glow-emerald"
        >
          <span>{status === 'unregistered' ? 'Proceed to Setup' : 'Enter Workspace'}</span>
          <ArrowRight className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
};
