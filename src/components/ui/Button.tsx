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
      // Primary Indigo Glass CTA
      filled: 'bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white font-bold border border-[#818CF8]/40 shadow-[0_4px_16px_rgba(79,70,229,0.35)] hover:from-[#6366F1] hover:to-[#818CF8] hover:shadow-[0_6px_24px_rgba(99,102,241,0.45)] active:from-[#312E81] active:to-[#4F46E5] rounded-xl',
      gold: 'bg-gradient-to-r from-[#4F46E5] to-[#6366F1] text-white font-bold border border-[#818CF8]/40 shadow-[0_4px_16px_rgba(79,70,229,0.35)] hover:from-[#6366F1] hover:to-[#818CF8] hover:shadow-[0_6px_24px_rgba(99,102,241,0.45)] active:from-[#312E81] active:to-[#4F46E5] rounded-xl',
      cyan: 'bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#818CF8] hover:bg-[#6366F1]/25 hover:text-white hover:border-[#6366F1]/60 font-bold rounded-xl',
      outlined: 'bg-[#1E1F41]/60 border border-[#6366F1]/20 text-[#F8F8FF] hover:bg-[#1E1F41]/90 hover:border-[#6366F1]/50 hover:text-[#818CF8] rounded-xl',
      text: 'text-[#B9B9D0] hover:text-[#F8F8FF] hover:bg-[#1E1F41]/50 rounded-xl',
      elevated: 'bg-[#171936] border border-[#6366F1]/25 text-[#F8F8FF] hover:bg-[#1E1F41] hover:border-[#6366F1]/50 shadow-[0_4px_16px_rgba(15,16,37,0.4)] rounded-xl',
      tonal: 'bg-[#4F46E5]/15 border border-[#4F46E5]/30 text-[#818CF8] hover:bg-[#4F46E5]/25 hover:text-white rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[44px] px-5 py-2.5 text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366F1] disabled:bg-[#171936]/50 disabled:text-[#8A8AA3] disabled:border-[#6366F1]/10 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
