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
    <div className="fixed inset-0 bg-[#080A0F] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#F8FAFC] overflow-y-auto relative">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[rgba(139,92,246,0.08)] rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[rgba(34,211,238,0.06)] rounded-full blur-[100px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[rgba(148,163,184,0.28)] bg-[rgba(20,28,42,0.95)] flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
            <div className="w-16 h-16 rounded-full bg-[rgba(15,23,42,0.9)] border border-[rgba(34,211,238,0.4)] flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.15)]">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#22D3EE]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#22D3EE]" />
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
                <span className="block text-xl sm:text-2xl font-bold text-[#CBD5E1]">Welcome back,</span>
                <span className="text-[#22D3EE] font-extrabold">
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
        <div className="w-full py-3 px-4 rounded-2xl bg-[rgba(17,24,39,0.92)] border border-[rgba(148,163,184,0.22)] text-center shadow-md">
          <p className="text-xs sm:text-sm font-extrabold text-[#22D3EE] tracking-wide flex items-center justify-center gap-1.5 leading-snug">
            <Sparkles className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
            <span>✨ AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[10px] text-[#CBD5E1] mt-1 font-semibold">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full bg-[rgba(17,24,39,0.92)] backdrop-blur-md p-4.5 rounded-2xl border text-left shadow-lg transition-all ${
          isLocationLoading
            ? 'border-[rgba(148,163,184,0.22)]'
            : isInsideGeofence
              ? 'border-[rgba(16,185,129,0.5)] shadow-[0_0_20px_rgba(16,185,129,0.1)]'
              : 'border-[rgba(239,68,68,0.4)] shadow-[0_0_20px_rgba(239,68,68,0.1)]'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 border-b border-[rgba(148,163,184,0.20)] pb-2">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[#22D3EE]' : isInsideGeofence ? 'text-[#10B981]' : 'text-[#EF4444]'}`} />
            <span className="text-xs font-black uppercase tracking-widest text-[#CBD5E1]">
              📍 Location & Attendance
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                Location Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#CBD5E1] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#CBD5E1] block">
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
            <div className="space-y-1 border-l border-[rgba(148,163,184,0.20)] pl-4">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-black text-[#F8FAFC] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-black text-[#CBD5E1] block">
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
            <div className="space-y-1 pt-2.5 border-t border-[rgba(148,163,184,0.20)]">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                Office Radius
              </span>
              <span className="text-sm font-black text-[#F8FAFC] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-2.5 border-t border-l border-[rgba(148,163,184,0.20)] pl-4">
              <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#CBD5E1] block">
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
        <div className="w-full bg-[rgba(17,24,39,0.92)] p-3 rounded-2xl border border-[rgba(148,163,184,0.22)] grid grid-cols-4 gap-1.5 text-center shadow-md">
          
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(30,41,59,0.8)] text-[#22D3EE] flex items-center justify-center mb-1 border border-[rgba(148,163,184,0.20)]">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">🔒 Secure</span>
            <span className="text-[8px] text-[#CBD5E1] block leading-tight mt-0.5 whitespace-nowrap">Protected data</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(30,41,59,0.8)] text-[#22D3EE] flex items-center justify-center mb-1 border border-[rgba(148,163,184,0.20)]">
              <Zap className="w-4 h-4 text-[#22D3EE]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">⚡ Smart</span>
            <span className="text-[8px] text-[#CBD5E1] block leading-tight mt-0.5 whitespace-nowrap">Auto attendance</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(30,41,59,0.8)] text-[#22D3EE] flex items-center justify-center mb-1 border border-[rgba(148,163,184,0.20)]">
              <Target className="w-4 h-4 text-[#22D3EE]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">🎯 Accurate</span>
            <span className="text-[8px] text-[#CBD5E1] block leading-tight mt-0.5 whitespace-nowrap">Precise location</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[rgba(30,41,59,0.8)] text-[#F59E0B] flex items-center justify-center mb-1 border border-[rgba(148,163,184,0.20)]">
              <Check className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <span className="text-[10px] font-black text-[#F8FAFC] block leading-tight">✓ Reliable</span>
            <span className="text-[8px] text-[#CBD5E1] block leading-tight mt-0.5 whitespace-nowrap">Always synced</span>
          </div>

        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full min-h-[48px] py-4 px-6 bg-[#22D3EE] hover:bg-[#67E8F9] active:bg-[#67E8F9] text-[#041014] font-black uppercase tracking-wider text-sm sm:text-base rounded-xl shadow-[0_4px_16px_rgba(34,211,238,0.35)] flex items-center justify-center gap-2 transition-all cursor-pointer border border-[#67E8F9]/50 active:scale-[0.98]"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};
