import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, Radio, ArrowRight, UserCheck, Sparkles, Building2 } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';

interface WelcomeScreenProps {
  onProceed?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onProceed }) => {
  const { status, employeeData } = useRegistration();
  const { isInsideGeofence, locationStatus, formattedDistance } = useLocationContext();

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

  const displayName = employeeData?.name || cachedName;
  const isRegistered = status === 'Approved' || !!displayName;

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] flex flex-col items-center justify-between p-6 z-40 text-white overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#7C3AED]/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Branding Header */}
      <div className="w-full max-w-sm flex items-center justify-between pt-4 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-[#7C3AED] rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.5)] font-black text-white text-base tracking-tighter">
            EO
          </div>
          <div>
            <span className="font-black text-sm tracking-tight text-white block leading-tight">EXFIN OMS</span>
            <span className="text-[10px] font-bold text-purple-300/80 uppercase tracking-wider block">Enterprise Workspace</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-bold text-purple-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>v5.1.0</span>
        </div>
      </div>

      {/* Middle Welcome Banner & Greeting */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm text-center my-auto py-6 relative z-10"
      >
        <div className="w-16 h-16 mx-auto mb-5 rounded-3xl bg-gradient-to-tr from-[#7C3AED] to-[#A78BFA] p-0.5 shadow-[0_0_30px_rgba(124,58,237,0.4)]">
          <div className="w-full h-full bg-[#211044] rounded-[22px] flex items-center justify-center">
            {isRegistered ? (
              <UserCheck className="w-8 h-8 text-[#A78BFA]" />
            ) : (
              <Building2 className="w-8 h-8 text-purple-300" />
            )}
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-purple-300/90 mb-2 px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          {isRegistered ? 'Ready For Duty' : 'Device Registration'}
        </span>

        <h1 className="text-2xl font-black text-white tracking-tight leading-snug mt-1">
          {displayName ? (
            <>Welcome back,<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-white to-purple-300">{displayName}</span></>
          ) : status === 'unregistered' ? (
            <>Register This Device</>
          ) : (
            <>Welcome to EXFIN OMS</>
          )}
        </h1>

        <p className="text-xs text-purple-200/80 mt-2 font-medium max-w-xs mx-auto leading-relaxed">
          {isRegistered 
            ? 'Automatic attendance & location geofence initialized in background.'
            : 'Set up your employee identity to access attendance and workspace tools.'}
        </p>

        {/* Live Initialization Status Indicators */}
        <div className="mt-6 flex flex-col gap-2.5 text-left bg-[#2D1B5A]/80 backdrop-blur-md p-3.5 rounded-2xl border border-purple-500/30 shadow-xl">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-purple-100">Device Identity</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              {status === 'loading' ? 'Verifying...' : 'Verified'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="font-semibold text-purple-100">25m Office Geofence</span>
            </div>
            <span className="text-[11px] font-bold text-purple-200 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
              {locationStatus === 'loading' ? 'Locating...' : (isInsideGeofence ? 'Inside Office' : formattedDistance || 'Active')}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-pink-400 shrink-0 animate-pulse" />
              <span className="font-semibold text-purple-100">Auto Attendance</span>
            </div>
            <span className="text-[11px] font-bold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-md border border-pink-500/20">
              Active Background
            </span>
          </div>
        </div>
      </motion.div>

      {/* Bottom Proceed Action Button */}
      <div className="w-full max-w-sm pb-4 relative z-10">
        <button
          onClick={onProceed}
          className="w-full py-3.5 px-5 bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] hover:from-[#6D28D9] hover:to-[#7C3AED] text-white font-extrabold text-sm rounded-2xl shadow-[0_0_25px_rgba(124,58,237,0.5)] flex items-center justify-center gap-2 transition-all active:scale-98"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
