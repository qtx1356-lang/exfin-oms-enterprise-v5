import React from 'react';
import { KeyRound, ShieldAlert, X } from 'lucide-react';
import { Button } from '../ui/Button';

interface PinResetNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSetup: () => void;
  adminName?: string;
  resetAt?: string;
}

export const PinResetNoticeModal: React.FC<PinResetNoticeModalProps> = ({
  isOpen,
  onClose,
  onOpenSetup,
  adminName,
  resetAt,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#160B31] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-5 text-white">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white leading-tight">Security PIN Reset</h3>
              <p className="text-xs text-amber-300/80 font-medium">Administrator Action Notification</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Body */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl space-y-2">
          <p className="text-xs text-purple-100 leading-relaxed">
            Your Security PIN has been reset by an administrator. Please create a new Security PIN before performing protected actions.
          </p>
          {(adminName || resetAt) && (
            <div className="pt-2 border-t border-amber-500/20 text-[11px] text-amber-300/80 space-y-0.5">
              {adminName && <div>Reset requested by: <span className="font-bold text-white">{adminName}</span></div>}
              {resetAt && <div>Date: <span className="font-bold text-white">{new Date(resetAt).toLocaleString()}</span></div>}
            </div>
          )}
        </div>

        <div className="text-xs text-purple-200/70 leading-relaxed">
          Sensitive actions such as official Check-Out, Expense Claim submissions, and Leave requests require an active Security PIN.
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-700 hover:bg-white/5 text-slate-300 font-bold text-xs"
          >
            Later
          </Button>
          <Button
            type="button"
            onClick={() => {
              onClose();
              onOpenSetup();
            }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs shadow-lg flex items-center justify-center gap-1.5"
          >
            <KeyRound className="w-4 h-4" />
            <span>Set New Security PIN</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
