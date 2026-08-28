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
    <div className="flex flex-col items-center justify-center p-8 text-center h-full">
      <div className="w-16 h-16 bg-[#151515] border border-[#292929] rounded-2xl flex items-center justify-center mb-4 shadow-lg">
        <Icon className="w-8 h-8 text-[#D4AF37]" />
      </div>
      <h3 className="text-base font-bold text-[#FFFFFF] mb-1.5">{title}</h3>
      <p className="text-xs text-[#8A8A8A] mb-5 max-w-xs leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
