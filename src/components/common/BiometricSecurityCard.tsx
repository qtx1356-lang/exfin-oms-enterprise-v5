import React, { useState } from 'react';
import { useBiometricSecurity } from '../../context/BiometricSecurityContext';
import {
  Fingerprint,
  ShieldCheck,
  Lock,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const BiometricSecurityCard: React.FC = () => {
  const {
    isUnlocked,
    isSupported,
    isEnrolled,
    credentialMetadata,
    diagnostics,
    activeUserId,
    lock,
    enroll,
    resetEnrollment,
    refreshDiagnostics,
  } = useBiometricSecurity();

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const handleEnroll = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await enroll();
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Device biometric security configured successfully!' });
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Failed to enable device security.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e?.message || 'Error configuring biometrics.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLockNow = () => {
    lock();
    setStatusMessage({ type: 'success', text: 'Application protected sections locked successfully.' });
  };

  const handleReset = () => {
    resetEnrollment();
    setShowConfirmReset(false);
    setStatusMessage({ type: 'success', text: 'Device biometric credential reset. You can now re-enroll.' });
  };

  return (
    <div className="glass-card-elevated p-5 text-white rounded-2xl space-y-4 shadow-xl border border-[var(--border)]">
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
        <h2 className="text-xs font-black uppercase text-cyan-300 tracking-wider flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-cyan-300" /> Device Biometric Security
        </h2>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            isEnrolled
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : isSupported === false
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
        >
          {isEnrolled ? 'Status: Enabled' : isSupported === false ? 'Status: Unsupported' : 'Status: Not Enabled'}
        </span>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Protects sensitive sections (Planner, Attendance, Team, Profile) using your phone's native platform security (Fingerprint / Face ID / Android Device Lock).
        </p>

        {/* Status indicator */}
        <div className="p-3.5 glass-card-inner rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">Device Credential Registered</span>
            <span className={`font-semibold flex items-center gap-1 ${isEnrolled ? 'text-emerald-400' : 'text-slate-400'}`}>
              {isEnrolled ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Yes
                </>
              ) : (
                'No'
              )}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">Platform Authenticator</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              {isSupported === false ? (
                <span className="text-amber-400">Unavailable in Current Runtime</span>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> WebAuthn / Passkey Ready
                </>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">Current Session State</span>
            <span className={`font-semibold ${isUnlocked ? 'text-cyan-400' : 'text-amber-400'}`}>
              {isUnlocked ? 'Active In-Memory Session (5m)' : 'Locked'}
            </span>
          </div>

          {credentialMetadata && (
            <div className="pt-1 text-[11px] text-slate-400 border-t border-slate-800/80 flex justify-between">
              <span>Device Key:</span>
              <span className="font-mono text-slate-300 truncate max-w-[180px]">
                {credentialMetadata.id.substring(0, 16)}...
              </span>
            </div>
          )}
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {isEnrolled ? (
            <>
              <button
                type="button"
                onClick={handleLockNow}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                Lock Protected Sections
              </button>

              {!showConfirmReset ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmReset(true)}
                  className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-xs font-bold transition-all border border-rose-500/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
                  Re-enroll Device
                </button>
              ) : (
                <div className="w-full p-3 bg-slate-950/90 rounded-xl border border-rose-500/30 space-y-2 mt-1">
                  <p className="text-[11px] text-slate-300">
                    Are you sure you want to reset the stored credential for <b>{activeUserId}</b>?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleReset}
                      className="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-bold hover:bg-rose-600 transition-colors cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                    <button
                      onClick={() => setShowConfirmReset(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={handleEnroll}
              disabled={loading || isSupported === false}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  Registering Device...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                  Enable Biometric Security
                </>
              )}
            </button>
          )}
        </div>

        {/* Collapsible Diagnostics */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
          >
            <span>Device Diagnostics</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDiagnostics && diagnostics && (
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1 mt-2">
              <div className="flex justify-between">
                <span>Secure HTTPS:</span>
                <span className={diagnostics.isSecureContext ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {diagnostics.isSecureContext ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>WebAuthn:</span>
                <span className={diagnostics.hasPublicKeyCredential ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {diagnostics.hasPublicKeyCredential ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Platform Auth:</span>
                <span className={diagnostics.isPlatformAuthAvailable ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {diagnostics.isPlatformAuthAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Iframe Context:</span>
                <span className={diagnostics.isIframe ? 'text-amber-400' : 'text-slate-300'}>
                  {diagnostics.isIframe ? 'YES (Embedded)' : 'NO (Top-Level)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Origin:</span>
                <span className="text-slate-300 truncate max-w-[170px]">{diagnostics.origin}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

