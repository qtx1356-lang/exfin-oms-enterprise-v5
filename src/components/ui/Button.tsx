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
      filled: 'bg-primary text-on-primary hover:bg-primary/90',
      outlined: 'border border-outline text-primary hover:bg-primary/10',
      text: 'text-primary hover:bg-primary/10',
      elevated: 'bg-surface shadow-md text-primary hover:bg-primary/5',
      tonal: 'bg-secondary-container text-on-secondary-container hover:bg-secondary-container/90',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
