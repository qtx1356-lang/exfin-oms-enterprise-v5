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
      elevated: 'bg-[linear-gradient(135deg,rgba(76,29,149,0.80),rgba(30,41,100,0.90))] backdrop-blur-[16px] border border-[#A78BFA]/25 shadow-[0_8px_32px_rgba(17,16,74,0.50)] text-white',
      filled: 'bg-[linear-gradient(135deg,#18204F,#20205D)] backdrop-blur-[12px] border border-[#A78BFA]/20 shadow-md text-white',
      outlined: 'bg-transparent backdrop-blur-[10px] border border-[#A78BFA]/25 text-white',
      gold: 'bg-[linear-gradient(135deg,rgba(88,28,135,0.90),rgba(30,58,138,0.90))] backdrop-blur-[16px] border border-[#A78BFA]/35 shadow-[0_12px_36px_rgba(17,16,74,0.65)] text-white',
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
