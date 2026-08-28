/**
 * EXFIN OMS — Executive Edition Design System Tokens
 * Master Black + Gold Executive Color and Typography Tokens
 */

export const THEME_TOKENS = {
  // Primary backgrounds
  bg: {
    pureBlack: '#080808',
    primary: '#0B0B0B',
    secondary: '#101010',
    card: '#151515',
    elevated: '#1B1B1B',
    input: '#121212',
  },

  // Borders
  border: {
    primary: '#292929',
    subtle: '#202020',
    gold: '#8F7425',
    goldGlow: 'rgba(212, 175, 55, 0.40)',
  },

  // Gold Accents (Strategic & Restrained)
  gold: {
    primary: '#D4AF37',
    light: '#E6C766',
    champagne: '#F1E0A3',
    dark: '#9C7B20',
    border: '#8F7425',
    tint: 'rgba(212, 175, 55, 0.08)',
    tintHover: 'rgba(212, 175, 55, 0.15)',
    glow: 'rgba(212, 175, 55, 0.25)',
  },

  // Text Hierarchy
  text: {
    primary: '#FFFFFF',
    secondary: '#C7C7C7',
    muted: '#8A8A8A',
    disabled: '#555555',
    gold: '#D4AF37',
    goldLight: '#E6C766',
  },

  // Semantic Status Colors
  status: {
    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.12)',
    successBorder: 'rgba(34, 197, 94, 0.35)',

    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    warningBorder: 'rgba(245, 158, 11, 0.35)',

    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
    errorBorder: 'rgba(239, 68, 68, 0.35)',

    info: '#60A5FA',
    infoBg: 'rgba(96, 165, 250, 0.12)',
    infoBorder: 'rgba(96, 165, 250, 0.35)',
  },

  // Refined Enterprise Radius
  radius: {
    small: '8px',
    standard: '12px',
    card: '16px',
    hero: '20px',
    button: '12px',
    pill: '9999px',
  },
} as const;

export default THEME_TOKENS;
