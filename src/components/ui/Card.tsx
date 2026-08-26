import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'elevated', ...props }, ref) => {
    const variants = {
      elevated: 'bg-[rgba(139,92,246,0.08)] backdrop-blur-[16px] border border-[rgba(167,139,250,0.18)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] text-[#F8FAFC]',
      filled: 'bg-[rgba(139,92,246,0.06)] backdrop-blur-[16px] border border-[rgba(167,139,250,0.15)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] text-[#F8FAFC]',
      outlined: 'bg-[rgba(139,92,246,0.04)] backdrop-blur-[12px] border border-[rgba(167,139,250,0.18)] text-[#F8FAFC]',
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

