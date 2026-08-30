import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal' | 'cyan' | 'gold' | 'success' | 'warning' | 'danger';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'filled', ...props }, ref) => {
    const variants = {
      // Primary Violet -> Blue Gradient CTA (40-44px high)
      filled: 'bg-[linear-gradient(135deg,#7C3AED_0%,#2563EB_100%)] text-white font-semibold border border-white/20 shadow-[0_4px_14px_rgba(99,102,241,0.35)] hover:brightness-110 active:scale-[0.98] rounded-xl',
      gold: 'bg-[linear-gradient(135deg,#7C3AED_0%,#2563EB_100%)] text-white font-semibold border border-white/20 shadow-[0_4px_14px_rgba(99,102,241,0.35)] hover:brightness-110 active:scale-[0.98] rounded-xl',
      cyan: 'bg-[linear-gradient(135deg,#06B6D4_0%,#2563EB_100%)] text-white border border-white/20 shadow-[0_4px_14px_rgba(6,182,212,0.30)] hover:brightness-110 font-semibold rounded-xl',
      success: 'bg-[linear-gradient(135deg,#059669_0%,#0D9488_100%)] text-white font-semibold border border-white/20 shadow-[0_4px_14px_rgba(5,150,105,0.35)] hover:brightness-110 rounded-xl',
      warning: 'bg-[linear-gradient(135deg,#F59E0B_0%,#EA580C_100%)] text-white font-semibold border border-white/20 shadow-[0_4px_14px_rgba(245,158,11,0.35)] hover:brightness-110 rounded-xl',
      danger: 'bg-[linear-gradient(135deg,#E11D48_0%,#DC2626_100%)] text-white font-semibold border border-white/20 shadow-[0_4px_14px_rgba(225,29,72,0.35)] hover:brightness-110 rounded-xl',
      outlined: 'bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 rounded-xl',
      text: 'text-[#CBD5E1] hover:text-white hover:bg-white/10 rounded-xl',
      elevated: 'bg-[linear-gradient(135deg,#7C3AED_0%,#2563EB_100%)] border border-white/25 text-white hover:brightness-110 shadow-md rounded-xl',
      tonal: 'bg-white/15 border border-white/20 text-white hover:bg-white/25 rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[42px] px-4 py-2 text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:bg-white/5 disabled:text-[#64748B] disabled:border-white/5 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

