import React from 'react';
import { Phone, Shield, ArrowRight, AlertTriangle, Sparkles } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const MobileRecoveryScreen: React.FC = () => {
  const { 
    verifyMobileForRecovery, 
    recoveryMobileInput, 
    setRecoveryMobileInput, 
    recoveryError, 
    recoveryLoading 
  } = useRegistration();

  const [localMobile, setLocalMobile] = React.useState(recoveryMobileInput || '');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localMobile || localMobile.trim().length < 10) {
      setLocalError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!navigator.onLine) {
      setLocalError('Internet connection is required to verify your mobile number with the server. Please reconnect.');
      return;
    }
    setLocalError(null);
    setRecoveryMobileInput(localMobile);
    await verifyMobileForRecovery(localMobile);
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] p-4 flex flex-col justify-center items-center font-sans relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--aurora-teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-md w-full space-y-6 relative z-10">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[var(--aurora-emerald)]/10 border border-[var(--aurora-emerald)]/30 rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
            <Shield className="w-8 h-8 text-[var(--aurora-emerald)]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight uppercase text-[var(--text-primary)] aurora-text">EXFIN OMS</h1>
          <h2 className="text-sm font-bold tracking-[0.2em] text-[var(--aurora-emerald)] uppercase">Account Recovery</h2>
          <p className="text-[var(--text-secondary)] text-xs font-medium max-w-[260px] mx-auto leading-relaxed mt-2">Enter your registered mobile number to restore your executive account.</p>
        </div>

        <div className="glass-card-elevated p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5 px-1">
                <Phone className="w-3.5 h-3.5 text-[var(--aurora-emerald)]" /> Mobile Number
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-[var(--text-muted)] text-sm font-bold">+91</span>
                <input
                  type="tel"
                  value={localMobile}
                  onChange={(e) => setLocalMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="w-full pl-14 pr-4 py-3.5 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--aurora-emerald)] focus:ring-1 focus:ring-[var(--aurora-emerald)] text-sm font-mono tracking-wider"
                  required
                  maxLength={10}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] pt-1 px-1">
                Your mobile number is your persistent account recovery key across device reinstalls.
              </p>
            </div>

            {(localError || recoveryError) && (
              <div className="p-3 bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--danger)]" />
                <span>{localError || recoveryError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={recoveryLoading || localMobile.length < 10}
              className="w-full py-4 text-xs font-black uppercase tracking-[0.15em] rounded-2xl shadow-xl flex items-center justify-center gap-2 aurora-bg text-white border border-white/20 active:scale-[0.98] transition-all aurora-glow-emerald disabled:opacity-50 cursor-pointer"
            >
              <span>{recoveryLoading ? 'Verifying Account...' : 'Continue'}</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </form>
        </div>

        <div className="text-center">
          <p className="text-[11px] text-[var(--text-muted)] font-medium flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[var(--aurora-emerald)]" /> EXFIN OMS Executive Identity Engine
          </p>
        </div>

      </div>
    </div>
  );
};
