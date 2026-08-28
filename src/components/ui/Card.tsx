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
      elevated: 'bg-[#151515] border border-[#292929] shadow-[0_4px_20px_rgba(0,0,0,0.5)] text-[#FFFFFF]',
      filled: 'bg-[#121212] border border-[#202020] shadow-[0_2px_12px_rgba(0,0,0,0.4)] text-[#FFFFFF]',
      outlined: 'bg-[#151515] border border-[#292929] text-[#FFFFFF]',
      gold: 'bg-[#151515] border border-[#8F7425] shadow-[0_0_20px_rgba(212,175,55,0.12)] text-[#FFFFFF]',
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
