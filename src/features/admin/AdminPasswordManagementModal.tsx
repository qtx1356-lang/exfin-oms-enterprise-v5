import React, { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  KeyRound,
  Shield,
  Copy,
  Check,
  AlertTriangle,
  Lock,
  RefreshCw,
  XCircle,
  ShieldAlert,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { AdminSecurityUser, ResetPasswordResponse } from '../../types/adminSecurity';
import {
  superAdminResetPassword,
  generateSecureTemporaryPassword,
  validatePasswordStrength,
} from '../../services/admin/adminPasswordService';

interface AdminPasswordManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetAdmin: AdminSecurityUser | null;
  onSuccess?: () => void;
}

export const AdminPasswordManagementModal: React.FC<AdminPasswordManagementModalProps> = ({
  isOpen,
  onClose,
  targetAdmin,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'auto' | 'custom'>('auto');
  const [customPassword, setCustomPassword] = useState('');
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-reset reveal state
  const [resetResult, setResetResult] = useState<ResetPasswordResponse | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !targetAdmin) return null;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let tempToUse: string | undefined;

    if (mode === 'custom') {
      const validation = validatePasswordStrength(customPassword);
      if (!validation.isValid) {
        setError(validation.errors[0] || 'Custom password does not meet security requirements.');
        return;
      }
      tempToUse = customPassword.trim();
    }

    setLoading(true);
    try {
      const result = await superAdminResetPassword(
        targetAdmin.uid,
        tempToUse,
        requirePasswordChange
      );
      setResetResult(result);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Super-Admin password reset failed:', err);
      setError(err.message || 'Failed to reset administrator password.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (resetResult?.temporaryPassword) {
      navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDone = () => {
    setResetResult(null);
    setCustomPassword('');
    setMode('auto');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <Card className="max-w-lg w-full p-6 sm:p-8 bg-[#210D44] border border-amber-500/30 rounded-[28px] shadow-2xl space-y-6 text-white my-8">
        {!resetResult ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shrink-0">
                  <KeyRound className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white">Reset Admin Password</h2>
                  <p className="text-xs text-purple-300/80">Super-Admin Authorization Console</p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={loading}
                className="text-purple-400 hover:text-white p-1 rounded-xl hover:bg-white/5 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Target Admin Card */}
            <div className="p-4 bg-[#170932] border border-purple-500/20 rounded-2xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-purple-400 font-bold uppercase text-[10px]">Target Account</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black">
                  {targetAdmin.role}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm font-extrabold text-white">
                <span>Login ID: {targetAdmin.loginId}</span>
                <span className="text-xs text-purple-300/80 font-normal">{targetAdmin.email || 'No email registered'}</span>
              </div>
              <div className="text-[11px] text-purple-300/70 flex items-center gap-2">
                <span>Office: <strong className="text-white">{targetAdmin.authorizedOffice || 'ALL'}</strong></span>
                <span>•</span>
                <span>Status: <strong className={targetAdmin.active ? 'text-emerald-400' : 'text-rose-400'}>{targetAdmin.status || (targetAdmin.active ? 'Active' : 'Suspended')}</strong></span>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-3 text-rose-200 text-xs font-bold">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleReset} className="space-y-4">
              {/* Generation Mode Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                  Password Generation Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('auto')}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      mode === 'auto'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                        : 'bg-[#170932] border-purple-500/20 text-purple-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Auto-Generate Strong
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('custom')}
                    className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                      mode === 'custom'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                        : 'bg-[#170932] border-purple-500/20 text-purple-300 hover:text-white'
                    }`}
                  >
                    <Lock className="w-4 h-4 text-amber-400" />
                    Specify Custom
                  </button>
                </div>
              </div>

              {/* Custom Password Input */}
              {mode === 'custom' && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center justify-between">
                    <span>Custom Temporary Password</span>
                    <button
                      type="button"
                      onClick={() => setCustomPassword(generateSecureTemporaryPassword())}
                      className="text-amber-400 hover:text-amber-300 text-[11px] font-bold flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Generate Random
                    </button>
                  </label>
                  <input
                    type="text"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    required
                    placeholder="Enter min 8 characters"
                    className="w-full px-4 py-3 bg-[#170932] border border-purple-500/30 rounded-xl text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-purple-300/70">
                    Must be at least 8 characters with upper, lower, numbers, and special characters.
                  </p>
                </div>
              )}

              {/* Force Change on Login Checkbox */}
              <label className="flex items-start gap-3 p-3 bg-[#170932] border border-purple-500/20 rounded-xl cursor-pointer hover:bg-[#1a0b38] transition-colors">
                <input
                  type="checkbox"
                  checked={requirePasswordChange}
                  onChange={(e) => setRequirePasswordChange(e.target.checked)}
                  className="mt-0.5 rounded border-purple-500/40 text-amber-500 focus:ring-amber-400 bg-[#210D44]"
                />
                <div className="text-xs">
                  <span className="font-bold text-white block">Require password change upon next login</span>
                  <span className="text-purple-300/70 text-[11px]">
                    The administrator will be prompted to create their own new password immediately after authenticating with this temporary password.
                  </span>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={onClose}
                  className="w-1/3 py-3 border-purple-500/30 text-purple-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 font-extrabold bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white shadow-xl flex items-center justify-center gap-2"
                >
                  {loading ? (
                    'Resetting Password...'
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Execute Password Reset
                    </>
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          /* POST-RESET ONE-TIME REVEAL VIEW */
          <div className="space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <UserCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-black text-white">Temporary Password Created</h2>
              <p className="text-xs text-purple-300/80">
                The password for administrator <strong className="text-white font-mono">{resetResult.targetLoginId || targetAdmin.loginId}</strong> has been updated.
              </p>
            </div>

            {/* Password Display Box */}
            <div className="p-5 bg-[#170932] border border-amber-500/40 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-amber-400 font-bold uppercase tracking-wider">New Temporary Password</span>
                <span className="text-purple-300/60 font-mono">One-Time Display</span>
              </div>
              <div className="p-3 bg-[#110526] border border-purple-500/30 rounded-xl flex items-center justify-between gap-3">
                <span className="font-mono text-base sm:text-lg font-black text-amber-300 tracking-wider select-all break-all">
                  {resetResult.temporaryPassword}
                </span>
                <Button
                  onClick={handleCopy}
                  className={`px-3 py-2 text-xs font-bold rounded-lg transition-all shrink-0 flex items-center gap-1.5 ${
                    copied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-black shadow-md'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Security Warning Notice */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-200/90 text-xs">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">Important Security Guidance:</p>
                <p className="text-[11px] leading-relaxed text-purple-200/80">
                  Share this temporary password securely with the administrator.
                  {resetResult.mustChangePassword && (
                    <> They will be strictly required to create their own personal password upon their next login.</>
                  )}
                </p>
              </div>
            </div>

            {/* Complete Button */}
            <Button
              onClick={handleDone}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-extrabold rounded-xl shadow-xl text-sm"
            >
              I Have Securely Shared / Copied This Password
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
