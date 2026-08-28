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
      // Primary Executive Gold CTA
      filled: 'bg-[#D4AF37] text-black font-bold border border-[#E6C766] shadow-[0_0_15px_rgba(212,175,55,0.20)] hover:bg-[#E6C766] hover:shadow-[0_0_20px_rgba(212,175,55,0.35)] active:bg-[#9C7B20] active:text-black rounded-xl',
      gold: 'bg-[#D4AF37] text-black font-bold border border-[#E6C766] shadow-[0_0_15px_rgba(212,175,55,0.20)] hover:bg-[#E6C766] hover:shadow-[0_0_20px_rgba(212,175,55,0.35)] active:bg-[#9C7B20] active:text-black rounded-xl',
      cyan: 'bg-[rgba(212,175,55,0.12)] border border-[rgba(212,175,55,0.40)] text-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.10)] hover:bg-[rgba(212,175,55,0.20)] hover:text-[#E6C766] hover:border-[#D4AF37] active:bg-[rgba(212,175,55,0.30)] font-bold rounded-xl',
      outlined: 'bg-[#151515] border border-[#292929] text-[#FFFFFF] hover:bg-[#1B1B1B] hover:border-[#D4AF37] hover:text-[#D4AF37] rounded-xl',
      text: 'text-[#C7C7C7] hover:text-[#D4AF37] hover:bg-[#151515] rounded-xl',
      elevated: 'bg-[#1B1B1B] border border-[#292929] text-[#FFFFFF] hover:bg-[#202020] hover:border-[#D4AF37]/50 shadow-[0_4px_16px_rgba(0,0,0,0.5)] rounded-xl',
      tonal: 'bg-[rgba(212,175,55,0.10)] border border-[rgba(212,175,55,0.25)] text-[#D4AF37] hover:bg-[rgba(212,175,55,0.18)] hover:text-[#E6C766] rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[44px] px-5 py-2.5 text-sm font-bold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] disabled:bg-[#151515] disabled:text-[#555555] disabled:border-[#202020] disabled:shadow-none disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
