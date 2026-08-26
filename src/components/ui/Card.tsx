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
      elevated: 'bg-[#143730] border border-[#1D4840] shadow-md text-[#F5FFFC]',
      filled: 'bg-[#102D28] border border-[#1D4840] text-[#F5FFFC]',
      outlined: 'bg-[#102D28]/90 border border-[#163B35] text-[#F5FFFC]',
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
