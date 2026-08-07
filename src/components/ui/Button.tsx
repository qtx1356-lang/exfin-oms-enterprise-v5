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
      filled: 'bg-[#7C3AED] text-white hover:bg-[#6D28D9] active:scale-[0.98] shadow-lg shadow-purple-900/40 font-bold',
      outlined: 'border border-purple-400/40 text-purple-200 hover:bg-purple-500/20 active:scale-[0.98]',
      text: 'text-purple-300 hover:bg-purple-500/15 active:scale-[0.98]',
      elevated: 'bg-[#35206A] text-white hover:bg-[#3D257A] shadow-md active:scale-[0.98]',
      tonal: 'bg-[#211044] text-purple-200 hover:bg-[#2D1B5A] active:scale-[0.98]',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
