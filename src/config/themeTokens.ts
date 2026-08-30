/**
 * EXFIN OMS — Premium Gradient UI Design System Tokens
 * Midnight Navy + Violet + Indigo Gradient System Tokens
 */

export const THEME_TOKENS = {
  // Primary backgrounds
  bg: {
    midnightNavy: '#070B1A',
    deepViolet: '#11152D',
    subtleIndigo: '#1B1240',
    primary: '#070B1A',
    secondary: '#11152D',
    card: 'rgba(25, 30, 58, 0.88)',
    elevated: 'rgba(35, 42, 77, 0.92)',
    input: 'rgba(15, 23, 42, 0.75)',
  },

  // Borders
  border: {
    primary: 'rgba(255, 255, 255, 0.08)',
    subtle: 'rgba(255, 255, 255, 0.05)',
    active: 'rgba(124, 58, 237, 0.35)',
    accent: 'rgba(37, 99, 235, 0.35)',
  },

  // Accents & Gradients
  accent: {
    violet: '#7C3AED',
    electricBlue: '#2563EB',
    indigo: '#4F46E5',
    cyan: '#06B6D4',
    emerald: '#059669',
    amber: '#D97706',
    rose: '#DC2626',
  },

  gradients: {
    primary: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
    secondary: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
    success: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)',
    warning: 'linear-gradient(135deg, #D97706 0%, #EA580C 100%)',
    danger: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
    card: 'linear-gradient(135deg, rgba(42, 35, 86, 0.95), rgba(20, 31, 61, 0.95))',
    bg: 'linear-gradient(160deg, #070B1A 0%, #11152D 50%, #1B1240 100%)',
  },

  // Text Hierarchy
  text: {
    primary: '#F8FAFC',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    disabled: '#64748B',
    accent: '#A78BFA',
  },

  // Semantic Status Colors
  status: {
    success: '#10B981',
    successBg: 'rgba(16, 185, 129, 0.12)',
    successBorder: 'rgba(16, 185, 129, 0.25)',

    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    warningBorder: 'rgba(245, 158, 11, 0.25)',

    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
    errorBorder: 'rgba(239, 68, 68, 0.25)',

    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.12)',
    infoBorder: 'rgba(59, 130, 246, 0.25)',
  },

  // Refined Compact Radius
  radius: {
    small: '8px',
    standard: '10px',
    card: '14px',
    hero: '16px',
    button: '10px',
    pill: '9999px',
  },
} as const;

export default THEME_TOKENS;

