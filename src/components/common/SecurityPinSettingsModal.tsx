import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, KeyRound, AlertCircle, CheckCircle, X, ShieldAlert } from 'lucide-react';
import {
  isPinEnabled,
  setSecurityPin,
  changeSecurityPin,
  disableSecurityPin,
  validatePinStrength,
  getCooldownRemainingSeconds,
} from '../../services/security/securityPinService';

interface SecurityPinSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  onStatusChange?: () => void;
}

type ViewMode = 'MAIN' | 'SETUP' | 'CHANGE' | 'DISABLE';

export const SecurityPinSettingsModal: React.FC<SecurityPinSettingsModalProps> = ({
  isOpen,
  onClose,
  employeeId,
  onStatusChange,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('MAIN');
  const [pinEnabled, setPinEnabled] = useState(false);

  // Form states
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  // UI feedback
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const resetFormState = () => {
    setPin('');
    setConfirmPin('');
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setError(null);
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (isOpen) {
      const enabled = isPinEnabled(employeeId);
      setPinEnabled(enabled);
      setViewMode(enabled ? 'MAIN' : 'SETUP');
      resetFormState();
      setToastMessage(null);
      setCooldownSeconds(getCooldownRemainingSeconds(employeeId));
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. SETUP SUBMIT
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (pin.length < 4 || pin.length > 6) {
      setError('Security PIN must be 4 to 6 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN numbers do not match.');
      return;
    }

    const strength = validatePinStrength(pin);
    if (!strength.isValid) {
      setError(strength.error || 'Please choose a stronger Security PIN.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await setSecurityPin(employeeId, pin);
    setIsSubmitting(false);

    if (result.success) {
      setPinEnabled(true);
      showToast('Security PIN enabled successfully.');
      if (onStatusChange) onStatusChange();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      setError(result.error || 'Failed to setup Security PIN.');
    }
  };

  // 2. CHANGE SUBMIT
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || cooldownSeconds > 0) return;

    if (!currentPin.trim()) {
      setError('Please enter your existing Security PIN.');
      return;
    }
    if (newPin.length < 4 || newPin.length > 6) {
      setError('New Security PIN must be 4 to 6 digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setError('New PIN numbers do not match.');
      return;
    }

    const strength = validatePinStrength(newPin);
    if (!strength.isValid) {
      setError(strength.error || 'Please choose a stronger Security PIN.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await changeSecurityPin(employeeId, currentPin, newPin);
    setIsSubmitting(false);

    if (result.success) {
      showToast('Security PIN changed successfully.');
      if (onStatusChange) onStatusChange();
      resetFormState();
      setViewMode('MAIN');
    } else {
      if (result.cooldownSeconds) setCooldownSeconds(result.cooldownSeconds);
      setError(result.error || 'Failed to change Security PIN.');
    }
  };

  // 3. DISABLE SUBMIT
  const handleDisablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || cooldownSeconds > 0) return;

    if (!currentPin.trim()) {
      setError('Please enter your existing Security PIN to disable.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await disableSecurityPin(employeeId, currentPin);
    setIsSubmitting(false);

    if (result.success) {
      setPinEnabled(false);
      showToast('Security PIN disabled.');
      if (onStatusChange) onStatusChange();
      setTimeout(() => {
        onClose();
      }, 1000);
    } else {
      if (result.cooldownSeconds) setCooldownSeconds(result.cooldownSeconds);
      setError(result.error || 'Failed to disable Security PIN.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#160B31] border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-5">
        
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="absolute -top-12 left-0 right-0 mx-auto w-11/12 p-3 bg-emerald-500/90 border border-emerald-400 text-white font-extrabold text-xs text-center rounded-2xl shadow-xl animate-bounce">
            ✓ {toastMessage}
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight">Security PIN</h3>
              <p className="text-xs text-purple-200/70 font-medium">Protect sensitive actions with your personal PIN</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ------------------- VIEW: MAIN STATUS ------------------- */}
        {viewMode === 'MAIN' && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-xs font-black text-white block">Status</span>
                  <span className="text-xs font-bold text-emerald-300">✓ Enabled</span>
                </div>
              </div>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-200 px-2.5 py-1 rounded-full border border-emerald-500/40 font-bold">
                Protected
              </span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setViewMode('CHANGE');
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 font-bold text-xs transition-all"
              >
                Change PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  resetFormState();
                  setViewMode('DISABLE');
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 font-bold text-xs transition-all"
              >
                Disable PIN
              </button>
            </div>
          </div>
        )}

        {/* ------------------- VIEW: SETUP PIN ------------------- */}
        {viewMode === 'SETUP' && (
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="text-xs text-purple-200/80 leading-relaxed">
              Create a 4–6 digit PIN to authorize sensitive actions (such as Check-Out, Expense Claims, and Leave Requests).
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">Security PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 bg-[#0B051D] border border-purple-500/40 rounded-xl text-center text-xl font-mono text-white tracking-[0.4em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">Confirm Security PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 bg-[#0B051D] border border-purple-500/40 rounded-xl text-center text-xl font-mono text-white tracking-[0.4em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-start gap-2 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pin.length < 4 || confirmPin.length < 4 || isSubmitting}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Set Security PIN'}
              </button>
            </div>
          </form>
        )}

        {/* ------------------- VIEW: CHANGE PIN ------------------- */}
        {viewMode === 'CHANGE' && (
          <form onSubmit={handleChangePin} className="space-y-4">
            <h4 className="text-sm font-bold text-white">Change Security PIN</h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">Existing PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full px-4 py-2 bg-[#0B051D] border border-purple-500/40 rounded-xl text-center text-lg font-mono text-white tracking-[0.3em] placeholder:tracking-normal focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">New Security PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full px-4 py-2 bg-[#0B051D] border border-purple-500/40 rounded-xl text-center text-lg font-mono text-white tracking-[0.3em] placeholder:tracking-normal focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-200 mb-1">Confirm New Security PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••"
                  className="w-full px-4 py-2 bg-[#0B051D] border border-purple-500/40 rounded-xl text-center text-lg font-mono text-white tracking-[0.3em] placeholder:tracking-normal focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-start gap-2 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewMode('MAIN')}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={!currentPin || newPin.length < 4 || isSubmitting || cooldownSeconds > 0}
                className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Updating...' : 'Update PIN'}
              </button>
            </div>
          </form>
        )}

        {/* ------------------- VIEW: DISABLE PIN ------------------- */}
        {viewMode === 'DISABLE' && (
          <form onSubmit={handleDisablePin} className="space-y-4">
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-rose-200">Disable Security PIN?</h4>
                <p className="text-[11px] text-rose-300/80 mt-0.5">Sensitive actions will no longer require PIN verification.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-purple-200 mb-1">Enter Existing PIN to Confirm</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                className="w-full px-4 py-2.5 bg-[#0B051D] border border-rose-500/40 rounded-xl text-center text-xl font-mono text-white tracking-[0.4em] placeholder:tracking-normal focus:outline-none focus:border-rose-400"
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-start gap-2 text-xs text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setViewMode('MAIN')}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!currentPin || isSubmitting || cooldownSeconds > 0}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg disabled:opacity-50"
              >
                {isSubmitting ? 'Disabling...' : 'Disable'}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
