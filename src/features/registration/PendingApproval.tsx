import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] p-4 flex flex-col items-center justify-center font-sans relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--aurora-teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-md w-full glass-card-elevated p-10 text-center flex flex-col items-center relative z-10">
        <div className="w-20 h-20 bg-[var(--aurora-emerald)]/10 border border-[var(--aurora-emerald)]/30 rounded-full flex items-center justify-center mb-8 shadow-2xl relative">
          <Clock className="w-10 h-10 text-[var(--aurora-emerald)]" />
          <div className="absolute inset-0 bg-[var(--aurora-emerald)]/10 blur-xl rounded-full -z-10 animate-pulse" />
        </div>
        <h2 className="text-xl font-black text-[var(--text-primary)] mb-4 tracking-tight uppercase aurora-text">Registration Active</h2>
        <p className="text-[var(--text-secondary)] text-xs leading-relaxed font-medium max-w-[260px]">
          Your device authentication is pending administrative review. You will receive access to the <span className="text-[var(--aurora-emerald)] font-bold">Executive Portal</span> upon verification.
        </p>
        
        <div className="mt-10 pt-6 border-t border-[var(--border)] w-full">
           <div className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.2em]">
             Verification System • Active
           </div>
        </div>
      </div>
    </div>
  );
};
