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
      elevated: 'bg-[#2D1B5A] border border-purple-500/20 shadow-[0_10px_30px_rgba(0,0,0,0.35)] text-white',
      filled: 'bg-[#211044] border border-purple-500/15 text-white',
      outlined: 'bg-[#2D1B5A]/90 border border-purple-400/25 text-white',
    };

    return (
      <div
        ref={ref}
        className={cn('rounded-[22px] overflow-hidden transition-all duration-300', variants[variant], className)}
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';
