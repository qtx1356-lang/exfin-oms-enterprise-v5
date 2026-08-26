import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'outlined' | 'text' | 'elevated' | 'tonal';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'filled', ...props }, ref) => {
    const variants = {
      filled: 'bg-[#22D3EE] text-[#041014] hover:bg-[#67E8F9] active:bg-[#67E8F9] font-bold rounded-xl shadow-md',
      outlined: 'bg-[rgba(15,23,42,0.88)] border border-[rgba(148,163,184,0.28)] text-[#F8FAFC] hover:bg-[rgba(30,41,59,0.9)] hover:border-[rgba(34,211,238,0.55)] rounded-xl',
      text: 'text-[#CBD5E1] hover:text-[#22D3EE] hover:bg-white/5 rounded-xl',
      elevated: 'bg-[rgba(20,28,42,0.95)] border border-[rgba(148,163,184,0.20)] text-[#F8FAFC] hover:bg-[rgba(30,41,59,0.95)] shadow-md rounded-xl',
      tonal: 'bg-[rgba(34,211,238,0.12)] border border-[rgba(34,211,238,0.25)] text-[#67E8F9] hover:bg-[rgba(34,211,238,0.20)] rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl min-h-[44px] px-5 py-2.5 text-sm font-bold transition-all duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] disabled:bg-[rgba(30,41,59,0.5)] disabled:text-[#64748B] disabled:border-[rgba(148,163,184,0.1)] disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
