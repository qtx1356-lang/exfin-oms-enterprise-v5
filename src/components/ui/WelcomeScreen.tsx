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
    <div className="fixed inset-0 bg-[#0B0D0F] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-[#F5F7F6] overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#18C98F]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#10966D]/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-5">
        
        {/* Central Logo / Icon */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-20 h-20 rounded-full border border-[#292F33] bg-[#171B1E] flex items-center justify-center shadow-lg">
            <div className="w-16 h-16 rounded-full bg-[#1D2226] border border-[#18C98F]/40 flex items-center justify-center">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#18C98F]" />
              ) : (
                <Building2 className="w-8 h-8 text-[#18C98F]" />
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
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-[#F5F7F6] tracking-tight leading-tight">
            {displayName ? (
              <>
                <span className="block text-xl sm:text-2xl font-bold text-[#B7C0BC]">Welcome back,</span>
                <span className="text-[#18C98F] font-extrabold">
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
        <div className="w-full py-3 px-4 rounded-2xl bg-[#171B1E] border border-[#292F33] text-center">
          <p className="text-xs sm:text-sm font-extrabold text-[#18C98F] tracking-wide flex items-center justify-center gap-1.5 leading-snug">
            <Sparkles className="w-3.5 h-3.5 text-[#18C98F] shrink-0" />
            <span>✨ AUTOMATIC ATTENDANCE</span>
          </p>
          <p className="text-[10px] text-[#B7C0BC] mt-1 font-semibold">
            Check-in & checkout handled automatically
          </p>
        </div>

        {/* Compact Location & Attendance Status Card */}
        <div className={`w-full bg-[#171B1E] p-4.5 rounded-2xl border text-left shadow-md ${
          isLocationLoading
            ? 'border-[#292F33]'
            : isInsideGeofence
              ? 'border-[#18C98F]/50'
              : 'border-[#EF4444]/50'
        }`}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-3.5 border-b border-[#292F33] pb-2">
            <MapPin className={`w-4 h-4 ${isLocationLoading ? 'text-[#18C98F]' : isInsideGeofence ? 'text-[#18C98F]' : 'text-[#EF4444]'}`} />
            <span className="text-xs font-black uppercase tracking-widest text-[#B7C0BC]">
              📍 Location & Attendance
            </span>
          </div>

          {/* Grid Info - 2x2 Unified Layout */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            
            {/* Row 1, Col 1: Location Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-[#7E8985] uppercase tracking-wider block">
                Location Status
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#B7C0BC] block">
                  Locating...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#B7C0BC] block">
                  {isGpsOff || isPermissionDenied || isLocationError ? 'GPS Unavailable' : 'Locating...'}
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#18C98F] flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-[#18C98F] shrink-0" /> INSIDE OFFICE
                </span>
              ) : (
                <span className="text-sm font-black text-[#EF4444] flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-[#EF4444] shrink-0" /> OUTSIDE OFFICE
                </span>
              )}
            </div>

            {/* Row 1, Col 2: Distance */}
            <div className="space-y-1 border-l border-[#292F33] pl-4">
              <span className="text-[10px] font-bold text-[#7E8985] uppercase tracking-wider block">
                Distance
              </span>
              {distance !== null ? (
                <span className="text-sm font-black text-[#F5F7F6] block">
                  {formattedDistance}
                </span>
              ) : isLocationLoading ? (
                <span className="text-sm font-black text-[#B7C0BC] block">
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
            <div className="space-y-1 pt-2.5 border-t border-[#292F33]">
              <span className="text-[10px] font-bold text-[#7E8985] uppercase tracking-wider block">
                Office Radius
              </span>
              <span className="text-sm font-black text-[#F5F7F6] block">
                25 m
              </span>
            </div>

            {/* Row 2, Col 2: Geofence */}
            <div className="space-y-1 pt-2.5 border-t border-l border-[#292F33] pl-4">
              <span className="text-[10px] font-bold text-[#7E8985] uppercase tracking-wider block">
                Geofence
              </span>
              {isLocationLoading ? (
                <span className="text-sm font-black text-[#B7C0BC] block">
                  Checking...
                </span>
              ) : distance === null ? (
                <span className="text-sm font-black text-[#EF4444] block">
                  UNAVAILABLE
                </span>
              ) : isInsideGeofence ? (
                <span className="text-sm font-black text-[#18C98F] block">
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
        <div className="w-full bg-[#171B1E] p-3 rounded-2xl border border-[#292F33] grid grid-cols-4 gap-1.5 text-center">
          
          {/* Secure Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1D2226] text-[#18C98F] flex items-center justify-center mb-1 border border-[#292F33]">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-[#F5F7F6] block leading-tight">🔒 Secure</span>
            <span className="text-[8px] text-[#B7C0BC] block leading-tight mt-0.5 whitespace-nowrap">Protected data</span>
          </div>

          {/* Smart Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1D2226] text-[#18C98F] flex items-center justify-center mb-1 border border-[#292F33]">
              <Zap className="w-4 h-4 text-[#18C98F]" />
            </div>
            <span className="text-[10px] font-black text-[#F5F7F6] block leading-tight">⚡ Smart</span>
            <span className="text-[8px] text-[#B7C0BC] block leading-tight mt-0.5 whitespace-nowrap">Auto attendance</span>
          </div>

          {/* Accurate Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1D2226] text-[#18C98F] flex items-center justify-center mb-1 border border-[#292F33]">
              <Target className="w-4 h-4 text-[#18C98F]" />
            </div>
            <span className="text-[10px] font-black text-[#F5F7F6] block leading-tight">🎯 Accurate</span>
            <span className="text-[8px] text-[#B7C0BC] block leading-tight mt-0.5 whitespace-nowrap">Precise location</span>
          </div>

          {/* Reliable Tile */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-xl bg-[#1D2226] text-[#F59E0B] flex items-center justify-center mb-1 border border-[#292F33]">
              <Check className="w-4 h-4 text-[#F59E0B]" />
            </div>
            <span className="text-[10px] font-black text-[#F5F7F6] block leading-tight">✓ Reliable</span>
            <span className="text-[8px] text-[#B7C0BC] block leading-tight mt-0.5 whitespace-nowrap">Always synced</span>
          </div>

        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full py-4 px-6 bg-[#18C98F] hover:bg-[#10966D] active:bg-[#10966D] text-[#06110D] font-black uppercase tracking-wider text-sm sm:text-base rounded-xl shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer border border-[#35E0AA]/40"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};
