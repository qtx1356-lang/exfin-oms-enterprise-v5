import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, MapPin, ArrowRight, UserCheck, Sparkles, Building2, CheckCircle2, Zap, Shield, Clock, Target } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { logStartupTag } from '../../services/startup/startupPerformanceLogger';

interface WelcomeScreenProps {
  onProceed?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onProceed }) => {
  const { status, employeeData } = useRegistration();
  const { locationStatus } = useLocationContext();

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

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#12072B] via-[#1B0B3B] to-[#260E4E] flex flex-col items-center justify-between p-4 sm:p-6 z-40 text-white overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#7C3AED]/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#A855F7]/10 rounded-full blur-[90px] pointer-events-none" />

      {/* Main Content Container */}
      <div className="w-full max-w-sm my-auto py-2 flex flex-col items-center text-center relative z-10 space-y-4">
        
        {/* Central Glowing Icon */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="relative flex items-center justify-center my-1"
        >
          {/* Layered Glow Rings */}
          <div className="absolute w-24 h-24 rounded-full border border-purple-500/30 bg-[#7C3AED]/15 blur-sm" />
          <div className="absolute w-20 h-20 rounded-full border border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]" />
          
          <div className="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#A78BFA] p-0.5 shadow-[0_0_30px_rgba(124,58,237,0.6)]">
            <div className="w-full h-full bg-[#180A36] rounded-full flex items-center justify-center">
              {isRegistered ? (
                <UserCheck className="w-8 h-8 text-[#C4B5FD]" />
              ) : (
                <Building2 className="w-8 h-8 text-purple-300" />
              )}
            </div>
          </div>
        </motion.div>

        {/* Time-Aware Greeting */}
        <div>
          <div className="text-amber-300 font-serif italic text-lg sm:text-xl font-bold tracking-wide flex items-center justify-center gap-1.5 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]">
            <span>☀️</span>
            <span>{greeting}</span>
          </div>

          {/* Employee Welcome */}
          <h1 className="mt-1 text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
            {displayName ? (
              <>
                <span className="block text-xl sm:text-2xl font-bold text-purple-100">Welcome back,</span>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-purple-300 font-extrabold">
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

        {/* Automated Attendance Feature Message (Gold Highlight Pill) */}
        <div className="w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-[#2A174F] via-[#351B63] to-[#2A174F] border border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.2)] text-center transition-all">
          <p className="text-xs sm:text-sm font-extrabold text-amber-300 tracking-wide flex items-center justify-center gap-1.5 leading-snug">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Fully Automated Check-In & Check-out System</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          </p>
        </div>

        {/* Clean Status Information Card */}
        <div className="w-full bg-[#1A0C38]/80 backdrop-blur-md p-3.5 rounded-2xl border border-purple-500/25 shadow-xl space-y-2.5 text-left">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold text-purple-100">Device Identity</span>
            </div>
            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Verified
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-300 shrink-0" />
              <span className="font-semibold text-purple-100">Office Attendance</span>
            </div>
            <span className="text-[10px] font-bold text-purple-200 bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/30">
              {locationStatus === 'loading' ? 'Locating...' : 'Ready'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-semibold text-purple-100">System Status</span>
            </div>
            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
              Active
            </span>
          </div>
        </div>

        {/* Feature Highlights Grid (4 Columns) */}
        <div className="w-full bg-[#180A34]/60 p-3 rounded-2xl border border-purple-500/15 grid grid-cols-4 gap-1.5 text-center">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-1 text-emerald-400 border border-emerald-500/20">
              <Shield className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-white block leading-tight">Secure</span>
            <span className="text-[8px] text-purple-300/70 block leading-tight mt-0.5">Protected data</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center mb-1 text-purple-300 border border-purple-500/20">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-white block leading-tight">Smart</span>
            <span className="text-[8px] text-purple-300/70 block leading-tight mt-0.5">Automated</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center mb-1 text-indigo-300 border border-indigo-500/20">
              <Target className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-white block leading-tight">Accurate</span>
            <span className="text-[8px] text-purple-300/70 block leading-tight mt-0.5">Precision</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center mb-1 text-amber-400 border border-amber-500/20">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-white block leading-tight">Reliable</span>
            <span className="text-[8px] text-purple-300/70 block leading-tight mt-0.5">Seamless</span>
          </div>
        </div>

      </div>

      {/* Bottom CTA Button */}
      <div className="w-full max-w-sm pt-2 pb-2 relative z-10">
        <button
          onClick={onProceed}
          className="w-full py-3.5 px-5 bg-gradient-to-r from-[#7C3AED] via-[#8B5CF6] to-[#A78BFA] hover:from-[#6D28D9] hover:to-[#7C3AED] text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-[0_0_25px_rgba(124,58,237,0.5)] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer border border-purple-400/30"
        >
          <span>{status === 'unregistered' ? 'Continue to Registration' : 'Enter Dashboard'}</span>
          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};


