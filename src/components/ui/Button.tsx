import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal' | 'cyan' | 'gold';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'filled', ...props }, ref) => {
    const variants = {
      // Primary Violet -> Blue Gradient CTA
      filled: 'bg-gradient-to-r from-[#7C3AED] to-[#2563EB] text-white font-semibold border border-white/15 shadow-[0_4px_14px_rgba(124,58,237,0.30)] hover:from-[#6D28D9] hover:to-[#1D4ED8] active:scale-[0.98] rounded-xl',
      gold: 'bg-gradient-to-r from-[#7C3AED] to-[#2563EB] text-white font-semibold border border-white/15 shadow-[0_4px_14px_rgba(124,58,237,0.30)] hover:from-[#6D28D9] hover:to-[#1D4ED8] active:scale-[0.98] rounded-xl',
      cyan: 'bg-[#2563EB]/15 border border-[#2563EB]/30 text-[#06B6D4] hover:bg-[#2563EB]/25 hover:text-white font-semibold rounded-xl',
      outlined: 'bg-white/5 border border-white/10 text-[#F8FAFC] hover:bg-white/10 hover:border-white/20 rounded-xl',
      text: 'text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-white/5 rounded-xl',
      elevated: 'bg-[#191E3A] border border-white/10 text-[#F8FAFC] hover:bg-[#232A4D] shadow-md rounded-xl',
      tonal: 'bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#DDD6FE] hover:bg-[#7C3AED]/25 hover:text-white rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[40px] px-4 py-2 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:bg-white/5 disabled:text-[#64748B] disabled:border-white/5 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
