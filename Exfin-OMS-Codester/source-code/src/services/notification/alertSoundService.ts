import { getNotificationSettings } from './notificationSettings';
import { NotificationPriority } from '../../types/notification';

let alertAudioInstance: HTMLAudioElement | null = null;

/**
 * Play local alert sound for new incoming notification
 */
export const playAlertSound = (
  priority: NotificationPriority = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.soundEnabled) return;

    // LOW priority is strictly silent
    if (priority === 'LOW') return;

    // 1. Try playing bundled local audio file (public/sounds/alert.mp3 or alert.wav)
    if (typeof window !== 'undefined') {
      try {
        if (!alertAudioInstance) {
          alertAudioInstance = new Audio('/sounds/alert.mp3');
          alertAudioInstance.preload = 'auto';
        }
        
        alertAudioInstance.currentTime = 0;
        const playPromise = alertAudioInstance.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            // Autoplay policy prevented playback or format not supported in current WebView, fall back to Web Audio API
            playSynthesizedChime(priority);
          });
        }
        return;
      } catch (audioErr) {
        // Fallback to Web Audio API
        playSynthesizedChime(priority);
      }
    }
  } catch (err) {
    // Graceful silent recovery, never crash
  }
};

/**
 * Web Audio API synthesized chime fallback
 */
function playSynthesizedChime(priority: NotificationPriority) {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (priority === 'HIGH' || priority === 'URGENT') {
      // Crisp 3-tone attention chime for HIGH/URGENT (D5 -> A5 -> D6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.12); // D6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } else {
      // Soft pleasant dual tone for NORMAL
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (synthErr) {
    // Ignore audio context errors
  }
}

/**
 * Trigger vibration pattern for alert
 */
export const triggerAlertVibration = (
  priority: NotificationPriority = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.vibrationEnabled) return;

    // Do NOT vibrate for LOW priority
    if (priority === 'LOW') return;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (priority === 'HIGH' || priority === 'URGENT') {
        navigator.vibrate([300, 150, 300]);
      } else {
        navigator.vibrate([200, 100, 200]);
      }
    }
  } catch (e) {
    // Ignore vibration errors on unsupported devices
  }
};
