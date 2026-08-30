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
      filled: 'bg-gradient-to-r from-[#8B5CF6] to-[#2563EB] text-white font-semibold border border-white/20 shadow-[0_4px_16px_rgba(139,92,246,0.40)] hover:from-[#7C3AED] hover:to-[#1D4ED8] active:scale-[0.98] rounded-xl',
      gold: 'bg-gradient-to-r from-[#8B5CF6] to-[#2563EB] text-white font-semibold border border-white/20 shadow-[0_4px_16px_rgba(139,92,246,0.40)] hover:from-[#7C3AED] hover:to-[#1D4ED8] active:scale-[0.98] rounded-xl',
      cyan: 'bg-gradient-to-r from-[#4F46E5] to-[#06B6D4] text-white border border-white/20 shadow-[0_4px_14px_rgba(6,182,212,0.30)] hover:brightness-110 font-semibold rounded-xl',
      outlined: 'bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 rounded-xl',
      text: 'text-[#E2E8F0] hover:text-white hover:bg-white/10 rounded-xl',
      elevated: 'bg-[linear-gradient(135deg,rgba(76,29,149,0.85),rgba(30,41,100,0.95))] border border-[#A78BFA]/30 text-white hover:brightness-110 shadow-md rounded-xl',
      tonal: 'bg-[#8B5CF6]/20 border border-[#A78BFA]/30 text-[#DDD6FE] hover:bg-[#8B5CF6]/30 hover:text-white rounded-xl',
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
