import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const SuspendedNoticeScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] p-4 flex flex-col items-center justify-center font-sans relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--aurora-teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-md w-full glass-card-elevated p-10 text-center flex flex-col items-center relative z-10">
        <div className="w-20 h-20 bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-full flex items-center justify-center mb-8 shadow-2xl relative">
          <AlertOctagon className="w-10 h-10 text-[var(--warning)]" />
          <div className="absolute inset-0 bg-[var(--warning)]/10 blur-xl rounded-full -z-10" />
        </div>
        <h2 className="text-xl font-black text-[var(--text-primary)] mb-4 tracking-tight uppercase">Access Suspended</h2>
        <p className="text-[var(--text-secondary)] text-xs leading-relaxed font-medium mb-8 max-w-[260px]">
          {rejectionReason || 'Security protocols have temporarily restricted your access. Please contact the security department for account re-activation.'}
        </p>
        <button 
          onClick={resetRegistration} 
          className="w-full py-4 px-6 rounded-2xl border border-[var(--border)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-[var(--card-surface)] transition-all shadow-md"
        >
          Different Credentials
        </button>
      </div>
    </div>
  );
};
