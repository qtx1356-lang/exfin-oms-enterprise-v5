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
      elevated: 'bg-surface shadow-md',
      filled: 'bg-surface-variant',
      outlined: 'bg-surface border border-outline',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-xl overflow-hidden', variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
