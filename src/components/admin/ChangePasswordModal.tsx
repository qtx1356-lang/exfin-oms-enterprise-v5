import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Lock, Eye, EyeOff, KeyRound, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { validatePasswordStrength } from '../../services/admin/adminPasswordService';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isMandatory?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  isMandatory = false,
}) => {
  const { changeOwnPassword, loginId, user } = useAdminAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const strength = validatePasswordStrength(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Please enter your current / temporary password.');
      return;
    }

    if (!strength.isValid) {
      setError(strength.errors[0] || 'New password does not meet security requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation password do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password cannot be identical to the current password.');
      return;
    }

    setLoading(true);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      setSuccess('Your administrator password has been updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 1800);
    } catch (err: any) {
      console.error('Password change error:', err);
      setError(err.message || 'Failed to change password. Please verify current password.');
    } finally {
      setLoading(false);
    }
  };

  const getStrengthBarColor = () => {
    if (strength.score <= 1) return 'bg-rose-500';
    if (strength.score === 2) return 'bg-amber-500';
    if (strength.score === 3) return 'bg-blue-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <Card className="max-w-lg w-full p-6 sm:p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-[28px] shadow-2xl space-y-6 text-[var(--text-primary)] my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--primary-dark)] to-[var(--primary)] flex items-center justify-center shadow-lg shrink-0">
              <KeyRound className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[var(--text-primary)]">
                {isMandatory ? 'Mandatory Password Update' : 'Change Admin Password'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)]/80">
                Account: <span className="text-[var(--primary-light)] font-mono font-bold">{loginId || user?.email || 'Admin'}</span>
              </p>
            </div>
          </div>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-xl hover:bg-white/5 transition-colors"
              aria-label="Close modal"
            >
              <XCircle className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Mandatory Warning Banner */}
        {isMandatory && (
          <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-200 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-amber-300">Temporary Password Active: </span>
              A temporary password was assigned to your account. For security purposes, you must create a new personal password before accessing the administrative console.
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center gap-3 text-emerald-200 text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-3 text-rose-200 text-xs font-bold animate-fade-in">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-primary)]/80 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[var(--primary)]" />
              {isMandatory ? 'Current / Temporary Password' : 'Current Password'}
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={loading || !!success}
                placeholder="Enter current password"
                className="w-full pl-4 pr-11 py-3 bg-[var(--app-bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-xs sm:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-primary)]/80 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[var(--primary)]" /> New Password
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={loading || !!success}
                placeholder="Enter new strong password"
                className="w-full pl-4 pr-11 py-3 bg-[var(--app-bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] text-xs sm:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]/80">Strength:</span>
                  <span className={`font-bold ${
                    strength.score <= 1 ? 'text-rose-400' :
                    strength.score === 2 ? 'text-amber-400' :
                    strength.score === 3 ? 'text-blue-400' : 'text-emerald-400'
                  }`}>
                    {strength.strengthLabel}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--app-bg-secondary)] rounded-full overflow-hidden flex gap-1">
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 1 ? getStrengthBarColor() : 'bg-transparent'}`} style={{ width: '25%' }} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 2 ? getStrengthBarColor() : 'bg-transparent'}`} style={{ width: '25%' }} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 3 ? getStrengthBarColor() : 'bg-transparent'}`} style={{ width: '25%' }} />
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.score >= 4 ? getStrengthBarColor() : 'bg-transparent'}`} style={{ width: '25%' }} />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--text-primary)]/80 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[var(--primary)]" /> Confirm New Password
              </span>
              {isMatch && (
                <span className="text-emerald-400 text-[10px] flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3 h-3" /> Passwords match
                </span>
              )}
              {isMismatch && (
                <span className="text-rose-400 text-[10px] flex items-center gap-1 font-bold">
                  <XCircle className="w-3 h-3" /> Passwords do not match
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading || !!success}
                placeholder="Re-enter new password"
                className={`w-full pl-4 pr-11 py-3 bg-[var(--app-bg-secondary)] border rounded-xl text-[var(--text-primary)] text-xs sm:text-sm focus:outline-none transition-colors ${
                  isMismatch ? 'border-rose-500/70 focus:border-rose-500' :
                  isMatch ? 'border-emerald-500/70 focus:border-emerald-500' :
                  'border-[var(--border)] focus:border-[var(--primary)]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Checklist */}
          <div className="p-3.5 bg-[var(--app-bg-secondary)] border border-[var(--border)] rounded-2xl space-y-1.5 text-[11px] text-[var(--text-secondary)]/90">
            <p className="font-bold text-[var(--text-primary)] uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--primary)]" /> Security Standards
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className={`flex items-center gap-1.5 ${strength.hasMinLength ? 'text-emerald-400 font-bold' : 'text-[var(--text-secondary)]/60'}`}>
                {strength.hasMinLength ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" />}
                <span>At least 8 characters</span>
              </div>
              <div className={`flex items-center gap-1.5 ${strength.hasUppercase && strength.hasLowercase ? 'text-emerald-400 font-bold' : 'text-[var(--text-secondary)]/60'}`}>
                {strength.hasUppercase && strength.hasLowercase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" />}
                <span>Upper & lower case</span>
              </div>
              <div className={`flex items-center gap-1.5 ${strength.hasNumber ? 'text-emerald-400 font-bold' : 'text-[var(--text-secondary)]/60'}`}>
                {strength.hasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" />}
                <span>At least one number (0-9)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${strength.hasSpecialChar ? 'text-emerald-400 font-bold' : 'text-[var(--text-secondary)]/60'}`}>
                {strength.hasSpecialChar ? <CheckCircle2 className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded-full border border-[var(--border)]" />}
                <span>Special character (!@#$)</span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            {!isMandatory && onClose && (
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={onClose}
                className="w-full sm:w-1/3 py-3 border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={loading || !strength.isValid || !isMatch || !!success}
              className={`w-full py-3 text-xs sm:text-sm font-extrabold shadow-lg rounded-xl flex items-center justify-center gap-2 ${
                !isMandatory && onClose ? 'sm:w-2/3' : 'w-full'
              } bg-gradient-to-r from-[var(--primary-dark)] to-[var(--primary)] hover:from-[var(--primary)] hover:to-[var(--primary-light)] text-white`}
            >
              {loading ? (
                'Updating Password...'
              ) : success ? (
                'Password Updated!'
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  {isMandatory ? 'Set New Password & Proceed' : 'Update Password'}
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
