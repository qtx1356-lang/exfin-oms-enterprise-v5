import React from 'react';
import { ShieldCheck, Lock, CheckCircle2, KeyRound } from 'lucide-react';
import { useSecurityVerification } from '../../context/SecurityVerificationContext';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { isPinEnabled, getEffectiveEmployeeId } from '../../services/security/securityPinService';

export const SecurityCard: React.FC = () => {
  const { openPinSettings } = useSecurityVerification();
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

  const employeeId = getEffectiveEmployeeId(employeeData, adminUser);
  const pinConfigured = isPinEnabled(employeeId);

  return (
    <div className="glass-card-elevated p-5 text-white rounded-2xl space-y-4 shadow-xl border border-purple-900/40 bg-slate-900/90">
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider">Security PIN</h2>
            <p className="text-[10px] text-slate-400">Protect sensitive actions with your personal PIN</p>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
            pinConfigured
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          <CheckCircle2 className={`w-3 h-3 ${pinConfigured ? 'text-emerald-400' : 'text-slate-500'}`} />
          {pinConfigured ? 'Enabled' : 'Not Set'}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="text-xs text-slate-300">
          {pinConfigured ? (
            <p className="text-emerald-300 font-medium text-xs">
              ✓ Sensitive actions require your 4–6 digit Security PIN.
            </p>
          ) : (
            <p className="text-slate-400 font-medium text-xs">
              Set a PIN to add authorization protection to Check-Out, Expenses, and Leave.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openPinSettings}
          className="ml-4 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-lg flex items-center gap-1.5 shrink-0 transition-all"
        >
          <KeyRound className="w-4 h-4" />
          {pinConfigured ? 'Manage PIN' : 'Set Security PIN'}
        </button>
      </div>
    </div>
  );
};
