import React, { useState } from 'react';
import { ShieldAlert, X, AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface ResetPinConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  employee: {
    name: string;
    employeeCode: string;
    department?: string;
  } | null;
}

export const ResetPinConfirmationModal: React.FC<ResetPinConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  employee,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('Employee requested PIN reset');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !employee) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm(reason);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to reset Security PIN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#160B31] border border-purple-500/30 rounded-3xl p-6 shadow-2xl space-y-5 text-white">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight">Reset Security PIN</h3>
              <p className="text-xs text-purple-200/70 font-medium">Employee Credential Invalidation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Employee Details Card */}
        <div className="p-4 bg-[#210D44]/90 border border-purple-500/30 rounded-2xl space-y-2">
          <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Target Employee</div>
          <div className="flex items-center justify-between">
            <div className="font-black text-base text-white">{employee.name}</div>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 font-mono text-xs font-bold text-purple-200">
              {employee.employeeCode}
            </span>
          </div>
          {employee.department && (
            <div className="text-xs text-purple-300/70">Department: {employee.department}</div>
          )}
        </div>

        {/* Warning Banner */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-amber-200/90">
            <span className="font-extrabold text-amber-300 block mb-1">
              This will invalidate the employee&apos;s current Security PIN.
            </span>
            The employee will be required to create a new Security PIN before using protected actions.
          </div>
        </div>

        {/* Reset Reason Field */}
        <div>
          <label className="block text-xs font-bold text-purple-200 mb-1">
            Reason for Reset <span className="text-purple-400/60 font-normal">(Audit Log)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Employee forgot PIN / Device changed"
            className="w-full px-3.5 py-2.5 bg-[#0B051D] border border-purple-500/40 rounded-xl text-xs text-white placeholder:text-purple-400/40 focus:outline-none focus:border-amber-400"
          />
        </div>

        {error && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-start gap-2 text-xs text-rose-200">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-extrabold text-xs shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Resetting...</span>
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Reset Security PIN</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
