import React, { useState } from 'react';
import { Shield, Lock, AlertCircle, RefreshCw, X } from 'lucide-react';
import { auth } from '../../services/firebase/config';
import { performFirebaseReauthentication } from '../../services/security/sensitiveActionSecurity';
import { getActionPolicy } from '../../services/security/securityPolicyRegistry';
import { SensitiveActionId } from '../../types/security';

interface SecurityVerificationModalProps {
  isOpen: boolean;
  actionId: SensitiveActionId;
  customDescription?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const SecurityVerificationModal: React.FC<SecurityVerificationModalProps> = ({
  isOpen,
  actionId,
  customDescription,
  onSuccess,
  onCancel,
}) => {
  if (!isOpen) return null;

  const policy = getActionPolicy(actionId);
  const activeAuth = auth.concrete || auth;
  const user = activeAuth?.currentUser || auth?.currentUser;
  const userEmail = user?.email || '';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      if (userEmail && !password.trim()) {
        setErrorMessage('Please enter your account password to verify.');
        setLoading(false);
        return;
      }

      const result = await performFirebaseReauthentication(password);
      if (result.success) {
        onSuccess();
      } else {
        setErrorMessage(result.error || 'Verification failed. Please try again.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative text-white">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white leading-tight">Security Verification</h3>
              <p className="text-[11px] text-slate-400">Protected action authorization</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleVerify} className="p-5 space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">Action:</span>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/30">
                {policy.title}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {customDescription || policy.description}
            </p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            For your security, please verify your account before completing this action.
          </p>

          {userEmail && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Account Password ({userEmail})</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                  disabled={loading}
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-bold text-xs hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Continue'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
