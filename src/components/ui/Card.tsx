import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined' | 'gold';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'elevated', ...props }, ref) => {
    const variants = {
      elevated: 'bg-[#1E1F41]/75 backdrop-blur-[14px] border border-[#6366F1]/20 shadow-[0_8px_32px_rgba(15,16,37,0.37)] text-[#F8F8FF]',
      filled: 'bg-[#171936]/80 backdrop-blur-[12px] border border-[#6366F1]/15 shadow-[0_4px_20px_rgba(15,16,37,0.25)] text-[#F8F8FF]',
      outlined: 'bg-[#1E1F41]/60 backdrop-blur-[10px] border border-[#6366F1]/25 text-[#F8F8FF]',
      gold: 'bg-[#1E1F41]/85 backdrop-blur-[16px] border border-[#6366F1]/40 shadow-[0_8px_32px_rgba(79,70,229,0.2)] text-[#F8F8FF]',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-[16px] overflow-hidden', variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
