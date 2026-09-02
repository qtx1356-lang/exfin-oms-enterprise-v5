/**
 * EXFIN OMS — Premium Dark Gold & Emerald UI Design System Tokens
 * Architecture:
 * 1. Deep Teal / Emerald Aurora Background
 * 2. Premium Dark Gold / Metallic Bronze Gradient Cards
 * 3. Deeper Bronze Inner Stat Cards
 * 4. High-Contrast White Text & Semantic Accents
 */

export const THEME_TOKENS = {
  // 1. Application Backgrounds & Card Gradients
  bg: {
    app: '#071A2B',
    appGradient: '#071A2B',
    header: '#071A2B',
    card: 'linear-gradient(180deg, #3A4775 0%, #2F3C63 100%)',
    cardElevated: 'linear-gradient(180deg, #3A4775 0%, #2F3C63 100%)',
    cardInner: 'linear-gradient(180deg, #2E3A61 0%, #243050 100%)',
    nav: '#071A2B',
    input: '#071A2B',
  },

  // 2. Borders
  border: {
    card: 'rgba(120, 150, 210, 0.20)',
    cardSubtle: 'rgba(120, 150, 210, 0.14)',
    cardInner: 'rgba(120, 150, 210, 0.14)',
    accent: '#22D3EE',
    gold: '#D4AF37',
  },

  // 3. Semantic Accents
  accent: {
    attendance: '#22D3EE',   // Cyan / Blue
    workingTime: '#F59E0B',  // Amber / Orange
    tasks: '#8B5CF6',        // Violet
    progress: '#10B981',     // Emerald Green
    expenses: '#F97316',     // Orange
    leave: '#22D3EE',        // Cyan
    danger: '#F43F5E',       // Rose / Red
  },

  // 4. Action Button Gradients
  gradients: {
    primaryButton: 'linear-gradient(135deg, #10B981 0%, #06B6D4 50%, #2563EB 100%)',
    successButton: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    warningButton: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    dangerButton: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)',
    
    cardPrimary: 'linear-gradient(180deg, #3A4775 0%, #2F3C63 100%)',
    cardInner: 'linear-gradient(180deg, #2E3A61 0%, #243050 100%)',
    bg: '#071A2B',
  },

  // 5. Shadows
  shadow: {
    card: '0 10px 30px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 215, 0, 0.10)',
    inner: '0 4px 16px rgba(0, 0, 0, 0.45)',
    button: '0 4px 14px rgba(16, 185, 129, 0.35)',
    nav: '0 -10px 30px rgba(3, 12, 22, 0.60)',
  },

  // 6. Text Contrast System
  text: {
    primary: '#F8FAFC',    // White / Light
    secondary: '#CBD5E1',  // Muted light slate
    muted: '#94A3B8',      // Muted slate
  },

  // 7. Border Radius Hierarchy
  radius: {
    sm: '8px',
    md: '12px',
    card: '20px',
    inner: '16px',
    button: '12px',
    pill: '9999px',
  },
} as const;

export default THEME_TOKENS;

