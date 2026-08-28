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
      elevated: 'bg-[var(--card-elevated)] backdrop-blur-[14px] border border-[var(--border-active)] shadow-lg text-[var(--text-primary)]',
      filled: 'bg-[var(--card-bg)] backdrop-blur-[12px] border border-[var(--border)] shadow-md text-[var(--text-primary)]',
      outlined: 'bg-transparent backdrop-blur-[10px] border border-[var(--border)] text-[var(--text-primary)]',
      gold: 'bg-[var(--card-elevated)] backdrop-blur-[16px] border border-[var(--primary)]/40 shadow-xl text-[var(--text-primary)]',
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
