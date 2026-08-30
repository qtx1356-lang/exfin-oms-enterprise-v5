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
      elevated: 'bg-[linear-gradient(135deg,#312E81_0%,#4338CA_45%,#2563EB_100%)] border border-white/20 shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-white',
      purple: 'bg-[linear-gradient(135deg,#4C1D95_0%,#5B21B6_45%,#2563EB_100%)] border border-white/25 shadow-[0_12px_36px_rgba(30,41,100,0.22)] text-white',
      gold: 'bg-[linear-gradient(135deg,#312E81_0%,#4338CA_45%,#2563EB_100%)] border border-white/20 shadow-[0_10px_30px_rgba(30,41,100,0.18)] text-white',
      
      // Inner Card Layer (Deep Blue / Navy Contrast Surface)
      inner: 'bg-[linear-gradient(135deg,#172554_0%,#1E3A8A_100%)] border border-white/12 shadow-[0_4px_16px_rgba(15,23,42,0.35)] text-white',
      filled: 'bg-[linear-gradient(135deg,#172554_0%,#1E3A8A_100%)] border border-white/12 shadow-[0_4px_16px_rgba(15,23,42,0.35)] text-white',
      
      outlined: 'bg-white/80 backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-900',
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

