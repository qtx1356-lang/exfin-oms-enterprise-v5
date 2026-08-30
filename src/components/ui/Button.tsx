import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning' | 'filled' | 'gold' | 'cyan' | 'elevated' | 'outlined';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      filled: 'btn-primary',
      gold: 'btn-primary',
      cyan: 'btn-secondary',
      success: 'btn-success',
      warning: 'btn-warning',
      danger: 'btn-danger',
      elevated: 'btn-primary',
      outline: 'border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--app-background-secondary)] active:scale-[0.98]',
      outlined: 'border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--app-background-secondary)] active:scale-[0.98]',
      ghost: 'text-[var(--text-primary)] hover:bg-[var(--app-background-secondary)] active:scale-[0.98]',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-11 px-5 text-sm',
      lg: 'h-14 px-8 text-base',
      icon: 'h-11 w-11 p-2 flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-bold transition-all disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
