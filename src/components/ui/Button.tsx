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
      filled: 'bg-[#18C7A0] text-[#04110E] hover:bg-[#0E9F82] active:bg-[#0E9F82] font-bold rounded-xl shadow-md',
      outlined: 'border border-[#1D4840] text-[#A8C7C0] hover:bg-[#143730] rounded-xl',
      text: 'text-[#A8C7C0] hover:bg-[#102D28] rounded-xl',
      elevated: 'bg-[#143730] text-[#F5FFFC] hover:bg-[#1D4840] shadow-md rounded-xl',
      tonal: 'bg-[#0B2420] text-[#A8C7C0] hover:bg-[#102D28] rounded-xl',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold transition-colors duration-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#18C7A0] disabled:bg-[#163B35] disabled:text-[#718F88] disabled:cursor-not-allowed',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
