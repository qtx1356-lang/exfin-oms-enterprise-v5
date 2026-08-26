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
      elevated: 'bg-[rgba(20,28,42,0.95)] backdrop-blur-md border border-[rgba(148,163,184,0.28)] shadow-lg text-[#F8FAFC]',
      filled: 'bg-[rgba(17,24,39,0.92)] backdrop-blur-md border border-[rgba(148,163,184,0.20)] text-[#F8FAFC]',
      outlined: 'bg-[rgba(15,23,42,0.88)] backdrop-blur-md border border-[rgba(148,163,184,0.20)] text-[#F8FAFC]',
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
