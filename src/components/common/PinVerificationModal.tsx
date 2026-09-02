import React, { useState, useEffect, useRef } from 'react';
import { Lock, Shield, AlertCircle, X, KeyRound } from 'lucide-react';
import { SensitiveActionId } from '../../types/security';
import { getActionPolicy } from '../../services/security/securityPolicyRegistry';
import { verifySecurityPin, getCooldownRemainingSeconds } from '../../services/security/securityPinService';

interface PinVerificationModalProps {
  isOpen: boolean;
  actionId: SensitiveActionId;
  customDescription?: string;
  employeeId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PinVerificationModal: React.FC<PinVerificationModalProps> = ({
  isOpen,
  actionId,
  customDescription,
  employeeId,
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const policy = getActionPolicy(actionId);
  const actionTitle = customDescription || policy.title;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
      setIsSubmitting(false);
      const cd = getCooldownRemainingSeconds(employeeId);
      setCooldownSeconds(cd);

      // Focus input after modal mount
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, employeeId]);

  // Live countdown timer for cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting || cooldownSeconds > 0) return;

    if (!pin.trim() || pin.trim().length < 4) {
      setError('Please enter your 4–6 digit Security PIN.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await verifySecurityPin(employeeId, pin.trim());
    setIsSubmitting(false);

    if (result.success) {
      setPin('');
      onSuccess();
    } else {
      setPin('');
      if (result.cooldownSeconds && result.cooldownSeconds > 0) {
        setCooldownSeconds(result.cooldownSeconds);
      }
      setError(result.error || 'Incorrect Security PIN.');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#160B31] border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight">Security PIN</h3>
              <p className="text-xs text-purple-200/70 font-medium">Enter your PIN to authorize this action</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Detail Badge */}
        <div className="p-3.5 bg-purple-950/40 border border-purple-500/20 rounded-2xl flex items-center gap-3">
          <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Action Requiring PIN</span>
            <span className="text-xs font-bold text-white truncate block">{actionTitle}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-purple-200 mb-2">
              Security PIN
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              disabled={cooldownSeconds > 0 || isSubmitting}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPin(val);
                setError(null);
              }}
              placeholder="••••"
              className="w-full px-4 py-3 bg-[#0B051D] border border-purple-500/40 rounded-2xl text-center text-2xl font-mono text-white tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50 transition-all"
            />
          </div>

          {/* Error / Cooldown Feedback */}
          {error && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-start gap-2.5 text-xs text-rose-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                {error}
                {cooldownSeconds > 0 && (
                  <strong className="block font-bold mt-0.5">
                    Retry available in {cooldownSeconds}s
                  </strong>
                )}
              </span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pin.length < 4 || cooldownSeconds > 0 || isSubmitting}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-purple-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
