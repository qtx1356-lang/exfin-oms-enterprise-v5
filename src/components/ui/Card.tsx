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
      elevated: 'bg-[#171B1F] border border-[#3A4148] shadow-md text-[#F5F7F6]',
      filled: 'bg-[#1D2329] border border-[#3A4148] text-[#F5F7F6]',
      outlined: 'bg-[#171B1F] border border-[#3A4148] text-[#F5F7F6]',
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
