import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const RejectedScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] p-4 flex flex-col items-center justify-center font-sans relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--aurora-teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-md w-full glass-card-elevated p-10 text-center flex flex-col items-center relative z-10">
        <div className="w-20 h-20 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-full flex items-center justify-center mb-8 shadow-2xl relative">
          <XCircle className="w-10 h-10 text-[var(--danger)]" />
          <div className="absolute inset-0 bg-[var(--danger)]/10 blur-xl rounded-full -z-10" />
        </div>
        <h2 className="text-xl font-black text-[var(--text-primary)] mb-4 tracking-tight uppercase">Registration Denied</h2>
        <p className="text-[var(--text-secondary)] text-xs leading-relaxed font-medium mb-8 max-w-[260px]">
          {rejectionReason || 'Security protocols prevented your device registration from being approved by the administrator.'}
        </p>
        <button 
          onClick={resetRegistration} 
          className="w-full py-4 aurora-bg text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl border border-white/20 active:scale-[0.98] transition-all aurora-glow-emerald"
        >
          Restart Registration
        </button>
      </div>
    </div>
  );
};
