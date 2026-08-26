import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal' | 'cyan';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'filled', ...props }, ref) => {
    const variants = {
      filled: 'bg-[rgba(0,245,255,0.12)] border border-[rgba(0,245,255,0.55)] text-[#00F5FF] shadow-[0_0_18px_rgba(0,245,255,0.12)] hover:bg-[rgba(0,245,255,0.18)] hover:text-[#67F9FF] hover:shadow-[0_0_24px_rgba(0,245,255,0.22)] active:bg-[rgba(0,200,212,0.25)] active:text-[#00C8D4] font-bold rounded-xl',
      cyan: 'bg-[rgba(0,245,255,0.12)] border border-[rgba(0,245,255,0.55)] text-[#00F5FF] shadow-[0_0_18px_rgba(0,245,255,0.12)] hover:bg-[rgba(0,245,255,0.18)] hover:text-[#67F9FF] hover:shadow-[0_0_24px_rgba(0,245,255,0.22)] active:bg-[rgba(0,200,212,0.25)] active:text-[#00C8D4] font-bold rounded-xl',
      outlined: 'bg-[rgba(139,92,246,0.06)] border border-[rgba(167,139,250,0.25)] text-[#F8FAFC] hover:bg-[rgba(139,92,246,0.15)] hover:border-[rgba(0,245,255,0.55)] rounded-xl backdrop-blur-md',
      text: 'text-[#A7B0BE] hover:text-[#00F5FF] hover:bg-[rgba(139,92,246,0.08)] rounded-xl',
      elevated: 'bg-[rgba(139,92,246,0.10)] border border-[rgba(167,139,250,0.22)] text-[#F8FAFC] hover:bg-[rgba(139,92,246,0.18)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] rounded-xl backdrop-blur-md',
      tonal: 'bg-[rgba(139,92,246,0.12)] border border-[rgba(167,139,250,0.30)] text-[#A78BFA] hover:bg-[rgba(139,92,246,0.22)] hover:text-[#F8FAFC] rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[44px] px-5 py-2.5 text-sm font-bold transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5FF] disabled:bg-[rgba(139,92,246,0.04)] disabled:text-[#4B5563] disabled:border-[rgba(167,139,250,0.10)] disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

