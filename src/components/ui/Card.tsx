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
      elevated: 'bg-[linear-gradient(135deg,rgba(42,35,86,0.95),rgba(20,31,61,0.95))] backdrop-blur-[16px] border border-[#7C3AED]/25 shadow-xl text-[var(--text-primary)]',
      filled: 'bg-[rgba(25,30,58,0.88)] backdrop-blur-[12px] border border-white/8 shadow-md text-[var(--text-primary)]',
      outlined: 'bg-transparent backdrop-blur-[10px] border border-white/10 text-[var(--text-primary)]',
      gold: 'bg-[linear-gradient(135deg,rgba(42,35,86,0.95),rgba(20,31,61,0.95))] backdrop-blur-[16px] border border-[#7C3AED]/35 shadow-xl text-[var(--text-primary)]',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-2xl overflow-hidden', variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
