import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, ArrowRight, UserCheck, Sparkles, Building2, CheckCircle2, Zap, Shield, Clock, Target, Lock, Check } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';

interface WelcomeScreenProps {
  onProceed?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onProceed }) => {
  const { status, employeeData } = useRegistration();
  const { locationStatus, distance, formattedDistance, isInsideGeofence, locationState, isGpsOff, isPermissionDenied, isLocationUnavailable } = useLocationContext();

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

  const [greetingInfo] = useState<{ label: string; periodKey: string }>(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return { label: 'Good Morning', periodKey: 'morning' };
    if (hour >= 12 && hour < 17) return { label: 'Good Afternoon', periodKey: 'afternoon' };
    return { label: 'Good Evening', periodKey: 'evening' };
  });

  const displayName = employeeData?.name || cachedName;
  const isRegistered = status === 'Approved' || !!displayName;

  const [showAlertToast, setShowAlertToast] = useState(false);

  useEffect(() => {
    logStartupTag('WELCOME_RENDER', 'Instant Welcome screen rendered on UI');
    if (displayName) {
      try {
        const sessionKey = `exfin_greeting_shown_${greetingInfo.periodKey}`;
        if (!sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, 'true');
          setShowAlertToast(true);
          const t = setTimeout(() => setShowAlertToast(false), 4000);
          return () => clearTimeout(t);
        }
      } catch (e) {}
    }
  }, [displayName, greetingInfo.periodKey]);

  // Derive Location & Distance display states dynamically
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isLocationLoading = locationStatus === 'loading' && distance === null && !isOffline;
  const isLocationError = (locationStatus === 'error' || isPermissionDenied || isGpsOff || isLocationUnavailable || isOffline) && distance === null;

  return (
    <div className="fixed inset-0 bg-[#EAF7EE] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#12332B] overflow-y-auto relative">
      {/* Time-of-Day Welcome Alert Toast (Once per session per period) */}
      {showAlertToast && (
        <div className="absolute top-4 left-4 right-4 z-50 mx-auto max-w-sm bg-[#173A32] border border-[#19C7C0]/60 text-white p-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md">
          <div className="w-10 h-10 rounded-xl bg-[#112C26] border border-[#19C7C0]/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[#19C7C0]" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-bold text-[#19C7C0] uppercase tracking-wider">Welcome Alert</p>
            <p className="text-sm font-extrabold text-white truncate">
              {greetingInfo.label}, {displayName || 'Employee'}!
            </p>
          </div>
        </div>
      )}

      {/* Background ambient subtle lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[rgba(25,199,192,0.08)] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[rgba(53,201,138,0.08)] rounded-full blur-[110px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[#2A5B50] bg-[#173A32] backdrop-blur-md flex items-center justify-center shadow-xl">
            <div className="w-16 h-16 rounded-full bg-[#112C26] border border-[#19C7C0]/40 flex items-center justify-center shadow-[0_0_15px_rgba(25,199,192,0.2)]">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#19C7C0]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#19C7C0]" />
              )}
            </div>
          </div>
        </div>

        {/* Time-Aware Greeting */}
        <div>
          <div className="text-[#31534A] font-serif italic text-lg sm:text-xl font-bold tracking-wide flex items-center justify-center gap-1.5">
            <span>☀️</span>
            <span>{greetingInfo.label}!</span>
          </div>

          {/* Employee Welcome */}
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#12332B] tracking-tight leading-tight">
            {displayName ? (
              <>
                <span className="block text-xl sm:text-2xl font-bold text-[#31534A]">Welcome back,</span>
                <span className="text-[#12332B] font-extrabold text-2xl sm:text-3xl block mt-0.5">
                  {displayName}
                </span>
              </>
            ) : status === 'unregistered' ? (
              <>Register This Device</>
            ) : (
              <>Welcome to Workspace</>
            )}
          </h1>
        </div>

        {/* Automation Banner Card */}
        <div className="w-full py-3.5 px-4 rounded-2xl bg-[#173A32] border border-[#2A5B50] text-center shadow-lg">
          <p className="text-xs sm:text-sm font-black text-[#19C7C0] tracking-wider flex items-center justify-center gap-1.5 uppercase">
            <Sparkles className="w-4 h-4 text-[#19C7C0] shrink-0" />
            <span>AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[11px] text-[#C7DAD3] mt-1 font-semibold">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full bg-[#173A32] p-4.5 rounded-2xl border text-left shadow-xl transition-all ${
          isLocationLoading
            ? 'border-[#2A5B50]'
            : isInsideGeofence
              ? 'border-[#35C98A]/60 shadow-[0_0_18px_rgba(53,201,138,0.12)]'
              : 'border-[#EF6B73]/60 shadow-[0_0_18px_rgba(239,107,115,0.12)]'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 border-b border-[#2A5B50] pb-2">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[#19C7C0]' : isInsideGeofence ? 'text-[#35C98A]' : 'text-[#EF6B73]'}`} />
            <span className="text-xs font-black uppercase tracking-widest text-[#C7DAD3]">
              📍 Location & Attendance
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold text-[#9FB9AF] uppercase tracking-wider block">
                Location Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#C7DAD3] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#C7DAD3] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#35C98A] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-[#35C98A] shrink-0" /> INSIDE OFFICE
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF6B73] flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#EF6B73] shrink-0" /> OUTSIDE OFFICE
                </span>
              )}
            </div>

            {/* Row 1, Col 2: Distance */}
            <div className="space-y-1 border-l border-[#2A5B50] pl-4">
              <span className="text-[10px] font-extrabold text-[#9FB9AF] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-black text-[#F4FAF7] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-black text-[#C7DAD3] block">
                  Locating...
                </span>
              ) : isGpsOff || isPermissionDenied || isLocationError ? (
                <span className="text-sm font-black text-[#F2C75C] block leading-tight">
                  GPS unavailable
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF6B73] block leading-tight">
                  Location unavailable
                </span>
              )}
            </div>

            {/* Row 2, Col 1: Office Radius */}
            <div className="space-y-1 pt-2.5 border-t border-[#2A5B50]">
              <span className="text-[10px] font-extrabold text-[#9FB9AF] uppercase tracking-wider block">
                Office Radius
              </span>
              <span className="text-sm font-black text-[#F4FAF7] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-2.5 border-t border-l border-[#2A5B50] pl-4">
              <span className="text-[10px] font-extrabold text-[#9FB9AF] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#C7DAD3] block">
                  Checking...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#EF6B73] block">
                  UNAVAILABLE
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#35C98A] block">
                  WITHIN GEOFENCE
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF6B73] block">
                  OUT OF GEOFENCE
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full bg-[#173A32] p-3 rounded-2xl border border-[#2A5B50] grid grid-cols-4 gap-1.5 text-center shadow-lg">
          
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#112C26] text-[#19C7C0] flex items-center justify-center mb-1 border border-[#2A5B50]">
              <Lock className="w-4 h-4 text-[#19C7C0]" />
            </div>
            <span className="text-[10px] font-black text-[#F4FAF7] block leading-tight">🔒 Secure</span>
            <span className="text-[8px] text-[#C7DAD3] block leading-tight mt-0.5 whitespace-nowrap">Protected data</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#112C26] text-[#19C7C0] flex items-center justify-center mb-1 border border-[#2A5B50]">
              <Zap className="w-4 h-4 text-[#19C7C0]" />
            </div>
            <span className="text-[10px] font-black text-[#F4FAF7] block leading-tight">⚡ Smart</span>
            <span className="text-[8px] text-[#C7DAD3] block leading-tight mt-0.5 whitespace-nowrap">Auto attendance</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#112C26] text-[#19C7C0] flex items-center justify-center mb-1 border border-[#2A5B50]">
              <Target className="w-4 h-4 text-[#19C7C0]" />
            </div>
            <span className="text-[10px] font-black text-[#F4FAF7] block leading-tight">🎯 Accurate</span>
            <span className="text-[8px] text-[#C7DAD3] block leading-tight mt-0.5 whitespace-nowrap">Precise location</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#112C26] text-[#F2C75C] flex items-center justify-center mb-1 border border-[#2A5B50]">
              <Check className="w-4 h-4 text-[#F2C75C]" />
            </div>
            <span className="text-[10px] font-black text-[#F4FAF7] block leading-tight">✓ Reliable</span>
            <span className="text-[8px] text-[#C7DAD3] block leading-tight mt-0.5 whitespace-nowrap">Always synced</span>
          </div>

        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[48px] py-4 px-6 bg-[#19C7C0] hover:bg-[#15ADA7] active:bg-[#129792] text-[#0A2923] font-black uppercase tracking-wider text-sm sm:text-base rounded-2xl shadow-lg hover:shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#19C7C0] active:scale-[0.98]"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-[#0A2923]" />
        </button>
      </div>
    </div>
  );
};
