import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBiometricSecurity } from '../../context/BiometricSecurityContext';
import {
  Fingerprint,
  ShieldCheck,
  Lock,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronUp,
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
    diagnostics,
    authenticate,
    enroll,
    resetEnrollment,
    refreshDiagnostics,
  } = useBiometricSecurity();

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showReEnrollConfirm, setShowReEnrollConfirm] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // CRITICAL REQUIREMENT 1: HOME PAGE MUST REMAIN UNLOCKED
  const isHomePage = location.pathname === '/' || location.pathname === '';
  if (isHomePage) {
    return <>{children}</>;
  }

  // Clear messages when route changes
  useEffect(() => {
    setErrorMessage(null);
  }, [location.pathname]);

  // If already unlocked in-memory, render protected content
  if (isUnlocked) {
    return <>{children}</>;
  }

  // Handle Enrollment
  const handleEnroll = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await enroll();
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to enable device security. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Enrollment error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Authentication (Invokes native platform authenticator)
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

  const handleOpenTopLevel = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
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
                <Fingerprint className="w-10 h-10 text-emerald-400" />
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
              Authenticate with your phone's security
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
              Use fingerprint, face authentication, or device screen lock to access this protected section.
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

        {/* Environment / Platform Support Notification */}
        {isSupported === false && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-200 space-y-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">Platform Authenticator Environment Notice</p>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  {diagnostics?.diagnosticMessage ||
                    'Your current browser or app environment does not provide phone biometric authentication. Please open EXFIN OMS in a supported HTTPS browser such as Chrome on Android, with fingerprint/face/device security enabled.'}
                </p>
              </div>
            </div>

            {diagnostics?.isIframe && (
              <button
                type="button"
                onClick={handleOpenTopLevel}
                className="w-full py-2.5 px-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-xl text-xs font-bold transition-all border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open EXFIN OMS in New Tab
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3 pt-1">
          {isEnrolled ? (
            <button
              onClick={handleAuthenticate}
              disabled={loading || isSupported === false}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  Verifying Identity...
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 text-slate-950" />
                  USE PHONE FINGERPRINT / BIOMETRIC
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleEnroll}
              disabled={loading || isSupported === false}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-cyan-500/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  Registering Device...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                  ENABLE BIOMETRIC SECURITY
                </>
              )}
            </button>
          )}

          {/* Privacy Guarantee Statement */}
          <p className="text-[10px] text-slate-400 text-center leading-relaxed px-2">
            Your fingerprint/face is handled by your phone. EXFIN OMS never receives or stores your biometric data.
          </p>

          {/* Return Home Button */}
          <button
            onClick={handleReturnHome}
            className="w-full py-3 px-4 bg-slate-900/80 hover:bg-slate-800/80 text-slate-300 font-bold rounded-2xl text-xs transition-all border border-slate-800 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            Return Home
          </button>
        </div>

        {/* Collapsible Diagnostics Panel */}
        <div className="pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
          >
            <span>Environment Diagnostics</span>
            {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDiagnostics && diagnostics && (
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 space-y-1 mt-2">
              <div className="flex justify-between">
                <span>Secure HTTPS Context:</span>
                <span className={diagnostics.isSecureContext ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {diagnostics.isSecureContext ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>WebAuthn Supported:</span>
                <span className={diagnostics.hasPublicKeyCredential ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                  {diagnostics.hasPublicKeyCredential ? 'YES' : 'NO'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Platform Authenticator:</span>
                <span className={diagnostics.isPlatformAuthAvailable ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {diagnostics.isPlatformAuthAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Embedded Iframe:</span>
                <span className={diagnostics.isIframe ? 'text-amber-400' : 'text-slate-300'}>
                  {diagnostics.isIframe ? 'YES (Iframe)' : 'NO (Top-Level)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Origin:</span>
                <span className="text-slate-300 truncate max-w-[170px]">{diagnostics.origin}</span>
              </div>
              <div className="pt-1 text-[9px] text-slate-400 leading-tight">
                Code: <span className="text-cyan-300">{diagnostics.diagnosticCode}</span>
              </div>
            </div>
          )}
        </div>

        {/* Reset / Re-register Option */}
        {isEnrolled && (
          <div className="text-center">
            {!showReEnrollConfirm ? (
              <button
                type="button"
                onClick={() => setShowReEnrollConfirm(true)}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline underline-offset-4 cursor-pointer"
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
                    className="flex-1 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold rounded-xl border border-rose-500/30 transition-colors cursor-pointer"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setShowReEnrollConfirm(false)}
                    className="px-3 py-1.5 bg-slate-900 text-slate-400 text-[10px] font-bold rounded-xl border border-slate-800 hover:text-white transition-colors cursor-pointer"
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

