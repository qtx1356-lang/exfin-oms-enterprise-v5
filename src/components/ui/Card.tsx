import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'filled' | 'outlined' | 'gold' | 'inner' | 'purple';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'elevated', ...props }, ref) => {
    const variants = {
      // Main Card Layer (Rich Indigo -> Blue Gradient)
      elevated: 'glass-card',
      purple: 'glass-card-elevated',
      gold: 'glass-card',
      
      // Inner Card Layer (Deep Blue / Navy Contrast Surface)
      inner: 'glass-inner-tile',
      filled: 'glass-inner-tile',
      
      outlined: 'bg-white/80 backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-900',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-[20px] overflow-hidden', variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
