import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full relative overflow-hidden">
      <div className="w-16 h-16 bg-[var(--success)]/10 border border-[var(--success)]/20 rounded-2xl flex items-center justify-center mb-5 shadow-xl relative">
        <Icon className="w-8 h-8 text-[var(--success)]" />
        <div className="absolute inset-0 bg-[var(--success)]/5 blur-xl -z-10 rounded-full" />
      </div>
      <h3 className="text-lg font-black text-[var(--text-primary)] mb-2 uppercase tracking-tight">{title}</h3>
      <p className="text-[11px] text-[var(--text-secondary)] mb-6 max-w-[240px] mx-auto leading-relaxed font-medium">{description}</p>
      {action && <div className="relative z-10">{action}</div>}
    </div>
  );
};
