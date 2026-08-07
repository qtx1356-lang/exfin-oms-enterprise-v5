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
      <div className="w-16 h-16 bg-secondary-container rounded-full flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-on-secondary-container" />
      </div>
      <h3 className="text-xl font-medium text-on-surface mb-2">{title}</h3>
      <p className="text-sm text-outline mb-6 max-w-xs">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
