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
      <div className="w-16 h-16 bg-[#1E1F41]/80 backdrop-blur-[14px] border border-[#6366F1]/30 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
        <Icon className="w-8 h-8 text-[#818CF8]" />
      </div>
      <h3 className="text-base font-bold text-[#F8F8FF] mb-1.5">{title}</h3>
      <p className="text-xs text-[#B9B9D0] mb-5 max-w-xs leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
