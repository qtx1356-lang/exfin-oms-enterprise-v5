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

  // Time-aware greeting
  const [greeting] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning!';
    if (hour < 17) return 'Good Afternoon!';
    return 'Good Evening!';
  });

  const displayName = employeeData?.name || cachedName;
  const isRegistered = status === 'Approved' || !!displayName;

  // Derive Location & Distance display states dynamically
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const isLocationLoading = locationStatus === 'loading' && distance === null && !isOffline;
  const isLocationError = (locationStatus === 'error' || isPermissionDenied || isGpsOff || isLocationUnavailable || isOffline) && distance === null;

  return (
    <div className="fixed inset-0 bg-[#EAF7EE] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#0F172A] overflow-y-auto relative">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[rgba(16,185,129,0.06)] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[rgba(16,185,129,0.05)] rounded-full blur-[110px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[rgba(167,139,250,0.25)] bg-[rgba(139,92,246,0.10)] backdrop-blur-md flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            <div className="w-16 h-16 rounded-full bg-[rgba(12,15,22,0.92)] border border-[rgba(0,245,255,0.45)] flex items-center justify-center shadow-[0_0_20px_rgba(0,245,255,0.2)]">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#00F5FF]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#00F5FF]" />
              )}
            </div>
          </div>
        </div>

        {/* Time-Aware Greeting */}
        <div>
          <div className="text-[#F59E0B] font-serif italic text-lg sm:text-xl font-bold tracking-wide flex items-center justify-center gap-1.5">
            <span>☀️</span>
            <span>{greeting}</span>
          </div>

          {/* Employee Welcome */}
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#F8FAFC] tracking-tight leading-tight">
            {displayName ? (
              <>
                <span className="block text-xl sm:text-2xl font-bold text-[#A7B0BE]">Welcome back,</span>
                <span className="text-[#00F5FF] font-extrabold drop-shadow-[0_0_12px_rgba(0,245,255,0.3)]">
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

        {/* Automation Banner */}
        <div className="w-full py-3 px-4 rounded-2xl bg-[rgba(139,92,246,0.08)] border border-[rgba(167,139,250,0.20)] backdrop-blur-[16px] text-center shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          <p className="text-xs sm:text-sm font-extrabold text-[#00F5FF] tracking-wide flex items-center justify-center gap-1.5 leading-snug">
            <Sparkles className="w-3.5 h-3.5 text-[#00F5FF] shrink-0" />
            <span>✨ AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[10px] text-[#A7B0BE] mt-1 font-semibold">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full bg-[rgba(139,92,246,0.08)] backdrop-blur-[16px] p-4.5 rounded-2xl border text-left shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all ${
          isLocationLoading
            ? 'border-[rgba(167,139,250,0.22)]'
            : isInsideGeofence
              ? 'border-[rgba(16,185,129,0.5)] shadow-[0_0_20px_rgba(16,185,129,0.1)]'
              : 'border-[rgba(239,68,68,0.4)] shadow-[0_0_20px_rgba(239,68,68,0.1)]'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 border-b border-[rgba(167,139,250,0.18)] pb-2">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[#00F5FF]' : isInsideGeofence ? 'text-[#10B981]' : 'text-[#EF4444]'}`} />
            <span className="text-xs font-black uppercase tracking-widest text-[#A7B0BE]">
              📍 Location & Attendance
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider block">
                Location Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#A7B0BE] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#A7B0BE] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#10B981] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" /> INSIDE OFFICE
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF4444] flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#EF4444] shrink-0" /> OUTSIDE OFFICE
                </span>
              )}
            </div>

            {/* Row 1, Col 2: Distance */}
            <div className="space-y-1 border-l border-[rgba(167,139,250,0.18)] pl-4">
              <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-black text-[#F8FAFC] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-black text-[#A7B0BE] block">
                  Locating...
                </span>
              ) : isGpsOff || isPermissionDenied || isLocationError ? (
                <span className="text-sm font-black text-[#F59E0B] block leading-tight">
                  GPS unavailable
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF4444] block leading-tight">
                  Location unavailable
                </span>
              )}
            </div>

            {/* Row 2, Col 1: Office Radius */}
            <div className="space-y-1 pt-2.5 border-t border-[rgba(167,139,250,0.18)]">
              <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider block">
                Office Radius
              </span>
              <span className="text-sm font-black text-[#F8FAFC] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-2.5 border-t border-l border-[rgba(167,139,250,0.18)] pl-4">
              <span className="text-[10px] font-bold text-[#667085] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#A7B0BE] block">
                  Checking...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#EF4444] block">
                  UNAVAILABLE
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#10B981] block">
                  WITHIN GEOFENCE
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF4444] block">
                  OUT OF GEOFENCE
                </span>
              )}
            </div>

          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full bg-[rgba(139,92,246,0.06)] backdrop-blur-[16px] p-3 rounded-2xl border border-[rgba(167,139,250,0.18)] grid grid-cols-4 gap-1.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
          
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(139,92,246,0.12)] text-[#00F5FF] flex items-center justify-center mb-1 border border-[rgba(167,139,250,0.20)]">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">🔒 Secure</span>
            <span className="text-[8px] text-[#A7B0BE] block leading-tight mt-0.5 whitespace-nowrap">Protected data</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(139,92,246,0.12)] text-[#00F5FF] flex items-center justify-center mb-1 border border-[rgba(167,139,250,0.20)]">
              <Zap className="w-4 h-4 text-[#00F5FF]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">⚡ Smart</span>
            <span className="text-[8px] text-[#A7B0BE] block leading-tight mt-0.5 whitespace-nowrap">Auto attendance</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(139,92,246,0.12)] text-[#00F5FF] flex items-center justify-center mb-1 border border-[rgba(167,139,250,0.20)]">
              <Target className="w-4 h-4 text-[#00F5FF]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">🎯 Accurate</span>
            <span className="text-[8px] text-[#A7B0BE] block leading-tight mt-0.5 whitespace-nowrap">Precise location</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(139,92,246,0.12)] text-[#F59E0B] flex items-center justify-center mb-1 border border-[rgba(167,139,250,0.20)]">
              <Check className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">✓ Reliable</span>
            <span className="text-[8px] text-[#A7B0BE] block leading-tight mt-0.5 whitespace-nowrap">Always synced</span>
          </div>

        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[48px] py-4 px-6 bg-[rgba(0,245,255,0.12)] hover:bg-[rgba(0,245,255,0.18)] active:bg-[rgba(0,200,212,0.25)] text-[#00F5FF] hover:text-[#67F9FF] font-black uppercase tracking-wider text-sm sm:text-base rounded-xl shadow-[0_0_18px_rgba(0,245,255,0.15)] hover:shadow-[0_0_24px_rgba(0,245,255,0.25)] flex items-center justify-center gap-2 transition-all cursor-pointer border border-[rgba(0,245,255,0.55)] active:scale-[0.98]"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};
