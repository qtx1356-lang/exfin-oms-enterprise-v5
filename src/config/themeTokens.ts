/**
 * EXFIN OMS — Premium Colorful Gradient UI Design System Tokens
 * Vibrant Deep Indigo / Violet / Electric Blue / Teal Gradient System
 */

export const THEME_TOKENS = {
  // Primary backgrounds (Rich Multi-tone Gradients)
  bg: {
    indigoViolet: '#11104A',
    deepViolet: '#24105C',
    blueIndigo: '#102B63',
    navyTeal: '#062F3B',
    primary: '#11104A',
    secondary: 'rgba(24, 32, 79, 0.90)',
    card: 'linear-gradient(135deg, rgba(76, 29, 149, 0.80) 0%, rgba(30, 41, 100, 0.90) 100%)',
    cardInner: 'linear-gradient(135deg, #18204F 0%, #20205D 100%)',
    elevated: 'linear-gradient(135deg, rgba(88, 28, 135, 0.90) 0%, rgba(30, 58, 138, 0.90) 100%)',
    input: 'rgba(20, 26, 60, 0.85)',
  },

  // Borders
  border: {
    primary: 'rgba(167, 139, 250, 0.25)',
    subtle: 'rgba(255, 255, 255, 0.12)',
    active: 'rgba(139, 92, 246, 0.50)',
    accent: 'rgba(56, 189, 248, 0.50)',
  },

  // Accents & Gradients
  accent: {
    violet: '#8B5CF6',
    electricBlue: '#2563EB',
    indigo: '#4F46E5',
    cyan: '#06B6D4',
    sky: '#38BDF8',
    teal: '#14B8A6',
    emerald: '#10B981',
    amber: '#F59E0B',
    rose: '#F43F5E',
  },

  gradients: {
    primary: 'linear-gradient(135deg, #8B5CF6 0%, #2563EB 100%)',
    secondary: 'linear-gradient(135deg, #4F46E5 0%, #06B6D4 100%)',
    success: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)',
    warning: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
    danger: 'linear-gradient(135deg, #F43F5E 0%, #EF4444 100%)',
    card: 'linear-gradient(135deg, rgba(76, 29, 149, 0.80) 0%, rgba(30, 41, 100, 0.90) 100%)',
    cardInner: 'linear-gradient(135deg, #18204F 0%, #20205D 100%)',
    bg: 'linear-gradient(145deg, #11104A 0%, #24105C 35%, #102B63 70%, #062F3B 100%)',
    nav: 'linear-gradient(135deg, rgba(45, 27, 100, 0.95) 0%, rgba(20, 42, 91, 0.95) 100%)',
  },

  // Text Hierarchy
  text: {
    primary: '#FFFFFF',
    secondary: '#E2E8F0',
    muted: '#A8B0C5',
    disabled: '#64748B',
    accent: '#A78BFA',
  },

  // Semantic Status Colors
  status: {
    success: '#10B981',
    successBg: 'rgba(16, 185, 129, 0.18)',
    successBorder: 'rgba(16, 185, 129, 0.35)',

    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.18)',
    warningBorder: 'rgba(245, 158, 11, 0.35)',

    error: '#F43F5E',
    errorBg: 'rgba(244, 63, 94, 0.18)',
    errorBorder: 'rgba(244, 63, 94, 0.35)',

    info: '#38BDF8',
    infoBg: 'rgba(56, 189, 248, 0.18)',
    infoBorder: 'rgba(56, 189, 248, 0.35)',
  },

  // Refined Compact Radius
  radius: {
    small: '8px',
    standard: '10px',
    card: '16px',
    hero: '18px',
    button: '10px',
    pill: '9999px',
  },
} as const;

export default THEME_TOKENS;

