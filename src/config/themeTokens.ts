/**
 * EXFIN OMS — Premium Gradient UI Design System Tokens
 * 4-Layer Architecture:
 * 1. Light Aurora Background
 * 2. Rich Indigo/Blue Gradient Cards
 * 3. Dark Blue/Navy Inner Stat Cards
 * 4. Vibrant Semantic Action Buttons & Accents
 */

export const THEME_TOKENS = {
  // 1. Application Backgrounds (Light Aurora Palette)
  bg: {
    app: '#F4F7FB',
    appGradient: 'linear-gradient(135deg, #F4F7FB 0%, #E9EEF7 45%, #F4F1FA 75%, #EAF6F7 100%)',
    header: 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 244, 255, 0.92) 100%)',
    card: 'linear-gradient(135deg, #312E81 0%, #4338CA 45%, #2563EB 100%)',
    cardPurple: 'linear-gradient(135deg, #4C1D95 0%, #5B21B6 45%, #2563EB 100%)',
    cardInner: 'linear-gradient(135deg, #172554 0%, #1E3A8A 100%)',
    cardInnerDark: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
    nav: 'linear-gradient(135deg, #172554 0%, #312E81 100%)',
    input: '#FFFFFF',
    inputDark: 'rgba(15, 23, 42, 0.75)',
  },

  // 2. Borders
  border: {
    card: 'rgba(255, 255, 255, 0.18)',
    cardSubtle: 'rgba(255, 255, 255, 0.10)',
    cardInner: 'rgba(255, 255, 255, 0.12)',
    light: 'rgba(203, 213, 225, 0.80)',
    accent: '#8B5CF6',
    cyan: '#06B6D4',
  },

  // 3. Semantic Accents (Consistent across entire app)
  accent: {
    attendance: '#38BDF8',   // Cyan / Blue
    attendanceAlt: '#06B6D4',
    workingTime: '#F59E0B',  // Amber / Orange
    workingTimeAlt: '#EA580C',
    tasks: '#A78BFA',        // Violet
    tasksAlt: '#8B5CF6',
    progress: '#10B981',     // Emerald / Teal
    progressAlt: '#14B8A6',
    expenses: '#F97316',     // Orange
    leave: '#F43F5E',        // Rose
    location: '#06B6D4',     // Cyan
    notifications: '#8B5CF6',// Violet
    admin: '#4F46E5',        // Indigo
  },

  // 4. Action Button & Container Gradients
  gradients: {
    primaryButton: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
    successButton: 'linear-gradient(135deg, #059669 0%, #0D9488 100%)',
    warningButton: 'linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)',
    dangerButton: 'linear-gradient(135deg, #E11D48 0%, #DC2626 100%)',
    
    cardPrimary: 'linear-gradient(135deg, #312E81 0%, #4338CA 45%, #2563EB 100%)',
    cardSecondary: 'linear-gradient(135deg, #4C1D95 0%, #5B21B6 45%, #2563EB 100%)',
    cardInner: 'linear-gradient(135deg, #172554 0%, #1E3A8A 100%)',
    nav: 'linear-gradient(135deg, #172554 0%, #312E81 100%)',
    bg: 'linear-gradient(135deg, #F4F7FB 0%, #E9EEF7 45%, #F4F1FA 75%, #EAF6F7 100%)',
  },

  // 5. Shadows
  shadow: {
    card: '0 10px 30px rgba(30, 41, 100, 0.18)',
    cardHover: '0 14px 36px rgba(30, 41, 100, 0.24)',
    inner: '0 4px 16px rgba(15, 23, 42, 0.35)',
    button: '0 4px 14px rgba(99, 102, 241, 0.35)',
    nav: '0 10px 35px rgba(23, 37, 84, 0.40)',
  },

  // 6. Text Contrast System
  text: {
    // On Light Aurora Canvas
    lightPrimary: '#111827',
    lightSecondary: '#475569',
    lightMuted: '#64748B',

    // On Dark Gradient Cards
    cardPrimary: '#FFFFFF',
    cardSecondary: '#E2E8F0',
    cardMuted: '#CBD5E1',
  },

  // 7. Border Radius Hierarchy
  radius: {
    sm: '8px',
    md: '12px',
    card: '16px',
    inner: '12px',
    button: '10px',
    pill: '9999px',
  },
} as const;

export default THEME_TOKENS;

