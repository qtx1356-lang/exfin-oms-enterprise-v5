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
    <div className="fixed inset-0 bg-[#080808] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#FFFFFF] overflow-y-auto relative">
      {/* Time-of-Day Welcome Alert Toast */}
      {showAlertToast && (
        <div className="absolute top-4 left-4 right-4 z-50 mx-auto max-w-sm bg-[#151515] border border-[#8F7425] text-white p-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <div className="w-10 h-10 rounded-xl bg-[#1B1B1B] border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider">Welcome Alert</p>
            <p className="text-sm font-extrabold text-white truncate">
              {greetingInfo.label}, {displayName || 'Executive'}!
            </p>
          </div>
        </div>
      )}

      {/* Subtle ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[rgba(212,175,55,0.05)] rounded-full blur-[120px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[#292929] bg-[#151515] flex items-center justify-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[#1B1B1B] border border-[#8F7425]/50 flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.15)]">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#D4AF37]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#D4AF37]" />
              )}
            </div>
          </div>
        </div>

        {/* Time-Aware Greeting */}
        <div>
          <div className="text-[#C7C7C7] text-sm sm:text-base font-semibold tracking-wide flex items-center justify-center gap-1.5">
            <span className="text-[#D4AF37]">☀️</span>
            <span>{greetingInfo.label}</span>
          </div>

          {/* Employee Welcome */}
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#FFFFFF] tracking-tight leading-tight">
            {displayName ? (
              <>
                <span className="block text-lg sm:text-xl font-bold text-[#8A8A8A]">Welcome back,</span>
                <span className="text-[#FFFFFF] font-extrabold text-2xl sm:text-3xl block mt-0.5">
                  {displayName}
                </span>
              </>
            ) : status === 'unregistered' ? (
              <>Register Device</>
            ) : (
              <>Welcome to Workspace</>
            )}
          </h1>
          <p className="text-[11px] font-bold text-[#D4AF37] tracking-widest uppercase mt-1">
            EXFIN OMS • Executive Edition
          </p>
        </div>

        {/* Automation Banner Card */}
        <div className="w-full py-3.5 px-4 rounded-2xl bg-[#151515] border border-[#292929] text-center shadow-lg">
          <p className="text-xs sm:text-sm font-bold text-[#D4AF37] tracking-wider flex items-center justify-center gap-1.5 uppercase">
            <Sparkles className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[11px] text-[#C7C7C7] mt-1 font-medium">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full bg-[#151515] p-4.5 rounded-2xl border text-left shadow-xl transition-all ${
          isLocationLoading
            ? 'border-[#292929]'
            : isInsideGeofence
              ? 'border-[#22C55E]/60 shadow-[0_0_18px_rgba(34,197,94,0.12)]'
              : 'border-[#EF4444]/60 shadow-[0_0_18px_rgba(239,68,68,0.12)]'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 border-b border-[#292929] pb-2">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[#D4AF37]' : isInsideGeofence ? 'text-[#22C55E]' : 'text-[#EF4444]'}`} />
            <span className="text-xs font-bold uppercase tracking-widest text-[#C7C7C7]">
              📍 Location & Attendance
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider block">
                Location Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-bold text-[#C7C7C7] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-bold text-[#C7C7C7] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-bold text-[#22C55E] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" /> INSIDE OFFICE
                </span>
              ) : (
                <span className="text-sm font-bold text-[#EF4444] flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#EF4444] shrink-0" /> OUTSIDE OFFICE
                </span>
              )}
            </div>

            {/* Row 1, Col 2: Distance */}
            <div className="space-y-1 border-l border-[#292929] pl-4">
              <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-bold text-[#FFFFFF] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-bold text-[#C7C7C7] block">
                  Locating...
                </span>
              ) : isGpsOff || isPermissionDenied || isLocationError ? (
                <span className="text-sm font-bold text-[#F59E0B] block leading-tight">
                  GPS unavailable
                </span>
              ) : (
                <span className="text-sm font-bold text-[#EF4444] block leading-tight">
                  Location unavailable
                </span>
              )}
            </div>

            {/* Row 2, Col 1: Office Radius */}
            <div className="space-y-1 pt-2.5 border-t border-[#292929]">
              <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider block">
                Office Radius
              </span>
              <span className="text-sm font-bold text-[#FFFFFF] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-2.5 border-t border-l border-[#292929] pl-4">
              <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-bold text-[#C7C7C7] block">
                  Checking...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-bold text-[#EF4444] block">
                  UNAVAILABLE
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-bold text-[#22C55E] block">
                  WITHIN GEOFENCE
                </span>
              ) : (
                <span className="text-sm font-bold text-[#EF4444] block">
                  OUT OF GEOFENCE
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full bg-[#151515] p-3 rounded-2xl border border-[#292929] grid grid-cols-4 gap-1.5 text-center shadow-lg">
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1B1B1B] text-[#D4AF37] flex items-center justify-center mb-1 border border-[#292929]">
              <Lock className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-[10px] font-bold text-[#FFFFFF] block leading-tight">Secure</span>
            <span className="text-[8px] text-[#8A8A8A] block leading-tight mt-0.5 whitespace-nowrap">Protected data</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1B1B1B] text-[#D4AF37] flex items-center justify-center mb-1 border border-[#292929]">
              <Zap className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-[10px] font-bold text-[#FFFFFF] block leading-tight">Smart</span>
            <span className="text-[8px] text-[#8A8A8A] block leading-tight mt-0.5 whitespace-nowrap">Auto attend</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1B1B1B] text-[#D4AF37] flex items-center justify-center mb-1 border border-[#292929]">
              <Target className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-[10px] font-bold text-[#FFFFFF] block leading-tight">Accurate</span>
            <span className="text-[8px] text-[#8A8A8A] block leading-tight mt-0.5 whitespace-nowrap">Precise GPS</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1B1B1B] text-[#D4AF37] flex items-center justify-center mb-1 border border-[#292929]">
              <Check className="w-4 h-4 text-[#D4AF37]" />
            </div>
            <span className="text-[10px] font-bold text-[#FFFFFF] block leading-tight">Reliable</span>
            <span className="text-[8px] text-[#8A8A8A] block leading-tight mt-0.5 whitespace-nowrap">Always synced</span>
          </div>
        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[48px] py-4 px-6 bg-[#D4AF37] hover:bg-[#E6C766] active:bg-[#9C7B20] text-black font-black uppercase tracking-wider text-sm sm:text-base rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#E6C766] active:scale-[0.98]"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
        </button>
      </div>
    </div>
  );
};
