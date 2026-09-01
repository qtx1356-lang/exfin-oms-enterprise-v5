import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBiometricSecurity } from '../../context/BiometricSecurityContext';
import { Card } from '../ui/Card';
import {
  Fingerprint,
  Shield,
  ShieldCheck,
  Lock,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  RefreshCw,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

interface BiometricSectionGuardProps {
  children: React.ReactNode;
}

export const BiometricSectionGuard: React.FC<BiometricSectionGuardProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isUnlocked,
    isSupported,
    isEnrolled,
    activeUserId,
    activeUserDisplayName,
    authenticate,
    enroll,
    resetEnrollment,
    unlockWithFallback,
  } = useBiometricSecurity();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showReEnrollConfirm, setShowReEnrollConfirm] = useState(false);

  // CRITICAL REQUIREMENT 1: HOME PAGE MUST REMAIN UNLOCKED
  const isHomePage = location.pathname === '/' || location.pathname === '';
  if (isHomePage) {
    return <>{children}</>;
  }

  // Clear messages when route changes
  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [location.pathname]);

  // If already unlocked in-memory, render protected content
  if (isUnlocked) {
    return <>{children}</>;
  }

  // Handle Enrollment
  const handleEnroll = async () => {
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await enroll();
      if (res.success) {
        setSuccessMessage('Biometric security enabled successfully!');
      } else {
        setErrorMessage(res.error || 'Failed to enable device security. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Enrollment error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Authentication
  const handleAuthenticate = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await authenticate();
      if (!res.success) {
        setErrorMessage(res.error || 'Biometric verification failed. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Authentication error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Return Home
  const handleReturnHome = () => {
    navigate('/', { replace: true });
  };

  // Unsupported fallback handler
  const handleFallbackUnlock = () => {
    unlockWithFallback();
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="glass-card-elevated max-w-md w-full p-6 sm:p-8 rounded-3xl border border-[var(--border)] relative space-y-6 shadow-2xl backdrop-blur-xl">
        {/* Header Icon */}
        <div className="text-center space-y-3">
          <div className="relative inline-block">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500/20 via-cyan-500/10 to-transparent border border-emerald-500/30 flex items-center justify-center mx-auto shadow-inner">
              {isEnrolled ? (
                <Fingerprint className="w-10 h-10 text-emerald-400 animate-pulse" />
              ) : (
                <ShieldCheck className="w-10 h-10 text-cyan-400" />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-md">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              EXFIN OMS Security Guard
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-2">
              {isEnrolled ? 'Verify Your Identity' : 'Secure Your EXFIN OMS'}
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
              {isEnrolled
                ? 'Use fingerprint, face authentication, or device screen lock to access this protected section.'
                : 'Protect your employee data and company operations using your device’s built-in biometric security.'}
            </p>
          </div>
        </div>

        {/* User Identity Chip */}
        {activeUserId && (
          <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                {activeUserDisplayName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-white text-xs leading-none">{activeUserDisplayName}</p>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">{activeUserId}</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 text-cyan-300">
              {isEnrolled ? 'Device Linked' : 'New Device'}
            </span>
          </div>
        )}

        {/* Status / Error Alerts */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <p className="font-semibold">{errorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <p className="font-semibold">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Unsupported Hardware Notice */}
        {isSupported === false && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 space-y-2">
            <div className="flex items-start gap-2">
              <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Platform biometric authenticator is not available on this browser or environment. You may proceed using verified session authentication.
              </p>
            </div>
            <button
              onClick={handleFallbackUnlock}
              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-xl text-xs font-bold transition-all border border-amber-500/30"
            >
              Verify & Proceed
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-2">
          {isEnrolled ? (
            <button
              onClick={handleAuthenticate}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  Verifying...
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 text-slate-950" />
                  Verify Identity
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-500/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  Registering Device...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                  Enable Biometric Security
                </>
              )}
            </button>
          )}

          {/* Return Home Button */}
          <button
            onClick={handleReturnHome}
            className="w-full py-3 px-4 bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 font-bold rounded-2xl text-xs transition-all border border-slate-800 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            Return Home
          </button>
        </div>

        {/* Reset / Re-register Option */}
        {isEnrolled && (
          <div className="pt-2 text-center">
            {!showReEnrollConfirm ? (
              <button
                type="button"
                onClick={() => setShowReEnrollConfirm(true)}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-4"
              >
                Re-register device biometric credential
              </button>
            ) : (
              <div className="p-3 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-2 text-left">
                <p className="text-[11px] text-slate-300">
                  Resetting will remove the current device credential binding for <b>{activeUserId}</b>. You will need to re-enroll biometrics.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      resetEnrollment();
                      setShowReEnrollConfirm(false);
                    }}
                    className="flex-1 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold rounded-xl border border-rose-500/30 transition-colors"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setShowReEnrollConfirm(false)}
                    className="px-3 py-1.5 bg-slate-900 text-slate-400 text-[10px] font-bold rounded-xl border border-slate-800 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
