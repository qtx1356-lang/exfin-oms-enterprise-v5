import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import {
  getStoredBiometricCredential,
  enrollBiometricCredential,
  removeBiometricCredential,
  getBiometricDiagnostics,
} from '../../services/security/biometricService';
import { BiometricDiagnosticReport } from '../../types/biometric';
import { ShieldCheck, Fingerprint, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

export const BiometricSecurityCard: React.FC = () => {
  const { authUser, employeeData } = useRegistration();
  const userId = employeeData?.employeeId || authUser?.uid || '';
  const userDisplayName = employeeData?.name || authUser?.displayName || userId;

  const [loading, setLoading] = useState(false);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [diagnostics, setDiagnostics] = useState<BiometricDiagnosticReport | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (userId) {
      const cred = getStoredBiometricCredential(userId);
      setIsEnrolled(!!cred);
    }
    getBiometricDiagnostics().then((diag) => {
      if (isMounted) {
        setDiagnostics(diag);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleEnroll = async () => {
    if (!userId) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      const result = await enrollBiometricCredential(userId, userDisplayName);
      if (result.success) {
        setIsEnrolled(true);
        setStatusMessage({ type: 'success', text: 'Device authentication configured successfully for sensitive actions!' });
      } else {
        setStatusMessage({ type: 'error', text: result.error || 'Failed to configure device authentication.' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    if (!userId) return;
    removeBiometricCredential(userId);
    setIsEnrolled(false);
    setStatusMessage({ type: 'success', text: 'Device authentication disabled. Sensitive actions will no longer require biometrics.' });
  };

  if (!userId) return null;

  const isSupported = diagnostics?.isPlatformAuthAvailable;

  return (
    <div className="glass-card-elevated p-5 text-white rounded-2xl space-y-4 shadow-xl">
      <div className="flex justify-between items-start border-b border-slate-700 pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isEnrolled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
            {isEnrolled ? <ShieldCheck className="w-5 h-5" /> : <Fingerprint className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-bold text-sm">Secure Sensitive Actions</h3>
            <p className="text-xs text-slate-400">Protect final submissions with device biometrics</p>
          </div>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${isEnrolled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
          {isEnrolled ? 'Status: Enabled' : isSupported === false ? 'Status: Unsupported' : 'Status: Not Enabled'}
        </span>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-slate-300 leading-relaxed">
          When enabled, you will be required to verify your identity using your phone's native security (Fingerprint / Face ID / Screen Lock) before committing sensitive actions like submitting expenses, applying for leave, or manual attendance corrections.
        </p>

        {statusMessage && (
          <div className={`p-3 rounded-xl border flex gap-2 text-xs items-start ${statusMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            <p className="leading-relaxed font-medium">{statusMessage.text}</p>
          </div>
        )}

        <div className="flex gap-3">
          {isEnrolled ? (
            <button
              type="button"
              onClick={handleRemove}
              className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer border border-slate-700"
            >
              Disable Security
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEnroll}
              disabled={loading || isSupported === false}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              {loading ? 'Registering...' : 'Enable Device Biometrics'}
            </button>
          )}
        </div>

        {/* Diagnostics Toggle */}
        <div className="pt-2 border-t border-slate-700">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between text-[11px] text-slate-500 hover:text-slate-300 transition-colors py-1 cursor-pointer"
          >
            <span>Device Diagnostics</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showDiagnostics && diagnostics && (
            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1 mt-2">
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
              <div className="pt-1 text-[9px] text-slate-500 leading-tight">
                Code: {diagnostics.diagnosticCode}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
