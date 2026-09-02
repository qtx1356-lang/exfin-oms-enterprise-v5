import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, CheckCircle2, RefreshCw, Clock, ShieldAlert } from 'lucide-react';
import { getVerificationSessionInfo, clearVerificationSession } from '../../services/security/sensitiveActionSecurity';
import { auth } from '../../services/firebase/config';

export const SecurityCard: React.FC = () => {
  const [sessionInfo, setSessionInfo] = useState(getVerificationSessionInfo());
  const activeAuth = auth.concrete || auth;
  const user = activeAuth?.currentUser || auth?.currentUser;

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionInfo(getVerificationSessionInfo());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleClearSession = () => {
    clearVerificationSession();
    setSessionInfo(getVerificationSessionInfo());
  };

  const formatLastVerified = (timestamp: number) => {
    if (!timestamp) return 'Not verified in current session';
    try {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Recently verified';
    }
  };

  return (
    <div className="glass-card-elevated p-5 text-white rounded-2xl space-y-4 shadow-xl border border-slate-800 bg-slate-900/90">
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase text-cyan-300 tracking-wider">Account & Action Security</h2>
            <p className="text-[10px] text-slate-400">PWA re-authentication protection active</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-cyan-400" />
          PWA Compatible
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Account Auth</span>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              {user ? 'Authenticated Session' : 'Device Session'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active
            </span>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Sensitive Action Guard</span>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              5-Minute Verification
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Enabled
            </span>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Verification Session</span>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">
              {sessionInfo.isActive ? `Active (${sessionInfo.remainingSeconds}s remaining)` : 'Inactive'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                sessionInfo.isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700 text-slate-400 border border-slate-600'
              }`}
            >
              {sessionInfo.isActive ? 'Valid' : 'Expired'}
            </span>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Last Verification</span>
          <div className="flex items-center justify-between">
            <span className="font-bold text-white flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatLastVerified(sessionInfo.lastVerifiedAtMs)}
            </span>
          </div>
        </div>
      </div>

      {sessionInfo.isActive && (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={handleClearSession}
            className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            End Security Verification Session
          </button>
        </div>
      )}
    </div>
  );
};
